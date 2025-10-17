/**
 * Twilio-specific type definitions
 */

export interface TwilioWebhookRequest {
  CallSid: string;
  AccountSid: string;
  From: string;
  To: string;
  CallStatus: 'queued' | 'ringing' | 'in-progress' | 'completed' | 'busy' | 'failed' | 'no-answer' | 'canceled';
  ApiVersion: string;
  Direction: 'inbound' | 'outbound-api' | 'outbound-dial';
  ForwardedFrom?: string;
  CallerName?: string;
  ParentCallSid?: string;
  CallDuration?: string;
  SipResponseCode?: string;
  RecordingUrl?: string;
  RecordingSid?: string;
  RecordingDuration?: string;
  Timestamp?: string;
}

export interface TwilioStatusCallbackRequest {
  CallSid: string;
  AccountSid: string;
  From: string;
  To: string;
  CallStatus: 'queued' | 'ringing' | 'in-progress' | 'completed' | 'busy' | 'failed' | 'no-answer' | 'canceled';
  ApiVersion: string;
  Direction: 'inbound' | 'outbound-api' | 'outbound-dial';
  CallDuration?: string;
  Duration?: string;
  RecordingUrl?: string;
  RecordingSid?: string;
  RecordingDuration?: string;
  Timestamp?: string;
  SequenceNumber?: string;
}

export interface TwilioErrorResponse {
  code: number;
  message: string;
  moreInfo: string;
  status: number;
}

export interface TwilioCallInstance {
  sid: string;
  accountSid: string;
  from: string;
  to: string;
  status: string;
  startTime: Date | null;
  endTime: Date | null;
  duration: string | null;
  price: string | null;
  direction: string;
  answeredBy: string | null;
  forwardedFrom: string | null;
  callerName: string | null;
  uri: string;
  subresourceUris: Record<string, string>;
}
