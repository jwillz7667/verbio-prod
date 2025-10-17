-- Additional Application Features Migration
-- Adds missing tables for Activities, Customers, Reports, Analytics, and other features
-- This migration complements the existing agent SDK tables

-- =============================================================================
-- ENUMS AND TYPES (only what's missing)
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE activity_type AS ENUM ('call', 'order', 'payment', 'agent', 'system', 'user');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE activity_status AS ENUM ('success', 'error', 'warning', 'info');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE report_type AS ENUM ('usage', 'performance', 'revenue', 'custom');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE workflow_node_type AS ENUM ('agent', 'condition', 'parallel', 'loop', 'human_approval', 'start', 'end');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- =============================================================================
-- WORKFLOWS TABLE (for visual workflow builder)
-- =============================================================================

CREATE TABLE IF NOT EXISTS workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  entry_node_id VARCHAR(255),
  variables JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- =============================================================================
-- WORKFLOW NODES TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS workflow_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  node_id VARCHAR(255) NOT NULL,
  type workflow_node_type NOT NULL,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  config JSONB DEFAULT '{}',
  position JSONB DEFAULT '{"x": 0, "y": 0}',
  connections JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(workflow_id, node_id)
);

-- =============================================================================
-- CUSTOMERS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  phone_number VARCHAR(20),
  email VARCHAR(255),
  name VARCHAR(255),
  tags JSONB DEFAULT '[]',
  preferences JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  total_orders INTEGER DEFAULT 0,
  total_spent DECIMAL(10,2) DEFAULT 0,
  last_order_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(business_id, phone_number),
  UNIQUE(business_id, email)
);

-- =============================================================================
-- ACTIVITIES TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  type activity_type NOT NULL,
  status activity_status NOT NULL DEFAULT 'info',
  title VARCHAR(255) NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reference_type VARCHAR(50),
  reference_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- =============================================================================
-- REPORTS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type report_type NOT NULL,
  parameters JSONB DEFAULT '{}',
  data JSONB DEFAULT '{}',
  schedule JSONB,
  last_generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- =============================================================================
-- ANALYTICS EVENTS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  event_name VARCHAR(255) NOT NULL,
  event_category VARCHAR(100),
  event_value JSONB DEFAULT '{}',
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id VARCHAR(255),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- =============================================================================
-- VOICE RECORDINGS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS voice_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  call_id UUID REFERENCES call_logs(id) ON DELETE CASCADE,
  recording_sid VARCHAR(255) UNIQUE,
  recording_url TEXT,
  duration INTEGER,
  file_size INTEGER,
  transcription_status VARCHAR(50) DEFAULT 'pending',
  transcription_text TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- =============================================================================
-- WEBHOOK CONFIGURATIONS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS webhook_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  events JSONB DEFAULT '[]',
  headers JSONB DEFAULT '{}',
  secret VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  failure_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Workflows indexes
CREATE INDEX IF NOT EXISTS idx_workflows_business_id ON workflows(business_id);
CREATE INDEX IF NOT EXISTS idx_workflows_is_active ON workflows(is_active);

