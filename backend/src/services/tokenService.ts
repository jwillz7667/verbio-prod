import { supabaseAdmin } from '../config/supabase';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';

export interface TokenBalance {
  id: string;
  businessId: string;
  currentBalance: number;
  totalPurchased: number;
  totalConsumed: number;
  totalBonus: number;
  lastRefillAt: Date | null;
  lowBalanceAlertSent: boolean;
}

export interface TokenTransaction {
  id?: string;
  businessId: string;
  type: 'purchase' | 'subscription' | 'usage' | 'refund' | 'bonus' | 'adjustment' | 'trial';
  amount: number;
  balanceBefore?: number;
  balanceAfter?: number;
  description: string;
  metadata?: Record<string, any>;
  referenceType?: string;
  referenceId?: string;
  stripePaymentId?: string;
}

export interface TokenRate {
  serviceType: string;
  tokensPerUnit: number;
  unitType: 'minute' | 'message' | 'request' | 'character';
  multipliers?: Record<string, number>;
}

export interface UsageTracking {
  businessId: string;
  serviceType: 'outbound_call' | 'inbound_call' | 'sms' | 'transcription' | 'ai_agent';
  referenceId?: string;
  tokensConsumed: number;
  durationSeconds?: number;
  multiplier?: number;
  metadata?: Record<string, any>;
}

export class TokenService {
  private static instance: TokenService;
  private tokenRatesCache: Map<string, TokenRate> = new Map();
  private cacheExpiry: number = 5 * 60 * 1000; // 5 minutes
  private lastCacheUpdate: number = 0;

  private constructor() {}

  static getInstance(): TokenService {
    if (!TokenService.instance) {
      TokenService.instance = new TokenService();
    }
    return TokenService.instance;
  }

  /**
   * Get or create token balance for a business
   */
  async getOrCreateBalance(businessId: string): Promise<TokenBalance> {
    try {
      // Try to get existing balance
      const { data: balance, error: fetchError } = await supabaseAdmin
        .from('token_balances')
        .select('*')
        .eq('business_id', businessId)
        .single();

      if (balance) {
        return this.mapToTokenBalance(balance);
      }

      // Check if this is a new business that should get trial tokens
      const { data: business, error: businessError } = await supabaseAdmin
        .from('businesses')
        .select('trial_tokens_granted, trial_tokens_used')
        .eq('id', businessId)
        .single();

      if (businessError) {
        throw businessError;
      }

      // Create new balance with trial tokens if applicable
      const initialBalance = business?.trial_tokens_used ? 0 : (business?.trial_tokens_granted || 100);

      const { data: newBalance, error: createError } = await supabaseAdmin
        .from('token_balances')
        .insert({
          business_id: businessId,
          current_balance: initialBalance,
          total_bonus: initialBalance,
        })
        .select()
        .single();

      if (createError) {
        throw createError;
      }

      // Mark trial tokens as used
      if (initialBalance > 0 && !business?.trial_tokens_used) {
        await supabaseAdmin
          .from('businesses')
          .update({ trial_tokens_used: true })
          .eq('id', businessId);

        // Log the trial token grant
        await this.logTransaction({
          businessId,
          type: 'trial',
          amount: initialBalance,
          description: 'Welcome bonus tokens',
          metadata: { source: 'signup_bonus' },
        });
      }

      return this.mapToTokenBalance(newBalance);
    } catch (error) {
      logger.error('Error getting/creating token balance', { error, businessId });
      throw new AppError('Failed to retrieve token balance', 500);
    }
  }

  /**
   * Check if business has sufficient tokens
   */
  async hassufficientTokens(businessId: string, requiredTokens: number): Promise<boolean> {
    try {
      const balance = await this.getOrCreateBalance(businessId);
      return balance.currentBalance >= requiredTokens;
    } catch (error) {
      logger.error('Error checking token balance', { error, businessId, requiredTokens });
      return false;
    }
  }

