import { Server as HTTPServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { URL } from 'url';
import * as ffmpeg from 'fluent-ffmpeg';
import { PassThrough } from 'stream';
import { supabaseAdmin as supabase } from '../config/supabase';
import { logger } from '../utils/logger';
import { OpenAIRealtimeService } from '../services/openaiRealtimeService';
// import { TwilioService } from '../services/twilioService';

interface SessionConfig {
  model: string;
  voice: string;
  instructions: string;
  inputAudioTranscription: {
    enabled: boolean;
    model: string;
  };
  turnDetection: {
    type: 'server_vad' | 'semantic_vad' | 'none';
    threshold?: number;
    prefixPaddingMs?: number;
    silenceDurationMs?: number;
    createResponse?: boolean;
  };
  tools?: Array<{
    type: string;
    name: string;
    description: string;
    parameters: Record<string, any>;
  }>;
  maxResponseOutputTokens: number | 'inf';
  vadMode: 'server_vad' | 'semantic_vad' | 'disabled';
  modalities: string[];
  audioFormat: 'pcm16' | 'g711_ulaw' | 'g711_alaw';
  toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; name: string };
  noiseReduction?: {
    enabled: boolean;
    strength: 'low' | 'medium' | 'high';
  };
  mcpServers?: Array<{
    url: string;
    name: string;
    apiKey?: string;
  }>;
}

interface RealtimeConnection {
  ws: WebSocket;
  openaiService: OpenAIRealtimeService;
  twilioService?: any; // TwilioService;
  sessionId: string;
  businessId: string;
  callSid?: string;
  phoneNumber?: string;
  config: SessionConfig;
}

const connections = new Map<string, RealtimeConnection>();

export function setupRealtimePlaygroundWebSocket(server: HTTPServer): void {
  const wss = new WebSocketServer({
    server,
    path: '/ws/realtime',
  });

  wss.on('connection', async (ws: WebSocket, request) => {
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    const businessId = url.searchParams.get('businessId');
    const model = url.searchParams.get('model') || 'gpt-realtime';
    const voice = url.searchParams.get('voice') || 'alloy';

    if (!businessId) {
      ws.send(
        JSON.stringify({
          type: 'error',
          error: { message: 'Missing businessId parameter' },
        })
      );
      ws.close();
      return;
    }

    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    logger.info(`New realtime playground connection: ${sessionId}`);

    // Initialize OpenAI Realtime Service
    const openaiService = new OpenAIRealtimeService({} as any);

    // Store connection
    const connection: RealtimeConnection = {
      ws,
      openaiService,
      sessionId,
      businessId,
      config: {
        model,
        voice,
        instructions: '',
        inputAudioTranscription: { enabled: true, model: 'whisper-1' },
        turnDetection: {
          type: 'semantic_vad',
          createResponse: true,
        },
        maxResponseOutputTokens: 4096,
        vadMode: 'semantic_vad',
        modalities: ['text', 'audio'],
        audioFormat: 'pcm16',
        noiseReduction: {
          enabled: true,
          strength: 'medium',
        },
        mcpServers: [],
      },
    };

    connections.set(sessionId, connection);

    // Handle client messages
    ws.on('message', async (message: Buffer) => {
      try {
        const data = JSON.parse(message.toString());
        logger.debug(`Received message type: ${data.type}`, { sessionId });

        switch (data.type) {
          case 'session.update':
            await handleSessionUpdate(connection, data.session);
            break;

          case 'call.initiate':
            await handleCallInitiate(connection, data);
            break;

          case 'call.end':
            await handleCallEnd(connection);
            break;

          case 'input_audio_buffer.append':
            await handleAudioAppend(connection, data.audio);
            break;

          case 'input_audio_buffer.clear':
            await handleAudioClear(connection);
            break;

          case 'input_audio_buffer.commit':
            await handleAudioCommit(connection);
            break;

          case 'conversation.item.create':
            await handleConversationItemCreate(connection, data.item);
            break;

          case 'response.create':
            await handleResponseCreate(connection, data);
            break;

          case 'response.cancel':
            await handleResponseCancel(connection);
            break;

          default:
            // Forward unknown messages to OpenAI
            const { isConnected } = connection.openaiService as any;
            if (isConnected) {
              (connection.openaiService as any).send(data);
            }
        }
      } catch (error) {
        logger.error('Error handling message:', error);
        ws.send(
          JSON.stringify({
            type: 'error',
            error: { message: 'Failed to process message' },
          })
        );
      }
    });

    ws.on('close', () => {
      handleDisconnect(sessionId);
    });

    ws.on('error', (error) => {
      logger.error(`WebSocket error for session ${sessionId}:`, error);
      handleDisconnect(sessionId);
    });

    // Send initial connection confirmation
    ws.send(
      JSON.stringify({
        type: 'connection.established',
        sessionId,
        timestamp: new Date().toISOString(),
      })
    );
  });

  logger.info('Realtime Playground WebSocket server initialized');
}

