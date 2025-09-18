import { Router, Response } from 'express';
import Joi from 'joi';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '../config/supabase';
import { authenticate, requireBusinessAccess, AuthRequest } from '../middleware/auth';
import { ValidationError, NotFoundError, AuthorizationError, ConflictError, CustomError } from '../utils/errorHandler';
import { logger, logDatabase } from '../utils/logger';
import { asyncHandler } from '../utils/errorHandler';

const router = Router();

const businessDataSchema = Joi.object({
  menu: Joi.array().items(
    Joi.object({
      id: Joi.string().optional(),
      name: Joi.string().required(),
      description: Joi.string().optional().allow(''),
      price: Joi.number().positive().required(),
      category: Joi.string().optional(),
      available: Joi.boolean().optional().default(true),
      modifiers: Joi.array().items(
        Joi.object({
          name: Joi.string().required(),
          price: Joi.number().optional(),
          required: Joi.boolean().optional(),
          options: Joi.array().items(Joi.string()).optional(),
        })
      ).optional(),
      image_url: Joi.string().uri().optional().allow(''),
    })
  ).optional(),
  hours: Joi.object({
    monday: Joi.object({
      open: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
      close: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
      closed: Joi.boolean().optional(),
    }).optional(),
    tuesday: Joi.object({
      open: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
      close: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
      closed: Joi.boolean().optional(),
    }).optional(),
    wednesday: Joi.object({
      open: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
      close: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
      closed: Joi.boolean().optional(),
    }).optional(),
    thursday: Joi.object({
      open: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
      close: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
      closed: Joi.boolean().optional(),
    }).optional(),
    friday: Joi.object({
      open: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
      close: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
      closed: Joi.boolean().optional(),
    }).optional(),
    saturday: Joi.object({
      open: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
      close: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
      closed: Joi.boolean().optional(),
    }).optional(),
    sunday: Joi.object({
      open: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
      close: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
      closed: Joi.boolean().optional(),
    }).optional(),
  }).optional(),
  pricing: Joi.object().pattern(Joi.string(), Joi.number().positive()).optional(),
  location: Joi.object({
    address: Joi.string().optional(),
    city: Joi.string().optional(),
    state: Joi.string().optional(),
    zip: Joi.string().optional(),
    country: Joi.string().optional(),
    latitude: Joi.number().min(-90).max(90).optional(),
    longitude: Joi.number().min(-180).max(180).optional(),
  }).optional(),
  description: Joi.string().max(1000).optional().allow(''),
  phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional().allow(''),
  email: Joi.string().email().optional().allow(''),
  website: Joi.string().uri().optional().allow(''),
  features: Joi.array().items(Joi.string()).optional(),
  customPrompts: Joi.object().pattern(Joi.string(), Joi.string()).optional(),
}).min(1);

const phoneSchema = Joi.object({
  twilio_number: Joi.string()
    .pattern(/^\+1[2-9]\d{9}$/)
    .required()
    .messages({
      'string.pattern.base': 'Phone number must be in E.164 format (+1XXXXXXXXXX)',
    }),
  agent_id: Joi.string().uuid().required(),
});

const agentSchema = Joi.object({
  name: Joi.string().min(2).max(255).optional(),
  type: Joi.string().valid('service', 'order', 'payment').optional(),
  prompt: Joi.string().min(10).max(5000).optional(),
  voice_config: Joi.object({
    voice: Joi.string().valid('alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer').optional(),
    temperature: Joi.number().min(0).max(2).optional(),
    variant: Joi.array().items(Joi.string()).optional(),
    speed: Joi.number().min(0.5).max(2).optional(),
    pitch: Joi.number().min(0.5).max(2).optional(),
    model: Joi.string().optional(),
  }).optional(),
  is_active: Joi.boolean().optional(),
}).min(1);

