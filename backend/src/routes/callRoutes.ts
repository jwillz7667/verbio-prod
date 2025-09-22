import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import twilio from 'twilio';
import { voiceAgentHandler } from '../socket/voiceAgentHandler';
import { authenticate } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import logger from '../utils/logger';

const router = Router();

interface SessionConfig {
  model: string;
  voice: string;
  instructions: string;
  inputAudioTranscription: {
    enabled: boolean;
    model: string;
  };
  turnDetection: {
    type: 'server_vad' | 'none';
    serverVad?: {
      threshold: number;
      prefixPaddingMs: number;
      silenceDurationMs: number;
    };
  };
  tools?: Array<{
    name: string;
    description: string;
    parameters: Record<string, any>;
  }>;
  temperature: number;
  maxResponseOutputTokens: number | 'inf';
  vadMode: 'server_vad' | 'disabled';
  modalities: string[];
  audioFormat: 'pcm16' | 'g711_ulaw' | 'g711_alaw';
}

const twilioClient = process.env['TWILIO_ACCOUNT_SID'] && process.env['TWILIO_AUTH_TOKEN']
  ? twilio(process.env['TWILIO_ACCOUNT_SID'], process.env['TWILIO_AUTH_TOKEN'])
  : null;

// Initiate outbound call with full OpenAI Realtime configuration
// Get call recordings
router.get('/recordings', authenticate, async (req: Request, res: Response): Promise<Response> => {
  try {
    const businessId = (req as any).user?.businessId;
    if (!businessId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!twilioClient) {
      return res.status(500).json({ success: false, message: 'Twilio not configured' });
    }

    // Fetch recordings from Twilio with business filtering
    // First get calls for this business from database
    const { data: callLogs } = await supabaseAdmin
      .from('call_logs')
      .select('call_sid')
      .eq('business_id', businessId)
      .not('call_sid', 'like', 'pending-%')
      .order('created_at', { ascending: false })
      .limit(50);

    if (!callLogs || callLogs.length === 0) {
      return res.json({ success: true, data: [] });
    }

    // Fetch recordings for these calls
    const recordings = await twilioClient.recordings.list({ limit: 100 });

    // Filter recordings to only those belonging to this business
    const callSids = callLogs.map((log) => log.call_sid);
    const businessRecordings = recordings.filter((rec) =>
      callSids.includes(rec.callSid),
    );

    // Map and format the recordings with proper phone number lookup
    const formattedRecordings = await Promise.all(
      businessRecordings.map(async (recording) => {
        // Get the call details to extract phone number
        let phoneNumber = 'Unknown';
        try {
          const call = await twilioClient.calls(recording.callSid).fetch();
          phoneNumber = call.direction === 'outbound-api' ? call.to : call.from;
        } catch (err) {
          logger.warn(`Could not fetch call details for ${recording.callSid}`);
        }

        return {
          id: recording.sid,
          callSid: recording.callSid,
          recordingSid: recording.sid,
          duration: recording.duration ? parseInt(recording.duration, 10) : 0,
          url: `https://api.twilio.com${recording.uri.replace('.json', '.mp3')}`,
          status: recording.status as 'processing' | 'completed' | 'failed',
          createdAt: recording.dateCreated,
          phoneNumber,
        };
      }),
    );

    return res.json({ success: true, data: formattedRecordings });
  } catch (error) {
    logger.error('Failed to fetch recordings:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch recordings' });
  }
});

// Get specific call recording
router.get('/:callSid/recording', authenticate, async (req: Request, res: Response): Promise<Response> => {
  try {
    const { callSid } = req.params;
    const businessId = (req as any).user?.businessId;
    if (!businessId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!twilioClient) {
      return res.status(500).json({ success: false, message: 'Twilio not configured' });
    }

    // Verify this call belongs to the business
    const { data: callLog } = await supabaseAdmin
      .from('call_logs')
      .select('call_sid')
      .eq('business_id', businessId)
      .eq('call_sid', callSid)
      .single();

    if (!callLog) {
      return res.status(403).json({ success: false, message: 'Call not found or unauthorized' });
    }

    // Fetch all recordings and filter by callSid
    const allRecordings = await twilioClient.recordings.list({ limit: 1000 });
    const recordings = allRecordings.filter((rec) => rec.callSid === callSid);

    if (recordings.length === 0) {
      return res.json({ success: true, data: null });
    }

    const recording = recordings[0];

    // Get phone number from call details
    let phoneNumber = 'Unknown';
    try {
      const call = await twilioClient.calls(recording!.callSid).fetch();
      phoneNumber = call.direction === 'outbound-api' ? call.to : call.from;
    } catch (err) {
      logger.warn(`Could not fetch call details for ${recording!.callSid}`);
    }

    const formattedRecording = {
      id: recording!.sid,
      callSid: recording!.callSid,
      recordingSid: recording!.sid,
      duration: recording!.duration ? parseInt(recording!.duration, 10) : 0,
      url: `https://api.twilio.com${recording!.uri.replace('.json', '.mp3')}`,
      status: recording!.status as 'processing' | 'completed' | 'failed',
      createdAt: recording!.dateCreated,
      phoneNumber,
    };

    return res.json({ success: true, data: formattedRecording });
  } catch (error) {
    logger.error('Failed to fetch recording:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch recording' });
  }
});

