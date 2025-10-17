/**
 * WebSocket handler for Twilio Media Streams
 * Uses the TwilioOpenAIRealtimeBridge for production-ready audio streaming
 */

import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { parse } from 'url';
import { config } from '../config/env';
import { TwilioOpenAIRealtimeBridge } from '../services/twilioRealtimeBridge';
import Logger from '../utils/logger';
import {
  AgentConfig,
  buildBusinessContext,
  buildSystemPrompt,
  buildToolsConfiguration,
  ensureSufficientTokens,
  fetchBusinessAndAgent,
  mapVoiceToOpenAI,
  trackTokenUsageError,
} from './realtimeUtils';
import { tokenService } from '../services/tokenService';
import { supabaseAdmin } from '../config/supabase';

const logger = Logger;

interface ConnectionParams {
  businessId?: string;
  agentType?: string;
  from?: string;
  callSid?: string;
  streamSid?: string;
  callId?: string;
  direction?: 'inbound' | 'outbound';
}

interface FunctionCallData {
  name: string;
  args: Record<string, unknown>;
  sessionId: string;
}

interface OrderData {
  items: Array<{ name: string; quantity: number; price: number }>;
  customerPhone: string;
  specialInstructions?: string;
}

interface PaymentData {
  order_id: string;
  amount: number;
  payment_method: 'card' | 'cash' | 'digital_wallet';
}

// Connection pool to manage active bridges
const activeBridges = new Map<string, TwilioOpenAIRealtimeBridge>();

/**
 * Handle function calls from the AI
 */
