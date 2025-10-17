import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Settings,
  Play,
  Square,
  MessageSquare,
  FileText,
  ChevronDown,
  ChevronRight,
  Loader2,
  Download,
  Eye,
  EyeOff,
  Circle,
  Disc,
  Headphones,
  Trash2,
  Calendar,
  Clock,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { api } from '../services/api';
import toast from 'react-hot-toast';

interface SessionConfig {
  model: string;
  voice: string;
  instructions: string;
  inputAudioTranscription: {
    enabled: boolean;
    model: string;
  };
  turnDetection: {
    type: 'server_vad' | 'semantic_vad' | 'none';
    threshold?: number;
    prefixPaddingMs?: number;
    silenceDurationMs?: number;
    createResponse?: boolean;
  };
  tools: Array<{
    name: string;
    description: string;
    parameters: Record<string, any>;
  }>;
  maxResponseOutputTokens: number | 'inf';
  vadMode: 'server_vad' | 'semantic_vad' | 'disabled';
  modalities: string[];
  audioFormat: 'pcm16' | 'g711_ulaw' | 'g711_alaw';
  toolChoice: 'auto' | 'none' | 'required' | { type: 'function'; name: string };
  noiseReduction?: {
    enabled: boolean;
    strength: 'low' | 'medium' | 'high';
  };
  mcpServers?: Array<{
    url: string;
    name: string;
    apiKey?: string;
  }>;
}

interface EventLog {
  id: string;
  type: 'client' | 'server' | 'error' | 'info';
  event: string;
  timestamp: Date;
  data?: any;
}

interface TranscriptionEntry {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  audioData?: string;
  duration?: number;
}

interface Recording {
  id: string;
  callSid: string;
  recordingSid: string;
  duration: number;
  url: string;
  status: 'processing' | 'completed' | 'failed';
  createdAt: Date;
  phoneNumber?: string;
}

type TabType = 'transcription' | 'recordings' | 'events' | 'functions' | 'config';

