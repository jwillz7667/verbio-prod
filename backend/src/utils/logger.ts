import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { config } from '../config/env';

const LOG_LEVEL = config.get('LOG_LEVEL');
const NODE_ENV = config.get('NODE_ENV');

const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir) && NODE_ENV !== 'production') {
  fs.mkdirSync(logsDir, { recursive: true });
}

const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.metadata({ fillWith: ['timestamp', 'service'] }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, metadata, ...rest }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(rest).length > 0) {
      msg += ` ${JSON.stringify(rest)}`;
    }
    return msg;
  })
);

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: NODE_ENV === 'production' ? customFormat : consoleFormat,
    level: LOG_LEVEL,
  }),
];

if (NODE_ENV !== 'production') {
  transports.push(
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: customFormat,
      maxsize: 10485760,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      format: customFormat,
      maxsize: 10485760,
      maxFiles: 5,
    })
  );
}

export const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: customFormat,
  defaultMeta: { service: 'verbio-backend' },
  transports,
  exitOnError: false,
});

if (NODE_ENV === 'production') {
  logger.exceptions.handle(
    new winston.transports.Console({
      format: customFormat,
    })
  );

  logger.rejections.handle(
    new winston.transports.Console({
      format: customFormat,
    })
  );
}

export const streamLogger = {
  write: (message: string) => {
    logger.info(message.trim());
  },
};

export const createChildLogger = (module: string) => {
  return logger.child({ module });
};

export const logRequest = (req: any, message: string, metadata?: any) => {
  logger.info(message, {
    method: req.method,
    url: req.url,
    ip: req.ip || req.connection?.remoteAddress,
    userAgent: req.get('user-agent'),
    ...metadata,
  });
};

export const logError = (error: Error | any, context?: any) => {
  const errorInfo = {
    message: error.message || 'Unknown error',
    stack: error.stack,
    name: error.name,
    code: error.code,
    statusCode: error.statusCode,
    ...context,
  };

  if (error.statusCode && error.statusCode < 500) {
    logger.warn('Client error', errorInfo);
  } else {
    logger.error('Server error', errorInfo);
  }
};

export const logPerformance = (operation: string, startTime: number, metadata?: any) => {
  const duration = Date.now() - startTime;
  logger.info(`Performance: ${operation}`, {
    operation,
    duration,
    durationMs: `${duration}ms`,
    ...metadata,
  });
};

export const logWebSocket = (event: string, ws?: any, metadata?: any) => {
  logger.info(`WebSocket: ${event}`, {
    event,
    readyState: ws?.readyState,
    bufferedAmount: ws?.bufferedAmount,
    ...metadata,
  });
};

export const logTwilio = (event: string, callSid?: string, metadata?: any) => {
  logger.info(`Twilio: ${event}`, {
    event,
    callSid,
    ...metadata,
  });
};

export const logOpenAI = (event: string, sessionId?: string, metadata?: any) => {
  logger.info(`OpenAI: ${event}`, {
    event,
    sessionId,
    ...metadata,
  });
};

export const logStripe = (event: string, metadata?: any) => {
  logger.info(`Stripe: ${event}`, {
    event,
    ...metadata,
  });
};

export const logDatabase = (operation: string, table?: string, metadata?: any) => {
  logger.debug(`Database: ${operation}`, {
    operation,
    table,
    ...metadata,
  });
};

export default logger;