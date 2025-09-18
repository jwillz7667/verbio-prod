import { Request, Response, NextFunction } from 'express';
import xss from 'xss';
import validator from 'validator';
import { logger } from '../utils/logger';

const sanitizeString = (value: any): string => {
  if (typeof value !== 'string') return value;

  // Remove XSS attempts
  let sanitized = xss(value, {
    whiteList: {},
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script'],
  });

  // Remove SQL injection attempts
  sanitized = sanitized.replace(/(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|CREATE|ALTER|EXEC|EXECUTE|SCRIPT|JAVASCRIPT|EVAL)\b)/gi, '');

  // Trim and normalize whitespace
  sanitized = validator.trim(sanitized);
  sanitized = validator.stripLow(sanitized);

  return sanitized;
};

const sanitizeObject = (obj: any): any => {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return sanitizeString(obj);
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }

  const sanitized: any = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      // Sanitize the key itself
      const sanitizedKey = sanitizeString(key);
      sanitized[sanitizedKey] = sanitizeObject(obj[key]);
    }
  }

  return sanitized;
};

export const sanitizationMiddleware = (req: Request, _res: Response, next: NextFunction) => {
  try {
    // Sanitize body
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body);
    }

    // Sanitize query parameters
    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeObject(req.query);
    }

    // Sanitize params
    if (req.params && typeof req.params === 'object') {
      req.params = sanitizeObject(req.params);
    }

    // Log suspicious activity
    const originalUrl = req.originalUrl;
    if (originalUrl.includes('<script>') ||
        originalUrl.includes('javascript:') ||
        originalUrl.includes('SELECT') ||
        originalUrl.includes('DROP')) {
      logger.warn('Potential malicious request detected', {
        ip: req.ip,
        url: originalUrl,
        method: req.method,
        userAgent: req.get('user-agent'),
      });
    }

    next();
  } catch (error) {
    logger.error('Error in sanitization middleware', { error });
    next();
  }
};

export const validateEmail = (email: string): boolean => {
  return validator.isEmail(email);
};

export const validatePhoneNumber = (phone: string): boolean => {
  return validator.isMobilePhone(phone, 'any', { strictMode: false });
};

export const validateUUID = (uuid: string): boolean => {
  return validator.isUUID(uuid);
};

export const validateURL = (url: string): boolean => {
  return validator.isURL(url, {
    protocols: ['http', 'https'],
    require_protocol: true,
    require_valid_protocol: true,
  });
};

export const validateJSON = (json: string): boolean => {
  try {
    JSON.parse(json);
    return true;
  } catch {
    return false;
  }
};

export const sanitizeFileName = (filename: string): string => {
  // Remove path traversal attempts
  let sanitized = filename.replace(/\.\./g, '');
  sanitized = sanitized.replace(/[\/\\]/g, '');

  // Remove special characters except dots and hyphens
  sanitized = sanitized.replace(/[^a-zA-Z0-9\.\-_]/g, '');

  // Limit length
  if (sanitized.length > 255) {
    sanitized = sanitized.substring(0, 255);
  }

  return sanitized;
};

export const rateLimitByIP = new Map<string, { count: number; resetTime: number }>();

export const checkRateLimit = (ip: string, maxRequests: number = 100, windowMs: number = 60000): boolean => {
  const now = Date.now();
  const record = rateLimitByIP.get(ip);

  if (!record || record.resetTime < now) {
    rateLimitByIP.set(ip, {
      count: 1,
      resetTime: now + windowMs,
    });
    return true;
  }

  if (record.count >= maxRequests) {
    logger.warn('Rate limit exceeded', { ip, count: record.count });
    return false;
  }

  record.count++;
  return true;
};

// Clean up expired rate limit records periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitByIP.entries()) {
    if (record.resetTime < now) {
      rateLimitByIP.delete(ip);
    }
  }
}, 60000);