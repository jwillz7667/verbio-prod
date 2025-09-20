import { WebSocket } from 'ws';
import { Server } from 'http';
import { parse } from 'url';
import { supabase } from '../config/supabase';
import { twilioClient } from '../services/twilioService';
import { OpenAIRealtimeService } from '../services/openaiRealtimeService';
import logger from '../utils/logger';

interface VoiceAgentConnection {
  ws: WebSocket;
  callId: string;
  businessId: string;
  openaiService?: OpenAIRealtimeService;
  twilioCallSid?: string;
  phoneNumber?: string;
}

export class VoiceAgentHandler {
  private connections: Map<string, VoiceAgentConnection> = new Map();

  setupWebSocket(server: Server) {
    const wss = new WebSocket.Server({
      server,
      path: '/ws/voice-agent',
      verifyClient: (info, cb) => {
        const { query } = parse(info.req.url || '', true);
        const businessId = query.businessId as string;
        const callId = query.callId as string;

        if (!businessId || !callId) {
          cb(false, 401, 'Unauthorized');
          return;
        }

        cb(true);
      }
    });

    wss.on('connection', async (ws: WebSocket, req) => {
      const { query } = parse(req.url || '', true);
      const businessId = query.businessId as string;
      const callId = query.callId as string;

      logger.info(`Voice agent WebSocket connected for call ${callId}`);

      const connection: VoiceAgentConnection = {
        ws,
        callId,
        businessId
      };

      this.connections.set(callId, connection);

      ws.on('message', async (data: string) => {
        try {
          const message = JSON.parse(data.toString());
          await this.handleMessage(callId, message);
        } catch (error) {
          logger.error('Error handling voice agent message:', error);
        }
      });

      ws.on('close', () => {
        this.handleDisconnect(callId);
      });

      ws.on('error', (error) => {
        logger.error(`WebSocket error for call ${callId}:`, error);
        this.handleDisconnect(callId);
      });
    });
  }

  async initiateOutboundCall(
    phoneNumber: string,
    callId: string,
    businessId: string,
    settings: any
  ) {
    try {
      const connection = this.connections.get(callId);
      if (!connection) {
        throw new Error('No WebSocket connection found');
      }

      // Initialize OpenAI Realtime Service
      const openaiService = new OpenAIRealtimeService({
        voice: settings.voice || 'alloy',
        systemPrompt: settings.systemPrompt,
        temperature: settings.temperature,
        onTranscription: (role: string, content: string) => {
          this.sendTranscription(callId, role, content);
        },
        onError: (error: string) => {
          this.sendError(callId, error);
        }
      });

      await openaiService.connect();
      connection.openaiService = openaiService;

      // Create Twilio call with WebSocket stream
      const call = await twilioClient.calls.create({
        to: phoneNumber,
        from: process.env.TWILIO_PHONE_NUMBER,
        url: `${process.env.BASE_URL}/api/twilio/voice-agent-twiml?callId=${callId}`,
        statusCallback: `${process.env.BASE_URL}/api/twilio/voice-agent-status?callId=${callId}`,
        statusCallbackEvent: ['initiated', 'answered', 'completed'],
        machineDetection: 'DetectMessageEnd'
      });

      connection.twilioCallSid = call.sid;
      connection.phoneNumber = phoneNumber;

      // Log call initiation
      await supabase
        .from('call_logs')
        .insert({
          business_id: businessId,
          call_sid: call.sid,
          phone_number: phoneNumber,
          direction: 'outbound',
          status: 'initiated',
          agent_type: 'voice_agent',
          metadata: {
            callId,
            settings
          }
        });

      logger.info(`Initiated outbound call ${call.sid} to ${phoneNumber}`);
      return { success: true, callSid: call.sid };

    } catch (error) {
      logger.error('Error initiating outbound call:', error);
      throw error;
    }
  }

  async handleTwilioStream(callId: string, streamData: any) {
    const connection = this.connections.get(callId);
    if (!connection || !connection.openaiService) {
      logger.warn(`No connection found for call ${callId}`);
      return;
    }

    try {
      // Forward audio to OpenAI
      if (streamData.event === 'media' && streamData.media) {
        await connection.openaiService.sendAudio(streamData.media.payload);
      }
    } catch (error) {
      logger.error(`Error handling Twilio stream for call ${callId}:`, error);
    }
  }

  private async handleMessage(callId: string, message: any) {
    const connection = this.connections.get(callId);
    if (!connection) return;

    switch (message.type) {
      case 'end-call':
        await this.endCall(callId);
        break;

      case 'toggle-mute':
        if (connection.openaiService) {
          // Handle mute functionality
          connection.openaiService.setMuted(message.muted);
        }
        break;

      default:
        logger.warn(`Unknown message type: ${message.type}`);
    }
  }

  private async endCall(callId: string) {
    const connection = this.connections.get(callId);
    if (!connection) return;

    try {
      // End Twilio call
      if (connection.twilioCallSid) {
        await twilioClient.calls(connection.twilioCallSid).update({
          status: 'completed'
        });
      }

      // Close OpenAI connection
      if (connection.openaiService) {
        connection.openaiService.disconnect();
      }

      // Update call log
      if (connection.twilioCallSid) {
        await supabase
          .from('call_logs')
          .update({
            status: 'completed',
            ended_at: new Date().toISOString()
          })
          .eq('call_sid', connection.twilioCallSid);
      }

      // Notify client
      connection.ws.send(JSON.stringify({
        type: 'call-ended',
        timestamp: new Date().toISOString()
      }));

      // Close WebSocket
      connection.ws.close();
      this.connections.delete(callId);

    } catch (error) {
      logger.error(`Error ending call ${callId}:`, error);
    }
  }

  private handleDisconnect(callId: string) {
    const connection = this.connections.get(callId);
    if (!connection) return;

    if (connection.openaiService) {
      connection.openaiService.disconnect();
    }

    this.connections.delete(callId);
    logger.info(`Voice agent disconnected for call ${callId}`);
  }

  private sendTranscription(callId: string, role: string, content: string) {
    const connection = this.connections.get(callId);
    if (!connection) return;

    connection.ws.send(JSON.stringify({
      type: 'transcription',
      role,
      content,
      timestamp: new Date().toISOString()
    }));
  }

  private sendError(callId: string, error: string) {
    const connection = this.connections.get(callId);
    if (!connection) return;

    connection.ws.send(JSON.stringify({
      type: 'error',
      message: error,
      timestamp: new Date().toISOString()
    }));
  }

  getTwilioResponseForCall(callId: string): string {
    // Generate TwiML response for Twilio to stream audio
    return `<?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Connect>
        <Stream url="wss://${process.env.BASE_URL?.replace('https://', '')}/ws/twilio-stream?callId=${callId}" />
      </Connect>
    </Response>`;
  }
}

export const voiceAgentHandler = new VoiceAgentHandler();