// Recording status webhook
router.post('/recording-status', async (req: Request, res: Response): Promise<Response> => {
  try {
    const { RecordingSid, RecordingStatus, CallSid, RecordingDuration } = req.body;

    logger.info('Recording status update:', {
      recordingSid: RecordingSid,
      status: RecordingStatus,
      callSid: CallSid,
      duration: RecordingDuration,
    });

    // You can store this in a database if needed
    // For now, just log and acknowledge

    return res.status(200).send('OK');
  } catch (error) {
    logger.error('Failed to process recording status:', error);
    return res.status(500).send('Error');
  }
});

// Delete recording
router.delete('/recordings/:recordingSid', authenticate, async (req: Request, res: Response): Promise<Response> => {
  try {
    const { recordingSid } = req.params;
    const businessId = (req as any).user?.businessId;

    if (!businessId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!recordingSid) {
      return res.status(400).json({ success: false, message: 'Recording SID is required' });
    }

    if (!twilioClient) {
      return res.status(500).json({ success: false, message: 'Twilio not configured' });
    }

    // Verify the recording belongs to a call from this business
    try {
      const recording = await twilioClient.recordings(recordingSid).fetch();

      const { data: callLog } = await supabaseAdmin
        .from('call_logs')
        .select('call_sid')
        .eq('business_id', businessId)
        .eq('call_sid', recording.callSid)
        .single();

      if (!callLog) {
        return res.status(403).json({ success: false, message: 'Recording not found or unauthorized' });
      }
    } catch (err) {
      return res.status(404).json({ success: false, message: 'Recording not found' });
    }

    await twilioClient.recordings(recordingSid).remove();

    return res.json({ success: true, message: 'Recording deleted' });
  } catch (error) {
    logger.error('Failed to delete recording:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete recording' });
  }
});

