import Stripe from 'stripe';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/env';
import { supabaseAdmin } from '../config/supabase';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';

const stripe = new Stripe(config.get('STRIPE_SECRET_KEY'), {
  apiVersion: '2023-10-16',
  typescript: true,
});

export interface ChargeMetadata {
  businessId: string;
  orderId: string;
  customerId?: string;
  description?: string;
  items?: string;
  phoneNumber?: string;
  agentId?: string;
}

export class StripeService {
  async createCharge(amountCents: number, metadata: ChargeMetadata): Promise<Stripe.Charge> {
    try {
      if (!config.get('STRIPE_SECRET_KEY')) {
        throw new AppError('Stripe not configured', 500);
      }

      if (amountCents < 50) {
        throw new AppError('Amount must be at least $0.50', 400);
      }

      const idempotencyKey = uuidv4();

      const source = process.env.NODE_ENV === 'production'
        ? 'tok_visa'
        : 'tok_visa';

      const charge = await stripe.charges.create({
        amount: amountCents,
        currency: 'usd',
        source,
        description: metadata.description || `Order ${metadata.orderId}`,
        metadata: {
          ...metadata,
          environment: process.env.NODE_ENV || 'development',
          timestamp: new Date().toISOString(),
        },
      }, {
        idempotencyKey,
      });

      logger.info('Stripe charge created', {
        chargeId: charge.id,
        amount: charge.amount,
        orderId: metadata.orderId,
        businessId: metadata.businessId,
      });

      return charge;
    } catch (error) {
      logger.error('Error creating Stripe charge', {
        error,
        amountCents,
        metadata,
      });

      if (error instanceof Stripe.errors.StripeError) {
        throw new AppError(`Payment failed: ${error.message}`, 400);
      }

      throw error;
    }
  }

  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    try {
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

      if (!webhookSecret) {
        throw new AppError('Stripe webhook secret not configured', 500);
      }

      const event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret
      );

      logger.info('Stripe webhook received', {
        type: event.type,
        id: event.id,
      });

