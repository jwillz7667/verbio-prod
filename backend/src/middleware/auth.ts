import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { supabasePublic, supabaseAdmin } from '../config/supabase';
import { AuthenticationError, CustomError } from '../utils/errorHandler';
import { logger } from '../utils/logger';
import { IJWTPayload } from '../types';

export interface AuthRequest extends Request {
  user?: IJWTPayload;
  token?: string;
}

const JWT_SECRET = config.get('JWT_SECRET');
const JWT_EXPIRY = config.get('JWT_EXPIRY');

export const extractToken = (req: AuthRequest): string | null => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }

  if (req.query && req.query.token && typeof req.query.token === 'string') {
    return req.query.token;
  }

  return null;
};

export const verifyToken = (token: string): IJWTPayload => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as IJWTPayload;
    return decoded;
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      throw new AuthenticationError('Token has expired');
    }
    if (error.name === 'JsonWebTokenError') {
      throw new AuthenticationError('Invalid token');
    }
    throw new AuthenticationError('Token verification failed');
  }
};

export const generateToken = (payload: Omit<IJWTPayload, 'iat' | 'exp'>): string =>
  jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRY as string | number,
    issuer: 'verbio-backend',
    audience: 'verbio-app',
  } as jwt.SignOptions);

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = extractToken(req);

    if (!token) {
      throw new AuthenticationError('No authentication token provided');
    }

    const decoded = verifyToken(token);

    try {
      const { data: userData, error: userError } = await supabasePublic.auth.getUser(token);

      if (userError || !userData?.user) {
        const { data: dbUser, error: dbError } = await supabaseAdmin
          .from('users')
          .select('id, email')
          .eq('id', decoded.userId)
          .single();

        if (dbError || !dbUser) {
          logger.warn('User not found in database', { userId: decoded.userId, error: dbError });
          throw new AuthenticationError('User not found');
        }

        decoded.email = dbUser.email;
      } else {
        decoded.email = userData.user.email || decoded.email;
      }
    } catch (supabaseError) {
      logger.debug('Supabase auth check failed, using JWT payload', { userId: decoded.userId });
    }

    req.user = decoded;
    req.token = token;

    logger.debug('Authentication successful', {
      userId: decoded.userId,
      email: decoded.email,
    });

    next();
  } catch (error) {
    if (error instanceof CustomError) {
      res.status(error.statusCode).json({ error: error.message });
    } else {
      logger.error('Authentication error', { error });
      res.status(401).json({ error: 'Authentication failed' });
    }
  }
};

export const optionalAuthenticate = async (req: AuthRequest, _res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = extractToken(req);

    if (!token) {
      return next();
    }

    const decoded = verifyToken(token);
    req.user = decoded;
    req.token = token;

    next();
  } catch (error) {
    logger.debug('Optional authentication failed, continuing without auth', { error });
    next();
  }
};

export const requireBusinessAccess = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw new AuthenticationError('Authentication required');
    }

    const businessId = req.params.businessId || req.body.businessId || req.query.businessId;

    if (!businessId) {
      return next();
    }

    const { data: business, error } = await supabaseAdmin
      .from('businesses')
      .select('id, user_id')
      .eq('id', businessId)
      .eq('user_id', req.user.userId)
      .single();

    if (error || !business) {
      logger.warn('Business access denied', {
        userId: req.user.userId,
        businessId,
        error,
      });
      throw new AuthenticationError('Access denied to this business');
    }

    req.user.businessId = businessId;
    next();
  } catch (error) {
    if (error instanceof CustomError) {
      res.status(error.statusCode).json({ error: error.message });
    } else {
      logger.error('Business access check error', { error });
      res.status(403).json({ error: 'Access denied' });
    }
  }
};

export const refreshToken = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      throw new AuthenticationError('No user in request');
    }

    const newToken = generateToken({
      userId: req.user.userId,
      email: req.user.email,
      businessId: req.user.businessId || '',
    });

    res.cookie('token', newToken, {
      httpOnly: true,
      secure: config.isProduction(),
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    });

    res.json({
      success: true,
      token: newToken,
      expiresIn: JWT_EXPIRY,
    });
  } catch (error) {
    logger.error('Token refresh error', { error });
    res.status(401).json({ error: 'Failed to refresh token' });
  }
};

export const clearAuthCookie = (res: Response): void => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: config.isProduction(),
    sameSite: 'strict',
    path: '/',
  });
};

export const setAuthCookie = (res: Response, token: string): void => {
  res.cookie('token', token, {
    httpOnly: true,
    secure: config.isProduction(),
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/',
  });
};

export default authenticate;