async function handleSessionUpdate(connection: RealtimeConnection, session: Partial<SessionConfig>): Promise<void> {
  try {
    // Update local config
    connection.config = { ...connection.config, ...session };

    // Connect to OpenAI if not already connected
    const { isConnected } = connection.openaiService as any;
    if (!isConnected) {
      await connection.openaiService.connect(connection.config.model);

      // Set up OpenAI event handlers
      (connection.openaiService as any).on('message', (message: any) => {
        // Forward OpenAI messages to client
        connection.ws.send(JSON.stringify(message));

        // Handle specific message types
        if (
          message.type === 'conversation.item.created' ||
          message.type === 'response.audio_transcript.delta' ||
          message.type === 'response.audio.delta'
        ) {
          handleTranscriptionUpdate(connection, message);
        }
      });

      (connection.openaiService as any).on('error', (error: any) => {
        logger.error('OpenAI service error:', error);
        connection.ws.send(
          JSON.stringify({
            type: 'error',
            error: { message: 'OpenAI service error', details: error },
          })
        );
      });

      (connection.openaiService as any).on('close', () => {
        connection.ws.send(
          JSON.stringify({
            type: 'session.disconnected',
            timestamp: new Date().toISOString(),
          })
        );
      });
    }

    // Send session update to OpenAI with latest API spec
    const openaiSession: any = {
      type: 'session.update',
      session: {
        modalities: connection.config.modalities,
        voice: connection.config.voice,
        instructions: connection.config.instructions,
        input_audio_format: connection.config.audioFormat,
        output_audio_format: connection.config.audioFormat,
        input_audio_transcription: connection.config.inputAudioTranscription.enabled
          ? {
              model: connection.config.inputAudioTranscription.model,
            }
          : undefined,
        turn_detection:
          connection.config.vadMode === 'disabled'
            ? null
            : {
                type: connection.config.vadMode,
                ...(connection.config.vadMode === 'server_vad' && {
                  threshold: connection.config.turnDetection.threshold || 0.5,
                  prefix_padding_ms: connection.config.turnDetection.prefixPaddingMs || 300,
                  silence_duration_ms: connection.config.turnDetection.silenceDurationMs || 500,
                }),
                create_response: connection.config.turnDetection.createResponse !== false,
              },
        tools: connection.config.tools?.map((tool) => ({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        })),
        tool_choice: connection.config.toolChoice || 'auto',
        max_response_output_tokens:
          connection.config.maxResponseOutputTokens === 'inf' ? null : connection.config.maxResponseOutputTokens,
      },
    };

    (connection.openaiService as any).send(openaiSession);

    // Send confirmation to client
    connection.ws.send(
      JSON.stringify({
        type: 'session.updated',
        session: connection.config,
        timestamp: new Date().toISOString(),
      })
    );
  } catch (error) {
    logger.error('Error updating session:', error);
    connection.ws.send(
      JSON.stringify({
        type: 'error',
        error: { message: 'Failed to update session' },
      })
    );
  }
}

