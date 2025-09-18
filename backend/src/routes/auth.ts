import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import Joi from 'joi';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '../config/supabase';
import { authenticate, generateToken, setAuthCookie, clearAuthCookie, AuthRequest } from '../middleware/auth';
import { CustomError, ValidationError, AuthenticationError, ConflictError } from '../utils/errorHandler';
import { logger, logDatabase } from '../utils/logger';
import { asyncHandler } from '../utils/errorHandler';

const router = Router();

const registerSchema = Joi.object({
  email: Joi.string().email().required().trim().lowercase(),
  password: Joi.string().min(8).max(128).required(),
  businessName: Joi.string().min(2).max(255).required().trim(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required().trim().lowercase(),
  password: Joi.string().required(),
});

router.post('/register', asyncHandler(async (req: Request, res: Response) => {
  const { error, value } = registerSchema.validate(req.body);

  if (error) {
    throw new ValidationError(error.details[0]?.message || 'Validation error', error.details);
  }

  const { email, password, businessName } = value;

  const { data: existingUser } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('email', email)
    .single();

  if (existingUser) {
    throw new ConflictError('Email already registered');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const userId = uuidv4();
  const businessId = uuidv4();

  const { error: userError } = await supabaseAdmin
    .from('users')
    .insert({
      id: userId,
      email,
      password_hash: passwordHash,
    });

  if (userError) {
    logger.error('Failed to create user', { error: userError, email });
    throw new CustomError('Failed to create user', 500, 'USER_CREATE_ERROR');
  }

  const { error: businessError } = await supabaseAdmin
    .from('businesses')
    .insert({
      id: businessId,
      user_id: userId,
      name: businessName,
      data_json: {
        menu: [],
        hours: {},
        pricing: {},
        location: {},
        description: '',
        phone: '',
        email: email,
        website: '',
        features: [],
      },
    });

  if (businessError) {
    await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', userId);

    logger.error('Failed to create business', { error: businessError, userId });
    throw new CustomError('Failed to create business', 500, 'BUSINESS_CREATE_ERROR');
  }

  const token = generateToken({
    userId,
    email,
    businessId,
  });

  setAuthCookie(res, token);

  logDatabase('INSERT', 'users', { userId, email });
  logDatabase('INSERT', 'businesses', { businessId, businessName, userId });

  logger.info('User registered successfully', { userId, email, businessId });

  res.status(201).json({
    success: true,
    token,
    user: {
      id: userId,
      email,
      businessId,
      businessName,
    },
  });
}));

router.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const { error, value } = loginSchema.validate(req.body);

  if (error) {
    throw new ValidationError(error.details[0]?.message || 'Validation error', error.details);
  }

  const { email, password } = value;

  const { data: user, error: userError } = await supabaseAdmin
    .from('users')
    .select('id, email, password_hash')
    .eq('email', email)
    .single();

  if (userError || !user) {
    logger.warn('Login attempt with non-existent email', { email });
    throw new AuthenticationError('Invalid email or password');
  }

  const isValidPassword = await bcrypt.compare(password, user.password_hash);

  if (!isValidPassword) {
    logger.warn('Login attempt with invalid password', { email });
    throw new AuthenticationError('Invalid email or password');
  }

  const { data: business } = await supabaseAdmin
    .from('businesses')
    .select('id, name')
    .eq('user_id', user.id)
    .single();

  const token = generateToken({
    userId: user.id,
    email: user.email,
    businessId: business?.id,
  });

  setAuthCookie(res, token);

  logger.info('User logged in successfully', { userId: user.id, email });

  res.json({
    success: true,
    token,
    user: {
      id: user.id,
      email: user.email,
      businessId: business?.id,
      businessName: business?.name,
    },
  });
}));

router.post('/logout', (_req: Request, res: Response) => {
  clearAuthCookie(res);
  logger.info('User logged out');

  res.json({
    success: true,
    message: 'Logged out successfully',
  });
});

