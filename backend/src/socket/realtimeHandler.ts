/**
 * WebSocket handler for Twilio Media Streams
 * Uses the TwilioOpenAIRealtimeBridge for production-ready audio streaming
 */

import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { parse } from 'url';
import { config } from '../config/env';
import { TwilioOpenAIRealtimeBridge } from '../services/twilioRealtimeBridge';
import { supabaseAdmin } from '../config/supabase';
import Logger from '../utils/logger';
import { Tool } from '../types/openaiRealtimeEvents';
import { tokenService } from '../services/tokenService';

const logger = Logger;

interface ConnectionParams {
  businessId?: string;
  agentType?: string;
  from?: string;
  callSid?: string;
  streamSid?: string;
}

interface AgentConfig {
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

// Connection pool to manage active bridges
const activeBridges = new Map<string, TwilioOpenAIRealtimeBridge>();

export async function handleConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
  const connectionId = Date.now().toString();
  let bridge: TwilioOpenAIRealtimeBridge | null = null;
  let heartbeatInterval: NodeJS.Timeout | null = null;
  let callStartTime: Date | null = null;
  let businessIdForTracking: string | null = null;

  try {
    // Parse connection parameters
    const url = parse(req.url || '', true);
    const params: ConnectionParams = {
      businessId: url.query['businessId'] as string,
      agentType: url.query['agentType'] as string,
      from: url.query['from'] as string,
      callSid: url.query['callSid'] as string,
      streamSid: url.query['streamSid'] as string,
    };

    // Validate origin for security
    const origin = req.headers.origin || req.headers.host || '';
    if (config.get('NODE_ENV') === 'production') {
      const allowedOrigins = [
        'https://media.twiliocdn.com',
        'https://sdk.twilio.com',
        'media.twiliocdn.com',
        'sdk.twilio.com',
        'twiliocdn.com'
      ];
      const isValidOrigin = allowedOrigins.some(allowed =>
        origin === allowed || origin.includes(allowed)
      );

      if (!isValidOrigin) {
        logger.warn('Rejected connection from unauthorized origin', { origin, connectionId });
        ws.send(JSON.stringify({ error: 'Unauthorized origin' }));
        ws.close(1008, 'Unauthorized');
        return;
      }
    }

    logger.info('WebSocket connection established', {
      connectionId,
      params,
      origin,
      userAgent: req.headers['user-agent'],
    });

    // Validate required parameters
    if (!params.businessId) {
      logger.error('Missing businessId parameter', { connectionId });
      ws.send(JSON.stringify({ error: 'Missing businessId parameter' }));
      ws.close(1008, 'Missing businessId');
      return;
    }

    // Check token balance
    const hasTokens = await tokenService.hassufficientTokens(params.businessId, 10); // Minimum 10 tokens required
    if (!hasTokens) {
      logger.warn('Insufficient token balance for call', { businessId: params.businessId, connectionId });
      ws.send(JSON.stringify({ error: 'Insufficient token balance. Please purchase more tokens.' }));
      ws.close(1008, 'Insufficient tokens');
      return;
    }

    // Fetch business and agent configuration
    const { data: business, error: businessError } = await supabaseAdmin
      .from('businesses')
      .select(`
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
      `)
      .eq('id', params.businessId)
      .single();

    if (businessError || !business) {
      logger.error('Business not found', {
        businessId: params.businessId,
        error: businessError,
        connectionId,
      });
      ws.send(JSON.stringify({ error: 'Business not found' }));
      ws.close(1008, 'Business not found');
      return;
    }

    // Select appropriate agent
    let agent: AgentConfig | null = null;

    if (params.agentType) {
      agent = business.agents?.find((a: AgentConfig) =>
        a.type === params.agentType && a.is_active
      ) || null;
    }

    if (!agent && business.agents?.length > 0) {
      agent = (business.agents.find((a: AgentConfig) => a.is_active) || business.agents[0]) as AgentConfig;
    }

    // Build system prompt with business context
    const businessData = business.data_json || {};
    const contextualInfo = buildBusinessContext(business.name, businessData);
    const systemPrompt = buildSystemPrompt(business.name, agent, businessData, contextualInfo);

    // Configure voice settings
    const voiceConfig = agent?.voice_config || {};
    const voice = mapVoiceToOpenAI(voiceConfig.voice || 'cedar');

    // Build tools configuration based on agent type
    const tools = buildToolsConfiguration(agent?.type || 'service', businessData);

    // Validate OpenAI API key
    const openaiApiKey = config.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      logger.error('OpenAI API key not configured', { connectionId });
      ws.send(JSON.stringify({ error: 'Server configuration error' }));
      ws.close(1011, 'Server configuration error');
      return;
    }