router.post('/outbound', authenticate, async (req: Request, res: Response): Promise<Response> => {
  try {
    const { phoneNumber, config, businessId, recording } = req.body;
    const userId = (req as any).user?.userId;

    if (!phoneNumber || !businessId) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and business ID are required',
      });
    }

    if (!twilioClient) {
      return res.status(500).json({
        success: false,
        message: 'Twilio not configured',
      });
    }

    // Verify user has access to this business
    const { data: business, error: businessError } = await supabaseAdmin
      .from('businesses')
      .select('id')
      .eq('id', businessId)
      .eq('user_id', userId)
      .single();

    if (businessError || !business) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to initiate calls for this business',
      });
    }

    // Get agent configuration if exists
    const { data: agent } = await supabaseAdmin
      .from('agents')
      .select('*')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .single();

    // Merge configurations
    const mergedConfig: SessionConfig = {
      ...config,
      instructions: config.instructions || agent?.prompt || 'You are a helpful AI assistant.',
      voice: config.voice || agent?.voice_config?.voice || 'alloy',
    };

    const callId = uuidv4();

    // Create call log
    const { error: logError } = await supabaseAdmin
      .from('call_logs')
      .insert({
        call_sid: `pending-${callId}`,
        business_id: businessId,
        agent_id: agent?.id || null,
        from_number: process.env['TWILIO_PHONE_NUMBER'] || 'system',
        to_number: phoneNumber,
        status: 'initiated',
      })
      .select()
      .single();

    if (logError) {
      logger.error('Failed to create call log:', logError);
      throw logError;
    }

    // Create Twilio call with WebSocket stream
    const baseUrl = process.env['BASE_URL'] || `https://${req.get('host')}`;
    const wsUrl = baseUrl.replace('https://', 'wss://').replace('http://', 'ws://');

    const callCreateOptions: any = {
      to: phoneNumber,
      from: process.env['TWILIO_PHONE_NUMBER']!,
      record: recording === true,
      twiml: `<Response>
        <Connect>
          <Stream url="${wsUrl}/ws/twilio-stream">
            <Parameter name="businessId" value="${businessId}" />
            <Parameter name="callId" value="${callId}" />
            <Parameter name="config" value="${Buffer.from(JSON.stringify(mergedConfig)).toString('base64')}" />
          </Stream>
        </Connect>
      </Response>`,
      statusCallback: `${baseUrl}/api/calls/twilio/status?callId=${callId}`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      machineDetection: 'DetectMessageEnd',
      asyncAmd: 'true',
    };

    if (recording === true) {
      callCreateOptions.recordingChannels = 'dual';
      callCreateOptions.recordingStatusCallback = `${baseUrl}/api/calls/recording-status`;
    }

    const call = await twilioClient.calls.create(callCreateOptions);

    // Update call log with Twilio SID
    await supabaseAdmin
      .from('call_logs')
      .update({ call_sid: call.sid })
      .eq('call_sid', `pending-${callId}`);

    logger.info(`Outbound call initiated: ${call.sid} to ${phoneNumber}`);

    return res.json({
      success: true,
      callId,
      callSid: call.sid,
      status: call.status,
    });
  } catch (error: any) {
    logger.error('Error initiating outbound call:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to initiate call',
    });
  }
});

// Legacy initiate endpoint (backward compatibility)
router.post('/initiate', authenticate, async (req: Request, res: Response): Promise<Response> => {
  try {
    const { phoneNumber, settings, businessId } = req.body;
    const userId = (req as any).user?.userId;

    if (!phoneNumber || !businessId) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and business ID are required',
      });
    }

    // Verify user has access to this business
    const { data: business, error: businessError } = await supabaseAdmin
      .from('businesses')
      .select('id')
      .eq('id', businessId)
      .eq('user_id', userId)
      .single();

    if (businessError || !business) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to initiate calls for this business',
      });
    }

    // Validate phone number format
    const phoneRegex = /^\+1\d{10}$/;
    if (!phoneRegex.test(phoneNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format. Must be +1XXXXXXXXXX',
      });
    }

    const callId = uuidv4();

    // Log call initiation to database
    const { error: logError } = await supabaseAdmin
      .from('call_logs')
      .insert({
        call_sid: `pending-${callId}`,
        business_id: businessId,
        agent_id: null,
        from_number: 'system',
        to_number: phoneNumber,
        status: 'initiated',
      });

    if (logError) {
      logger.error('Failed to log call initiation:', logError);
    }

    // Initiate the call
    const result = await voiceAgentHandler.initiateOutboundCall(
      phoneNumber,
      callId,
      businessId,
      settings || {},
    );

    // Update call log with actual call SID
    await supabaseAdmin
      .from('call_logs')
      .update({ call_sid: result.callSid })
      .eq('call_sid', `pending-${callId}`);

    return res.json({
      success: true,
      callId,
      callSid: result.callSid,
    });
  } catch (error: any) {
    logger.error('Error initiating call:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to initiate call',
    });
  }
});

// Twilio TwiML endpoint for voice agent
router.post('/twilio/voice-agent-twiml', async (req: Request, res: Response): Promise<Response> => {
  try {
    const { callId } = req.query;

    if (!callId) {
      return res.status(400).send('Missing call ID');
    }

    const twiml = voiceAgentHandler.getTwilioResponseForCall(callId as string);
    res.type('text/xml');
    return res.send(twiml);
  } catch (error) {
    logger.error('Error generating TwiML:', error);
    return res.status(500).send('Error generating TwiML');
  }
});