  /**
   * Deduct tokens from balance
   */
  async deductTokens(
    businessId: string,
    amount: number,
    description: string,
    metadata?: Record<string, any>
  ): Promise<TokenBalance> {
    try {
      const balance = await this.getOrCreateBalance(businessId);

      if (balance.currentBalance < amount) {
        throw new AppError('Insufficient token balance', 402);
      }

      const newBalance = balance.currentBalance - amount;
      const newTotalConsumed = balance.totalConsumed + amount;

      // Update balance
      const { data: updatedBalance, error: updateError } = await supabaseAdmin
        .from('token_balances')
        .update({
          current_balance: newBalance,
          total_consumed: newTotalConsumed,
          low_balance_alert_sent: newBalance < 100 ? true : balance.lowBalanceAlertSent,
        })
        .eq('business_id', businessId)
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      // Log transaction
      await this.logTransaction({
        businessId,
        type: 'usage',
        amount: -amount,
        balanceBefore: balance.currentBalance,
        balanceAfter: newBalance,
        description,
        metadata,
      });

      // Send low balance alert if needed
      if (newBalance < 100 && !balance.lowBalanceAlertSent) {
        await this.sendLowBalanceAlert(businessId, newBalance);
      }

      return this.mapToTokenBalance(updatedBalance);
    } catch (error) {
      logger.error('Error deducting tokens', { error, businessId, amount });
      throw error instanceof AppError ? error : new AppError('Failed to deduct tokens', 500);
    }
  }

  /**
   * Add tokens to balance (purchase, subscription, bonus)
   */
  async addTokens(
    businessId: string,
    amount: number,
    type: 'purchase' | 'subscription' | 'bonus' | 'refund' | 'adjustment',
    description: string,
    metadata?: Record<string, any>
  ): Promise<TokenBalance> {
    try {
      const balance = await this.getOrCreateBalance(businessId);
      const newBalance = balance.currentBalance + amount;

      let updateData: any = {
        current_balance: newBalance,
        low_balance_alert_sent: false, // Reset alert
      };

      // Update totals based on type
      if (type === 'purchase' || type === 'subscription') {
        updateData.total_purchased = balance.totalPurchased + amount;
        updateData.last_refill_at = new Date().toISOString();
      } else if (type === 'bonus') {
        updateData.total_bonus = balance.totalBonus + amount;
      }

      // Update balance
      const { data: updatedBalance, error: updateError } = await supabaseAdmin
        .from('token_balances')
        .update(updateData)
        .eq('business_id', businessId)
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      // Log transaction
      await this.logTransaction({
        businessId,
        type,
        amount,
        balanceBefore: balance.currentBalance,
        balanceAfter: newBalance,
        description,
        metadata,
      });

      return this.mapToTokenBalance(updatedBalance);
    } catch (error) {
      logger.error('Error adding tokens', { error, businessId, amount, type });
      throw new AppError('Failed to add tokens', 500);
    }
  }

  /**
   * Calculate tokens for a service
   */
  async calculateTokensForService(
    serviceType: string,
    duration?: number,
    options?: { multiplier?: number; metadata?: Record<string, any> }
  ): Promise<number> {
    try {
      const rate = await this.getTokenRate(serviceType);

      if (!rate) {
        logger.warn('No token rate found for service', { serviceType });
        return 0;
      }

      let baseTokens = 0;

      switch (rate.unitType) {
        case 'minute':
          baseTokens = (duration || 0) / 60 * rate.tokensPerUnit;
          break;
        case 'message':
        case 'request':
          baseTokens = rate.tokensPerUnit;
          break;
        case 'character':
          baseTokens = (duration || 0) * rate.tokensPerUnit;
          break;
      }

      // Apply multipliers
      const multiplier = options?.multiplier || 1.0;
      const finalTokens = baseTokens * multiplier;

      return Math.ceil(finalTokens * 100) / 100; // Round up to 2 decimal places
    } catch (error) {
      logger.error('Error calculating tokens', { error, serviceType, duration });
      return 0;
    }
  }

  /**
   * Track usage for a service
   */
  async trackUsage(usage: UsageTracking): Promise<void> {
    try {
      // Insert usage record
      const { error: insertError } = await supabaseAdmin
        .from('usage_tracking')
        .insert({
          business_id: usage.businessId,
          service_type: usage.serviceType,
          reference_id: usage.referenceId,
          tokens_consumed: usage.tokensConsumed,
          duration_seconds: usage.durationSeconds,
          multiplier: usage.multiplier || 1.0,
          metadata: usage.metadata || {},
        });

      if (insertError) {
        throw insertError;
      }

      // Deduct tokens from balance
      await this.deductTokens(
        usage.businessId,
        usage.tokensConsumed,
        `${usage.serviceType} usage`,
        {
          serviceType: usage.serviceType,
          referenceId: usage.referenceId,
          duration: usage.durationSeconds,
          ...usage.metadata,
        }
      );
    } catch (error) {
      logger.error('Error tracking usage', { error, usage });
    }
  }

