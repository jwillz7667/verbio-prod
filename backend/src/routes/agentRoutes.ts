import { Router, Request, Response } from 'express';
import { authenticate, AuthRequest, requireBusinessAccess } from '../middleware/auth';
import { asyncHandler } from '../utils/errorHandler';
import { supabaseAdmin } from '../config/supabase';
import { OpenAIAgentService } from '../services/openaiAgentService';
import { AGENT_TEMPLATES, createAgentFromTemplate } from '../agents/templates';
import { AGENT_TOOLS, TOOL_CATEGORIES } from '../agents/tools';
import Logger from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import Joi from 'joi';

const router = Router();
const logger = Logger;

// Validation schemas
const createAgentSchema = Joi.object({
  name: Joi.string().required(),
  type: Joi.string().valid('service', 'order', 'payment', 'scheduling', 'triage', 'supervisor').required(),
  prompt: Joi.string().required(),
  model_override: Joi.string().optional(),
  voice_config: Joi.object().optional(),
  agent_config: Joi.object().optional(),
  capabilities: Joi.object({
    tools: Joi.array().items(Joi.string()).optional(),
    handoffs: Joi.array().items(Joi.string()).optional(),
    guardrails: Joi.array().items(Joi.string()).optional(),
  }).optional(),
  parent_agent_id: Joi.string().uuid().optional(),
  agent_role: Joi.string().optional(),
  max_iterations: Joi.number().min(1).max(50).optional(),
  enable_tracing: Joi.boolean().optional(),
});

const runAgentSchema = Joi.object({
  message: Joi.string().required(),
  sessionId: Joi.string().optional(),
  stream: Joi.boolean().optional(),
  maxIterations: Joi.number().optional(),
});

const toolAssignmentSchema = Joi.object({
  toolId: Joi.string().uuid().required(),
  priority: Joi.number().optional(),
  customConfig: Joi.object().optional(),
});

// Get all agents for a business with enhanced data
router.get('/business/:businessId/agents',
  authenticate,
  requireBusinessAccess,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { businessId } = req.params;

    const { data: agents, error } = await supabaseAdmin
      .from('agents')
      .select(`
        *,
        agent_tool_assignments (
          tool_id,
          priority,
          custom_config,
          agent_tools (*)
        ),
        from_handoffs:agent_handoffs!from_agent_id (
          to_agent_id,
          handoff_conditions,
          priority
        ),
        to_handoffs:agent_handoffs!to_agent_id (
          from_agent_id,
          handoff_conditions
        ),
        agent_guardrail_assignments (
          guardrail_id,
          apply_order,
          agent_guardrails (*)
        )
      `)
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to fetch agents', { error, businessId });
      return res.status(500).json({ error: 'Failed to fetch agents' });
    }

    res.json({
      success: true,
      agents: agents || [],
      total: agents?.length || 0,
    });
  })
);

// Create agent from template
router.post('/business/:businessId/agent/from-template',
  authenticate,
  requireBusinessAccess,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { businessId } = req.params;
    const { templateType, customizations } = req.body;

    if (!templateType || !AGENT_TEMPLATES[templateType as keyof typeof AGENT_TEMPLATES]) {
      return res.status(400).json({ error: 'Invalid template type' });
    }

    const template = createAgentFromTemplate(templateType, customizations);

    // Create agent in database
    const agentData = {
      id: uuidv4(),
      business_id: businessId,
      name: template.name,
      type: template.type,
      prompt: template.instructions,
      model_override: template.model,
      agent_role: template.type + '_specialist',
      max_iterations: template.maxIterations || 10,
      enable_tracing: true,
      agent_config: {
        temperature: template.temperature,
        model: template.model,
      },
      capabilities: {
        tools: template.tools,
        handoffs: template.handoffAgents || [],
        guardrails: template.guardrails || [],
      },
      voice_config: {
        voice: 'alloy',
        temperature: template.temperature || 0.7,
        speed: 1,
        pitch: 1,
      },
      is_active: true,
    };

    const { data: agent, error } = await supabaseAdmin
      .from('agents')
      .insert(agentData)
      .select()
      .single();

    if (error) {
      logger.error('Failed to create agent from template', { error, businessId });
      return res.status(500).json({ error: 'Failed to create agent' });
    }

    // Assign tools to agent
    if (template.tools && template.tools.length > 0) {
      const toolAssignments = [];
      for (const toolName of template.tools) {
        // Find or create tool
        const { data: tool } = await supabaseAdmin
          .from('agent_tools')
          .select('id')
          .eq('business_id', businessId)
          .eq('name', toolName)
          .single();

        if (tool) {
          toolAssignments.push({
            id: uuidv4(),
            agent_id: agent.id,
            tool_id: tool.id,
            priority: 0,
          });
        }
      }

      if (toolAssignments.length > 0) {
        await supabaseAdmin
          .from('agent_tool_assignments')
          .insert(toolAssignments);
      }
    }

    logger.info('Agent created from template', {
      agentId: agent.id,
      businessId,
      templateType,
    });

    res.status(201).json({
      success: true,
      agent,
      template: templateType,
    });
  })
);

