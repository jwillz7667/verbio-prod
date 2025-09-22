import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { IJWTPayload } from '../types';

// Extend Request type to include business and user
declare global {
  namespace Express {
    interface Request {
      user?: IJWTPayload;
      business?: {
        id: string;
        name: string;
        userId: string;
        dataJson?: Record<string, any>;
        stripeCustomerId?: string;
        subscriptionTier?: string;
      };
    }
  }
}

export const requireBusinessMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Check if user is authenticated
    if (!req.user || !req.user.userId) {
      throw new AppError('Authentication required', 401);
    }

    // Get business ID from header, query, or body
    let businessId = req.headers['x-business-id'] as string ||
                     req.query.businessId as string ||
                     req.body?.businessId as string;

    // If no business ID provided, try to get the user's default business
    if (!businessId) {
      const { data: businesses, error } = await supabaseAdmin
        .from('businesses')
        .select('id, name, data_json, stripe_customer_id, subscription_tier')
        .eq('user_id', req.user.userId)
        .limit(1);

      if (error) {
        logger.error('Error fetching user businesses', { error, userId: req.user.userId });
        throw new AppError('Failed to fetch business information', 500);
      }

      if (!businesses || businesses.length === 0) {
        throw new AppError('No business found for this user', 404);
      }

      // Use the first (or only) business
      req.business = {
        id: businesses[0].id,
        name: businesses[0].name,
        userId: req.user.userId,
        dataJson: businesses[0].data_json,
        stripeCustomerId: businesses[0].stripe_customer_id,
        subscriptionTier: businesses[0].subscription_tier,
      };
    } else {
      // Verify that the business belongs to the user
      const { data: business, error } = await supabaseAdmin
        .from('businesses')
        .select('id, name, user_id, data_json, stripe_customer_id, subscription_tier')
        .eq('id', businessId)
        .eq('user_id', req.user.userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new AppError('Business not found or access denied', 404);
        }
        logger.error('Error fetching business', { error, businessId, userId: req.user.userId });
        throw new AppError('Failed to fetch business information', 500);
      }

      if (!business) {
        throw new AppError('Business not found or access denied', 404);
      }

      req.business = {
        id: business.id,
        name: business.name,
        userId: business.user_id,
        dataJson: business.data_json,
        stripeCustomerId: business.stripe_customer_id,
        subscriptionTier: business.subscription_tier,
      };
    }

    next();
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
    } else {
      logger.error('Unexpected error in requireBusinessMiddleware', { error });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};