-- Workflow nodes indexes
CREATE INDEX IF NOT EXISTS idx_workflow_nodes_workflow_id ON workflow_nodes(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_nodes_agent_id ON workflow_nodes(agent_id);

-- Customers indexes
CREATE INDEX IF NOT EXISTS idx_customers_business_id ON customers(business_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone_number ON customers(phone_number);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_tags ON customers USING gin(tags);

-- Activities indexes
CREATE INDEX IF NOT EXISTS idx_activities_business_id ON activities(business_id);
CREATE INDEX IF NOT EXISTS idx_activities_type ON activities(type);
CREATE INDEX IF NOT EXISTS idx_activities_status ON activities(status);
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at DESC);

-- Reports indexes
CREATE INDEX IF NOT EXISTS idx_reports_business_id ON reports(business_id);
CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(type);

-- Analytics events indexes
CREATE INDEX IF NOT EXISTS idx_analytics_events_business_id ON analytics_events(business_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_name ON analytics_events(event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON analytics_events(created_at DESC);

-- Voice recordings indexes
CREATE INDEX IF NOT EXISTS idx_voice_recordings_business_id ON voice_recordings(business_id);
CREATE INDEX IF NOT EXISTS idx_voice_recordings_call_id ON voice_recordings(call_id);

-- Webhook configurations indexes
CREATE INDEX IF NOT EXISTS idx_webhook_configs_business_id ON webhook_configurations(business_id);
CREATE INDEX IF NOT EXISTS idx_webhook_configs_is_active ON webhook_configurations(is_active);

-- =============================================================================
-- UPDATE TRIGGERS (only for new tables)
-- =============================================================================

DROP TRIGGER IF EXISTS update_workflows_updated_at ON workflows;
CREATE TRIGGER update_workflows_updated_at BEFORE UPDATE ON workflows
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_workflow_nodes_updated_at ON workflow_nodes;
CREATE TRIGGER update_workflow_nodes_updated_at BEFORE UPDATE ON workflow_nodes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_reports_updated_at ON reports;
CREATE TRIGGER update_reports_updated_at BEFORE UPDATE ON reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_voice_recordings_updated_at ON voice_recordings;
CREATE TRIGGER update_voice_recordings_updated_at BEFORE UPDATE ON voice_recordings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_webhook_configurations_updated_at ON webhook_configurations;
CREATE TRIGGER update_webhook_configurations_updated_at BEFORE UPDATE ON webhook_configurations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- ROW LEVEL SECURITY POLICIES (for new tables)
-- =============================================================================

-- Enable RLS on new tables
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_configurations ENABLE ROW LEVEL SECURITY;

-- Workflows policies
CREATE POLICY "Users can view their business workflows" ON workflows
    FOR SELECT USING (business_id IN (
        SELECT id FROM businesses WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can manage their business workflows" ON workflows
    FOR ALL USING (business_id IN (
        SELECT id FROM businesses WHERE user_id = auth.uid()
    ));

-- Workflow nodes policies
CREATE POLICY "Users can view their workflow nodes" ON workflow_nodes
    FOR SELECT USING (workflow_id IN (
        SELECT id FROM workflows WHERE business_id IN (
            SELECT id FROM businesses WHERE user_id = auth.uid()
        )
    ));

CREATE POLICY "Users can manage their workflow nodes" ON workflow_nodes
    FOR ALL USING (workflow_id IN (
        SELECT id FROM workflows WHERE business_id IN (
            SELECT id FROM businesses WHERE user_id = auth.uid()
        )
    ));

-- Customers policies
CREATE POLICY "Users can view their business customers" ON customers
    FOR SELECT USING (business_id IN (
        SELECT id FROM businesses WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can manage their business customers" ON customers
    FOR ALL USING (business_id IN (
        SELECT id FROM businesses WHERE user_id = auth.uid()
    ));

-- Activities policies
CREATE POLICY "Users can view their business activities" ON activities
    FOR SELECT USING (business_id IN (
        SELECT id FROM businesses WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can create activities" ON activities
    FOR INSERT WITH CHECK (business_id IN (
        SELECT id FROM businesses WHERE user_id = auth.uid()
    ));

-- Reports policies
CREATE POLICY "Users can view their business reports" ON reports
    FOR SELECT USING (business_id IN (
        SELECT id FROM businesses WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can manage their business reports" ON reports
    FOR ALL USING (business_id IN (
        SELECT id FROM businesses WHERE user_id = auth.uid()
    ));

-- Analytics events policies
CREATE POLICY "Users can view their business analytics" ON analytics_events
    FOR SELECT USING (business_id IN (
        SELECT id FROM businesses WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can create analytics events" ON analytics_events
    FOR INSERT WITH CHECK (business_id IN (
        SELECT id FROM businesses WHERE user_id = auth.uid()
    ));

-- Voice recordings policies
CREATE POLICY "Users can view their business recordings" ON voice_recordings
    FOR SELECT USING (business_id IN (
        SELECT id FROM businesses WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can manage their business recordings" ON voice_recordings
    FOR ALL USING (business_id IN (
        SELECT id FROM businesses WHERE user_id = auth.uid()
    ));

-- Webhook configurations policies
CREATE POLICY "Users can view their business webhooks" ON webhook_configurations
    FOR SELECT USING (business_id IN (
        SELECT id FROM businesses WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can manage their business webhooks" ON webhook_configurations
    FOR ALL USING (business_id IN (
        SELECT id FROM businesses WHERE user_id = auth.uid()
    ));

-- =============================================================================
-- FUNCTION TO AUTO-UPDATE CUSTOMER STATS
-- =============================================================================

CREATE OR REPLACE FUNCTION update_customer_stats()
RETURNS TRIGGER AS $$
BEGIN
    -- Update customer stats when a new order is created
    IF TG_OP = 'INSERT' THEN
        UPDATE customers
        SET
            total_orders = total_orders + 1,
            total_spent = total_spent + NEW.total,
            last_order_date = NEW.created_at
        WHERE business_id = NEW.business_id
        AND phone_number = NEW.customer_phone;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update customer stats on new orders
DROP TRIGGER IF EXISTS update_customer_on_order ON orders;
CREATE TRIGGER update_customer_on_order
AFTER INSERT ON orders
FOR EACH ROW
EXECUTE FUNCTION update_customer_stats();

-- =============================================================================
-- FUNCTION TO LOG ACTIVITIES
-- =============================================================================

CREATE OR REPLACE FUNCTION log_activity(
    p_business_id UUID,
    p_type activity_type,
    p_title VARCHAR(255),
    p_description TEXT DEFAULT NULL,
    p_status activity_status DEFAULT 'info',
    p_metadata JSONB DEFAULT '{}',
    p_reference_type VARCHAR(50) DEFAULT NULL,
    p_reference_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_activity_id UUID;
BEGIN
    INSERT INTO activities (
        business_id, type, title, description,
        status, metadata, reference_type, reference_id
    )
    VALUES (
        p_business_id, p_type, p_title, p_description,
        p_status, p_metadata, p_reference_type, p_reference_id
    )
    RETURNING id INTO v_activity_id;

    RETURN v_activity_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- SAMPLE ACTIVITY LOGGING TRIGGERS
-- =============================================================================

-- Log when a new agent is created
CREATE OR REPLACE FUNCTION log_agent_activity()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM log_activity(
            NEW.business_id,
            'agent'::activity_type,
            'Agent created: ' || NEW.name,
            'New ' || NEW.type || ' agent was created',
            'success'::activity_status,
            jsonb_build_object('agent_id', NEW.id, 'agent_type', NEW.type)
        );
    ELSIF TG_OP = 'UPDATE' AND OLD.is_active != NEW.is_active THEN
        PERFORM log_activity(
            NEW.business_id,
            'agent'::activity_type,
            'Agent ' || CASE WHEN NEW.is_active THEN 'activated' ELSE 'deactivated' END || ': ' || NEW.name,
            NULL,
            'info'::activity_status,
            jsonb_build_object('agent_id', NEW.id, 'agent_type', NEW.type)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agent_activity_trigger ON agents;
CREATE TRIGGER agent_activity_trigger
AFTER INSERT OR UPDATE ON agents
FOR EACH ROW
EXECUTE FUNCTION log_agent_activity();

-- Log when a new order is created
CREATE OR REPLACE FUNCTION log_order_activity()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM log_activity(
        NEW.business_id,
        'order'::activity_type,
        'New order #' || LEFT(NEW.id::TEXT, 8),
        'Order placed for $' || NEW.total,
        'success'::activity_status,
        jsonb_build_object(
            'order_id', NEW.id,
            'total', NEW.total,
            'customer_phone', NEW.customer_phone
        ),
        'order',
        NEW.id
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS order_activity_trigger ON orders;
CREATE TRIGGER order_activity_trigger
AFTER INSERT ON orders
FOR EACH ROW
EXECUTE FUNCTION log_order_activity();

-- Log when a payment is processed
CREATE OR REPLACE FUNCTION log_payment_activity()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'succeeded' THEN
        PERFORM log_activity(
            NEW.business_id,
            'payment'::activity_type,
            'Payment processed: $' || NEW.amount,
            'Payment succeeded for order',
            'success'::activity_status,
            jsonb_build_object(
                'payment_id', NEW.id,
                'order_id', NEW.order_id,
                'amount', NEW.amount
            ),
            'payment',
            NEW.id
        );
    ELSIF NEW.status = 'failed' THEN
        PERFORM log_activity(
            NEW.business_id,
            'payment'::activity_type,
            'Payment failed: $' || NEW.amount,
            'Payment failed for order',
            'error'::activity_status,
            jsonb_build_object(
                'payment_id', NEW.id,
                'order_id', NEW.order_id,
                'amount', NEW.amount
            ),
            'payment',
            NEW.id
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payment_activity_trigger ON payments;
CREATE TRIGGER payment_activity_trigger
AFTER INSERT OR UPDATE ON payments
FOR EACH ROW
WHEN (NEW.status IN ('succeeded', 'failed'))
EXECUTE FUNCTION log_payment_activity();