import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  Phone,
  Plus,
  Edit2,
  Trash2,
  Settings,
  Volume2,
  Activity,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  PhoneCall,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import clsx from 'clsx';

interface Agent {
  id: string;
  name: string;
  type: 'service' | 'order' | 'payment';
  prompt: string;
  voice_config: {
    voice: string;
    temperature: number;
    speed: number;
    pitch: number;
  };
  is_active: boolean;
  phone_mappings?: Array<{
    id: string;
    twilio_number: string;
    is_active: boolean;
  }>;
  created_at: string;
  updated_at: string;
}


const Agents: React.FC = () => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [isPhoneMappingOpen, setIsPhoneMappingOpen] = useState(false);

  // Fetch agents
  const { data: agentsData, isLoading: agentsLoading } = useQuery({
    queryKey: ['agents', user?.businessId],
    queryFn: async () => {
      const response = await api.getAxiosInstance().get(`/api/business/${user?.businessId}/agents`);
      return response.data;
    },
    enabled: !!user?.businessId,
  });

  // Fetch phone mappings
  const { data: phonesData } = useQuery({
    queryKey: ['phone-mappings', user?.businessId],
    queryFn: async () => {
      const response = await api.getAxiosInstance().get(`/api/business/${user?.businessId}/phones`);
      return response.data;
    },
    enabled: !!user?.businessId,
  });

  // Create agent mutation
  const createAgentMutation = useMutation({
    mutationFn: async (data: Partial<Agent>) => {
      const response = await api.getAxiosInstance().post(
        `/api/business/${user?.businessId}/agent`,
        data
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast.success('Agent created successfully');
      setIsCreateModalOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to create agent');
    },
  });

  // Update agent mutation
  const updateAgentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Agent> }) => {
      const response = await api.getAxiosInstance().put(
        `/api/business/${user?.businessId}/agent/${id}`,
        data
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast.success('Agent updated successfully');
      setEditingAgent(null);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to update agent');
    },
  });

  // Delete agent mutation
  const deleteAgentMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.getAxiosInstance().delete(
        `/api/business/${user?.businessId}/agent/${id}`
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast.success('Agent deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to delete agent');
    },
  });

  // Add phone mapping mutation
  const addPhoneMutation = useMutation({
    mutationFn: async (data: { twilio_number: string; agent_id: string }) => {
      const response = await api.getAxiosInstance().post(
        `/api/business/${user?.businessId}/phone`,
        data
      );
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['phone-mappings'] });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast.success('Phone number mapped successfully');
      if (data.webhookUrl) {
        toast.success(`Configure webhook: ${data.webhookUrl}`, { duration: 8000 });
      }
      setIsPhoneMappingOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to map phone number');
    },
  });

  // Remove phone mapping mutation
  const removePhoneMutation = useMutation({
    mutationFn: async (phoneId: string) => {
      const response = await api.getAxiosInstance().delete(
        `/api/business/${user?.businessId}/phone/${phoneId}`
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phone-mappings'] });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast.success('Phone mapping removed');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to remove phone mapping');
    },
  });

  const agents = agentsData?.agents || [];
  const phoneMappings = phonesData?.phone_mappings || [];

  const getAgentTypeColor = (type: string) => {
    switch (type) {
      case 'service':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'order':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'payment':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getVoiceLabel = (voice: string) => {
    const voices: Record<string, string> = {
      alloy: 'Alloy (Neutral)',
      echo: 'Echo (Male)',
      fable: 'Fable (British)',
      onyx: 'Onyx (Deep Male)',
      nova: 'Nova (Female)',
      shimmer: 'Shimmer (Soft Female)',
    };
    return voices[voice] || voice;
  };

  const handleCreateAgent = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createAgentMutation.mutate({
      name: formData.get('name') as string,
      type: formData.get('type') as Agent['type'],
      prompt: formData.get('prompt') as string,
      voice_config: {
        voice: formData.get('voice') as string,
        temperature: parseFloat(formData.get('temperature') as string),
        speed: parseFloat(formData.get('speed') as string),
        pitch: parseFloat(formData.get('pitch') as string),
      },
      is_active: true,
    });
  };

  const handleUpdateAgent = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingAgent) return;

    const formData = new FormData(e.currentTarget);
    updateAgentMutation.mutate({
      id: editingAgent.id,
      data: {
        name: formData.get('name') as string,
        type: formData.get('type') as Agent['type'],
        prompt: formData.get('prompt') as string,
        voice_config: {
          voice: formData.get('voice') as string,
          temperature: parseFloat(formData.get('temperature') as string),
          speed: parseFloat(formData.get('speed') as string),
          pitch: parseFloat(formData.get('pitch') as string),
        },
      },
    });
  };

  const handleAddPhone = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    addPhoneMutation.mutate({
      twilio_number: formData.get('twilio_number') as string,
      agent_id: formData.get('agent_id') as string,
    });
  };

  const handleDeleteAgent = (id: string) => {
    if (confirm('Are you sure you want to delete this agent?')) {
      deleteAgentMutation.mutate(id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Agents</h1>
          <p className="mt-1 text-sm text-gray-500">
            Configure and manage your AI voice agents
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setIsPhoneMappingOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Phone className="h-4 w-4" />
            Map Phone
          </button>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create Agent
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-lg shadow-md p-4 border border-gray-200"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Agents</p>
              <p className="text-2xl font-bold text-gray-900">{agents.length}</p>
            </div>
            <Bot className="h-8 w-8 text-primary-500" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-lg shadow-md p-4 border border-gray-200"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Active Agents</p>
              <p className="text-2xl font-bold text-gray-900">
                {agents.filter((a: Agent) => a.is_active).length}
              </p>
            </div>
            <CheckCircle className="h-8 w-8 text-green-500" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-lg shadow-md p-4 border border-gray-200"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Phone Numbers</p>
              <p className="text-2xl font-bold text-gray-900">{phoneMappings.length}</p>
            </div>
            <PhoneCall className="h-8 w-8 text-blue-500" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-lg shadow-md p-4 border border-gray-200"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Agent Types</p>
              <div className="flex gap-1 mt-1">
                {['service', 'order', 'payment'].map((type) => {
                  const count = agents.filter((a: Agent) => a.type === type).length;
                  return count > 0 ? (
                    <span key={type} className={clsx('px-2 py-1 text-xs rounded-full', getAgentTypeColor(type))}>
                      {count}
                    </span>
                  ) : null;
                })}
              </div>
            </div>
            <Settings className="h-8 w-8 text-purple-500" />
          </div>
        </motion.div>
      </div>

      {/* Agents List */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Your Agents</h2>
        </div>

        {agentsLoading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-4 text-gray-500">Loading agents...</p>
          </div>
        ) : agents.length === 0 ? (
          <div className="p-12 text-center">
            <Bot className="h-12 w-12 text-gray-300 mx-auto" />
            <p className="mt-4 text-gray-500">No agents configured yet</p>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Create Your First Agent
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {agents.map((agent: Agent) => (
              <motion.div
                key={agent.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-6 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-medium text-gray-900">{agent.name}</h3>
                      <span className={clsx('px-2 py-1 text-xs rounded-full border', getAgentTypeColor(agent.type))}>
                        {agent.type}
                      </span>
                      {agent.is_active ? (
                        <span className="flex items-center gap-1 text-xs text-green-600">
                          <Activity className="h-3 w-3" />
                          Active
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <XCircle className="h-3 w-3" />
                          Inactive
                        </span>
                      )}
                    </div>

                    <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Volume2 className="h-4 w-4" />
                        {getVoiceLabel(agent.voice_config.voice)}
                      </span>
                      {agent.phone_mappings && agent.phone_mappings.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-4 w-4" />
                          {agent.phone_mappings.length} phone{agent.phone_mappings.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>

                    <p className="mt-2 text-sm text-gray-600 line-clamp-2">{agent.prompt}</p>

                    {agent.phone_mappings && agent.phone_mappings.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {agent.phone_mappings.map((phone) => (
                          <span
                            key={phone.id}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-xs text-gray-700 rounded-full"
                          >
                            <Phone className="h-3 w-3" />
                            {phone.twilio_number}
                            <button
                              onClick={() => removePhoneMutation.mutate(phone.id)}
                              className="ml-1 text-gray-400 hover:text-red-600"
                            >
                              <XCircle className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => setEditingAgent(agent)}
                      className="p-2 text-gray-400 hover:text-primary-600 transition-colors"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteAgent(agent.id)}
                      className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setExpandedAgent(expandedAgent === agent.id ? null : agent.id)}
                      className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {expandedAgent === agent.id ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <AnimatePresence>
                  {expandedAgent === agent.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="mt-4 pt-4 border-t border-gray-200"
                    >
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-gray-500">Voice Settings</p>
                          <div className="mt-2 space-y-1">
                            <p>Temperature: {agent.voice_config.temperature}</p>
                            <p>Speed: {agent.voice_config.speed}x</p>
                            <p>Pitch: {agent.voice_config.pitch}x</p>
                          </div>
                        </div>
                        <div>
                          <p className="text-gray-500">Created</p>
                          <p className="mt-2">
                            {new Date(agent.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4">
                        <p className="text-gray-500 text-sm mb-2">Full Prompt</p>
                        <div className="p-3 bg-gray-50 rounded-lg">
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">{agent.prompt}</p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Create Agent Modal */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={() => setIsCreateModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">Create AI Agent</h2>
              </div>

              <form onSubmit={handleCreateAgent} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Agent Name
                  </label>
                  <input
                    type="text"
                    name="name"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="e.g., Customer Service Bot"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Agent Type
                  </label>
                  <select
                    name="type"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="service">Service Agent</option>
                    <option value="order">Order Agent</option>
                    <option value="payment">Payment Agent</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    System Prompt
                  </label>
                  <textarea
                    name="prompt"
                    required
                    rows={6}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="You are a helpful customer service agent..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Voice
                    </label>
                    <select
                      name="voice"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="alloy">Alloy (Neutral)</option>
                      <option value="echo">Echo (Male)</option>
                      <option value="fable">Fable (British)</option>
                      <option value="onyx">Onyx (Deep Male)</option>
                      <option value="nova">Nova (Female)</option>
                      <option value="shimmer">Shimmer (Soft Female)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Temperature
                    </label>
                    <input
                      type="number"
                      name="temperature"
                      min="0"
                      max="2"
                      step="0.1"
                      defaultValue="0.8"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Speed
                    </label>
                    <input
                      type="number"
                      name="speed"
                      min="0.5"
                      max="2"
                      step="0.1"
                      defaultValue="1"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Pitch
                    </label>
                    <input
                      type="number"
                      name="pitch"
                      min="0.5"
                      max="2"
                      step="0.1"
                      defaultValue="1"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createAgentMutation.isPending}
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
                  >
                    {createAgentMutation.isPending ? 'Creating...' : 'Create Agent'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Agent Modal */}
      <AnimatePresence>
        {editingAgent && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={() => setEditingAgent(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">Edit Agent</h2>
              </div>

              <form onSubmit={handleUpdateAgent} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Agent Name
                  </label>
                  <input
                    type="text"
                    name="name"
                    defaultValue={editingAgent.name}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Agent Type
                  </label>
                  <select
                    name="type"
                    defaultValue={editingAgent.type}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="service">Service Agent</option>
                    <option value="order">Order Agent</option>
                    <option value="payment">Payment Agent</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    System Prompt
                  </label>
                  <textarea
                    name="prompt"
                    defaultValue={editingAgent.prompt}
                    required
                    rows={6}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Voice
                    </label>
                    <select
                      name="voice"
                      defaultValue={editingAgent.voice_config.voice}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="alloy">Alloy (Neutral)</option>
                      <option value="echo">Echo (Male)</option>
                      <option value="fable">Fable (British)</option>
                      <option value="onyx">Onyx (Deep Male)</option>
                      <option value="nova">Nova (Female)</option>
                      <option value="shimmer">Shimmer (Soft Female)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Temperature
                    </label>
                    <input
                      type="number"
                      name="temperature"
                      min="0"
                      max="2"
                      step="0.1"
                      defaultValue={editingAgent.voice_config.temperature}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Speed
                    </label>
                    <input
                      type="number"
                      name="speed"
                      min="0.5"
                      max="2"
                      step="0.1"
                      defaultValue={editingAgent.voice_config.speed}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Pitch
                    </label>
                    <input
                      type="number"
                      name="pitch"
                      min="0.5"
                      max="2"
                      step="0.1"
                      defaultValue={editingAgent.voice_config.pitch}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setEditingAgent(null)}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={updateAgentMutation.isPending}
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
                  >
                    {updateAgentMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Phone Mapping Modal */}
      <AnimatePresence>
        {isPhoneMappingOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={() => setIsPhoneMappingOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-xl shadow-xl max-w-lg w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">Map Phone Number</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Connect a Twilio phone number to an AI agent
                </p>
              </div>

              <form onSubmit={handleAddPhone} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Twilio Phone Number
                  </label>
                  <input
                    type="tel"
                    name="twilio_number"
                    required
                    pattern="^\+1[2-9]\d{9}$"
                    placeholder="+1234567890"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Format: +1XXXXXXXXXX (US/Canada only)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Select Agent
                  </label>
                  <select
                    name="agent_id"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Choose an agent...</option>
                    {agents.filter((a: Agent) => a.is_active).map((agent: Agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name} ({agent.type})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                    <div className="text-sm text-blue-800">
                      <p className="font-medium">Important:</p>
                      <p className="mt-1">
                        After mapping, configure your Twilio phone number webhook URL to point to our API endpoint.
                        The URL will be provided after successful mapping.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsPhoneMappingOpen(false)}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={addPhoneMutation.isPending}
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
                  >
                    {addPhoneMutation.isPending ? 'Mapping...' : 'Map Phone'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Agents;