    // Create bridge configuration
    const bridgeConfig = {
      businessId: params.businessId,
      ...(agent?.id && { agentId: agent.id }),
      customerPhone: params.from || 'unknown',
      ...(params.streamSid && { twilioStreamSid: params.streamSid }),
      ...(params.callSid && { twilioCallSid: params.callSid }),
      voice,
      systemPrompt,
      temperature: 0.8,
      tools,
    };

    // Initialize the bridge
    bridge = new TwilioOpenAIRealtimeBridge(bridgeConfig);

    // Setup bridge event handlers
    bridge.on('initialized', (data) => {
      logger.info('Bridge initialized', { ...data, connectionId });
    });

    bridge.on('transcription', async (data) => {
      // Forward transcriptions to client if needed
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          event: 'transcription',
          ...data,
        }));
      }
    });

    bridge.on('functionCall', async (data) => {
      logger.info('Function call received', { ...data, connectionId });
      // Handle function calls (orders, payments, etc.)
      await handleFunctionCall(data, params.businessId!);
    });

    bridge.on('error', (data) => {
      logger.error('Bridge error', { ...data, connectionId });
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          event: 'error',
          ...data,
        }));
      }
    });

    bridge.on('reconnecting', (data) => {
      logger.info('Bridge reconnecting', { ...data, connectionId });
    });

    bridge.on('disconnected', (data) => {
      logger.info('Bridge disconnected', { ...data, connectionId });
      // Clean up from connection pool
      if (params.callSid) {
        activeBridges.delete(params.callSid);
      }
    });

    // Initialize the bridge with Twilio WebSocket
    await bridge.initialize(ws);

    // Add to connection pool for management
    if (params.callSid) {
      activeBridges.set(params.callSid, bridge);
    }

    // Track call start time and business ID for token tracking
    callStartTime = new Date();
    businessIdForTracking = params.businessId;

    // Setup heartbeat for connection health monitoring
    heartbeatInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      } else {
        clearInterval(heartbeatInterval!);
      }
    }, 30000);

    // Send successful connection message
    ws.send(JSON.stringify({
      event: 'connected',
      connectionId,
      businessId: params.businessId,
      agentType: agent?.type || 'default',
      voice,
    }));

    // Log connection to database
    await logConnectionToDatabase(params.businessId, params.from || 'unknown', agent?.id, connectionId);

    // Setup WebSocket event handlers
    ws.on('close', async (code: number, reason: Buffer) => {
      logger.info('WebSocket connection closed', {
        connectionId,
        code,
        reason: reason?.toString(),
      });

      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }

      // Track token usage for the call
      if (callStartTime && businessIdForTracking) {
        try {
          const callDurationSeconds = Math.floor((Date.now() - callStartTime.getTime()) / 1000);
          const callDurationMinutes = Math.ceil(callDurationSeconds / 60);

          // Calculate tokens based on call type (inbound vs outbound)
          const isInbound = params.from && !params.from.startsWith('+1763'); // Assuming our numbers start with +1763
          const serviceType = isInbound ? 'inbound_call' : 'outbound_call';
          const tokensConsumed = await tokenService.calculateTokensForService(serviceType, callDurationSeconds);

          if (tokensConsumed > 0) {
            await tokenService.trackUsage({
              businessId: businessIdForTracking,
              serviceType,
              referenceId: params.callSid || connectionId,
              tokensConsumed,
              durationSeconds: callDurationSeconds,
              metadata: {
                from: params.from,
                streamSid: params.streamSid,
                agentType: params.agentType,
              },
            });

            // Update call_logs with tokens consumed if we have a call record
            if (params.callSid) {
              await supabaseAdmin
                .from('call_logs')
                .update({
                  tokens_consumed: tokensConsumed,
                  duration: callDurationSeconds,
                })
                .eq('call_sid', params.callSid);
            }

            logger.info('Call token usage tracked', {
              businessId: businessIdForTracking,
              callDuration: callDurationMinutes,
              tokensConsumed,
              serviceType,
            });
          }
        } catch (error) {
          logger.error('Error tracking token usage', { error, connectionId });
        }
      }

      // Bridge will handle its own cleanup through the event handlers
    });

    ws.on('error', (error: Error) => {
      logger.error('WebSocket error', {
        error: error.message,
        connectionId,
      });
    });

    ws.on('pong', () => {
      logger.debug('Pong received', { connectionId });
    });

  } catch (error) {
    logger.error('Error handling WebSocket connection', {
      error,
      connectionId,
    });

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ error: 'Internal server error' }));
      ws.close(1011, 'Internal server error');
    }

    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }

    if (bridge) {
      await bridge.disconnect();
    }
  }
}

/**
 * Build business context for the system prompt
 */
