import { tool } from '@openai/agents';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { stripeService } from '../../services/stripeService';
import { supabaseAdmin } from '../../config/supabase';
import Logger from '../../utils/logger';

const logger = Logger;

export class PaymentProcessingTool {
  static processPayment = tool({
    name: 'process_payment',
    description: 'Process a payment for an order using Stripe',
    parameters: z.object({
      amount: z.number().positive().describe('Payment amount in dollars'),
      orderId: z.string().nullable().describe('Order ID to associate with payment'),
      paymentMethod: z.enum(['card', 'cash', 'digital_wallet']).default('card'),
      cardLast4: z.string().nullable().describe('Last 4 digits of card'),
      tip: z.number().nullable().default(0).describe('Tip amount'),
    }),
    execute: async (input, context: any) => {
      try {
        const totalAmount = input.amount + (input.tip || 0);
        const amountCents = Math.round(totalAmount * 100);
        const orderId = input.orderId || uuidv4();

        // Process payment through Stripe
        const charge = await stripeService.createCharge(amountCents, {
          businessId: context.businessId,
          orderId,
          phoneNumber: context.customerId || '',
          description: `Payment for order ${orderId}`,
          agentId: context.sessionId || '',
        });

        // Record payment in database
        const paymentData = {
          id: uuidv4(),
          business_id: context.businessId,
          order_id: orderId,
          amount: totalAmount,
          currency: 'usd',
          status: charge.status === 'succeeded' ? 'completed' : 'failed',
          payment_method: input.paymentMethod,
          stripe_payment_id: charge.id,
          payment_metadata: {
            receipt_url: charge.receipt_url,
            stripe_status: charge.status,
            source: 'agent_tool',
            tip_amount: input.tip,
            card_last4: input.cardLast4,
          },
        };

        const { data: payment, error } = await supabaseAdmin.from('payments').insert(paymentData).select().single();

        if (error) {
          logger.error('Failed to record payment', { error });
        }

        // Update order payment status if orderId provided
        if (input.orderId) {
          await supabaseAdmin
            .from('orders')
            .update({
              payment_status: charge.status === 'succeeded' ? 'paid' : 'failed',
              updated_at: new Date().toISOString(),
            })
            .eq('id', input.orderId);
        }

        logger.info('Payment processed', {
          paymentId: payment?.id,
          chargeId: charge.id,
          amount: totalAmount,
          status: charge.status,
        });

        return {
          success: charge.status === 'succeeded',
          paymentId: payment?.id,
          chargeId: charge.id,
          amount: totalAmount,
          tip: input.tip,
          receiptUrl: charge.receipt_url,
          message:
            charge.status === 'succeeded'
              ? `Payment of $${totalAmount.toFixed(2)} processed successfully`
              : 'Payment failed. Please try another payment method.',
        };
      } catch (error) {
        logger.error('Failed to process payment', { error, input });
        return {
          success: false,
          error: 'Payment processing failed. Please try again.',
        };
      }
    },
  });

  static refundPayment = tool({
    name: 'refund_payment',
    description: 'Process a refund for a previous payment',
    parameters: z.object({
      paymentId: z.string().describe('Payment ID to refund'),
      amount: z.number().nullable().describe('Partial refund amount (full if not specified)'),
      reason: z.string().nullable().describe('Refund reason'),
    }),
    execute: async (input, context: any) => {
      try {
        // Get payment details
        const { data: payment, error: fetchError } = await supabaseAdmin
          .from('payments')
          .select('*')
          .eq('id', input.paymentId)
          .eq('business_id', context.businessId)
          .single();

        if (fetchError || !payment) {
          return {
            success: false,
            error: 'Payment not found',
          };
        }

        if (payment.status !== 'completed') {
          return {
            success: false,
            error: 'Can only refund completed payments',
          };
        }

        const refundAmount = input.amount || payment.amount;
        const refundAmountCents = Math.round(refundAmount * 100);

        // Process refund through Stripe
        const refund = await stripeService.refundCharge(payment.stripe_payment_id, refundAmountCents);

        // Update payment record
        const { error: updateError } = await supabaseAdmin
          .from('payments')
          .update({
            status: refund.status === 'succeeded' ? 'refunded' : payment.status,
            payment_metadata: {
              ...payment.payment_metadata,
              refund_id: refund.id,
              refund_amount: refundAmount,
              refund_reason: input.reason,
              refunded_at: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', input.paymentId);

        if (updateError) {
          logger.error('Failed to update payment record', { error: updateError });
        }

        logger.info('Refund processed', {
          paymentId: input.paymentId,
          refundId: refund.id,
          amount: refundAmount,
        });

        return {
          success: refund.status === 'succeeded',
          refundId: refund.id,
          amount: refundAmount,
          message: `Refund of $${refundAmount.toFixed(2)} processed successfully`,
        };
      } catch (error) {
        logger.error('Failed to process refund', { error, input });
        return {
          success: false,
          error: 'Refund processing failed',
        };
      }
    },
  });

  static getPaymentStatus = tool({
    name: 'get_payment_status',
    description: 'Get the status of a payment',
    parameters: z.object({
      paymentId: z.string().nullable().describe('Payment ID'),
      orderId: z.string().nullable().describe('Order ID'),
    }),
    execute: async (input, context: any) => {
      try {
        if (!input.paymentId && !input.orderId) {
          return {
            success: false,
            error: 'Either paymentId or orderId is required',
          };
        }

        let query = supabaseAdmin.from('payments').select('*').eq('business_id', context.businessId);

        if (input.paymentId) {
          query = query.eq('id', input.paymentId);
        } else if (input.orderId) {
          query = query.eq('order_id', input.orderId);
        }

        const { data: payment, error } = await query.single();

        if (error || !payment) {
          return {
            success: false,
            error: 'Payment not found',
          };
        }

        logger.info('Payment status retrieved', {
          paymentId: payment.id,
          status: payment.status,
        });

        return {
          success: true,
          paymentId: payment.id,
          orderId: payment.order_id,
          status: payment.status,
          amount: payment.amount,
          paymentMethod: payment.payment_method,
          receiptUrl: payment.payment_metadata?.receipt_url,
          refunded: payment.status === 'refunded',
          refundAmount: payment.payment_metadata?.refund_amount,
          createdAt: payment.created_at,
          message: `Payment is ${payment.status}`,
        };
      } catch (error) {
        logger.error('Failed to get payment status', { error, input });
        return {
          success: false,
          error: 'Failed to retrieve payment status',
        };
      }
    },
  });
}
