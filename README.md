# Verbio - AI Voice Agent Platform

Enterprise-grade AI voice agent platform for small businesses. Built with TypeScript, React, Node.js, Twilio Media Streams, OpenAI Realtime API, Supabase, and Stripe.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Verbio Platform                          │
├───────────────────────────┬─────────────────────────────────────┤
│      Frontend (React)     │        Backend (Node.js)            │
│  - Dashboard UI           │  - Express API Server               │
│  - Agent Configuration    │  - WebSocket Handler                │
│  - Order Management       │  - Twilio Integration               │
│  - Real-time Updates      │  - OpenAI Realtime Client          │
│  - Payment Tracking       │  - Stripe Payment Processing       │
│                           │  - Supabase DB Operations          │
├───────────────────────────┴─────────────────────────────────────┤
│                    External Services                             │
│  - Twilio (Voice/SMS)                                           │
│  - OpenAI (Realtime API)                                        │
│  - Supabase (Database/Auth/Realtime)                           │
│  - Stripe (Payments)                                            │
│  - Google Cloud Run (Backend Hosting)                           │
│  - Vercel (Frontend Hosting)                                    │
└─────────────────────────────────────────────────────────────────┘
```

## Tech Stack

- **Frontend**: React 18, Vite, TypeScript, TailwindCSS, TanStack Table, Supabase Client
- **Backend**: Node.js, Express, WebSocket (ws), TypeScript
- **Database**: Supabase (PostgreSQL with RLS)
- **Voice**: Twilio Media Streams API, OpenAI Realtime API (GA)
- **Payments**: Stripe API
- **Authentication**: Supabase Auth (JWT)
- **Deployment**: Vercel (Frontend), Google Cloud Run (Backend)
- **Testing**: Jest, Supertest, Playwright
- **CI/CD**: GitHub Actions, Husky, ESLint, Prettier

## Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- Docker (optional, for containerized development)
- Google Cloud SDK (for deployment)
- Vercel CLI (for frontend deployment)

## Setup Instructions

### 1. Clone Repository

```bash
git clone https://github.com/verbio/verbio-app.git
cd verbio-app
```

### 2. Environment Configuration

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Required environment variables:
- Supabase credentials (URL, Anon Key, Service Key)
- Twilio credentials (Account SID, Auth Token, Phone Number)
- OpenAI API Key
- Stripe keys (Secret, Webhook Secret, Publishable)
- JWT Secret
- Backend/Frontend URLs

### 3. Install Dependencies

```bash
# Install root dependencies
npm install

# Install backend dependencies
cd backend && npm install && cd ..

# Install frontend dependencies
cd frontend && npm install && cd ..
```

### 4. Database Setup

Create Supabase tables and RLS policies:

```bash
npm run db:init
```

### 5. Development

Run both frontend and backend in development mode:

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:8080

### 6. Testing

```bash
# Run all tests
npm test

# Run backend tests only
npm run test:backend

# Run frontend tests only
npm run test:frontend

# Run with coverage
npm test -- --coverage
```

### 7. Linting & Formatting

```bash
# Lint all files
npm run lint

# Fix linting issues
npm run lint:fix

# Format all files
npm run format
```

## Deployment

### Frontend (Vercel)

```bash
cd frontend
vercel --prod
```

### Backend (Google Cloud Run)

```bash
# Build Docker image
npm run docker:build

# Deploy to Cloud Run
npm run gcloud:deploy
```

Or use GitHub Actions for automated deployment on push to main branch.

## Project Structure

```
verbio-app/
├── backend/                 # Backend Node.js application
│   ├── src/
│   │   ├── config/         # Configuration files
│   │   ├── middleware/     # Express middleware
│   │   ├── routes/         # API routes
│   │   ├── services/       # Business logic
│   │   ├── types/          # TypeScript types
│   │   ├── utils/          # Utility functions
│   │   └── index.ts        # Main server file
│   ├── tests/              # Backend tests
│   ├── Dockerfile          # Docker configuration
│   └── package.json        # Backend dependencies
├── frontend/               # Frontend React application
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── pages/          # Page components
│   │   ├── hooks/          # Custom hooks
│   │   ├── services/       # API services
│   │   ├── types/          # TypeScript types
│   │   ├── utils/          # Utility functions
│   │   └── main.tsx        # Entry point
│   ├── public/             # Static assets
│   ├── index.html          # HTML template
│   ├── vite.config.ts      # Vite configuration
│   └── package.json        # Frontend dependencies
├── shared/                 # Shared code between frontend/backend
├── .github/                # GitHub Actions workflows
├── .husky/                 # Git hooks
├── .env.example            # Environment variables template
├── .eslintrc.js            # ESLint configuration
├── .prettierrc             # Prettier configuration
├── tsconfig.json           # Root TypeScript config
├── vercel.json             # Vercel configuration
├── cloudbuild.yaml         # Google Cloud Build config
└── package.json            # Root package.json
```

## API Documentation

### Authentication
- `POST /api/auth/register` - Register new business
- `POST /api/auth/login` - Login with email/password
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/profile` - Get current user profile

### Business Management
- `GET /api/business/:id` - Get business details
- `PUT /api/business/:id` - Update business info
- `POST /api/business/:id/data` - Upload business data (menu, hours, etc.)

### Agent Configuration
- `GET /api/agents` - List all agents for business
- `POST /api/agents` - Create new agent
- `PUT /api/agents/:id` - Update agent configuration
- `DELETE /api/agents/:id` - Delete agent

### Phone Management
- `GET /api/phones` - List connected phone numbers
- `POST /api/phones/connect` - Connect Twilio phone number
- `DELETE /api/phones/:id` - Disconnect phone number

### Orders & Payments
- `GET /api/orders` - List all orders
- `GET /api/orders/:id` - Get order details
- `PUT /api/orders/:id/status` - Update order status
- `GET /api/payments` - List all payments
- `POST /api/payments/refund` - Process refund

### Voice Webhooks
- `POST /api/voice/webhook` - Twilio webhook endpoint
- `WS /api/realtime` - WebSocket for real-time audio streaming

### Health Check
- `GET /api/healthz` - Health check endpoint

## Security Best Practices

1. **Authentication**: JWT tokens with 24h expiry, httpOnly cookies
2. **Authorization**: Supabase RLS policies enforce row-level security
3. **Input Validation**: Joi schemas validate all API inputs
4. **Rate Limiting**: 100 requests per 15 minutes per IP
5. **CORS**: Configured for frontend domain only
6. **CSRF Protection**: Enabled for state-changing operations
7. **Secrets Management**: All secrets in environment variables
8. **HTTPS**: Enforced in production
9. **WebSocket Security**: Origin validation for Twilio connections
10. **Payment Security**: PCI compliance via Stripe, no card data stored

## Performance Optimizations

1. **Audio Latency**: <50ms buffering for real-time voice
2. **Database**: Connection pooling, indexed queries
3. **Caching**: Redis for session management (optional)
4. **CDN**: Static assets served via Vercel Edge Network
5. **Code Splitting**: Lazy loading for React components
6. **Compression**: Gzip enabled for API responses
7. **Concurrency**: Cloud Run configured for 80 concurrent requests
8. **Memory**: 1Gi allocated for audio processing

## Monitoring & Logging

- **Winston**: Structured JSON logging
- **Sentry**: Error tracking and performance monitoring
- **Cloud Logging**: Google Cloud logs for production
- **Metrics**: Custom metrics for call duration, function calls

## Support

For issues, questions, or contributions, please open an issue on GitHub or contact support@verbio.app.

## License

MIT License - See LICENSE file for details