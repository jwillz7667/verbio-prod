import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '../config/supabase';
import { generateToken, setAuthCookie } from '../middleware/auth';
import { logger } from '../utils/logger';
import { asyncHandler } from '../utils/errorHandler';

const router = Router();

/**
 * Handle OAuth callback from Supabase
 * This endpoint handles the redirect after successful OAuth authentication
 */
router.post(
  '/callback',
  asyncHandler(async (req: Request, res: Response): Promise<Response> => {
    try {
      const { access_token, refresh_token, user } = req.body;

      if (!access_token || !user) {
        return res.status(400).json({
          success: false,
          message: 'Invalid OAuth callback data',
        });
      }

      const { id: supabaseUserId, email, user_metadata } = user;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Email not provided by OAuth provider',
        });
      }

      // Check if user exists in our database
      const { data: existingUser } = await supabaseAdmin.from('users').select('id, email').eq('email', email).single();

      let userId: string;
      let businessId: string | null = null;
      let businessName: string | null = null;
      let isNewUser = false;

      if (!existingUser) {
        // Create new user for OAuth
        userId = uuidv4();
        businessId = uuidv4();
        isNewUser = true;

        // Create user with OAuth provider info
        const { error: userError } = await supabaseAdmin.from('users').insert({
          id: userId,
          email,
          password_hash: `oauth_${supabaseUserId}`, // OAuth users don't have passwords
          auth_provider: user.app_metadata?.provider || 'google',
          auth_provider_id: supabaseUserId,
          metadata: {
            name: user_metadata?.name || user_metadata?.full_name,
            avatar_url: user_metadata?.avatar_url || user_metadata?.picture,
            provider: user.app_metadata?.provider || 'google',
          },
        });

        if (userError) {
          logger.error('Failed to create OAuth user', { error: userError, email });
          return res.status(500).json({
            success: false,
            message: 'Failed to create user account',
          });
        }

        // Create default business for new user
        const defaultBusinessName = user_metadata?.name ? `${user_metadata.name}'s Business` : 'My Business';

        const { error: businessError } = await supabaseAdmin.from('businesses').insert({
          id: businessId,
          user_id: userId,
          name: defaultBusinessName,
          data_json: {
            menu: [],
            hours: {},
            pricing: {},
            location: {},
            description: '',
            phone: '',
            email,
            website: '',
            features: [],
          },
        });

        if (businessError) {
          // Rollback user creation
          await supabaseAdmin.from('users').delete().eq('id', userId);

          logger.error('Failed to create business for OAuth user', { error: businessError });
          return res.status(500).json({
            success: false,
            message: 'Failed to create business account',
          });
        }

        businessName = defaultBusinessName;

        // Create default agent for new business
        await supabaseAdmin.from('agents').insert({
          id: uuidv4(),
          business_id: businessId,
          name: 'Default Assistant',
          type: 'service',
          prompt: `You are a helpful AI assistant for ${defaultBusinessName}. Please assist customers with their inquiries professionally and accurately.`,
          voice_config: {
            voice: 'cedar',
            language: 'en-US',
            pitch: 1.0,
            rate: 1.0,
          },
          is_active: true,
        });

        logger.info('New OAuth user created', { userId, email, businessId });
      } else {
        // Existing user - get their business
        userId = existingUser.id;

        const { data: business } = await supabaseAdmin
          .from('businesses')
          .select('id, name')
          .eq('user_id', userId)
          .single();

        if (business) {
          businessId = business.id;
          businessName = business.name;
        }

        // Update user's OAuth info if needed
        await supabaseAdmin
          .from('users')
          .update({
            auth_provider: user.app_metadata?.provider || 'google',
            auth_provider_id: supabaseUserId,
            metadata: {
              name: user_metadata?.name || user_metadata?.full_name,
              avatar_url: user_metadata?.avatar_url || user_metadata?.picture,
              provider: user.app_metadata?.provider || 'google',
              last_login: new Date().toISOString(),
            },
          })
          .eq('id', userId);

        logger.info('OAuth user logged in', { userId, email });
      }

      // Generate JWT token for our system
      const token = generateToken({
        userId,
        email,
        businessId: businessId || '',
      });

      // Store OAuth tokens for future API calls if needed
      await supabaseAdmin.from('user_sessions').upsert({
        user_id: userId,
        access_token,
        refresh_token,
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(), // 1 hour
        provider: user.app_metadata?.provider || 'google',
      });

      // Set auth cookie
      setAuthCookie(res, token);

      // Return user data and token
      return res.json({
        success: true,
        token,
        user: {
          id: userId,
          email,
          businessId,
          businessName,
          name: user_metadata?.name || user_metadata?.full_name,
          avatar_url: user_metadata?.avatar_url || user_metadata?.picture,
          isNewUser,
        },
      });
    } catch (error) {
      logger.error('OAuth callback error', { error });
      return res.status(500).json({
        success: false,
        message: 'OAuth authentication failed',
      });
    }
  })
);

/**
 * Link OAuth account to existing user
 */
router.post(
  '/link',
  asyncHandler(async (req: Request, res: Response): Promise<Response> => {
    const { email, password, provider, providerId } = req.body;

    if (!email || !password || !provider || !providerId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
      });
    }

    // Verify user credentials
    const { data: user } = await supabaseAdmin.from('users').select('id, password_hash').eq('email', email).single();

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    // For OAuth users, we can't verify password
    const bcrypt = require('bcryptjs');
    if (!user.password_hash.startsWith('oauth_')) {
      const isValid = await bcrypt.compare(password, user.password_hash);
      if (!isValid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials',
        });
      }
    }

    // Link OAuth account
    await supabaseAdmin
      .from('users')
      .update({
        auth_provider: provider,
        auth_provider_id: providerId,
      })
      .eq('id', user.id);

    logger.info('OAuth account linked', { userId: user.id, provider });

    return res.json({
      success: true,
      message: 'OAuth account linked successfully',
    });
  })
);

/**
 * Unlink OAuth account
 */
router.post(
  '/unlink',
  asyncHandler(async (req: Request, res: Response): Promise<Response> => {
    const { userId, provider } = req.body;

    if (!userId || !provider) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
      });
    }

    // Check if user has a password set
    const { data: user } = await supabaseAdmin.from('users').select('password_hash').eq('id', userId).single();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Don't allow unlinking if user doesn't have a password
    if (user.password_hash.startsWith('oauth_')) {
      return res.status(400).json({
        success: false,
        message: 'Please set a password before unlinking OAuth account',
      });
    }

    // Unlink OAuth account
    await supabaseAdmin
      .from('users')
      .update({
        auth_provider: null,
        auth_provider_id: null,
      })
      .eq('id', userId);

    // Remove OAuth session
    await supabaseAdmin.from('user_sessions').delete().eq('user_id', userId).eq('provider', provider);

    logger.info('OAuth account unlinked', { userId, provider });

    return res.json({
      success: true,
      message: 'OAuth account unlinked successfully',
    });
  })
);

export default router;
