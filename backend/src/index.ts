import express, { Application, Request, Response } from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import * as Sentry from '@sentry/node';
import { config } from './config/env';
import { logger } from './utils/logger';
import { errorHandler } from './utils/errorHandler';
import { httpsRedirect, idempotencyMiddleware, securityHeaders, requestLogging } from './middleware/security';
import { sanitizationMiddleware } from './middleware/sanitization';
import authRoutes from './routes/auth';
import authOAuthRoutes from './routes/authOAuth';
import businessRoutes from './routes/business';
import ordersRoutes from './routes/orders';
// import twilioRoutes from './routes/twilio'; // Removed - functionality moved to realtimeHandler
import { stripeRoutes } from './routes/stripe';
import analyticsRoutes from './routes/analytics';
import callRoutes from './routes/callRoutes';
import billingRoutes from './routes/billing';
import agentRoutes from './routes/agentRoutes';
import { handleConnection } from './socket/realtimeHandler';
import { voiceAgentHandler } from './socket/voiceAgentHandler';
import { setupRealtimePlaygroundWebSocket } from './socket/realtimePlaygroundHandler';

const PORT = config.get('PORT');
const FRONTEND_URL = config.get('FRONTEND_URL');
const NODE_ENV = config.get('NODE_ENV');
const SENTRY_DSN = config.get('SENTRY_DSN');

const app: Application = express();

// Trust proxy when running on Cloud Run
// Set to specific number of proxies or 'loopback' for Cloud Run
app.set('trust proxy', NODE_ENV === 'production' ? 1 : false);

if (SENTRY_DSN && NODE_ENV === 'production') {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: NODE_ENV,
    integrations: [Sentry.httpIntegration(), Sentry.expressIntegration()],
    tracesSampleRate: NODE_ENV === 'production' ? 0.1 : 1.0,
    beforeSend(event, hint) {
      if (event.exception) {
        logger.error('Sentry captured exception', { event, hint });
      }
      return event;
    },
  });
}
const server = http.createServer(app);

const wss = new WebSocketServer({ noServer: true });

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  // Skip IP validation since we're behind Cloud Run proxy
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
  // Use custom key generator for Cloud Run
  keyGenerator: (req: Request) => {
    // Use X-Forwarded-For header from Cloud Run
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
      // Get the first IP in the chain (the original client IP)
      const ips = (forwardedFor as string).split(',');
      return ips[0].trim();
    }
    // Fallback to req.ip if no forwarded header
    return req.ip || 'unknown';
  },
  handler: (req: Request, res: Response) => {
    logger.warn('Rate limit exceeded', {
      ip: req.headers['x-forwarded-for'] || req.ip,
      path: req.path,
    });
    res.status(429).json({ error: 'Too many requests' });
  },
});

if (SENTRY_DSN && NODE_ENV === 'production') {
  Sentry.setupExpressErrorHandler(app);
}

// Security middleware
app.use(httpsRedirect);
app.use(securityHeaders);
app.use(requestLogging);
app.use(idempotencyMiddleware);
app.use(sanitizationMiddleware);

app.use(compression());
app.use(
  cors({
    origin: (origin, callback) => {
      const allowedOrigins = [
        'https://verbio.app',
        'https://www.verbio.app',
        'http://localhost:5173',
        'http://localhost:3000',
        'http://localhost:5174',
        'https://accounts.google.com',
        'https://github.com',
      ];
      // Allow requests with no origin (mobile apps, Postman, etc)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else if (NODE_ENV !== 'production') {
        // Log but allow in development
        logger.warn('CORS: Allowing origin in development', { origin });
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Requested-With'],
    exposedHeaders: ['Set-Cookie'],
    maxAge: 86400, // Cache preflight for 24 hours
  })
);
app.use(
  helmet({
    contentSecurityPolicy: NODE_ENV === 'production' || false,
    crossOriginEmbedderPolicy: false,
  })
);
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));
app.use(
  express.json({
    limit: '10mb',
    verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
      if (req.originalUrl === '/api/stripe/webhook') {
        req.rawBody = buf;
      }
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser(config.get('COOKIE_SECRET') || 'verbio-cookie-secret'));
app.use('/api', limiter);

// CSRF protection disabled for now to avoid require() issues

app.get('/healthz', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: NODE_ENV,
    version: '1.0.0',
  });
});

