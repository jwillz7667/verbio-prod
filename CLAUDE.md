# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Verbio is a monorepo platform for AI-powered voice agents that handle phone calls via Twilio, process conversations with OpenAI Realtime API, and manage orders/payments through Stripe. The architecture consists of:

- **Backend**: Express + WebSocket server that bridges Twilio Media Streams with OpenAI Realtime API
- **Frontend**: React dashboard for business management and real-time order monitoring
- **Database**: Supabase (PostgreSQL) with Row Level Security and realtime subscriptions

## Essential Commands

```bash
# Development
npm run dev                     # Starts both backend (8080) and frontend (5173)
npm run dev:backend            # Backend only with nodemon
npm run dev:frontend           # Frontend only with Vite

# Testing
npm test                       # Run all tests
npm run test:backend           # Backend Jest tests
npm run test:backend -- --coverage  # With coverage report
npm run test:e2e               # Playwright E2E tests
npx jest --testPathPattern=stripe  # Run specific test file

# Building
npm run build                  # Build both backend and frontend
npm run build:backend          # TypeScript compilation to dist/
npm run build:frontend         # Vite production build

# Linting & Type Checking
npm run lint                   # Lint all workspaces
npm run type-check:backend     # TypeScript check backend
npm run type-check:frontend    # TypeScript check frontend

# Deployment
gcloud builds submit --config cloudbuild.yaml  # Deploy backend to Cloud Run
vercel --prod                                  # Deploy frontend to Vercel
```

## Critical Architecture Patterns

### WebSocket Flow (Twilio → OpenAI)
The core real-time communication happens in `/backend/src/socket/realtimeHandler.ts`:
1. Twilio sends media events (base64 μ-law audio) via WebSocket
2. Handler converts audio to PCM16 using FFmpeg
3. Audio streams to OpenAI Realtime session
4. OpenAI responses are converted back to μ-law and sent to Twilio

### OpenAI Realtime Session
`/backend/src/services/openaiService.ts` manages the OpenAI WebSocket connection:
- Uses `gpt-realtime` model (not preview)
- Implements exponential backoff retry (max 3 attempts)
- Handles semantic VAD with configurable eagerness
- Executes functions for orders/payments via `executeFunction()`

### Authentication Flow
- JWT tokens with 24-hour expiry stored in localStorage
- Zustand store (`/frontend/src/store/authStore.ts`) manages auth state
- API client (`/frontend/src/services/api.ts`) auto-injects tokens and handles 401s
- Protected routes check `/api/auth/profile` on mount

### Realtime Order Updates
Orders page subscribes to Supabase channels for live updates:
```typescript
supabase.channel('orders-db')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'orders',
    filter: `business_id=eq.${businessId}`
  }, payload => setOrders())
```

## Environment Configuration

Required environment variables are split between:
- `.env.local` - Development configuration
- `.env.production` - Production with `${VAR}` placeholders for CI/CD
- Secrets injected via Google Secret Manager (backend) and Vercel env vars (frontend)

Key variables:
- `OPENAI_API_KEY` - Must have Realtime API access
- `TWILIO_WEBHOOK_URL` - Set to `https://api.verbio.app/api/twilio/webhook` in production
- `STRIPE_WEBHOOK_SECRET` - Unique per Stripe webhook endpoint

## Database Schema

Tables use UUID primary keys with RLS policies:
- `businesses` - Core tenant table
- `users` - Auth with business_id FK
- `agents` - AI agent configurations per business
- `orders` - Customer orders with items JSONB
- `payments` - Stripe payment records
- `call_logs` - Call history and transcripts

## Testing Approach

- **Backend**: Jest with mocked external services (Supabase, Stripe, Twilio)
- **Frontend**: Playwright with mocked API responses
- **E2E**: Full user journey tests in `/tests/e2e/full-flow.spec.ts`

Mock Twilio events for testing WebSocket handlers:
```javascript
const twilioEvent = {
  event: 'media',
  media: { payload: 'base64-audio' },
  streamSid: 'test-stream'
};
```

## Deployment Pipeline

GitHub Actions workflow triggers on push to main:
1. Runs tests and security scans
2. Builds Docker image and pushes to GCR
3. Deploys backend to Cloud Run with secrets from Secret Manager
4. Deploys frontend to Vercel
5. Runs integration tests against production
6. Auto-rollback on failure

## Security Middleware

All requests pass through security layers in order:
1. `httpsRedirect` - Forces HTTPS in production
2. `securityHeaders` - CSP, X-Frame-Options, etc.
3. `requestLogging` - Sentry breadcrumbs
4. `idempotencyMiddleware` - Deduplicates payment requests
5. `sanitizationMiddleware` - XSS/SQL injection protection

## WebSocket Connection Handling

The Twilio WebSocket in `/backend/src/socket/realtimeHandler.ts` expects query params:
- `businessId` - Required for agent lookup
- `from` - Caller phone number
- `agentType` - Optional (service/order/payment)

Origin validation only allows `https://media.twiliocdn.com` in production.

## Stripe Integration

Webhook events are handled raw (not parsed as JSON) for signature verification:
```javascript
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
```

The service tracks charge lifecycle: succeeded → refunded with automatic database updates.