# Verbio - AI Voice Agents for Small Businesses

[![CI/CD Pipeline](https://github.com/jwillz7667/verbio-prod/workflows/CI%2FCD%20Pipeline/badge.svg)](https://github.com/jwillz7667/verbio-prod/actions)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20-green)](https://nodejs.org/)

## Overview

Verbio is an enterprise-grade platform that enables small businesses to deploy AI-powered voice agents for customer service, order taking, and payment processing. Built with cutting-edge technologies including OpenAI's Realtime API, Twilio Media Streams, and Supabase.

## Features

- 🤖 **AI Voice Agents** - Configure multiple agents for different purposes (service, orders, payments)
- 📞 **Twilio Integration** - Handle inbound calls with natural conversation flow
- 🎙️ **OpenAI Realtime API** - Latest GPT-Realtime model with semantic VAD
- 💳 **Stripe Payments** - Secure payment processing with webhook handling
- 📊 **Real-time Dashboard** - Monitor orders and calls with live updates
- 🔒 **Enterprise Security** - JWT auth, RLS, CSRF protection, input sanitization
- 📱 **Responsive Design** - Works seamlessly on desktop and mobile
- 🚀 **Cloud-Native** - Deploy to Google Cloud Run & Vercel

## Tech Stack

### Backend
- Node.js 20 + TypeScript
- Express.js with WebSocket support
- OpenAI Realtime API (gpt-realtime model)
- Twilio Media Streams WebSocket
- Stripe API 2024-06-20
- Supabase (PostgreSQL + Realtime)
- Jest for testing

### Frontend
- React 18.2 + TypeScript
- Vite for blazing fast builds
- TanStack React Table & Query
- Tailwind CSS + Framer Motion
- Zustand state management
- Playwright for E2E testing

## Prerequisites

- Node.js 20+
- npm or yarn
- Twilio account with phone number
- OpenAI API key with Realtime access
- Stripe account
- Supabase project
- Google Cloud Platform account (for deployment)
- Vercel account (for frontend deployment)

## Installation

1. **Clone the repository**
```bash
git clone https://github.com/jwillz7667/verbio-prod.git
cd verbio-app
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**

Create `.env.local` for development:
```bash
cp .env.example .env.local
```

Update with your actual values:
```env
# Backend
BACKEND_URL=http://localhost:8080
NODE_ENV=development
PORT=8080

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_KEY=eyJhbGc...

# OpenAI
OPENAI_API_KEY=sk-proj-...

# Twilio
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Security
JWT_SECRET=your-jwt-secret
COOKIE_SECRET=your-cookie-secret
CSRF_SECRET=your-csrf-secret

# Frontend
VITE_BACKEND_URL=http://localhost:8080
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

4. **Set up Supabase database**
```bash
cd backend
npx supabase init
npx supabase db push
```

5. **Run development servers**
```bash
npm run dev
```

This starts:
- Backend on http://localhost:8080
- Frontend on http://localhost:5173

## Deployment

### Backend Deployment (Google Cloud Run)

1. **Set up Google Cloud**
```bash
# Install gcloud CLI
curl https://sdk.cloud.google.com | bash

# Authenticate
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# Enable required APIs
gcloud services enable run.googleapis.com cloudbuild.googleapis.com
```

2. **Create secrets in Secret Manager**
```bash
echo -n "your-twilio-sid" | gcloud secrets create twilio-account-sid --data-file=-
echo -n "your-twilio-token" | gcloud secrets create twilio-auth-token --data-file=-
echo -n "your-openai-key" | gcloud secrets create openai-api-key --data-file=-
echo -n "your-stripe-key" | gcloud secrets create stripe-secret-key --data-file=-
echo -n "your-stripe-webhook" | gcloud secrets create stripe-webhook-secret --data-file=-
echo -n "your-supabase-url" | gcloud secrets create supabase-url --data-file=-
echo -n "your-supabase-key" | gcloud secrets create supabase-service-key --data-file=-
echo -n "your-jwt-secret" | gcloud secrets create jwt-secret --data-file=-
```

3. **Deploy with Cloud Build**
```bash
gcloud builds submit --config cloudbuild.yaml
```

4. **Update Twilio webhook URL**

In Twilio Console, set your phone number webhook to:
```
https://api.verbio.app/api/twilio/webhook
```

5. **Update Stripe webhook URL**

In Stripe Dashboard, add webhook endpoint:
```
https://api.verbio.app/api/stripe/webhook
```

Select events:
- `charge.succeeded`
- `charge.failed`
- `charge.refunded`

### Frontend Deployment (Vercel)

1. **Install Vercel CLI**
```bash
npm i -g vercel
```

2. **Deploy to Vercel**
```bash
cd frontend
vercel --prod
```

3. **Set environment variables in Vercel Dashboard**
```
VITE_BACKEND_URL=https://api.verbio.app
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

### CI/CD with GitHub Actions

1. **Set GitHub Secrets**

In your repository settings, add:
- `GCP_PROJECT_ID`
- `GCP_SERVICE_ACCOUNT_KEY` (base64 encoded)
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `SNYK_TOKEN` (optional for security scanning)
- `SLACK_WEBHOOK` (optional for notifications)

2. **Push to trigger deployment**
```bash
git push origin main
```

The pipeline will:
- Run tests and linting
- Build and deploy backend to Cloud Run
- Deploy frontend to Vercel
- Run E2E tests against production
- Rollback on failure

## Testing

### Run all tests
```bash
npm test
```

### Backend unit tests with coverage
```bash
npm run test:backend -- --coverage
```

### Frontend tests
```bash
npm run test:frontend
```

### E2E tests
```bash
npm run test:e2e
```

### E2E tests against production
```bash
PLAYWRIGHT_BASE_URL=https://verbio.app npm run test:e2e:prod
```

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Twilio    │────▶│   Backend   │────▶│   OpenAI    │
│   Phone     │     │   (Cloud    │     │  Realtime   │
└─────────────┘     │    Run)     │     └─────────────┘
                    │             │
                    │             │     ┌─────────────┐
                    │             │────▶│   Stripe    │
                    │             │     │   Payments  │
                    └─────────────┘     └─────────────┘
                           │
                           │
                    ┌─────────────┐     ┌─────────────┐
                    │  Supabase   │────▶│   Frontend  │
                    │  Database   │     │   (Vercel)  │
                    └─────────────┘     └─────────────┘
```

## Security Features

- **Authentication**: JWT with 24-hour expiry
- **Database**: Row Level Security (RLS) policies
- **Input Sanitization**: XSS and SQL injection protection
- **Rate Limiting**: IP-based with exponential backoff
- **HTTPS**: Automatic redirect in production
- **CSRF Protection**: Token-based for state-changing operations
- **Secrets Management**: Google Secret Manager integration
- **WebSocket Security**: Origin validation and auth checks
- **Idempotency**: Request deduplication for payments

## Monitoring

- **Sentry**: Error tracking and performance monitoring
- **Cloud Logging**: Structured logs with trace IDs
- **Health Checks**: `/healthz` endpoint for uptime monitoring
- **Metrics**: Custom business metrics dashboard

## API Documentation

### Authentication
```
POST /api/auth/login
POST /api/auth/register
POST /api/auth/logout
GET  /api/auth/profile
```

### Business Management
```
GET    /api/business
PUT    /api/business
POST   /api/business/data
POST   /api/business/phone
GET    /api/business/agents
POST   /api/business/agents
PUT    /api/business/agents/:id
DELETE /api/business/agents/:id
```

### Orders
```
GET  /api/orders
GET  /api/orders/:id
PUT  /api/orders/:id/status
```

### Webhooks
```
POST /api/twilio/webhook
POST /api/stripe/webhook
```

### WebSocket
```
WS /realtime?businessId=XXX&from=+1XXX&agentType=service
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support, email support@verbio.app or open an issue in the GitHub repository.

## Acknowledgments

- OpenAI for the Realtime API
- Twilio for telephony infrastructure
- Supabase for database and realtime subscriptions
- Vercel for frontend hosting
- Google Cloud for backend infrastructure