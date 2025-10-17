import { Agent, tool, run } from '@openai/agents';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '../config/supabase';
import { stripeService } from './stripeService';
import Logger from '../utils/logger';

const logger = Logger;

export interface AgentConfig {
  id: string;
  name: string;
  type: 'service' | 'order' | 'payment' | 'triage' | 'supervisor';
  instructions: string;
  model?: string;
  tools?: any[];
  handoffs?: Agent[];
  guardrails?: any[];
  maxIterations?: number;
  temperature?: number;
  businessId: string;
  parentAgentId?: string;
}

export interface AgentToolConfig {
  name: string;
  description: string;
  parametersSchema: any;
  execute: (input: any, context: AgentContext) => Promise<any>;
}

export interface AgentContext {
  businessId: string;
  customerId?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
}

export interface AgentTrace {
  id: string;
  agentId: string;
  type: 'run' | 'tool_call' | 'handoff' | 'guardrail';
  input: any;
  output?: any;
  error?: any;
  duration: number;
  tokenUsage?: {
    input?: number;
    output?: number;
    total?: number;
  };
  metadata?: Record<string, any>;
}

export class OpenAIAgentService {
  private agents: Map<string, Agent<any, 'text'>> = new Map();

  private tools: Map<string, any> = new Map();

  private traces: AgentTrace[] = [];

  private context: AgentContext;

  constructor(context: AgentContext) {
    this.context = context;
    this.initializeBuiltInTools();
  }

  private initializeBuiltInTools(): void {
    // Order Management Tool
    const createOrderTool = tool({
      name: 'create_order',
      description: 'Create a new customer order with items and calculate total',
      parameters: z.object({
        items: z.array(
          z.object({
            name: z.string().describe('Item name'),
            quantity: z.number().describe('Quantity ordered'),
            price: z.number().describe('Price per item'),
          })
        ),
        total: z.number().describe('Total amount for the order'),
        customerName: z.string().nullable().describe('Customer name'),
        notes: z.string().nullable().describe('Order notes'),
      }),
      execute: async (input) => this.createOrder(input),
    });
    this.tools.set('create_order', createOrderTool);

    // Payment Processing Tool
    const processPaymentTool = tool({
      name: 'process_payment',
      description: 'Process a payment for an order using Stripe',
      parameters: z.object({
        amount: z.number().describe('Payment amount in dollars'),
        orderId: z.string().nullable().describe('Order ID to associate with payment'),
        paymentMethod: z.string().nullable().default('card').describe('Payment method'),
      }),
      execute: async (input) => this.processPayment(input),
    });
    this.tools.set('process_payment', processPaymentTool);

    // Business Information Tool
    const getBusinessInfoTool = tool({
      name: 'get_business_info',
      description: 'Get information about the business including hours, menu, and services',
      parameters: z.object({
        infoType: z.enum(['general', 'hours', 'menu', 'services']).nullable(),
      }),
      execute: async (input) => this.getBusinessInfo(input),
    });
    this.tools.set('get_business_info', getBusinessInfoTool);

    // Availability Check Tool
    const checkAvailabilityTool = tool({
      name: 'check_availability',
      description: 'Check if the business is available on a specific date and time',
      parameters: z.object({
        date: z.string().describe('Date to check (YYYY-MM-DD format)'),
        time: z.string().nullable().describe('Time to check (HH:MM format)'),
        service: z.string().nullable().describe('Service to check availability for'),
      }),
      execute: async (input) => this.checkAvailability(input),
    });
    this.tools.set('check_availability', checkAvailabilityTool);

    // Appointment Scheduling Tool
    const scheduleAppointmentTool = tool({
      name: 'schedule_appointment',
      description: 'Schedule an appointment or reservation',
      parameters: z.object({
        date: z.string().describe('Appointment date (YYYY-MM-DD)'),
        time: z.string().describe('Appointment time (HH:MM)'),
        service: z.string().describe('Service or reason for appointment'),
        customerName: z.string().describe('Customer name'),
        customerPhone: z.string().nullable().describe('Customer phone'),
        notes: z.string().nullable().describe('Additional notes'),
      }),
      execute: async (input) => this.scheduleAppointment(input),
    });
    this.tools.set('schedule_appointment', scheduleAppointmentTool);

    // Customer Data Tool
    const getCustomerDataTool = tool({
      name: 'get_customer_data',
      description: 'Retrieve customer information and order history',
      parameters: z.object({
        customerPhone: z.string().describe('Customer phone number'),
        dataType: z.enum(['profile', 'orders', 'appointments']).nullable(),
      }),
      execute: async (input) => this.getCustomerData(input),
    });
    this.tools.set('get_customer_data', getCustomerDataTool);

    // Token Usage Tool
    const trackTokenUsageTool = tool({
      name: 'track_token_usage',
      description: 'Track and report token usage for billing',
      parameters: z.object({
        tokens: z.number().describe('Number of tokens used'),
        operation: z.string().describe('Operation that used tokens'),
      }),
      execute: async (input) => this.trackTokenUsage(input),
    });
    this.tools.set('track_token_usage', trackTokenUsageTool);
  }

