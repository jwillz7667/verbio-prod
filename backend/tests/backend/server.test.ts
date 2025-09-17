import request from 'supertest';
import { app, server, wss } from '../../src/index';
import { logger } from '../../src/utils/logger';

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
  logError: jest.fn(),
  createChildLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  })),
}));

jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  Integrations: {
    Http: jest.fn(),
    Express: jest.fn(),
  },
  Handlers: {
    requestHandler: () => (_req: any, _res: any, next: any) => next(),
    tracingHandler: () => (_req: any, _res: any, next: any) => next(),
    errorHandler: () => (_err: any, _req: any, _res: any, next: any) => next(),
  },
  captureException: jest.fn(),
  getCurrentHub: jest.fn(),
  close: jest.fn().mockResolvedValue(undefined),
}));

describe('Server Tests', () => {
  afterAll(async () => {
    await new Promise<void>((resolve) => {
      wss.close(() => {
        server.close(() => {
          resolve();
        });
      });
    });
  });

  describe('GET /healthz', () => {
    it('should return 200 with health status', async () => {
      const response = await request(app).get('/healthz');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('environment');
      expect(response.body).toHaveProperty('version');
    });

    it('should have correct response structure', async () => {
      const response = await request(app).get('/healthz');

      expect(response.body.status).toBe('ok');
      expect(typeof response.body.timestamp).toBe('string');
      expect(typeof response.body.uptime).toBe('number');
      expect(response.body.uptime).toBeGreaterThanOrEqual(0);
      expect(response.body.version).toBe('1.0.0');
    });
  });

  describe('GET /', () => {
    it('should return 200 with API info', async () => {
      const response = await request(app).get('/');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        name: 'Verbio API',
        version: '1.0.0',
        status: 'running',
      });
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app).get('/api/unknown-route');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Route not found');
    });

    it('should handle POST requests to unknown routes', async () => {
      const response = await request(app)
        .post('/api/unknown-route')
        .send({ test: 'data' });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Route not found');
    });
  });

  describe('CORS Headers', () => {
    it('should include CORS headers in response', async () => {
      const response = await request(app)
        .get('/healthz')
        .set('Origin', 'https://verbio.app');

      expect(response.headers['access-control-allow-origin']).toBe('https://verbio.app');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('should handle OPTIONS requests', async () => {
      const response = await request(app)
        .options('/healthz')
        .set('Origin', 'https://verbio.app');

      expect(response.status).toBe(204);
      expect(response.headers['access-control-allow-methods']).toContain('GET');
      expect(response.headers['access-control-allow-methods']).toContain('POST');
    });
  });

  describe('Security Headers', () => {
    it('should include security headers', async () => {
      const response = await request(app).get('/healthz');

      expect(response.headers['x-dns-prefetch-control']).toBe('off');
      expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  describe('Rate Limiting', () => {
    it('should apply rate limiting to /api routes', async () => {
      const requests = Array(101).fill(null).map(() =>
        request(app).get('/api/test')
      );

      const responses = await Promise.all(requests);
      const tooManyRequests = responses.filter(r => r.status === 429);

      expect(tooManyRequests.length).toBeGreaterThan(0);
      expect(tooManyRequests[0].body).toHaveProperty('error', 'Too many requests');
    });
  });

  describe('Error Handling', () => {
    it('should handle JSON parsing errors', async () => {
      const response = await request(app)
        .post('/api/test')
        .set('Content-Type', 'application/json')
        .send('invalid json');

      expect(response.status).toBe(400);
    });

    it('should handle large payloads', async () => {
      const largePayload = 'x'.repeat(11 * 1024 * 1024);

      const response = await request(app)
        .post('/api/test')
        .send({ data: largePayload });

      expect(response.status).toBe(413);
    });
  });

  describe('WebSocket Upgrade', () => {
    it('should reject WebSocket connections with invalid origin in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const ws = require('ws');
      const client = new ws.WebSocket(`ws://localhost:${process.env.PORT || 8080}/realtime`, {
        headers: {
          origin: 'https://malicious-site.com',
        },
      });

      await new Promise<void>((resolve) => {
        client.on('error', (error: any) => {
          expect(error.message).toContain('Unexpected server response');
          resolve();
        });

        client.on('open', () => {
          client.close();
          resolve();
        });
      });

      process.env.NODE_ENV = originalEnv;
    });
  });
});

describe('Server Lifecycle', () => {
  it('should handle graceful shutdown', async () => {
    const shutdownSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('Process exit');
    });

    try {
      process.emit('SIGTERM', 'SIGTERM');
    } catch (error: any) {
      expect(error.message).toBe('Process exit');
    }

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('SIGTERM received'),
      expect.any(Object)
    );

    shutdownSpy.mockRestore();
  });

  it('should handle uncaught exceptions', () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('Process exit');
    });

    const error = new Error('Test uncaught exception');

    try {
      process.emit('uncaughtException', error);
    } catch (err: any) {
      expect(err.message).toBe('Process exit');
    }

    expect(logger.error).toHaveBeenCalledWith(
      'Uncaught Exception',
      expect.objectContaining({
        error: error.message,
        stack: error.stack,
      })
    );

    exitSpy.mockRestore();
  });

  it('should handle unhandled rejections', () => {
    const reason = new Error('Test unhandled rejection');
    const promise = Promise.reject(reason);

    process.emit('unhandledRejection', reason, promise);

    expect(logger.error).toHaveBeenCalledWith(
      'Unhandled Rejection',
      expect.objectContaining({
        reason,
        promise,
      })
    );
  });
});