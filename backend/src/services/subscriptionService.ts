import Stripe from 'stripe';
import { supabaseAdmin } from '../config/supabase';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';
import { tokenService } from './tokenService';

const stripe = new Stripe(config.get('STRIPE_SECRET_KEY'), {
  apiVersion: '2023-10-16',
  typescript: true,
});

export interface SubscriptionPlan {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  priceMonthly: number;
  priceYearly?: number;
  tokensPerMonth: number;
  rolloverEnabled: boolean;
  maxRolloverTokens: number;
  features: Record<string, any>;
  stripeProductId?: string;
  stripePriceMonthlyId?: string;
  stripePriceYearlyId?: string;
  isActive: boolean;
}

export interface BusinessSubscription {
  id: string;
  businessId: string;
  planId: string;
  plan?: SubscriptionPlan;
  status: 'active' | 'canceled' | 'past_due' | 'trialing' | 'paused';
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  canceledAt?: Date;
  trialStart?: Date;
  trialEnd?: Date;
  metadata?: Record<string, any>;
}

export interface TokenPackage {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  tokens: number;
  price: number;
  bonusTokens: number;
  stripeProductId?: string;
  stripePriceId?: string;
  isActive: boolean;
}

export class SubscriptionService {
  private static instance: SubscriptionService;
  private plansCache: Map<string, SubscriptionPlan> = new Map();
  private packagesCache: Map<string, TokenPackage> = new Map();
  private cacheExpiry: number = 10 * 60 * 1000; // 10 minutes
  private lastCacheUpdate: number = 0;

  private constructor() {}

  static getInstance(): SubscriptionService {
    if (!SubscriptionService.instance) {
      SubscriptionService.instance = new SubscriptionService();
    }
    return SubscriptionService.instance;
  }

  /**
   * Get all available subscription plans
   */
  async getPlans(activeOnly: boolean = true): Promise<SubscriptionPlan[]> {
    try {
      // Check cache
      if (this.plansCache.size > 0 && Date.now() - this.lastCacheUpdate < this.cacheExpiry) {
        const plans = Array.from(this.plansCache.values());
        return activeOnly ? plans.filter(p => p.isActive) : plans;
      }

      // Fetch from database
      let query = supabaseAdmin.from('subscription_plans').select('*').order('sort_order');

      if (activeOnly) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      // Update cache
      this.plansCache.clear();
      data?.forEach(plan => {
        const mappedPlan = this.mapToSubscriptionPlan(plan);
        this.plansCache.set(plan.id, mappedPlan);
      });
      this.lastCacheUpdate = Date.now();

      return data?.map(this.mapToSubscriptionPlan) || [];
    } catch (error) {
      logger.error('Error fetching subscription plans', { error });
      throw new AppError('Failed to fetch subscription plans', 500);
    }
  }

  /**
   * Get a specific plan
   */
  async getPlan(planId: string): Promise<SubscriptionPlan | null> {
    try {
      // Check cache first
      if (this.plansCache.has(planId)) {
        return this.plansCache.get(planId) || null;
      }

      const { data, error } = await supabaseAdmin
        .from('subscription_plans')
        .select('*')
        .eq('id', planId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }

      const plan = this.mapToSubscriptionPlan(data);
      this.plansCache.set(planId, plan);
      return plan;
    } catch (error) {
      logger.error('Error fetching plan', { error, planId });
      return null;
    }
  }

  /**
   * Get all available token packages
   */
  async getTokenPackages(activeOnly: boolean = true): Promise<TokenPackage[]> {
    try {
      // Check cache
      if (this.packagesCache.size > 0 && Date.now() - this.lastCacheUpdate < this.cacheExpiry) {
        const packages = Array.from(this.packagesCache.values());
        return activeOnly ? packages.filter(p => p.isActive) : packages;
      }

      // Fetch from database
      let query = supabaseAdmin.from('token_packages').select('*').order('sort_order');

      if (activeOnly) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      // Update cache
      this.packagesCache.clear();
      data?.forEach(pkg => {
        const mappedPkg = this.mapToTokenPackage(pkg);
        this.packagesCache.set(pkg.id, mappedPkg);
      });

      return data?.map(this.mapToTokenPackage) || [];
    } catch (error) {
      logger.error('Error fetching token packages', { error });
      throw new AppError('Failed to fetch token packages', 500);
    }
  }

