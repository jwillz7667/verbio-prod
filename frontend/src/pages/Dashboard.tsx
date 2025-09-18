import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  PlusIcon,
  TrashIcon,
  PencilIcon,
  PhoneIcon,
  CloudArrowUpIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  CpuChipIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import type { Agent, AgentType, Business, BusinessData } from '../types';

const Dashboard: React.FC = () => {
  const [business, setBusiness] = useState<Business | null>(null);
  const [dataJson, setDataJson] = useState<BusinessData>({});
  const [agents, setAgents] = useState<Agent[]>([]);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [newAgent, setNewAgent] = useState<{
    name: string;
    type: AgentType;
    prompt: string;
    voice: string;
  }>({
    name: '',
    type: 'service',
    prompt: '',
    voice: 'cedar',
  });

  useEffect(() => {
    fetchBusinessData();
  }, []);

  const fetchBusinessData = async () => {
    try {
      setIsLoading(true);
      const [, businessRes, agentsRes] = await Promise.all([
        api.getProfile(),
        api.getBusiness().catch(() => null),
        api.getAgents().catch(() => ({ agents: [] })),
      ]);

      if (businessRes) {
        setBusiness(businessRes.business);
        setDataJson(businessRes.business.data_json || {
          menu: [],
          hours: {},
          pricing: {},
          services: [],
        });
        setPhoneNumber(businessRes.business.phone_number || '');
      }

      if (agentsRes?.agents) {
        setAgents(agentsRes.agents);
      }
    } catch (error) {
      console.error('Error fetching business data:', error);
      toast.error('Failed to load business data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateData = async () => {
    if (!business?.id) {
      toast.error('Business not found');
      return;
    }

    try {
      setIsSaving(true);
      await api.uploadBusinessData({
        businessId: business.id,
        data: dataJson,
      });
      toast.success('Business data updated successfully');
      fetchBusinessData();
    } catch (error: any) {
      console.error('Error updating data:', error);
      toast.error(error.response?.data?.message || 'Failed to update business data');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddPhone = async () => {
    if (!phoneNumber || !phoneNumber.match(/^\+?1?\d{10,14}$/)) {
      toast.error('Please enter a valid phone number');
      return;
    }

    if (!business?.id) {
      toast.error('Business not found');
      return;
    }

    try {
      await api.mapPhoneNumber(phoneNumber);
      toast.success('Phone number mapped successfully');
      fetchBusinessData();
    } catch (error: any) {
      console.error('Error mapping phone:', error);
      toast.error(error.response?.data?.message || 'Failed to map phone number');
    }
  };

  const handleUpdateAgent = async (agentId: string, updates: Partial<Agent>) => {
    try {
      await api.updateAgent(agentId, updates);
      toast.success('Agent updated successfully');
      setEditingAgentId(null);
      fetchBusinessData();
    } catch (error: any) {
      console.error('Error updating agent:', error);
      toast.error(error.response?.data?.message || 'Failed to update agent');
    }
  };

  const handleCreateAgent = async () => {
    if (!newAgent.name || !newAgent.prompt) {
      toast.error('Please fill in agent name and prompt');
      return;
    }

    if (!business?.id) {
      toast.error('Business not found');
      return;
    }

    try {
      await api.createAgent({
        business_id: business.id,
        name: newAgent.name,
        type: newAgent.type,
        prompt: newAgent.prompt,
        voice_config: {
          voice: newAgent.voice,
          eagerness: 'medium',
          noise_reduction: 'auto',
        },
        is_active: true,
      });
      toast.success('Agent created successfully');
      setNewAgent({ name: '', type: 'service', prompt: '', voice: 'cedar' });
      fetchBusinessData();
    } catch (error: any) {
      console.error('Error creating agent:', error);
      toast.error(error.response?.data?.message || 'Failed to create agent');
    }
  };

  const handleDeleteAgent = async (agentId: string) => {
    if (!confirm('Are you sure you want to delete this agent?')) {
      return;
    }

    try {
      await api.deleteAgent(agentId);
      toast.success('Agent deleted successfully');
      fetchBusinessData();
    } catch (error: any) {
      console.error('Error deleting agent:', error);
      toast.error(error.response?.data?.message || 'Failed to delete agent');
    }
  };

  const agentTypeColors = {
    service: 'bg-blue-100 text-blue-700',
    order: 'bg-green-100 text-green-700',
    payment: 'bg-purple-100 text-purple-700',
  };

  const voiceOptions = [
    'alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse', 'cedar', 'marin'
  ];

  if (isLoading) {
    return <LoadingSpinner fullScreen message="Loading business data..." />;
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your business data, phone numbers, and AI agents
          </p>
        </div>
        <div className="flex items-center gap-4">
          {business?.phone_number && (
            <div className="flex items-center gap-2 px-4 py-2 bg-green-50 rounded-lg">
              <PhoneIcon className="h-5 w-5 text-green-600" />
              <span className="text-sm font-medium text-green-900">
                {business.phone_number}
              </span>
            </div>
          )}
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-lg shadow p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Business Data</h2>
            <button
              onClick={handleUpdateData}
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <CloudArrowUpIcon className="h-4 w-4" />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>

          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 max-h-96 overflow-auto">
            <pre className="text-sm font-mono">
              <code>{JSON.stringify(dataJson, null, 2)}</code>
            </pre>
          </div>

          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-700">
              💡 Tip: Click on values to edit them directly. Use the + icon to add new fields.
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-lg shadow p-6"
        >
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Phone Number</h2>

          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddPhone()}
                placeholder="+1234567890"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
              <button
                onClick={handleAddPhone}
                className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
              >
                Map Number
              </button>
            </div>

            {business?.phone_number ? (
              <div className="p-4 bg-green-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircleIcon className="h-5 w-5 text-green-600" />
                  <span className="text-sm font-medium text-green-900">
                    Phone number mapped successfully
                  </span>
                </div>
                <p className="mt-1 text-sm text-green-700">
                  Incoming calls to {business.phone_number} will be handled by your AI agents
                </p>
              </div>
            ) : (
              <div className="p-4 bg-yellow-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <ExclamationCircleIcon className="h-5 w-5 text-yellow-600" />
                  <span className="text-sm font-medium text-yellow-900">
                    No phone number mapped
                  </span>
                </div>
                <p className="mt-1 text-sm text-yellow-700">
                  Map a Twilio phone number to start receiving calls
                </p>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white rounded-lg shadow p-6"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">AI Agents</h2>
          <div className="flex items-center gap-2">
            <CpuChipIcon className="h-5 w-5 text-violet-600" />
            <span className="text-sm text-gray-600">
              {agents.length} {agents.length === 1 ? 'Agent' : 'Agents'}
            </span>
          </div>
        </div>

        <div className="space-y-4">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              {editingAgentId === agent.id ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={agent.name}
                    onChange={(e) => {
                      const updated = agents.map((a) =>
                        a.id === agent.id ? { ...a, name: e.target.value } : a
                      );
                      setAgents(updated);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                  <textarea
                    value={agent.prompt}
                    onChange={(e) => {
                      const updated = agents.map((a) =>
                        a.id === agent.id ? { ...a, prompt: e.target.value } : a
                      );
                      setAgents(updated);
                    }}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                  <select
                    value={agent.voice_config.voice}
                    onChange={(e) => {
                      const updated = agents.map((a) =>
                        a.id === agent.id
                          ? { ...a, voice_config: { ...a.voice_config, voice: e.target.value } }
                          : a
                      );
                      setAgents(updated);
                    }}
                    className="px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    {voiceOptions.map((voice) => (
                      <option key={voice} value={voice}>
                        {voice}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        handleUpdateAgent(agent.id, {
                          name: agent.name,
                          prompt: agent.prompt,
                          voice_config: agent.voice_config,
                        })
                      }
                      className="px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setEditingAgentId(null);
                        fetchBusinessData();
                      }}
                      className="px-3 py-1 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-medium text-gray-900">{agent.name}</h3>
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${
                          agentTypeColors[agent.type]
                        }`}
                      >
                        {agent.type}
                      </span>
                      <span className="text-xs text-gray-500">
                        Voice: {agent.voice_config.voice}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-gray-600 line-clamp-2">{agent.prompt}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => setEditingAgentId(agent.id)}
                      className="p-1 text-gray-500 hover:text-violet-600 transition-colors"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteAgent(agent.id)}
                      className="p-1 text-gray-500 hover:text-red-600 transition-colors"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
            <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
              <SparklesIcon className="h-5 w-5 text-violet-600" />
              Create New Agent
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                type="text"
                value={newAgent.name}
                onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })}
                placeholder="Agent Name"
                className="px-3 py-2 border border-gray-300 rounded-lg"
              />
              <select
                value={newAgent.type}
                onChange={(e) =>
                  setNewAgent({
                    ...newAgent,
                    type: e.target.value as AgentType,
                  })
                }
                className="px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="service">Service</option>
                <option value="order">Order</option>
                <option value="payment">Payment</option>
              </select>
              <select
                value={newAgent.voice}
                onChange={(e) => setNewAgent({ ...newAgent, voice: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-lg"
              >
                {voiceOptions.map((voice) => (
                  <option key={voice} value={voice}>
                    Voice: {voice}
                  </option>
                ))}
              </select>
              <div></div>
              <textarea
                value={newAgent.prompt}
                onChange={(e) => setNewAgent({ ...newAgent, prompt: e.target.value })}
                placeholder="Agent prompt instructions..."
                rows={3}
                className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg"
              />
              <button
                onClick={handleCreateAgent}
                className="col-span-2 inline-flex items-center justify-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
              >
                <PlusIcon className="h-4 w-4" />
                Create Agent
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default Dashboard;