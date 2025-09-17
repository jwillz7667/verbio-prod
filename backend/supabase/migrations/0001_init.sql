-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom types/enums
CREATE TYPE agent_type AS ENUM ('service', 'order', 'payment');
CREATE TYPE order_status AS ENUM ('pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled');
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'refunded');
CREATE TYPE payment_result_status AS ENUM ('pending', 'succeeded', 'failed', 'refunded');
CREATE TYPE call_status AS ENUM ('initiated', 'ringing', 'in-progress', 'completed', 'failed', 'busy', 'no-answer');
CREATE TYPE speaker_type AS ENUM ('agent', 'customer');

-- =============================================================================
-- USERS TABLE
-- =============================================================================
-- Stores user authentication information
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for users table
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_created_at ON users(created_at);

-- =============================================================================
-- BUSINESSES TABLE
-- =============================================================================
-- Stores business information and configuration
CREATE TABLE businesses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    data_json JSONB DEFAULT '{}'::jsonb, -- Stores menu, hours, pricing, etc.
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for businesses table
CREATE INDEX idx_businesses_user_id ON businesses(user_id);
CREATE INDEX idx_businesses_name ON businesses(name);
CREATE INDEX idx_businesses_data_json ON businesses USING gin(data_json);

-- =============================================================================
-- AGENTS TABLE
-- =============================================================================
-- Stores AI agent configurations
CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type agent_type NOT NULL,
    prompt TEXT NOT NULL,
    voice_config JSONB DEFAULT '{"voice": "alloy", "temperature": 0.8}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for agents table
CREATE INDEX idx_agents_business_id ON agents(business_id);
CREATE INDEX idx_agents_type ON agents(type);
CREATE INDEX idx_agents_is_active ON agents(is_active);

-- =============================================================================
-- PHONE_MAPPINGS TABLE
-- =============================================================================
-- Maps Twilio phone numbers to agents
CREATE TABLE phone_mappings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    twilio_number VARCHAR(20) UNIQUE NOT NULL, -- E.164 format
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for phone_mappings table
CREATE INDEX idx_phone_mappings_business_id ON phone_mappings(business_id);
CREATE INDEX idx_phone_mappings_twilio_number ON phone_mappings(twilio_number);
CREATE INDEX idx_phone_mappings_agent_id ON phone_mappings(agent_id);
CREATE INDEX idx_phone_mappings_is_active ON phone_mappings(is_active);