  /**
   * Get current subscription for a business
   */
  async getCurrentSubscription(businessId: string): Promise<BusinessSubscription | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('business_subscriptions')
        .select(`
          *,
          plan:subscription_plans(*)
        `)
        .eq('business_id', businessId)
        .in('status', ['active', 'trialing'])
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }

      return this.mapToBusinessSubscription(data);
    } catch (error) {
      logger.error('Error fetching current subscription', { error, businessId });
      return null;
    }
  }

  /**
   * Create or update a subscription
   */
  async createOrUpdateSubscription(
    businessId: string,
    planId: string,
    billingPeriod: 'monthly' | 'yearly' = 'monthly',
    stripePaymentMethodId?: string
  ): Promise<BusinessSubscription> {
    try {
      // Get the plan details
      const plan = await this.getPlan(planId);
      if (!plan) {
        throw new AppError('Invalid plan selected', 400);
      }

      // Get or create Stripe customer
      const stripeCustomerId = await this.getOrCreateStripeCustomer(businessId);

      // Attach payment method if provided
      if (stripePaymentMethodId) {
        await stripe.paymentMethods.attach(stripePaymentMethodId, {
          customer: stripeCustomerId,
        });

        await stripe.customers.update(stripeCustomerId, {
          invoice_settings: {
            default_payment_method: stripePaymentMethodId,
          },
        });
      }

      // Check for existing subscription
      const existingSubscription = await this.getCurrentSubscription(businessId);

      let stripeSubscription: Stripe.Subscription;

      if (existingSubscription?.stripeSubscriptionId) {
        // Update existing Stripe subscription
        const currentStripeSubscription = await stripe.subscriptions.retrieve(
          existingSubscription.stripeSubscriptionId
        );

        const priceId = billingPeriod === 'yearly'
          ? plan.stripePriceYearlyId
          : plan.stripePriceMonthlyId;

        if (!priceId) {
          throw new AppError('Stripe price not configured for this plan', 500);
        }

        stripeSubscription = await stripe.subscriptions.update(
          existingSubscription.stripeSubscriptionId,
          {
            items: [{
              id: currentStripeSubscription.items.data[0].id,
              price: priceId,
            }],
            proration_behavior: 'always_invoice',
          }
        );

        // Update database record
        const { data, error } = await supabaseAdmin
          .from('business_subscriptions')
          .update({
            plan_id: planId,
            status: this.mapStripeStatus(stripeSubscription.status),
            current_period_start: new Date(stripeSubscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(stripeSubscription.current_period_end * 1000).toISOString(),
            metadata: {
              ...existingSubscription.metadata,
              billing_period: billingPeriod,
              updated_at: new Date().toISOString(),
            },
          })
          .eq('id', existingSubscription.id)
          .select(`*, plan:subscription_plans(*)`)
          .single();

        if (error) throw error;

        return this.mapToBusinessSubscription(data);
      } else {
        // Create new Stripe subscription
        const priceId = billingPeriod === 'yearly'
          ? plan.stripePriceYearlyId
          : plan.stripePriceMonthlyId;

        if (!priceId) {
          throw new AppError('Stripe price not configured for this plan', 500);
        }

        stripeSubscription = await stripe.subscriptions.create({
          customer: stripeCustomerId,
          items: [{ price: priceId }],
          trial_period_days: plan.name === 'free' ? 0 : 7, // 7-day trial for paid plans
          metadata: {
            businessId,
            planId,
            planName: plan.name,
          },
        });

        // Create database record
        const { data, error } = await supabaseAdmin
          .from('business_subscriptions')
          .insert({
            business_id: businessId,
            plan_id: planId,
            status: this.mapStripeStatus(stripeSubscription.status),
            stripe_subscription_id: stripeSubscription.id,
            stripe_customer_id: stripeCustomerId,
            current_period_start: new Date(stripeSubscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(stripeSubscription.current_period_end * 1000).toISOString(),
            trial_start: stripeSubscription.trial_start
              ? new Date(stripeSubscription.trial_start * 1000).toISOString()
              : null,
            trial_end: stripeSubscription.trial_end
              ? new Date(stripeSubscription.trial_end * 1000).toISOString()
              : null,
            metadata: {
              billing_period: billingPeriod,
              created_at: new Date().toISOString(),
            },
          })
          .select(`*, plan:subscription_plans(*)`)
          .single();

        if (error) throw error;

        // Grant initial tokens for the subscription
        await this.grantSubscriptionTokens(businessId, plan.tokensPerMonth, planId);

        return this.mapToBusinessSubscription(data);
      }
    } catch (error) {
      logger.error('Error creating/updating subscription', { error, businessId, planId });
      throw error instanceof AppError ? error : new AppError('Failed to process subscription', 500);
    }
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(
    businessId: string,
    immediately: boolean = false
  ): Promise<BusinessSubscription | null> {
    try {
      const subscription = await this.getCurrentSubscription(businessId);
      if (!subscription) {
        throw new AppError('No active subscription found', 404);
      }

      if (subscription.stripeSubscriptionId) {
        // Cancel Stripe subscription
        const stripeSubscription = await stripe.subscriptions.update(
          subscription.stripeSubscriptionId,
          {
            cancel_at_period_end: !immediately,
          }
        );

        if (immediately) {
          await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
        }
      }

      // Update database
      const { data, error } = await supabaseAdmin
        .from('business_subscriptions')
        .update({
          status: immediately ? 'canceled' : subscription.status,
          cancel_at_period_end: !immediately,
          canceled_at: new Date().toISOString(),
        })
        .eq('id', subscription.id)
        .select(`*, plan:subscription_plans(*)`)
        .single();

      if (error) throw error;

      return this.mapToBusinessSubscription(data);
    } catch (error) {
      logger.error('Error canceling subscription', { error, businessId });
      throw error instanceof AppError ? error : new AppError('Failed to cancel subscription', 500);
    }
  }

  /**
   * Purchase a token package
   */
  async purchaseTokenPackage(
    businessId: string,
    packageId: string,
    stripePaymentMethodId: string
  ): Promise<{ success: boolean; tokens: number; chargeId: string }> {
    try {
      // Get package details
      const pkg = this.packagesCache.get(packageId) || await this.getTokenPackage(packageId);
      if (!pkg) {
        throw new AppError('Invalid token package', 400);
      }

      // Get or create Stripe customer
      const stripeCustomerId = await this.getOrCreateStripeCustomer(businessId);

      // Create payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(pkg.price * 100), // Convert to cents
        currency: 'usd',
        customer: stripeCustomerId,
        payment_method: stripePaymentMethodId,
        confirm: true,
        metadata: {
          businessId,
          packageId,
          packageName: pkg.name,
          tokens: pkg.tokens.toString(),
          bonusTokens: pkg.bonusTokens.toString(),
        },
      });

      if (paymentIntent.status !== 'succeeded') {
        throw new AppError('Payment failed', 402);
      }

      // Add tokens to balance
      const totalTokens = pkg.tokens + pkg.bonusTokens;
      await tokenService.addTokens(
        businessId,
        totalTokens,
        'purchase',
        `Purchased ${pkg.displayName}`,
        {
          packageId,
          packageName: pkg.name,
          baseTokens: pkg.tokens,
          bonusTokens: pkg.bonusTokens,
          stripePaymentIntentId: paymentIntent.id,
        }
      );

      return {
        success: true,
        tokens: totalTokens,
        chargeId: paymentIntent.id,
      };
    } catch (error) {
      logger.error('Error purchasing token package', { error, businessId, packageId });
      throw error instanceof AppError ? error : new AppError('Failed to purchase tokens', 500);
    }
  }

  /**
   * Handle Stripe webhook events
   */
  async handleStripeWebhook(event: Stripe.Event): Promise<void> {
    try {
      switch (event.type) {
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
          const subscription = event.data.object as Stripe.Subscription;
          await this.syncStripeSubscription(subscription);
          break;
        }

        case 'invoice.payment_succeeded': {
          const invoice = event.data.object as Stripe.Invoice;
          if (invoice.subscription) {
            await this.handleSubscriptionRenewal(invoice);
          }
          break;
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object as Stripe.Invoice;
          if (invoice.subscription) {
            await this.handleFailedPayment(invoice);
          }
          break;
        }

        case 'payment_intent.succeeded': {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          if (paymentIntent.metadata?.packageId) {
            // Token package purchase already handled in purchaseTokenPackage
            logger.info('Token package purchase confirmed', {
              paymentIntentId: paymentIntent.id,
              metadata: paymentIntent.metadata,
            });
          }
          break;
        }

        default:
          logger.debug('Unhandled subscription webhook event', { type: event.type });
      }
    } catch (error) {
      logger.error('Error handling subscription webhook', { error, eventType: event.type });
      throw error;
    }
  }

  /**
   * Private helper methods
   */

  private async getOrCreateStripeCustomer(businessId: string): Promise<string> {
    try {
      // Check if business already has a Stripe customer ID
      const { data: business, error } = await supabaseAdmin
        .from('businesses')
        .select('stripe_customer_id, name, user_id')
        .eq('id', businessId)
        .single();

      if (error) throw error;

      if (business?.stripe_customer_id) {
        return business.stripe_customer_id;
      }

      // Get user email
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('email')
        .eq('id', business.user_id)
        .single();

      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: user?.email,
        metadata: {
          businessId,
          businessName: business.name,
        },
      });

      // Update business with Stripe customer ID
      await supabaseAdmin
        .from('businesses')
        .update({ stripe_customer_id: customer.id })
        .eq('id', businessId);

      return customer.id;
    } catch (error) {
      logger.error('Error creating Stripe customer', { error, businessId });
      throw new AppError('Failed to create customer account', 500);
    }
  }

  private async getTokenPackage(packageId: string): Promise<TokenPackage | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('token_packages')
        .select('*')
        .eq('id', packageId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }

      return this.mapToTokenPackage(data);
    } catch (error) {
      logger.error('Error fetching token package', { error, packageId });
      return null;
    }
  }

  private async syncStripeSubscription(stripeSubscription: Stripe.Subscription): Promise<void> {
    try {
      const businessId = stripeSubscription.metadata?.businessId;
      if (!businessId) return;

      const { error } = await supabaseAdmin
        .from('business_subscriptions')
        .update({
          status: this.mapStripeStatus(stripeSubscription.status),
          current_period_start: new Date(stripeSubscription.current_period_start * 1000).toISOString(),
          current_period_end: new Date(stripeSubscription.current_period_end * 1000).toISOString(),
          cancel_at_period_end: stripeSubscription.cancel_at_period_end,
        })
        .eq('stripe_subscription_id', stripeSubscription.id);

      if (error) throw error;
    } catch (error) {
      logger.error('Error syncing Stripe subscription', { error, subscriptionId: stripeSubscription.id });
    }
  }

  private async handleSubscriptionRenewal(invoice: Stripe.Invoice): Promise<void> {
    try {
      const businessId = invoice.metadata?.businessId || (invoice.customer as any)?.metadata?.businessId;
      if (!businessId) return;

      // Get subscription details
      const subscription = await this.getCurrentSubscription(businessId);
      if (!subscription || !subscription.plan) return;

      // Grant monthly tokens
      await this.grantSubscriptionTokens(
        businessId,
        subscription.plan.tokensPerMonth,
        subscription.planId
      );

      logger.info('Subscription renewed', {
        businessId,
        planId: subscription.planId,
        tokens: subscription.plan.tokensPerMonth,
      });
    } catch (error) {
      logger.error('Error handling subscription renewal', { error, invoiceId: invoice.id });
    }
  }

  private async handleFailedPayment(invoice: Stripe.Invoice): Promise<void> {
    try {
      const subscriptionId = invoice.subscription as string;
      if (!subscriptionId) return;

      // Update subscription status to past_due
      const { error } = await supabaseAdmin
        .from('business_subscriptions')
        .update({ status: 'past_due' })
        .eq('stripe_subscription_id', subscriptionId);

      if (error) throw error;

      logger.warn('Subscription payment failed', {
        invoiceId: invoice.id,
        subscriptionId,
      });
    } catch (error) {
      logger.error('Error handling failed payment', { error, invoiceId: invoice.id });
    }
  }

  private async grantSubscriptionTokens(
    businessId: string,
    tokens: number,
    planId: string
  ): Promise<void> {
    await tokenService.addTokens(
      businessId,
      tokens,
      'subscription',
      'Monthly subscription tokens',
      { planId, grantType: 'monthly_renewal' }
    );
  }

  private mapStripeStatus(status: Stripe.Subscription.Status): BusinessSubscription['status'] {
    switch (status) {
      case 'active':
        return 'active';
      case 'past_due':
        return 'past_due';
      case 'canceled':
      case 'unpaid':
        return 'canceled';
      case 'trialing':
        return 'trialing';
      case 'paused':
        return 'paused';
      default:
        return 'canceled';
    }
  }

  private mapToSubscriptionPlan(record: any): SubscriptionPlan {
    return {
      id: record.id,
      name: record.name,
      displayName: record.display_name,
      description: record.description,
      priceMonthly: parseFloat(record.price_monthly),
      priceYearly: record.price_yearly ? parseFloat(record.price_yearly) : undefined,
      tokensPerMonth: record.tokens_per_month,
      rolloverEnabled: record.rollover_enabled,
      maxRolloverTokens: record.max_rollover_tokens,
      features: record.features || {},
      stripeProductId: record.stripe_product_id,
      stripePriceMonthlyId: record.stripe_price_monthly_id,
      stripePriceYearlyId: record.stripe_price_yearly_id,
      isActive: record.is_active,
    };
  }

  private mapToBusinessSubscription(record: any): BusinessSubscription {
    return {
      id: record.id,
      businessId: record.business_id,
      planId: record.plan_id,
      plan: record.plan ? this.mapToSubscriptionPlan(record.plan) : undefined,
      status: record.status,
      stripeSubscriptionId: record.stripe_subscription_id,
      stripeCustomerId: record.stripe_customer_id,
      currentPeriodStart: new Date(record.current_period_start),
      currentPeriodEnd: new Date(record.current_period_end),
      cancelAtPeriodEnd: record.cancel_at_period_end,
      canceledAt: record.canceled_at ? new Date(record.canceled_at) : undefined,
      trialStart: record.trial_start ? new Date(record.trial_start) : undefined,
      trialEnd: record.trial_end ? new Date(record.trial_end) : undefined,
      metadata: record.metadata,
    };
  }

  private mapToTokenPackage(record: any): TokenPackage {
    return {
      id: record.id,
      name: record.name,
      displayName: record.display_name,
      description: record.description,
      tokens: record.tokens,
      price: parseFloat(record.price),
      bonusTokens: record.bonus_tokens,
      stripeProductId: record.stripe_product_id,
      stripePriceId: record.stripe_price_id,
      isActive: record.is_active,
    };
  }
}

export const subscriptionService = SubscriptionService.getInstance();