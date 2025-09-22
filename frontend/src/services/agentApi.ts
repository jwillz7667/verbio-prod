import api from './api';
import { Agent, AgentTool, AgentSession, AgentTrace, AgentTemplate } from '../types/agent';

export interface RunAgentRequest {
  message: string;
  sessionId?: string;
  stream?: boolean;
  maxIterations?: number;
}

export interface RunAgentResponse {
  success: boolean;
  result: any;
  agentId: string;
  sessionId: string;
}

export interface CreateAgentFromTemplateRequest {
  templateType: string;
  customizations?: Partial<AgentTemplate>;
}

export interface ToolAssignment {
  toolId: string;
  priority?: number;
  customConfig?: Record<string, any>;
}

export interface HandoffConfig {
  toAgentId: string;
  conditions?: Record<string, any>;
  priority?: number;
}

class AgentApiService {
  private baseUrl = '/api/agents';

  // Agent CRUD Operations
  async getAgents(businessId: string): Promise<Agent[]> {
    const response = await api.getAxiosInstance().get(
      `${this.baseUrl}/business/${businessId}/agents`
    );
    return response.data.agents;
  }

  async getAgent(businessId: string, agentId: string): Promise<Agent> {
    const response = await api.getAxiosInstance().get(
      `${this.baseUrl}/business/${businessId}/agent/${agentId}`
    );
    return response.data.agent;
  }

  async createAgent(businessId: string, agentData: Partial<Agent>): Promise<Agent> {
    const response = await api.getAxiosInstance().post(
      `/api/business/${businessId}/agent`,
      agentData
    );
    return response.data.agent;
  }

  async updateAgent(businessId: string, agentId: string, updates: Partial<Agent>): Promise<Agent> {
    const response = await api.getAxiosInstance().put(
      `/api/business/${businessId}/agent/${agentId}`,
      updates
    );
    return response.data.agent;
  }

  async deleteAgent(businessId: string, agentId: string): Promise<void> {
    await api.getAxiosInstance().delete(
      `/api/business/${businessId}/agent/${agentId}`
    );
  }

  // Agent Template Operations
  async getTemplates(): Promise<Record<string, AgentTemplate>> {
    const response = await api.getAxiosInstance().get(`${this.baseUrl}/agent-templates`);
    return response.data.templates;
  }

  async createFromTemplate(
    businessId: string,
    request: CreateAgentFromTemplateRequest
  ): Promise<Agent> {
    const response = await api.getAxiosInstance().post(
      `${this.baseUrl}/business/${businessId}/agent/from-template`,
      request
    );
    return response.data.agent;
  }

  // Agent Execution
  async runAgent(
    businessId: string,
    agentId: string,
    request: RunAgentRequest
  ): Promise<RunAgentResponse> {
    const response = await api.getAxiosInstance().post(
      `${this.baseUrl}/business/${businessId}/agent/${agentId}/run`,
      request
    );
    return response.data;
  }

  async streamAgent(
    businessId: string,
    agentId: string,
    _message: string,
    onChunk: (chunk: any) => void,
    onError?: (error: Error) => void,
    onComplete?: () => void
  ): Promise<void> {
    const baseUrl = api.getAxiosInstance().defaults.baseURL || '';
    const eventSource = new EventSource(
      `${baseUrl}${this.baseUrl}/business/${businessId}/agent/${agentId}/run?stream=true`,
      {
        withCredentials: true,
      }
    );

    eventSource.onmessage = (event) => {
      if (event.data === '[DONE]') {
        eventSource.close();
        onComplete?.();
        return;
      }

      try {
        const chunk = JSON.parse(event.data);
        onChunk(chunk);
      } catch (error) {
        console.error('Failed to parse chunk:', error);
      }
    };

    eventSource.onerror = (_error) => {
      eventSource.close();
      onError?.(new Error('Stream connection failed'));
    };
  }

  async testAgent(
    businessId: string,
    agentId: string,
    testMessage?: string
  ): Promise<any> {
    const response = await api.getAxiosInstance().post(
      `${this.baseUrl}/business/${businessId}/agent/${agentId}/test`,
      { testMessage }
    );
    return response.data.test;
  }

  // Tool Management
  async getTools(businessId: string, category?: string): Promise<AgentTool[]> {
    const params = category ? { category } : {};
    const response = await api.getAxiosInstance().get(
      `${this.baseUrl}/business/${businessId}/agent-tools`,
      { params }
    );
    return response.data.tools;
  }

  async assignTool(
    businessId: string,
    agentId: string,
    assignment: ToolAssignment
  ): Promise<void> {
    await api.getAxiosInstance().post(
      `${this.baseUrl}/business/${businessId}/agent/${agentId}/assign-tool`,
      assignment
    );
  }

