import WebSocket from 'ws';
import { exec } from 'child_process';
import { promisify } from 'util';
import logger from '../utils/logger';

const execAsync = promisify(exec);

interface OpenAIRealtimeConfig {
  voice: string;
  systemPrompt?: string;
  temperature?: number;
  onTranscription: (role: string, content: string) => void;
  onError: (error: string) => void;
}

export class OpenAIRealtimeService {
  private ws?: WebSocket;
  private config: OpenAIRealtimeConfig;
  private isConnected: boolean = false;
  private isMuted: boolean = false;
  private audioBuffer: Buffer[] = [];
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 3;

  constructor(config: OpenAIRealtimeConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OpenAI API key not configured');
      }

      this.ws = new WebSocket('wss://api.openai.com/v1/realtime', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'OpenAI-Beta': 'realtime=v1'
        }
      });

      return new Promise((resolve, reject) => {
        this.ws!.on('open', () => {
          logger.info('Connected to OpenAI Realtime API');
          this.isConnected = true;
          this.setupSession();
          resolve();
        });

        this.ws!.on('message', (data: Buffer) => {
          this.handleMessage(data);
        });

        this.ws!.on('error', (error) => {
          logger.error('OpenAI Realtime WebSocket error:', error);
          this.config.onError('Connection error with AI service');
          reject(error);
        });

        this.ws!.on('close', () => {
          logger.info('OpenAI Realtime connection closed');
          this.isConnected = false;
          this.handleReconnect();
        });
      });
    } catch (error) {
      logger.error('Failed to connect to OpenAI Realtime:', error);
      throw error;
    }
  }

  private setupSession(): void {
    if (!this.ws || !this.isConnected) return;

    const sessionConfig = {
      type: 'session.update',
      session: {
        voice: this.config.voice,
        instructions: this.config.systemPrompt || 'You are a helpful AI assistant.',
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: {
          enabled: true,
          model: 'whisper-1'
        },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500
        },
        temperature: this.config.temperature || 0.8,
        max_output_tokens: 4096
      }
    };

    this.ws.send(JSON.stringify(sessionConfig));
    logger.info('OpenAI session configured');
  }

  async sendAudio(base64Audio: string): Promise<void> {
    if (!this.isConnected || !this.ws || this.isMuted) return;

    try {
      // Convert μ-law to PCM16
      const pcm16Audio = await this.convertMulawToPCM16(base64Audio);

      // Send audio to OpenAI
      this.ws.send(JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: pcm16Audio.toString('base64')
      }));

    } catch (error) {
      logger.error('Error sending audio to OpenAI:', error);
    }
  }

  private async convertMulawToPCM16(base64Audio: string): Promise<Buffer> {
    const mulawBuffer = Buffer.from(base64Audio, 'base64');

    // Use FFmpeg to convert μ-law to PCM16
    const inputPath = `/tmp/input-${Date.now()}.raw`;
    const outputPath = `/tmp/output-${Date.now()}.raw`;

    require('fs').writeFileSync(inputPath, mulawBuffer);

    await execAsync(
      `ffmpeg -f mulaw -ar 8000 -i ${inputPath} -f s16le -ar 16000 ${outputPath}`
    );

    const pcm16Buffer = require('fs').readFileSync(outputPath);

    // Clean up temp files
    require('fs').unlinkSync(inputPath);
    require('fs').unlinkSync(outputPath);

    return pcm16Buffer;
  }

  private handleMessage(data: Buffer): void {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'conversation.item.created':
          if (message.item && message.item.role && message.item.content) {
            const content = message.item.content[0]?.text || '';
            if (content) {
              this.config.onTranscription(
                message.item.role === 'user' ? 'user' : 'assistant',
                content
              );
            }
          }
          break;

        case 'audio.delta':
          // Handle audio output from OpenAI
          if (message.audio) {
            this.audioBuffer.push(Buffer.from(message.audio, 'base64'));
          }
          break;

        case 'audio.done':
          // Process complete audio response
          this.processAudioOutput();
          break;

        case 'error':
          logger.error('OpenAI Realtime error:', message.error);
          this.config.onError(message.error?.message || 'Unknown error');
          break;

        case 'session.created':
        case 'session.updated':
          logger.info('Session event:', message.type);
          break;

        default:
          logger.debug('Unhandled OpenAI message type:', message.type);
      }
    } catch (error) {
      logger.error('Error handling OpenAI message:', error);
    }
  }

  private async processAudioOutput(): Promise<void> {
    if (this.audioBuffer.length === 0) return;

    try {
      // Combine audio buffers
      const combinedAudio = Buffer.concat(this.audioBuffer);
      this.audioBuffer = [];

      // Convert PCM16 back to μ-law for Twilio
      const mulawAudio = await this.convertPCM16ToMulaw(combinedAudio);

      // This would be sent back through Twilio stream
      // Implementation depends on Twilio integration

    } catch (error) {
      logger.error('Error processing audio output:', error);
    }
  }

  private async convertPCM16ToMulaw(pcm16Buffer: Buffer): Promise<Buffer> {
    const inputPath = `/tmp/input-${Date.now()}.raw`;
    const outputPath = `/tmp/output-${Date.now()}.raw`;

    require('fs').writeFileSync(inputPath, pcm16Buffer);

    await execAsync(
      `ffmpeg -f s16le -ar 16000 -i ${inputPath} -f mulaw -ar 8000 ${outputPath}`
    );

    const mulawBuffer = require('fs').readFileSync(outputPath);

    // Clean up temp files
    require('fs').unlinkSync(inputPath);
    require('fs').unlinkSync(outputPath);

    return mulawBuffer;
  }

  private async handleReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached');
      this.config.onError('Connection lost. Please try again.');
      return;
    }

    this.reconnectAttempts++;
    logger.info(`Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);

    setTimeout(async () => {
      try {
        await this.connect();
        this.reconnectAttempts = 0;
      } catch (error) {
        logger.error('Reconnection failed:', error);
        this.handleReconnect();
      }
    }, Math.pow(2, this.reconnectAttempts) * 1000);
  }

  setMuted(muted: boolean): void {
    this.isMuted = muted;
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }
    this.isConnected = false;
  }
}