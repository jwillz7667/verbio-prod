import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { requireBusinessMiddleware } from '../middleware/requireBusiness';
import { tokenService } from '../services/tokenService';
import { subscriptionService } from '../services/subscriptionService';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';

const router = Router();

// All routes require authentication and business
router.use(authenticate);
router.use(requireBusinessMiddleware);

/**
 * Get current token balance
 */
router.get('/balance', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const businessId = req.business?.id;
    if (!businessId) {
      throw new AppError('Business ID not found', 400);
    }

    const balance = await tokenService.getOrCreateBalance(businessId);

    res.json({
      balance: balance.currentBalance,
      totalPurchased: balance.totalPurchased,
      totalConsumed: balance.totalConsumed,
      totalBonus: balance.totalBonus,
      lastRefillAt: balance.lastRefillAt,
      lowBalanceAlert: balance.currentBalance < 100,
    });
  } catch (error) {
    logger.error('Error fetching token balance', { error, businessId: req.business?.id });
    next(error);
  }
});

/**
 * Get available subscription plans
 */
router.get('/plans', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const plans = await subscriptionService.getPlans(true);

    res.json({
      plans: plans.map(plan => ({
        id: plan.id,
        name: plan.name,
        displayName: plan.displayName,
        description: plan.description,
        priceMonthly: plan.priceMonthly,
        priceYearly: plan.priceYearly,
        tokensPerMonth: plan.tokensPerMonth,
        features: plan.features,
        rolloverEnabled: plan.rolloverEnabled,
        maxRolloverTokens: plan.maxRolloverTokens,
      })),
    });
  } catch (error) {
    logger.error('Error fetching subscription plans', { error });
    next(error);
  }
});

/**
 * Get available token packages
 */
router.get('/packages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const packages = await subscriptionService.getTokenPackages(true);

    res.json({
      packages: packages.map(pkg => ({
        id: pkg.id,
        name: pkg.name,
        displayName: pkg.displayName,
        description: pkg.description,
        tokens: pkg.tokens,
        bonusTokens: pkg.bonusTokens,
        totalTokens: pkg.tokens + pkg.bonusTokens,
        price: pkg.price,
        pricePerToken: pkg.price / (pkg.tokens + pkg.bonusTokens),
      })),
    });
  } catch (error) {
    logger.error('Error fetching token packages', { error });
    next(error);
  }
});

/**
 * Get current subscription
 */
router.get('/subscription', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const businessId = req.business?.id;
    if (!businessId) {
      throw new AppError('Business ID not found', 400);
    }

    const subscription = await subscriptionService.getCurrentSubscription(businessId);

    if (!subscription) {
      res.json({ subscription: null });
      return;
    }

    res.json({
      subscription: {
        id: subscription.id,
        planId: subscription.planId,
        plan: subscription.plan ? {
          name: subscription.plan.name,
          displayName: subscription.plan.displayName,
          tokensPerMonth: subscription.plan.tokensPerMonth,
          priceMonthly: subscription.plan.priceMonthly,
          priceYearly: subscription.plan.priceYearly,
        } : null,
        status: subscription.status,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        trialEnd: subscription.trialEnd,
      },
    });
  } catch (error) {
    logger.error('Error fetching subscription', { error, businessId: req.business?.id });
    next(error);
  }
});

/**
 * Create or update subscription
 */
router.post('/subscribe', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const businessId = req.business?.id;
    if (!businessId) {
      throw new AppError('Business ID not found', 400);
    }

    const { planId, billingPeriod, paymentMethodId } = req.body;

    if (!planId) {
      throw new AppError('Plan ID is required', 400);
    }

    const subscription = await subscriptionService.createOrUpdateSubscription(
      businessId,
      planId,
      billingPeriod || 'monthly',
      paymentMethodId
    );

    res.json({
      success: true,
      subscription: {
        id: subscription.id,
        planId: subscription.planId,
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
      },
    });
  } catch (error) {
    logger.error('Error creating subscription', { error, businessId: req.business?.id });
    next(error);
  }
});

/**
 * Cancel subscription
 */