  async createAgentFromDatabase(agentId: string): Promise<Agent | undefined> {
    try {
      const { data: agentData, error } = await supabaseAdmin
        .from('agents')
        .select(
          `
          *,
          agent_tool_assignments (
            tool_id,
            agent_tools (*)
          ),
          from_handoffs:agent_handoffs!from_agent_id (
            to_agent_id,
            handoff_conditions
          ),
          agent_guardrail_assignments (
            guardrail_id,
            agent_guardrails (*)
          )
        `
        )
        .eq('id', agentId)
        .single();

      if (error || !agentData) {
        logger.error('Failed to fetch agent from database', { error, agentId });
        return undefined;
      }

      // Build tools array
      const agentTools = [];
      if (agentData.agent_tool_assignments) {
        for (const assignment of agentData.agent_tool_assignments) {
          const toolName = assignment.agent_tools?.name;
          if (toolName && this.tools.has(toolName)) {
            agentTools.push(this.tools.get(toolName));
          }
        }
      }

      // Build handoffs array
      const handoffs: Agent[] = [];
      if (agentData.from_handoffs) {
        for (const handoff of agentData.from_handoffs) {
          const targetAgent = await this.createAgentFromDatabase(handoff.to_agent_id);
          if (targetAgent) {
            handoffs.push(targetAgent);
          }
        }
      }

      // Create the agent
      const agent = new Agent({
        name: agentData.name,
        instructions: agentData.prompt,
        model: agentData.model_override || 'gpt-4o',
        tools: agentTools,
        handoffs,
      });

      this.agents.set(agentId, agent);
      return agent;
    } catch (error) {
      logger.error('Error creating agent from database', { error, agentId });
      return null;
    }
  }

  async createAgent(config: AgentConfig): Promise<Agent> {
    const { id, name, instructions, model, tools = [], handoffs = [] } = config;

    // Get tools for this agent
    const agentTools = tools
      .map((toolName) => {
        if (this.tools.has(toolName)) {
          return this.tools.get(toolName);
        }
        return null;
      })
      .filter(Boolean);

    // Create the agent
    const agent = new Agent({
      name,
      instructions,
      model: model || 'gpt-4o',
      tools: agentTools,
      handoffs,
    });

    this.agents.set(id, agent);
    return agent;
  }

  async runAgent(agentId: string, message: string, options?: any): Promise<any> {
    const startTime = Date.now();
    const traceId = uuidv4();

    try {
      let agent = this.agents.get(agentId);
      if (!agent) {
        agent = await this.createAgentFromDatabase(agentId);
        if (agent === undefined) {
          throw new Error(`Agent ${agentId} not found`);
        }
      }

      // Create trace entry
      const trace: AgentTrace = {
        id: traceId,
        agentId,
        type: 'run',
        input: { message },
        duration: 0,
        metadata: {
          sessionId: this.context.sessionId,
          businessId: this.context.businessId,
        },
      };

      // Run the agent (we already checked agent is not null above)
      const result = await run(agent as Agent, message, {
        ...options,
        maxIterations: options?.maxIterations || 10,
      });

      // Update trace with results
      trace.output = result;
      trace.duration = Date.now() - startTime;
      trace.tokenUsage = (result as any).usage || {};

      this.traces.push(trace);

      // Save trace to database
      await this.saveTrace(trace);

      return result;
    } catch (error) {
      logger.error('Agent run failed', { error, agentId, message });

      // Record error in trace
      const errorTrace: AgentTrace = {
        id: traceId,
        agentId,
        type: 'run',
        input: { message },
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
      };
      this.traces.push(errorTrace);
      await this.saveTrace(errorTrace);

      throw error;
    }
  }

  async streamAgent(agentId: string, message: string, options?: any): Promise<AsyncIterable<any>> {
    let agent = this.agents.get(agentId);
    if (!agent) {
      agent = await this.createAgentFromDatabase(agentId);
      if (agent === undefined) {
        throw new Error(`Agent ${agentId} not found`);
      }
    }

    // Note: Streaming may need to be implemented differently
    // For now, return a simple async generator
    async function* generator() {
      const result = await run(agent!, message, options);
      yield result;
    }
    return generator();
  }

