/**
 * OpenAI Realtime API Event Types
 * Complete type definitions for all client and server events
 * Compliant with OpenAI Realtime API GA (2025) specifications
 */

// ============== CLIENT EVENTS (Client -> Server) ==============

export type ClientEventType =
  | 'session.update'
  | 'input_audio_buffer.append'
  | 'input_audio_buffer.commit'
  | 'input_audio_buffer.clear'
  | 'conversation.item.create'
  | 'conversation.item.truncate'
  | 'conversation.item.delete'
  | 'response.create'
  | 'response.cancel';

export interface ClientEvent {
  type: ClientEventType;
  event_id?: string;
}

export interface SessionUpdateEvent extends ClientEvent {
  type: 'session.update';
  session: {
    modalities?: ('text' | 'audio')[];
    instructions?: string;
    voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' | 'cedar' | 'marin';
    input_audio_format?: 'pcm16' | 'g711_ulaw' | 'g711_alaw';
    output_audio_format?: 'pcm16' | 'g711_ulaw' | 'g711_alaw';
    input_audio_transcription?: {
      enabled?: boolean;
      model?: 'whisper-1';
    };
    turn_detection?: {
      type?: 'none' | 'server_vad' | 'semantic_vad';
      threshold?: number;
      prefix_padding_ms?: number;
      silence_duration_ms?: number;
      create_response?: boolean;
    } | null;
    tools?: Tool[];
    tool_choice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
    max_response_output_tokens?: number | 'inf';
  };
}

export interface InputAudioBufferAppendEvent extends ClientEvent {
  type: 'input_audio_buffer.append';
  audio: string;
}

export interface InputAudioBufferCommitEvent extends ClientEvent {
  type: 'input_audio_buffer.commit';
}

export interface InputAudioBufferClearEvent extends ClientEvent {
  type: 'input_audio_buffer.clear';
}

export interface ConversationItemCreateEvent extends ClientEvent {
  type: 'conversation.item.create';
  previous_item_id?: string;
  item: ConversationItem;
}

export interface ConversationItemTruncateEvent extends ClientEvent {
  type: 'conversation.item.truncate';
  item_id: string;
  content_index: number;
  audio_end_ms: number;
}

export interface ConversationItemDeleteEvent extends ClientEvent {
  type: 'conversation.item.delete';
  item_id: string;
}

export interface ResponseCreateEvent extends ClientEvent {
  type: 'response.create';
  response?: {
    modalities?: ('text' | 'audio')[];
    instructions?: string;
    voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' | 'cedar' | 'marin';
    output_audio_format?: 'pcm16' | 'g711_ulaw' | 'g711_alaw';
    tools?: Tool[];
    tool_choice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
    max_output_tokens?: number | 'inf';
  };
  commit?: boolean;
  cancel_previous?: boolean;
}

export interface ResponseCancelEvent extends ClientEvent {
  type: 'response.cancel';
}

// ============== SERVER EVENTS (Server -> Client) ==============

export type ServerEventType =
  | 'error'
  | 'session.created'
  | 'session.updated'
  | 'conversation.created'
  | 'conversation.item.created'
  | 'conversation.item.input_audio_transcription.completed'
  | 'conversation.item.input_audio_transcription.failed'
  | 'conversation.item.truncated'
  | 'conversation.item.deleted'
  | 'input_audio_buffer.committed'
  | 'input_audio_buffer.cleared'
  | 'input_audio_buffer.speech_started'
  | 'input_audio_buffer.speech_stopped'
  | 'response.created'
  | 'response.done'
  | 'response.output_item.added'
  | 'response.output_item.done'
  | 'response.content_part.added'
  | 'response.content_part.done'
  | 'response.text.delta'
  | 'response.text.done'
  | 'response.audio.delta'
  | 'response.audio.done'
  | 'response.audio_transcript.delta'
  | 'response.audio_transcript.done'
  | 'response.function_call_arguments.delta'
  | 'response.function_call_arguments.done'
  | 'rate_limits.updated';

export interface ServerEvent {
  type: ServerEventType;
  event_id: string;
}

export interface ErrorEvent extends ServerEvent {
  type: 'error';
  error: {
    type: string;
    code?: string;
    message: string;
    param?: string;
    event_id?: string;
  };
}

export interface SessionCreatedEvent extends ServerEvent {
  type: 'session.created';
  session: Session;
}

export interface SessionUpdatedEvent extends ServerEvent {
  type: 'session.updated';
  session: Session;
}

export interface ConversationCreatedEvent extends ServerEvent {
  type: 'conversation.created';
  conversation: Conversation;
}

export interface ConversationItemCreatedEvent extends ServerEvent {
  type: 'conversation.item.created';
  previous_item_id?: string;
  item: ConversationItem;
}

export interface ConversationItemInputAudioTranscriptionCompletedEvent extends ServerEvent {
  type: 'conversation.item.input_audio_transcription.completed';
  item_id: string;
  content_index: number;
  transcript: string;
}

