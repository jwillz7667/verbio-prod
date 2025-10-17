-- =====================================================
-- OpenAI Agents SDK Enhancement Migration
-- =====================================================
-- This migration adds support for the OpenAI Agents SDK features
-- including multi-agent workflows, tools, handoffs, and guardrails

-- Add new columns to agents table for SDK features
ALTER TABLE agents
ADD COLUMN IF NOT EXISTS agent_config JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS capabilities JSONB DEFAULT '{
  "tools": [],
  "handoffs": [],
  "guardrails": [],
  "structured_outputs": []
}'::jsonb,
ADD COLUMN IF NOT EXISTS parent_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS agent_role VARCHAR(50) DEFAULT 'standalone',
ADD COLUMN IF NOT EXISTS max_iterations INTEGER DEFAULT 10,
ADD COLUMN IF NOT EXISTS enable_tracing BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS model_override VARCHAR(100),
ADD COLUMN IF NOT EXISTS session_config JSONB DEFAULT '{}'::jsonb;

-- Create index for parent-child relationships
CREATE INDEX IF NOT EXISTS idx_agents_parent_id ON agents(parent_agent_id);
CREATE INDEX IF NOT EXISTS idx_agents_role ON agents(agent_role);

-- Create agent_tools table for managing available tools
CREATE TABLE IF NOT EXISTS agent_tools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL, -- 'order', 'payment', 'scheduling', 'business', 'custom'
    parameters_schema JSONB NOT NULL,
    implementation_type VARCHAR(50) NOT NULL DEFAULT 'built-in', -- 'built-in', 'webhook', 'function'
    configuration JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(business_id, name)
);

CREATE INDEX IF NOT EXISTS idx_agent_tools_business_id ON agent_tools(business_id);
CREATE INDEX IF NOT EXISTS idx_agent_tools_category ON agent_tools(category);
CREATE INDEX IF NOT EXISTS idx_agent_tools_is_active ON agent_tools(is_active);

-- Create agent_tool_assignments table for many-to-many relationship
CREATE TABLE IF NOT EXISTS agent_tool_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    tool_id UUID NOT NULL REFERENCES agent_tools(id) ON DELETE CASCADE,
    priority INTEGER DEFAULT 0,
    custom_config JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(agent_id, tool_id)
);

CREATE INDEX IF NOT EXISTS idx_tool_assignments_agent_id ON agent_tool_assignments(agent_id);
CREATE INDEX IF NOT EXISTS idx_tool_assignments_tool_id ON agent_tool_assignments(tool_id);

-- Create agent_handoffs table for managing handoff relationships
CREATE TABLE IF NOT EXISTS agent_handoffs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    to_agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    handoff_conditions JSONB DEFAULT '{}'::jsonb, -- Conditions for handoff
    priority INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(from_agent_id, to_agent_id)
);

CREATE INDEX IF NOT EXISTS idx_handoffs_from_agent ON agent_handoffs(from_agent_id);
CREATE INDEX IF NOT EXISTS idx_handoffs_to_agent ON agent_handoffs(to_agent_id);

-- Create agent_guardrails table
CREATE TABLE IF NOT EXISTS agent_guardrails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    type VARCHAR(50) NOT NULL, -- 'input', 'output', 'function_call'
    validation_schema JSONB, -- Zod schema or validation rules
    action VARCHAR(50) DEFAULT 'block', -- 'block', 'warn', 'modify'
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_guardrails_business_id ON agent_guardrails(business_id);
CREATE INDEX IF NOT EXISTS idx_guardrails_type ON agent_guardrails(type);

-- Create agent_guardrail_assignments table
CREATE TABLE IF NOT EXISTS agent_guardrail_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    guardrail_id UUID NOT NULL REFERENCES agent_guardrails(id) ON DELETE CASCADE,
    apply_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(agent_id, guardrail_id)
);

CREATE INDEX IF NOT EXISTS idx_guardrail_assignments_agent_id ON agent_guardrail_assignments(agent_id);
CREATE INDEX IF NOT EXISTS idx_guardrail_assignments_guardrail_id ON agent_guardrail_assignments(guardrail_id);

-- Create agent_sessions table for conversation persistence
CREATE TABLE IF NOT EXISTS agent_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    session_key VARCHAR(255) NOT NULL,
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    customer_identifier VARCHAR(255), -- phone, email, or user ID
    conversation_state JSONB DEFAULT '{}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_sessions_business_id ON agent_sessions(business_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_session_key ON agent_sessions(session_key);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_customer ON agent_sessions(customer_identifier);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_expires ON agent_sessions(expires_at);

