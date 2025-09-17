import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/index';
import { supabaseAdmin } from '../../src/config/supabase';

jest.mock('../../src/config/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn(),
  },
  supabasePublic: {
    auth: {
      getUser: jest.fn(),
    },
  },
}));

const mockSupabaseFrom = supabaseAdmin.from as jest.Mock;

describe('Business Routes', () => {
  let authToken: string;
  const userId = 'user-123';
  const businessId = 'business-123';
  const agentId = 'agent-456';

  beforeEach(() => {
    jest.clearAllMocks();
    authToken = jwt.sign(
      { userId, email: 'test@example.com', businessId },
      process.env.JWT_SECRET || 'test-jwt-secret'
    );
  });

  describe('GET /api/business/:id', () => {
    it('should get business details with valid auth', async () => {
      const mockBusiness = {
        id: businessId,
        user_id: userId,
        name: 'Test Business',
        data_json: { menu: [], hours: {} },
        phone_mappings: [],
        agents: [],
        orders: [],
        payments: [],
        call_logs: [],
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

      const response = await request(app)
        .get(`/api/business/${businessId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.business).toMatchObject({
        id: businessId,
        name: 'Test Business',
      });
    });

    it('should return 403 for unauthorized business access', async () => {
      const otherBusinessId = 'other-business-456';
      const otherToken = jwt.sign(
        { userId: 'other-user', email: 'other@example.com', businessId: otherBusinessId },
        process.env.JWT_SECRET || 'test-jwt-secret'
      );

      mockSupabaseFrom.mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: 'Not found' }),
      }));

      const response = await request(app)
        .get(`/api/business/${businessId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Access denied');
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .get(`/api/business/${businessId}`);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('No authentication token provided');
    });
  });

  describe('PUT /api/business/:id/data', () => {
    it('should update business data successfully', async () => {
      const businessData = {
        menu: [
          {
            name: 'Pizza',
            description: 'Delicious cheese pizza',
            price: 12.99,
            category: 'Main',
            available: true,
          },
        ],
        hours: {
          monday: { open: '09:00', close: '21:00' },
          tuesday: { open: '09:00', close: '21:00' },
        },
        description: 'Best pizza in town',
        phone: '+12125551234',
      };

      mockSupabaseFrom.mockImplementation((table: string) => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: table === 'businesses' ? { id: businessId, user_id: userId, data_json: {} } : null,
          error: null,
        }),
        update: jest.fn().mockReturnThis(),
      }));

      const response = await request(app)
        .put(`/api/business/${businessId}/data`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(businessData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should validate menu item structure', async () => {
      const invalidData = {
        menu: [
          {
            name: 'Pizza',
            price: -5,
          },
        ],
      };

      const response = await request(app)
        .put(`/api/business/${businessId}/data`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('must be a positive number');
    });

    it('should validate business hours format', async () => {
      const invalidData = {
        hours: {
          monday: { open: '25:00', close: '21:00' },
        },
      };

      const response = await request(app)
        .put(`/api/business/${businessId}/data`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('pattern');
    });

    it('should return 403 when updating another business', async () => {
      const otherBusinessId = 'other-business-456';

      mockSupabaseFrom.mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: 'Not found' }),
      }));

      const response = await request(app)
        .put(`/api/business/${otherBusinessId}/data`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ description: 'New description' });

      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/business/:id/phone', () => {
    it('should create phone mapping successfully', async () => {
      const phoneData = {
        twilio_number: '+12125551234',
        agent_id: agentId,
      };

      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'phone_mappings') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: null, error: null }),
            insert: jest.fn().mockReturnThis(),
          };
        }
        if (table === 'agents') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: { id: agentId }, error: null }),
          };
        }
        if (table === 'businesses') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: { id: businessId, user_id: userId }, error: null }),
          };
        }
      });

      const response = await request(app)
        .post(`/api/business/${businessId}/phone`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(phoneData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.webhookUrl).toContain('/api/twilio/webhook');
    });

    it('should validate phone number format', async () => {
      const invalidPhone = {
        twilio_number: '123-456-7890',
        agent_id: agentId,
      };

      const response = await request(app)
        .post(`/api/business/${businessId}/phone`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidPhone);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('E.164 format');
    });

    it('should return 409 for duplicate phone mapping', async () => {
      const phoneData = {
        twilio_number: '+12125551234',
        agent_id: agentId,
      };

      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'phone_mappings') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { id: 'existing-mapping' },
              error: null,
            }),
          };
        }
        if (table === 'businesses') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: { id: businessId, user_id: userId }, error: null }),
          };
        }
      });

      const response = await request(app)
        .post(`/api/business/${businessId}/phone`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(phoneData);

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('This phone number is already mapped');
    });

    it('should return 404 for non-existent agent', async () => {
      const phoneData = {
        twilio_number: '+12125551234',
        agent_id: 'non-existent-agent',
      };

      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'phone_mappings') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        if (table === 'agents') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: null, error: 'Not found' }),
          };
        }
        if (table === 'businesses') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: { id: businessId, user_id: userId }, error: null }),
          };
        }
      });

      const response = await request(app)
        .post(`/api/business/${businessId}/phone`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(phoneData);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Agent not found');
    });
  });

  describe('POST /api/business/:id/agent', () => {
    it('should create agent successfully', async () => {
      const agentData = {
        name: 'Order Agent',
        type: 'order',
        prompt: 'You are a helpful order-taking assistant for our restaurant.',
        voice_config: {
          voice: 'alloy',
          temperature: 0.8,
        },
      };

      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'agents') {
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { id: 'new-agent-id', ...agentData, business_id: businessId },
              error: null,
            }),
          };
        }
        if (table === 'businesses') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: { id: businessId, user_id: userId }, error: null }),
          };
        }
      });

      const response = await request(app)
        .post(`/api/business/${businessId}/agent`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(agentData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.agent).toMatchObject({
        name: 'Order Agent',
        type: 'order',
      });
    });

    it('should validate agent type', async () => {
      const invalidAgent = {
        name: 'Invalid Agent',
        type: 'invalid-type',
        prompt: 'Test prompt',
      };

      const response = await request(app)
        .post(`/api/business/${businessId}/agent`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidAgent);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('must be one of');
    });

    it('should validate voice config', async () => {
      const invalidAgent = {
        name: 'Test Agent',
        type: 'service',
        prompt: 'Test prompt',
        voice_config: {
          voice: 'invalid-voice',
          temperature: 3,
        },
      };

      const response = await request(app)
        .post(`/api/business/${businessId}/agent`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidAgent);

      expect(response.status).toBe(400);
    });
  });

  describe('PUT /api/business/:id/agent/:agentId', () => {
    it('should update agent successfully', async () => {
      const updateData = {
        prompt: 'Updated prompt for the agent',
        voice_config: {
          temperature: 0.9,
        },
        is_active: false,
      };

      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'agents') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { id: agentId, business_id: businessId, voice_config: {} },
              error: null,
            }),
            update: jest.fn().mockReturnThis(),
          };
        }
        if (table === 'businesses') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: { id: businessId, user_id: userId }, error: null }),
          };
        }
      });

      const response = await request(app)
        .put(`/api/business/${businessId}/agent/${agentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should return 404 for non-existent agent', async () => {
      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'agents') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: null, error: 'Not found' }),
          };
        }
        if (table === 'businesses') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: { id: businessId, user_id: userId }, error: null }),
          };
        }
      });

      const response = await request(app)
        .put(`/api/business/${businessId}/agent/non-existent`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ prompt: 'Updated prompt' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Agent not found');
    });

    it('should merge voice config correctly', async () => {
      const existingVoiceConfig = {
        voice: 'alloy',
        temperature: 0.8,
        speed: 1.0,
      };

      const updateData = {
        voice_config: {
          temperature: 0.9,
          pitch: 1.2,
        },
      };

      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'agents') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { id: agentId, business_id: businessId, voice_config: existingVoiceConfig },
              error: null,
            }),
            update: jest.fn((data) => ({
              eq: jest.fn().mockReturnThis(),
              select: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue({
                data: { id: agentId, voice_config: { ...existingVoiceConfig, ...updateData.voice_config } },
                error: null,
              }),
            })),
          };
        }
        if (table === 'businesses') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: { id: businessId, user_id: userId }, error: null }),
          };
        }
      });

      const response = await request(app)
        .put(`/api/business/${businessId}/agent/${agentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.agent.voice_config).toMatchObject({
        voice: 'alloy',
        temperature: 0.9,
        speed: 1.0,
        pitch: 1.2,
      });
    });
  });

  describe('DELETE /api/business/:id/agent/:agentId', () => {
    it('should delete agent successfully', async () => {
      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'phone_mappings') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        if (table === 'agents') {
          return {
            delete: jest.fn().mockReturnThis(),
            eq: jest.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        if (table === 'businesses') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: { id: businessId, user_id: userId }, error: null }),
          };
        }
      });

      const response = await request(app)
        .delete(`/api/business/${businessId}/agent/${agentId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Agent deleted successfully');
    });

    it('should prevent deletion of agent with active phone mappings', async () => {
      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'phone_mappings') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockResolvedValue({
              data: [{ id: 'mapping-1' }],
              error: null,
            }),
          };
        }
        if (table === 'businesses') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: { id: businessId, user_id: userId }, error: null }),
          };
        }
      });

      const response = await request(app)
        .delete(`/api/business/${businessId}/agent/${agentId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(409);
      expect(response.body.error).toContain('Cannot delete agent with active phone mappings');
    });
  });

  describe('GET /api/business/:id/agents', () => {
    it('should list all agents for a business', async () => {
      const mockAgents = [
        {
          id: 'agent-1',
          name: 'Service Agent',
          type: 'service',
          is_active: true,
          phone_mappings: [],
        },
        {
          id: 'agent-2',
          name: 'Order Agent',
          type: 'order',
          is_active: true,
          phone_mappings: [{ id: 'mapping-1', twilio_number: '+12125551234' }],
        },
      ];

      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'agents') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockResolvedValue({ data: mockAgents, error: null }),
          };
        }
        if (table === 'businesses') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: { id: businessId, user_id: userId }, error: null }),
          };
        }
      });

      const response = await request(app)
        .get(`/api/business/${businessId}/agents`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.agents).toHaveLength(2);
      expect(response.body.agents[0]).toMatchObject({
        name: 'Service Agent',
        type: 'service',
      });
    });
  });

  describe('GET /api/business/:id/phones', () => {
    it('should list all phone mappings for a business', async () => {
      const mockPhoneMappings = [
        {
          id: 'mapping-1',
          twilio_number: '+12125551234',
          agent_id: 'agent-1',
          is_active: true,
          agents: {
            id: 'agent-1',
            name: 'Service Agent',
            type: 'service',
            is_active: true,
          },
        },
      ];

      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'phone_mappings') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockResolvedValue({ data: mockPhoneMappings, error: null }),
          };
        }
        if (table === 'businesses') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: { id: businessId, user_id: userId }, error: null }),
          };
        }
      });

      const response = await request(app)
        .get(`/api/business/${businessId}/phones`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.phone_mappings).toHaveLength(1);
      expect(response.body.phone_mappings[0]).toMatchObject({
        twilio_number: '+12125551234',
      });
    });
  });
});