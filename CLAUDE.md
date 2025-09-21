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
npm run dev                     # Starts both backend (8080) and frontend (5173/5174)
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

# Linting & Formatting
npm run lint                   # Lint all workspaces
npm run lint:fix               # Auto-fix linting issues
npm run format                 # Prettier format all files

# Deployment - Backend to Cloud Run
cd backend
docker buildx build --platform linux/amd64 -t gcr.io/neural-aquifer-467003-m0/verbio-backend:latest .
docker push gcr.io/neural-aquifer-467003-m0/verbio-backend:latest
gcloud run deploy verbio-backend --image gcr.io/neural-aquifer-467003-m0/verbio-backend:latest --region us-central1 --allow-unauthenticated --port 8080 --min-instances 1 --max-instances 100 --memory 1Gi --cpu 1

# Deployment - Frontend to Vercel
cd frontend
vercel --prod
```

## Critical Architecture Patterns

### WebSocket Flow (Twilio → OpenAI)
The core real-time communication happens in `/backend/src/socket/realtimeHandler.ts`:
1. Twilio sends media events (base64 μ-law audio) via WebSocket
2. Handler converts audio to PCM16 using FFmpeg
3. Audio streams to OpenAI Realtime session
4. OpenAI responses are converted back to μ-law and sent to Twilio

### OpenAI Realtime API GA Parameters
`/backend/src/services/openaiRealtimeService.ts` manages the OpenAI WebSocket connection:
- Uses `gpt-realtime` model (GA release, not preview)
- Temperature is NOT a session parameter in GA
- VAD modes: `server_vad` or `semantic` (not `semantic_vad`)
- No `audio_buffer_size_sec`, `response_modalities`, or `parallel_tool_calls` parameters
- Implements exponential backoff retry (max 3 attempts)
- Executes functions for orders/payments via `executeFunction()`

### Voice Agents Playground
`/backend/src/socket/realtimePlaygroundHandler.ts` provides testing interface:
- Direct WebSocket connection for OpenAI Realtime testing
- Supports both semantic and server VAD configurations
- Recording functionality integrated with Twilio API
- Session configs must exclude temperature and other deprecated params

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
- `.env.cloudrun.yaml` - Production secrets for Cloud Run deployment
- Secrets injected via Google Secret Manager (backend) and Vercel env vars (frontend)

Key variables:
- `OPENAI_API_KEY` - Must have Realtime API access
- `TWILIO_WEBHOOK_URL` - Set to backend URL for webhook callbacks
- `STRIPE_WEBHOOK_SECRET` - Unique per Stripe webhook endpoint
- `BASE_URL` - Backend service URL (https://verbio-backend-995705962018.us-central1.run.app in production)

## Database Schema

Tables use UUID primary keys with RLS policies:
- `businesses` - Core tenant table
- `users` - Auth with business_id FK
- `agents` - AI agent configurations per business
- `orders` - Customer orders with items JSONB
- `payments` - Stripe payment records
- `call_logs` - Call history and transcripts
- `call_transcripts` - Real-time conversation transcripts

## Deployment Requirements

### Backend Deployment (Google Cloud Run)
**CRITICAL**: Must build from backend directory, not root:
1. Always `cd backend` first
2. Use `docker buildx build --platform linux/amd64` (NOT regular docker build)
3. Project ID: `neural-aquifer-467003-m0`
4. Region: `us-central1`
5. Service name: `verbio-backend`

### Frontend Deployment (Vercel)
1. Deploy from `/frontend` directory
2. Environment variables set in Vercel dashboard
3. Auto-deploys on push to main branch

## Security Middleware Stack

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

## Common TypeScript Issues

When deploying, watch for:
- Twilio client null checks - Always check `if (!twilioClient)` before use
- Optional parameters - Use type guards or default values
- Recording API parameters - `callSid` is not a direct filter parameter
- OpenAI session types - Temperature is not a valid session parameter