export const VoiceAgentsPlayground: React.FC = () => {
  const { user } = useAuthStore();

  // Call state
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isCallActive, setIsCallActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  // Audio controls
  const [isMuted, setIsMuted] = useState(false);
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingEnabled, setRecordingEnabled] = useState(false);

  // UI state
  const [activeTab, setActiveTab] = useState<TabType>('transcription');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showJsonConfig, setShowJsonConfig] = useState(false);

  // Data state
  const [transcription, setTranscription] = useState<TranscriptionEntry[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [eventLogs, setEventLogs] = useState<EventLog[]>([]);
  const [sessionActive, setSessionActive] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>(
    'disconnected'
  );

  // Configuration
  const [config, setConfig] = useState<SessionConfig>({
    model: 'gpt-realtime',
    voice: 'cedar',
    instructions: `You are a helpful AI assistant on a voice call. Be conversational, friendly, and concise.

Your knowledge cutoff is 2023-10. You are helpful, witty, and friendly. Act like a human, but remember that you aren't a human and that you can't do human things in the real world. Your voice and personality should be warm and engaging, with a lively and playful tone. If interacting in a non-English language, start by using the standard accent or dialect familiar to the user.`,
    inputAudioTranscription: {
      enabled: true,
      model: 'whisper-1',
    },
    turnDetection: {
      type: 'semantic_vad',
      threshold: 0.5,
      prefixPaddingMs: 300,
      silenceDurationMs: 500,
      createResponse: true,
    },
    tools: [],
    maxResponseOutputTokens: 4096,
    vadMode: 'semantic_vad',
    modalities: ['text', 'audio'],
    audioFormat: 'pcm16',
    toolChoice: 'auto',
    noiseReduction: {
      enabled: true,
      strength: 'medium',
    },
    mcpServers: [],
  });

  // Refs
  const ws = useRef<WebSocket | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const transcriptionEndRef = useRef<HTMLDivElement>(null);
  const eventLogEndRef = useRef<HTMLDivElement>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recordingPollRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll transcription and events
  useEffect(() => {
    if (activeTab === 'transcription') {
      transcriptionEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcription, activeTab]);

  useEffect(() => {
    if (activeTab === 'events') {
      eventLogEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [eventLogs, activeTab]);

  // Load recordings on mount
  useEffect(() => {
    loadRecordings();
  }, []);

  // Call timer
  useEffect(() => {
    if (isCallActive) {
      callTimerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }
      setCallDuration(0);
    }

    return () => {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }
    };
  }, [isCallActive]);

  const loadRecordings = async () => {
    try {
      const response = await api.get('/api/calls/recordings');
      if (response.data.success) {
        setRecordings(response.data.data);
      }
    } catch (error) {
      console.error('Failed to load recordings:', error);
    }
  };

  const pollRecordingStatus = (callSid: string) => {
    recordingPollRef.current = setInterval(async () => {
      try {
        const response = await api.get(`/api/calls/${callSid}/recording`);
        if (response.data.success && response.data.data) {
          const recording = response.data.data;
          setRecordings((prev) => {
            const exists = prev.find((r) => r.recordingSid === recording.recordingSid);
            if (!exists) {
              return [...prev, recording];
            }
            return prev.map((r) => (r.recordingSid === recording.recordingSid ? recording : r));
          });

          if (recording.status === 'completed' || recording.status === 'failed') {
            if (recordingPollRef.current) {
              clearInterval(recordingPollRef.current);
            }
          }
        }
      } catch (error) {
        console.error('Failed to poll recording status:', error);
      }
    }, 5000);
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatPhoneNumber = (value: string): string => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 6) return `(${numbers.slice(0, 3)}) ${numbers.slice(3)}`;
    return `(${numbers.slice(0, 3)}) ${numbers.slice(3, 6)}-${numbers.slice(6, 10)}`;
  };

  const handlePhoneNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    if (value.length <= 10) {
      setPhoneNumber(value);
    }
  };

  const addEventLog = (type: EventLog['type'], event: string, data?: any) => {
    const newEvent: EventLog = {
      id: `event-${Date.now()}-${Math.random()}`,
      type,
      event,
      timestamp: new Date(),
      data,
    };
    setEventLogs((prev) => [...prev, newEvent]);
  };

  const connectSession = async () => {
    setConnectionStatus('connecting');
    addEventLog('info', 'Initiating session connection', { config });

    try {
      const baseUrl =
        import.meta.env.VITE_WS_URL ||
        (window.location.protocol === 'https:' ? `wss://${window.location.host}` : `ws://${window.location.host}`);
      const wsUrl = `${baseUrl}/ws/realtime`;
      const queryParams = new URLSearchParams({
        businessId: user?.businessId || '',
        model: config.model,
        voice: config.voice,
      });

      ws.current = new WebSocket(`${wsUrl}?${queryParams}`);

      ws.current.onopen = () => {
        setConnectionStatus('connected');
        setSessionActive(true);
        addEventLog('info', 'WebSocket connected');

        // Send session configuration
        ws.current?.send(
          JSON.stringify({
            type: 'session.update',
            session: {
              ...config,
              tools: config.tools.length > 0 ? config.tools : undefined,
            },
          })
        );
      };

      ws.current.onmessage = (event) => {
        const data = JSON.parse(event.data);
        addEventLog('server', data.type, data);

        switch (data.type) {
          case 'session.created':
          case 'session.updated':
            addEventLog('info', 'Session configuration updated', data.session);
            break;

          case 'conversation.item.created':
            if (data.item.role && data.item.content) {
              const entry: TranscriptionEntry = {
                id: data.item.id || `trans-${Date.now()}`,
                role: data.item.role,
                content: data.item.content[0]?.text || data.item.content[0]?.transcript || '',
                timestamp: new Date(),
                audioData: data.item.content[0]?.audio,
                duration: data.item.content[0]?.duration,
              };
              setTranscription((prev) => [...prev, entry]);
            }
            break;

          case 'response.audio_transcript.delta':
            // Update last assistant message with streaming transcript
            setTranscription((prev) => {
              const newTrans = [...prev];
              const lastIndex = newTrans.findLastIndex((t: TranscriptionEntry) => t.role === 'assistant');
              if (lastIndex >= 0) {
                newTrans[lastIndex] = {
                  ...newTrans[lastIndex],
                  content: newTrans[lastIndex].content + data.delta,
                };
              }
              return newTrans;
            });
            break;

          case 'error':
            addEventLog('error', 'Error received', data);
            toast.error(data.error?.message || 'An error occurred');
            break;
        }
      };

      ws.current.onerror = (error) => {
        setConnectionStatus('error');
        addEventLog('error', 'WebSocket error', error);
        toast.error('Connection error');
      };

      ws.current.onclose = () => {
        setConnectionStatus('disconnected');
        setSessionActive(false);
        addEventLog('info', 'WebSocket disconnected');
      };
    } catch (error) {
      setConnectionStatus('error');
      addEventLog('error', 'Failed to connect', error);
      toast.error('Failed to connect session');
    }
  };

  const disconnectSession = () => {
    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }
    setSessionActive(false);
    setConnectionStatus('disconnected');
    addEventLog('info', 'Session disconnected');
  };

  const initiateCall = async () => {
    if (phoneNumber.length !== 10) {
      toast.error('Please enter a valid 10-digit phone number');
      return;
    }

    setIsConnecting(true);
    addEventLog('info', 'Initiating outbound call', { phoneNumber: `+1${phoneNumber}`, recording: recordingEnabled });

    try {
      // First connect the session if not connected
      if (!sessionActive) {
        await connectSession();
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for session
      }

      // Initiate the call
      const response = await api.post('/api/calls/outbound', {
        to: `+1${phoneNumber}`,
      });

      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to initiate call');
      }

      const callSid = response.data.data?.callSid;
      setIsCallActive(true);
      setIsConnecting(false);
      addEventLog('info', 'Call connected', response.data);
      toast.success('Call connected');

      // If recording is enabled, start polling for recording status
      if (recordingEnabled && callSid) {
        pollRecordingStatus(callSid);
      }
    } catch (error) {
      setIsConnecting(false);
      addEventLog('error', 'Failed to initiate call', error);
      toast.error('Failed to initiate call');
    }
  };

  const endCall = useCallback(() => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'call.end' }));
    }
    setIsCallActive(false);
    setIsConnecting(false);
    addEventLog('info', 'Call ended');

    if (recordingPollRef.current) {
      clearInterval(recordingPollRef.current);
    }
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);

      mediaRecorder.current.ondataavailable = (event) => {
        if (event.data.size > 0 && ws.current?.readyState === WebSocket.OPEN) {
          // Convert blob to base64 and send
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = reader.result?.toString().split(',')[1];
            ws.current?.send(
              JSON.stringify({
                type: 'input_audio_buffer.append',
                audio: base64,
              })
            );
          };
          reader.readAsDataURL(event.data);
        }
      };

      mediaRecorder.current.start(100); // Send chunks every 100ms
      setIsRecording(true);
      addEventLog('info', 'Started recording');
    } catch (error) {
      addEventLog('error', 'Failed to start recording', error);
      toast.error('Failed to access microphone');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current) {
      mediaRecorder.current.stop();
      mediaRecorder.current.stream.getTracks().forEach((track) => track.stop());
      mediaRecorder.current = null;
    }
    setIsRecording(false);
    addEventLog('info', 'Stopped recording');
  };

  const toggleMute = () => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      const newMuteState = !isMuted;
      ws.current.send(
        JSON.stringify({
          type: 'input_audio_buffer.clear',
        })
      );
      setIsMuted(newMuteState);
      addEventLog('info', newMuteState ? 'Muted' : 'Unmuted');
    }
  };

  const playRecording = async (recording: Recording) => {
    try {
      window.open(recording.url, '_blank');
    } catch (error) {
      toast.error('Failed to play recording');
    }
  };

  const deleteRecording = async (recordingSid: string) => {
    try {
      const response = await api.delete(`/api/calls/recordings/${recordingSid}`);
      if (response.data.success) {
        setRecordings((prev) => prev.filter((r) => r.recordingSid !== recordingSid));
        toast.success('Recording deleted');
      }
    } catch (error) {
      toast.error('Failed to delete recording');
    }
  };

  const exportTranscription = () => {
    const content = transcription
      .map((entry) => `[${entry.timestamp.toLocaleTimeString()}] ${entry.role.toUpperCase()}: ${entry.content}`)
      .join('\n\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcription-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportEventLogs = () => {
    const content = JSON.stringify(eventLogs, null, 2);
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `events-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Voice Agents Playground</h1>
            <p className="text-sm text-gray-600 mt-1">Test your AI voice agents with real-time calls</p>
          </div>
          <div className="flex items-center gap-4">
            {/* Connection Status */}
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  connectionStatus === 'connected'
                    ? 'bg-green-500 animate-pulse'
                    : connectionStatus === 'connecting'
                      ? 'bg-yellow-500 animate-pulse'
                      : connectionStatus === 'error'
                        ? 'bg-red-500'
                        : 'bg-gray-400'
                }`}
              />
              <span className="text-sm text-gray-600">
                {connectionStatus === 'connected'
                  ? 'Connected'
                  : connectionStatus === 'connecting'
                    ? 'Connecting...'
                    : connectionStatus === 'error'
                      ? 'Error'
                      : 'Disconnected'}
              </span>
            </div>
            {/* Connect/Disconnect Button */}
            {!sessionActive ? (
              <button
                onClick={connectSession}
                disabled={connectionStatus === 'connecting'}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                Connect Session
              </button>
            ) : (
              <button
                onClick={disconnectSession}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                Disconnect
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Configuration */}
        <div className="w-96 bg-white border-r border-gray-200 flex flex-col">
          {/* Call Controls */}
          <div className="p-4 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Call Controls</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Phone Number</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">+1</span>
                    <input
                      type="text"
                      value={formatPhoneNumber(phoneNumber)}
                      onChange={handlePhoneNumberChange}
                      placeholder="(555) 555-5555"
                      disabled={isCallActive || isConnecting}
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <button
                    onClick={isCallActive ? endCall : initiateCall}
                    disabled={isConnecting || (!isCallActive && phoneNumber.length !== 10)}
                    className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors ${
                      isCallActive
                        ? 'bg-red-600 hover:bg-red-700 text-white'
                        : isConnecting
                          ? 'bg-gray-400 text-white cursor-wait'
                          : 'bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-300'
                    }`}
                  >
                    {isCallActive ? (
                      <>
                        <PhoneOff className="w-4 h-4" />
                        End
                      </>
                    ) : isConnecting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Calling...
                      </>
                    ) : (
                      <>
                        <Phone className="w-4 h-4" />
                        Call
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Recording Toggle */}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={recordingEnabled}
                    onChange={(e) => setRecordingEnabled(e.target.checked)}
                    disabled={isCallActive}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">Enable Call Recording</span>
                </label>
                {isCallActive && <span className="text-sm text-gray-500">{formatDuration(callDuration)}</span>}
              </div>

              {/* Audio Controls */}
              {(sessionActive || isCallActive) && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    className={`p-2 rounded-lg transition-colors ${
                      isRecording
                        ? 'bg-red-600 hover:bg-red-700 text-white'
                        : 'bg-gray-600 hover:bg-gray-700 text-white'
                    }`}
                  >
                    {isRecording ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={toggleMute}
                    className={`p-2 rounded-lg transition-colors ${
                      isMuted ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-gray-600 hover:bg-gray-700 text-white'
                    }`}
                  >
                    {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => setSpeakerEnabled(!speakerEnabled)}
                    className={`p-2 rounded-lg transition-colors ${
                      !speakerEnabled
                        ? 'bg-red-600 hover:bg-red-700 text-white'
                        : 'bg-gray-600 hover:bg-gray-700 text-white'
                    }`}
                  >
                    {speakerEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Configuration */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-4">
              {/* Model Configuration */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Model Configuration</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Model</label>
                    <select
                      value={config.model}
                      onChange={(e) => setConfig({ ...config, model: e.target.value })}
                      disabled={sessionActive}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="gpt-realtime">GPT Realtime (Recommended)</option>
                      <option value="gpt-4o-realtime-preview">GPT-4o Realtime Preview</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Voice</label>
                    <select
                      value={config.voice}
                      onChange={(e) => setConfig({ ...config, voice: e.target.value })}
                      disabled={sessionActive}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="alloy">Alloy - Neutral</option>
                      <option value="echo">Echo - Smooth</option>
                      <option value="fable">Fable - Expressive</option>
                      <option value="onyx">Onyx - Authoritative</option>
                      <option value="nova">Nova - Friendly</option>
                      <option value="shimmer">Shimmer - Warm</option>
                      <option value="cedar">Cedar - Natural (Recommended)</option>
                      <option value="marin">Marin - High quality</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Instructions */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Instructions</label>
                <textarea
                  value={config.instructions}
                  onChange={(e) => setConfig({ ...config, instructions: e.target.value })}
                  disabled={sessionActive}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {/* Advanced Settings Toggle */}
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
              >
                {showAdvanced ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                Advanced Settings
              </button>

              {showAdvanced && (
                <div className="space-y-3 pl-4">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">VAD Mode</label>
                    <select
                      value={config.vadMode}
                      onChange={(e) => {
                        const vadMode = e.target.value as 'server_vad' | 'semantic_vad' | 'disabled';
                        setConfig({
                          ...config,
                          vadMode,
                          turnDetection: {
                            ...config.turnDetection,
                            type: vadMode === 'disabled' ? 'none' : vadMode,
                          },
                        });
                      }}
                      disabled={sessionActive}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="semantic">Semantic VAD (Recommended)</option>
                      <option value="server_vad">Server VAD</option>
                      <option value="disabled">Disabled</option>
                    </select>
                  </div>

                  {config.vadMode === 'server_vad' && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm text-gray-600 mb-1">Threshold</label>
                        <input
                          type="number"
                          min="0"
                          max="1"
                          step="0.1"
                          value={config.turnDetection.threshold || 0.5}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              turnDetection: {
                                ...config.turnDetection,
                                threshold: parseFloat(e.target.value),
                              },
                            })
                          }
                          disabled={sessionActive}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 mb-1">Prefix Padding (ms)</label>
                        <input
                          type="number"
                          min="0"
                          max="1000"
                          step="50"
                          value={config.turnDetection.prefixPaddingMs || 300}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              turnDetection: {
                                ...config.turnDetection,
                                prefixPaddingMs: parseInt(e.target.value),
                              },
                            })
                          }
                          disabled={sessionActive}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 mb-1">Silence Duration (ms)</label>
                        <input
                          type="number"
                          min="100"
                          max="2000"
                          step="100"
                          value={config.turnDetection.silenceDurationMs || 500}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              turnDetection: {
                                ...config.turnDetection,
                                silenceDurationMs: parseInt(e.target.value),
                              },
                            })
                          }
                          disabled={sessionActive}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Max Output Tokens</label>
                    <input
                      type="number"
                      value={config.maxResponseOutputTokens === 'inf' ? '' : config.maxResponseOutputTokens}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          maxResponseOutputTokens: e.target.value ? parseInt(e.target.value) : 'inf',
                        })
                      }
                      placeholder="Infinite"
                      disabled={sessionActive}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel - Content */}
        <div className="flex-1 flex flex-col">
          {/* Tabs */}
          <div className="bg-white border-b border-gray-200 px-4">
            <div className="flex gap-4">
              <button
                onClick={() => setActiveTab('transcription')}
                className={`px-4 py-3 border-b-2 transition-colors ${
                  activeTab === 'transcription'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Transcription
                </div>
              </button>
              <button
                onClick={() => setActiveTab('recordings')}
                className={`px-4 py-3 border-b-2 transition-colors ${
                  activeTab === 'recordings'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Headphones className="w-4 h-4" />
                  Recordings
                  {recordings.length > 0 && (
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-600 rounded-full text-xs">
                      {recordings.length}
                    </span>
                  )}
                </div>
              </button>
              <button
                onClick={() => setActiveTab('events')}
                className={`px-4 py-3 border-b-2 transition-colors ${
                  activeTab === 'events'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Events
                </div>
              </button>
              <button
                onClick={() => setActiveTab('config')}
                className={`px-4 py-3 border-b-2 transition-colors ${
                  activeTab === 'config'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  Config
                </div>
              </button>
            </div>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-hidden bg-gray-50">
            {/* Transcription Tab */}
            {activeTab === 'transcription' && (
              <div className="h-full flex flex-col">
                <div className="flex items-center justify-between px-4 py-2 bg-white border-b">
                  <h3 className="text-sm font-semibold text-gray-700">Live Transcription</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setTranscription([])}
                      className="px-3 py-1 text-sm bg-gray-600 hover:bg-gray-700 text-white rounded-lg"
                    >
                      Clear
                    </button>
                    <button
                      onClick={exportTranscription}
                      disabled={transcription.length === 0}
                      className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:bg-gray-300"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  {transcription.length === 0 ? (
                    <div className="text-center text-gray-500 mt-20">
                      <MessageSquare className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                      <p>No transcription yet</p>
                      <p className="text-sm mt-2">Start a call to see real-time transcription</p>
                    </div>
                  ) : (
                    <div className="space-y-4 max-w-4xl mx-auto">
                      {transcription.map((entry) => (
                        <div
                          key={entry.id}
                          className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[70%] rounded-lg px-4 py-3 ${
                              entry.role === 'user'
                                ? 'bg-blue-600 text-white'
                                : entry.role === 'system'
                                  ? 'bg-gray-600 text-white'
                                  : 'bg-white border border-gray-200'
                            }`}
                          >
                            <div className="text-xs opacity-75 mb-1">
                              {entry.role === 'user' ? 'User' : entry.role === 'assistant' ? 'Assistant' : 'System'}
                              {entry.duration && <span> ({entry.duration.toFixed(1)}s)</span>}
                            </div>
                            <div className="whitespace-pre-wrap">{entry.content}</div>
                            <div className="text-xs opacity-50 mt-1">{entry.timestamp.toLocaleTimeString()}</div>
                          </div>
                        </div>
                      ))}
                      <div ref={transcriptionEndRef} />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Recordings Tab */}
            {activeTab === 'recordings' && (
              <div className="h-full flex flex-col">
                <div className="flex items-center justify-between px-4 py-2 bg-white border-b">
                  <h3 className="text-sm font-semibold text-gray-700">Call Recordings</h3>
                  <button
                    onClick={loadRecordings}
                    className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                  >
                    Refresh
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  {recordings.length === 0 ? (
                    <div className="text-center text-gray-500 mt-20">
                      <Headphones className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                      <p>No recordings yet</p>
                      <p className="text-sm mt-2">Enable recording before making calls</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {recordings.map((recording) => (
                        <div
                          key={recording.id}
                          className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3">
                                <div
                                  className={`p-2 rounded-lg ${
                                    recording.status === 'completed'
                                      ? 'bg-green-100'
                                      : recording.status === 'processing'
                                        ? 'bg-yellow-100'
                                        : 'bg-red-100'
                                  }`}
                                >
                                  {recording.status === 'completed' ? (
                                    <Disc className="w-4 h-4 text-green-600" />
                                  ) : recording.status === 'processing' ? (
                                    <Circle className="w-4 h-4 text-yellow-600 animate-pulse" />
                                  ) : (
                                    <Circle className="w-4 h-4 text-red-600" />
                                  )}
                                </div>
                                <div>
                                  <p className="font-medium">{recording.phoneNumber || 'Unknown Number'}</p>
                                  <div className="flex items-center gap-4 text-sm text-gray-500">
                                    <span className="flex items-center gap-1">
                                      <Calendar className="w-3 h-3" />
                                      {new Date(recording.createdAt).toLocaleDateString()}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      {formatDuration(recording.duration)}
                                    </span>
                                    <span
                                      className={`px-2 py-0.5 rounded-full text-xs ${
                                        recording.status === 'completed'
                                          ? 'bg-green-100 text-green-700'
                                          : recording.status === 'processing'
                                            ? 'bg-yellow-100 text-yellow-700'
                                            : 'bg-red-100 text-red-700'
                                      }`}
                                    >
                                      {recording.status}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {recording.status === 'completed' && (
                                <button
                                  onClick={() => playRecording(recording)}
                                  className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                                >
                                  <Play className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                onClick={() => deleteRecording(recording.recordingSid)}
                                className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Events Tab */}
            {activeTab === 'events' && (
              <div className="h-full flex flex-col">
                <div className="flex items-center justify-between px-4 py-2 bg-white border-b">
                  <h3 className="text-sm font-semibold text-gray-700">Event Log</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEventLogs([])}
                      className="px-3 py-1 text-sm bg-gray-600 hover:bg-gray-700 text-white rounded-lg"
                    >
                      Clear
                    </button>
                    <button
                      onClick={exportEventLogs}
                      disabled={eventLogs.length === 0}
                      className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:bg-gray-300"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 font-mono text-xs">
                  {eventLogs.length === 0 ? (
                    <div className="text-center text-gray-500 mt-20 font-sans text-base">
                      <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                      <p>No events logged</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {eventLogs.map((log) => (
                        <div
                          key={log.id}
                          className={`flex items-start gap-3 p-3 rounded-lg border ${
                            log.type === 'error'
                              ? 'bg-red-50 border-red-200 text-red-700'
                              : log.type === 'client'
                                ? 'bg-blue-50 border-blue-200 text-blue-700'
                                : log.type === 'server'
                                  ? 'bg-green-50 border-green-200 text-green-700'
                                  : 'bg-gray-50 border-gray-200 text-gray-700'
                          }`}
                        >
                          <span className="text-gray-500">{log.timestamp.toLocaleTimeString()}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-semibold ${
                              log.type === 'error'
                                ? 'bg-red-200'
                                : log.type === 'client'
                                  ? 'bg-blue-200'
                                  : log.type === 'server'
                                    ? 'bg-green-200'
                                    : 'bg-gray-200'
                            }`}
                          >
                            {log.type.toUpperCase()}
                          </span>
                          <div className="flex-1">
                            <div className="font-semibold">{log.event}</div>
                            {log.data && (
                              <details className="mt-1">
                                <summary className="cursor-pointer text-xs opacity-75 hover:opacity-100">
                                  Show data
                                </summary>
                                <pre className="mt-2 text-xs opacity-75 overflow-x-auto">
                                  {JSON.stringify(log.data, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>
                        </div>
                      ))}
                      <div ref={eventLogEndRef} />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Config Tab */}
            {activeTab === 'config' && (
              <div className="h-full overflow-y-auto p-4">
                <div className="max-w-4xl mx-auto">
                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-sm font-semibold text-gray-700">Current Session Configuration</h2>
                      <button
                        onClick={() => setShowJsonConfig(!showJsonConfig)}
                        className="flex items-center gap-2 px-3 py-1 text-sm bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                      >
                        {showJsonConfig ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        {showJsonConfig ? 'Hide' : 'Show'} JSON
                      </button>
                    </div>
                    {showJsonConfig && (
                      <pre className="text-xs text-gray-700 bg-gray-50 rounded-lg p-4 overflow-x-auto">
                        {JSON.stringify(config, null, 2)}
                      </pre>
                    )}
                    {!showJsonConfig && (
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between py-2 border-b">
                          <span className="text-gray-600">Model:</span>
                          <span className="font-medium">{config.model}</span>
                        </div>
                        <div className="flex justify-between py-2 border-b">
                          <span className="text-gray-600">Voice:</span>
                          <span className="font-medium">{config.voice}</span>
                        </div>
                        <div className="flex justify-between py-2 border-b">
                          <span className="text-gray-600">VAD Mode:</span>
                          <span className="font-medium">{config.vadMode}</span>
                        </div>
                        <div className="flex justify-between py-2 border-b">
                          <span className="text-gray-600">Max Output Tokens:</span>
                          <span className="font-medium">{config.maxResponseOutputTokens}</span>
                        </div>
                        <div className="flex justify-between py-2 border-b">
                          <span className="text-gray-600">Recording Enabled:</span>
                          <span className="font-medium">{recordingEnabled ? 'Yes' : 'No'}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