  async removeTool(
    businessId: string,
    agentId: string,
    toolId: string
  ): Promise<void> {
    await api.getAxiosInstance().delete(
      `${this.baseUrl}/business/${businessId}/agent/${agentId}/tool/${toolId}`
    );
  }

  // Handoff Management
  async createHandoff(
    businessId: string,
    fromAgentId: string,
    toAgentId: string,
    config?: Omit<HandoffConfig, 'toAgentId'>
  ): Promise<void> {
    await api.getAxiosInstance().post(
      `${this.baseUrl}/business/${businessId}/agent/${fromAgentId}/handoff/${toAgentId}`,
      config || {}
    );
  }

  async removeHandoff(
    businessId: string,
    fromAgentId: string,
    toAgentId: string
  ): Promise<void> {
    await api.getAxiosInstance().delete(
      `${this.baseUrl}/business/${businessId}/agent/${fromAgentId}/handoff/${toAgentId}`
    );
  }

  // Session Management
  async getSessions(
    businessId: string,
    limit = 50,
    offset = 0
  ): Promise<{ sessions: AgentSession[]; total: number }> {
    const response = await api.getAxiosInstance().get(
      `${this.baseUrl}/business/${businessId}/agent-sessions`,
      {
        params: { limit, offset },
      }
    );
    return {
      sessions: response.data.sessions,
      total: response.data.total,
    };
  }

  async getSession(businessId: string, sessionId: string): Promise<AgentSession> {
    const response = await api.getAxiosInstance().get(
      `${this.baseUrl}/business/${businessId}/agent-session/${sessionId}`
    );
    return response.data.session;
  }

  // Trace Management for Debugging
  async getTraces(businessId: string, sessionId: string): Promise<AgentTrace[]> {
    const response = await api.getAxiosInstance().get(
      `${this.baseUrl}/business/${businessId}/agent-traces/${sessionId}`
    );
    return response.data.traces;
  }

  // WebSocket Connection for Real-time Updates
  connectToAgentUpdates(
    businessId: string,
    onUpdate: (update: any) => void,
    onError?: (error: Error) => void
  ): () => void {
    const baseUrl = api.getAxiosInstance().defaults.baseURL || '';
    const ws = new WebSocket(
      `${baseUrl.replace('http', 'ws')}/ws/agents?businessId=${businessId}`
    );

    ws.onmessage = (event) => {
      try {
        const update = JSON.parse(event.data);
        onUpdate(update);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.onerror = (_event) => {
      onError?.(new Error('WebSocket connection failed'));
    };

    // Return cleanup function
    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }

  // Analytics and Metrics
  async getAgentMetrics(
    businessId: string,
    agentId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<any> {
    const response = await api.getAxiosInstance().get(
      `${this.baseUrl}/business/${businessId}/agent/${agentId}/metrics`,
      {
        params: {
          start: timeRange.start.toISOString(),
          end: timeRange.end.toISOString(),
        },
      }
    );
    return response.data.metrics;
  }

  async getAgentAnalytics(businessId: string): Promise<any> {
    const response = await api.getAxiosInstance().get(
      `${this.baseUrl}/business/${businessId}/analytics`
    );
    return response.data;
  }

  // Guardrail Management
  async getGuardrails(businessId: string): Promise<any[]> {
    const response = await api.getAxiosInstance().get(
      `${this.baseUrl}/business/${businessId}/guardrails`
    );
    return response.data.guardrails;
  }

  async assignGuardrail(
    businessId: string,
    agentId: string,
    guardrailId: string,
    applyOrder?: number
  ): Promise<void> {
    await api.getAxiosInstance().post(
      `${this.baseUrl}/business/${businessId}/agent/${agentId}/assign-guardrail`,
      { guardrailId, applyOrder }
    );
  }

  // Workflow Operations
  async getWorkflows(businessId: string): Promise<any[]> {
    const response = await api.getAxiosInstance().get(
      `${this.baseUrl}/business/${businessId}/workflows`
    );
    return response.data.workflows;
  }

  async createWorkflow(businessId: string, workflow: any): Promise<any> {
    const response = await api.getAxiosInstance().post(
      `${this.baseUrl}/business/${businessId}/workflow`,
      workflow
    );
    return response.data.workflow;
  }

  async executeWorkflow(
    businessId: string,
    workflowId: string,
    input: any
  ): Promise<any> {
    const response = await api.getAxiosInstance().post(
      `${this.baseUrl}/business/${businessId}/workflow/${workflowId}/execute`,
      input
    );
    return response.data;
  }
}

export const agentApi = new AgentApiService();