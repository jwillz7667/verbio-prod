import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { parse } from 'url';
import { config } from '../config/env';
import { RealtimeSession } from '../services/openaiService';
import { supabaseAdmin } from '../config/supabase';
import { logger } from '../utils/logger';
import { StreamEvent } from '../types/twilio';

interface ConnectionParams {
  businessId?: string;
  agentType?: string;
  from?: string;
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

export async function handleConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
  const connectionId = Date.now().toString();
  let session: RealtimeSession | null = null;
  let heartbeatInterval: NodeJS.Timeout | null = null;

  try {
    const url = parse(req.url || '', true);
    const params: ConnectionParams = {
      businessId: url.query['businessId'] as string,
      agentType: url.query['agentType'] as string,
      from: url.query['from'] as string,
    };

    logger.info('WebSocket connection established', {
      connectionId,
      params,
      headers: req.headers,
    });

    if (!params.businessId) {
      logger.error('Missing businessId parameter');
      ws.send(JSON.stringify({ error: 'Missing businessId parameter' }));
      ws.close(1008, 'Missing businessId');
      return;
    }

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
      logger.error('Business not found', { businessId: params.businessId, error: businessError });
      ws.send(JSON.stringify({ error: 'Business not found' }));
      ws.close(1008, 'Business not found');
      return;
    }

    let agent: AgentConfig | null = null;

    if (params.agentType) {
      agent = business.agents?.find((a: AgentConfig) =>
        a.type === params.agentType && a.is_active
      ) || null;
    }

    if (!agent && business.agents?.length > 0) {
      agent = (business.agents.find((a: AgentConfig) => a.is_active) || business.agents[0]) as AgentConfig;
    }

    const businessData = business.data_json || {};
    const menuInfo = businessData.menu ? `\n\nOur menu:\n${JSON.stringify(businessData.menu, null, 2)}` : '';
    const hoursInfo = businessData.hours ? `\n\nBusiness hours:\n${JSON.stringify(businessData.hours, null, 2)}` : '';
    const pricingInfo = businessData.pricing ? `\n\nPricing:\n${JSON.stringify(businessData.pricing, null, 2)}` : '';

    const defaultPrompt = `You are a helpful AI assistant for ${business.name}.${menuInfo}${hoursInfo}${pricingInfo}

Please assist customers with their inquiries professionally and accurately.`;

    const instructions = agent?.prompt || defaultPrompt;

    const voiceConfig = agent?.voice_config || {};
    const voice = voiceConfig.voice || 'cedar';
    const vadEagerness = voiceConfig.eagerness || 'medium';
    const noiseReduction = voiceConfig.noise_reduction || 'auto';

    const openaiApiKey = config.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      logger.error('OpenAI API key not configured');
      ws.send(JSON.stringify({ error: 'OpenAI API key not configured' }));
      ws.close(1011, 'Server configuration error');
      return;
    }

    session = new RealtimeSession(openaiApiKey, {
      instructions,
      voice: voice as any,
      businessId: params.businessId,
      customerPhone: params.from || 'unknown',
      agentType: agent?.type || 'service',
      vadMode: 'semantic_vad',
      vadEagerness: vadEagerness as any,
      noiseReduction: noiseReduction as any,
      temperature: 0.8,
      maxOutputTokens: 4096,
      mcpServerUrl: config.get('MCP_SERVER_URL') || undefined,
    });

    session.on('audio_data', (data: any) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
      }
    });

    session.on('error', (error: any) => {
      logger.error('RealtimeSession error', { error, connectionId });
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          event: 'error',
          message: 'Session error occurred'
        }));
      }
    });

    session.on('twilio_stream_start', (data: any) => {
      logger.info('Twilio stream started via session', { data, connectionId });
    });

    session.on('twilio_stream_stop', (data: any) => {
      logger.info('Twilio stream stopped via session', { data, connectionId });
    });

    await session.connect();

    logger.info('OpenAI session created successfully', {
      connectionId,
      businessId: params.businessId,
      agentType: agent?.type || 'default',
      voice,
      vadEagerness,
      noiseReduction,
    });

    heartbeatInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 30000);

    ws.on('message', async (data: Buffer) => {
      try {
        const message = data.toString();
        const event = JSON.parse(message) as StreamEvent;

        if (event.event && session) {
          await session.handleTwilioEvent(event);
        } else if (!session) {
          logger.error('Session is null', { connectionId });
        } else {
          logger.warn('Unknown message format', { message, connectionId });
        }
      } catch (error) {
        logger.error('Error processing WebSocket message', { error, connectionId });
      }
    });

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

      if (session) {
        session.disconnect();
        session = null;
      }
    });

    ws.on('error', (error: Error) => {
      logger.error('WebSocket error', { error: error.message, connectionId });
    });

    ws.on('pong', () => {
      logger.debug('Pong received', { connectionId });
    });

    ws.send(JSON.stringify({
      event: 'connected',
      connectionId,
      businessId: params.businessId,
      agentType: agent?.type || 'default',
    }));

    await logConnectionToDatabase(params.businessId, params.from || 'unknown', agent?.id, connectionId);

  } catch (error) {
    logger.error('Error handling WebSocket connection', { error, connectionId });

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ error: 'Internal server error' }));
      ws.close(1011, 'Internal server error');
    }

    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }

    if (session) {
      session.disconnect();
    }
  }
}

async function logConnectionToDatabase(
  businessId: string,
  customerPhone: string,
  agentId: string | undefined,
  connectionId: string
): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from('call_logs')
      .insert({
        business_id: businessId,
        call_sid: `ws-${connectionId}`,
        from_number: customerPhone,
        to_number: 'websocket',
        direction: 'inbound',
        status: 'in-progress',
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

export function createRealtimeWebSocketServer(): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    handleConnection(ws, req);
  });

  return wss;
}