// Run agent with message
router.post('/business/:businessId/agent/:agentId/run',
  authenticate,
  requireBusinessAccess,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { businessId, agentId } = req.params;

    const { error: validationError, value } = runAgentSchema.validate(req.body);
    if (validationError) {
      return res.status(400).json({
        error: validationError.details[0]?.message || 'Invalid input'
      });
    }

    const { message, sessionId, stream, maxIterations } = value;

    // Create agent service instance
    const agentService = new OpenAIAgentService({
      businessId,
      sessionId: sessionId || uuidv4(),
      customerId: req.user?.userId,
    });

    try {
      if (stream) {
        // Set up SSE for streaming
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });

        const streamResult = await agentService.streamAgent(agentId, message, {
          maxIterations,
        });

        for await (const chunk of streamResult) {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }

        res.write('data: [DONE]\n\n');
        res.end();
      } else {
        // Regular run
        const result = await agentService.runAgent(agentId, message, {
          maxIterations,
        });

        res.json({
          success: true,
          result,
          agentId,
          sessionId: sessionId || result.sessionId,
        });
      }
    } catch (error) {
      logger.error('Agent run failed', { error, agentId, businessId });
      res.status(500).json({
        error: 'Agent execution failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  })
);

// Get agent tools
router.get('/business/:businessId/agent-tools',
  authenticate,
  requireBusinessAccess,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { businessId } = req.params;
    const { category } = req.query;

    let query = supabaseAdmin
      .from('agent_tools')
      .select('*')
      .eq('business_id', businessId)
      .eq('is_active', true);

    if (category) {
      query = query.eq('category', category);
    }

    const { data: tools, error } = await query.order('category', { ascending: true });

    if (error) {
      logger.error('Failed to fetch agent tools', { error, businessId });
      return res.status(500).json({ error: 'Failed to fetch tools' });
    }

    res.json({
      success: true,
      tools: tools || [],
      categories: TOOL_CATEGORIES,
      builtInTools: Object.keys(AGENT_TOOLS),
    });
  })
);

// Assign tool to agent
router.post('/business/:businessId/agent/:agentId/assign-tool',
  authenticate,
  requireBusinessAccess,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { businessId, agentId } = req.params;

    const { error: validationError, value } = toolAssignmentSchema.validate(req.body);
    if (validationError) {
      return res.status(400).json({
        error: validationError.details[0]?.message || 'Invalid input'
      });
    }

    const { toolId, priority, customConfig } = value;

    // Verify agent belongs to business
    const { data: agent } = await supabaseAdmin
      .from('agents')
      .select('id')
      .eq('id', agentId)
      .eq('business_id', businessId)
      .single();

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Verify tool belongs to business
    const { data: tool } = await supabaseAdmin
      .from('agent_tools')
      .select('id')
      .eq('id', toolId)
      .eq('business_id', businessId)
      .single();

    if (!tool) {
      return res.status(404).json({ error: 'Tool not found' });
    }

    // Create assignment
    const { data: assignment, error: assignError } = await supabaseAdmin
      .from('agent_tool_assignments')
      .insert({
        id: uuidv4(),
        agent_id: agentId,
        tool_id: toolId,
        priority: priority || 0,
        custom_config: customConfig || {},
      })
      .select()
      .single();

    if (assignError) {
      if (assignError.code === '23505') {
        return res.status(409).json({ error: 'Tool already assigned to agent' });
      }
      logger.error('Failed to assign tool', { error: assignError });
      return res.status(500).json({ error: 'Failed to assign tool' });
    }

    logger.info('Tool assigned to agent', {
      agentId,
      toolId,
      businessId,
    });

    res.json({
      success: true,
      assignment,
    });
  })
);