// Twilio status callback for outbound calls
router.post('/twilio/status', async (req: Request, res: Response) => {
  try {
    const { CallSid, CallStatus, CallDuration, RecordingUrl } = req.body;
    const callId = req.query['callId'] as string;

    logger.info(`Call status update: ${CallSid} - ${CallStatus} (duration: ${CallDuration}s)`);

    // Update call status in database
    const updateData: any = {
      status: CallStatus,
      updated_at: new Date().toISOString(),
    };

    if (CallDuration) {
      updateData.duration = parseInt(CallDuration, 10);
    }

    if (RecordingUrl) {
      updateData.recording_url = RecordingUrl;
    }

    // First try to update by callId pattern
    const { error: updateError } = await supabaseAdmin
      .from('call_logs')
      .update(updateData)
      .or(`call_sid.eq.${CallSid},call_sid.eq.pending-${callId}`);

    if (updateError) {
      logger.error('Error updating call status:', updateError);
    }

    // Handle call completion
    if (CallStatus === 'completed' || CallStatus === 'failed' || CallStatus === 'no-answer' || CallStatus === 'busy') {
      updateData.ended_at = new Date().toISOString();

      // Notify any active WebSocket connections
      if (callId) {
        logger.info('Call completed', { callId, status: CallStatus });
      }
    }

    res.sendStatus(200);
  } catch (error) {
    logger.error('Error handling call status:', error);
    res.sendStatus(500);
  }
});

// Legacy Twilio status callback for voice agent
router.post('/twilio/voice-agent-status', async (req: Request, res: Response) => {
  try {
    const { CallSid, CallStatus, CallDuration, RecordingUrl } = req.body;
    const callId = req.query['callId'] as string;

    logger.info(`Call status update: ${CallSid} - ${CallStatus} (duration: ${CallDuration}s)`);

    // Update call status in database
    const updateData: any = {
      status: CallStatus,
      updated_at: new Date().toISOString(),
    };

    if (CallDuration) {
      updateData.duration = parseInt(CallDuration);
    }

    if (RecordingUrl) {
      updateData.recording_url = RecordingUrl;
    }

    const { error } = await supabaseAdmin
      .from('call_logs')
      .update(updateData)
      .eq('call_sid', CallSid);

    if (error) {
      logger.error('Failed to update call status:', error);
    }

    // Handle call completion
    if (CallStatus === 'completed' || CallStatus === 'failed' || CallStatus === 'busy' || CallStatus === 'no-answer') {
      // Notify the WebSocket connection if it exists
      if (callId) {
        // voiceAgentHandler.handleCallCompletion(callId, CallStatus);
        logger.info('Call completed', { callId, status: CallStatus });
      }
    }

    res.sendStatus(200);
  } catch (error) {
    logger.error('Error handling call status:', error);
    res.sendStatus(500);
  }
});

// Get call history
router.get('/history', authenticate, async (_req: Request, res: Response): Promise<Response> => {
  try {
    const req = _req as any;
    const userId = req.user?.userId;
    const businessId = req.query.businessId || req.user?.businessId;

    if (!businessId) {
      return res.status(400).json({
        success: false,
        message: 'Business ID is required',
      });
    }

    // Verify user has access to this business
    const { data: business, error: businessError } = await supabaseAdmin
      .from('businesses')
      .select('id')
      .eq('id', businessId)
      .eq('user_id', userId)
      .single();

    if (businessError || !business) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to access this business data',
      });
    }

    // Parse query parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;
    const status = req.query.status as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    // Build query
    let query = supabaseAdmin
      .from('call_logs')
      .select(`
        *,
        agents (
          id,
          name,
          type
        ),
        transcripts (
          id,
          speaker,
          text,
          timestamp
        )
      `, { count: 'exact' })
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (status) {
      query = query.eq('status', status);
    }

    if (startDate) {
      query = query.gte('created_at', startDate);
    }

    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    const { data: calls, error: callsError, count } = await query;

    if (callsError) {
      logger.error('Error fetching call history:', callsError);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch call history',
      });
    }

    // Calculate call statistics
    const { data: stats } = await supabaseAdmin
      .from('call_logs')
      .select('status')
      .eq('business_id', businessId)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    const statistics = {
      total: count || 0,
      completed: stats?.filter((s) => s.status === 'completed').length || 0,
      failed: stats?.filter((s) => s.status === 'failed').length || 0,
      averageDuration: calls?.reduce((acc, call) => acc + (call.duration || 0), 0) / (calls?.length || 1),
    };

    return res.json({
      success: true,
      data: {
        calls: calls || [],
        pagination: {
          page,
          limit,
          total: count || 0,
          pages: Math.ceil((count || 0) / limit),
        },
        statistics,
      },
    });
  } catch (error) {
    logger.error('Error fetching call history:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch call history',
    });
  }
});