const createAgentSchema = Joi.object({
  name: Joi.string().min(2).max(255).required(),
  type: Joi.string().valid('service', 'order', 'payment').required(),
  prompt: Joi.string().min(10).max(5000).required(),
  voice_config: Joi.object({
    voice: Joi.string().valid('alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer').optional().default('alloy'),
    temperature: Joi.number().min(0).max(2).optional().default(0.8),
    variant: Joi.array().items(Joi.string()).optional().default(['natural']),
    speed: Joi.number().min(0.5).max(2).optional().default(1.0),
    pitch: Joi.number().min(0.5).max(2).optional().default(1.0),
    model: Joi.string().optional().default('gpt-realtime'),
  }).optional().default({}),
  is_active: Joi.boolean().optional().default(true),
});

router.get('/:id', authenticate, requireBusinessAccess, asyncHandler(async (req: AuthRequest, res: Response) => {
  const businessId = req.params['id'];

  const { data: business, error } = await supabaseAdmin
    .from('businesses')
    .select(`
      *,
      phone_mappings (*),
      agents (*),
      orders (
        id,
        customer_phone,
        total,
        status,
        payment_status,
        created_at
      ),
      payments (
        id,
        amount,
        status,
        created_at
      ),
      call_logs (
        id,
        call_sid,
        from_number,
        duration,
        status,
        created_at
      )
    `)
    .eq('id', businessId)
    .single();

  if (error || !business) {
    throw new NotFoundError('Business');
  }

  logDatabase('SELECT', 'businesses', { businessId });

  res.json({
    success: true,
    business,
  });
}));

router.put('/:id/data', authenticate, requireBusinessAccess, asyncHandler(async (req: AuthRequest, res: Response) => {
  const businessId = req.params['id'];

  if (!req.user || req.user.businessId !== businessId) {
    throw new AuthorizationError('You can only update your own business data');
  }

  const { error: validationError, value } = businessDataSchema.validate(req.body);

  if (validationError) {
    throw new ValidationError(validationError.details[0]?.message || 'Validation error', validationError.details);
  }

  const { data: existingBusiness, error: fetchError } = await supabaseAdmin
    .from('businesses')
    .select('data_json')
    .eq('id', businessId)
    .single();

  if (fetchError || !existingBusiness) {
    throw new NotFoundError('Business');
  }

  const mergedData = {
    ...existingBusiness.data_json,
    ...value,
  };

  const { data: updatedBusiness, error: updateError } = await supabaseAdmin
    .from('businesses')
    .update({ data_json: mergedData })
    .eq('id', businessId)
    .select()
    .single();

  if (updateError) {
    logger.error('Failed to update business data', { error: updateError, businessId });
    throw new CustomError('Failed to update business data', 500, 'DATA_UPDATE_ERROR');
  }

  logDatabase('UPDATE', 'businesses', { businessId, dataKeys: Object.keys(value) });
  logger.info('Business data updated', { businessId, userId: req.user.userId });

  res.json({
    success: true,
    business: updatedBusiness,
  });
}));

router.post('/:id/phone', authenticate, requireBusinessAccess, asyncHandler(async (req: AuthRequest, res: Response) => {
  const businessId = req.params['id'];

  if (!req.user || req.user.businessId !== businessId) {
    throw new AuthorizationError('You can only add phone numbers to your own business');
  }

  const { error: validationError, value } = phoneSchema.validate(req.body);

  if (validationError) {
    throw new ValidationError(validationError.details[0]?.message || 'Validation error', validationError.details);
  }

  const { twilio_number, agent_id } = value;

  const { data: existingMapping } = await supabaseAdmin
    .from('phone_mappings')
    .select('id')
    .eq('twilio_number', twilio_number)
    .single();

  if (existingMapping) {
    throw new ConflictError('This phone number is already mapped');
  }

  const { data: agent, error: agentError } = await supabaseAdmin
    .from('agents')
    .select('id')
    .eq('id', agent_id)
    .eq('business_id', businessId)
    .single();

  if (agentError || !agent) {
    throw new NotFoundError('Agent');
  }

  const { data: phoneMapping, error: insertError } = await supabaseAdmin
    .from('phone_mappings')
    .insert({
      id: uuidv4(),
      business_id: businessId,
      twilio_number,
      agent_id,
      is_active: true,
    })
    .select()
    .single();

  if (insertError) {
    logger.error('Failed to create phone mapping', { error: insertError, businessId });
    throw new CustomError('Failed to create phone mapping', 500, 'PHONE_MAPPING_ERROR');
  }

  const webhookUrl = `${process.env['BACKEND_URL'] || 'https://verbio-backend.run.app'}/api/twilio/webhook`;

  logDatabase('INSERT', 'phone_mappings', { businessId, twilio_number, agent_id });
  logger.info('Phone mapping created', { businessId, twilio_number, webhookUrl });

  res.status(201).json({
    success: true,
    phone_mapping: phoneMapping,
    webhookUrl,
    instructions: 'Configure this webhook URL in your Twilio phone number settings',
  });
}));

