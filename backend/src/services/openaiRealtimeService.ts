import WebSocket from 'ws';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import Logger from '../utils/logger';
const logger = Logger;
import {
  RealtimeServerEvent,
  RealtimeClientEvent,
  SessionUpdateEvent,
  InputAudioBufferAppendEvent,
  ResponseCreateEvent,
  ErrorEvent,
  SessionCreatedEvent,
  SessionUpdatedEvent,
  ConversationItemCreatedEvent,
  ResponseAudioDeltaEvent,
  ResponseAudioDoneEvent,
  ResponseAudioTranscriptDeltaEvent,
  ResponseAudioTranscriptDoneEvent,
  ResponseTextDeltaEvent,
  ResponseTextDoneEvent,
  ResponseFunctionCallArgumentsDoneEvent,
  ResponseDoneEvent,
  InputAudioBufferSpeechStartedEvent,
  InputAudioBufferSpeechStoppedEvent,
  InputAudioBufferCommittedEvent,
  ConversationItemInputAudioTranscriptionCompletedEvent,
  Tool,
  RateLimitsUpdatedEvent,
  ResponseCreatedEvent,
  ResponseOutputItemAddedEvent,
  ResponseOutputItemDoneEvent,
  ResponseContentPartAddedEvent,
  ResponseContentPartDoneEvent,
  ConversationItemTruncatedEvent,
  ConversationItemDeletedEvent,
  InputAudioBufferClearedEvent,
  ConversationItemInputAudioTranscriptionFailedEvent,
  ResponseFunctionCallArgumentsDeltaEvent,
  Response,
} from '../types/openaiRealtimeEvents';

const execAsync = promisify(exec);

interface OpenAIRealtimeConfig {
  voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' | 'cedar' | 'marin';
  systemPrompt?: string;
  temperature?: number;
  tools?: Tool[];
  onTranscription?: (role: string, content: string) => void;
  onError?: (error: string) => void;
  onAudioData?: (audio: Buffer) => void;
  onFunctionCall?: (name: string, args: unknown) => Promise<unknown>;
  onSessionCreated?: (sessionId: string) => void;
  onSpeechStarted?: () => void;
  onSpeechStopped?: () => void;
  onResponseComplete?: (response: Response) => void;
}

export class OpenAIRealtimeService {
  private ws?: WebSocket;

  private config: OpenAIRealtimeConfig;

  private isConnected: boolean = false;

  private isMuted: boolean = false;

  private audioBuffer: Buffer[] = [];

  private reconnectAttempts: number = 0;

  private maxReconnectAttempts: number = 3;

  private sessionId?: string;

  private responseInProgress: boolean = false;

  private currentResponseId?: string;

  private textBuffer: string = '';

  private transcriptBuffer: string = '';

  private functionCallBuffer: Map<string, string> = new Map();

  private rateLimits: Map<string, { limit: number; remaining: number; resetAt: Date }> = new Map();

  private heartbeatInterval?: NodeJS.Timeout;

  private lastEventTime: number = Date.now();

  private tempDir: string = path.join('/tmp', 'openai-realtime');

  constructor(config: OpenAIRealtimeConfig) {
    this.config = config;
    this.ensureTempDirectory();
  }

  private ensureTempDirectory(): void {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  async connect(): Promise<void> {
    try {
      const apiKey = process.env['OPENAI_API_KEY'];
      if (!apiKey) {
        throw new Error('OpenAI API key not configured');
      }

      const url = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17';

      this.ws = new WebSocket(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      });

      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.ws?.close();
          reject(new Error('Connection timeout after 30 seconds'));
        }, 30000);

        if (!this.ws) return reject(new Error('WebSocket not initialized'));

        this.ws.on('open', () => {
          clearTimeout(timeout);
          logger.info('Connected to OpenAI Realtime API');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.setupHeartbeat();
          resolve();
        });

        this.ws.on('message', (data: Buffer) => {
          this.lastEventTime = Date.now();
          this.handleMessage(data);
        });

        this.ws.on('error', (error: Error) => {
          clearTimeout(timeout);
          logger.error('OpenAI Realtime WebSocket error:', error);
          this.config.onError?.(`Connection error: ${error.message}`);
          reject(error);
        });

        this.ws.on('close', (code: number, reason: Buffer) => {
          clearTimeout(timeout);
          logger.info(`OpenAI Realtime connection closed: ${code} - ${reason.toString()}`);
          this.isConnected = false;
          this.clearHeartbeat();
          void this.handleReconnect();
        });