export interface ConversationItemInputAudioTranscriptionFailedEvent extends ServerEvent {
  type: 'conversation.item.input_audio_transcription.failed';
  item_id: string;
  content_index: number;
  error: {
    type: string;
    code?: string;
    message: string;
    param?: string;
  };
}

export interface ConversationItemTruncatedEvent extends ServerEvent {
  type: 'conversation.item.truncated';
  item_id: string;
  content_index: number;
  audio_end_ms: number;
}

export interface ConversationItemDeletedEvent extends ServerEvent {
  type: 'conversation.item.deleted';
  item_id: string;
}

export interface InputAudioBufferCommittedEvent extends ServerEvent {
  type: 'input_audio_buffer.committed';
  previous_item_id?: string;
  item_id: string;
}

export interface InputAudioBufferClearedEvent extends ServerEvent {
  type: 'input_audio_buffer.cleared';
}

export interface InputAudioBufferSpeechStartedEvent extends ServerEvent {
  type: 'input_audio_buffer.speech_started';
  audio_start_ms: number;
  item_id: string;
}

export interface InputAudioBufferSpeechStoppedEvent extends ServerEvent {
  type: 'input_audio_buffer.speech_stopped';
  audio_end_ms: number;
  item_id?: string;
}

export interface ResponseCreatedEvent extends ServerEvent {
  type: 'response.created';
  response: Response;
}

export interface ResponseDoneEvent extends ServerEvent {
  type: 'response.done';
  response: Response;
}

export interface ResponseOutputItemAddedEvent extends ServerEvent {
  type: 'response.output_item.added';
  response_id: string;
  output_index: number;
  item: ConversationItem;
}

export interface ResponseOutputItemDoneEvent extends ServerEvent {
  type: 'response.output_item.done';
  response_id: string;
  output_index: number;
  item: ConversationItem;
}

export interface ResponseContentPartAddedEvent extends ServerEvent {
  type: 'response.content_part.added';
  response_id: string;
  item_id: string;
  output_index: number;
  content_index: number;
  part: ContentPart;
}

export interface ResponseContentPartDoneEvent extends ServerEvent {
  type: 'response.content_part.done';
  response_id: string;
  item_id: string;
  output_index: number;
  content_index: number;
  part: ContentPart;
}

export interface ResponseTextDeltaEvent extends ServerEvent {
  type: 'response.text.delta';
  response_id: string;
  item_id: string;
  output_index: number;
  content_index: number;
  delta: string;
}

export interface ResponseTextDoneEvent extends ServerEvent {
  type: 'response.text.done';
  response_id: string;
  item_id: string;
  output_index: number;
  content_index: number;
  text: string;
}

export interface ResponseAudioDeltaEvent extends ServerEvent {
  type: 'response.audio.delta';
  response_id: string;
  item_id: string;
  output_index: number;
  content_index: number;
  delta: string;
}

export interface ResponseAudioDoneEvent extends ServerEvent {
  type: 'response.audio.done';
  response_id: string;
  item_id: string;
  output_index: number;
  content_index: number;
}

export interface ResponseAudioTranscriptDeltaEvent extends ServerEvent {
  type: 'response.audio_transcript.delta';
  response_id: string;
  item_id: string;
  output_index: number;
  content_index: number;
  delta: string;
}

export interface ResponseAudioTranscriptDoneEvent extends ServerEvent {
  type: 'response.audio_transcript.done';
  response_id: string;
  item_id: string;
  output_index: number;
  content_index: number;
  transcript: string;
}

export interface ResponseFunctionCallArgumentsDeltaEvent extends ServerEvent {
  type: 'response.function_call_arguments.delta';
  response_id: string;
  item_id: string;
  output_index: number;
  call_id: string;
  delta: string;
}

export interface ResponseFunctionCallArgumentsDoneEvent extends ServerEvent {
  type: 'response.function_call_arguments.done';
  response_id: string;
  item_id: string;
  output_index: number;
  call_id: string;
  name: string;
  arguments: string;
}

export interface RateLimitsUpdatedEvent extends ServerEvent {
  type: 'rate_limits.updated';
  rate_limits: RateLimit[];
}

// ============== SHARED TYPES ==============

export interface Session {
  id: string;
  object: 'session';
  model: string;
  modalities: ('text' | 'audio')[];
  instructions: string;
  voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' | 'cedar' | 'marin';
  input_audio_format: 'pcm16' | 'g711_ulaw' | 'g711_alaw';
  output_audio_format: 'pcm16' | 'g711_ulaw' | 'g711_alaw';
  input_audio_transcription?: {
    enabled: boolean;
    model: 'whisper-1';
  };
  turn_detection?: {
    type: 'none' | 'server_vad' | 'semantic_vad';
    threshold?: number;
    prefix_padding_ms?: number;
    silence_duration_ms?: number;
    create_response?: boolean;
  } | null;
  tools: Tool[];
  tool_choice: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
  max_response_output_tokens?: number | 'inf';
}