  /**
   * Get token rate for a service
   */
  private async getTokenRate(serviceType: string): Promise<TokenRate | null> {
    try {
      // Check cache first
      if (this.tokenRatesCache.has(serviceType) && Date.now() - this.lastCacheUpdate < this.cacheExpiry) {
        return this.tokenRatesCache.get(serviceType) || null;
      }

      // Fetch from database
      const { data: rates, error } = await supabaseAdmin
        .from('token_rates')
        .select('*')
        .eq('is_active', true);

      if (error) {
        throw error;
      }

      // Update cache
      this.tokenRatesCache.clear();
      rates?.forEach(rate => {
        this.tokenRatesCache.set(rate.service_type, {
          serviceType: rate.service_type,
          tokensPerUnit: rate.tokens_per_unit,
          unitType: rate.unit_type,
          multipliers: rate.multipliers,
        });
      });
      this.lastCacheUpdate = Date.now();

      return this.tokenRatesCache.get(serviceType) || null;
    } catch (error) {
      logger.error('Error fetching token rate', { error, serviceType });
      return null;
    }
  }

  /**
   * Log a token transaction
   */
  private async logTransaction(transaction: TokenTransaction): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('token_transactions')
        .insert({
          business_id: transaction.businessId,
          type: transaction.type,
          amount: transaction.amount,
          balance_before: transaction.balanceBefore || 0,
          balance_after: transaction.balanceAfter || 0,
          description: transaction.description,
          metadata: transaction.metadata || {},
          reference_type: transaction.referenceType,
          reference_id: transaction.referenceId,
          stripe_payment_id: transaction.stripePaymentId,
        });

      if (error) {
        logger.error('Error logging transaction', { error, transaction });
      }
    } catch (error) {
      logger.error('Error logging transaction', { error, transaction });
    }
  }

  /**
   * Send low balance alert
   */
  private async sendLowBalanceAlert(businessId: string, currentBalance: number): Promise<void> {
    try {
      logger.info('Sending low balance alert', { businessId, currentBalance });
      // TODO: Implement email notification
      // This would integrate with your email service
    } catch (error) {
      logger.error('Error sending low balance alert', { error, businessId });
    }
  }

  /**
   * Get transaction history for a business
   */
  async getTransactionHistory(
    businessId: string,
    options?: { limit?: number; offset?: number; type?: string }
  ): Promise<TokenTransaction[]> {
    try {
      let query = supabaseAdmin
        .from('token_transactions')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false });

      if (options?.type) {
        query = query.eq('type', options.type);
      }

      if (options?.limit) {
        query = query.limit(options.limit);
      }

      if (options?.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      logger.error('Error fetching transaction history', { error, businessId });
      throw new AppError('Failed to fetch transaction history', 500);
    }
  }

  /**
   * Get usage statistics for a business
   */
  async getUsageStatistics(
    businessId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    totalTokensConsumed: number;
    byServiceType: Record<string, number>;
    dailyUsage: Array<{ date: string; tokens: number }>;
  }> {
    try {
      let query = supabaseAdmin
        .from('usage_tracking')
        .select('*')
        .eq('business_id', businessId);

      if (startDate) {
        query = query.gte('created_at', startDate.toISOString());
      }

      if (endDate) {
        query = query.lte('created_at', endDate.toISOString());
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      // Calculate statistics
      const stats = {
        totalTokensConsumed: 0,
        byServiceType: {} as Record<string, number>,
        dailyUsage: [] as Array<{ date: string; tokens: number }>,
      };

      const dailyMap = new Map<string, number>();

      data?.forEach(usage => {
        stats.totalTokensConsumed += usage.tokens_consumed;

        if (!stats.byServiceType[usage.service_type]) {
          stats.byServiceType[usage.service_type] = 0;
        }
        stats.byServiceType[usage.service_type] += usage.tokens_consumed;

        const date = new Date(usage.created_at).toISOString().split('T')[0];
        dailyMap.set(date, (dailyMap.get(date) || 0) + usage.tokens_consumed);
      });

      stats.dailyUsage = Array.from(dailyMap.entries())
        .map(([date, tokens]) => ({ date, tokens }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return stats;
    } catch (error) {
      logger.error('Error fetching usage statistics', { error, businessId });
      throw new AppError('Failed to fetch usage statistics', 500);
    }
  }

  /**
   * Map database record to TokenBalance interface
   */
  private mapToTokenBalance(record: any): TokenBalance {
    return {
      id: record.id,
      businessId: record.business_id,
      currentBalance: parseFloat(record.current_balance),
      totalPurchased: parseFloat(record.total_purchased || 0),
      totalConsumed: parseFloat(record.total_consumed || 0),
      totalBonus: parseFloat(record.total_bonus || 0),
      lastRefillAt: record.last_refill_at ? new Date(record.last_refill_at) : null,
      lowBalanceAlertSent: record.low_balance_alert_sent || false,
    };
  }
}

export const tokenService = TokenService.getInstance();