async function handleFunctionCall(data: FunctionCallData, businessId: string): Promise<void> {
  try {
    switch (data.name) {
      case 'create_order':
        await createOrder(businessId, data.args as unknown as OrderData);
        break;

      case 'process_payment':
        await processPayment(businessId, data.args as unknown as PaymentData);
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
async function createOrder(businessId: string, orderData: OrderData): Promise<void> {
  const { items, customerPhone, specialInstructions } = orderData;

  const total = items.reduce((sum: number, item) => sum + item.price * item.quantity, 0);

  const { error } = await supabaseAdmin.from('orders').insert({
    business_id: businessId,
    customer_phone: customerPhone,
    items,
    total,
    status: 'pending',
    payment_status: 'pending',
    metadata: { special_instructions: specialInstructions },
  });

  if (error) {
    logger.error('Failed to create order', { error, orderData });
    throw error;
  }
}

/**
 * Process a payment
 */
async function processPayment(businessId: string, paymentData: PaymentData): Promise<void> {
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
  connectionId: string,
  metadata: {
    callId?: string;
    callSid?: string;
    agentType?: string;
    direction?: string;
  } = {}
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
        ...metadata,
      },
    });

    if (error) {
      logger.error('Failed to log connection to database', { error });
    }
  } catch (error) {
    logger.error('Error logging connection to database', { error });
  }
}

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
      businessId: url.query.businessId as string,
      agentType: url.query.agentType as string,
      from: url.query.from as string,
      callSid: url.query.callSid as string,
      streamSid: url.query.streamSid as string,
      callId: url.query.callId as string,
      direction: url.query.direction as 'inbound' | 'outbound',
    };

    // Validate origin for security
    const origin = req.headers.origin || req.headers.host || '';
    if (config.get('NODE_ENV') === 'production') {
      const allowedOrigins = [
        'https://media.twiliocdn.com',
        'https://sdk.twilio.com',
        'media.twiliocdn.com',
        'sdk.twilio.com',
        'twiliocdn.com',
      ];
      const isValidOrigin = allowedOrigins.some((allowed) => origin === allowed || origin.includes(allowed));

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
    try {
      await ensureSufficientTokens(params.businessId, 10);
    } catch (error) {
      logger.warn('Insufficient token balance for call', {
        businessId: params.businessId,
        connectionId,
      });
      ws.send(JSON.stringify({ error: (error as Error).message }));
      ws.close(1008, 'Insufficient tokens');
      return;
    }

    // Fetch business and agent configuration
    let business;
    let agent: AgentConfig | null = null;

    try {
      const result = await fetchBusinessAndAgent(params.businessId, params.agentType);
      business = result.business;
      agent = result.agent;
    } catch (error) {
      logger.error('Business not found', {
        businessId: params.businessId,
        error,
        connectionId,
      });
      ws.send(JSON.stringify({ error: 'Business not found' }));
      ws.close(1008, 'Business not found');
      return;
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
      ...(params.callId && { callId: params.callId }),
      ...(params.direction && { direction: params.direction }),
      voice,
      systemPrompt,
      tools,
    };

    // Initialize the bridge
    bridge = new TwilioOpenAIRealtimeBridge(bridgeConfig);

    // Setup bridge event handlers
    bridge.on('initialized', (data) => {
      logger.info('Bridge initialized', {
        ...data,
        connectionId,
        callId: params.callId,
        direction: params.direction,
      });
    });

    bridge.on('transcription', (data) => {
      // Forward transcriptions to client if needed
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            event: 'transcription',
            ...data,
            callId: params.callId,
            direction: params.direction,
          })
        );
      }
    });

    bridge.on('functionCall', (data) => {
      logger.info('Function call received', {
        ...data,
        connectionId,
        callId: params.callId,
        direction: params.direction,
      });
      // Handle function calls (orders, payments, etc.)
      void handleFunctionCall(data as FunctionCallData, params.businessId ?? '');
    });

    bridge.on('error', (data) => {
      logger.error('Bridge error', {
        ...data,
        connectionId,
        callId: params.callId,
        direction: params.direction,
      });
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            event: 'error',
            ...data,
            callId: params.callId,
            direction: params.direction,
          })
        );
      }
    });

    bridge.on('reconnecting', (data) => {
      logger.info('Bridge reconnecting', {
        ...data,
        connectionId,
        callId: params.callId,
        direction: params.direction,
      });
    });

    bridge.on('disconnected', (data) => {
      logger.info('Bridge disconnected', {
        ...data,
        connectionId,
        callId: params.callId,
        direction: params.direction,
      });
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
      } else if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
    }, 30000);

    // Send successful connection message
    ws.send(
      JSON.stringify({
        event: 'connected',
        connectionId,
        businessId: params.businessId,
        agentType: agent?.type || 'default',
        voice,
        ...(params.callId && { callId: params.callId }),
        ...(params.direction && { direction: params.direction }),
      })
    );

    // Log connection to database
    void logConnectionToDatabase(params.businessId, params.from || 'unknown', agent?.id, connectionId, {
      callId: params.callId,
      callSid: params.callSid,
      agentType: agent?.type,
      direction: params.direction,
    });

    // Setup WebSocket event handlers
    ws.on('close', (code: number, reason: Buffer) => {
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
        void (async () => {
          try {
            const callDurationSeconds = Math.floor((Date.now() - callStartTime.getTime()) / 1000);

            // Calculate tokens based on call type (inbound vs outbound)
            const isInbound = params.direction
              ? params.direction === 'inbound'
              : params.from && !params.from.startsWith('+1763');
            const serviceType = isInbound ? 'inbound_call' : 'outbound_call';
            const tokensConsumed = await tokenService.calculateTokensForService(serviceType, callDurationSeconds);

            if (tokensConsumed > 0) {
              await tokenService.trackUsage({
                businessId: businessIdForTracking,
                serviceType,
                referenceId: params.callSid || params.callId || connectionId,
                tokensConsumed,
                durationSeconds: callDurationSeconds,
                metadata: {
                  from: params.from,
                  streamSid: params.streamSid,
                  agentType: params.agentType,
                  callId: params.callId,
                  direction: params.direction,
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
                callDuration: Math.ceil(callDurationSeconds / 60),
                tokensConsumed,
                serviceType,
              });
            }
          } catch (error) {
            trackTokenUsageError(error, {
              connectionId,
              callId: params.callId,
              callSid: params.callSid,
            });
          }
        })();
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
      void bridge.disconnect();
    }
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
        void bridge.disconnect();
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