router.delete('/subscription', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const businessId = req.business?.id;
    if (!businessId) {
      throw new AppError('Business ID not found', 400);
    }

    const { immediately } = req.query;
    const cancelImmediately = immediately === 'true';

    const subscription = await subscriptionService.cancelSubscription(businessId, cancelImmediately);

    res.json({
      success: true,
      message: cancelImmediately
        ? 'Subscription canceled immediately'
        : 'Subscription will be canceled at the end of the current period',
      subscription: subscription ? {
        id: subscription.id,
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        currentPeriodEnd: subscription.currentPeriodEnd,
      } : null,
    });
  } catch (error) {
    logger.error('Error canceling subscription', { error, businessId: req.business?.id });
    next(error);
  }
});

/**
 * Purchase token package
 */
router.post('/purchase', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const businessId = req.business?.id;
    if (!businessId) {
      throw new AppError('Business ID not found', 400);
    }

    const { packageId, paymentMethodId } = req.body;

    if (!packageId || !paymentMethodId) {
      throw new AppError('Package ID and payment method are required', 400);
    }

    const result = await subscriptionService.purchaseTokenPackage(
      businessId,
      packageId,
      paymentMethodId
    );

    res.json({
      success: result.success,
      tokensAdded: result.tokens,
      chargeId: result.chargeId,
    });
  } catch (error) {
    logger.error('Error purchasing tokens', { error, businessId: req.business?.id });
    next(error);
  }
});

/**
 * Get transaction history
 */
router.get('/transactions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const businessId = req.business?.id;
    if (!businessId) {
      throw new AppError('Business ID not found', 400);
    }

    const { limit = '50', offset = '0', type } = req.query;

    const transactions = await tokenService.getTransactionHistory(businessId, {
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
      type: type as string,
    });

    res.json({
      transactions: transactions.map(tx => ({
        id: tx.id,
        type: tx.type,
        amount: tx.amount,
        balanceBefore: tx.balanceBefore,
        balanceAfter: tx.balanceAfter,
        description: tx.description,
        createdAt: tx.metadata?.created_at || new Date().toISOString(),
      })),
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
  } catch (error) {
    logger.error('Error fetching transactions', { error, businessId: req.business?.id });
    next(error);
  }
});

/**
 * Get usage statistics
 */
router.get('/usage', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const businessId = req.business?.id;
    if (!businessId) {
      throw new AppError('Business ID not found', 400);
    }

    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate as string) : new Date();

    const stats = await tokenService.getUsageStatistics(businessId, start, end);

    res.json({
      totalTokensConsumed: stats.totalTokensConsumed,
      byServiceType: stats.byServiceType,
      dailyUsage: stats.dailyUsage,
      period: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
    });
  } catch (error) {
    logger.error('Error fetching usage statistics', { error, businessId: req.business?.id });
    next(error);
  }
});

/**
 * Get token rates
 */
router.get('/rates', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // This would be cached in production
    const rates = [
      { service: 'Outbound Calls', rate: 2.0, unit: 'per minute' },
      { service: 'Inbound Calls', rate: 1.5, unit: 'per minute' },
      { service: 'SMS Messages', rate: 0.5, unit: 'per message' },
      { service: 'Transcription', rate: 0.1, unit: 'per minute' },
      { service: 'AI Agent Requests', rate: 1.0, unit: 'per request' },
    ];

    res.json({ rates });
  } catch (error) {
    logger.error('Error fetching token rates', { error });
    next(error);
  }
});

/**
 * Estimate token usage
 */
router.post('/estimate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { serviceType, duration, quantity = 1 } = req.body;

    if (!serviceType) {
      throw new AppError('Service type is required', 400);
    }

    const tokensPerUnit = await tokenService.calculateTokensForService(
      serviceType,
      duration || 60 // Default to 1 minute
    );

    const totalTokens = tokensPerUnit * (quantity || 1);

    res.json({
      serviceType,
      duration: duration || 60,
      quantity: quantity || 1,
      tokensPerUnit,
      totalTokens,
      estimatedCost: totalTokens * 0.01, // Assuming $0.01 per token
    });
  } catch (error) {
    logger.error('Error estimating token usage', { error });
    next(error);
  }
});

export default router;