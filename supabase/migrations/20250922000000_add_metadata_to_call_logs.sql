-- Add metadata column to call_logs table
ALTER TABLE call_logs
ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Make agent_id nullable since not all calls have an agent
ALTER TABLE call_logs
ALTER COLUMN agent_id DROP NOT NULL;

-- Add ended_at column for tracking call end time
ALTER TABLE call_logs
ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;

-- Add index for metadata column for better query performance
CREATE INDEX IF NOT EXISTS idx_call_logs_metadata ON call_logs USING GIN (metadata);

-- Add index for status column for better filtering
CREATE INDEX IF NOT EXISTS idx_call_logs_status ON call_logs(status);

-- Add index for created_at for better date range queries
CREATE INDEX IF NOT EXISTS idx_call_logs_created_at ON call_logs(created_at DESC);