import { Request } from 'express';

export interface IUser {
  id: string;
  email: string;
  password_hash?: string;
  created_at: string;
  updated_at: string;
}

export interface IBusiness {
  id: string;
  user_id: string;
  name: string;
  data_json: IBusinessData;
  created_at: string;
  updated_at: string;
}

export interface IBusinessData {
  menu?: IMenuItem[];
  hours?: IBusinessHours;
  pricing?: Record<string, number>;
  location?: ILocation;
  description?: string;
  phone?: string;
  email?: string;
  website?: string;
  features?: string[];
  customPrompts?: Record<string, string>;
  [key: string]: any;
}

export interface IMenuItem {
  id?: string;
  name: string;
  description?: string;
  price: number;
  category?: string;
  available?: boolean;
  modifiers?: IMenuModifier[];
  image_url?: string;
}

export interface IMenuModifier {
  name: string;
  price?: number;
  required?: boolean;
  options?: string[];
}

export interface IBusinessHours {
  monday?: IDayHours;
  tuesday?: IDayHours;
  wednesday?: IDayHours;
  thursday?: IDayHours;
  friday?: IDayHours;
  saturday?: IDayHours;
  sunday?: IDayHours;
}

export interface IDayHours {
  open: string;
  close: string;
  closed?: boolean;
}

export interface ILocation {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
}

export type AgentType = 'service' | 'order' | 'payment';

export interface IAgent {
  id: string;
  business_id: string;
  name: string;
  type: AgentType;
  prompt: string;
  voice_config: IVoiceConfig;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface IVoiceConfig {
  voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
  temperature?: number;
  variant?: string[];
  speed?: number;
  pitch?: number;
  model?: string;
}

export interface IPhoneMapping {
  id: string;
  business_id: string;
  twilio_number: string;
  agent_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled';
export type PaymentStatus = 'pending' | 'paid' | 'refunded';

export interface IOrder {
  id: string;
  business_id: string;
  customer_phone: string;
  items: IOrderItem[];
  total: number;
  status: OrderStatus;
  payment_status: PaymentStatus;
  call_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface IOrderItem {
  name: string;
  quantity: number;
  price: number;
  modifiers?: string[];
  notes?: string;
}

export type PaymentResultStatus = 'pending' | 'succeeded' | 'failed' | 'refunded';

export interface IPayment {
  id: string;
  order_id: string;
  business_id: string;
  amount: number;
  stripe_charge_id?: string | null;
  status: PaymentResultStatus;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export type CallStatus = 'initiated' | 'ringing' | 'in-progress' | 'completed' | 'failed' | 'busy' | 'no-answer';

export interface ICallLog {
  id: string;
  business_id: string;
  agent_id: string;
  call_sid: string;
  from_number: string;
  to_number: string;
  duration?: number | null;
  status: CallStatus;
  recording_url?: string | null;
  created_at: string;
  updated_at: string;
}

export type SpeakerType = 'agent' | 'customer';

export interface ITranscript {
  id: string;
  call_id: string;
  business_id: string;
  speaker: SpeakerType;
  text: string;
  timestamp: number;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface StreamEvent {
  event: string;
  streamSid?: string;
  callSid?: string;
  accountSid?: string;
  from?: string;
  to?: string;
  direction?: string;
  state?: string;
  sequence?: number;
  media?: {
    track: 'inbound' | 'outbound' | 'both_tracks';
    chunk: string;
    timestamp: string;
    payload: string;
  };
  start?: {
    streamSid: string;
    callSid: string;
    accountSid: string;
    from: string;
    to: string;
    customParameters?: Record<string, string>;
  };
  stop?: {
    accountSid: string;
    callSid: string;
  };
  mark?: {
    name: string;
  };
  [key: string]: any;
}

export interface IOpenAIRealtimeEvent {
  type: string;
  event_id?: string;
  response_id?: string;
  item_id?: string;
  output_index?: number;
  content_index?: number;
  delta?: string;
  audio?: string;
  text?: string;
  transcript?: string;
  function_name?: string;
  arguments?: string;
  call_id?: string;
  output?: string;
  error?: {
    type: string;
    code?: string;
    message: string;
    param?: string;
  };
  session?: {
    id?: string;
    object?: string;
    model?: string;
    modalities?: string[];
    instructions?: string;
    voice?: string;
    input_audio_format?: string;
    output_audio_format?: string;
    temperature?: number;
    max_response_output_tokens?: number;
    tools?: ITool[];
    tool_choice?: string;
  };
  [key: string]: any;
}

export interface ITool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: {
      type: string;
      properties?: Record<string, any>;
      required?: string[];
      additionalProperties?: boolean;
    };
    strict?: boolean;
  };
}

export interface IWebSocketConnection {
  id: string;
  callSid: string;
  streamSid: string;
  businessId: string;
  agentId: string;
  twilioWs?: any;
  openaiWs?: any;
  sessionId?: string;
  isActive: boolean;
  startTime: number;
  metadata?: Record<string, any>;
}

export interface IJWTPayload {
  userId: string;
  email: string;
  businessId?: string;
  iat?: number;
  exp?: number;
}

export interface IAuthRequest extends Request {
  user?: IJWTPayload;
  token?: string;
}

export interface IPaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  filters?: Record<string, any>;
}

export interface IPaginationResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface IApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
    details?: any;
  };
  meta?: {
    timestamp: string;
    version: string;
    [key: string]: any;
  };
}

export interface IHealthCheckResponse {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
  uptime: number;
  environment: string;
  version: string;
  services?: {
    database: boolean;
    twilio: boolean;
    openai: boolean;
    stripe: boolean;
  };
}

export interface IFunctionCallResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface IRealtimeSessionConfig {
  businessId: string;
  agentId: string;
  instructions: string;
  voice: string;
  temperature: number;
  tools: ITool[];
  businessData: IBusinessData;
}

export interface IAudioBuffer {
  data: Buffer;
  timestamp: number;
  duration: number;
  format: 'pcm16' | 'mulaw';
  sampleRate: number;
}