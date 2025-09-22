-- Token System Migration
-- This migration creates all necessary tables for the token-based billing system

-- Subscription plans table
CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  description TEXT,
  price_monthly DECIMAL(10, 2) NOT NULL,
  price_yearly DECIMAL(10, 2),
  tokens_per_month INTEGER NOT NULL,
  rollover_enabled BOOLEAN DEFAULT false,
  max_rollover_tokens INTEGER DEFAULT 0,
  features JSONB DEFAULT '{}',
  stripe_product_id VARCHAR(255),
  stripe_price_monthly_id VARCHAR(255),
  stripe_price_yearly_id VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Token packages for one-time purchases
CREATE TABLE IF NOT EXISTS token_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  description TEXT,
  tokens INTEGER NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  bonus_tokens INTEGER DEFAULT 0,
  stripe_product_id VARCHAR(255),
  stripe_price_id VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Token balances per business
CREATE TABLE IF NOT EXISTS token_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  current_balance DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total_purchased DECIMAL(10, 2) DEFAULT 0,
  total_consumed DECIMAL(10, 2) DEFAULT 0,
  total_bonus DECIMAL(10, 2) DEFAULT 0,
  last_refill_at TIMESTAMP WITH TIME ZONE,
  low_balance_alert_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(business_id)
);

-- Token transactions log
CREATE TABLE IF NOT EXISTS token_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN ('purchase', 'subscription', 'usage', 'refund', 'bonus', 'adjustment', 'trial')),
  amount DECIMAL(10, 2) NOT NULL,
  balance_before DECIMAL(10, 2) NOT NULL,
  balance_after DECIMAL(10, 2) NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  reference_type VARCHAR(50),
  reference_id UUID,
  stripe_payment_id VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Business subscriptions
CREATE TABLE IF NOT EXISTS business_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES subscription_plans(id),
  status VARCHAR(50) NOT NULL CHECK (status IN ('active', 'canceled', 'past_due', 'trialing', 'paused')),
  stripe_subscription_id VARCHAR(255),
  stripe_customer_id VARCHAR(255),
  current_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
  cancel_at_period_end BOOLEAN DEFAULT false,
  canceled_at TIMESTAMP WITH TIME ZONE,
  trial_start TIMESTAMP WITH TIME ZONE,
  trial_end TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(business_id)
);

-- Usage tracking per service
CREATE TABLE IF NOT EXISTS usage_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  service_type VARCHAR(50) NOT NULL CHECK (service_type IN ('outbound_call', 'inbound_call', 'sms', 'transcription', 'ai_agent')),
  reference_id VARCHAR(255),
  tokens_consumed DECIMAL(10, 2) NOT NULL,
  duration_seconds INTEGER,
  multiplier DECIMAL(3, 2) DEFAULT 1.0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Token consumption rates configuration
CREATE TABLE IF NOT EXISTS token_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type VARCHAR(50) NOT NULL UNIQUE,
  tokens_per_unit DECIMAL(10, 2) NOT NULL,
  unit_type VARCHAR(20) NOT NULL CHECK (unit_type IN ('minute', 'message', 'request', 'character')),
  multipliers JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add columns to existing businesses table
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(50) DEFAULT 'free',
ADD COLUMN IF NOT EXISTS trial_tokens_granted DECIMAL(10, 2) DEFAULT 100,
ADD COLUMN IF NOT EXISTS trial_tokens_used BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);

-- Add column to existing call_logs table
ALTER TABLE call_logs
ADD COLUMN IF NOT EXISTS tokens_consumed DECIMAL(10, 2) DEFAULT 0;

-- Create indexes for performance
CREATE INDEX idx_token_balances_business_id ON token_balances(business_id);
CREATE INDEX idx_token_transactions_business_id ON token_transactions(business_id);
CREATE INDEX idx_token_transactions_created_at ON token_transactions(created_at DESC);
CREATE INDEX idx_business_subscriptions_business_id ON business_subscriptions(business_id);
CREATE INDEX idx_business_subscriptions_status ON business_subscriptions(status);
CREATE INDEX idx_usage_tracking_business_id ON usage_tracking(business_id);
CREATE INDEX idx_usage_tracking_created_at ON usage_tracking(created_at DESC);