function buildBusinessContext(_businessName: string, businessData: any): string {
  let context = '';

  if (businessData.menu && Array.isArray(businessData.menu)) {
    context += '\n\nMenu:\n';
    businessData.menu.forEach((item: any) => {
      context += `- ${item.name}: $${item.price}`;
      if (item.description) context += ` - ${item.description}`;
      context += '\n';
    });
  }

  if (businessData.hours) {
    context += '\n\nBusiness Hours:\n';
    Object.entries(businessData.hours).forEach(([day, hours]: [string, any]) => {
      if (hours.closed) {
        context += `${day}: Closed\n`;
      } else {
        context += `${day}: ${hours.open} - ${hours.close}\n`;
      }
    });
  }

  if (businessData.pricing) {
    context += '\n\nPricing:\n';
    Object.entries(businessData.pricing).forEach(([service, price]) => {
      context += `- ${service}: $${price}\n`;
    });
  }

  if (businessData.location) {
    const loc = businessData.location;
    context += `\n\nLocation: ${loc.address}, ${loc.city}, ${loc.state} ${loc.zip}\n`;
  }

  return context;
}

/**
 * Build system prompt for the AI agent
 */
function buildSystemPrompt(
  businessName: string,
  agent: AgentConfig | null,
  _businessData: any,
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

/**
 * Map voice names to OpenAI voices
 */
function mapVoiceToOpenAI(voice: string): 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' | 'cedar' | 'marin' {
  const voiceMap: Record<string, any> = {
    'alloy': 'alloy',
    'echo': 'echo',
    'fable': 'fable',
    'onyx': 'onyx',
    'nova': 'nova',
    'shimmer': 'shimmer',
    'cedar': 'cedar',
    'marin': 'marin',
    'ash': 'echo',
    'ballad': 'nova',
    'coral': 'shimmer',
    'sage': 'fable',
    'verse': 'alloy',
  };

  return voiceMap[voice.toLowerCase()] || 'cedar';
}

/**
 * Build tools configuration based on agent type
 */
function buildToolsConfiguration(agentType: string, _businessData: any): Tool[] {
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
            customer_phone: { type: 'string' },
            special_instructions: { type: 'string' },
          },
          required: ['items', 'customer_phone'],
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

  // Add general inquiry tools
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

/**
 * Handle function calls from the AI
 */
async function handleFunctionCall(
  data: { name: string; args: unknown; sessionId: string },
  businessId: string
): Promise<void> {
  try {
    switch (data.name) {
      case 'create_order':
        await createOrder(businessId, data.args as any);
        break;

      case 'process_payment':
        await processPayment(businessId, data.args as any);
        break;

      case 'get_business_info':
        // This would typically return business info
        break;

      default:
        logger.warn('Unknown function call', data);
    }
  } catch (error) {
    logger.error('Error handling function call', { error, data });
  }
}

/**
 * Create an order in the database
 */
async function createOrder(businessId: string, orderData: any): Promise<void> {
  const { items, customer_phone, special_instructions } = orderData;

  const total = items.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);

  const { error } = await supabaseAdmin.from('orders').insert({
    business_id: businessId,
    customer_phone,
    items,
    total,
    status: 'pending',
    payment_status: 'pending',
    metadata: { special_instructions },
  });

  if (error) {
    logger.error('Failed to create order', { error, orderData });
    throw error;
  }
}

/**
 * Process a payment
 */
async function processPayment(businessId: string, paymentData: any): Promise<void> {
  // This would integrate with your payment processing logic
  logger.info('Processing payment', { businessId, paymentData });
}

/**
 * Log connection to database
 */
async function logConnectionToDatabase(
  businessId: string,
  customerPhone: string,
  agentId: string | undefined,
  connectionId: string
): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from('call_logs').insert({
      business_id: businessId,
      call_sid: `ws-${connectionId}`,
      from_number: customerPhone,
      to_number: 'websocket',
      status: 'initiated',
      agent_id: agentId,
      metadata: {
        type: 'websocket',
        connection_id: connectionId,
      },
    });

    if (error) {
      logger.error('Failed to log connection to database', { error });
    }
  } catch (error) {
    logger.error('Error logging connection to database', { error });
  }
}

/**
 * Create WebSocket server for Twilio Media Streams
 */
export function createRealtimeWebSocketServer(): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    void handleConnection(ws, req);
  });

  // Periodic cleanup of stale connections
  setInterval(() => {
    const staleThreshold = Date.now() - 600000; // 10 minutes
    for (const [callSid, bridge] of activeBridges) {
      const metrics = bridge.getMetrics();
      if (metrics.startTime < staleThreshold && metrics.packetsReceived === 0) {
        logger.info('Cleaning up stale bridge', { callSid });
        bridge.disconnect();
        activeBridges.delete(callSid);
      }
    }
  }, 60000);

  logger.info('Twilio Realtime WebSocket server created');

  return wss;
}

/**
 * Get active bridges for monitoring
 */
export function getActiveBridges(): Map<string, TwilioOpenAIRealtimeBridge> {
  return activeBridges;
}