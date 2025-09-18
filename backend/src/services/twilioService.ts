import twilio from 'twilio';
import { Request, Response } from 'express';
import { config } from '../config/env';
import { VoiceResponse } from '../types/twilio';
import { supabaseAdmin } from '../config/supabase';
import { logger } from '../utils/logger';
import { CustomError } from '../utils/errorHandler';
import type {
  TwilioWebhookRequest,
  TwilioStatusCallbackRequest
} from '../types/twilio';

const accountSid = config.get('TWILIO_ACCOUNT_SID');
const authToken = config.get('TWILIO_AUTH_TOKEN');

if (!accountSid || !authToken) {
  logger.warn('Twilio credentials not configured');
}

const twilioClient = accountSid && authToken ? twilio(accountSid, authToken) : null;

export const generateTwiML = async (
  from: string,
  businessId: string,
  agentType: 'service' | 'order' | 'payment'
): Promise<string> => {
  const twiml = new VoiceResponse();

  const backendUrl = config.get('BACKEND_URL') || 'https://api.verbio.app';

  const sayOptions = {
    voice: 'Polly.Joanna' as any,
    language: 'en-US'
  };

  (twiml as any).say(sayOptions, 'Welcome to our business. Connecting you to an agent now.');

  const connect = (twiml as any).connect();
  const stream = connect.stream({
    url: `${backendUrl}/realtime`,
    track: 'both_tracks'
  });

  stream.parameter({ name: 'businessId', value: businessId });
  stream.parameter({ name: 'agentType', value: agentType });
  stream.parameter({ name: 'from', value: from });

  return twiml.toString();
};

export const handleWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const webhookData = req.body as TwilioWebhookRequest;
    const { CallSid, From, To, CallStatus, Direction } = webhookData;

    logger.info('Twilio webhook received', {
      callSid: CallSid,
      from: From,
      to: To,
      status: CallStatus,
      direction: Direction
    });

    const twilioSignature = req.headers['x-twilio-signature'] as string;
    const url = `${process.env['BACKEND_URL'] || 'https://api.verbio.app'}/api/twilio/webhook`;

    if (process.env['NODE_ENV'] === 'production' && twilioClient) {
      const isValid = twilio.validateRequest(
        authToken!,
        twilioSignature,
        url,
        req.body
      );

      if (!isValid) {
        logger.warn('Invalid Twilio signature', { signature: twilioSignature });
        res.status(403).send('Forbidden');
        return;
      }
    }

    const { data: phoneMapping, error: mappingError } = await supabaseAdmin
      .from('phone_mappings')
      .select(`
        id,
        business_id,
        agent_id,
        twilio_number,
        agents (
          id,
          name,
          type,
          prompt,
          voice_config
        )
      `)
      .eq('twilio_number', To)
      .eq('is_active', true)
      .single();

    if (mappingError || !phoneMapping) {
      logger.warn('Phone number not mapped', { to: To });

      const twiml = new VoiceResponse();
      (twiml as any).say({ voice: 'Polly.Joanna' as any }, 'This number is not currently in service. Please check the number and try again.');
      (twiml as any).hangup();

      res.type('text/xml');
      res.send(twiml.toString());
      return;
    }

    const { error: logError } = await supabaseAdmin
      .from('call_logs')
      .insert({
        business_id: phoneMapping.business_id,
        call_sid: CallSid,
        from_number: From,
        to_number: To,
        direction: Direction || 'inbound',
        status: CallStatus,
        agent_id: phoneMapping.agent_id
      });

    if (logError) {
      logger.error('Failed to create call log', { error: logError });
    }

    const agentType = (phoneMapping.agents as any)?.type || 'service';
    const twimlResponse = await generateTwiML(From, phoneMapping.business_id, agentType);

    logger.info('TwiML response generated', {
      callSid: CallSid,
      businessId: phoneMapping.business_id,
      agentType
    });

    res.type('text/xml');
    res.send(twimlResponse);
  } catch (error) {
    logger.error('Error handling Twilio webhook', { error });

    const twiml = new VoiceResponse();
    (twiml as any).say({ voice: 'Polly.Joanna' as any }, 'We are experiencing technical difficulties. Please try again later.');
    (twiml as any).hangup();

    res.type('text/xml');
    res.send(twiml.toString());
  }
};

export const handleStatusCallback = async (req: Request, res: Response): Promise<void> => {
  try {
    const statusData = req.body as TwilioStatusCallbackRequest;
    const { CallSid, CallStatus, Duration } = statusData;

    logger.info('Twilio status callback received', {
      callSid: CallSid,
      status: CallStatus,
      duration: Duration
    });

    const twilioSignature = req.headers['x-twilio-signature'] as string;
    const url = `${process.env['BACKEND_URL'] || 'https://api.verbio.app'}/api/twilio/status`;

    if (process.env['NODE_ENV'] === 'production' && twilioClient) {
      const isValid = twilio.validateRequest(
        authToken!,
        twilioSignature,
        url,
        req.body
      );

      if (!isValid) {
        logger.warn('Invalid Twilio signature for status callback', { signature: twilioSignature });
        res.status(403).send('Forbidden');
        return;
      }
    }

    const updateData: any = {
      status: CallStatus,
      updated_at: new Date().toISOString()
    };

    if (Duration) {
      updateData.duration = parseInt(Duration);
    }

    const { error: updateError } = await supabaseAdmin
      .from('call_logs')
      .update(updateData)
      .eq('call_sid', CallSid);

    if (updateError) {
      logger.error('Failed to update call log', { error: updateError, callSid: CallSid });
      throw new CustomError('Failed to update call log', 500, 'CALL_LOG_UPDATE_ERROR');
    }

    logger.info('Call log updated', { callSid: CallSid, status: CallStatus });

    res.status(200).send('OK');
  } catch (error) {
    logger.error('Error handling Twilio status callback', { error });
    res.status(500).send('Internal Server Error');
  }
};

export const validateTwilioWebhook = (
  signature: string,
  url: string,
  params: any
): boolean => {
  if (!authToken) {
    logger.warn('Cannot validate webhook - auth token not configured');
    return false;
  }

  return twilio.validateRequest(authToken, signature, url, params);
};

export const getTwilioClient = () => {
  if (!twilioClient) {
    throw new CustomError('Twilio client not initialized', 500, 'TWILIO_NOT_CONFIGURED');
  }
  return twilioClient;
};