-- Create agent_traces table for debugging and analytics
CREATE TABLE IF NOT EXISTS agent_traces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    session_id UUID REFERENCES agent_sessions(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    trace_type VARCHAR(50) NOT NULL, -- 'run', 'tool_call', 'handoff', 'guardrail'
    parent_trace_id UUID REFERENCES agent_traces(id) ON DELETE CASCADE,
    input_data JSONB,
    output_data JSONB,
    error_data JSONB,
    duration_ms INTEGER,
    token_usage JSONB DEFAULT '{}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_traces_business_id ON agent_traces(business_id);
CREATE INDEX IF NOT EXISTS idx_traces_session_id ON agent_traces(session_id);
CREATE INDEX IF NOT EXISTS idx_traces_agent_id ON agent_traces(agent_id);
CREATE INDEX IF NOT EXISTS idx_traces_type ON agent_traces(trace_type);
CREATE INDEX IF NOT EXISTS idx_traces_parent_id ON agent_traces(parent_trace_id);
CREATE INDEX IF NOT EXISTS idx_traces_created_at ON agent_traces(created_at);

-- Add default built-in tools for existing businesses
INSERT INTO agent_tools (business_id, name, description, category, parameters_schema, implementation_type)
SELECT
    b.id,
    tool.name,
    tool.description,
    tool.category,
    tool.parameters_schema,
    'built-in'
FROM businesses b
CROSS JOIN (
    VALUES
    ('create_order', 'Create a new customer order', 'order',
     '{"type":"object","properties":{"items":{"type":"array"},"total":{"type":"number"}},"required":["items","total"]}'::jsonb),
    ('process_payment', 'Process payment for an order', 'payment',
     '{"type":"object","properties":{"amount":{"type":"number"},"orderId":{"type":"string"}},"required":["amount"]}'::jsonb),
    ('check_availability', 'Check business availability', 'scheduling',
     '{"type":"object","properties":{"date":{"type":"string"},"time":{"type":"string"}},"required":["date"]}'::jsonb),
    ('schedule_appointment', 'Schedule an appointment', 'scheduling',
     '{"type":"object","properties":{"date":{"type":"string"},"time":{"type":"string"},"service":{"type":"string"}},"required":["date","time","service"]}'::jsonb),
    ('get_business_info', 'Get business information', 'business',
     '{"type":"object","properties":{}}'::jsonb)
) AS tool(name, description, category, parameters_schema)
ON CONFLICT (business_id, name) DO NOTHING;

-- Update existing agents to have default agent_role
UPDATE agents
SET agent_role = CASE
    WHEN type = 'service' THEN 'service_specialist'
    WHEN type = 'order' THEN 'order_specialist'
    WHEN type = 'payment' THEN 'payment_specialist'
    ELSE 'standalone'
END
WHERE agent_role IS NULL OR agent_role = 'standalone';

-- Add triggers for updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_agent_tools_updated_at ON agent_tools;
CREATE TRIGGER update_agent_tools_updated_at BEFORE UPDATE ON agent_tools
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_agent_guardrails_updated_at ON agent_guardrails;
CREATE TRIGGER update_agent_guardrails_updated_at BEFORE UPDATE ON agent_guardrails
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_agent_sessions_updated_at ON agent_sessions;
CREATE TRIGGER update_agent_sessions_updated_at BEFORE UPDATE ON agent_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add RLS policies for new tables
ALTER TABLE agent_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_tool_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_handoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_guardrails ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_guardrail_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_traces ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (assuming similar pattern as existing tables)
DROP POLICY IF EXISTS "Business users can manage their agent tools" ON agent_tools;
CREATE POLICY "Business users can manage their agent tools"
    ON agent_tools FOR ALL
    USING (business_id IN (
        SELECT business_id FROM users WHERE id = auth.uid()
    ));

DROP POLICY IF EXISTS "Business users can manage tool assignments" ON agent_tool_assignments;
CREATE POLICY "Business users can manage tool assignments"
    ON agent_tool_assignments FOR ALL
    USING (agent_id IN (
        SELECT id FROM agents WHERE business_id IN (
            SELECT business_id FROM users WHERE id = auth.uid()
        )
    ));

DROP POLICY IF EXISTS "Business users can manage handoffs" ON agent_handoffs;
CREATE POLICY "Business users can manage handoffs"
    ON agent_handoffs FOR ALL
    USING (from_agent_id IN (
        SELECT id FROM agents WHERE business_id IN (
            SELECT business_id FROM users WHERE id = auth.uid()
        )
    ));

DROP POLICY IF EXISTS "Business users can manage guardrails" ON agent_guardrails;
CREATE POLICY "Business users can manage guardrails"
    ON agent_guardrails FOR ALL
    USING (business_id IN (
        SELECT business_id FROM users WHERE id = auth.uid()
    ));

DROP POLICY IF EXISTS "Business users can manage guardrail assignments" ON agent_guardrail_assignments;
CREATE POLICY "Business users can manage guardrail assignments"
    ON agent_guardrail_assignments FOR ALL
    USING (agent_id IN (
        SELECT id FROM agents WHERE business_id IN (
            SELECT business_id FROM users WHERE id = auth.uid()
        )
    ));

DROP POLICY IF EXISTS "Business users can manage sessions" ON agent_sessions;
CREATE POLICY "Business users can manage sessions"
    ON agent_sessions FOR ALL
    USING (business_id IN (
        SELECT business_id FROM users WHERE id = auth.uid()
    ));

DROP POLICY IF EXISTS "Business users can view traces" ON agent_traces;
CREATE POLICY "Business users can view traces"
    ON agent_traces FOR SELECT
    USING (business_id IN (
        SELECT business_id FROM users WHERE id = auth.uid()
    ));

-- Grant necessary permissions
GRANT ALL ON agent_tools TO authenticated;
GRANT ALL ON agent_tool_assignments TO authenticated;
GRANT ALL ON agent_handoffs TO authenticated;
GRANT ALL ON agent_guardrails TO authenticated;
GRANT ALL ON agent_guardrail_assignments TO authenticated;
GRANT ALL ON agent_sessions TO authenticated;
GRANT ALL ON agent_traces TO authenticated;