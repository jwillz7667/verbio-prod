import { VoiceResponse as TwilioVoiceResponse } from 'twilio/lib/twiml/VoiceResponse';

export interface TwilioWebhookRequest {
  CallSid: string;
  CallStatus: string;
  From: string;
  To: string;
  Direction: string;
  AccountSid?: string;
  ApiVersion?: string;
  CalledVia?: string;
  CallerName?: string;
  Digits?: string;
  Duration?: string;
  RecordingUrl?: string;
  RecordingSid?: string;
  RecordingDuration?: string;
}

export interface TwilioStatusCallbackRequest extends TwilioWebhookRequest {
  Timestamp?: string;
  CallbackSource?: string;
  SequenceNumber?: string;
}

export interface StreamEvent {
  event: 'start' | 'media' | 'stop';
  sequenceNumber: string;
  streamSid?: string;
  start?: {
    streamSid: string;
    accountSid: string;
    callSid: string;
    customParameters?: Record<string, any>;
  };
  media?: {
    track: 'inbound' | 'outbound';
    chunk: string;
    timestamp: string;
    payload: string;
  };
  stop?: {
    accountSid: string;
    callSid: string;
  };
}

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  apiKey?: string;
  apiSecret?: string;
}

export interface PhoneMappingConfig {
  twilioNumber: string;
  agentId: string;
  businessId: string;
  agentType: 'service' | 'order' | 'payment';
  prompt?: string;
  voiceConfig?: {
    voice: string;
    language?: string;
    pitch?: number;
    rate?: number;
  };
}

export class VoiceResponse extends TwilioVoiceResponse {
  constructor() {
    super();
  }
}