export interface Conversation {
  id: string;
  object: 'conversation';
}

export interface ConversationItem {
  id: string;
  object: 'conversation.item';
  type: 'message' | 'function_call' | 'function_call_output';
  role?: 'user' | 'assistant' | 'system';
  status?: 'in_progress' | 'completed' | 'incomplete';
  content?: ContentPart[];
  name?: string;
  call_id?: string;
  output?: string;
}

export interface ContentPart {
  type: 'text' | 'audio' | 'input_text' | 'input_audio';
  text?: string;
  audio?: string;
  transcript?: string;
}

export interface Response {
  id: string;
  object: 'response';
  status: 'in_progress' | 'completed' | 'cancelled' | 'incomplete' | 'failed';
  status_details?: {
    type: 'cancelled' | 'incomplete' | 'failed';
    reason?: 'turn_detected' | 'client_cancelled' | 'max_output_tokens' | 'content_filter' | 'error';
    error?: {
      type: string;
      code?: string;
      message: string;
    };
  };
  output?: ConversationItem[];
  usage?: {
    total_tokens: number;
    input_tokens: number;
    output_tokens: number;
    input_token_details?: {
      text_tokens: number;
      audio_tokens: number;
      cached_tokens: number;
    };
    output_token_details?: {
      text_tokens: number;
      audio_tokens: number;
    };
  };
}

export interface Tool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: {
      type: string;
      properties?: Record<string, unknown>;
      required?: string[];
      additionalProperties?: boolean;
    };
    strict?: boolean;
  };
}

export interface RateLimit {
  name: 'requests' | 'tokens' | 'input_tokens' | 'output_tokens';
  limit: number;
  remaining: number;
  reset_seconds: number;
}

// ============== TYPE GUARDS ==============

export function isClientEvent(event: unknown): event is ClientEvent {
  const e = event as Record<string, unknown>;
  return (
    e &&
    typeof e.type === 'string' &&
    [
      'session.update',
      'input_audio_buffer.append',
      'input_audio_buffer.commit',
      'input_audio_buffer.clear',
      'conversation.item.create',
      'conversation.item.truncate',
      'conversation.item.delete',
      'response.create',
      'response.cancel',
    ].includes(e.type)
  );
}

export function isServerEvent(event: unknown): event is ServerEvent {
  const e = event as Record<string, unknown>;
  return e && typeof e.type === 'string' && typeof e.event_id === 'string';
}

export function isErrorEvent(event: ServerEvent): event is ErrorEvent {
  return event.type === 'error';
}

export function isAudioDeltaEvent(event: ServerEvent): event is ResponseAudioDeltaEvent {
  return event.type === 'response.audio.delta';
}

export function isAudioTranscriptDeltaEvent(event: ServerEvent): event is ResponseAudioTranscriptDeltaEvent {
  return event.type === 'response.audio_transcript.delta';
}

export function isFunctionCallArgumentsEvent(event: ServerEvent): event is ResponseFunctionCallArgumentsDoneEvent {
  return event.type === 'response.function_call_arguments.done';
}

// ============== UNION TYPES FOR EASY HANDLING ==============

export type RealtimeClientEvent =
  | SessionUpdateEvent
  | InputAudioBufferAppendEvent
  | InputAudioBufferCommitEvent
  | InputAudioBufferClearEvent
  | ConversationItemCreateEvent
  | ConversationItemTruncateEvent
  | ConversationItemDeleteEvent
  | ResponseCreateEvent
  | ResponseCancelEvent;

export type RealtimeServerEvent =
  | ErrorEvent
  | SessionCreatedEvent
  | SessionUpdatedEvent
  | ConversationCreatedEvent
  | ConversationItemCreatedEvent
  | ConversationItemInputAudioTranscriptionCompletedEvent
  | ConversationItemInputAudioTranscriptionFailedEvent
  | ConversationItemTruncatedEvent
  | ConversationItemDeletedEvent
  | InputAudioBufferCommittedEvent
  | InputAudioBufferClearedEvent
  | InputAudioBufferSpeechStartedEvent
  | InputAudioBufferSpeechStoppedEvent
  | ResponseCreatedEvent
  | ResponseDoneEvent
  | ResponseOutputItemAddedEvent
  | ResponseOutputItemDoneEvent
  | ResponseContentPartAddedEvent
  | ResponseContentPartDoneEvent
  | ResponseTextDeltaEvent
  | ResponseTextDoneEvent
  | ResponseAudioDeltaEvent
  | ResponseAudioDoneEvent
  | ResponseAudioTranscriptDeltaEvent
  | ResponseAudioTranscriptDoneEvent
  | ResponseFunctionCallArgumentsDeltaEvent
  | ResponseFunctionCallArgumentsDoneEvent
  | RateLimitsUpdatedEvent;
