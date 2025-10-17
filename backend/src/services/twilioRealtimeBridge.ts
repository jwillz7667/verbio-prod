/**
 * Twilio-OpenAI Realtime API Bridge
 * Handles bidirectional audio streaming between Twilio Media Streams and OpenAI Realtime API
 * Implements best practices for WebSocket management, audio processing, and error recovery
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { ChildProcessWithoutNullStreams } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs';
import Logger from '../utils/logger';
import { OpenAIRealtimeService } from './openaiRealtimeService';
import { Tool, Response } from '../types/openaiRealtimeEvents';
import { supabaseAdmin } from '../config/supabase';

const logger = Logger;

// Twilio Media Stream Event Types
interface TwilioMediaEvent {
  event: 'connected' | 'start' | 'media' | 'stop' | 'mark' | 'clear';
  sequenceNumber?: string;
  media?: {
    track: 'inbound' | 'outbound' | 'both_tracks';
    chunk: string;
    timestamp: string;
    payload: string; // base64 μ-law audio
  };
  start?: {
    streamSid: string;
    accountSid: string;
    callSid: string;
    customParameters?: Record<string, string>;
  };
  stop?: {
    accountSid: string;
    callSid: string;
  };
  mark?: {
    name: string;
  };
  streamSid?: string;
}

interface BridgeConfig {
  businessId: string;
  agentId?: string;
  customerPhone: string;
  twilioStreamSid?: string;
  twilioCallSid?: string;
  callId?: string;
  direction?: 'inbound' | 'outbound';
  voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' | 'cedar' | 'marin';
  systemPrompt?: string;
  tools?: Tool[];
}

interface AudioBuffer {
  inbound: Buffer[];
  outbound: Buffer[];
  processingQueue: Array<{ timestamp: number; data: Buffer }>;
}

export class TwilioOpenAIRealtimeBridge extends EventEmitter {
  private twilioWs: WebSocket | null = null;

  private openaiService: OpenAIRealtimeService | null = null;

  private config: BridgeConfig;

  private sessionId: string;

  private audioBuffer: AudioBuffer;

  private isConnected: boolean = false;

  private streamSid?: string;

  private callSid?: string;

  private ffmpegProcesses: Map<string, ChildProcessWithoutNullStreams> = new Map();

  private lastActivityTime: number = Date.now();

  private activityTimeout?: NodeJS.Timeout;

  private reconnectAttempts: number = 0;

  private maxReconnectAttempts: number = 3;

  private metrics: {
    packetsReceived: number;
    packetsSent: number;
    bytesReceived: number;
    bytesSent: number;
    startTime: number;
    errors: number;
  };

  private sequenceTracker: Map<string, number> = new Map();

  private tempDir: string;

  constructor(config: BridgeConfig) {
    super();
    this.config = config;
    this.sessionId = uuidv4();
    this.audioBuffer = {
      inbound: [],
      outbound: [],
      processingQueue: [],
    };
    this.metrics = {
      packetsReceived: 0,
      packetsSent: 0,
      bytesReceived: 0,
      bytesSent: 0,
      startTime: Date.now(),
      errors: 0,
    };
    this.tempDir = path.join('/tmp', 'twilio-openai-bridge', this.sessionId);
    this.ensureTempDirectory();
  }

  private ensureTempDirectory(): void {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Initialize the bridge with both Twilio and OpenAI connections
   */
  async initialize(twilioWs: WebSocket): Promise<void> {
    try {
      this.twilioWs = twilioWs;

      // Setup Twilio WebSocket handlers
      this.setupTwilioHandlers();

      // Initialize OpenAI Realtime connection
      await this.connectToOpenAI();

      // Setup activity monitoring
      this.startActivityMonitoring();

      this.isConnected = true;
      logger.info('Bridge initialized successfully', {
        sessionId: this.sessionId,
        businessId: this.config.businessId,
        callId: this.config.callId,
        direction: this.config.direction,
      });

      this.emit('initialized', { sessionId: this.sessionId });
    } catch (error) {
      logger.error('Failed to initialize bridge', { error, sessionId: this.sessionId });
      throw error;
    }
  }

  /**
   * Setup Twilio WebSocket event handlers
   */
  private setupTwilioHandlers(): void {
    if (!this.twilioWs) return;

    this.twilioWs.on('message', async (data: Buffer) => {
      this.updateActivity();

      try {
        const message = JSON.parse(data.toString()) as TwilioMediaEvent;
        await this.handleTwilioEvent(message);
      } catch (error) {
        logger.error('Error processing Twilio message', {
          error,
          sessionId: this.sessionId,
        });
        this.metrics.errors++;
      }
    });

    this.twilioWs.on('close', (code: number, reason: Buffer) => {
      logger.info('Twilio WebSocket closed', {
        code,
        reason: reason?.toString(),
        sessionId: this.sessionId,
      });
      this.handleDisconnection('twilio');
    });

    this.twilioWs.on('error', (error: Error) => {
      logger.error('Twilio WebSocket error', {
        error: error.message,
        sessionId: this.sessionId,
      });
      this.metrics.errors++;
      this.emit('error', { source: 'twilio', error });
    });

    this.twilioWs.on('ping', () => {
      this.twilioWs?.pong();
    });
  }

  /**
   * Handle Twilio Media Stream events
   */
  private async handleTwilioEvent(event: TwilioMediaEvent): Promise<void> {
    switch (event.event) {
      case 'connected':
        logger.info('Twilio Media Stream connected', {
          sessionId: this.sessionId,
        });
        break;

      case 'start':
        if (event.start) {
          this.streamSid = event.start.streamSid;
          this.callSid = event.start.callSid;
        }
        logger.info('Twilio stream started', {
          streamSid: this.streamSid,
          callSid: this.callSid,
          sessionId: this.sessionId,
          callId: this.config.callId,
          direction: this.config.direction,
        });
        await this.logCallStart();
        break;

      case 'media':
        if (event.media) {
          await this.processTwilioAudio(event.media);
        }
        break;

      case 'stop':
        logger.info('Twilio stream stopped', {
          sessionId: this.sessionId,
        });
        await this.handleStreamStop();
        break;

      case 'mark':
        logger.debug('Twilio mark event', {
          name: event.mark?.name,
          sessionId: this.sessionId,
        });
        break;

      case 'clear':
        logger.info('Twilio clear event - clearing audio buffers', {
          sessionId: this.sessionId,
        });
        this.clearAudioBuffers();
        this.openaiService?.clearAudioBuffer();
        break;
    }
  }

  /**
   * Process incoming Twilio audio (μ-law 8kHz) and send to OpenAI
   */
  private async processTwilioAudio(media: TwilioMediaEvent['media']): Promise<void> {
    if (!media || !this.openaiService || !this.isConnected) return;

    try {
      const sequenceNumber = parseInt(media.timestamp, 10);
      const { track } = media;

      // Track sequence for packet loss detection
      const lastSequence = this.sequenceTracker.get(track) || -1;
      if (lastSequence >= 0 && sequenceNumber !== lastSequence + 1) {
        const lostPackets = sequenceNumber - lastSequence - 1;
        if (lostPackets > 0) {
          logger.warn('Packet loss detected', {
            track,
            lost: lostPackets,
            sessionId: this.sessionId,
          });
        }
      }
      this.sequenceTracker.set(track, sequenceNumber);

      // Only process inbound audio (from caller)
      if (track === 'inbound' || track === 'both_tracks') {
        this.metrics.packetsReceived++;
        this.metrics.bytesReceived += media.payload.length;

        // Send audio to OpenAI for processing
        await this.openaiService.sendAudio(media.payload);

        // Buffer for potential recovery
        const audioBuffer = Buffer.from(media.payload, 'base64');
        this.audioBuffer.inbound.push(audioBuffer);

        // Keep buffer size manageable (last 10 seconds at 50 packets/sec)
        if (this.audioBuffer.inbound.length > 500) {
          this.audioBuffer.inbound.shift();
        }
      }
    } catch (error) {
      logger.error('Error processing Twilio audio', {
        error,
        sessionId: this.sessionId,
      });
      this.metrics.errors++;
    }
  }

  /**
   * Connect to OpenAI Realtime API
   */
  private async connectToOpenAI(): Promise<void> {
    const openaiConfig = {
      voice: this.config.voice || 'cedar',
      systemPrompt: this.config.systemPrompt || 'You are a helpful AI assistant.',
      tools: this.config.tools || [],
      onTranscription: this.handleTranscription.bind(this),
      onError: this.handleOpenAIError.bind(this),
      onAudioData: this.handleOpenAIAudio.bind(this),
      onFunctionCall: this.handleFunctionCall.bind(this),
      onSessionCreated: this.handleSessionCreated.bind(this),
      onSpeechStarted: this.handleSpeechStarted.bind(this),
      onSpeechStopped: this.handleSpeechStopped.bind(this),
      onResponseComplete: this.handleResponseComplete.bind(this),
    };

    this.openaiService = new OpenAIRealtimeService(openaiConfig);
    await this.openaiService.connect();
  }

  /**
   * Handle transcriptions from OpenAI
   */
  private handleTranscription(role: string, content: string): void {
    logger.info('Transcription', {
      role,
      content,
      sessionId: this.sessionId,
    });

    this.emit('transcription', { role, content, sessionId: this.sessionId });

    // Store transcription in database
    this.storeTranscription(role, content).catch((error) => {
      logger.error('Failed to store transcription', { error });
    });
  }

  /**
   * Handle audio from OpenAI (PCM 16kHz) and send to Twilio
   */
  private async handleOpenAIAudio(audioData: Buffer): Promise<void> {
    if (!this.twilioWs || this.twilioWs.readyState !== WebSocket.OPEN) return;

    try {
      // Audio from OpenAI is already converted to μ-law by OpenAIRealtimeService
      const base64Audio = audioData.toString('base64');

      const twilioMessage = {
        event: 'media',
        streamSid: this.streamSid,
        media: {
          payload: base64Audio,
        },
      };

      this.twilioWs.send(JSON.stringify(twilioMessage));

      this.metrics.packetsSent++;
      this.metrics.bytesSent += base64Audio.length;
    } catch (error) {
      logger.error('Error sending audio to Twilio', {
        error,
        sessionId: this.sessionId,
      });
      this.metrics.errors++;
    }
  }

  /**
   * Handle OpenAI errors
   */
  private handleOpenAIError(error: string): void {
    logger.error('OpenAI error', {
      error,
      sessionId: this.sessionId,
    });
    this.metrics.errors++;
    this.emit('error', { source: 'openai', error });

    // Send clear message to Twilio to reset audio
    if (this.twilioWs?.readyState === WebSocket.OPEN) {
      this.twilioWs.send(
        JSON.stringify({
          event: 'clear',
          streamSid: this.streamSid,
        })
      );
    }
  }

  /**
   * Handle function calls from OpenAI
   */
  private async handleFunctionCall(name: string, args: unknown): Promise<unknown> {
    logger.info('Function call', {
      name,
      args,
      sessionId: this.sessionId,
    });

    // Implement function handling based on your business logic
    // This is where you'd handle orders, payments, etc.

    this.emit('functionCall', { name, args, sessionId: this.sessionId });

    // Return result to OpenAI
    return { success: true, message: 'Function executed successfully' };
  }

  /**
   * Handle OpenAI session creation
   */
  private handleSessionCreated(openaiSessionId: string): void {
    logger.info('OpenAI session created', {
      openaiSessionId,
      sessionId: this.sessionId,
    });
  }

  /**
   * Handle speech detection events
   */
  private handleSpeechStarted(): void {
    // Optionally interrupt Twilio playback
    if (this.twilioWs?.readyState === WebSocket.OPEN) {
      this.twilioWs.send(
        JSON.stringify({
          event: 'clear',
          streamSid: this.streamSid,
        })
      );
    }
  }

  private handleSpeechStopped(): void {
    // Speech stopped, ready for response
  }

  /**
   * Handle response completion from OpenAI
   */
  private handleResponseComplete(response: Response): void {
    logger.info('OpenAI response complete', {
      responseId: response.id,
      status: response.status,
      sessionId: this.sessionId,
    });

    // Send mark to Twilio to indicate response completion
    if (this.twilioWs?.readyState === WebSocket.OPEN) {
      this.twilioWs.send(
        JSON.stringify({
          event: 'mark',
          streamSid: this.streamSid,
          mark: {
            name: `response_${response.id}`,
          },
        })
      );
    }
  }

  /**
   * Handle disconnection and cleanup
   */
  private async handleDisconnection(source: 'twilio' | 'openai'): Promise<void> {
    logger.info('Handling disconnection', {
      source,
      sessionId: this.sessionId,
    });

    if (source === 'twilio' && this.reconnectAttempts < this.maxReconnectAttempts) {
      // Twilio disconnected but we might be able to recover
      this.reconnectAttempts++;
      this.emit('reconnecting', { attempt: this.reconnectAttempts });

      // Wait briefly for potential reconnection
      setTimeout(() => {
        if (!this.isConnected) {
          this.disconnect();
        }
      }, 5000);
    } else {
      // Full disconnection
      await this.disconnect();
    }
  }

  /**
   * Handle stream stop event
   */
  private async handleStreamStop(): Promise<void> {
    await this.logCallEnd();
    await this.disconnect();
  }

  /**
   * Clear audio buffers
   */
  private clearAudioBuffers(): void {
    this.audioBuffer.inbound = [];
    this.audioBuffer.outbound = [];
    this.audioBuffer.processingQueue = [];
  }

  /**
   * Activity monitoring to detect stale connections
   */
  private startActivityMonitoring(): void {
    this.activityTimeout = setInterval(() => {
      const inactiveTime = Date.now() - this.lastActivityTime;
      if (inactiveTime > 120000) {
        // 2 minutes of inactivity
        logger.warn('Connection inactive, initiating cleanup', {
          sessionId: this.sessionId,
        });
        this.disconnect();
      }
    }, 30000);
  }

  private updateActivity(): void {
    this.lastActivityTime = Date.now();
  }

  /**
   * Database operations
   */
  private async logCallStart(): Promise<void> {
    if (!this.callSid) return;

    try {
      await supabaseAdmin.from('call_logs').upsert({
        call_sid: this.callSid,
        business_id: this.config.businessId,
        agent_id: this.config.agentId,
        from_number: this.config.customerPhone,
        to_number: this.config.businessId,
        status: 'in-progress',
        metadata: {
          sessionId: this.sessionId,
          streamSid: this.streamSid,
        },
      });
    } catch (error) {
      logger.error('Failed to log call start', { error });
    }
  }

  private async logCallEnd(): Promise<void> {
    if (!this.callSid) return;

    try {
      const duration = Math.floor((Date.now() - this.metrics.startTime) / 1000);

      await supabaseAdmin
        .from('call_logs')
        .update({
          status: 'completed',
          duration,
          metadata: {
            sessionId: this.sessionId,
            metrics: this.getMetrics(),
          },
        })
        .eq('call_sid', this.callSid);
    } catch (error) {
      logger.error('Failed to log call end', { error });
    }
  }

  private async storeTranscription(role: string, text: string): Promise<void> {
    if (!this.callSid) return;

    try {
      await supabaseAdmin.from('transcripts').insert({
        call_id: this.callSid,
        business_id: this.config.businessId,
        speaker: role === 'user' ? 'customer' : 'agent',
        text,
        timestamp: Date.now(),
        metadata: {
          sessionId: this.sessionId,
        },
      });
    } catch (error) {
      logger.error('Failed to store transcription', { error });
    }
  }

  /**
   * Get metrics for monitoring
   */
  getMetrics() {
    const duration = (Date.now() - this.metrics.startTime) / 1000;
    return {
      ...this.metrics,
      duration,
      packetsPerSecond: this.metrics.packetsReceived / duration,
      errorRate: this.metrics.errors / this.metrics.packetsReceived,
    };
  }

  /**
   * Graceful shutdown
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected) return;

    this.isConnected = false;

    logger.info('Disconnecting bridge', {
      sessionId: this.sessionId,
      metrics: this.getMetrics(),
    });

    // Clear timers
    if (this.activityTimeout) {
      clearInterval(this.activityTimeout);
    }

    // Close OpenAI connection
    if (this.openaiService) {
      this.openaiService.disconnect();
      this.openaiService = null;
    }

    // Close Twilio connection
    if (this.twilioWs?.readyState === WebSocket.OPEN) {
      this.twilioWs.close(1000, 'Bridge disconnecting');
    }
    this.twilioWs = null;

    // Clean up FFmpeg processes
    for (const [, process] of this.ffmpegProcesses) {
      process.kill('SIGTERM');
    }
    this.ffmpegProcesses.clear();

    // Clean up temp files
    this.cleanupTempFiles();

    // Clear buffers
    this.clearAudioBuffers();
    this.sequenceTracker.clear();

    this.emit('disconnected', {
      sessionId: this.sessionId,
      metrics: this.getMetrics(),
    });
  }

  private cleanupTempFiles(): void {
    try {
      if (fs.existsSync(this.tempDir)) {
        fs.rmSync(this.tempDir, { recursive: true, force: true });
      }
    } catch (error) {
      logger.error('Error cleaning up temp files', { error });
    }
  }
}
