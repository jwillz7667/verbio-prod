import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  // Server Configuration
  PORT: z.string().default('8080'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  BACKEND_URL: z.string().url().optional(),
  FRONTEND_URL: z.string().url().default('https://verbio.app'),

  // JWT Configuration
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRY: z.string().default('24h'),

  // Supabase Configuration
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string(),
  SUPABASE_SERVICE_KEY: z.string(),

  // Twilio Configuration
  TWILIO_ACCOUNT_SID: z.string(),
  TWILIO_AUTH_TOKEN: z.string(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
  TWILIO_WEBHOOK_URL: z.string().url().optional(),

  // OpenAI Configuration
  OPENAI_API_KEY: z.string(),
  OPENAI_MODEL: z.string().default('gpt-realtime'),
  OPENAI_VOICE: z.string().default('alloy'),
  OPENAI_TEMPERATURE: z.string().default('0.8'),
  MCP_SERVER_URL: z.string().url().optional(),

  // Stripe Configuration
  STRIPE_SECRET_KEY: z.string(),
  STRIPE_WEBHOOK_SECRET: z.string(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),

  // Sentry Configuration
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),

  // Redis Configuration
  REDIS_URL: z.string().optional(),

  // Security Configuration
  CORS_ORIGIN: z.string().default('https://verbio.app'),
  CSRF_SECRET: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
  COOKIE_SECRET: z.string().optional(),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().default('900000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().default('100'),

  // Feature Flags
  ENABLE_SENTRY: z.string().transform(val => val === 'true').default('false'),
  ENABLE_RATE_LIMITING: z.string().transform(val => val === 'true').default('true'),
  ENABLE_CSRF_PROTECTION: z.string().transform(val => val === 'true').default('false'),
  ENABLE_WEBSOCKET_AUTH: z.string().transform(val => val === 'true').default('true'),

  // Database Configuration
  DATABASE_URL: z.string().optional(),

  // Email Configuration
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FORMAT: z.enum(['json', 'simple']).default('json'),

  // Google Cloud Configuration
  GCP_PROJECT_ID: z.string().optional(),
  GCP_REGION: z.string().optional(),
  GCP_SERVICE_NAME: z.string().optional(),
});

type EnvConfig = z.infer<typeof envSchema>;

class Config {
  private config: EnvConfig;

  constructor() {
    const parsed = envSchema.safeParse(process.env);

    if (!parsed.success) {
      console.error('❌ Invalid environment variables:');
      console.error(parsed.error.flatten().fieldErrors);
      throw new Error('Invalid environment configuration');
    }

    this.config = parsed.data;
  }

  get<K extends keyof EnvConfig>(key: K): EnvConfig[K] {
    return this.config[key];
  }

  getAll(): EnvConfig {
    return this.config;
  }

  isDevelopment(): boolean {
    return this.config.NODE_ENV === 'development';
  }

  isProduction(): boolean {
    return this.config.NODE_ENV === 'production';
  }

  isTest(): boolean {
    return this.config.NODE_ENV === 'test';
  }
}

export const config = new Config();
export type { EnvConfig };