app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'Verbio API',
    version: '1.0.0',
    status: 'running',
  });
});

app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

app.use('/api/auth', authRoutes);
app.use('/api/auth/oauth', authOAuthRoutes);
app.use('/api/business', businessRoutes);
app.use('/api/orders', ordersRoutes);
// app.use('/api/twilio', twilioRoutes); // Removed - functionality moved to realtimeHandler
app.use('/api/stripe', stripeRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/agents', agentRoutes);

// Setup the realtime playground WebSocket
setupRealtimePlaygroundWebSocket(server);

server.on('upgrade', (request, socket, head) => {
  const { pathname } = new URL(request.url || '', `http://${request.headers.host}`);

  if (pathname === '/ws/voice-agent') {
    // Voice agent WebSocket handled by voiceAgentHandler
    voiceAgentHandler.handleUpgrade(request, socket, head);
  } else if (pathname === '/ws/realtime') {
    // Realtime playground WebSocket is handled by setupRealtimePlaygroundWebSocket
  } else if (pathname === '/ws/twilio-stream' || pathname === '/realtime') {
    // Handle both Twilio stream and legacy realtime paths
    const origin = request.headers.origin || request.headers.host || '';
    const validOrigins = [
      'https://media.twiliocdn.com',
      'https://sdk.twilio.com',
      'media.twiliocdn.com',
      'sdk.twilio.com',
      FRONTEND_URL,
    ];

    if (NODE_ENV === 'production' && !validOrigins.some((valid) => origin === valid || origin.includes(valid))) {
      logger.warn('WebSocket connection rejected - invalid origin', { origin, ip: request.socket.remoteAddress });
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
      logger.info('WebSocket connection established for realtime', {
        pathname,
        ip: request.socket.remoteAddress,
        headers: request.headers,
      });

      handleConnection(ws, request).catch((err: unknown) => {
        logger.error('WebSocket connection error', { error: err as Error });
      });
    });
  } else {
    socket.destroy();
  }
});

// Error handler is already setup with setupExpressErrorHandler

app.use(errorHandler);

app.use((req: Request, res: Response) => {
  logger.warn('404 - Route not found', { path: req.path, method: req.method });
  res.status(404).json({ error: 'Route not found' });
});

const gracefulShutdown = async (signal: string) => {
  logger.info(`${signal} received, starting graceful shutdown`);

  const shutdownTimeout = setTimeout(() => {
    logger.error('Graceful shutdown timeout, forcing exit');
    process.exit(1);
  }, 30000);

  try {
    wss.clients.forEach((client) => {
      client.close(1000, 'Server shutting down');
    });
    wss.close();

    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) {
          logger.error('Error closing HTTP server', { error: err.message });
          reject(err);
        } else {
          logger.info('HTTP server closed');
          resolve();
        }
      });
    });

    if (Sentry.close) {
      await Sentry.close(2000);
    }

    clearTimeout(shutdownTimeout);
    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown', { error });
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
};

process.on('SIGTERM', () => {
  gracefulShutdown('SIGTERM').catch((err: unknown) => {
    logger.error('Graceful shutdown error', { error: err as Error });
  });
});
process.on('SIGINT', () => {
  gracefulShutdown('SIGINT').catch((err: unknown) => {
    logger.error('Graceful shutdown error', { error: err as Error });
  });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  Sentry.captureException(error);
  gracefulShutdown('uncaughtException').catch((err: unknown) => {
    logger.error('Shutdown error during uncaught exception', { error: err as Error });
  });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
  Sentry.captureException(reason);
});

const host = '0.0.0.0';
server.listen(Number(PORT), host, () => {
  logger.info(`Server running on ${host}:${PORT}`, {
    environment: NODE_ENV,
    frontend: FRONTEND_URL,
    cors: FRONTEND_URL,
    rateLimit: '100 requests per 15 minutes',
  });
});

export { app, server, wss };
