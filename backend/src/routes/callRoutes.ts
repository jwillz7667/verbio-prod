import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { voiceAgentHandler } from '../socket/voiceAgentHandler';
import { authenticateToken } from '../middleware/auth';
import logger from '../utils/logger';

const router = Router();

// Initiate outbound call
router.post('/initiate', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { phoneNumber, settings, businessId } = req.body;

    if (!phoneNumber || !businessId) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and business ID are required'
      });
    }

    // Validate phone number format
    const phoneRegex = /^\+1\d{10}$/;
    if (!phoneRegex.test(phoneNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format. Must be +1XXXXXXXXXX'
      });
    }

    const callId = uuidv4();

    // Initiate the call
    const result = await voiceAgentHandler.initiateOutboundCall(
      phoneNumber,
      callId,
      businessId,
      settings || {}
    );

    res.json({
      success: true,
      callId,
      callSid: result.callSid
    });

  } catch (error: any) {
    logger.error('Error initiating call:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to initiate call'
    });
  }
});

// Twilio TwiML endpoint for voice agent
router.post('/twilio/voice-agent-twiml', async (req: Request, res: Response) => {
  try {
    const { callId } = req.query;

    if (!callId) {
      return res.status(400).send('Missing call ID');
    }

    const twiml = voiceAgentHandler.getTwilioResponseForCall(callId as string);
    res.type('text/xml');
    res.send(twiml);

  } catch (error) {
    logger.error('Error generating TwiML:', error);
    res.status(500).send('Error generating TwiML');
  }
});

// Twilio status callback
router.post('/twilio/voice-agent-status', async (req: Request, res: Response) => {
  try {
    const { CallSid, CallStatus, CallDuration } = req.body;
    const { callId } = req.query;

    logger.info(`Call status update: ${CallSid} - ${CallStatus} (duration: ${CallDuration}s)`);

    // Handle call status updates
    if (CallStatus === 'completed' || CallStatus === 'failed' || CallStatus === 'busy' || CallStatus === 'no-answer') {
      // Notify the WebSocket connection
      // The voiceAgentHandler will handle cleanup
    }

    res.sendStatus(200);

  } catch (error) {
    logger.error('Error handling call status:', error);
    res.sendStatus(500);
  }
});

// Get call history
router.get('/history', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { business_id } = (req as any).user;

    // This would fetch from database
    // For now, return placeholder
    res.json({
      success: true,
      calls: []
    });

  } catch (error) {
    logger.error('Error fetching call history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch call history'
    });
  }
});

export default router;