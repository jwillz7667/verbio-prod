import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX, Settings } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { api } from '../services/api';
import toast from 'react-hot-toast';

interface TranscriptionMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface CallSettings {
  voice: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
}

export const VoiceAgents: React.FC = () => {
  const { user } = useAuthStore();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isCallActive, setIsCallActive] = useState(false);
  const [transcription, setTranscription] = useState<TranscriptionMessage[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<CallSettings>({
    voice: 'alloy',
    temperature: 0.8,
    maxTokens: 4096,
    systemPrompt: 'You are a helpful AI assistant on a voice call. Be conversational, friendly, and concise.'
  });

  const ws = useRef<WebSocket | null>(null);
  const transcriptionEndRef = useRef<HTMLDivElement>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    transcriptionEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcription]);

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
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatPhoneNumber = (value: string): string => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 6) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
    return `${numbers.slice(0, 3)}-${numbers.slice(3, 6)}-${numbers.slice(6, 10)}`;
  };

  const handlePhoneNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    if (value.length <= 10) {
      setPhoneNumber(value);
    }
  };

  const initiateCall = async () => {
    if (phoneNumber.length !== 10) {
      toast.error('Please enter a valid 10-digit phone number');
      return;
    }

    setIsConnecting(true);
    try {
      // Initiate the call via API
      const response = await api.post('/api/calls/initiate', {
        phoneNumber: `+1${phoneNumber}`,
        settings,
        businessId: user?.businessId
      });

      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to initiate call');
      }

      // Connect WebSocket for real-time transcription
      const baseUrl = import.meta.env.VITE_WS_URL ||
        (window.location.protocol === 'https:'
          ? `wss://${window.location.host}`
          : `ws://${window.location.host}`);
      const wsUrl = `${baseUrl}/ws/voice-agent`;
      ws.current = new WebSocket(`${wsUrl}?callId=${response.data.callId}&businessId=${user?.businessId}`);

      ws.current.onopen = () => {
        setIsCallActive(true);
        setIsConnecting(false);
        toast.success('Call connected');
      };

      ws.current.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'transcription') {
          setTranscription(prev => [...prev, {
            role: data.role,
            content: data.content,
            timestamp: new Date(data.timestamp)
          }]);
        } else if (data.type === 'call-ended') {
          endCall();
          toast('Call ended');
        } else if (data.type === 'error') {
          toast.error(data.message);
          endCall();
        }
      };

      ws.current.onerror = () => {
        toast.error('Connection error');
        endCall();
      };

      ws.current.onclose = () => {
        setIsCallActive(false);
        setIsConnecting(false);
      };

    } catch (error) {
      setIsConnecting(false);
      toast.error('Failed to initiate call');
      console.error('Call initiation error:', error);
    }
  };

  const endCall = useCallback(() => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'end-call' }));
      ws.current.close();
    }
    setIsCallActive(false);
    setIsConnecting(false);
  }, []);

  const toggleMute = () => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      const newMuteState = !isMuted;
      ws.current.send(JSON.stringify({
        type: 'toggle-mute',
        muted: newMuteState
      }));
      setIsMuted(newMuteState);
    }
  };

  const toggleSpeaker = () => {
    setSpeakerEnabled(!speakerEnabled);
    // In a real implementation, this would control audio output
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Voice Agents</h1>
            <p className="text-gray-400 mt-2">AI-powered outbound calling with real-time conversation</p>
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel - Controls */}
          <div className="lg:col-span-1 space-y-6">
            {/* Phone Number Input */}
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <h2 className="text-lg font-semibold mb-4">Call Setup</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Phone Number
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                      +1
                    </span>
                    <input
                      type="text"
                      value={formatPhoneNumber(phoneNumber)}
                      onChange={handlePhoneNumberChange}
                      placeholder="555-555-5555"
                      disabled={isCallActive || isConnecting}
                      className="w-full pl-10 pr-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    />
                  </div>
                </div>

                <button
                  onClick={isCallActive ? endCall : initiateCall}
                  disabled={isConnecting || (!isCallActive && phoneNumber.length !== 10)}
                  className={`w-full py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors ${
                    isCallActive
                      ? 'bg-red-600 hover:bg-red-700'
                      : isConnecting
                      ? 'bg-gray-600 cursor-wait'
                      : 'bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed'
                  }`}
                >
                  {isCallActive ? (
                    <>
                      <PhoneOff className="w-5 h-5" />
                      End Call
                    </>
                  ) : isConnecting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Phone className="w-5 h-5" />
                      Start Call
                    </>
                  )}
                </button>

                {isCallActive && (
                  <div className="flex items-center justify-center gap-4 pt-2">
                    <button
                      onClick={toggleMute}
                      className={`p-3 rounded-lg transition-colors ${
                        isMuted ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'
                      }`}
                    >
                      {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                    </button>
                    <div className="text-lg font-mono">{formatDuration(callDuration)}</div>
                    <button
                      onClick={toggleSpeaker}
                      className={`p-3 rounded-lg transition-colors ${
                        !speakerEnabled ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'
                      }`}
                    >
                      {speakerEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Settings Panel */}
            {showSettings && (
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <h2 className="text-lg font-semibold mb-4">Voice Settings</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Voice Model
                    </label>
                    <select
                      value={settings.voice}
                      onChange={(e) => setSettings({...settings, voice: e.target.value})}
                      disabled={isCallActive}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    >
                      <option value="alloy">Alloy</option>
                      <option value="echo">Echo</option>
                      <option value="fable">Fable</option>
                      <option value="onyx">Onyx</option>
                      <option value="nova">Nova</option>
                      <option value="shimmer">Shimmer</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Temperature: {settings.temperature}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={settings.temperature}
                      onChange={(e) => setSettings({...settings, temperature: parseFloat(e.target.value)})}
                      disabled={isCallActive}
                      className="w-full disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      System Prompt
                    </label>
                    <textarea
                      value={settings.systemPrompt}
                      onChange={(e) => setSettings({...settings, systemPrompt: e.target.value})}
                      disabled={isCallActive}
                      rows={4}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 resize-none"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Panel - Transcription */}
          <div className="lg:col-span-2">
            <div className="bg-gray-800 rounded-xl border border-gray-700 h-[600px] flex flex-col">
              <div className="px-6 py-4 border-b border-gray-700">
                <h2 className="text-lg font-semibold">Live Transcription</h2>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {transcription.length === 0 ? (
                  <div className="text-center text-gray-500 mt-20">
                    <Phone className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No conversation yet</p>
                    <p className="text-sm mt-2">Start a call to see real-time transcription</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {transcription.map((message, index) => (
                      <div
                        key={index}
                        className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg px-4 py-2 ${
                            message.role === 'user'
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-700 text-gray-100'
                          }`}
                        >
                          <div className="text-xs opacity-75 mb-1">
                            {message.role === 'user' ? 'Caller' : 'Assistant'}
                          </div>
                          <div>{message.content}</div>
                          <div className="text-xs opacity-50 mt-1">
                            {new Date(message.timestamp).toLocaleTimeString()}
                          </div>
                        </div>
                      </div>
                    ))}
                    <div ref={transcriptionEndRef} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};