router.delete('/:id/phone/:phoneId', authenticate, requireBusinessAccess, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: businessId, phoneId } = req.params as any;

  if (!req.user || req.user.businessId !== businessId) {
    throw new AuthorizationError('You can only remove phone numbers from your own business');
  }

  const { error: deleteError } = await supabaseAdmin
    .from('phone_mappings')
    .delete()
    .eq('id', phoneId)
    .eq('business_id', businessId);

  if (deleteError) {
    logger.error('Failed to delete phone mapping', { error: deleteError, phoneId });
    throw new CustomError('Failed to delete phone mapping', 500, 'PHONE_DELETE_ERROR');
  }

  logDatabase('DELETE', 'phone_mappings', { businessId, phoneId });
  logger.info('Phone mapping deleted', { businessId, phoneId });

  res.json({
    success: true,
    message: 'Phone mapping deleted successfully',
  });
}));

router.post('/:id/agent', authenticate, requireBusinessAccess, asyncHandler(async (req: AuthRequest, res: Response) => {
  const businessId = req.params['id'];

  if (!req.user || req.user.businessId !== businessId) {
    throw new AuthorizationError('You can only create agents for your own business');
  }

  const { error: validationError, value } = createAgentSchema.validate(req.body);

  if (validationError) {
    throw new ValidationError(validationError.details[0]?.message || 'Validation error', validationError.details);
  }

  const { data: agent, error: insertError } = await supabaseAdmin
    .from('agents')
    .insert({
      id: uuidv4(),
      business_id: businessId,
      ...value,
    })
    .select()
    .single();

  if (insertError) {
    logger.error('Failed to create agent', { error: insertError, businessId });
    throw new CustomError('Failed to create agent', 500, 'AGENT_CREATE_ERROR');
  }

  logDatabase('INSERT', 'agents', { businessId, agentId: agent.id, type: value.type });
  logger.info('Agent created', { businessId, agentId: agent.id, type: value.type });

  res.status(201).json({
    success: true,
    agent,
  });
}));

router.put('/:id/agent/:agentId', authenticate, requireBusinessAccess, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: businessId, agentId } = req.params;

  if (!req.user || req.user.businessId !== businessId) {
    throw new AuthorizationError('You can only update agents for your own business');
  }

  const { error: validationError, value } = agentSchema.validate(req.body);

  if (validationError) {
    throw new ValidationError(validationError.details[0]?.message || 'Validation error', validationError.details);
  }

  const { data: existingAgent, error: fetchError } = await supabaseAdmin
    .from('agents')
    .select('*')
    .eq('id', agentId)
    .eq('business_id', businessId)
    .single();

  if (fetchError || !existingAgent) {
    throw new NotFoundError('Agent');
  }

  const updateData: any = {};

  if (value.name !== undefined) updateData.name = value.name;
  if (value.type !== undefined) updateData.type = value.type;
  if (value.prompt !== undefined) updateData.prompt = value.prompt;
  if (value.is_active !== undefined) updateData.is_active = value.is_active;

  if (value.voice_config !== undefined) {
    updateData.voice_config = {
      ...existingAgent.voice_config,
      ...value.voice_config,
    };
  }

  const { data: updatedAgent, error: updateError } = await supabaseAdmin
    .from('agents')
    .update(updateData)
    .eq('id', agentId)
    .eq('business_id', businessId)
    .select()
    .single();

  if (updateError) {
    logger.error('Failed to update agent', { error: updateError, agentId });
    throw new CustomError('Failed to update agent', 500, 'AGENT_UPDATE_ERROR');
  }

  logDatabase('UPDATE', 'agents', { businessId, agentId, fields: Object.keys(updateData) });
  logger.info('Agent updated', { businessId, agentId });

  res.json({
    success: true,
    agent: updatedAgent,
  });
}));