router.get('/profile', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    throw new AuthenticationError('User not authenticated');
  }

  const { data: userData, error: userError } = await supabaseAdmin
    .from('users')
    .select(`
      id,
      email,
      created_at,
      updated_at,
      businesses (
        id,
        name,
        data_json,
        created_at,
        updated_at,
        phone_mappings (
          id,
          twilio_number,
          agent_id,
          is_active,
          created_at,
          updated_at
        ),
        agents (
          id,
          name,
          type,
          prompt,
          voice_config,
          is_active,
          created_at,
          updated_at
        )
      )
    `)
    .eq('id', req.user.userId)
    .single();

  if (userError || !userData) {
    logger.error('Failed to fetch user profile', { error: userError, userId: req.user.userId });
    throw new CustomError('Failed to fetch profile', 500, 'PROFILE_FETCH_ERROR');
  }

  const business = userData.businesses?.[0];

  const { data: recentOrders } = await supabaseAdmin
    .from('orders')
    .select('id, customer_phone, total, status, payment_status, created_at')
    .eq('business_id', business?.id)
    .order('created_at', { ascending: false })
    .limit(10);

  const { data: recentCalls } = await supabaseAdmin
    .from('call_logs')
    .select('id, call_sid, from_number, duration, status, created_at')
    .eq('business_id', business?.id)
    .order('created_at', { ascending: false })
    .limit(10);

  const response = {
    id: userData.id,
    email: userData.email,
    created_at: userData.created_at,
    updated_at: userData.updated_at,
    business: business ? {
      id: business.id,
      name: business.name,
      data: business.data_json,
      phone_mappings: business.phone_mappings || [],
      agents: business.agents || [],
      recent_orders: recentOrders || [],
      recent_calls: recentCalls || [],
      created_at: business.created_at,
      updated_at: business.updated_at,
    } : null,
  };

  logger.info('Profile fetched successfully', { userId: req.user.userId });

  res.json({
    success: true,
    user: response,
  });
}));

router.get('/verify', authenticate, (req: AuthRequest, res: Response) => {
  res.json({
    success: true,
    valid: true,
    user: req.user,
  });
});

router.post('/refresh', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    throw new AuthenticationError('User not authenticated');
  }

  const newToken = generateToken({
    userId: req.user.userId,
    email: req.user.email,
    businessId: req.user.businessId || '',
  });

  setAuthCookie(res, newToken);

  logger.info('Token refreshed', { userId: req.user.userId });

  res.json({
    success: true,
    token: newToken,
  });
}));

router.put('/password', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    throw new AuthenticationError('User not authenticated');
  }

  const passwordSchema = Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().min(8).max(128).required(),
  });

  const { error, value } = passwordSchema.validate(req.body);

  if (error) {
    throw new ValidationError(error.details[0]?.message || 'Validation error', error.details);
  }

  const { currentPassword, newPassword } = value;

  const { data: user, error: userError } = await supabaseAdmin
    .from('users')
    .select('password_hash')
    .eq('id', req.user.userId)
    .single();

  if (userError || !user) {
    throw new CustomError('User not found', 404, 'USER_NOT_FOUND');
  }

  const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);

  if (!isValidPassword) {
    throw new AuthenticationError('Current password is incorrect');
  }

  const newPasswordHash = await bcrypt.hash(newPassword, 12);

  const { error: updateError } = await supabaseAdmin
    .from('users')
    .update({ password_hash: newPasswordHash })
    .eq('id', req.user.userId);

  if (updateError) {
    logger.error('Failed to update password', { error: updateError, userId: req.user.userId });
    throw new CustomError('Failed to update password', 500, 'PASSWORD_UPDATE_ERROR');
  }

  logger.info('Password updated successfully', { userId: req.user.userId });

  res.json({
    success: true,
    message: 'Password updated successfully',
  });
}));

export default router;