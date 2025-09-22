export interface Agent {
  id: string;
  business_id: string;
  name: string;
  type: 'service' | 'order' | 'payment' | 'scheduling' | 'triage' | 'supervisor';
  prompt: string;
  voice_config: VoiceConfig;
  agent_config?: AgentConfig;
  capabilities?: AgentCapabilities;
  parent_agent_id?: string;
  agent_role?: string;
  max_iterations?: number;
  enable_tracing?: boolean;
  model_override?: string;
  session_config?: Record<string, any>;
  is_active: boolean;
  created_at: string;
  updated_at: string;

  // Relations
  agent_tool_assignments?: ToolAssignment[];
  from_handoffs?: HandoffConfig[];
  to_handoffs?: HandoffConfig[];
  agent_guardrail_assignments?: GuardrailAssignment[];
}

export interface VoiceConfig {
  voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' | 'cedar' | 'marin';
  temperature: number;
  speed: number;
  pitch: number;
}

export interface AgentConfig {
  temperature?: number;
  model?: string;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: string[];
}

export interface AgentCapabilities {
  tools: string[];
  handoffs: string[];
  guardrails: string[];
  structured_outputs: any[];
}

export interface AgentTool {
  id: string;
  business_id: string;
  name: string;
  description: string;
  category: 'order' | 'payment' | 'scheduling' | 'business' | 'custom';
  parameters_schema: any;
  implementation_type: 'built-in' | 'webhook' | 'function';
  configuration: Record<string, any>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ToolAssignment {
  id?: string;
  agent_id: string;
  tool_id: string;
  priority: number;
  custom_config?: Record<string, any>;
  agent_tools?: AgentTool;
}

export interface HandoffConfig {
  id?: string;
  from_agent_id: string;
  to_agent_id: string;
  handoff_conditions?: Record<string, any>;
  priority: number;
  is_active?: boolean;
}

export interface AgentGuardrail {
  id: string;
  business_id: string;
  name: string;
  description?: string;
  type: 'input' | 'output' | 'function_call';
  validation_schema?: any;
  action: 'block' | 'warn' | 'modify';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GuardrailAssignment {
  id?: string;
  agent_id: string;
  guardrail_id: string;
  apply_order: number;
  agent_guardrails?: AgentGuardrail;
}

export interface AgentSession {
  id: string;
  business_id: string;
  session_key: string;
  agent_id?: string;
  customer_identifier?: string;
  conversation_state: any;
  metadata?: Record<string, any>;
  expires_at?: string;
  created_at: string;
  updated_at: string;
  agents?: Pick<Agent, 'name' | 'type'>;
}

export interface AgentTrace {
  id: string;
  business_id: string;
  session_id?: string;
  agent_id?: string;
  trace_type: 'run' | 'tool_call' | 'handoff' | 'guardrail';
  parent_trace_id?: string;
  input_data?: any;
  output_data?: any;
  error_data?: any;
  duration_ms?: number;
  token_usage?: TokenUsage;
  metadata?: Record<string, any>;
  created_at: string;
  agents?: Pick<Agent, 'name'>;
}

export interface TokenUsage {
  input?: number;
  output?: number;
  total?: number;
}

export interface AgentTemplate {
  name: string;
  description: string;
  type: Agent['type'];
  instructions: string;
  model?: string;
  tools: string[];
  handoffAgents?: string[];
  guardrails?: string[];
  temperature?: number;
  maxIterations?: number;
}

export interface AgentMetrics {
  agentId: string;
  period: {
    start: string;
    end: string;
  };
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  averageDuration: number;
  tokenUsage: TokenUsage;
  errorRate: number;
  satisfactionScore?: number;
  topErrors?: Array<{
    error: string;
    count: number;
  }>;
  toolUsage?: Array<{
    tool: string;
    count: number;
    averageDuration: number;
  }>;
}

export interface WorkflowNode {
  id: string;
  type: 'agent' | 'condition' | 'parallel' | 'loop' | 'human_approval';
  agentId?: string;
  config: Record<string, any>;
  position: { x: number; y: number };
  connections: string[];
}

export interface Workflow {
  id: string;
  business_id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  entry_node_id: string;
  variables?: Record<string, any>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AgentRunResult {
  success: boolean;
  output: any;
  usage?: TokenUsage;
  traces?: AgentTrace[];
  errors?: string[];
  duration: number;
}

// Canvas types for visual builder
export interface CanvasNode {
  id: string;
  type: 'agent' | 'tool' | 'condition' | 'start' | 'end';
  data: {
    label: string;
    agent?: Agent;
    tool?: AgentTool;
    condition?: any;
  };
  position: { x: number; y: number };
  selected?: boolean;
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  type?: 'handoff' | 'tool' | 'condition';
  label?: string;
  animated?: boolean;
}

export interface CanvasState {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  selectedNode?: string;
  selectedEdge?: string;
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
}