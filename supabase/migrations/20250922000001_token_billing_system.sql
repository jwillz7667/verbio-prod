-- Token Billing System Migration
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
CREATE INDEX IF NOT EXISTS idx_token_balances_business_id ON token_balances(business_id);
CREATE INDEX IF NOT EXISTS idx_token_transactions_business_id ON token_transactions(business_id);
CREATE INDEX IF NOT EXISTS idx_token_transactions_created_at ON token_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_subscriptions_business_id ON business_subscriptions(business_id);
CREATE INDEX IF NOT EXISTS idx_business_subscriptions_status ON business_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_usage_tracking_business_id ON usage_tracking(business_id);
CREATE INDEX IF NOT EXISTS idx_usage_tracking_created_at ON usage_tracking(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_tracking_service_type ON usage_tracking(service_type);

-- Insert default subscription plans (only if they don't exist)
INSERT INTO subscription_plans (name, display_name, description, price_monthly, price_yearly, tokens_per_month, rollover_enabled, max_rollover_tokens, features, sort_order)
SELECT * FROM (VALUES
  ('free', 'Free', 'Perfect for trying out our service', 0::decimal, 0::decimal, 0, false, 0, '{"max_agents": 1, "support": "community"}'::jsonb, 0),
  ('starter', 'Starter', 'Great for small businesses', 9::decimal, 90::decimal, 1000, true, 2000, '{"max_agents": 3, "support": "email", "analytics": "basic"}'::jsonb, 1),
  ('pro', 'Pro', 'For growing businesses', 29::decimal, 290::decimal, 5000, true, 10000, '{"max_agents": 10, "support": "priority", "analytics": "advanced", "api_access": true}'::jsonb, 2),
  ('business', 'Business', 'For established businesses', 99::decimal, 990::decimal, 20000, true, 40000, '{"max_agents": "unlimited", "support": "phone", "analytics": "advanced", "api_access": true, "white_label": true}'::jsonb, 3),
  ('enterprise', 'Enterprise', 'Custom solutions for large organizations', 0::decimal, 0::decimal, 0, true, 0, '{"custom": true}'::jsonb, 4)
) AS t(name, display_name, description, price_monthly, price_yearly, tokens_per_month, rollover_enabled, max_rollover_tokens, features, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE subscription_plans.name = t.name);

-- Insert default token packages (only if they don't exist)
INSERT INTO token_packages (name, display_name, description, tokens, price, bonus_tokens, sort_order)
SELECT * FROM (VALUES
  ('starter_pack', 'Starter Pack', 'Get started with 500 tokens', 500, 5::decimal, 0, 1),
  ('growth_pack', 'Growth Pack', 'Best value for growing needs', 2000, 18::decimal, 200, 2),
  ('scale_pack', 'Scale Pack', 'For high-volume users', 5000, 40::decimal, 750, 3),
  ('enterprise_pack', 'Enterprise Pack', 'Bulk tokens for large operations', 20000, 150::decimal, 5000, 4)
) AS t(name, display_name, description, tokens, price, bonus_tokens, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM token_packages WHERE token_packages.name = t.name);

-- Insert default token consumption rates (only if they don't exist)
INSERT INTO token_rates (service_type, tokens_per_unit, unit_type, multipliers)
SELECT * FROM (VALUES
  ('outbound_call', 2.0::decimal, 'minute', '{"premium_voice": 1.5, "international": 2.0}'::jsonb),
  ('inbound_call', 1.5::decimal, 'minute', '{"premium_voice": 1.5}'::jsonb),
  ('sms', 0.5::decimal, 'message', '{"mms": 2.0, "international": 3.0}'::jsonb),
  ('transcription', 0.1::decimal, 'minute', '{"real_time": 1.5}'::jsonb),
  ('ai_agent', 1.0::decimal, 'request', '{"gpt4": 2.0, "complex_task": 1.5}'::jsonb)
) AS t(service_type, tokens_per_unit, unit_type, multipliers)
WHERE NOT EXISTS (SELECT 1 FROM token_rates WHERE token_rates.service_type = t.service_type);

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at columns
DROP TRIGGER IF EXISTS update_subscription_plans_updated_at ON subscription_plans;
CREATE TRIGGER update_subscription_plans_updated_at BEFORE UPDATE ON subscription_plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_token_packages_updated_at ON token_packages;
CREATE TRIGGER update_token_packages_updated_at BEFORE UPDATE ON token_packages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_token_balances_updated_at ON token_balances;
CREATE TRIGGER update_token_balances_updated_at BEFORE UPDATE ON token_balances
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_business_subscriptions_updated_at ON business_subscriptions;
CREATE TRIGGER update_business_subscriptions_updated_at BEFORE UPDATE ON business_subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_token_rates_updated_at ON token_rates;
CREATE TRIGGER update_token_rates_updated_at BEFORE UPDATE ON token_rates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security Policies
ALTER TABLE token_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_rates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for token_balances
CREATE POLICY "Users can view their own token balance" ON token_balances
    FOR SELECT USING (
        business_id IN (
            SELECT id FROM businesses
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "System can manage token balances" ON token_balances
    FOR ALL USING (true)
    WITH CHECK (true);

-- RLS Policies for token_transactions
CREATE POLICY "Users can view their own transactions" ON token_transactions
    FOR SELECT USING (
        business_id IN (
            SELECT id FROM businesses
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "System can manage transactions" ON token_transactions
    FOR ALL USING (true)
    WITH CHECK (true);

-- RLS Policies for business_subscriptions
CREATE POLICY "Users can view their own subscriptions" ON business_subscriptions
    FOR SELECT USING (
        business_id IN (
            SELECT id FROM businesses
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "System can manage subscriptions" ON business_subscriptions
    FOR ALL USING (true)
    WITH CHECK (true);

-- RLS Policies for usage_tracking
CREATE POLICY "Users can view their own usage" ON usage_tracking
    FOR SELECT USING (
        business_id IN (
            SELECT id FROM businesses
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "System can manage usage tracking" ON usage_tracking
    FOR ALL USING (true)
    WITH CHECK (true);

-- RLS Policies for public tables (plans, packages, rates)
CREATE POLICY "Anyone can view active plans" ON subscription_plans
    FOR SELECT USING (is_active = true);

CREATE POLICY "System can manage plans" ON subscription_plans
    FOR ALL USING (true)
    WITH CHECK (true);

CREATE POLICY "Anyone can view active packages" ON token_packages
    FOR SELECT USING (is_active = true);

CREATE POLICY "System can manage packages" ON token_packages
    FOR ALL USING (true)
    WITH CHECK (true);

CREATE POLICY "Anyone can view active rates" ON token_rates
    FOR SELECT USING (is_active = true);

CREATE POLICY "System can manage rates" ON token_rates
    FOR ALL USING (true)
    WITH CHECK (true);

-- Grant initial trial tokens to existing businesses that haven't received them
UPDATE businesses
SET trial_tokens_used = false,
    trial_tokens_granted = 100
WHERE trial_tokens_used IS NULL;

-- Create initial token balance for existing businesses
INSERT INTO token_balances (business_id, current_balance, total_bonus)
SELECT id, 100, 100
FROM businesses
WHERE NOT EXISTS (
    SELECT 1 FROM token_balances
    WHERE token_balances.business_id = businesses.id
);

-- Log trial token grants as transactions
INSERT INTO token_transactions (business_id, type, amount, balance_before, balance_after, description, metadata)
SELECT b.id, 'trial', 100, 0, 100, 'Initial trial tokens', '{"source": "migration"}'::jsonb
FROM businesses b
WHERE NOT EXISTS (
    SELECT 1 FROM token_transactions t
    WHERE t.business_id = b.id
    AND t.type = 'trial'
);