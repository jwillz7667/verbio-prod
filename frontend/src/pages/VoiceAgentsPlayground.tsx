import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX, Settings,
  Play, Square, MessageSquare, Zap, FileText, ChevronDown,
  CheckCircle, Loader2, Download
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
    type: 'server_vad' | 'none';
    serverVad?: {
      threshold: number;
      prefixPaddingMs: number;
      silenceDurationMs: number;
    };
  };
  tools: Array<{
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

type TabType = 'session' | 'transcription' | 'events' | 'functions';

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

  // UI state
  const [activeTab, setActiveTab] = useState<TabType>('session');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Data state
  const [transcription, setTranscription] = useState<TranscriptionEntry[]>([]);
  const [eventLogs, setEventLogs] = useState<EventLog[]>([]);
  const [sessionActive, setSessionActive] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');

  // Configuration
  const [config, setConfig] = useState<SessionConfig>({
    model: 'gpt-4o-realtime-preview-2024-12-17',
    voice: 'alloy',
    instructions: `You are a helpful AI assistant on a voice call. Be conversational, friendly, and concise.

Your knowledge cutoff is 2023-10. You are helpful, witty, and friendly. Act like a human, but remember that you aren't a human and that you can't do human things in the real world. Your voice and personality should be warm and engaging, with a lively and playful tone. If interacting in a non-English language, start by using the standard accent or dialect familiar to the user.`,
    inputAudioTranscription: {
      enabled: true,
      model: 'whisper-1'
    },
    turnDetection: {
      type: 'server_vad',
      serverVad: {
        threshold: 0.5,
        prefixPaddingMs: 300,
        silenceDurationMs: 500
      }
    },
    tools: [],
    temperature: 0.8,
    maxResponseOutputTokens: 4096,
    vadMode: 'server_vad',
    modalities: ['text', 'audio'],
    audioFormat: 'pcm16'
  });

  // Refs
  const ws = useRef<WebSocket | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  // const audioContext = useRef<AudioContext | null>(null);
  const transcriptionEndRef = useRef<HTMLDivElement>(null);
  const eventLogEndRef = useRef<HTMLDivElement>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  // Call timer
  useEffect(() => {
    if (isCallActive) {
      callTimerRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
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
      data
    };
    setEventLogs(prev => [...prev, newEvent]);
  };

  const connectSession = async () => {
    setConnectionStatus('connecting');
    addEventLog('info', 'Initiating session connection', { config });

    try {
      const baseUrl = import.meta.env.VITE_WS_URL ||
        (window.location.protocol === 'https:'
          ? `wss://${window.location.host}`
          : `ws://${window.location.host}`);
      const wsUrl = `${baseUrl}/ws/realtime`;
      const queryParams = new URLSearchParams({
        businessId: user?.businessId || '',
        model: config.model,
        voice: config.voice
      });

      ws.current = new WebSocket(`${wsUrl}?${queryParams}`);

      ws.current.onopen = () => {
        setConnectionStatus('connected');
        setSessionActive(true);
        addEventLog('info', 'WebSocket connected');

        // Send session configuration
        ws.current?.send(JSON.stringify({
          type: 'session.update',
          session: {
            ...config,
            tools: config.tools.length > 0 ? config.tools : undefined
          }
        }));
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
                duration: data.item.content[0]?.duration
              };
              setTranscription(prev => [...prev, entry]);
            }
            break;

          case 'response.audio_transcript.delta':
            // Update last assistant message with streaming transcript
            setTranscription(prev => {
              const newTrans = [...prev];
              const lastIndex = newTrans.findLastIndex((t: TranscriptionEntry) => t.role === 'assistant');
              if (lastIndex >= 0) {
                newTrans[lastIndex] = {
                  ...newTrans[lastIndex],
                  content: newTrans[lastIndex].content + data.delta
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
    addEventLog('info', 'Initiating outbound call', { phoneNumber: `+1${phoneNumber}` });

    try {
      // First connect the session if not connected
      if (!sessionActive) {
        await connectSession();
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for session
      }

      // Initiate the call
      const response = await api.post('/api/calls/outbound', {
        phoneNumber: `+1${phoneNumber}`,
        config,
        businessId: user?.businessId
      });

      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to initiate call');
      }

      setIsCallActive(true);
      setIsConnecting(false);
      addEventLog('info', 'Call connected', response.data);
      toast.success('Call connected');

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
            ws.current?.send(JSON.stringify({
              type: 'input_audio_buffer.append',
              audio: base64
            }));
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
      mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
      mediaRecorder.current = null;
    }
    setIsRecording(false);
    addEventLog('info', 'Stopped recording');
  };

  const toggleMute = () => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      const newMuteState = !isMuted;
      ws.current.send(JSON.stringify({
        type: 'input_audio_buffer.clear'
      }));
      setIsMuted(newMuteState);
      addEventLog('info', newMuteState ? 'Muted' : 'Unmuted');
    }
  };

  const exportTranscription = () => {
    const content = transcription.map(entry =>
      `[${entry.timestamp.toLocaleTimeString()}] ${entry.role.toUpperCase()}: ${entry.content}`
    ).join('\n\n');

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
    <div className="min-h-screen bg-gray-50">
      <div className="flex h-screen">
        {/* Left Panel - Configuration */}
        <div className="w-[400px] bg-white border-r border-gray-200 flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200">
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Phone className="w-6 h-6 text-primary-500" />
              Voice Agents
            </h1>
            <p className="text-sm text-gray-600 mt-1">Test your AI voice agents with real calls</p>
          </div>

          {/* Connection Status */}
          <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  connectionStatus === 'connected' ? 'bg-green-500' :
                  connectionStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' :
                  connectionStatus === 'error' ? 'bg-red-500' :
                  'bg-gray-500'
                }`} />
                <span className="text-sm">
                  {connectionStatus === 'connected' ? 'Connected' :
                   connectionStatus === 'connecting' ? 'Connecting...' :
                   connectionStatus === 'error' ? 'Error' :
                   'Disconnected'}
                </span>
              </div>
              {!sessionActive ? (
                <button
                  onClick={connectSession}
                  disabled={connectionStatus === 'connecting'}
                  className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  Connect
                </button>
              ) : (
                <button
                  onClick={disconnectSession}
                  className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                >
                  Disconnect
                </button>
              )}
            </div>
          </div>

          {/* Configuration Form */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            {/* Outbound Call Section */}
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Outbound Call</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone Number
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-sm">
                      +1
                    </span>
                    <input
                      type="text"
                      value={formatPhoneNumber(phoneNumber)}
                      onChange={handlePhoneNumberChange}
                      placeholder="(555) 555-5555"
                      disabled={isCallActive || isConnecting}
                      className="w-full pl-10 pr-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
                    />
                  </div>
                  <button
                    onClick={isCallActive ? endCall : initiateCall}
                    disabled={isConnecting || (!isCallActive && phoneNumber.length !== 10)}
                    className={`px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors ${
                      isCallActive
                        ? 'bg-red-600 hover:bg-red-700'
                        : isConnecting
                        ? 'bg-gray-600 cursor-wait'
                        : 'bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed'
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
                {isCallActive && (
                  <div className="mt-2 flex items-center gap-4">
                    <span className="text-sm text-gray-600">Duration: {formatDuration(callDuration)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Model Configuration */}
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Model</h2>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Model
                </label>
                <select
                  value={config.model}
                  onChange={(e) => setConfig({...config, model: e.target.value})}
                  disabled={sessionActive}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
                >
                  <option value="gpt-4o-realtime-preview-2024-12-17">gpt-4o-realtime-preview-2024-12-17</option>
                  <option value="gpt-4o-realtime-preview">gpt-4o-realtime-preview</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Voice
                </label>
                <select
                  value={config.voice}
                  onChange={(e) => setConfig({...config, voice: e.target.value})}
                  disabled={sessionActive}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
                >
                  <option value="alloy">Alloy</option>
                  <option value="echo">Echo</option>
                  <option value="fable">Fable</option>
                  <option value="onyx">Onyx</option>
                  <option value="nova">Nova</option>
                  <option value="shimmer">Shimmer</option>
                </select>
              </div>
            </div>

            {/* Instructions */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Instructions
              </label>
              <textarea
                value={config.instructions}
                onChange={(e) => setConfig({...config, instructions: e.target.value})}
                disabled={sessionActive}
                rows={6}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 resize-none font-mono"
              />
            </div>

            {/* Advanced Settings */}
            <div>
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-600 transition-colors"
              >
                <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                Advanced Settings
              </button>

              {showAdvanced && (
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Temperature: {config.temperature}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.1"
                      value={config.temperature}
                      onChange={(e) => setConfig({...config, temperature: parseFloat(e.target.value)})}
                      disabled={sessionActive}
                      className="w-full disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Max Output Tokens
                    </label>
                    <input
                      type="number"
                      value={config.maxResponseOutputTokens === 'inf' ? '' : config.maxResponseOutputTokens}
                      onChange={(e) => setConfig({...config, maxResponseOutputTokens: e.target.value ? parseInt(e.target.value) : 'inf'})}
                      placeholder="Infinite"
                      disabled={sessionActive}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      VAD Mode
                    </label>
                    <select
                      value={config.vadMode}
                      onChange={(e) => setConfig({...config, vadMode: e.target.value as 'server_vad' | 'disabled'})}
                      disabled={sessionActive}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
                    >
                      <option value="server_vad">Server VAD</option>
                      <option value="disabled">Disabled</option>
                    </select>
                  </div>

                  {config.vadMode === 'server_vad' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          VAD Threshold: {config.turnDetection.serverVad?.threshold}
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.1"
                          value={config.turnDetection.serverVad?.threshold || 0.5}
                          onChange={(e) => setConfig({
                            ...config,
                            turnDetection: {
                              ...config.turnDetection,
                              serverVad: {
                                ...config.turnDetection.serverVad!,
                                threshold: parseFloat(e.target.value)
                              }
                            }
                          })}
                          disabled={sessionActive}
                          className="w-full disabled:opacity-50"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Silence Duration (ms)
                        </label>
                        <input
                          type="number"
                          value={config.turnDetection.serverVad?.silenceDurationMs || 500}
                          onChange={(e) => setConfig({
                            ...config,
                            turnDetection: {
                              ...config.turnDetection,
                              serverVad: {
                                ...config.turnDetection.serverVad!,
                                silenceDurationMs: parseInt(e.target.value)
                              }
                            }
                          })}
                          disabled={sessionActive}
                          className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Prefix Padding (ms)
                        </label>
                        <input
                          type="number"
                          value={config.turnDetection.serverVad?.prefixPaddingMs || 300}
                          onChange={(e) => setConfig({
                            ...config,
                            turnDetection: {
                              ...config.turnDetection,
                              serverVad: {
                                ...config.turnDetection.serverVad!,
                                prefixPaddingMs: parseInt(e.target.value)
                              }
                            }
                          })}
                          disabled={sessionActive}
                          className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
                        />
                      </div>
                    </>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Audio Format
                    </label>
                    <select
                      value={config.audioFormat}
                      onChange={(e) => setConfig({...config, audioFormat: e.target.value as 'pcm16' | 'g711_ulaw' | 'g711_alaw'})}
                      disabled={sessionActive}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
                    >
                      <option value="pcm16">PCM16</option>
                      <option value="g711_ulaw">G.711 μ-law</option>
                      <option value="g711_alaw">G.711 A-law</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="transcription-enabled"
                      checked={config.inputAudioTranscription.enabled}
                      onChange={(e) => setConfig({
                        ...config,
                        inputAudioTranscription: {
                          ...config.inputAudioTranscription,
                          enabled: e.target.checked
                        }
                      })}
                      disabled={sessionActive}
                      className="w-4 h-4 bg-white border-gray-300 rounded focus:ring-2 focus:ring-primary-500"
                    />
                    <label htmlFor="transcription-enabled" className="text-sm text-gray-700">
                      Enable Input Audio Transcription
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Audio Controls */}
          {(sessionActive || isCallActive) && (
            <div className="px-6 py-4 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    className={`p-2 rounded-lg transition-colors ${
                      isRecording ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                  >
                    {isRecording ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={toggleMute}
                    className={`p-2 rounded-lg transition-colors ${
                      isMuted ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                  >
                    {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => setSpeakerEnabled(!speakerEnabled)}
                    className={`p-2 rounded-lg transition-colors ${
                      !speakerEnabled ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                  >
                    {speakerEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                  </button>
                </div>
                <span className="text-xs text-gray-600">
                  {isRecording ? 'Recording...' : 'Ready'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - Content Area */}
        <div className="flex-1 flex flex-col">
          {/* Tab Navigation */}
          <div className="bg-white border-b border-gray-200">
            <div className="flex items-center gap-1 px-4 py-2">
              <button
                onClick={() => setActiveTab('session')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'session'
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-600 hover:text-white hover:bg-gray-800/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  Session
                </div>
              </button>
              <button
                onClick={() => setActiveTab('transcription')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'transcription'
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-600 hover:text-white hover:bg-gray-800/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Transcription
                  {transcription.length > 0 && (
                    <span className="px-1.5 py-0.5 bg-blue-600 rounded-full text-xs">
                      {transcription.length}
                    </span>
                  )}
                </div>
              </button>
              <button
                onClick={() => setActiveTab('events')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'events'
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-600 hover:text-white hover:bg-gray-800/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Events
                  {eventLogs.length > 0 && (
                    <span className="px-1.5 py-0.5 bg-blue-600 rounded-full text-xs">
                      {eventLogs.length}
                    </span>
                  )}
                </div>
              </button>
              <button
                onClick={() => setActiveTab('functions')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'functions'
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-600 hover:text-white hover:bg-gray-800/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  Functions
                </div>
              </button>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-hidden bg-gray-50">
            {/* Session Tab */}
            {activeTab === 'session' && (
              <div className="h-full overflow-y-auto p-6">
                <div className="max-w-4xl mx-auto space-y-6">
                  <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold mb-4">Current Session Configuration</h2>
                    <pre className="text-sm text-gray-700 bg-gray-50 rounded-lg p-4 overflow-x-auto">
                      {JSON.stringify(config, null, 2)}
                    </pre>
                  </div>

                  {sessionActive && (
                    <div className="bg-white rounded-lg border border-gray-200 p-6">
                      <h2 className="text-lg font-semibold mb-4">Session Status</h2>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-green-500" />
                          <span>Session active</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-600">Model:</span>
                          <span>{config.model}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-600">Voice:</span>
                          <span>{config.voice}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Transcription Tab */}
            {activeTab === 'transcription' && (
              <div className="h-full flex flex-col">
                <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200">
                  <h2 className="text-sm font-semibold">Live Transcription</h2>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setTranscription([])}
                      className="px-3 py-1 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      Clear
                    </button>
                    <button
                      onClick={exportTranscription}
                      disabled={transcription.length === 0}
                      className="px-3 py-1 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                  {transcription.length === 0 ? (
                    <div className="text-center text-gray-600 mt-20">
                      <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No transcription yet</p>
                      <p className="text-sm mt-2">Start a session to see real-time transcription</p>
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
                                ? 'bg-gray-800 text-gray-700'
                                : 'bg-gray-800 text-gray-900'
                            }`}
                          >
                            <div className="text-xs opacity-75 mb-1 flex items-center gap-2">
                              {entry.role === 'user' ? 'User' : entry.role === 'assistant' ? 'Assistant' : 'System'}
                              {entry.duration && (
                                <span className="text-xs">({entry.duration.toFixed(1)}s)</span>
                              )}
                            </div>
                            <div className="whitespace-pre-wrap">{entry.content}</div>
                            <div className="text-xs opacity-50 mt-1">
                              {entry.timestamp.toLocaleTimeString()}
                            </div>
                          </div>
                        </div>
                      ))}
                      <div ref={transcriptionEndRef} />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Events Tab */}
            {activeTab === 'events' && (
              <div className="h-full flex flex-col">
                <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200">
                  <h2 className="text-sm font-semibold">Event Log</h2>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEventLogs([])}
                      className="px-3 py-1 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      Clear
                    </button>
                    <button
                      onClick={exportEventLogs}
                      disabled={eventLogs.length === 0}
                      className="px-3 py-1 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 font-mono text-xs">
                  {eventLogs.length === 0 ? (
                    <div className="text-center text-gray-600 mt-20 font-sans text-base">
                      <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No events logged</p>
                      <p className="text-sm mt-2">Events will appear here when you interact with the system</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {eventLogs.map((log) => (
                        <div
                          key={log.id}
                          className={`flex items-start gap-3 p-3 rounded-lg border ${
                            log.type === 'error'
                              ? 'bg-red-950/50 border-red-900/50 text-red-400'
                              : log.type === 'client'
                              ? 'bg-blue-950/50 border-blue-900/50 text-blue-400'
                              : log.type === 'server'
                              ? 'bg-green-50 border-green-200 text-green-700'
                              : 'bg-white/50 border-gray-200 text-gray-600'
                          }`}
                        >
                          <span className="text-gray-600">
                            {log.timestamp.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            log.type === 'error' ? 'bg-red-900/50' :
                            log.type === 'client' ? 'bg-blue-900/50' :
                            log.type === 'server' ? 'bg-green-900/50' :
                            'bg-gray-800'
                          }`}>
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

            {/* Functions Tab */}
            {activeTab === 'functions' && (
              <div className="h-full overflow-y-auto p-6">
                <div className="max-w-4xl mx-auto space-y-6">
                  <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold mb-4">Available Functions</h2>
                    {config.tools.length === 0 ? (
                      <p className="text-gray-600 text-sm">No functions configured. Add functions in the configuration panel.</p>
                    ) : (
                      <div className="space-y-4">
                        {config.tools.map((tool, index) => (
                          <div key={index} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                            <h3 className="font-medium mb-2">{tool.name}</h3>
                            <p className="text-sm text-gray-600 mb-2">{tool.description}</p>
                            <pre className="text-xs text-gray-600 bg-white rounded p-2 overflow-x-auto">
                              {JSON.stringify(tool.parameters, null, 2)}
                            </pre>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold mb-4">Add Function</h2>
                    <button
                      disabled={sessionActive}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Configure Function Tools
                    </button>
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