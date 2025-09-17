import { EventEmitter } from 'events';
import { RealtimeSession } from '../../src/services/openaiService';
import { supabaseAdmin } from '../../src/config/supabase';
import Stripe from 'stripe';

jest.mock('ws');
jest.mock('../../src/config/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn(),
  },
}));
jest.mock('stripe');
jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));
jest.mock('ffmpeg-static', () => '/usr/bin/ffmpeg');

const mockSupabaseFrom = supabaseAdmin.from as jest.Mock;
const mockSpawn = require('child_process').spawn as jest.Mock;

class MockWebSocket extends EventEmitter {
  readyState: number = 1;
  send = jest.fn();
  close = jest.fn();

  constructor(url: string, options: any) {
    super();
    this.readyState = 0;
    setTimeout(() => {
      this.readyState = 1;
      this.emit('open');
    }, 10);
  }

  static OPEN = 1;
  static CLOSED = 3;
}

describe('RealtimeSession', () => {
  let session: RealtimeSession;
  let mockWs: MockWebSocket;
  const mockApiKey = 'test-api-key';
  const mockConfig = {
    instructions: 'You are a helpful assistant',
    businessId: 'business-123',
    customerPhone: '+1234567890',
    agentType: 'service' as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    const WebSocket = require('ws');
    WebSocket.mockImplementation((url: string, options: any) => {
      mockWs = new MockWebSocket(url, options);
      return mockWs;
    });

    const mockFFmpeg = new EventEmitter() as any;
    mockFFmpeg.stdin = { write: jest.fn(), end: jest.fn() };
    mockFFmpeg.stdout = new EventEmitter();
    mockSpawn.mockReturnValue(mockFFmpeg);

    setTimeout(() => {
      mockFFmpeg.stdout.emit('data', Buffer.from('resampled-audio', 'base64'));
      mockFFmpeg.emit('close', 0);
    }, 10);

    session = new RealtimeSession(mockApiKey, mockConfig);
  });

  describe('connect', () => {
    it('should establish WebSocket connection and send session update', async () => {
      await session.connect();

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"session.update"')
      );

      const sessionUpdate = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sessionUpdate.session).toMatchObject({
        modalities: ['text', 'audio'],
        instructions: mockConfig.instructions,
        voice: 'alloy',
        temperature: 0.8,
      });
      expect(sessionUpdate.session.tools).toHaveLength(2);
    });

    it('should handle connection errors', async () => {
      const error = new Error('Connection failed');
      setTimeout(() => mockWs.emit('error', error), 5);

      await expect(session.connect()).rejects.toThrow('Connection failed');
    });
  });

  describe('handleTwilioEvent', () => {
    beforeEach(async () => {
      await session.connect();
      jest.clearAllMocks();
    });

    it('should handle start event', async () => {
      const startEvent = {
        event: 'start' as const,
        sequenceNumber: '1',
        start: {
          streamSid: 'stream-123',
          accountSid: 'AC123',
          callSid: 'CA123',
        },
      };

      const streamStartSpy = jest.fn();
      session.on('twilio_stream_start', streamStartSpy);

      await session.handleTwilioEvent(startEvent);

      expect(streamStartSpy).toHaveBeenCalledWith(startEvent.start);
    });

    it('should handle media event and resample audio', async () => {
      const mediaEvent = {
        event: 'media' as const,
        sequenceNumber: '2',
        media: {
          track: 'inbound' as const,
          chunk: '1',
          timestamp: '100',
          payload: Buffer.from('mulaw-audio').toString('base64'),
        },
      };

      await session.handleTwilioEvent(mediaEvent);

      await new Promise(resolve => setTimeout(resolve, 20));

      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/bin/ffmpeg',
        expect.arrayContaining(['-f', 'mulaw', '-ar', '8000'])
      );
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"input_audio_buffer.append"')
      );
    });

    it('should handle stop event and cleanup', async () => {
      const stopEvent = {
        event: 'stop' as const,
        sequenceNumber: '3',
        stop: {
          accountSid: 'AC123',
          callSid: 'CA123',
        },
      };

      mockSupabaseFrom.mockImplementation(() => ({
        insert: jest.fn().mockResolvedValue({ data: {}, error: null }),
      }));

      const streamStopSpy = jest.fn();
      session.on('twilio_stream_stop', streamStopSpy);

      await session.handleTwilioEvent(stopEvent);

      expect(streamStopSpy).toHaveBeenCalledWith(stopEvent.stop);
      expect(mockWs.close).toHaveBeenCalled();
    });
  });

  describe('onOpenAIEvent', () => {
    beforeEach(async () => {
      await session.connect();
      jest.clearAllMocks();
    });

    it('should handle session.created event', () => {
      const event = {
        type: 'session.created',
        session: { id: 'session-123' },
      };

      mockWs.emit('message', Buffer.from(JSON.stringify(event)));

      expect(session).toBeDefined();
    });

    it('should handle input audio transcription', () => {
      const event = {
        type: 'conversation.item.input_audio_transcription.completed',
        transcript: 'Hello, I need help',
      };

      mockWs.emit('message', Buffer.from(JSON.stringify(event)));
    });

    it('should handle response audio delta', async () => {
      const audioDataSpy = jest.fn();
      session.on('audio_data', audioDataSpy);

      session['twilioStreamSid'] = 'stream-123';

      const event = {
        type: 'response.audio.delta',
        delta: Buffer.from('pcm-audio').toString('base64'),
      };

      mockWs.emit('message', Buffer.from(JSON.stringify(event)));

      await new Promise(resolve => setTimeout(resolve, 20));

      expect(audioDataSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'media',
          streamSid: 'stream-123',
        })
      );
    });

    it('should handle function call for create_order', async () => {
      const mockOrder = { id: 'order-123' };
      mockSupabaseFrom.mockImplementation(() => ({
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockOrder, error: null }),
      }));

      const event = {
        type: 'response.function_call_arguments.done',
        item: { name: 'create_order' },
        function_call_arguments: JSON.stringify({
          items: [{ name: 'Pizza', quantity: 2, price: 15 }],
          total: 30,
        }),
      };

      mockWs.emit('message', Buffer.from(JSON.stringify(event)));

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockSupabaseFrom).toHaveBeenCalledWith('orders');
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"conversation.item.create"')
      );
    });

    it('should handle function call for process_payment', async () => {
      const mockCharge = {
        id: 'ch_123',
        status: 'succeeded',
        payment_intent: 'pi_123',
      };

      const mockStripe = {
        charges: {
          create: jest.fn().mockResolvedValue(mockCharge),
        },
      };

      (Stripe as any).mockImplementation(() => mockStripe);

      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'payments') {
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: { id: 'payment-123' }, error: null }),
          };
        }
        if (table === 'orders') {
          return {
            update: jest.fn().mockReturnThis(),
            eq: jest.fn().mockResolvedValue({ data: {}, error: null }),
          };
        }
      });

      const event = {
        type: 'response.function_call_arguments.done',
        item: { name: 'process_payment' },
        function_call_arguments: JSON.stringify({
          amount: 30,
          orderId: 'order-123',
        }),
      };

      mockWs.emit('message', Buffer.from(JSON.stringify(event)));

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockStripe.charges.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 3000,
          currency: 'usd',
        })
      );
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"conversation.item.create"')
      );
    });

    it('should handle error events', () => {
      const errorSpy = jest.fn();
      session.on('error', errorSpy);

      const event = {
        type: 'error',
        error: { message: 'Something went wrong' },
      };

      mockWs.emit('message', Buffer.from(JSON.stringify(event)));

      expect(errorSpy).toHaveBeenCalledWith({ message: 'Something went wrong' });
    });
  });

  describe('tools', () => {
    it('should define create_order and process_payment tools', async () => {
      await session.connect();

      const sessionUpdate = JSON.parse(mockWs.send.mock.calls[0][0]);
      const tools = sessionUpdate.session.tools;

      expect(tools).toHaveLength(2);
      expect(tools[0]).toMatchObject({
        type: 'function',
        name: 'create_order',
        parameters: {
          type: 'object',
          properties: {
            items: expect.any(Object),
            total: expect.any(Object),
          },
          required: ['items', 'total'],
        },
      });
      expect(tools[1]).toMatchObject({
        type: 'function',
        name: 'process_payment',
        parameters: {
          type: 'object',
          properties: {
            amount: expect.any(Object),
            orderId: expect.any(Object),
          },
          required: ['amount'],
        },
      });
    });
  });

  describe('cleanup', () => {
    it('should save transcript on cleanup', async () => {
      await session.connect();

      session['transcriptText'] = 'This is a test transcript';
      session['twilioStreamSid'] = 'stream-123';

      mockSupabaseFrom.mockImplementation(() => ({
        insert: jest.fn().mockResolvedValue({ data: {}, error: null }),
      }));

      await session['cleanup']();

      expect(mockSupabaseFrom).toHaveBeenCalledWith('transcripts');
      expect(mockWs.close).toHaveBeenCalled();
    });
  });

  describe('resampleAudio', () => {
    it('should resample mulaw to pcm', async () => {
      const inputBuffer = Buffer.from('mulaw-audio');
      const result = await session['resampleAudio'](inputBuffer, 'mulaw_to_pcm');

      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/bin/ffmpeg',
        expect.arrayContaining([
          '-f', 'mulaw', '-ar', '8000', '-ac', '1', '-i', 'pipe:0',
          '-f', 's16le', '-ar', '24000', '-ac', '1', 'pipe:1',
        ])
      );
      expect(result).toBeInstanceOf(Buffer);
    });

    it('should resample pcm to mulaw', async () => {
      const inputBuffer = Buffer.from('pcm-audio');
      const result = await session['resampleAudio'](inputBuffer, 'pcm_to_mulaw');

      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/bin/ffmpeg',
        expect.arrayContaining([
          '-f', 's16le', '-ar', '24000', '-ac', '1', '-i', 'pipe:0',
          '-f', 'mulaw', '-ar', '8000', '-ac', '1', 'pipe:1',
        ])
      );
      expect(result).toBeInstanceOf(Buffer);
    });
  });

  describe('disconnect', () => {
    it('should close WebSocket connection', async () => {
      await session.connect();
      session.disconnect();

      expect(mockWs.close).toHaveBeenCalled();
    });
  });
});