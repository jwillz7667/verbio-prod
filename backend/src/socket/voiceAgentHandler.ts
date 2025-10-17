import { IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import { URL } from 'url';
import { WebSocket, WebSocketServer } from 'ws';
import { twiml } from 'twilio';
import { config } from '../config/env';
import logger, { logTwilio } from '../utils/logger';
import { handleConnection } from './realtimeHandler';
import { getTwilioClient } from '../services/twilioService';

const { VoiceResponse } = twiml;

type VoiceAgentStatus = 'pending' | 'initiated' | 'streaming' | 'completed' | 'failed';

interface VoiceAgentSession {
  callId: string;
  businessId: string;
  phoneNumber: string;
  agentType?: string;
  metadata?: Record<string, unknown>;
  callSid?: string;
  streamSid?: string;
  status: VoiceAgentStatus;
  createdAt: number;
  lastUpdatedAt: number;
}

interface OutboundCallOptions {
  agentType?: string;
  metadata?: Record<string, unknown>;
}

interface OutboundCallResult {
  callId: string;
  callSid: string;
}

const SESSION_TTL_MS = 1000 * 60 * 30; // 30 minutes
const COMPLETED_SESSION_TTL_MS = 1000 * 60 * 5; // 5 minutes post-completion

const allowedOrigins = [
  'https://media.twiliocdn.com',
  'https://sdk.twilio.com',
  'media.twiliocdn.com',
  'sdk.twilio.com',
];

const sessions = new Map<string, VoiceAgentSession>();

const voiceAgentWss = new WebSocketServer({ noServer: true });

voiceAgentWss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
  try {
    const url = new URL(request.url || '', `http://${request.headers.host ?? 'localhost'}`);
    const callId = url.searchParams.get('callId');

    if (!callId) {
      logger.warn('Voice agent connection missing callId');
      ws.close(1008, 'Missing callId');
      return;
    }

    const session = sessions.get(callId);
    if (!session) {
      logger.warn('No session found for voice agent connection', { callId });
    } else {
      session.status = 'streaming';
      session.streamSid = url.searchParams.get('streamSid') ?? undefined;
      session.lastUpdatedAt = Date.now();
      sessions.set(callId, session);
      logger.info('Voice agent WebSocket connected', {
        callId,
        businessId: session.businessId,
        streamSid: session.streamSid,
      });
    }

    ws.on('close', (code: number, reason: Buffer) => {
      logger.info('Voice agent WebSocket closed', {
        callId,
        code,
        reason: reason?.toString(),
      });

      const currentSession = sessions.get(callId);
      if (currentSession && currentSession.status !== 'completed') {
        currentSession.status = 'completed';
        currentSession.lastUpdatedAt = Date.now();
        sessions.set(callId, currentSession);
      }
    });

    ws.on('error', (error: Error) => {
      logger.error('Voice agent WebSocket error', { callId, error: error.message });
    });

    void handleConnection(ws, request).catch((error: unknown) => {
      logger.error('Error handling voice agent WebSocket connection', {
        callId,
        error,
      });
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1011, 'Internal server error');
      }
    });
  } catch (error) {
    logger.error('Failed to initialize voice agent WebSocket connection', { error });
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(1011, 'Internal server error');
    }
  }
});

const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [callId, session] of sessions.entries()) {
    const ttl =
      session.status === 'completed' || session.status === 'failed' ? COMPLETED_SESSION_TTL_MS : SESSION_TTL_MS;

    if (now - session.lastUpdatedAt > ttl) {
      logger.info('Cleaning up stale voice agent session', {
        callId,
        status: session.status,
        createdAt: session.createdAt,
      });
      sessions.delete(callId);
    }
  }
}, 60000);

if (typeof cleanupInterval.unref === 'function') {
  cleanupInterval.unref();
}

function ensureTwilioConfiguration(): void {
  const phoneNumber = config.get('TWILIO_PHONE_NUMBER');
  if (!phoneNumber) {
    throw new Error('Twilio phone number not configured');
  }

  const backendUrl = config.get('BACKEND_URL');
  if (!backendUrl) {
    throw new Error('Backend URL not configured');
  }
}

function buildBackendUrl(pathname: string, query: Record<string, string | undefined>): string {
  const backendUrl = config.get('BACKEND_URL') || 'https://verbio.app';
  const url = new URL(pathname, backendUrl.endsWith('/') ? backendUrl : `${backendUrl}/`);
  Object.entries(query).forEach(([key, value]) => {
    if (value) {
      url.searchParams.set(key, value);
    }
  });
  return url.toString();
}

function toWebSocketBase(): string {
  const backendUrl = config.get('BACKEND_URL') || 'https://verbio.app';
  const parsed = new URL(backendUrl);
  parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
  parsed.pathname = parsed.pathname.replace(/\/$/, '');
  return `${parsed.protocol}//${parsed.host}`;
}

function buildWebSocketUrl(session: VoiceAgentSession): string {
  const base = toWebSocketBase();
  const url = new URL('/ws/voice-agent', base);
  url.searchParams.set('businessId', session.businessId);
  url.searchParams.set('callId', session.callId);
  url.searchParams.set('from', session.phoneNumber);
  url.searchParams.set('direction', 'outbound');
  if (session.agentType) {
    url.searchParams.set('agentType', session.agentType);
  }
  if (session.callSid) {
    url.searchParams.set('callSid', session.callSid);
  }
  return url.toString();
}

function upsertSession(session: VoiceAgentSession): VoiceAgentSession {
  sessions.set(session.callId, session);
  return session;
}