router.delete('/:id/agent/:agentId', authenticate, requireBusinessAccess, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: businessId, agentId } = req.params;

  if (!req.user || req.user.businessId !== businessId) {
    throw new AuthorizationError('You can only delete agents from your own business');
  }

  const { data: phoneMappings } = await supabaseAdmin
    .from('phone_mappings')
    .select('id')
    .eq('agent_id', agentId);

  if (phoneMappings && phoneMappings.length > 0) {
    throw new ConflictError('Cannot delete agent with active phone mappings. Remove phone mappings first.');
  }

  const { error: deleteError } = await supabaseAdmin
    .from('agents')
    .delete()
    .eq('id', agentId)
    .eq('business_id', businessId);

  if (deleteError) {
    logger.error('Failed to delete agent', { error: deleteError, agentId });
    throw new CustomError('Failed to delete agent', 500, 'AGENT_DELETE_ERROR');
  }

  logDatabase('DELETE', 'agents', { businessId, agentId });
  logger.info('Agent deleted', { businessId, agentId });

  res.json({
    success: true,
    message: 'Agent deleted successfully',
  });
}));

router.get('/:id/agents', authenticate, requireBusinessAccess, asyncHandler(async (req: AuthRequest, res: Response) => {
  const businessId = req.params['id'];

  const { data: agents, error } = await supabaseAdmin
    .from('agents')
    .select(`
      *,
      phone_mappings (
        id,
        twilio_number,
        is_active
      )
    `)
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('Failed to fetch agents', { error, businessId });
    throw new CustomError('Failed to fetch agents', 500, 'AGENTS_FETCH_ERROR');
  }

  res.json({
    success: true,
    agents: agents || [],
  });
}));

router.get('/:id/phones', authenticate, requireBusinessAccess, asyncHandler(async (req: AuthRequest, res: Response) => {
  const businessId = req.params['id'];

  const { data: phoneMappings, error } = await supabaseAdmin
    .from('phone_mappings')
    .select(`
      *,
      agents (
        id,
        name,
        type,
        is_active
      )
    `)
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('Failed to fetch phone mappings', { error, businessId });
    throw new CustomError('Failed to fetch phone mappings', 500, 'PHONES_FETCH_ERROR');
  }

  res.json({
    success: true,
    phone_mappings: phoneMappings || [],
  });
}));

router.put('/:id', authenticate, requireBusinessAccess, asyncHandler(async (req: AuthRequest, res: Response) => {
  const businessId = req.params['id'];

  if (!req.user || req.user.businessId !== businessId) {
    throw new AuthorizationError('You can only update your own business');
  }

  const updateSchema = Joi.object({
    name: Joi.string().min(2).max(255).optional(),
  });

  const { error: validationError, value } = updateSchema.validate(req.body);

  if (validationError) {
    throw new ValidationError(validationError.details[0]?.message || 'Validation error', validationError.details);
  }

  const { data: updatedBusiness, error: updateError } = await supabaseAdmin
    .from('businesses')
    .update(value)
    .eq('id', businessId)
    .select()
    .single();

  if (updateError) {
    logger.error('Failed to update business', { error: updateError, businessId });
    throw new CustomError('Failed to update business', 500, 'BUSINESS_UPDATE_ERROR');
  }

  logDatabase('UPDATE', 'businesses', { businessId, fields: Object.keys(value) });
  logger.info('Business updated', { businessId });

  res.json({
    success: true,
    business: updatedBusiness,
  });
}));

export default router;