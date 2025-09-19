import { Request, Response, NextFunction } from 'express';
import { logger, logError } from './logger';
import * as Sentry from '@sentry/node';

export class CustomError extends Error {
  public statusCode: number;
  public code?: string;
  public details?: any;
  public isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    code?: string,
    details?: any,
    isOperational: boolean = true
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    if (code !== undefined) {
      this.code = code;
    }
    this.details = details;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends CustomError {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class AuthenticationError extends CustomError {
  constructor(message: string = 'Authentication failed') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends CustomError {
  constructor(message: string = 'Access denied') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

export class NotFoundError extends CustomError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends CustomError {
  constructor(message: string, details?: any) {
    super(message, 409, 'CONFLICT_ERROR', details);
  }
}

export class RateLimitError extends CustomError {
  constructor(message: string = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT_ERROR');
  }
}

export class ExternalServiceError extends CustomError {
  constructor(service: string, message: string, details?: any) {
    super(`${service} error: ${message}`, 503, 'EXTERNAL_SERVICE_ERROR', details);
  }
}

export class TwilioError extends ExternalServiceError {
  constructor(message: string, details?: any) {
    super('Twilio', message, details);
  }
}

export class OpenAIError extends ExternalServiceError {
  constructor(message: string, details?: any) {
    super('OpenAI', message, details);
  }
}

export class StripeError extends ExternalServiceError {
  constructor(message: string, details?: any) {
    super('Stripe', message, details);
  }
}

export class SupabaseError extends ExternalServiceError {
  constructor(message: string, details?: any) {
    super('Supabase', message, details);
  }
}

const normalizeError = (err: any): CustomError => {
  if (err instanceof CustomError) {
    return err;
  }

  if (err.name === 'ValidationError' && err.errors) {
    return new ValidationError('Validation failed', err.errors);
  }

  if (err.name === 'UnauthorizedError' || err.statusCode === 401) {
    return new AuthenticationError(err.message);
  }

  if (err.name === 'ForbiddenError' || err.statusCode === 403) {
    return new AuthorizationError(err.message);
  }

  if (err.name === 'CastError' || err.name === 'TypeError') {
    return new ValidationError('Invalid data format');
  }

  if (err.code === 'ECONNREFUSED') {
    return new ExternalServiceError('Service', 'Connection refused', { code: err.code });
  }

  if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
    return new ExternalServiceError('Service', 'Request timeout', { code: err.code });
  }

  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal server error';
  return new CustomError(message, statusCode, err.code);
};

export const errorHandler = (
  err: Error | any,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const normalizedError = normalizeError(err);

  logError(normalizedError, {
    method: req.method,
    url: req.url,
    params: req.params,
    query: req.query,
    body: req.body,
    headers: req.headers,
    ip: req.ip,
  });

  if (!normalizedError.isOperational) {
    Sentry.captureException(err, {
      tags: {
        statusCode: normalizedError.statusCode,
        errorCode: normalizedError.code,
      },
      extra: {
        url: req.url,
        method: req.method,
        details: normalizedError.details,
      },
    });
  }

  if (res.headersSent) {
    logger.error('Headers already sent, cannot send error response');
    return;
  }

  const statusCode = normalizedError.statusCode || 500;
  const response: any = {
    error: {
      message: normalizedError.message,
      code: normalizedError.code,
      statusCode,
    },
  };

  if (process.env['NODE_ENV'] === 'development') {
    response.error.details = normalizedError.details;
    response.error.stack = normalizedError.stack;
  }

  if (statusCode === 500 && process.env['NODE_ENV'] === 'production') {
    response.error.message = 'Internal server error';
    delete response.error.details;
  }

  res.status(statusCode).json(response);
};

export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export const handleWebSocketError = (ws: any, error: Error | any, context?: any): void => {
  const normalizedError = normalizeError(error);

  logError(normalizedError, {
    ...context,
    wsReadyState: ws?.readyState,
  });

  if (ws && ws.readyState === ws.OPEN) {
    try {
      ws.send(JSON.stringify({
        type: 'error',
        error: {
          message: normalizedError.message,
          code: normalizedError.code,
        },
      }));
    } catch (sendError) {
      logger.error('Failed to send error to WebSocket client', { error: sendError });
    }
  }
};

export const createErrorResponse = (error: CustomError | Error | any) => {
  const normalizedError = normalizeError(error);
  return {
    success: false,
    error: {
      message: normalizedError.message,
      code: normalizedError.code,
      statusCode: normalizedError.statusCode,
    },
  };
};

export const isOperationalError = (error: Error | any): boolean => {
  if (error instanceof CustomError) {
    return error.isOperational;
  }
  return false;
};

export default errorHandler;