-- =============================================================================
-- ORDERS TABLE
-- =============================================================================
-- Stores customer orders
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    customer_phone VARCHAR(20) NOT NULL,
    items JSONB NOT NULL, -- Array of {name, quantity, price}
    total DECIMAL(10, 2) NOT NULL,
    status order_status DEFAULT 'pending',
    payment_status payment_status DEFAULT 'pending',
    call_id UUID REFERENCES call_logs(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for orders table
CREATE INDEX idx_orders_business_id ON orders(business_id);
CREATE INDEX idx_orders_customer_phone ON orders(customer_phone);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_payment_status ON orders(payment_status);
CREATE INDEX idx_orders_call_id ON orders(call_id);
CREATE INDEX idx_orders_created_at ON orders(created_at);

-- =============================================================================
-- PAYMENTS TABLE
-- =============================================================================
-- Stores payment transactions
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    stripe_charge_id VARCHAR(255) UNIQUE,
    status payment_result_status DEFAULT 'pending',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for payments table
CREATE INDEX idx_payments_order_id ON payments(order_id);
CREATE INDEX idx_payments_business_id ON payments(business_id);
CREATE INDEX idx_payments_stripe_charge_id ON payments(stripe_charge_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_created_at ON payments(created_at);

-- =============================================================================
-- CALL_LOGS TABLE
-- =============================================================================
-- Stores call information and metadata
CREATE TABLE call_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    call_sid VARCHAR(255) UNIQUE NOT NULL, -- Twilio CallSid
    from_number VARCHAR(20) NOT NULL,
    to_number VARCHAR(20) NOT NULL,
    duration INTEGER, -- Duration in seconds
    status call_status DEFAULT 'initiated',
    recording_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for call_logs table
CREATE INDEX idx_call_logs_business_id ON call_logs(business_id);
CREATE INDEX idx_call_logs_agent_id ON call_logs(agent_id);
CREATE INDEX idx_call_logs_call_sid ON call_logs(call_sid);
CREATE INDEX idx_call_logs_from_number ON call_logs(from_number);
CREATE INDEX idx_call_logs_to_number ON call_logs(to_number);
CREATE INDEX idx_call_logs_status ON call_logs(status);
CREATE INDEX idx_call_logs_created_at ON call_logs(created_at);

-- Fix circular reference by adding foreign key after call_logs table is created
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_call_id_fkey;
ALTER TABLE orders ADD CONSTRAINT orders_call_id_fkey
    FOREIGN KEY (call_id) REFERENCES call_logs(id) ON DELETE SET NULL;

-- =============================================================================
-- TRANSCRIPTS TABLE
-- =============================================================================
-- Stores call transcripts
CREATE TABLE transcripts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    call_id UUID NOT NULL REFERENCES call_logs(id) ON DELETE CASCADE,
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    speaker speaker_type NOT NULL,
    text TEXT NOT NULL,
    timestamp DECIMAL(10, 3) NOT NULL, -- Timestamp in seconds
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for transcripts table
CREATE INDEX idx_transcripts_call_id ON transcripts(call_id);
CREATE INDEX idx_transcripts_business_id ON transcripts(business_id);
CREATE INDEX idx_transcripts_speaker ON transcripts(speaker);
CREATE INDEX idx_transcripts_timestamp ON transcripts(timestamp);
CREATE INDEX idx_transcripts_created_at ON transcripts(created_at);

-- =============================================================================
-- UPDATED_AT TRIGGER FUNCTION
-- =============================================================================
-- Automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all relevant tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_businesses_updated_at BEFORE UPDATE ON businesses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_phone_mappings_updated_at BEFORE UPDATE ON phone_mappings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_call_logs_updated_at BEFORE UPDATE ON call_logs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS POLICIES FOR USERS TABLE
-- =============================================================================
-- Users can only see and update their own record
CREATE POLICY "Users can view own record" ON users
    FOR SELECT USING (auth.uid()::text = id::text);

CREATE POLICY "Users can update own record" ON users
    FOR UPDATE USING (auth.uid()::text = id::text);

-- Anyone can insert a new user (for registration)
CREATE POLICY "Anyone can register" ON users
    FOR INSERT WITH CHECK (true);

-- =============================================================================
-- RLS POLICIES FOR BUSINESSES TABLE
-- =============================================================================
-- Users can only see businesses they own
CREATE POLICY "Users can view own businesses" ON businesses
    FOR SELECT USING (user_id::text = auth.uid()::text);

CREATE POLICY "Users can insert own businesses" ON businesses
    FOR INSERT WITH CHECK (user_id::text = auth.uid()::text);

CREATE POLICY "Users can update own businesses" ON businesses
    FOR UPDATE USING (user_id::text = auth.uid()::text);

CREATE POLICY "Users can delete own businesses" ON businesses
    FOR DELETE USING (user_id::text = auth.uid()::text);

-- =============================================================================
-- RLS POLICIES FOR AGENTS TABLE
-- =============================================================================
-- Users can manage agents for their businesses
CREATE POLICY "Users can view agents of own businesses" ON agents
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM businesses
            WHERE businesses.id = agents.business_id
            AND businesses.user_id::text = auth.uid()::text
        )
    );

CREATE POLICY "Users can insert agents for own businesses" ON agents
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM businesses
            WHERE businesses.id = agents.business_id
            AND businesses.user_id::text = auth.uid()::text
        )
    );

CREATE POLICY "Users can update agents of own businesses" ON agents
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM businesses
            WHERE businesses.id = agents.business_id
            AND businesses.user_id::text = auth.uid()::text
        )
    );

CREATE POLICY "Users can delete agents of own businesses" ON agents
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM businesses
            WHERE businesses.id = agents.business_id
            AND businesses.user_id::text = auth.uid()::text
        )
    );

-- =============================================================================
-- RLS POLICIES FOR PHONE_MAPPINGS TABLE
-- =============================================================================
-- Users can manage phone mappings for their businesses
CREATE POLICY "Users can view phone mappings of own businesses" ON phone_mappings
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM businesses
            WHERE businesses.id = phone_mappings.business_id
            AND businesses.user_id::text = auth.uid()::text
        )
    );

CREATE POLICY "Users can insert phone mappings for own businesses" ON phone_mappings
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM businesses
            WHERE businesses.id = phone_mappings.business_id
            AND businesses.user_id::text = auth.uid()::text
        )
    );

CREATE POLICY "Users can update phone mappings of own businesses" ON phone_mappings
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM businesses
            WHERE businesses.id = phone_mappings.business_id
            AND businesses.user_id::text = auth.uid()::text
        )
    );

CREATE POLICY "Users can delete phone mappings of own businesses" ON phone_mappings
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM businesses
            WHERE businesses.id = phone_mappings.business_id
            AND businesses.user_id::text = auth.uid()::text
        )
    );

-- =============================================================================
-- RLS POLICIES FOR ORDERS TABLE
-- =============================================================================
-- Users can view and manage orders for their businesses
CREATE POLICY "Users can view orders of own businesses" ON orders
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM businesses
            WHERE businesses.id = orders.business_id
            AND businesses.user_id::text = auth.uid()::text
        )
    );

