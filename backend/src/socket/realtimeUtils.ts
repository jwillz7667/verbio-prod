import { supabaseAdmin } from '../config/supabase';
import { Tool } from '../types/openaiRealtimeEvents';
import Logger from '../utils/logger';
import { tokenService } from '../services/tokenService';

const logger = Logger;

export interface AgentConfig {
  id: string;
  name: string;
  type: 'service' | 'order' | 'payment';
  prompt: string;
  is_active: boolean;
  voice_config: {
    voice?: string;
    language?: string;
    pitch?: number;
    rate?: number;
    eagerness?: string;
    noise_reduction?: string;
  };
}

export interface BusinessRecord {
  id: string;
  name: string;
  data_json: Record<string, unknown>;
  agents: AgentConfig[];
}

export interface ConnectionMetadata {
  businessId: string;
  agentType?: string;
  from?: string;
  callSid?: string;
  streamSid?: string;
  callId?: string;
  direction?: 'inbound' | 'outbound';
}

export async function fetchBusinessAndAgent(
  businessId: string,
  agentType?: string
): Promise<{ business: BusinessRecord; agent: AgentConfig | null }> {
  const { data: business, error: businessError } = await supabaseAdmin
    .from('businesses')
    .select(
      `
      id,
      name,
      data_json,
      agents (
        id,
        name,
        type,
        prompt,
        voice_config,
        is_active
      )
    `
    )
    .eq('id', businessId)
    .single();

  if (businessError || !business) {
    throw new Error('Business not found');
  }

  let agent: AgentConfig | null = null;

  if (agentType) {
    agent = (business.agents?.find((a: AgentConfig) => a.type === agentType && a.is_active) ?? null) || null;
  }

  if (!agent && business.agents?.length) {
    agent = (business.agents.find((a: AgentConfig) => a.is_active) || business.agents[0]) as AgentConfig;
  }

  return { business: business as BusinessRecord, agent };
}

export function buildBusinessContext(_businessName: string, businessData: Record<string, unknown>): string {
  let context = '';

  const menuArray = businessData.menu as
    | Array<{
        name: string;
        price: number;
        description?: string;
      }>
    | undefined;
  if (menuArray && Array.isArray(menuArray)) {
    context += '\n\nMenu:\n';
    menuArray.forEach((item) => {
      context += `- ${item.name}: $${item.price}`;
      if (item.description) context += ` - ${item.description}`;
      context += '\n';
    });
  }

  const hoursObj = businessData.hours as
    | Record<string, { closed?: boolean; open?: string; close?: string }>
    | undefined;
  if (hoursObj) {
    context += '\n\nBusiness Hours:\n';
    Object.entries(hoursObj).forEach(([day, hours]: [string, Record<string, unknown>]) => {
      const closed = hours.closed as boolean | undefined;
      const open = hours.open as string | undefined;
      const close = hours.close as string | undefined;
      if (closed) {
        context += `${day}: Closed\n`;
      } else {
        context += `${day}: ${open} - ${close}\n`;
      }
    });
  }

  const pricingObj = businessData.pricing as Record<string, unknown> | undefined;
  if (pricingObj) {
    context += '\n\nPricing:\n';
    Object.entries(pricingObj).forEach(([service, price]) => {
      context += `- ${service}: $${price}\n`;
    });
  }

  const locationObj = businessData.location as
    | { address: string; city: string; state: string; zip: string }
    | undefined;
  if (locationObj) {
    const { address, city, state, zip } = locationObj;
    context += `\n\nLocation: ${address}, ${city}, ${state} ${zip}\n`;
  }

  return context;
}

export function buildSystemPrompt(
  businessName: string,
  agent: AgentConfig | null,
  _businessData: Record<string, unknown>,
  contextualInfo: string
): string {
  const defaultPrompt = `You are a professional and helpful AI assistant for ${businessName}.
${contextualInfo}

Guidelines:
1. Be professional, friendly, and concise
2. Only provide information you have been given
3. If you don't know something, politely say so
4. Keep responses brief and natural for phone conversations
5. When taking orders, confirm details clearly
6. For payments, ensure security and accuracy

Please assist customers with their inquiries professionally.`;

  return agent?.prompt || defaultPrompt;
}

export function mapVoiceToOpenAI(
  voice: string
): 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' | 'cedar' | 'marin' {
  const voiceMap: Record<string, 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' | 'cedar' | 'marin'> = {
    alloy: 'alloy',
    echo: 'echo',
    fable: 'fable',
    onyx: 'onyx',
    nova: 'nova',
    shimmer: 'shimmer',
    cedar: 'cedar',
    marin: 'marin',
    ash: 'echo',
    ballad: 'nova',
    coral: 'shimmer',
    sage: 'fable',
    verse: 'alloy',
  };

  return voiceMap[voice.toLowerCase()] || 'cedar';
}

export function buildToolsConfiguration(agentType: string, _businessData: Record<string, unknown>): Tool[] {
  const tools: Tool[] = [];

  if (agentType === 'order' || agentType === 'payment') {
    tools.push({
      type: 'function',
      function: {
        name: 'create_order',
        description: 'Create a new customer order',
        parameters: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  quantity: { type: 'number' },
                  price: { type: 'number' },
                },
                required: ['name', 'quantity', 'price'],
              },
            },
            customerPhone: { type: 'string' },
            specialInstructions: { type: 'string' },
          },
          required: ['items', 'customerPhone'],
        },
        strict: true,
      },
    });
  }

  if (agentType === 'payment') {
    tools.push({
      type: 'function',
      function: {
        name: 'process_payment',
        description: 'Process a payment for an order',
        parameters: {
          type: 'object',
          properties: {
            order_id: { type: 'string' },
            amount: { type: 'number' },
            payment_method: {
              type: 'string',
              enum: ['card', 'cash', 'digital_wallet'],
            },
          },
          required: ['order_id', 'amount', 'payment_method'],
        },
        strict: true,
      },
    });
  }

  tools.push({
    type: 'function',
    function: {
      name: 'get_business_info',
      description: 'Get business information like hours, location, or services',
      parameters: {
        type: 'object',
        properties: {
          info_type: {
            type: 'string',
            enum: ['hours', 'location', 'services', 'menu', 'pricing'],
          },
        },
        required: ['info_type'],
      },
      strict: true,
    },
  });

  return tools;
}

export async function ensureSufficientTokens(businessId: string, minimumTokens = 10): Promise<void> {
  const hasTokens = await tokenService.hassufficientTokens(businessId, minimumTokens);
  if (!hasTokens) {
    throw new Error('Insufficient token balance. Please purchase more tokens.');
  }
}

export function trackTokenUsageError(error: unknown, context: Record<string, unknown>): void {
  logger.error('Error tracking token usage', { error, ...context });
}
