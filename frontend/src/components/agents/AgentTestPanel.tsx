import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  X,
  Bot,
  User,
  Loader2,
  AlertCircle,
  Clock,
  Zap,
  BarChart2,
  MessageSquare,
  Eye,
  EyeOff,
} from 'lucide-react';
import { agentApi } from '../../services/agentApi';
import { toast } from 'react-hot-toast';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  duration?: number;
  tokenUsage?: {
    input?: number;
    output?: number;
    total?: number;
  };
  error?: string;
}

interface AgentTestPanelProps {
  agentId: string;
  businessId: string;
  onClose: () => void;
}

const AgentTestPanel: React.FC<AgentTestPanelProps> = ({ agentId, businessId, onClose }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showMetrics, setShowMetrics] = useState(true);
  const [showRawOutput, setShowRawOutput] = useState(false);
  const [sessionId, setSessionId] = useState<string>(`test-${Date.now()}`);
  const [totalTokens, setTotalTokens] = useState(0);
  const [avgResponseTime, setAvgResponseTime] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    const startTime = Date.now();

    try {
      const response = await agentApi.runAgent(businessId, agentId, {
        message: userMessage.content,
        sessionId,
        stream: false,
      });

      const duration = Date.now() - startTime;

      const assistantMessage: Message = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: typeof response.result === 'string'
          ? response.result
          : response.result?.finalOutput || JSON.stringify(response.result),
        timestamp: new Date(),
        duration,
        tokenUsage: response.result?.usage,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Update metrics
      if (response.result?.usage?.total) {
        setTotalTokens((prev) => prev + response.result.usage.total);
      }
      setAvgResponseTime((prev) => {
        const messageCount = messages.filter((m) => m.role === 'assistant').length + 1;
        return (prev * (messageCount - 1) + duration) / messageCount;
      });
    } catch (error) {
      console.error('Agent test failed:', error);

      const errorMessage: Message = {
        id: `msg-${Date.now()}`,
        role: 'system',
        content: 'Failed to get response from agent',
        timestamp: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };

      setMessages((prev) => [...prev, errorMessage]);
      toast.error('Agent test failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const clearConversation = () => {
    setMessages([]);
    setSessionId(`test-${Date.now()}`);
    setTotalTokens(0);
    setAvgResponseTime(0);
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary-600" />
            <h3 className="font-semibold text-gray-900">Test Agent</h3>
            <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">
              Live
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Metrics */}
        {showMetrics && (
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <div className="flex items-center gap-1">
              <MessageSquare className="h-3 w-3 text-gray-400" />
              <span className="text-gray-600">Messages:</span>
              <span className="font-medium text-gray-900">{messages.length}</span>
            </div>
            <div className="flex items-center gap-1">
              <Zap className="h-3 w-3 text-gray-400" />
              <span className="text-gray-600">Tokens:</span>
              <span className="font-medium text-gray-900">{totalTokens}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-gray-400" />
              <span className="text-gray-600">Avg:</span>
              <span className="font-medium text-gray-900">
                {formatDuration(Math.round(avgResponseTime))}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
        <button
          onClick={clearConversation}
          className="px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
        >
          Clear
        </button>
        <button
          onClick={() => setShowMetrics(!showMetrics)}
          className="px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors flex items-center gap-1"
        >
          <BarChart2 className="h-3 w-3" />
          Metrics
        </button>
        <button
          onClick={() => setShowRawOutput(!showRawOutput)}
          className="px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors flex items-center gap-1"
        >
          {showRawOutput ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          Raw
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">Send a message to test the agent</p>
            <p className="text-xs mt-1 text-gray-400">Session: {sessionId}</p>
          </div>
        )}

        <AnimatePresence>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : ''}`}
            >
              {message.role !== 'user' && (
                <div className="flex-shrink-0">
                  {message.role === 'assistant' ? (
                    <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                      <Bot className="h-4 w-4 text-primary-600" />
                    </div>
                  ) : (
                    <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                      <AlertCircle className="h-4 w-4 text-orange-600" />
                    </div>
                  )}
                </div>
              )}

              <div
                className={`max-w-[80%] ${
                  message.role === 'user'
                    ? 'bg-primary-600 text-white rounded-2xl rounded-tr-sm'
                    : message.role === 'assistant'
                    ? 'bg-white border border-gray-200 rounded-2xl rounded-tl-sm'
                    : 'bg-orange-50 border border-orange-200 rounded-lg'
                } px-4 py-2 shadow-sm`}
              >
                {showRawOutput && message.role === 'assistant' ? (
                  <pre className="text-xs overflow-x-auto whitespace-pre-wrap">
                    {message.content}
                  </pre>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                )}

                {message.error && (
                  <p className="text-xs text-red-600 mt-2">Error: {message.error}</p>
                )}

                {/* Metadata */}
                <div className="mt-2 flex items-center gap-3 text-xs opacity-70">
                  <span>{message.timestamp.toLocaleTimeString()}</span>
                  {message.duration && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDuration(message.duration)}
                    </span>
                  )}
                  {message.tokenUsage && (
                    <span className="flex items-center gap-1">
                      <Zap className="h-3 w-3" />
                      {message.tokenUsage.total} tokens
                    </span>
                  )}
                </div>
              </div>

              {message.role === 'user' && (
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center">
                    <User className="h-4 w-4 text-white" />
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-3"
          >
            <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
              <Bot className="h-4 w-4 text-primary-600" />
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
              <Loader2 className="h-4 w-4 animate-spin text-primary-600" />
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-200 bg-white">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary-500"
            rows={1}
            disabled={isLoading}
          />
          <button
            onClick={handleSendMessage}
            disabled={!input.trim() || isLoading}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send
          </button>
        </div>

        {/* Quick actions */}
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => setInput('Hello, can you help me?')}
            className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
          >
            Hello
          </button>
          <button
            onClick={() => setInput('What can you do?')}
            className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
          >
            Capabilities
          </button>
          <button
            onClick={() => setInput('Show me the menu')}
            className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
          >
            Menu
          </button>
          <button
            onClick={() => setInput('I want to place an order')}
            className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
          >
            Order
          </button>
        </div>
      </div>
    </div>
  );
};

export default AgentTestPanel;