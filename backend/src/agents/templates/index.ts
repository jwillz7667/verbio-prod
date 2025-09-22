import { Agent } from '@openai/agents';
import { getToolsForAgentType, AGENT_TOOLS } from '../tools';

export interface AgentTemplate {
  name: string;
  description: string;
  type: 'service' | 'order' | 'payment' | 'scheduling' | 'triage' | 'supervisor';
  instructions: string;
  model?: string;
  tools: string[];
  handoffAgents?: string[];
  guardrails?: string[];
  temperature?: number;
  maxIterations?: number;
}

// Service Agent Template - Customer Service
export const SERVICE_AGENT_TEMPLATE: AgentTemplate = {
  name: 'Customer Service Agent',
  description: 'Handles general customer inquiries and support',
  type: 'service',
  instructions: `You are a helpful and friendly customer service agent. Your role is to:
- Answer customer questions about the business, hours, and services
- Provide information about policies and procedures
- Help customers with general inquiries
- Escalate complex issues to specialized agents when needed
- Always maintain a professional and courteous tone
- If you don't know something, admit it and offer to find help`,
  model: 'gpt-4o',
  tools: ['getBusinessInfo', 'getBusinessHours', 'getServices', 'getCustomerProfile'],
  temperature: 0.7,
  maxIterations: 10,
};

// Order Agent Template - Order Taking
export const ORDER_AGENT_TEMPLATE: AgentTemplate = {
  name: 'Order Taking Agent',
  description: 'Specialized in taking and managing customer orders',
  type: 'order',
  instructions: `You are an order-taking specialist. Your role is to:
- Help customers place new orders
- Suggest menu items and answer questions about food/products
- Calculate totals and apply any discounts
- Confirm order details before finalizing
- Provide estimated delivery/pickup times
- Handle special dietary requirements or modifications
- Always confirm the complete order before processing`,
  model: 'gpt-4o',
  tools: ['createOrder', 'updateOrder', 'getMenu', 'checkInventory', 'getBusinessInfo'],
  temperature: 0.6,
  maxIterations: 15,
};

// Payment Agent Template - Payment Processing
export const PAYMENT_AGENT_TEMPLATE: AgentTemplate = {
  name: 'Payment Processing Agent',
  description: 'Handles all payment-related operations securely',
  type: 'payment',
  instructions: `You are a payment processing specialist. Your role is to:
- Process payments securely and accurately
- Handle refunds and payment issues
- Verify payment details before processing
- Provide receipt information
- Handle payment failures gracefully
- Never store or repeat full credit card numbers
- Always confirm the amount before processing
- Follow PCI compliance guidelines`,
  model: 'gpt-4o',
  tools: ['processPayment', 'refundPayment', 'getPaymentStatus', 'getOrderStatus'],
  temperature: 0.3,
  maxIterations: 8,
  guardrails: ['payment_validation', 'pci_compliance'],
};

// Scheduling Agent Template - Appointments
export const SCHEDULING_AGENT_TEMPLATE: AgentTemplate = {
  name: 'Scheduling Agent',
  description: 'Manages appointments and reservations',
  type: 'scheduling',
  instructions: `You are an appointment scheduling specialist. Your role is to:
- Check availability and schedule appointments
- Handle rescheduling and cancellations
- Provide reminders and confirmations
- Manage waitlists when fully booked
- Suggest alternative times if requested time is unavailable
- Collect necessary information for appointments
- Send confirmation details to customers`,
  model: 'gpt-4o',
  tools: ['checkAvailability', 'scheduleAppointment', 'rescheduleAppointment', 'cancelAppointment', 'getBusinessHours', 'sendSMS'],
  temperature: 0.5,
  maxIterations: 12,
};

// Triage Agent Template - Call Routing
export const TRIAGE_AGENT_TEMPLATE: AgentTemplate = {
  name: 'Triage Agent',
  description: 'Routes customers to appropriate specialized agents',
  type: 'triage',
  instructions: `You are a triage specialist who routes customers to the right agent. Your role is to:
- Quickly understand the customer's need
- Route to the appropriate specialist:
  - Order-related → Order Agent
  - Payment issues → Payment Agent
  - Appointments → Scheduling Agent
  - General questions → Service Agent
- Provide brief context to the next agent
- If unsure, ask clarifying questions
- Always be efficient and minimize wait time`,
  model: 'gpt-4o-mini',
  tools: [],
  handoffAgents: ['service', 'order', 'payment', 'scheduling'],
  temperature: 0.5,
  maxIterations: 5,
};

