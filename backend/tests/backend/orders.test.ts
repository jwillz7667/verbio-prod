import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/index';
import { supabaseAdmin } from '../../src/config/supabase';

jest.mock('../../src/config/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn(),
  },
}));

const mockSupabaseFrom = supabaseAdmin.from as jest.Mock;

describe('Orders Routes', () => {
  const validToken = jwt.sign(
    { userId: 'user-123', email: 'test@example.com', businessId: 'business-123' },
    process.env.JWT_SECRET || 'test-jwt-secret'
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/orders', () => {
    it('should fetch orders for authenticated user', async () => {
      const mockOrders = [
        {
          id: 'order-1',
          business_id: 'business-123',
          customer_phone: '+1234567890',
          items: [{ name: 'Pizza', quantity: 2, price: 20 }],
          total: 40,
          status: 'pending',
          payment_status: 'pending',
          created_at: '2024-01-01T00:00:00Z',
          businesses: {
            id: 'business-123',
            name: 'Test Business',
            user_id: 'user-123',
          },
          payments: []
        },
        {
          id: 'order-2',
          business_id: 'business-123',
          customer_phone: '+0987654321',
          items: [{ name: 'Burger', quantity: 1, price: 15 }],
          total: 15,
          status: 'delivered',
          payment_status: 'paid',
          created_at: '2024-01-02T00:00:00Z',
          businesses: {
            id: 'business-123',
            name: 'Test Business',
            user_id: 'user-123',
          },
          payments: [
            {
              id: 'payment-1',
              amount: 15,
              status: 'succeeded',
              payment_method: 'card',
              stripe_payment_intent_id: 'pi_test123',
              created_at: '2024-01-02T00:00:00Z'
            }
          ]
        }
      ];

      mockSupabaseFrom.mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({ data: mockOrders, error: null }),
      }));

      const response = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.orders)).toBe(true);
      expect(response.body.orders).toHaveLength(2);
      expect(response.body.orders[0]).toMatchObject({
        id: 'order-1',
        status: 'pending',
        total: 40
      });
      expect(response.body.pagination).toBeDefined();
    });

    it('should filter orders by status', async () => {
      const mockOrders = [
        {
          id: 'order-1',
          status: 'pending',
          businesses: {
            id: 'business-123',
            user_id: 'user-123'
          },
          payments: []
        }
      ];

      mockSupabaseFrom.mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({ data: mockOrders, error: null }),
      }));

      const response = await request(app)
        .get('/api/orders?status=pending')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.orders).toHaveLength(1);
      expect(response.body.orders[0].status).toBe('pending');
    });

    it('should handle pagination', async () => {
      mockSupabaseFrom.mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({ data: [], error: null, count: 50 }),
      }));

      const response = await request(app)
        .get('/api/orders?page=2&limit=10')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.pagination).toMatchObject({
        page: 2,
        limit: 10
      });
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/orders');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('No authentication token provided');
    });

    it('should handle database errors', async () => {
      mockSupabaseFrom.mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({ data: null, error: 'Database error' }),
      }));

      const response = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to fetch orders');
    });
  });

  describe('GET /api/orders/:id', () => {
    it('should fetch single order by id', async () => {
      const mockOrder = {
        id: 'order-123',
        business_id: 'business-123',
        customer_phone: '+1234567890',
        items: [{ name: 'Pizza', quantity: 2, price: 20 }],
        total: 40,
        status: 'pending',
        businesses: {
          id: 'business-123',
          name: 'Test Business',
          user_id: 'user-123',
        },
        payments: []
      };

      mockSupabaseFrom.mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockOrder, error: null }),
      }));

      const response = await request(app)
        .get('/api/orders/order-123')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.order).toMatchObject({
        id: 'order-123',
        total: 40
      });
    });

    it('should return 404 for non-existent order', async () => {
      mockSupabaseFrom.mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: 'Not found' }),
      }));

      const response = await request(app)
        .get('/api/orders/invalid-id')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Order not found');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/orders/order-123');

      expect(response.status).toBe(401);
    });
  });

  describe('PUT /api/orders/:id/status', () => {
    it('should update order status', async () => {
      const mockOrder = {
        id: 'order-123',
        businesses: {
          user_id: 'user-123'
        }
      };

      const updatedOrder = {
        ...mockOrder,
        status: 'confirmed',
        updated_at: '2024-01-01T00:00:00Z'
      };

      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'orders') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockOrder, error: null }),
            update: jest.fn().mockReturnThis(),
          };
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: updatedOrder, error: null }),
        };
      });

      const response = await request(app)
        .put('/api/orders/order-123/status')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ status: 'confirmed' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.order.status).toBe('confirmed');
    });

    it('should validate status value', async () => {
      const response = await request(app)
        .put('/api/orders/order-123/status')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ status: 'invalid-status' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid status');
    });

    it('should return 404 for non-existent order', async () => {
      mockSupabaseFrom.mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: 'Not found' }),
      }));

      const response = await request(app)
        .put('/api/orders/invalid-id/status')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ status: 'confirmed' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Order not found or access denied');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .put('/api/orders/order-123/status')
        .send({ status: 'confirmed' });

      expect(response.status).toBe(401);
    });
  });
});