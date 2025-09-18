import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '../config/supabase';
import { stripeService } from './stripeService';
import { logger } from '../utils/logger';
import { StreamEvent } from '../types/twilio';

interface RealtimeConfig {
  instructions: string;
  voice?: 'alloy' | 'ash' | 'ballad' | 'coral' | 'echo' | 'sage' | 'shimmer' | 'verse' | 'cedar' | 'marin';
  tools?: any[];
  businessId: string;
  customerPhone: string;
  agentType?: 'service' | 'order' | 'payment';
  vadMode?: 'none' | 'server_vad' | 'semantic_vad';
  vadEagerness?: 'low' | 'medium' | 'high' | 'auto';
  noiseReduction?: 'none' | 'near' | 'far' | 'auto';
  mcpServerUrl?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

interface OpenAIEvent {
  type: string;
  event_id?: string;
  session?: any;
  item?: any;
  response?: any;
  error?: any;
  delta?: any;
  transcript?: string;
  audio?: any;
  function_call_arguments?: any;
}

interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}


export class RealtimeSession extends EventEmitter {
  private ws: WebSocket | null = null;
  private apiKey: string;
  private config: RealtimeConfig;
  private inputAudioOffset: number = 0;
  private transcriptText: string = '';
  private activeResponseId: string | null = null;
  private sessionId: string | null = null;
  private twilioStreamSid: string | null = null;
  private ffmpegPath: string;
  private conversationHistory: any[] = [];
  private retryCount: number = 0;
  private maxRetries: number = 3;
  private retryDelay: number = 1000;
  private isConnected: boolean = false;

  constructor(apiKey: string, config: RealtimeConfig) {
    super();
    this.apiKey = apiKey;
    this.config = {
      voice: 'cedar',
      vadMode: 'semantic_vad',
      vadEagerness: 'medium',
      noiseReduction: 'auto',
      temperature: 0.8,
      maxOutputTokens: 4096,
      ...config,
    };

    try {
      this.ffmpegPath = require('ffmpeg-static');
    } catch (error) {
      logger.warn('ffmpeg-static not available, audio resampling disabled');
      this.ffmpegPath = 'ffmpeg';
    }
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const model = 'gpt-realtime';
      const url = `wss://api.openai.com/v1/realtime?model=${model}`;

      this.ws = new WebSocket(url, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      });