// Supervisor Agent Template - Quality Control
export const SUPERVISOR_AGENT_TEMPLATE: AgentTemplate = {
  name: 'Supervisor Agent',
  description: 'Monitors conversations and can intervene when needed',
  type: 'supervisor',
  instructions: `You are a supervisor agent monitoring customer interactions. Your role is to:
- Monitor conversation quality
- Intervene when agents are stuck or making errors
- Handle escalated issues
- Ensure compliance with business policies
- Provide override capabilities for special cases
- Track and report interaction metrics
- Coach other agents when needed`,
  model: 'gpt-4o',
  tools: ['getCustomerProfile', 'getCustomerOrders', 'trackTokenUsage'],
  handoffAgents: ['service', 'order', 'payment', 'scheduling'],
  temperature: 0.4,
  maxIterations: 20,
};

// Template Registry
export const AGENT_TEMPLATES = {
  service: SERVICE_AGENT_TEMPLATE,
  order: ORDER_AGENT_TEMPLATE,
  payment: PAYMENT_AGENT_TEMPLATE,
  scheduling: SCHEDULING_AGENT_TEMPLATE,
  triage: TRIAGE_AGENT_TEMPLATE,
  supervisor: SUPERVISOR_AGENT_TEMPLATE,
};

// Helper function to create agent from template
export function createAgentFromTemplate(
  templateType: keyof typeof AGENT_TEMPLATES,
  customizations?: Partial<AgentTemplate>
): AgentTemplate {
  const template = AGENT_TEMPLATES[templateType];
  if (!template) {
    throw new Error(`Unknown template type: ${templateType}`);
  }

  return {
    ...template,
    ...customizations,
    tools: customizations?.tools || template.tools,
    handoffAgents: customizations?.handoffAgents || template.handoffAgents,
  };
}

// Industry-specific template generators
export function generateRestaurantAgentTemplates(): Record<string, AgentTemplate> {
  return {
    host: {
      ...TRIAGE_AGENT_TEMPLATE,
      name: 'Restaurant Host Agent',
      instructions: `You are a restaurant host. Your role is to:
- Greet customers warmly
- Check for reservations
- Provide wait times
- Route to appropriate service:
  - Takeout orders → Order Agent
  - Reservations → Scheduling Agent
  - General inquiries → Service Agent`,
    },
    waiter: {
      ...ORDER_AGENT_TEMPLATE,
      name: 'Restaurant Order Agent',
      instructions: `You are a restaurant order specialist. Your role is to:
- Take food and drink orders
- Explain menu items and ingredients
- Handle dietary restrictions and allergies
- Suggest wine pairings and specials
- Calculate bills and process payments`,
      tools: ['createOrder', 'updateOrder', 'getMenu', 'checkInventory', 'processPayment'],
    },
  };
}

export function generateMedicalAgentTemplates(): Record<string, AgentTemplate> {
  return {
    receptionist: {
      ...SERVICE_AGENT_TEMPLATE,
      name: 'Medical Receptionist Agent',
      instructions: `You are a medical office receptionist. Your role is to:
- Schedule medical appointments
- Verify patient information
- Provide office hours and directions
- Handle prescription refill requests (route to appropriate staff)
- Maintain HIPAA compliance
- Never provide medical advice`,
      guardrails: ['hipaa_compliance', 'no_medical_advice'],
    },
    scheduler: {
      ...SCHEDULING_AGENT_TEMPLATE,
      name: 'Medical Scheduler Agent',
      instructions: `You are a medical appointment scheduler. Your role is to:
- Schedule various types of medical appointments
- Handle urgent vs routine appointment requests
- Manage doctor availability
- Send appointment reminders
- Collect insurance information
- Coordinate with multiple providers`,
      tools: ['checkAvailability', 'scheduleAppointment', 'rescheduleAppointment', 'sendSMS', 'sendEmail'],
    },
  };
}

export function generateRetailAgentTemplates(): Record<string, AgentTemplate> {
  return {
    sales: {
      ...SERVICE_AGENT_TEMPLATE,
      name: 'Retail Sales Agent',
      instructions: `You are a retail sales assistant. Your role is to:
- Help customers find products
- Answer questions about features and pricing
- Check inventory and availability
- Process orders and returns
- Suggest complementary products
- Apply discounts and promotions`,
      tools: ['getServices', 'checkInventory', 'createOrder', 'processPayment'],
    },
    support: {
      ...SERVICE_AGENT_TEMPLATE,
      name: 'Customer Support Agent',
      instructions: `You are a retail customer support specialist. Your role is to:
- Handle product returns and exchanges
- Track order status
- Resolve customer complaints
- Process refunds
- Provide warranty information
- Escalate complex issues`,
      tools: ['getOrderStatus', 'refundPayment', 'getCustomerOrders', 'sendEmail'],
    },
  };
}