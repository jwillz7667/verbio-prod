import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Phone, Bot, Settings, TrendingUp, AlertCircle, CheckCircle } from 'lucide-react';
import { VoiceAgentsPlayground } from './VoiceAgentsPlayground';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

const VoiceAgentsDashboard: React.FC = () => {
  const [showPlayground, setShowPlayground] = useState(false);

  // Fetch agent metrics
  const { data: agentMetrics } = useQuery({
    queryKey: ['voice-agent-metrics'],
    queryFn: async () => {
      try {
        const response = await api.get('/api/analytics/voice-agents');
        return response.data;
      } catch {
        return {
          totalAgents: 3,
          activeAgents: 2,
          totalCalls: 1247,
          todayCalls: 42,
          avgCallDuration: 185,
          successRate: 94.2,
        };
      }
    },
    refetchInterval: 30000,
  });

  const metrics = agentMetrics || {
    totalAgents: 0,
    activeAgents: 0,
    totalCalls: 0,
    todayCalls: 0,
    avgCallDuration: 0,
    successRate: 0,
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  if (showPlayground) {
    return (
      <div>
        <div className="mb-4">
          <button
            onClick={() => setShowPlayground(false)}
            className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1"
          >
            ← Back to Overview
          </button>
        </div>
        <VoiceAgentsPlayground />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Voice Agents</h1>
          <p className="text-gray-600 mt-1">Manage and test your AI voice agents</p>
        </div>
        <button
          onClick={() => setShowPlayground(true)}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-2"
        >
          <Phone className="w-4 h-4" />
          Open Playground
        </button>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg shadow-sm p-6 border border-gray-200"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Agents</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{metrics.totalAgents}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <Bot className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-lg shadow-sm p-6 border border-gray-200"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Agents</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{metrics.activeAgents}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-lg">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-lg shadow-sm p-6 border border-gray-200"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Calls Today</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{metrics.todayCalls}</p>
              <p className="text-xs text-gray-500 mt-1">Total: {metrics.totalCalls}</p>
            </div>
            <div className="p-3 bg-purple-100 rounded-lg">
              <Phone className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-lg shadow-sm p-6 border border-gray-200"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Success Rate</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{metrics.successRate}%</p>
              <p className="text-xs text-gray-500 mt-1">Avg: {formatDuration(metrics.avgCallDuration)}</p>
            </div>
            <div className="p-3 bg-amber-100 rounded-lg">
              <TrendingUp className="w-6 h-6 text-amber-600" />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
          <div className="space-y-3">
            <button
              onClick={() => setShowPlayground(true)}
              className="w-full px-4 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg text-left flex items-center gap-3 transition-colors"
            >
              <Phone className="w-5 h-5 text-gray-600" />
              <span className="text-sm font-medium">Test Voice Call</span>
            </button>
            <button className="w-full px-4 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg text-left flex items-center gap-3 transition-colors">
              <Bot className="w-5 h-5 text-gray-600" />
              <span className="text-sm font-medium">Configure Agents</span>
            </button>
            <button className="w-full px-4 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg text-left flex items-center gap-3 transition-colors">
              <Settings className="w-5 h-5 text-gray-600" />
              <span className="text-sm font-medium">Voice Settings</span>
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <h3 className="text-lg font-semibold mb-4">Recent Calls</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <div>
                  <p className="text-sm font-medium">+1 (555) 123-4567</p>
                  <p className="text-xs text-gray-500">Order inquiry - 3m 42s</p>
                </div>
              </div>
              <span className="text-xs text-gray-500">5 min ago</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <div>
                  <p className="text-sm font-medium">+1 (555) 987-6543</p>
                  <p className="text-xs text-gray-500">Support request - 2m 18s</p>
                </div>
              </div>
              <span className="text-xs text-gray-500">12 min ago</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                <div>
                  <p className="text-sm font-medium">+1 (555) 456-7890</p>
                  <p className="text-xs text-gray-500">Payment issue - 1m 05s</p>
                </div>
              </div>
              <span className="text-xs text-gray-500">25 min ago</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <h3 className="text-lg font-semibold mb-4">Agent Performance</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Order Assistant</span>
              <span className="text-sm font-medium text-green-600">98% success</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-green-600 h-2 rounded-full" style={{ width: '98%' }}></div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Support Agent</span>
              <span className="text-sm font-medium text-blue-600">92% success</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-blue-600 h-2 rounded-full" style={{ width: '92%' }}></div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Payment Helper</span>
              <span className="text-sm font-medium text-amber-600">87% success</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-amber-600 h-2 rounded-full" style={{ width: '87%' }}></div>
            </div>
          </div>
        </div>
      </div>

      {/* Alert Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-blue-900">OpenAI Realtime API is now available!</p>
          <p className="text-xs text-blue-700 mt-1">
            Test your voice agents with the new real-time streaming capabilities in the playground.
          </p>
        </div>
        <button
          onClick={() => setShowPlayground(true)}
          className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
        >
          Try Now
        </button>
      </div>
    </div>
  );
};

export default VoiceAgentsDashboard;