  // Tool implementations
  private async createOrder(input: any): Promise<any> {
    try {
      const orderData = {
        id: uuidv4(),
        business_id: this.context.businessId,
        customer_phone: this.context.customerId || 'unknown',
        customer_name: input.customerName || 'Customer',
        items: input.items,
        total: input.total,
        status: 'pending',
        payment_status: 'pending',
        metadata: {
          source: 'agent_sdk',
          session_id: this.context.sessionId,
          notes: input.notes,
        },
      };

      const { data: order, error } = await supabaseAdmin.from('orders').insert(orderData).select().single();

      if (error) throw error;

      logger.info('Order created via agent', {
        orderId: order.id,
        businessId: this.context.businessId,
        total: input.total,
      });

      return {
        success: true,
        orderId: order.id,
        message: `Order created successfully. Order ID: ${order.id}`,
        total: input.total,
      };
    } catch (error) {
      logger.error('Failed to create order', { error, input });
      throw error;
    }
  }

  private async processPayment(input: any): Promise<any> {
    try {
      const amountCents = Math.round(input.amount * 100);
      const orderId = input.orderId || uuidv4();

      const charge = await stripeService.createCharge(amountCents, {
        businessId: this.context.businessId,
        orderId,
        phoneNumber: this.context.customerId || '',
        description: `Payment for order ${orderId}`,
        agentId: this.context.sessionId || '',
      });

      const paymentData = {
        id: uuidv4(),
        business_id: this.context.businessId,
        order_id: orderId,
        amount: input.amount,
        currency: 'usd',
        status: charge.status === 'succeeded' ? 'completed' : 'failed',
        payment_method: input.paymentMethod || 'card',
        stripe_payment_id: charge.id,
        payment_metadata: {
          receipt_url: charge.receipt_url,
          stripe_status: charge.status,
          source: 'agent_sdk',
        },
      };

      const { data: payment, error } = await supabaseAdmin.from('payments').insert(paymentData).select().single();

      if (error) {
        logger.error('Failed to record payment', { error });
      }

      // Update order payment status if orderId provided
      if (input.orderId) {
        await supabaseAdmin
          .from('orders')
          .update({
            payment_status: charge.status === 'succeeded' ? 'paid' : 'failed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', input.orderId);
      }

      logger.info('Payment processed via agent', {
        paymentId: payment?.id,
        chargeId: charge.id,
        amount: input.amount,
      });

      return {
        success: charge.status === 'succeeded',
        paymentId: payment?.id,
        chargeId: charge.id,
        message:
          charge.status === 'succeeded' ? `Payment of $${input.amount} processed successfully` : 'Payment failed',
        receiptUrl: charge.receipt_url,
      };
    } catch (error) {
      logger.error('Failed to process payment', { error, input });
      throw error;
    }
  }

  private async getBusinessInfo(input: any): Promise<any> {
    try {
      const { data: business, error } = await supabaseAdmin
        .from('businesses')
        .select('name, data_json')
        .eq('id', this.context.businessId)
        .single();

      if (error) throw error;

      const info: any = {
        name: business.name,
      };

      const businessData = business.data_json || {};

      switch (input.infoType) {
        case 'hours':
          info.hours = businessData.hours || 'Hours not available';
          break;
        case 'menu':
          info.menu = businessData.menu || 'Menu not available';
          break;
        case 'services':
          info.services = businessData.services || 'Services not available';
          break;
        default:
          Object.assign(info, businessData);
      }

      return info;
    } catch (error) {
      logger.error('Failed to get business info', { error });
      throw error;
    }
  }

  private async checkAvailability(input: any): Promise<any> {
    try {
      const { data: business, error } = await supabaseAdmin
        .from('businesses')
        .select('data_json')
        .eq('id', this.context.businessId)
        .single();

      if (error) throw error;

      const hours = business.data_json?.hours || {};
      const dayOfWeek = new Date(input.date).toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
      const dayHours = hours[dayOfWeek];

      if (!dayHours) {
        return {
          available: false,
          message: `We're closed on ${dayOfWeek}`,
        };
      }

      if (input.time) {
        const requestedTime = parseInt(input.time.replace(':', ''));
        const openTime = parseInt(dayHours.open.replace(':', ''));
        const closeTime = parseInt(dayHours.close.replace(':', ''));

        const available = requestedTime >= openTime && requestedTime <= closeTime;
        return {
          available,
          message: available
            ? `Yes, we're available at ${input.time} on ${input.date}`
            : `We're open from ${dayHours.open} to ${dayHours.close} on ${dayOfWeek}`,
          hours: dayHours,
        };
      }

      return {
        available: true,
        hours: dayHours,
        message: `We're open from ${dayHours.open} to ${dayHours.close} on ${input.date}`,
      };
    } catch (error) {
      logger.error('Failed to check availability', { error, input });
      throw error;
    }
  }

  private async scheduleAppointment(input: any): Promise<any> {
    try {
      const appointmentData = {
        id: uuidv4(),
        business_id: this.context.businessId,
        customer_phone: input.customerPhone || this.context.customerId || 'unknown',
        customer_name: input.customerName,
        items: [{ name: input.service, quantity: 1, price: 0 }],
        total: 0,
        status: 'confirmed',
        payment_status: 'not_required',
        metadata: {
          type: 'appointment',
          date: input.date,
          time: input.time,
          source: 'agent_sdk',
          session_id: this.context.sessionId,
          notes: input.notes,
        },
      };

      const { data: appointment, error } = await supabaseAdmin.from('orders').insert(appointmentData).select().single();

      if (error) throw error;

      logger.info('Appointment scheduled via agent', {
        appointmentId: appointment.id,
        date: input.date,
        time: input.time,
      });

      return {
        success: true,
        appointmentId: appointment.id,
        message: `Appointment scheduled for ${input.customerName} on ${input.date} at ${input.time} for ${input.service}`,
        details: {
          date: input.date,
          time: input.time,
          service: input.service,
        },
      };
    } catch (error) {
      logger.error('Failed to schedule appointment', { error, input });
      throw error;
    }
  }

  private async getCustomerData(input: any): Promise<any> {
    try {
      const customerPhone = input.customerPhone || this.context.customerId;
      if (!customerPhone) {
        return { error: 'Customer phone number required' };
      }

      const result: any = {
        phone: customerPhone,
      };

      if (!input.dataType || input.dataType === 'orders') {
        const { data: orders } = await supabaseAdmin
          .from('orders')
          .select('*')
          .eq('customer_phone', customerPhone)
          .eq('business_id', this.context.businessId)
          .order('created_at', { ascending: false })
          .limit(10);

        result.orders = orders || [];
        result.totalOrders = orders?.length || 0;
      }

      if (!input.dataType || input.dataType === 'appointments') {
        const { data: appointments } = await supabaseAdmin
          .from('orders')
          .select('*')
          .eq('customer_phone', customerPhone)
          .eq('business_id', this.context.businessId)
          .eq('metadata->type', 'appointment')
          .order('created_at', { ascending: false })
          .limit(10);

        result.appointments = appointments || [];
      }

      return result;
    } catch (error) {
      logger.error('Failed to get customer data', { error, input });
      throw error;
    }
  }

  private async trackTokenUsage(input: any): Promise<any> {
    try {
      // This would integrate with your token billing system
      logger.info('Token usage tracked', {
        businessId: this.context.businessId,
        tokens: input.tokens,
        operation: input.operation,
      });

      return {
        success: true,
        message: `Tracked ${input.tokens} tokens for ${input.operation}`,
      };
    } catch (error) {
      logger.error('Failed to track token usage', { error, input });
      throw error;
    }
  }

  private async saveTrace(trace: AgentTrace): Promise<void> {
    try {
      await supabaseAdmin.from('agent_traces').insert({
        id: trace.id,
        business_id: this.context.businessId,
        session_id: this.context.sessionId,
        agent_id: trace.agentId,
        trace_type: trace.type,
        input_data: trace.input,
        output_data: trace.output,
        error_data: trace.error,
        duration_ms: trace.duration,
        token_usage: trace.tokenUsage,
        metadata: trace.metadata,
      });
    } catch (error) {
      logger.error('Failed to save trace', { error, trace });
    }
  }

  // Session management
  async saveSession(sessionKey: string, state: any): Promise<void> {
    try {
      await supabaseAdmin.from('agent_sessions').upsert({
        business_id: this.context.businessId,
        session_key: sessionKey,
        customer_identifier: this.context.customerId,
        conversation_state: state,
        metadata: this.context.metadata,
        updated_at: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to save session', { error, sessionKey });
    }
  }

  async loadSession(sessionKey: string): Promise<any> {
    try {
      const { data: session } = await supabaseAdmin
        .from('agent_sessions')
        .select('conversation_state')
        .eq('business_id', this.context.businessId)
        .eq('session_key', sessionKey)
        .single();

      return session?.conversation_state || null;
    } catch (error) {
      logger.error('Failed to load session', { error, sessionKey });
      return null;
    }
  }

  // Get all traces for debugging
  getTraces(): AgentTrace[] {
    return this.traces;
  }

  // Clear traces
  clearTraces(): void {
    this.traces = [];
  }

  // Register custom tool
  registerTool(name: string, toolConfig: any): void {
    this.tools.set(name, toolConfig);
  }

  // Get registered agent
  getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId);
  }
}