      switch (event.type) {
        case 'charge.succeeded': {
          const charge = event.data.object as Stripe.Charge;
          await this.handleChargeSucceeded(charge);
          break;
        }

        case 'charge.failed': {
          const charge = event.data.object as Stripe.Charge;
          await this.handleChargeFailed(charge);
          break;
        }

        case 'charge.refunded': {
          const charge = event.data.object as Stripe.Charge;
          await this.handleChargeRefunded(charge);
          break;
        }

        case 'payment_intent.succeeded': {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          logger.info('Payment intent succeeded', {
            id: paymentIntent.id,
            amount: paymentIntent.amount,
          });
          break;
        }

        case 'payment_intent.payment_failed': {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          logger.warn('Payment intent failed', {
            id: paymentIntent.id,
            error: paymentIntent.last_payment_error,
          });
          break;
        }

        default:
          logger.debug('Unhandled webhook event type', { type: event.type });
      }
    } catch (error) {
      logger.error('Error handling Stripe webhook', { error });
      throw error;
    }
  }

  private async handleChargeSucceeded(charge: Stripe.Charge): Promise<void> {
    try {
      const { data: payment, error: paymentError } = await supabaseAdmin
        .from('payments')
        .select('*')
        .eq('stripe_payment_id', charge.id)
        .single();

      if (paymentError && paymentError.code !== 'PGRST116') {
        throw paymentError;
      }

      if (payment) {
        const { error: updatePaymentError } = await supabaseAdmin
          .from('payments')
          .update({
            status: 'completed',
            payment_metadata: {
              ...payment.payment_metadata,
              stripe_status: charge.status,
              receipt_url: charge.receipt_url,
              paid_at: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', payment.id);

        if (updatePaymentError) {
          throw updatePaymentError;
        }

        if (payment.order_id) {
          const { error: updateOrderError } = await supabaseAdmin
            .from('orders')
            .update({
              payment_status: 'paid',
              updated_at: new Date().toISOString(),
            })
            .eq('id', payment.order_id);

          if (updateOrderError) {
            throw updateOrderError;
          }

          logger.info('Order payment status updated', {
            orderId: payment.order_id,
            paymentId: payment.id,
            chargeId: charge.id,
          });
        }
      } else {
        const orderId = charge.metadata?.orderId;
        const businessId = charge.metadata?.businessId;

        if (orderId && businessId) {
          const { data: newPayment, error: insertError } = await supabaseAdmin
            .from('payments')
            .insert({
              order_id: orderId,
              business_id: businessId,
              amount: charge.amount / 100,
              currency: charge.currency,
              status: 'completed',
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

          if (insertError) {
            throw insertError;
          }

          const { error: updateOrderError } = await supabaseAdmin
            .from('orders')
            .update({
              payment_status: 'paid',
              updated_at: new Date().toISOString(),
            })
            .eq('id', orderId);

          if (updateOrderError) {
            throw updateOrderError;
          }

          logger.info('Payment created from webhook', {
            paymentId: newPayment.id,
            orderId,
            chargeId: charge.id,
          });
        }
      }
    } catch (error) {
      logger.error('Error handling charge succeeded', {
        error,
        chargeId: charge.id,
      });
      throw error;
    }
  }

  private async handleChargeFailed(charge: Stripe.Charge): Promise<void> {
    try {
      const { data: payment } = await supabaseAdmin
        .from('payments')
        .select('*')
        .eq('stripe_payment_id', charge.id)
        .single();

      if (payment) {
        const { error: updateError } = await supabaseAdmin
          .from('payments')
          .update({
            status: 'failed',
            payment_metadata: {
              ...payment.payment_metadata,
              stripe_status: charge.status,
              failure_message: charge.failure_message,
              failure_code: charge.failure_code,
              failed_at: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', payment.id);

        if (updateError) {
          throw updateError;
        }

        if (payment.order_id) {
          const { error: updateOrderError } = await supabaseAdmin
            .from('orders')
            .update({
              payment_status: 'failed',
              updated_at: new Date().toISOString(),
            })
            .eq('id', payment.order_id);

          if (updateOrderError) {
            throw updateOrderError;
          }
        }

        logger.warn('Payment failed', {
          paymentId: payment.id,
          chargeId: charge.id,
          failureMessage: charge.failure_message,
        });
      }
    } catch (error) {
      logger.error('Error handling charge failed', {
        error,
        chargeId: charge.id,
      });
      throw error;
    }
  }

  private async handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
    try {
      const { data: payment } = await supabaseAdmin
        .from('payments')
        .select('*')
        .eq('stripe_payment_id', charge.id)
        .single();

      if (payment) {
        const refundAmount = charge.amount_refunded / 100;
        const isFullRefund = charge.amount_refunded === charge.amount;

        const { error: updateError } = await supabaseAdmin
          .from('payments')
          .update({
            status: isFullRefund ? 'refunded' : 'partially_refunded',
            payment_metadata: {
              ...payment.payment_metadata,
              stripe_status: charge.status,
              refunded_amount: refundAmount,
              refunded_at: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', payment.id);

        if (updateError) {
          throw updateError;
        }

        if (payment.order_id) {
          const { error: updateOrderError } = await supabaseAdmin
            .from('orders')
            .update({
              payment_status: isFullRefund ? 'refunded' : 'partially_refunded',
              updated_at: new Date().toISOString(),
            })
            .eq('id', payment.order_id);

          if (updateOrderError) {
            throw updateOrderError;
          }
        }

        logger.info('Payment refunded', {
          paymentId: payment.id,
          chargeId: charge.id,
          refundAmount,
          isFullRefund,
        });
      }
    } catch (error) {
      logger.error('Error handling charge refunded', {
        error,
        chargeId: charge.id,
      });
      throw error;
    }
  }

  async createPaymentIntent(
    amountCents: number,
    metadata: ChargeMetadata
  ): Promise<Stripe.PaymentIntent> {
    try {
      if (!config.get('STRIPE_SECRET_KEY')) {
        throw new AppError('Stripe not configured', 500);
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: 'usd',
        automatic_payment_methods: {
          enabled: true,
        },
        metadata: {
          ...metadata,
          environment: process.env.NODE_ENV || 'development',
        },
      });

      logger.info('Payment intent created', {
        id: paymentIntent.id,
        amount: paymentIntent.amount,
        metadata,
      });

      return paymentIntent;
    } catch (error) {
      logger.error('Error creating payment intent', {
        error,
        amountCents,
        metadata,
      });

      if (error instanceof Stripe.errors.StripeError) {
        throw new AppError(`Payment setup failed: ${error.message}`, 400);
      }

      throw error;
    }
  }

  async confirmPayment(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    try {
      const paymentIntent = await stripe.paymentIntents.confirm(paymentIntentId);

      logger.info('Payment intent confirmed', {
        id: paymentIntent.id,
        status: paymentIntent.status,
      });

      return paymentIntent;
    } catch (error) {
      logger.error('Error confirming payment intent', {
        error,
        paymentIntentId,
      });

      if (error instanceof Stripe.errors.StripeError) {
        throw new AppError(`Payment confirmation failed: ${error.message}`, 400);
      }

      throw error;
    }
  }

  async getCharge(chargeId: string): Promise<Stripe.Charge> {
    try {
      const charge = await stripe.charges.retrieve(chargeId);
      return charge;
    } catch (error) {
      logger.error('Error retrieving charge', {
        error,
        chargeId,
      });

      if (error instanceof Stripe.errors.StripeError) {
        throw new AppError(`Failed to retrieve charge: ${error.message}`, 400);
      }

      throw error;
    }
  }

  async refundCharge(chargeId: string, amountCents?: number): Promise<Stripe.Refund> {
    try {
      const refund = await stripe.refunds.create({
        charge: chargeId,
        ...(amountCents && { amount: amountCents }),
      });

      logger.info('Refund created', {
        refundId: refund.id,
        chargeId,
        amount: refund.amount,
      });

      return refund;
    } catch (error) {
      logger.error('Error creating refund', {
        error,
        chargeId,
        amountCents,
      });

      if (error instanceof Stripe.errors.StripeError) {
        throw new AppError(`Refund failed: ${error.message}`, 400);
      }

      throw error;
    }
  }
}

export const stripeService = new StripeService();