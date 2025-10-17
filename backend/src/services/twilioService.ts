import twilio from 'twilio';
import { Request, Response } from 'express';
import { config } from '../config/env';
import { supabaseAdmin } from '../config/supabase';
import { logger } from '../utils/logger';
import { CustomError } from '../utils/errorHandler';
import type { TwilioWebhookRequest, TwilioStatusCallbackRequest } from '../types/twilio';

const { VoiceResponse } = twilio.twiml;

const accountSid = config.get('TWILIO_ACCOUNT_SID');
const authToken = config.get('TWILIO_AUTH_TOKEN');

if (!accountSid || !authToken) {
  logger.warn('Twilio credentials not configured');
}

const twilioClient = accountSid && authToken ? twilio(accountSid, authToken) : null;

// Simplified - we don't need this complex function anymore
// TwiML is generated directly in the webhook handlers

export const handleWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const webhookData = req.body as TwilioWebhookRequest;
    const { CallSid, From, To, CallStatus, Direction } = webhookData;

    logger.info('Twilio webhook received', {
      callSid: CallSid,
      from: From,
      to: To,
      status: CallStatus,
      direction: Direction,
    });

    const twilioSignature = req.headers['x-twilio-signature'] as string;
    const url = `${process.env.BACKEND_URL || 'https://api.verbio.app'}/api/twilio/webhook`;

    // Temporarily skip signature validation for testing
    if (process.env.NODE_ENV === 'production' && twilioClient) {
      const isValid = twilio.validateRequest(authToken, twilioSignature, url, req.body);

      if (!isValid) {
        logger.warn('Invalid Twilio signature', { signature: twilioSignature });
        res.status(403).send('Forbidden');
        return;
      }
    }

    // SIMPLIFIED - No phone mappings, no business IDs needed
    // Just connect the call directly to the AI assistant
    const twiml = new VoiceResponse();
    const backendUrl = config.get('BACKEND_URL') || 'https://verbio-backend-995705962018.us-central1.run.app';

    // Direct connection without any announcement
    const connect = (twiml as any).connect();
    const stream = connect.stream({
      url: `${backendUrl}/realtime`,
      track: 'both_tracks',
    });

    // For outbound calls, use 'To' as the customer number
    // For inbound calls, use 'From' as the customer number
    const customerNumber = Direction === 'outbound-api' ? To : From;
    stream.parameter({ name: 'from', value: customerNumber });
    stream.parameter({ name: 'callSid', value: CallSid });

    // Add agentType for outbound calls
    if (Direction === 'outbound-api') {
      stream.parameter({ name: 'agentType', value: 'service' });
    }

    logger.info('TwiML response generated', {
      callSid: CallSid,
      from: From,
      to: To,
      direction: Direction,
      customerNumber,
    });

    res.type('text/xml');
    res.send(twiml.toString());
  } catch (error) {
    logger.error('Error handling Twilio webhook', { error });

    const twiml = new VoiceResponse();
    (twiml as any).say(
      { voice: 'Polly.Joanna' as any },
      'We are experiencing technical difficulties. Please try again later.'
    );
    (twiml as any).hangup();

    res.type('text/xml');
    res.send(twiml.toString());
  }
};

// Outbound webhook handler removed - consolidated with main handleWebhook

export const handleStatusCallback = async (req: Request, res: Response): Promise<void> => {
  try {
    const statusData = req.body as TwilioStatusCallbackRequest;
    const { CallSid, CallStatus, Duration } = statusData;

    logger.info('Twilio status callback received', {
      callSid: CallSid,
      status: CallStatus,
      duration: Duration,
    });

    const twilioSignature = req.headers['x-twilio-signature'] as string;
    const url = `${process.env.BACKEND_URL || 'https://api.verbio.app'}/api/twilio/status`;

    if (process.env.NODE_ENV === 'production' && twilioClient) {
      const isValid = twilio.validateRequest(authToken, twilioSignature, url, req.body);

      if (!isValid) {
        logger.warn('Invalid Twilio signature for status callback', { signature: twilioSignature });
        res.status(403).send('Forbidden');
        return;
      }
    }

    const updateData: any = {
      status: CallStatus,
      updated_at: new Date().toISOString(),
    };

    if (Duration) {
      updateData.duration = parseInt(Duration);
    }

    const { error: updateError } = await supabaseAdmin.from('call_logs').update(updateData).eq('call_sid', CallSid);

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

export const validateTwilioWebhook = (signature: string, url: string, params: any): boolean => {
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