-- Insert default subscription plans
INSERT INTO subscription_plans (name, display_name, description, price_monthly, price_yearly, tokens_per_month, rollover_enabled, max_rollover_tokens, features, sort_order) VALUES
('free', 'Free', 'Perfect for trying out our service', 0, 0, 0, false, 0, '{"max_agents": 1, "support": "community"}', 0),
('starter', 'Starter', 'Great for small businesses', 9, 90, 1000, true, 2000, '{"max_agents": 3, "support": "email", "analytics": "basic"}', 1),
('pro', 'Pro', 'For growing businesses', 29, 290, 5000, true, 10000, '{"max_agents": 10, "support": "priority", "analytics": "advanced", "api_access": true}', 2),
('business', 'Business', 'For established businesses', 99, 990, 20000, true, 40000, '{"max_agents": "unlimited", "support": "phone", "analytics": "advanced", "api_access": true, "white_label": true}', 3),
('enterprise', 'Enterprise', 'Custom solutions for large organizations', 0, 0, 0, true, 0, '{"custom": true}', 4);

-- Insert default token packages
INSERT INTO token_packages (name, display_name, description, tokens, price, bonus_tokens, sort_order) VALUES
('starter_pack', 'Starter Pack', 'Get started with 500 tokens', 500, 5, 0, 1),
('growth_pack', 'Growth Pack', 'Best value for growing needs', 2000, 18, 200, 2),
('scale_pack', 'Scale Pack', 'For high-volume users', 5000, 40, 750, 3),
('enterprise_pack', 'Enterprise Pack', 'Bulk tokens for large operations', 20000, 150, 5000, 4);

-- Insert default token consumption rates
INSERT INTO token_rates (service_type, tokens_per_unit, unit_type, multipliers) VALUES
('outbound_call', 2.0, 'minute', '{"premium_voice": 1.5, "international": 2.0}'),
('inbound_call', 1.5, 'minute', '{"premium_voice": 1.5}'),
('sms', 0.5, 'message', '{"mms": 2.0, "international": 3.0}'),
('transcription', 0.1, 'minute', '{"real_time": 1.5}'),
('ai_agent', 1.0, 'request', '{"gpt4": 2.0, "complex_task": 1.5}');

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at columns
CREATE TRIGGER update_subscription_plans_updated_at BEFORE UPDATE ON subscription_plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_token_packages_updated_at BEFORE UPDATE ON token_packages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_token_balances_updated_at BEFORE UPDATE ON token_balances
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_business_subscriptions_updated_at BEFORE UPDATE ON business_subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_token_rates_updated_at BEFORE UPDATE ON token_rates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security Policies
ALTER TABLE token_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;

-- RLS Policies for token_balances
CREATE POLICY "Users can view their own token balance" ON token_balances
    FOR SELECT USING (business_id IN (
        SELECT id FROM businesses WHERE user_id = auth.uid()
    ));

-- RLS Policies for token_transactions
CREATE POLICY "Users can view their own transactions" ON token_transactions
    FOR SELECT USING (business_id IN (
        SELECT id FROM businesses WHERE user_id = auth.uid()
    ));

-- RLS Policies for business_subscriptions
CREATE POLICY "Users can view their own subscriptions" ON business_subscriptions
    FOR SELECT USING (business_id IN (
        SELECT id FROM businesses WHERE user_id = auth.uid()
    ));

-- RLS Policies for usage_tracking
CREATE POLICY "Users can view their own usage" ON usage_tracking
    FOR SELECT USING (business_id IN (
        SELECT id FROM businesses WHERE user_id = auth.uid()
    ));