function updateSession(callId: string, updates: Partial<VoiceAgentSession>): VoiceAgentSession | undefined {
  const existing = sessions.get(callId);
  if (!existing) {
    return undefined;
  }
  const updated: VoiceAgentSession = {
    ...existing,
    ...updates,
    lastUpdatedAt: Date.now(),
  };
  sessions.set(callId, updated);
  return updated;
}

function mapTwilioStatus(status: string): VoiceAgentStatus {
  const normalized = status.toLowerCase();
  if (normalized === 'completed') {
    return 'completed';
  }
  if (['failed', 'busy', 'no-answer', 'canceled'].includes(normalized)) {
    return 'failed';
  }
  if (['ringing', 'in-progress', 'answered', 'queued', 'initiated'].includes(normalized)) {
    return 'streaming';
  }
  return 'pending';
}

async function initiateOutboundCall(
  phoneNumber: string,
  callId: string,
  businessId: string,
  options: OutboundCallOptions = {}
): Promise<OutboundCallResult> {
  ensureTwilioConfiguration();

  const twilioClient = getTwilioClient();
  const fromNumber = config.get('TWILIO_PHONE_NUMBER')!;

  const session: VoiceAgentSession = {
    callId,
    businessId,
    phoneNumber,
    agentType: options.agentType,
    metadata: options.metadata,
    status: 'pending',
    createdAt: Date.now(),
    lastUpdatedAt: Date.now(),
  };

  upsertSession(session);

  const twimlUrl = buildBackendUrl('/api/calls/twilio/voice-agent-twiml', {
    callId,
    businessId,
    agentType: options.agentType,
  });

  const statusCallbackUrl = buildBackendUrl('/api/calls/twilio/status', {
    callId,
    businessId,
  });

  const call = await twilioClient.calls.create({
    to: phoneNumber,
    from: fromNumber,
    url: twimlUrl,
    statusCallback: statusCallbackUrl,
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed', 'failed', 'busy', 'no-answer'],
  });

  logTwilio('voice_agent_outbound_call_created', call.sid, {
    callId,
    to: phoneNumber,
    from: fromNumber,
    businessId,
  });

  updateSession(callId, {
    status: 'initiated',
    callSid: call.sid,
  });

  return {
    callId,
    callSid: call.sid,
  };
}

function getTwilioResponseForCall(callId: string): string {
  const session = sessions.get(callId);

  if (!session) {
    logger.warn('No session found for voice agent TwiML request', { callId });
    const response = new VoiceResponse();
    (response as any).say('We are unable to locate your session. Please try again later.');
    (response as any).hangup();
    return response.toString();
  }

  const wsUrl = buildWebSocketUrl(session);
  const response = new VoiceResponse();
  const connect = (response as any).connect();
  const stream = connect.stream({
    url: wsUrl,
    track: 'both_tracks',
  });

  stream.parameter({ name: 'callId', value: session.callId });
  stream.parameter({ name: 'businessId', value: session.businessId });
  if (session.agentType) {
    stream.parameter({ name: 'agentType', value: session.agentType });
  }
  stream.parameter({ name: 'direction', value: 'outbound' });
  stream.parameter({ name: 'from', value: session.phoneNumber });
  stream.parameter({ name: 'callSid', value: session.callSid ?? '{{CallSid}}' });

  logTwilio('voice_agent_twiml_generated', session.callSid, {
    callId: session.callId,
    businessId: session.businessId,
    agentType: session.agentType,
    wsUrl,
  });

  updateSession(callId, { status: 'streaming' });

  return response.toString();
}

function handleCallStatusUpdate(
  callId: string,
  status: string,
  details: { callSid?: string; recordingUrl?: string; durationSeconds?: number } = {}
): void {
  const session = sessions.get(callId);
  if (!session) {
    logger.debug('Voice agent status update received for non-existent session', { callId, status });
    return;
  }

  const mappedStatus = mapTwilioStatus(status);

  updateSession(callId, {
    status: mappedStatus,
    callSid: details.callSid ?? session.callSid,
  });

  logTwilio('voice_agent_status_update', details.callSid ?? session.callSid, {
    callId,
    status,
    mappedStatus,
    recordingUrl: details.recordingUrl,
    durationSeconds: details.durationSeconds,
  });

  if (mappedStatus === 'completed' || mappedStatus === 'failed') {
    // Mark for cleanup after TTL
    updateSession(callId, { lastUpdatedAt: Date.now() });
  }
}

function cleanupSession(callId: string): void {
  sessions.delete(callId);
}

function handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
  try {
    const origin = request.headers.origin || request.headers.host || '';
    if (config.isProduction()) {
      const isAllowed = allowedOrigins.some((allowed) => origin === allowed || origin.includes(allowed));
      if (!isAllowed) {
        logger.warn('Rejected voice agent WebSocket upgrade due to invalid origin', { origin });
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }
    }

    voiceAgentWss.handleUpgrade(request, socket, head, (ws) => {
      voiceAgentWss.emit('connection', ws, request);
    });
  } catch (error) {
    logger.error('Voice agent WebSocket upgrade failed', { error });
    try {
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
    } catch (writeError) {
      logger.error('Failed to write error response for voice agent upgrade', { writeError });
    } finally {
      socket.destroy();
    }
  }
}

function getSession(callId: string): VoiceAgentSession | undefined {
  return sessions.get(callId);
}

function hasSession(callId: string): boolean {
  return sessions.has(callId);
}

function resetSessions(): void {
  sessions.clear();
}

export const voiceAgentHandler = {
  handleUpgrade,
  initiateOutboundCall,
  getTwilioResponseForCall,
  handleCallStatusUpdate,
  cleanupSession,
  getSession,
  hasSession,
  __reset: resetSessions,
};

export type { VoiceAgentSession, VoiceAgentStatus };
