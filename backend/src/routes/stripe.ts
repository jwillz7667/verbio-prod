import { Router, Request, Response } from 'express';
import { stripeService } from '../services/stripeService';
import { logger } from '../utils/logger';

const router = Router();

router.post('/webhook',
  async (req: Request, res: Response) => {
    try {
      const sig = req.headers['stripe-signature'];

      if (!sig || typeof sig !== 'string') {
        logger.warn('Stripe webhook missing signature');
        return res.status(400).json({ error: 'Missing stripe-signature header' });
      }

      if (!req.body || !Buffer.isBuffer(req.body)) {
        logger.warn('Stripe webhook missing raw body');
        return res.status(400).json({ error: 'Webhook requires raw body' });
      }

      await stripeService.handleWebhook(req.body, sig);

      res.status(200).json({ received: true });
    } catch (error: any) {
      logger.error('Stripe webhook error', { error: error.message });

      if (error.message?.includes('Webhook signature verification failed')) {
        return res.status(400).json({ error: 'Invalid signature' });
      }

      res.status(400).json({ error: error.message || 'Webhook processing failed' });
    }
  }
);

router.post('/create-payment-intent', async (req: Request, res: Response) => {
  try {
    const { amount, metadata } = req.body;

    if (!amount || typeof amount !== 'number') {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    if (!metadata?.businessId || !metadata?.orderId) {
      return res.status(400).json({ error: 'Missing required metadata' });
    }

    const amountCents = Math.round(amount * 100);
    const paymentIntent = await stripeService.createPaymentIntent(amountCents, metadata);

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
    });
  } catch (error: any) {
    logger.error('Error creating payment intent', { error });
    res.status(500).json({ error: error.message || 'Failed to create payment intent' });
  }
});

router.post('/confirm-payment/:paymentIntentId', async (req: Request, res: Response) => {
  try {
    const { paymentIntentId } = req.params;

    if (!paymentIntentId) {
      return res.status(400).json({ error: 'Missing payment intent ID' });
    }

    const paymentIntent = await stripeService.confirmPayment(paymentIntentId);

    res.json({
      status: paymentIntent.status,
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
    });
  } catch (error: any) {
    logger.error('Error confirming payment', { error });
    res.status(500).json({ error: error.message || 'Failed to confirm payment' });
  }
});

router.get('/charge/:chargeId', async (req: Request, res: Response) => {
  try {
    const { chargeId } = req.params;

    if (!chargeId) {
      return res.status(400).json({ error: 'Missing charge ID' });
    }

    const charge = await stripeService.getCharge(chargeId);

    res.json({
      id: charge.id,
      amount: charge.amount,
      status: charge.status,
      receipt_url: charge.receipt_url,
      created: charge.created,
      metadata: charge.metadata,
    });
  } catch (error: any) {
    logger.error('Error retrieving charge', { error });
    res.status(500).json({ error: error.message || 'Failed to retrieve charge' });
  }
});

router.post('/refund/:chargeId', async (req: Request, res: Response) => {
  try {
    const { chargeId } = req.params;
    const { amount } = req.body;

    if (!chargeId) {
      return res.status(400).json({ error: 'Missing charge ID' });
    }

    const amountCents = amount ? Math.round(amount * 100) : undefined;
    const refund = await stripeService.refundCharge(chargeId, amountCents);

    res.json({
      id: refund.id,
      amount: refund.amount,
      status: refund.status,
      created: refund.created,
    });
  } catch (error: any) {
    logger.error('Error creating refund', { error });
    res.status(500).json({ error: error.message || 'Failed to create refund' });
  }
});

router.get('/health', (req: Request, res: Response) => {
  const hasStripeKey = !!process.env.STRIPE_SECRET_KEY;
  const hasWebhookSecret = !!process.env.STRIPE_WEBHOOK_SECRET;

  res.json({
    status: hasStripeKey && hasWebhookSecret ? 'healthy' : 'misconfigured',
    configured: {
      apiKey: hasStripeKey,
      webhookSecret: hasWebhookSecret,
    },
    timestamp: new Date().toISOString(),
  });
});

export const stripeRoutes = router;