async function handleCallInitiate(connection: RealtimeConnection, data: any): Promise<void> {
  try {
    const { phoneNumber } = data;

    if (!phoneNumber) {
      throw new Error('Phone number required');
    }

    // Initialize Twilio service
    // connection.twilioService = new TwilioService();

    // Make the outbound call - TODO: implement actual Twilio call
    const call = { sid: `call_${Date.now()}` };
    // const call = await connection.twilioService.makeOutboundCall(
    //   phoneNumber,
    //   connection.businessId,
    //   connection.config
    // );

    connection.callSid = call.sid;
    connection.phoneNumber = phoneNumber;

    // Send success response
    connection.ws.send(
      JSON.stringify({
        type: 'call.initiated',
        callSid: call.sid,
        phoneNumber,
        timestamp: new Date().toISOString(),
      })
    );

    // Log call
    await supabase.from('call_logs').insert({
      business_id: connection.businessId,
      call_sid: call.sid,
      phone_number: phoneNumber,
      direction: 'outbound',
      status: 'in-progress',
      duration: 0,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error initiating call:', error);
    connection.ws.send(
      JSON.stringify({
        type: 'error',
        error: { message: 'Failed to initiate call' },
      })
    );
  }
}

async function handleCallEnd(connection: RealtimeConnection): Promise<void> {
  try {
    if (connection.callSid && connection.twilioService) {
      // TODO: implement actual Twilio call ending
      // await connection.twilioService.endCall(connection.callSid);

      // Update call log
      await supabase
        .from('call_logs')
        .update({
          status: 'completed',
          ended_at: new Date().toISOString(),
        })
        .eq('call_sid', connection.callSid);
    }

    connection.ws.send(
      JSON.stringify({
        type: 'call.ended',
        timestamp: new Date().toISOString(),
      })
    );
  } catch (error) {
    logger.error('Error ending call:', error);
    connection.ws.send(
      JSON.stringify({
        type: 'error',
        error: { message: 'Failed to end call' },
      })
    );
  }
}

async function handleAudioAppend(connection: RealtimeConnection, audioBase64: string): Promise<void> {
  try {
    // Convert base64 to buffer
    const audioBuffer = Buffer.from(audioBase64, 'base64');

    // Convert audio format if needed
    let processedAudio = audioBuffer;
    if (connection.config.audioFormat === 'g711_ulaw') {
      processedAudio = await convertMulawToPCM16(audioBuffer);
    } else if (connection.config.audioFormat === 'g711_alaw') {
      processedAudio = await convertAlawToPCM16(audioBuffer);
    }

    // Send to OpenAI
    (connection.openaiService as any).send({
      type: 'input_audio_buffer.append',
      audio: processedAudio.toString('base64'),
    });
  } catch (error) {
    logger.error('Error appending audio:', error);
  }
}

async function handleAudioClear(connection: RealtimeConnection): Promise<void> {
  (connection.openaiService as any).send({
    type: 'input_audio_buffer.clear',
  });
}

async function handleAudioCommit(connection: RealtimeConnection): Promise<void> {
  (connection.openaiService as any).send({
    type: 'input_audio_buffer.commit',
  });
}

async function handleConversationItemCreate(connection: RealtimeConnection, item: any): Promise<void> {
  (connection.openaiService as any).send({
    type: 'conversation.item.create',
    item,
  });
}

async function handleResponseCreate(connection: RealtimeConnection, data: any): Promise<void> {
  (connection.openaiService as any).send({
    type: 'response.create',
    ...data,
  });
}

async function handleResponseCancel(connection: RealtimeConnection): Promise<void> {
  (connection.openaiService as any).send({
    type: 'response.cancel',
  });
}

function handleTranscriptionUpdate(connection: RealtimeConnection, message: any): void {
  // Store transcription in database if needed
  if (message.type === 'conversation.item.created' && message.item?.content) {
    (async () => {
      try {
        await supabase.from('call_transcripts').insert({
          call_sid: connection.callSid || connection.sessionId,
          business_id: connection.businessId,
          role: message.item.role,
          content: message.item.content[0]?.text || message.item.content[0]?.transcript || '',
          timestamp: new Date().toISOString(),
        });
        logger.debug('Transcription saved');
      } catch (error) {
        logger.error('Error saving transcription:', error);
      }
    })();
  }
}

function handleDisconnect(sessionId: string): void {
  const connection = connections.get(sessionId);
  if (connection) {
    // Clean up OpenAI connection
    if (connection.openaiService) {
      connection.openaiService.disconnect();
    }

    // End call if active
    if (connection.callSid && connection.twilioService) {
      // TODO: implement actual Twilio call ending
      // connection.twilioService.endCall(connection.callSid).catch(error => {
      //   logger.error('Error ending call on disconnect:', error);
      // });
    }

    connections.delete(sessionId);
    logger.info(`Session ${sessionId} disconnected and cleaned up`);
  }
}

// Audio conversion utilities
async function convertMulawToPCM16(mulawBuffer: Buffer): Promise<Buffer<ArrayBuffer>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const inputStream = new PassThrough();

    inputStream.end(mulawBuffer);

    (ffmpeg as any)(inputStream)
      .inputFormat('mulaw')
      .inputOptions(['-ar 8000'])
      .outputFormat('s16le')
      .outputOptions(['-ar 24000']) // OpenAI Realtime API expects 24kHz PCM16
      .on('error', reject)
      .on('end', () => {
        resolve(Buffer.concat(chunks));
      })
      .pipe()
      .on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });
  });
}

async function convertAlawToPCM16(alawBuffer: Buffer): Promise<Buffer<ArrayBuffer>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const inputStream = new PassThrough();

    inputStream.end(alawBuffer);

    (ffmpeg as any)(inputStream)
      .inputFormat('alaw')
      .inputOptions(['-ar 8000'])
      .outputFormat('s16le')
      .outputOptions(['-ar 24000']) // OpenAI Realtime API expects 24kHz PCM16
      .on('error', reject)
      .on('end', () => {
        resolve(Buffer.concat(chunks));
      })
      .pipe()
      .on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });
  });
}
