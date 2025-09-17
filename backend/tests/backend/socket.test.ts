import { WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { handleConnection } from '../../src/socket/realtimeHandler';
import { RealtimeSession } from '../../src/services/openaiService';
import { supabaseAdmin } from '../../src/config/supabase';
import { logger } from '../../src/utils/logger';

jest.mock('../../src/config/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn(),
  },
}));

jest.mock('../../src/services/openaiService', () => ({
  RealtimeSession: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockSupabaseFrom = supabaseAdmin.from as jest.Mock;

class MockWebSocket {
  readyState: number = 1;
  send = jest.fn();
  close = jest.fn();
  ping = jest.fn();
  on = jest.fn();

  static OPEN = 1;
  static CLOSED = 3;
}

class MockRealtimeSession {
  connect = jest.fn().mockResolvedValue(undefined);
  handleTwilioEvent = jest.fn();
  disconnect = jest.fn();
  on = jest.fn();
}

describe('WebSocket Realtime Handler', () => {
  let mockWs: MockWebSocket;
  let mockReq: Partial<IncomingMessage>;
  let mockSession: MockRealtimeSession;

  beforeEach(() => {
    jest.clearAllMocks();

    mockWs = new MockWebSocket() as any;
    mockReq = {
      url: '/realtime?businessId=business-123&agentType=service&from=+1234567890',
      headers: {
        origin: 'https://media.twiliocdn.com',
      },
    };

    mockSession = new MockRealtimeSession();
    (RealtimeSession as any).mockImplementation(() => mockSession);

    process.env.OPENAI_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  describe('handleConnection', () => {
    it('should establish connection with valid parameters', async () => {
      const mockBusiness = {
        id: 'business-123',
        name: 'Test Business',
        data_json: {
          menu: [{ name: 'Pizza', price: 20 }],
          hours: { mon: { open: '09:00', close: '21:00' } },
        },
        agents: [
          {
            id: 'agent-123',
            name: 'Service Agent',
            type: 'service',
            prompt: 'You are a helpful service agent',
            voice_config: {
              voice: 'cedar',
              eagerness: 'medium',
              noise_reduction: 'auto',
            },
            is_active: true,
          },
        ],
      };

      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'businesses') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockBusiness, error: null }),
          };
        }
        if (table === 'call_logs') {
          return {
            insert: jest.fn().mockResolvedValue({ data: {}, error: null }),
          };
        }
      });

      await handleConnection(mockWs as any, mockReq as IncomingMessage);

      expect(RealtimeSession).toHaveBeenCalledWith(
        'test-api-key',
        expect.objectContaining({
          businessId: 'business-123',
          customerPhone: '+1234567890',
          agentType: 'service',
          voice: 'cedar',
          vadMode: 'semantic_vad',
          vadEagerness: 'medium',
          noiseReduction: 'auto',
        })
      );

      expect(mockSession.connect).toHaveBeenCalled();
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"event":"connected"')
      );
    });

    it('should handle missing businessId', async () => {
      mockReq.url = '/realtime';

      await handleConnection(mockWs as any, mockReq as IncomingMessage);

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"error":"Missing businessId parameter"')
      );
      expect(mockWs.close).toHaveBeenCalledWith(1008, 'Missing businessId');
      expect(RealtimeSession).not.toHaveBeenCalled();
    });

    it('should handle business not found', async () => {
      mockSupabaseFrom.mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: 'Not found' }),
      }));

      await handleConnection(mockWs as any, mockReq as IncomingMessage);

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"error":"Business not found"')
      );
      expect(mockWs.close).toHaveBeenCalledWith(1008, 'Business not found');
    });

    it('should use default agent if agentType not specified', async () => {
      mockReq.url = '/realtime?businessId=business-123&from=+1234567890';

      const mockBusiness = {
        id: 'business-123',
        name: 'Test Business',
        data_json: {},
        agents: [
          {
            id: 'agent-456',
            name: 'Default Agent',
            type: 'order',
            prompt: 'Default prompt',
            voice_config: { voice: 'marin' },
            is_active: true,
          },
        ],
      };

      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'businesses') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockBusiness, error: null }),
          };
        }
        if (table === 'call_logs') {
          return {
            insert: jest.fn().mockResolvedValue({ data: {}, error: null }),
          };
        }
      });

      await handleConnection(mockWs as any, mockReq as IncomingMessage);

      expect(RealtimeSession).toHaveBeenCalledWith(
        'test-api-key',
        expect.objectContaining({
          agentType: 'order',
          voice: 'marin',
        })
      );
    });

    it('should handle missing OpenAI API key', async () => {
      delete process.env.OPENAI_API_KEY;

      const mockBusiness = {
        id: 'business-123',
        name: 'Test Business',
        data_json: {},
        agents: [],
      };

      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'businesses') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockBusiness, error: null }),
          };
        }
      });

      await handleConnection(mockWs as any, mockReq as IncomingMessage);

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"error":"OpenAI API key not configured"')
      );
      expect(mockWs.close).toHaveBeenCalledWith(1011, 'Server configuration error');
    });

    it('should handle WebSocket messages', async () => {
      const mockBusiness = {
        id: 'business-123',
        name: 'Test Business',
        data_json: {},
        agents: [],
      };

      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'businesses') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockBusiness, error: null }),
          };
        }
        if (table === 'call_logs') {
          return {
            insert: jest.fn().mockResolvedValue({ data: {}, error: null }),
          };
        }
      });

      let messageHandler: any;
      mockWs.on.mockImplementation((event: string, handler: any) => {
        if (event === 'message') {
          messageHandler = handler;
        }
      });

      await handleConnection(mockWs as any, mockReq as IncomingMessage);

      const twilioEvent = {
        event: 'media',
        media: { payload: 'base64-audio' },
      };

      await messageHandler(Buffer.from(JSON.stringify(twilioEvent)));

      expect(mockSession.handleTwilioEvent).toHaveBeenCalledWith(twilioEvent);
    });

    it('should handle WebSocket close event', async () => {
      const mockBusiness = {
        id: 'business-123',
        name: 'Test Business',
        data_json: {},
        agents: [],
      };

      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'businesses') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockBusiness, error: null }),
          };
        }
        if (table === 'call_logs') {
          return {
            insert: jest.fn().mockResolvedValue({ data: {}, error: null }),
          };
        }
      });

      let closeHandler: any;
      mockWs.on.mockImplementation((event: string, handler: any) => {
        if (event === 'close') {
          closeHandler = handler;
        }
      });

      await handleConnection(mockWs as any, mockReq as IncomingMessage);

      closeHandler(1000, Buffer.from('Normal closure'));

      expect(mockSession.disconnect).toHaveBeenCalled();
    });

    it('should set up audio data forwarding', async () => {
      const mockBusiness = {
        id: 'business-123',
        name: 'Test Business',
        data_json: {},
        agents: [],
      };

      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'businesses') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockBusiness, error: null }),
          };
        }
        if (table === 'call_logs') {
          return {
            insert: jest.fn().mockResolvedValue({ data: {}, error: null }),
          };
        }
      });

      let audioDataHandler: any;
      mockSession.on.mockImplementation((event: string, handler: any) => {
        if (event === 'audio_data') {
          audioDataHandler = handler;
        }
      });

      await handleConnection(mockWs as any, mockReq as IncomingMessage);

      const audioData = { event: 'media', payload: 'audio-data' };
      audioDataHandler(audioData);

      expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify(audioData));
    });

    it('should log connection to database', async () => {
      const mockBusiness = {
        id: 'business-123',
        name: 'Test Business',
        data_json: {},
        agents: [
          {
            id: 'agent-789',
            name: 'Test Agent',
            type: 'service',
            is_active: true,
          },
        ],
      };

      const insertMock = jest.fn().mockResolvedValue({ data: {}, error: null });

      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'businesses') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockBusiness, error: null }),
          };
        }
        if (table === 'call_logs') {
          return {
            insert: insertMock,
          };
        }
      });

      await handleConnection(mockWs as any, mockReq as IncomingMessage);

      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          business_id: 'business-123',
          from_number: '+1234567890',
          agent_id: 'agent-789',
          direction: 'inbound',
          status: 'in-progress',
        })
      );
    });

    it('should include business data in instructions', async () => {
      const mockBusiness = {
        id: 'business-123',
        name: 'Test Restaurant',
        data_json: {
          menu: [
            { name: 'Pizza', price: 15 },
            { name: 'Burger', price: 12 },
          ],
          hours: {
            mon: { open: '09:00', close: '21:00' },
            tue: { open: '09:00', close: '21:00' },
          },
          pricing: {
            delivery_fee: 5,
            minimum_order: 20,
          },
        },
        agents: [],
      };

      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'businesses') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockBusiness, error: null }),
          };
        }
        if (table === 'call_logs') {
          return {
            insert: jest.fn().mockResolvedValue({ data: {}, error: null }),
          };
        }
      });

      await handleConnection(mockWs as any, mockReq as IncomingMessage);

      expect(RealtimeSession).toHaveBeenCalledWith(
        'test-api-key',
        expect.objectContaining({
          instructions: expect.stringContaining('Test Restaurant'),
        })
      );

      const callArgs = (RealtimeSession as any).mock.calls[0][1];
      expect(callArgs.instructions).toContain('menu');
      expect(callArgs.instructions).toContain('Business hours');
      expect(callArgs.instructions).toContain('Pricing');
    });
  });
});