CREATE POLICY "Users can insert orders for own businesses" ON orders
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM businesses
            WHERE businesses.id = orders.business_id
            AND businesses.user_id::text = auth.uid()::text
        )
    );

CREATE POLICY "Users can update orders of own businesses" ON orders
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM businesses
            WHERE businesses.id = orders.business_id
            AND businesses.user_id::text = auth.uid()::text
        )
    );

CREATE POLICY "Users can delete orders of own businesses" ON orders
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM businesses
            WHERE businesses.id = orders.business_id
            AND businesses.user_id::text = auth.uid()::text
        )
    );

-- =============================================================================
-- RLS POLICIES FOR PAYMENTS TABLE
-- =============================================================================
-- Users can view and manage payments for their businesses
CREATE POLICY "Users can view payments of own businesses" ON payments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM businesses
            WHERE businesses.id = payments.business_id
            AND businesses.user_id::text = auth.uid()::text
        )
    );

CREATE POLICY "Users can insert payments for own businesses" ON payments
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM businesses
            WHERE businesses.id = payments.business_id
            AND businesses.user_id::text = auth.uid()::text
        )
    );

CREATE POLICY "Users can update payments of own businesses" ON payments
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM businesses
            WHERE businesses.id = payments.business_id
            AND businesses.user_id::text = auth.uid()::text
        )
    );

-- =============================================================================
-- RLS POLICIES FOR CALL_LOGS TABLE
-- =============================================================================
-- Users can view call logs for their businesses
CREATE POLICY "Users can view call logs of own businesses" ON call_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM businesses
            WHERE businesses.id = call_logs.business_id
            AND businesses.user_id::text = auth.uid()::text
        )
    );

CREATE POLICY "Users can insert call logs for own businesses" ON call_logs
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM businesses
            WHERE businesses.id = call_logs.business_id
            AND businesses.user_id::text = auth.uid()::text
        )
    );

CREATE POLICY "Users can update call logs of own businesses" ON call_logs
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM businesses
            WHERE businesses.id = call_logs.business_id
            AND businesses.user_id::text = auth.uid()::text
        )
    );

-- =============================================================================
-- RLS POLICIES FOR TRANSCRIPTS TABLE
-- =============================================================================
-- Users can view transcripts for their businesses
CREATE POLICY "Users can view transcripts of own businesses" ON transcripts
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM businesses
            WHERE businesses.id = transcripts.business_id
            AND businesses.user_id::text = auth.uid()::text
        )
    );

CREATE POLICY "Users can insert transcripts for own businesses" ON transcripts
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM businesses
            WHERE businesses.id = transcripts.business_id
            AND businesses.user_id::text = auth.uid()::text
        )
    );

-- =============================================================================
-- REALTIME PUBLICATION
-- =============================================================================
-- Enable realtime for specific tables
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE payments;
ALTER PUBLICATION supabase_realtime ADD TABLE call_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE transcripts;

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================
-- Additional composite indexes for common queries
CREATE INDEX idx_orders_business_created ON orders(business_id, created_at DESC);
CREATE INDEX idx_payments_business_created ON payments(business_id, created_at DESC);
CREATE INDEX idx_call_logs_business_created ON call_logs(business_id, created_at DESC);
CREATE INDEX idx_transcripts_call_timestamp ON transcripts(call_id, timestamp ASC);

-- Full text search indexes (optional)
CREATE INDEX idx_businesses_name_fts ON businesses USING gin(to_tsvector('english', name));
CREATE INDEX idx_transcripts_text_fts ON transcripts USING gin(to_tsvector('english', text));

-- =============================================================================
-- COMMENTS FOR DOCUMENTATION
-- =============================================================================
COMMENT ON TABLE users IS 'Stores user authentication and profile information';
COMMENT ON TABLE businesses IS 'Stores business information and configuration data';
COMMENT ON TABLE agents IS 'Stores AI agent configurations for different services';
COMMENT ON TABLE phone_mappings IS 'Maps Twilio phone numbers to specific agents';
COMMENT ON TABLE orders IS 'Stores customer orders placed through voice agents';
COMMENT ON TABLE payments IS 'Stores payment transactions processed through Stripe';
COMMENT ON TABLE call_logs IS 'Stores call information and metadata from Twilio';
COMMENT ON TABLE transcripts IS 'Stores conversation transcripts from voice calls';

COMMENT ON COLUMN businesses.data_json IS 'Stores business data like menu, hours, pricing in JSON format';
COMMENT ON COLUMN agents.voice_config IS 'Voice configuration including model, voice type, and parameters';
COMMENT ON COLUMN orders.items IS 'Array of order items with name, quantity, and price';
COMMENT ON COLUMN payments.metadata IS 'Additional payment metadata from Stripe or custom data';
COMMENT ON COLUMN transcripts.timestamp IS 'Timestamp in seconds from the start of the call';