// Get specific call details
router.get('/history/:callId', authenticate, async (_req: Request, res: Response): Promise<Response> => {
  try {
    const req = _req as any;
    const userId = req.user?.userId;
    const { callId } = req.params;

    // Fetch call details with full relationships
    const { data: call, error: callError } = await supabaseAdmin
      .from('call_logs')
      .select(`
        *,
        businesses (
          id,
          name,
          user_id
        ),
        agents (
          id,
          name,
          type,
          prompt,
          voice_config
        ),
        transcripts (
          id,
          speaker,
          text,
          timestamp,
          metadata
        ),
        orders (
          id,
          items,
          total,
          status,
          payment_status
        )
      `)
      .eq('call_sid', callId)
      .single();

    if (callError || !call) {
      return res.status(404).json({
        success: false,
        message: 'Call not found',
      });
    }

    // Verify user has access
    if (call.businesses?.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to access this call',
      });
    }

    // Sort transcripts by timestamp
    if (call.transcripts) {
      call.transcripts.sort((a: any, b: any) => a.timestamp - b.timestamp);
    }

    return res.json({
      success: true,
      data: call,
    });
  } catch (error) {
    logger.error('Error fetching call details:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch call details',
    });
  }
});

// Get call analytics
router.get('/analytics', authenticate, async (_req: Request, res: Response): Promise<Response> => {
  try {
    const req = _req as any;
    const userId = req.user?.userId;
    const businessId = req.query.businessId || req.user?.businessId;
    const period = req.query.period || '30d';

    if (!businessId) {
      return res.status(400).json({
        success: false,
        message: 'Business ID is required',
      });
    }

    // Verify user has access
    const { data: business, error: businessError } = await supabaseAdmin
      .from('businesses')
      .select('id')
      .eq('id', businessId)
      .eq('user_id', userId)
      .single();

    if (businessError || !business) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to access this business data',
      });
    }

    // Calculate date range
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Fetch call data for analytics
    const { data: calls, error: callsError } = await supabaseAdmin
      .from('call_logs')
      .select('*')
      .eq('business_id', businessId)
      .gte('created_at', startDate.toISOString());

    if (callsError) {
      throw callsError;
    }

    // Calculate analytics
    const totalCalls = calls?.length || 0;
    const completedCalls = calls?.filter((c) => c.status === 'completed').length || 0;
    const failedCalls = calls?.filter((c) => c.status === 'failed').length || 0;
    const totalDuration = calls?.reduce((acc, c) => acc + (c.duration || 0), 0) || 0;
    const avgDuration = totalCalls > 0 ? totalDuration / totalCalls : 0;

    // Group calls by day for trend data
    const callsByDay: Record<string, number> = {};
    calls?.forEach((call) => {
      const date = new Date(call.created_at).toISOString().split('T')[0];
      if (date) {
        callsByDay[date] = (callsByDay[date] || 0) + 1;
      }
    });

    // Calculate peak hours
    const callsByHour: Record<number, number> = {};
    calls?.forEach((call) => {
      const hour = new Date(call.created_at).getHours();
      callsByHour[hour] = (callsByHour[hour] || 0) + 1;
    });

    const peakHour = Object.entries(callsByHour)
      .sort(([, a], [, b]) => b - a)[0]?.[0] || 0;

    // Calculate success rate
    const successRate = totalCalls > 0 ? (completedCalls / totalCalls) * 100 : 0;

    return res.json({
      success: true,
      data: {
        overview: {
          totalCalls,
          completedCalls,
          failedCalls,
          successRate: Math.round(successRate * 100) / 100,
          avgDuration: Math.round(avgDuration),
          totalDuration,
        },
        trends: {
          daily: Object.entries(callsByDay).map(([date, count]) => ({ date, count })),
          hourly: Object.entries(callsByHour).map(([hour, count]) => ({
            hour: parseInt(hour),
            count,
          })).sort((a, b) => a.hour - b.hour),
        },
        insights: {
          peakHour: `${peakHour}:00`,
          busiestDay: Object.entries(callsByDay)
            .sort(([, a], [, b]) => b - a)[0]?.[0] || 'N/A',
          avgCallsPerDay: Math.round(totalCalls / Math.max(1, Object.keys(callsByDay).length)),
        },
      },
    });
  } catch (error) {
    logger.error('Error fetching call analytics:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch call analytics',
    });
  }
});

export default router;
