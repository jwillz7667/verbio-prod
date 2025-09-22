# Token Billing System Setup Guide

## Overview
The token billing system has been fully implemented with the following features:
- Token balance tracking and management
- Subscription plans (Free, Starter, Pro, Business, Enterprise)
- One-time token package purchases
- Real-time usage tracking
- Automatic token deduction based on service usage

## Database Migration

### Migration Files
The complete token system migration is located at:
- `/supabase/migrations/20250922000001_token_billing_system.sql`

### Tables Created
1. **subscription_plans** - Available subscription tiers
2. **token_packages** - One-time purchase options
3. **token_balances** - Current balance per business
4. **token_transactions** - Transaction history
5. **business_subscriptions** - Active subscriptions
6. **usage_tracking** - Detailed usage logs
7. **token_rates** - Service consumption rates

### To Apply Migration

```bash
# Navigate to project root
cd /Users/willz/ai/verbio-app

# Apply migration to your Supabase database
supabase db push
```

## Token Consumption Rates

| Service Type | Tokens per Unit | Unit |
|-------------|----------------|------|
| Outbound Calls | 2.0 | per minute |
| Inbound Calls | 1.5 | per minute |
| SMS Messages | 0.5 | per message |
| Transcription | 0.1 | per minute |
| AI Agent Requests | 1.0 | per request |

## Subscription Plans

| Plan | Monthly Price | Tokens/Month | Features |
|------|--------------|--------------|----------|
| Free | $0 | 100 (one-time) | 1 agent, community support |
| Starter | $9 | 1,000 | 3 agents, email support, basic analytics |
| Pro | $29 | 5,000 | 10 agents, priority support, advanced analytics |
| Business | $99 | 20,000 | Unlimited agents, phone support, white label |
| Enterprise | Custom | Custom | Custom features and support |

## Token Packages

| Package | Tokens | Price | Bonus |
|---------|--------|-------|-------|
| Starter Pack | 500 | $5 | 0 |
| Growth Pack | 2,000 | $18 | 200 |
| Scale Pack | 5,000 | $40 | 750 |
| Enterprise Pack | 20,000 | $150 | 5,000 |

## Backend Implementation

### Services
- **TokenService** (`/backend/src/services/tokenService.ts`)
  - Balance management
  - Usage tracking
  - Transaction logging

- **SubscriptionService** (`/backend/src/services/subscriptionService.ts`)
  - Plan management
  - Stripe integration
  - Package purchases

### API Endpoints
All endpoints require authentication and are prefixed with `/api/billing/`

- `GET /balance` - Get current token balance
- `GET /plans` - List subscription plans
- `GET /packages` - List token packages
- `GET /subscription` - Current subscription details
- `POST /subscribe` - Create/update subscription
- `DELETE /subscription` - Cancel subscription
- `POST /purchase` - Purchase token package
- `GET /transactions` - Transaction history
- `GET /usage` - Usage statistics
- `GET /rates` - Token consumption rates

### Integration Points

1. **Call Handlers** (`/backend/src/socket/realtimeHandler.ts`)
   - Pre-call balance check (minimum 10 tokens)
   - Real-time usage tracking
   - Automatic token deduction on call completion

2. **Middleware** (`/backend/src/middleware/requireBusiness.ts`)
   - Business context injection
   - Subscription tier tracking

## Frontend Implementation

### Pages
- **Billing Dashboard** (`/frontend/src/pages/Billing.tsx`)
  - Token balance display
  - Usage charts
  - Subscription management
  - Package purchase
  - Transaction history

### Routes
The billing page is accessible at `/dashboard/billing` for authenticated users.

## Stripe Integration

### Required Environment Variables
```env
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_webhook_secret
STRIPE_PUBLISHABLE_KEY=your_publishable_key
```

### Webhook Events Handled
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`
- `payment_intent.succeeded`

## Initial Setup for New Users

1. New users automatically receive 100 trial tokens on signup
2. Trial tokens are granted only once per business
3. Users can purchase additional tokens or subscribe to monthly plans
4. Token balance is checked before initiating any billable service

## Security Features

- Row-level security (RLS) policies on all token tables
- Users can only view their own data
- System service role can manage all data
- Stripe webhook signature verification
- Idempotent transaction logging

## Testing

1. Create a new business account
2. Verify 100 trial tokens are granted
3. Make a test call to verify token deduction
4. Purchase a token package
5. Subscribe to a monthly plan
6. Check transaction history

## Monitoring

- Low balance alerts when < 100 tokens
- Failed payment notifications
- Usage analytics dashboard
- Real-time balance updates

## Next Steps

1. Configure Stripe products and prices
2. Set up Stripe webhook endpoint
3. Enable email notifications for low balance
4. Configure custom enterprise plans
5. Add usage export functionality

## Support

For issues or questions about the token system:
1. Check the migration logs: `supabase db diff --linked`
2. View backend logs for token service errors
3. Verify Stripe webhook configuration
4. Check RLS policies if data access issues occur