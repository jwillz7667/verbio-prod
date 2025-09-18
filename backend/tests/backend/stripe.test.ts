import { stripeService } from '../../src/services/stripeService';
import { supabaseAdmin } from '../../src/config/supabase';
import { logger } from '../../src/utils/logger';
import Stripe from 'stripe';

jest.mock('stripe');
jest.mock('../../src/config/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn(),
  },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const MockStripe = Stripe as jest.MockedClass<typeof Stripe>;
const mockSupabaseFrom = supabaseAdmin.from as jest.Mock;

describe('StripeService', () => {
  let mockStripeInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockStripeInstance = {
      charges: {
        create: jest.fn(),
        retrieve: jest.fn(),
      },
      webhooks: {
        constructEvent: jest.fn(),
      },
      paymentIntents: {
        create: jest.fn(),
        confirm: jest.fn(),
      },
      refunds: {
        create: jest.fn(),
      },
    };

    MockStripe.prototype = mockStripeInstance;
    (Stripe as any).mockImplementation(() => mockStripeInstance);

    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_123';
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  describe('createCharge', () => {
    it('should create a charge successfully', async () => {
      const mockCharge = {
        id: 'ch_test123',
        amount: 2000,
        currency: 'usd',
        status: 'succeeded',
        receipt_url: 'https://receipt.url',
        source: { id: 'tok_visa' },
        metadata: {
          businessId: 'business-123',
          orderId: 'order-456',
        },
      };

      mockStripeInstance.charges.create.mockResolvedValue(mockCharge);

      const result = await stripeService.createCharge(2000, {
        businessId: 'business-123',
        orderId: 'order-456',
        description: 'Test charge',
      });

      expect(result).toEqual(mockCharge);
      expect(mockStripeInstance.charges.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 2000,
          currency: 'usd',
          source: 'tok_visa',
          description: 'Test charge',
        }),
        expect.objectContaining({
          idempotencyKey: expect.any(String),
        })
      );
    });

    it('should throw error for amount less than 50 cents', async () => {
      await expect(
        stripeService.createCharge(49, {
          businessId: 'business-123',
          orderId: 'order-456',
        })
      ).rejects.toThrow('Amount must be at least $0.50');
    });

    it('should throw error when Stripe API key not configured', async () => {
      delete process.env.STRIPE_SECRET_KEY;

      await expect(
        stripeService.createCharge(1000, {
          businessId: 'business-123',
          orderId: 'order-456',
        })
      ).rejects.toThrow('Stripe not configured');
    });
  });

  describe('handleWebhook', () => {
    it('should handle charge.succeeded webhook', async () => {
      const mockCharge = {
        id: 'ch_test123',
        amount: 2000,
        currency: 'usd',
        status: 'succeeded',
        receipt_url: 'https://receipt.url',
        metadata: {
          businessId: 'business-123',
          orderId: 'order-456',
        },
      };

      const mockEvent = {
        type: 'charge.succeeded',
        id: 'evt_test123',
        data: {
          object: mockCharge,
        },
      };

      mockStripeInstance.webhooks.constructEvent.mockReturnValue(mockEvent);

      const mockPayment = {
        id: 'payment-789',
        order_id: 'order-456',
        payment_metadata: {},
      };

      const updateMock = jest.fn().mockResolvedValue({ data: {}, error: null });
      const selectMock = jest.fn().mockReturnThis();
      const singleMock = jest.fn().mockResolvedValue({ data: mockPayment, error: null });
      const eqMock = jest.fn().mockReturnThis();

      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'payments') {
          return {
            select: selectMock,
            eq: eqMock,
            single: singleMock,
            update: updateMock,
          };
        }
        if (table === 'orders') {
          return {
            update: updateMock,
            eq: eqMock,
          };
        }
        return {};
      });

      const rawBody = Buffer.from('test-body');
      const signature = 'test-signature';

      await stripeService.handleWebhook(rawBody, signature);

      expect(mockStripeInstance.webhooks.constructEvent).toHaveBeenCalledWith(
        rawBody,
        signature,
        'whsec_test_123'
      );

      expect(mockSupabaseFrom).toHaveBeenCalledWith('payments');
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
        })
      );
    });

    it('should handle charge.failed webhook', async () => {
      const mockCharge = {
        id: 'ch_test123',
        amount: 2000,
        status: 'failed',
        failure_message: 'Card declined',
        failure_code: 'card_declined',
        metadata: {
          businessId: 'business-123',
          orderId: 'order-456',
        },
      };

      const mockEvent = {
        type: 'charge.failed',
        id: 'evt_test123',
        data: {
          object: mockCharge,
        },
      };

      mockStripeInstance.webhooks.constructEvent.mockReturnValue(mockEvent);

      const mockPayment = {
        id: 'payment-789',
        order_id: 'order-456',
        payment_metadata: {},
      };

      const updateMock = jest.fn().mockResolvedValue({ data: {}, error: null });
      const selectMock = jest.fn().mockReturnThis();
      const singleMock = jest.fn().mockResolvedValue({ data: mockPayment, error: null });
      const eqMock = jest.fn().mockReturnThis();

      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'payments') {
          return {
            select: selectMock,
            eq: eqMock,
            single: singleMock,
            update: updateMock,
          };
        }
        if (table === 'orders') {
          return {
            update: updateMock,
            eq: eqMock,
          };
        }
        return {};
      });

      await stripeService.handleWebhook(Buffer.from('test'), 'sig');

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          payment_metadata: expect.objectContaining({
            failure_message: 'Card declined',
            failure_code: 'card_declined',
          }),
        })
      );
    });

    it('should handle charge.refunded webhook', async () => {
      const mockCharge = {
        id: 'ch_test123',
        amount: 2000,
        amount_refunded: 2000,
        status: 'succeeded',
        metadata: {
          businessId: 'business-123',
          orderId: 'order-456',
        },
      };

      const mockEvent = {
        type: 'charge.refunded',
        id: 'evt_test123',
        data: {
          object: mockCharge,
        },
      };

      mockStripeInstance.webhooks.constructEvent.mockReturnValue(mockEvent);

      const mockPayment = {
        id: 'payment-789',
        order_id: 'order-456',
        payment_metadata: {},
      };

      const updateMock = jest.fn().mockResolvedValue({ data: {}, error: null });
      const selectMock = jest.fn().mockReturnThis();
      const singleMock = jest.fn().mockResolvedValue({ data: mockPayment, error: null });
      const eqMock = jest.fn().mockReturnThis();

      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'payments') {
          return {
            select: selectMock,
            eq: eqMock,
            single: singleMock,
            update: updateMock,
          };
        }
        if (table === 'orders') {
          return {
            update: updateMock,
            eq: eqMock,
          };
        }
        return {};
      });

      await stripeService.handleWebhook(Buffer.from('test'), 'sig');

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'refunded',
          payment_metadata: expect.objectContaining({
            refunded_amount: 20,
            refunded_at: expect.any(String),
          }),
        })
      );
    });

    it('should create payment from webhook if not found', async () => {
      const mockCharge = {
        id: 'ch_test123',
        amount: 2000,
        currency: 'usd',
        status: 'succeeded',
        receipt_url: 'https://receipt.url',
        source: { id: 'src_123' },
        metadata: {
          businessId: 'business-123',
          orderId: 'order-456',
        },
      };

      const mockEvent = {
        type: 'charge.succeeded',
        id: 'evt_test123',
        data: {
          object: mockCharge,
        },
      };

      mockStripeInstance.webhooks.constructEvent.mockReturnValue(mockEvent);

      const insertMock = jest.fn().mockReturnThis();
      const selectMock = jest.fn().mockReturnThis();
      const singleMock = jest.fn().mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
        .mockResolvedValueOnce({ data: { id: 'new-payment' }, error: null });
      const updateMock = jest.fn().mockResolvedValue({ data: {}, error: null });
      const eqMock = jest.fn().mockReturnThis();

      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'payments') {
          return {
            select: selectMock,
            eq: eqMock,
            single: singleMock,
            insert: insertMock,
          };
        }
        if (table === 'orders') {
          return {
            update: updateMock,
            eq: eqMock,
          };
        }
        return {};
      });

      await stripeService.handleWebhook(Buffer.from('test'), 'sig');

      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          business_id: 'business-123',
          order_id: 'order-456',
          amount: 20,
          currency: 'usd',
          status: 'completed',
          stripe_payment_id: 'ch_test123',
        })
      );
    });

    it('should throw error for invalid webhook signature', async () => {
      mockStripeInstance.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Webhook signature verification failed');
      });

      await expect(
        stripeService.handleWebhook(Buffer.from('test'), 'invalid-sig')
      ).rejects.toThrow('Webhook signature verification failed');
    });

    it('should throw error when webhook secret not configured', async () => {
      delete process.env.STRIPE_WEBHOOK_SECRET;

      await expect(
        stripeService.handleWebhook(Buffer.from('test'), 'sig')
      ).rejects.toThrow('Stripe webhook secret not configured');
    });
  });

  describe('createPaymentIntent', () => {
    it('should create payment intent successfully', async () => {
      const mockPaymentIntent = {
        id: 'pi_test123',
        amount: 2000,
        currency: 'usd',
        status: 'requires_payment_method',
        client_secret: 'pi_test123_secret',
      };

      mockStripeInstance.paymentIntents.create.mockResolvedValue(mockPaymentIntent);

      const result = await stripeService.createPaymentIntent(2000, {
        businessId: 'business-123',
        orderId: 'order-456',
      });

      expect(result).toEqual(mockPaymentIntent);
      expect(mockStripeInstance.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 2000,
          currency: 'usd',
          automatic_payment_methods: { enabled: true },
        })
      );
    });
  });

  describe('confirmPayment', () => {
    it('should confirm payment intent successfully', async () => {
      const mockPaymentIntent = {
        id: 'pi_test123',
        amount: 2000,
        status: 'succeeded',
      };

      mockStripeInstance.paymentIntents.confirm.mockResolvedValue(mockPaymentIntent);

      const result = await stripeService.confirmPayment('pi_test123');

      expect(result).toEqual(mockPaymentIntent);
      expect(mockStripeInstance.paymentIntents.confirm).toHaveBeenCalledWith('pi_test123');
    });
  });

  describe('getCharge', () => {
    it('should retrieve charge successfully', async () => {
      const mockCharge = {
        id: 'ch_test123',
        amount: 2000,
        status: 'succeeded',
      };

      mockStripeInstance.charges.retrieve.mockResolvedValue(mockCharge);

      const result = await stripeService.getCharge('ch_test123');

      expect(result).toEqual(mockCharge);
      expect(mockStripeInstance.charges.retrieve).toHaveBeenCalledWith('ch_test123');
    });
  });

  describe('refundCharge', () => {
    it('should create full refund successfully', async () => {
      const mockRefund = {
        id: 're_test123',
        amount: 2000,
        status: 'succeeded',
        charge: 'ch_test123',
      };

      mockStripeInstance.refunds.create.mockResolvedValue(mockRefund);

      const result = await stripeService.refundCharge('ch_test123');

      expect(result).toEqual(mockRefund);
      expect(mockStripeInstance.refunds.create).toHaveBeenCalledWith({
        charge: 'ch_test123',
      });
    });

    it('should create partial refund successfully', async () => {
      const mockRefund = {
        id: 're_test123',
        amount: 1000,
        status: 'succeeded',
        charge: 'ch_test123',
      };

      mockStripeInstance.refunds.create.mockResolvedValue(mockRefund);

      const result = await stripeService.refundCharge('ch_test123', 1000);

      expect(result).toEqual(mockRefund);
      expect(mockStripeInstance.refunds.create).toHaveBeenCalledWith({
        charge: 'ch_test123',
        amount: 1000,
      });
    });
  });
});