import request from 'supertest';
import twilio from 'twilio';
import { app } from '../../src/index';
import { supabaseAdmin } from '../../src/config/supabase';

jest.mock('../../src/config/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn(),
  },
}));

jest.mock('twilio', () => {
  const mockClient = {
    messages: {
      create: jest.fn(),
    },
    calls: {
      create: jest.fn(),
    },
  };

  const mockTwilio = jest.fn(() => mockClient);
  mockTwilio.validateRequest = jest.fn();

  return mockTwilio;
});

const mockSupabaseFrom = supabaseAdmin.from as jest.Mock;
const mockValidateRequest = (twilio as any).validateRequest as jest.Mock;

describe('Twilio Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.TWILIO_ACCOUNT_SID = 'AC123456789';
    process.env.TWILIO_AUTH_TOKEN = 'test-auth-token';
    process.env.BACKEND_URL = 'https://api.verbio.app';
  });

  describe('POST /api/twilio/webhook', () => {
    it('should handle valid incoming call webhook', async () => {
      mockValidateRequest.mockReturnValue(true);

      const mockPhoneMapping = {
        id: 'mapping-123',
        business_id: 'business-123',
        agent_id: 'agent-123',
        twilio_number: '+1234567890',
        agents: {
          id: 'agent-123',
          name: 'Service Agent',
          type: 'service',
          prompt: 'You are a helpful service agent',
          voice_config: { voice: 'Polly.Joanna' }
        }
      };

      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'phone_mappings') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockPhoneMapping, error: null }),
          };
        }
        if (table === 'call_logs') {
          return {
            insert: jest.fn().mockResolvedValue({ data: {}, error: null }),
          };
        }
      });

      const response = await request(app)
        .post('/api/twilio/webhook')
        .set('X-Twilio-Signature', 'test-signature')
        .send({
          CallSid: 'CA123456789',
          From: '+0987654321',
          To: '+1234567890',
          CallStatus: 'ringing',
          Direction: 'inbound'
        });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/xml');
      expect(response.text).toContain('<Stream');
      expect(response.text).toContain('businessId');
      expect(response.text).toContain('agentType');
      expect(response.text).toContain('track="both_tracks"');
    });

    it('should return error TwiML for unmapped number', async () => {
      mockValidateRequest.mockReturnValue(true);

      mockSupabaseFrom.mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: 'Not found' }),
      }));

      const response = await request(app)
        .post('/api/twilio/webhook')
        .send({
          CallSid: 'CA123456789',
          From: '+0987654321',
          To: '+9999999999',
          CallStatus: 'ringing'
        });

      expect(response.status).toBe(200);
      expect(response.text).toContain('<Say');
      expect(response.text).toContain('not currently in service');
      expect(response.text).toContain('<Hangup');
    });

    it('should handle webhook validation failure in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      mockValidateRequest.mockReturnValue(false);

      const response = await request(app)
        .post('/api/twilio/webhook')
        .set('X-Twilio-Signature', 'invalid-signature')
        .send({
          CallSid: 'CA123456789',
          From: '+0987654321',
          To: '+1234567890'
        });

      expect(response.status).toBe(403);
      expect(response.text).toBe('Forbidden');

      process.env.NODE_ENV = originalEnv;
    });

    it('should create call log entry', async () => {
      mockValidateRequest.mockReturnValue(true);

      const mockPhoneMapping = {
        id: 'mapping-123',
        business_id: 'business-123',
        agent_id: 'agent-123',
        agents: { type: 'order' }
      };

      const insertMock = jest.fn().mockResolvedValue({ data: {}, error: null });

      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'phone_mappings') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockPhoneMapping, error: null }),
          };
        }
        if (table === 'call_logs') {
          return {
            insert: insertMock,
          };
        }
      });

      await request(app)
        .post('/api/twilio/webhook')
        .send({
          CallSid: 'CA123456789',
          From: '+0987654321',
          To: '+1234567890',
          CallStatus: 'ringing',
          Direction: 'inbound'
        });

      expect(insertMock).toHaveBeenCalledWith({
        business_id: 'business-123',
        call_sid: 'CA123456789',
        from_number: '+0987654321',
        to_number: '+1234567890',
        direction: 'inbound',
        status: 'ringing',
        agent_id: 'agent-123'
      });
    });
  });

  describe('POST /api/twilio/status', () => {
    it('should update call log with status and duration', async () => {
      mockValidateRequest.mockReturnValue(true);

      const updateMock = jest.fn().mockReturnThis();
      const eqMock = jest.fn().mockResolvedValue({ data: {}, error: null });

      mockSupabaseFrom.mockImplementation(() => ({
        update: updateMock,
        eq: eqMock,
      }));

      const response = await request(app)
        .post('/api/twilio/status')
        .set('X-Twilio-Signature', 'test-signature')
        .send({
          CallSid: 'CA123456789',
          CallStatus: 'completed',
          Duration: '120',
          From: '+0987654321',
          To: '+1234567890'
        });

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          duration: 120
        })
      );
      expect(eqMock).toHaveBeenCalledWith('call_sid', 'CA123456789');
    });

    it('should handle status callback without duration', async () => {
      mockValidateRequest.mockReturnValue(true);

      const updateMock = jest.fn().mockReturnThis();

      mockSupabaseFrom.mockImplementation(() => ({
        update: updateMock,
        eq: jest.fn().mockResolvedValue({ data: {}, error: null }),
      }));

      const response = await request(app)
        .post('/api/twilio/status')
        .send({
          CallSid: 'CA123456789',
          CallStatus: 'no-answer'
        });

      expect(response.status).toBe(200);
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'no-answer',
        })
      );
      expect(updateMock).toHaveBeenCalledWith(
        expect.not.objectContaining({
          duration: expect.anything()
        })
      );
    });

    it('should validate signature in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      mockValidateRequest.mockReturnValue(false);

      const response = await request(app)
        .post('/api/twilio/status')
        .set('X-Twilio-Signature', 'invalid-signature')
        .send({
          CallSid: 'CA123456789',
          CallStatus: 'completed'
        });

      expect(response.status).toBe(403);

      process.env.NODE_ENV = originalEnv;
    });

    it('should handle database update errors', async () => {
      mockValidateRequest.mockReturnValue(true);

      mockSupabaseFrom.mockImplementation(() => ({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ error: 'Database error' }),
      }));

      const response = await request(app)
        .post('/api/twilio/status')
        .send({
          CallSid: 'CA123456789',
          CallStatus: 'completed'
        });

      expect(response.status).toBe(500);
      expect(response.text).toBe('Internal Server Error');
    });
  });

  describe('TwiML Generation', () => {
    it('should include Stream element with correct parameters', async () => {
      mockValidateRequest.mockReturnValue(true);

      const mockPhoneMapping = {
        business_id: 'business-123',
        agent_id: 'agent-123',
        agents: { type: 'payment' }
      };

      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'phone_mappings') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockPhoneMapping, error: null }),
          };
        }
        if (table === 'call_logs') {
          return {
            insert: jest.fn().mockResolvedValue({ data: {}, error: null }),
          };
        }
      });

      const response = await request(app)
        .post('/api/twilio/webhook')
        .send({
          CallSid: 'CA123456789',
          From: '+0987654321',
          To: '+1234567890'
        });

      const twimlResponse = response.text;

      expect(twimlResponse).toContain('<Response>');
      expect(twimlResponse).toContain('<Say voice="Polly.Joanna"');
      expect(twimlResponse).toContain('Welcome to our business');
      expect(twimlResponse).toContain('<Connect>');
      expect(twimlResponse).toContain('<Stream');
      expect(twimlResponse).toContain('url="https://api.verbio.app/realtime"');
      expect(twimlResponse).toContain('track="both_tracks"');
      expect(twimlResponse).toContain('<Parameter name="businessId" value="business-123"/>');
      expect(twimlResponse).toContain('<Parameter name="agentType" value="payment"/>');
      expect(twimlResponse).toContain('<Parameter name="from" value="+0987654321"/>');
      expect(twimlResponse).toContain('</Stream>');
      expect(twimlResponse).toContain('</Connect>');
      expect(twimlResponse).toContain('</Response>');
    });
  });
});