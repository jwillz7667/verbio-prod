import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../utils/logger';

// HTTPS redirect middleware
export const httpsRedirect = (req: Request, res: Response, next: NextFunction) => {
  // Skip in development
  if (process.env['NODE_ENV'] === 'development') {
    return next();
  }

  // Check if request is secure
  const isSecure = req.secure ||
    req.header('x-forwarded-proto') === 'https' ||
    req.header('x-forwarded-ssl') === 'on';

  if (!isSecure) {
    const secureUrl = `https://${req.header('host')}${req.url}`;
    logger.info('Redirecting to HTTPS', { from: req.url, to: secureUrl });
    return res.redirect(301, secureUrl);
  }

  next();
};

// Idempotency key middleware for mutation operations
const idempotencyStore = new Map<string, { response: any; timestamp: number }>();

export const idempotencyMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Only apply to mutation methods
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return next();
  }

  const idempotencyKey = req.header('Idempotency-Key');
  if (!idempotencyKey) {
    return next();
  }

  // Check if we have a cached response
  const cached = idempotencyStore.get(idempotencyKey);
  if (cached) {
    // Return cached response if within 24 hours
    if (Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) {
      logger.info('Returning cached idempotent response', { key: idempotencyKey });
      return res.status(200).json(cached.response);
    }
    // Clean up old entry
    idempotencyStore.delete(idempotencyKey);
  }

  // Store the response for future requests
  const originalJson = res.json;
  res.json = function (data: any) {
    idempotencyStore.set(idempotencyKey, {
      response: data,
      timestamp: Date.now(),
    });
    return originalJson.call(this, data);
  };

  next();
};

// Clean up old idempotency records
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of idempotencyStore.entries()) {
    if (now - value.timestamp > 24 * 60 * 60 * 1000) {
      idempotencyStore.delete(key);
    }
  }
}, 60 * 60 * 1000);

// Security headers middleware
export const securityHeaders = (_req: Request, res: Response, next: NextFunction) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Enable XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions policy
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // Content Security Policy
  if (process.env['NODE_ENV'] === 'production') {
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com; " +
      "img-src 'self' data: https:; " +
      "connect-src 'self' wss: https:"
    );
  }

  next();
};

// Request signature verification for webhooks
export const verifyWebhookSignature = (secret: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const signature = req.header('X-Webhook-Signature');
    if (!signature) {
      logger.warn('Missing webhook signature');
      res.status(401).json({ error: 'Missing signature' });
      return;
    }

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (signature !== expectedSignature) {
      logger.warn('Invalid webhook signature', { received: signature });
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    next();
  };
};

// API key authentication middleware
export const apiKeyAuth = (req: Request, res: Response, next: NextFunction): void => {
  const apiKey = req.header('X-API-Key') || req.query['api_key'];

  if (!apiKey) {
    res.status(401).json({ error: 'API key required' });
    return;
  }

  // Validate API key (this should check against database in production)
  const validApiKeys = (process.env['VALID_API_KEYS'] || '').split(',');
  if (!validApiKeys.includes(apiKey as string)) {
    logger.warn('Invalid API key attempt', { apiKey, ip: req.ip });
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  next();
};

// Request logging with Sentry breadcrumbs
export const requestLogging = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();

  // Log request
  logger.info('Request received', {
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  // Add Sentry breadcrumb
  if (process.env['NODE_ENV'] === 'production' && (global as any).Sentry) {
    (global as any).Sentry.addBreadcrumb({
      category: 'request',
      message: `${req.method} ${req.path}`,
      level: 'info',
      data: {
        method: req.method,
        path: req.path,
        query: req.query,
      },
    });
  }

  // Log response
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info('Request completed', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
    });

    // Add Sentry breadcrumb for response
    if (process.env['NODE_ENV'] === 'production' && (global as any).Sentry) {
      (global as any).Sentry.addBreadcrumb({
        category: 'response',
        message: `${res.statusCode} ${req.method} ${req.path}`,
        level: res.statusCode >= 400 ? 'error' : 'info',
        data: {
          statusCode: res.statusCode,
          duration,
        },
      });
    }
  });

  next();
};