      this.ws.on('open', () => {
        logger.info('OpenAI Realtime WebSocket connected', {
          businessId: this.config.businessId,
          customerPhone: this.config.customerPhone,
          model,
        });

        const sessionUpdate: any = {
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            instructions: this.config.instructions,
            voice: this.config.voice,
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: {
              model: 'whisper-1',
            },
            turn_detection: this.getTurnDetectionConfig(),
            tools: this.getAllTools(),
            temperature: this.config.temperature,
            max_response_output_tokens: this.config.maxOutputTokens,
            input_audio_noise_reduction: this.config.noiseReduction,
          },
        };

        if (this.config.mcpServerUrl) {
          sessionUpdate.session.mcp_server = {
            url: this.config.mcpServerUrl,
            auto_execute: true,
          };
        }

        this.ws!.send(JSON.stringify(sessionUpdate));
        resolve();
      });

      this.ws.on('message', (data: Buffer) => {
        try {
          const event = JSON.parse(data.toString()) as OpenAIEvent;
          this.onOpenAIEvent(event);
        } catch (error) {
          logger.error('Failed to parse OpenAI event', { error });
        }
      });

      this.ws.on('error', (error) => {
        logger.error('OpenAI WebSocket error', { error, businessId: this.config.businessId });
        this.emit('error', error);
        reject(error);
      });

      this.ws.on('close', (code, reason) => {
        logger.info('OpenAI WebSocket closed', {
          code,
          reason: reason?.toString(),
          businessId: this.config.businessId,
        });
        this.emit('close', code, reason);
      });
    });
  }

  private getTurnDetectionConfig(): any {
    if (this.config.vadMode === 'none') {
      return { type: 'none' };
    }

    if (this.config.vadMode === 'server_vad') {
      return {
        type: 'server_vad',
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 500,
      };
    }

    return {
      type: 'semantic_vad',
      eagerness: this.config.vadEagerness || 'medium',
      threshold: this.getEagernessThreshold(),
      prefix_padding_ms: this.getEagernessPadding(),
      silence_duration_ms: this.getEagernessSilence(),
    };
  }

  private getEagernessThreshold(): number {
    switch (this.config.vadEagerness) {
      case 'low': return 0.7;
      case 'high': return 0.3;
      case 'auto': return 0.5;
      default: return 0.5;
    }
  }

  private getEagernessPadding(): number {
    switch (this.config.vadEagerness) {
      case 'low': return 500;
      case 'high': return 100;
      case 'auto': return 300;
      default: return 300;
    }
  }

  private getEagernessSilence(): number {
    switch (this.config.vadEagerness) {
      case 'low': return 800;
      case 'high': return 300;
      case 'auto': return 500;
      default: return 500;
    }
  }

  async handleTwilioEvent(event: StreamEvent): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn('WebSocket not connected, ignoring Twilio event');
      return;
    }

    switch (event.event) {
      case 'start':
        this.twilioStreamSid = event.start?.streamSid || null;
        logger.info('Twilio stream started', {
          streamSid: this.twilioStreamSid,
          callSid: event.start?.callSid,
        });
        this.emit('twilio_stream_start', event.start);
        break;

      case 'media':
        if (event.media?.payload) {
          try {
            const mulawBuffer = Buffer.from(event.media.payload, 'base64');
            const pcmBuffer = await this.resampleAudio(mulawBuffer, 'mulaw_to_pcm');

            this.ws.send(JSON.stringify({
              type: 'input_audio_buffer.append',
              audio: pcmBuffer.toString('base64'),
            }));

            this.inputAudioOffset += 20;

            if (this.inputAudioOffset % 1000 === 0) {
              this.ws.send(JSON.stringify({
                type: 'input_audio_buffer.commit',
              }));
            }
          } catch (error) {
            logger.error('Failed to process Twilio media', { error });
          }
        }
        break;

      case 'stop':
        logger.info('Twilio stream stopped', {
          streamSid: this.twilioStreamSid,
          callSid: event.stop?.callSid,
        });

        if (this.activeResponseId) {
          this.ws.send(JSON.stringify({
            type: 'response.cancel',
          }));
        }

        await this.cleanup();
        this.emit('twilio_stream_stop', event.stop);
        break;
    }
  }

  private async onOpenAIEvent(event: OpenAIEvent): Promise<void> {
    switch (event.type) {
      case 'session.created':
        this.sessionId = event.session?.id;
        logger.info('OpenAI session created', {
          sessionId: this.sessionId,
          businessId: this.config.businessId,
          voice: this.config.voice,
          vadMode: this.config.vadMode,
        });
        break;

      case 'conversation.item.created':
        this.conversationHistory.push(event.item);
        break;

      case 'conversation.item.input_audio_transcription.completed':
        if (event.transcript) {
          this.transcriptText += `User: ${event.transcript}\n`;
          logger.info('Input audio transcribed', { transcript: event.transcript });
        }
        break;

      case 'response.created':
        this.activeResponseId = event.response?.id || null;
        break;

      case 'response.audio.delta':
        if (event.delta && this.twilioStreamSid) {
          try {
            const pcmBuffer = Buffer.from(event.delta, 'base64');
            const mulawBuffer = await this.resampleAudio(pcmBuffer, 'pcm_to_mulaw');

            this.emit('audio_data', {
              event: 'media',
              streamSid: this.twilioStreamSid,
              media: {
                payload: mulawBuffer.toString('base64'),
              },
            });
          } catch (error) {
            logger.error('Failed to process audio delta', { error });
          }
        }
        break;

      case 'response.audio_transcript.delta':
        if (event.delta) {
          this.transcriptText += event.delta;
        }
        break;

      case 'response.audio_transcript.done':
        if (event.transcript) {
          this.transcriptText += `Assistant: ${event.transcript}\n`;
        }
        break;

      case 'response.function_call_arguments.done':
        if (event.item?.name && event.function_call_arguments) {
          await this.executeFunction(event.item.name, event.function_call_arguments);
        }
        break;

      case 'response.done':
        this.activeResponseId = null;
        break;

      case 'mcp.tool_call.started':
        logger.info('MCP tool call started', {
          tool: event.item?.name,
          server: this.config.mcpServerUrl,
        });
        break;

      case 'mcp.tool_call.completed':
        logger.info('MCP tool call completed', {
          tool: event.item?.name,
          result: event.item?.result,
        });
        break;

      case 'error':
        logger.error('OpenAI error event', {
          error: event.error,
          businessId: this.config.businessId,
        });
        this.emit('error', event.error);
        break;
    }
  }

  private async executeFunction(name: string, args: string): Promise<void> {
    try {
      const parsedArgs = JSON.parse(args);
      let result: any;

      switch (name) {
        case 'create_order':
          result = await this.createOrder(parsedArgs);
          break;

        case 'process_payment':
          result = await this.processPayment(parsedArgs);
          break;

        case 'get_business_info':
          result = await this.getBusinessInfo();
          break;

        case 'check_availability':
          result = await this.checkAvailability(parsedArgs);
          break;

        case 'schedule_appointment':
          result = await this.scheduleAppointment(parsedArgs);
          break;

        default:
          logger.warn('Unknown function call', { name, args: parsedArgs });
          return;
      }

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: Date.now().toString(),
            output: JSON.stringify(result),
          },
        }));
      }
    } catch (error) {
      logger.error('Function execution failed', { name, error });

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: Date.now().toString(),
            output: JSON.stringify({ error: 'Function execution failed' }),
          },
        }));
      }
    }
  }

  private async createOrder(args: { items: OrderItem[]; total: number }): Promise<any> {
    try {
      const { data: order, error } = await supabaseAdmin
        .from('orders')
        .insert({
          business_id: this.config.businessId,
          customer_phone: this.config.customerPhone,
          items: args.items,
          total: args.total,
          status: 'pending',
          payment_status: 'pending',
          metadata: {
            source: 'voice_agent',
            agent_type: this.config.agentType,
            session_id: this.sessionId,
          },
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      logger.info('Order created', {
        orderId: order.id,
        businessId: this.config.businessId,
        total: args.total,
      });

      return { success: true, orderId: order.id, message: 'Order created successfully' };
    } catch (error) {
      logger.error('Failed to create order', { error, args });
      throw error;
    }
  }

  private async processPayment(args: { amount: number; orderId?: string }): Promise<any> {
    try {
      const amountCents = Math.round(args.amount * 100);
      const orderId = args.orderId || uuidv4();

      const charge = await stripeService.createCharge(amountCents, {
        businessId: this.config.businessId,
        orderId,
        phoneNumber: this.config.customerPhone,
        description: `Payment for order ${orderId}`,
        agentId: this.sessionId,
      });

      const { data: payment, error: paymentError } = await supabaseAdmin
        .from('payments')
        .insert({
          business_id: this.config.businessId,
          order_id: args.orderId,
          amount: args.amount,
          currency: 'usd',
          status: charge.status === 'succeeded' ? 'completed' : 'failed',
          payment_method: 'card',
          stripe_payment_id: charge.id,
          payment_metadata: {
            receipt_url: charge.receipt_url,
            stripe_status: charge.status,
            source: charge.source,
            metadata: charge.metadata,
          },
        })
        .select()
        .single();

      if (paymentError) {
        logger.error('Failed to record payment', { error: paymentError });
      }

      if (args.orderId) {
        await supabaseAdmin
          .from('orders')
          .update({
            payment_status: charge.status === 'succeeded' ? 'paid' : 'failed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', args.orderId);
      }

      logger.info('Payment processed', {
        paymentId: payment?.id,
        chargeId: charge.id,
        amount: args.amount,
        status: charge.status,
      });

      return {
        success: charge.status === 'succeeded',
        paymentId: payment?.id,
        chargeId: charge.id,
        message: charge.status === 'succeeded' ? 'Payment successful' : 'Payment failed',
      };
    } catch (error) {
      logger.error('Failed to process payment', { error, args });
      throw error;
    }
  }

  private async getBusinessInfo(): Promise<any> {
    try {
      const { data: business, error } = await supabaseAdmin
        .from('businesses')
        .select('name, data_json')
        .eq('id', this.config.businessId)
        .single();

      if (error) {
        throw error;
      }

      return {
        name: business.name,
        ...business.data_json,
      };
    } catch (error) {
      logger.error('Failed to get business info', { error });
      throw error;
    }
  }

  private async checkAvailability(args: { date: string; time?: string }): Promise<any> {
    try {
      const { data: business, error } = await supabaseAdmin
        .from('businesses')
        .select('data_json')
        .eq('id', this.config.businessId)
        .single();

      if (error) {
        throw error;
      }

      const hours = business.data_json?.hours || {};
      const dayOfWeek = new Date(args.date).toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
      const dayHours = hours[dayOfWeek];

      if (!dayHours) {
        return { available: false, message: 'Closed on this day' };
      }

      if (args.time) {
        const requestedTime = parseInt(args.time.replace(':', ''));
        const openTime = parseInt(dayHours.open.replace(':', ''));
        const closeTime = parseInt(dayHours.close.replace(':', ''));

        const available = requestedTime >= openTime && requestedTime <= closeTime;
        return {
          available,
          message: available ? 'Available at this time' : `We're open ${dayHours.open} to ${dayHours.close}`,
        };
      }

      return {
        available: true,
        hours: dayHours,
        message: `Open from ${dayHours.open} to ${dayHours.close}`,
      };
    } catch (error) {
      logger.error('Failed to check availability', { error, args });
      throw error;
    }
  }

  private async scheduleAppointment(args: { date: string; time: string; service: string; name?: string }): Promise<any> {
    try {
      const appointmentData = {
        business_id: this.config.businessId,
        customer_phone: this.config.customerPhone,
        customer_name: args.name || 'Customer',
        items: [{ name: args.service, quantity: 1, price: 0 }],
        total: 0,
        status: 'confirmed',
        payment_status: 'not_required',
        metadata: {
          type: 'appointment',
          date: args.date,
          time: args.time,
          source: 'voice_agent',
          session_id: this.sessionId,
        },
      };

      const { data: appointment, error } = await supabaseAdmin
        .from('orders')
        .insert(appointmentData)
        .select()
        .single();

      if (error) {
        throw error;
      }

      logger.info('Appointment scheduled', {
        appointmentId: appointment.id,
        date: args.date,
        time: args.time,
      });

      return {
        success: true,
        appointmentId: appointment.id,
        message: `Appointment scheduled for ${args.date} at ${args.time}`,
      };
    } catch (error) {
      logger.error('Failed to schedule appointment', { error, args });
      throw error;
    }
  }

  private async cleanup(): Promise<void> {
    try {
      if (this.transcriptText.trim()) {
        const { error } = await supabaseAdmin
          .from('transcripts')
          .insert({
            business_id: this.config.businessId,
            call_sid: this.twilioStreamSid || 'unknown',
            full_text: this.transcriptText.trim(),
            metadata: {
              customer_phone: this.config.customerPhone,
              agent_type: this.config.agentType,
              session_id: this.sessionId,
              conversation_items: this.conversationHistory.length,
              voice_used: this.config.voice,
              vad_mode: this.config.vadMode,
            },
          });

        if (error) {
          logger.error('Failed to save transcript', { error });
        } else {
          logger.info('Transcript saved', { businessId: this.config.businessId });
        }
      }

      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }

      this.inputAudioOffset = 0;
      this.transcriptText = '';
      this.activeResponseId = null;
      this.conversationHistory = [];
    } catch (error) {
      logger.error('Cleanup failed', { error });
    }
  }

  private getAllTools(): any[] {
    const tools = [
      {
        type: 'function',
        name: 'create_order',
        description: 'Create a new order with items and calculate total',
        parameters: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Item name' },
                  quantity: { type: 'number', description: 'Quantity ordered' },
                  price: { type: 'number', description: 'Price per item' },
                },
                required: ['name', 'quantity', 'price'],
              },
              description: 'List of items in the order',
            },
            total: {
              type: 'number',
              description: 'Total amount for the order',
            },
          },
          required: ['items', 'total'],
        },
      },
      {
        type: 'function',
        name: 'process_payment',
        description: 'Process a payment for an order',
        parameters: {
          type: 'object',
          properties: {
            amount: {
              type: 'number',
              description: 'Payment amount in dollars',
            },
            orderId: {
              type: 'string',
              description: 'Order ID to associate with payment',
            },
          },
          required: ['amount'],
        },
      },
      {
        type: 'function',
        name: 'get_business_info',
        description: 'Get information about the business including hours, menu, and services',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      {
        type: 'function',
        name: 'check_availability',
        description: 'Check if the business is available on a specific date and time',
        parameters: {
          type: 'object',
          properties: {
            date: {
              type: 'string',
              description: 'Date to check (YYYY-MM-DD format)',
            },
            time: {
              type: 'string',
              description: 'Optional time to check (HH:MM format)',
            },
          },
          required: ['date'],
        },
      },
      {
        type: 'function',
        name: 'schedule_appointment',
        description: 'Schedule an appointment or reservation',
        parameters: {
          type: 'object',
          properties: {
            date: {
              type: 'string',
              description: 'Appointment date (YYYY-MM-DD)',
            },
            time: {
              type: 'string',
              description: 'Appointment time (HH:MM)',
            },
            service: {
              type: 'string',
              description: 'Service or reason for appointment',
            },
            name: {
              type: 'string',
              description: 'Customer name',
            },
          },
          required: ['date', 'time', 'service'],
        },
      },
    ];

    if (this.config.tools) {
      tools.push(...this.config.tools);
    }

    return tools;
  }

  private async resampleAudio(buffer: Buffer, mode: 'mulaw_to_pcm' | 'pcm_to_mulaw'): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const args = mode === 'mulaw_to_pcm'
        ? ['-f', 'mulaw', '-ar', '8000', '-ac', '1', '-i', 'pipe:0', '-f', 's16le', '-ar', '24000', '-ac', '1', 'pipe:1']
        : ['-f', 's16le', '-ar', '24000', '-ac', '1', '-i', 'pipe:0', '-f', 'mulaw', '-ar', '8000', '-ac', '1', 'pipe:1'];

      const ffmpeg = spawn(this.ffmpegPath, args);
      const output: Buffer[] = [];

      ffmpeg.stdout.on('data', (chunk) => {
        output.push(chunk);
      });

      ffmpeg.on('error', (error) => {
        logger.error('FFmpeg spawn error', { error });
        reject(error);
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve(Buffer.concat(output));
        } else {
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });

      ffmpeg.stdin.write(buffer);
      ffmpeg.stdin.end();
    });
  }

  sendMessage(text: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'text',
              text,
            },
          ],
        },
      }));
    }
  }

  updateSession(updates: Partial<RealtimeConfig>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      Object.assign(this.config, updates);

      const sessionUpdate: any = {
        type: 'session.update',
        session: {},
      };

      if (updates.voice) {
        sessionUpdate.session.voice = updates.voice;
      }

      if (updates.vadMode !== undefined) {
        sessionUpdate.session.turn_detection = this.getTurnDetectionConfig();
      }

      if (updates.noiseReduction) {
        sessionUpdate.session.input_audio_noise_reduction = updates.noiseReduction;
      }

      if (updates.temperature !== undefined) {
        sessionUpdate.session.temperature = updates.temperature;
      }

      if (updates.mcpServerUrl) {
        sessionUpdate.session.mcp_server = {
          url: updates.mcpServerUrl,
          auto_execute: true,
        };
      }

      this.ws.send(JSON.stringify(sessionUpdate));
      logger.info('Session updated', { updates });
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}