// Create agent handoff
router.post('/business/:businessId/agent/:fromAgentId/handoff/:toAgentId',
  authenticate,
  requireBusinessAccess,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { businessId, fromAgentId, toAgentId } = req.params;
    const { conditions, priority } = req.body;

    // Verify both agents belong to business
    const { data: agents } = await supabaseAdmin
      .from('agents')
      .select('id')
      .eq('business_id', businessId)
      .in('id', [fromAgentId, toAgentId]);

    if (!agents || agents.length !== 2) {
      return res.status(404).json({ error: 'One or both agents not found' });
    }

    // Create handoff
    const { data: handoff, error } = await supabaseAdmin
      .from('agent_handoffs')
      .insert({
        id: uuidv4(),
        from_agent_id: fromAgentId,
        to_agent_id: toAgentId,
        handoff_conditions: conditions || {},
        priority: priority || 0,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Handoff already exists' });
      }
      logger.error('Failed to create handoff', { error });
      return res.status(500).json({ error: 'Failed to create handoff' });
    }

    logger.info('Agent handoff created', {
      fromAgentId,
      toAgentId,
      businessId,
    });

    res.json({
      success: true,
      handoff,
    });
  })
);

// Get agent sessions
router.get('/business/:businessId/agent-sessions',
  authenticate,
  requireBusinessAccess,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { businessId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const { data: sessions, error, count } = await supabaseAdmin
      .from('agent_sessions')
      .select('*, agents(name, type)', { count: 'exact' })
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(Number(limit))
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (error) {
      logger.error('Failed to fetch sessions', { error, businessId });
      return res.status(500).json({ error: 'Failed to fetch sessions' });
    }

    res.json({
      success: true,
      sessions: sessions || [],
      total: count || 0,
      limit: Number(limit),
      offset: Number(offset),
    });
  })
);

// Get agent traces for debugging
router.get('/business/:businessId/agent-traces/:sessionId',
  authenticate,
  requireBusinessAccess,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { businessId, sessionId } = req.params;

    const { data: traces, error } = await supabaseAdmin
      .from('agent_traces')
      .select('*, agents(name)')
      .eq('business_id', businessId)
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) {
      logger.error('Failed to fetch traces', { error, businessId, sessionId });
      return res.status(500).json({ error: 'Failed to fetch traces' });
    }

    res.json({
      success: true,
      traces: traces || [],
      sessionId,
    });
  })
);

// Get agent templates
router.get('/agent-templates',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    res.json({
      success: true,
      templates: AGENT_TEMPLATES,
      categories: Object.keys(AGENT_TEMPLATES),
    });
  })
);

// Test agent configuration
router.post('/business/:businessId/agent/:agentId/test',
  authenticate,
  requireBusinessAccess,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { businessId, agentId } = req.params;
    const { testMessage = 'Hello, can you help me?' } = req.body;

    const agentService = new OpenAIAgentService({
      businessId,
      sessionId: 'test-' + uuidv4(),
      customerId: 'test-user',
    });

    try {
      const result = await agentService.runAgent(agentId, testMessage, {
        maxIterations: 3,
      });

      res.json({
        success: true,
        test: {
          input: testMessage,
          output: (result as any).finalOutput || result,
          usage: (result as any).usage || {},
        },
      });
    } catch (error) {
      logger.error('Agent test failed', { error, agentId });
      res.status(500).json({
        error: 'Agent test failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  })
);

export default router;