        this.ws.on('ping', () => {
          this.ws?.pong();
        });
      });
    } catch (error) {
      logger.error('Failed to connect to OpenAI Realtime:', error);
      throw error;
    }
  }

  private setupHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
        const timeSinceLastEvent = Date.now() - this.lastEventTime;
        if (timeSinceLastEvent > 60000) {
          logger.warn('No events received for 60 seconds, sending ping');
          this.ws.ping();
        }
      }
    }, 30000);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      delete this.heartbeatInterval;
    }
  }

  async setupSession(): Promise<void> {
    if (!this.ws || !this.isConnected) {
      throw new Error('WebSocket not connected');
    }

    const sessionConfig: SessionUpdateEvent = {
      type: 'session.update',
      event_id: this.generateEventId(),
      session: {
        modalities: ['text', 'audio'],
        voice: this.config.voice,
        instructions: this.config.systemPrompt || 'You are a helpful AI assistant.',
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: {
          enabled: true,
          model: 'whisper-1',
        },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
          create_response: true,
        },
        tools: this.config.tools || [],
        tool_choice: this.config.tools?.length ? 'auto' : 'none',
        max_response_output_tokens: 4096,
      },
    };

    this.sendEvent(sessionConfig);
    logger.info('Session configuration sent');
  }

  private sendEvent(event: RealtimeClientEvent): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.error('Cannot send event: WebSocket not open');
      return;
    }

    try {
      this.ws.send(JSON.stringify(event));
      logger.debug(`Sent event: ${event.type}`);
    } catch (error) {
      logger.error(`Error sending event ${event.type}:`, error);
    }
  }

  async sendAudio(base64Audio: string): Promise<void> {
    if (!this.isConnected || !this.ws || this.isMuted) return;

    try {
      const pcm16Audio = await this.convertMulawToPCM16(base64Audio);

      const audioEvent: InputAudioBufferAppendEvent = {
        type: 'input_audio_buffer.append',
        event_id: this.generateEventId(),
        audio: pcm16Audio.toString('base64'),
      };

      this.sendEvent(audioEvent);
    } catch (error) {
      logger.error('Error sending audio to OpenAI:', error);
    }
  }

  async sendText(text: string): Promise<void> {
    if (!this.isConnected || !this.ws) return;

    try {
      const createEvent: RealtimeClientEvent = {
        type: 'conversation.item.create',
        event_id: this.generateEventId(),
        item: {
          id: this.generateEventId(),
          object: 'conversation.item',
          type: 'message',
          role: 'user',
          content: [{
            type: 'input_text',
            text,
          }],
        },
      };

      this.sendEvent(createEvent);

      const responseEvent: ResponseCreateEvent = {
        type: 'response.create',
        event_id: this.generateEventId(),
        commit: true,
      };

      this.sendEvent(responseEvent);
    } catch (error) {
      logger.error('Error sending text to OpenAI:', error);
    }
  }

  private async convertMulawToPCM16(base64Audio: string): Promise<Buffer> {
    const mulawBuffer = Buffer.from(base64Audio, 'base64');
    const inputPath = path.join(this.tempDir, `input-${uuidv4()}.raw`);
    const outputPath = path.join(this.tempDir, `output-${uuidv4()}.raw`);

    try {
      fs.writeFileSync(inputPath, mulawBuffer);

      await execAsync(
        `ffmpeg -f mulaw -ar 8000 -i ${inputPath} -f s16le -ar 16000 ${outputPath} -y -loglevel error`,
      );

      const pcm16Buffer = fs.readFileSync(outputPath);

      fs.unlinkSync(inputPath);
      fs.unlinkSync(outputPath);

      return pcm16Buffer;
    } catch (error) {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      throw error;
    }
  }

  private async convertPCM16ToMulaw(pcm16Buffer: Buffer): Promise<Buffer> {
    const inputPath = path.join(this.tempDir, `input-${uuidv4()}.raw`);
    const outputPath = path.join(this.tempDir, `output-${uuidv4()}.raw`);

    try {
      fs.writeFileSync(inputPath, pcm16Buffer);

      await execAsync(
        `ffmpeg -f s16le -ar 16000 -i ${inputPath} -f mulaw -ar 8000 ${outputPath} -y -loglevel error`,
      );

      const mulawBuffer = fs.readFileSync(outputPath);

      fs.unlinkSync(inputPath);
      fs.unlinkSync(outputPath);

      return mulawBuffer;
    } catch (error) {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      throw error;
    }
  }

  private handleMessage(data: Buffer): void {
    try {
      const event = JSON.parse(data.toString()) as RealtimeServerEvent;
      logger.debug(`Received event: ${event.type}`);

      switch (event.type) {
        case 'error':
          this.handleError(event as ErrorEvent);
          break;

        case 'session.created':
          this.handleSessionCreated(event as SessionCreatedEvent);
          break;

        case 'session.updated':
          this.handleSessionUpdated(event as SessionUpdatedEvent);
          break;

        case 'conversation.created':
          logger.info('Conversation created');
          break;

        case 'conversation.item.created':
          this.handleConversationItemCreated(event as ConversationItemCreatedEvent);
          break;

        case 'conversation.item.input_audio_transcription.completed':
          this.handleInputAudioTranscriptionCompleted(event as ConversationItemInputAudioTranscriptionCompletedEvent);
          break;

        case 'conversation.item.input_audio_transcription.failed':
          this.handleInputAudioTranscriptionFailed(event as ConversationItemInputAudioTranscriptionFailedEvent);
          break;

        case 'conversation.item.truncated':
          this.handleConversationItemTruncated(event as ConversationItemTruncatedEvent);
          break;

        case 'conversation.item.deleted':
          this.handleConversationItemDeleted(event as ConversationItemDeletedEvent);
          break;

        case 'input_audio_buffer.committed':
          this.handleInputAudioBufferCommitted(event as InputAudioBufferCommittedEvent);
          break;

        case 'input_audio_buffer.cleared':
          this.handleInputAudioBufferCleared(event as InputAudioBufferClearedEvent);
          break;

        case 'input_audio_buffer.speech_started':
          this.handleSpeechStarted(event as InputAudioBufferSpeechStartedEvent);
          break;

        case 'input_audio_buffer.speech_stopped':
          this.handleSpeechStopped(event as InputAudioBufferSpeechStoppedEvent);
          break;

        case 'response.created':
          this.handleResponseCreated(event as ResponseCreatedEvent);
          break;

        case 'response.done':
          this.handleResponseDone(event as ResponseDoneEvent);
          break;

        case 'response.output_item.added':
          this.handleResponseOutputItemAdded(event as ResponseOutputItemAddedEvent);
          break;

        case 'response.output_item.done':
          this.handleResponseOutputItemDone(event as ResponseOutputItemDoneEvent);
          break;

        case 'response.content_part.added':
          this.handleResponseContentPartAdded(event as ResponseContentPartAddedEvent);
          break;

        case 'response.content_part.done':
          this.handleResponseContentPartDone(event as ResponseContentPartDoneEvent);
          break;

        case 'response.text.delta':
          this.handleTextDelta(event as ResponseTextDeltaEvent);
          break;

        case 'response.text.done':
          this.handleTextDone(event as ResponseTextDoneEvent);
          break;

        case 'response.audio.delta':
          this.handleAudioDelta(event as ResponseAudioDeltaEvent);
          break;

        case 'response.audio.done':
          this.handleAudioDone(event as ResponseAudioDoneEvent);
          break;

        case 'response.audio_transcript.delta':
          this.handleAudioTranscriptDelta(event as ResponseAudioTranscriptDeltaEvent);
          break;

        case 'response.audio_transcript.done':
          this.handleAudioTranscriptDone(event as ResponseAudioTranscriptDoneEvent);
          break;

        case 'response.function_call_arguments.delta':
          this.handleFunctionCallArgumentsDelta(event as ResponseFunctionCallArgumentsDeltaEvent);
          break;

        case 'response.function_call_arguments.done':
          this.handleFunctionCallArgumentsDone(event as ResponseFunctionCallArgumentsDoneEvent);
          break;

        case 'rate_limits.updated':
          this.handleRateLimitsUpdated(event as RateLimitsUpdatedEvent);
          break;

        default:
          logger.debug(`Unhandled event type: ${(event as RealtimeServerEvent).type}`);
      }
    } catch (error) {
      logger.error('Error handling OpenAI message:', error);
    }
  }

  private handleError(event: ErrorEvent): void {
    logger.error('OpenAI Realtime error:', event.error);
    this.config.onError?.(event.error.message);

    if (event.error.code === 'session_expired') {
      void this.reconnect();
    }
  }

  private handleSessionCreated(event: SessionCreatedEvent): void {
    this.sessionId = event.session.id;
    logger.info(`Session created: ${this.sessionId}`);
    this.config.onSessionCreated?.(this.sessionId);
    void this.setupSession();
  }

  private handleSessionUpdated(_event: SessionUpdatedEvent): void {
    logger.info('Session updated successfully');
  }

  private handleConversationItemCreated(event: ConversationItemCreatedEvent): void {
    if (event.item.role === 'assistant' && event.item.content) {
      for (const content of event.item.content) {
        if (content.type === 'text' && content.text) {
          this.config.onTranscription?.('assistant', content.text);
        }
      }
    }
  }

  private handleInputAudioTranscriptionCompleted(event: ConversationItemInputAudioTranscriptionCompletedEvent): void {
    if (event.transcript) {
      this.config.onTranscription?.('user', event.transcript);
    }
  }

  private handleInputAudioTranscriptionFailed(event: ConversationItemInputAudioTranscriptionFailedEvent): void {
    logger.error('Audio transcription failed:', event.error);
  }

  private handleConversationItemTruncated(event: ConversationItemTruncatedEvent): void {
    logger.debug(`Conversation item truncated: ${event.item_id}`);
  }

  private handleConversationItemDeleted(event: ConversationItemDeletedEvent): void {
    logger.debug(`Conversation item deleted: ${event.item_id}`);
  }

  private handleInputAudioBufferCommitted(_event: InputAudioBufferCommittedEvent): void {
    logger.debug('Input audio buffer committed');
  }

  private handleInputAudioBufferCleared(_event: InputAudioBufferClearedEvent): void {
    logger.debug('Input audio buffer cleared');
  }

  private handleSpeechStarted(_event: InputAudioBufferSpeechStartedEvent): void {
    logger.debug('Speech started');
    this.config.onSpeechStarted?.();
  }

  private handleSpeechStopped(_event: InputAudioBufferSpeechStoppedEvent): void {
    logger.debug('Speech stopped');
    this.config.onSpeechStopped?.();
  }

  private handleResponseCreated(event: ResponseCreatedEvent): void {
    this.currentResponseId = event.response.id;
    this.responseInProgress = true;
    this.textBuffer = '';
    this.transcriptBuffer = '';
    this.audioBuffer = [];
    logger.debug(`Response started: ${this.currentResponseId}`);
  }

  private handleResponseDone(event: ResponseDoneEvent): void {
    this.responseInProgress = false;
    logger.debug(`Response completed: ${event.response.id}`);

    if (event.response.usage) {
      logger.info(`Token usage - Total: ${event.response.usage.total_tokens}, Input: ${event.response.usage.input_tokens}, Output: ${event.response.usage.output_tokens}`);
    }

    this.config.onResponseComplete?.(event.response);
    void this.processAudioOutput();
  }

  private handleResponseOutputItemAdded(event: ResponseOutputItemAddedEvent): void {
    logger.debug(`Output item added: ${event.item.id}`);
  }

  private handleResponseOutputItemDone(event: ResponseOutputItemDoneEvent): void {
    logger.debug(`Output item done: ${event.item.id}`);
  }

  private handleResponseContentPartAdded(event: ResponseContentPartAddedEvent): void {
    logger.debug(`Content part added: ${event.part.type}`);
  }

  private handleResponseContentPartDone(event: ResponseContentPartDoneEvent): void {
    logger.debug(`Content part done: ${event.part.type}`);
  }

  private handleTextDelta(event: ResponseTextDeltaEvent): void {
    this.textBuffer += event.delta;
    this.config.onTranscription?.('assistant', event.delta);
  }

  private handleTextDone(event: ResponseTextDoneEvent): void {
    logger.debug('Text response complete:', event.text);
    this.textBuffer = '';
  }

  private handleAudioDelta(event: ResponseAudioDeltaEvent): void {
    if (event.delta) {
      this.audioBuffer.push(Buffer.from(event.delta, 'base64'));
    }
  }

  private handleAudioDone(_event: ResponseAudioDoneEvent): void {
    logger.debug('Audio response complete');
  }

  private handleAudioTranscriptDelta(event: ResponseAudioTranscriptDeltaEvent): void {
    this.transcriptBuffer += event.delta;
    this.config.onTranscription?.('assistant', event.delta);
  }

  private handleAudioTranscriptDone(event: ResponseAudioTranscriptDoneEvent): void {
    logger.debug('Audio transcript complete:', event.transcript);
    this.transcriptBuffer = '';
  }

  private handleFunctionCallArgumentsDelta(event: ResponseFunctionCallArgumentsDeltaEvent): void {
    const existing = this.functionCallBuffer.get(event.call_id) || '';
    this.functionCallBuffer.set(event.call_id, existing + event.delta);
  }

  private async handleFunctionCallArgumentsDone(event: ResponseFunctionCallArgumentsDoneEvent): Promise<void> {
    try {
      const args = JSON.parse(event.arguments);
      logger.info(`Function call: ${event.name} with args:`, args);

      if (this.config.onFunctionCall) {
        const result = await this.config.onFunctionCall(event.name, args);

        const functionResultEvent: RealtimeClientEvent = {
          type: 'conversation.item.create',
          event_id: this.generateEventId(),
          item: {
            id: this.generateEventId(),
            object: 'conversation.item',
            type: 'function_call_output',
            call_id: event.call_id,
            output: JSON.stringify(result),
          },
        };

        this.sendEvent(functionResultEvent);

        const responseEvent: ResponseCreateEvent = {
          type: 'response.create',
          event_id: this.generateEventId(),
        };

        this.sendEvent(responseEvent);
      }
    } catch (error) {
      logger.error('Error handling function call:', error);
      const errorResult: RealtimeClientEvent = {
        type: 'conversation.item.create',
        event_id: this.generateEventId(),
        item: {
          id: this.generateEventId(),
          object: 'conversation.item',
          type: 'function_call_output',
          call_id: event.call_id,
          output: JSON.stringify({ error: 'Function call failed' }),
        },
      };

      this.sendEvent(errorResult);
    } finally {
      this.functionCallBuffer.delete(event.call_id);
    }
  }

  private handleRateLimitsUpdated(event: RateLimitsUpdatedEvent): void {
    for (const limit of event.rate_limits) {
      this.rateLimits.set(limit.name, {
        limit: limit.limit,
        remaining: limit.remaining,
        resetAt: new Date(Date.now() + limit.reset_seconds * 1000),
      });

      if (limit.remaining < limit.limit * 0.1) {
        logger.warn(`Rate limit warning for ${limit.name}: ${limit.remaining}/${limit.limit} remaining`);
      }
    }
  }

  private async processAudioOutput(): Promise<void> {
    if (this.audioBuffer.length === 0) return;

    try {
      const combinedAudio = Buffer.concat(this.audioBuffer);
      this.audioBuffer = [];

      const mulawAudio = await this.convertPCM16ToMulaw(combinedAudio);
      this.config.onAudioData?.(mulawAudio);
    } catch (error) {
      logger.error('Error processing audio output:', error);
    }
  }

  private async handleReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached');
      this.config.onError?.('Connection lost. Maximum reconnection attempts exceeded.');
      return;
    }

    this.reconnectAttempts += 1;
    const delay = Math.min(2 ** this.reconnectAttempts * 1000, 30000);

    logger.info(`Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);

    setTimeout(async () => {
      try {
        void this.connect();
      } catch (error) {
        logger.error('Reconnection failed:', error);
        void this.handleReconnect();
      }
    }, delay);
  }

  async reconnect(): Promise<void> {
    this.disconnect();
    this.reconnectAttempts = 0;
    await this.connect();
  }

  cancelResponse(): void {
    if (!this.responseInProgress) return;

    const cancelEvent: RealtimeClientEvent = {
      type: 'response.cancel',
      event_id: this.generateEventId(),
    };

    this.sendEvent(cancelEvent);
    this.responseInProgress = false;
  }

  commitAudioBuffer(): void {
    const commitEvent: RealtimeClientEvent = {
      type: 'input_audio_buffer.commit',
      event_id: this.generateEventId(),
    };

    this.sendEvent(commitEvent);
  }

  clearAudioBuffer(): void {
    const clearEvent: RealtimeClientEvent = {
      type: 'input_audio_buffer.clear',
      event_id: this.generateEventId(),
    };

    this.sendEvent(clearEvent);
  }

  setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (muted) {
      this.clearAudioBuffer();
    }
  }

  getRateLimits(): Map<string, { limit: number; remaining: number; resetAt: Date }> {
    return new Map(this.rateLimits);
  }

  isRateLimited(type: 'requests' | 'tokens'): boolean {
    const limit = this.rateLimits.get(type);
    return limit ? limit.remaining === 0 : false;
  }

  getSessionId(): string | undefined {
    return this.sessionId;
  }

  isResponseInProgress(): boolean {
    return this.responseInProgress;
  }

  private generateEventId(): string {
    return `evt_${uuidv4()}`;
  }

  disconnect(): void {
    this.clearHeartbeat();

    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close(1000, 'Client disconnect');
      }
      delete this.ws;
    }

    this.isConnected = false;
    delete this.sessionId;
    this.audioBuffer = [];
    this.textBuffer = '';
    this.transcriptBuffer = '';
    this.functionCallBuffer.clear();
    this.rateLimits.clear();

    this.cleanupTempFiles();
  }

  private cleanupTempFiles(): void {
    try {
      if (fs.existsSync(this.tempDir)) {
        const files = fs.readdirSync(this.tempDir);
        for (const file of files) {
          const filePath = path.join(this.tempDir, file);
          fs.unlinkSync(filePath);
        }
      }
    } catch (error) {
      logger.error('Error cleaning up temp files:', error);
    }
  }
}
