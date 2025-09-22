import React, { useState } from 'react';
import { Link2, ArrowRight, Plus, Trash2, Settings, ChevronDown, ChevronUp } from 'lucide-react';
import { Agent } from '../../types/agent';

interface HandoffManagerProps {
  sourceAgentId: string;
  agents: Agent[];
  existingHandoffs?: Array<{
    toAgentId: string;
    conditions?: Record<string, any>;
    priority: number;
  }>;
  onCreateHandoff: (fromId: string, toId: string, conditions?: any) => void;
  onRemoveHandoff?: (fromId: string, toId: string) => void;
}

const HandoffManager: React.FC<HandoffManagerProps> = ({
  sourceAgentId,
  agents,
  existingHandoffs = [],
  onCreateHandoff,
  onRemoveHandoff,
}) => {
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [conditions, setConditions] = useState<Record<string, any>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [priority, setPriority] = useState(0);

  const availableAgents = agents.filter((a) => a.id !== sourceAgentId);
  const sourceAgent = agents.find((a) => a.id === sourceAgentId);

  const conditionTemplates = [
    {
      name: 'Customer Intent',
      conditions: {
        intent: ['order', 'payment', 'support'],
        confidence: 0.8,
      },
    },
    {
      name: 'Language Detection',
      conditions: {
        language: ['es', 'fr', 'de'],
        requireTranslation: true,
      },
    },
    {
      name: 'Urgency Level',
      conditions: {
        urgency: 'high',
        escalate: true,
      },
    },
    {
      name: 'Task Completion',
      conditions: {
        taskCompleted: true,
        nextStep: 'payment',
      },
    },
  ];

  const handleCreateHandoff = () => {
    if (!selectedAgent) return;

    onCreateHandoff(sourceAgentId, selectedAgent, {
      conditions,
      priority,
    });

    // Reset form
    setSelectedAgent('');
    setConditions({});
    setPriority(0);
  };

  const getAgentTypeColor = (type: string) => {
    switch (type) {
      case 'service':
        return 'bg-blue-100 text-blue-700';
      case 'order':
        return 'bg-green-100 text-green-700';
      case 'payment':
        return 'bg-purple-100 text-purple-700';
      case 'scheduling':
        return 'bg-yellow-100 text-yellow-700';
      case 'triage':
        return 'bg-orange-100 text-orange-700';
      case 'supervisor':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-3">
        <Link2 className="h-4 w-4 text-gray-600" />
        <h3 className="text-sm font-semibold text-gray-900">Agent Handoffs</h3>
      </div>

      {sourceAgent && (
        <div className="p-3 bg-primary-50 border border-primary-200 rounded-lg">
          <p className="text-xs text-gray-600 mb-1">From Agent</p>
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{sourceAgent.name}</span>
            <span className={`px-2 py-0.5 text-xs rounded-full ${getAgentTypeColor(sourceAgent.type)}`}>
              {sourceAgent.type}
            </span>
          </div>
        </div>
      )}

      {/* Create New Handoff */}
      <div className="space-y-3">
        <label className="block">
          <span className="text-xs font-medium text-gray-700">Handoff To</span>
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            <option value="">Select target agent...</option>
            {availableAgents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name} ({agent.type})
              </option>
            ))}
          </select>
        </label>

        {/* Condition Templates */}
        <div>
          <p className="text-xs font-medium text-gray-700 mb-2">Quick Conditions</p>
          <div className="grid grid-cols-2 gap-2">
            {conditionTemplates.map((template) => (
              <button
                key={template.name}
                onClick={() => setConditions(template.conditions)}
                className="px-2 py-1 text-xs bg-white border border-gray-200 rounded hover:bg-gray-50 transition-colors text-left"
              >
                {template.name}
              </button>
            ))}
          </div>
        </div>

        {/* Advanced Settings */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-800"
        >
          <Settings className="h-3 w-3" />
          Advanced Settings
          {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>

        {showAdvanced && (
          <div className="space-y-3 p-3 bg-gray-50 rounded-lg">
            <label className="block">
              <span className="text-xs font-medium text-gray-700">Priority</span>
              <input
                type="number"
                value={priority}
                onChange={(e) => setPriority(parseInt(e.target.value))}
                className="mt-1 w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                placeholder="0"
              />
              <span className="text-xs text-gray-500">Higher priority handoffs are evaluated first</span>
            </label>

            <label className="block">
              <span className="text-xs font-medium text-gray-700">Conditions (JSON)</span>
              <textarea
                value={JSON.stringify(conditions, null, 2)}
                onChange={(e) => {
                  try {
                    setConditions(JSON.parse(e.target.value));
                  } catch {
                    // Invalid JSON
                  }
                }}
                className="mt-1 w-full px-2 py-1 text-xs font-mono border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                rows={4}
                placeholder="{}"
              />
            </label>
          </div>
        )}

        <button
          onClick={handleCreateHandoff}
          disabled={!selectedAgent}
          className="w-full px-3 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Create Handoff
        </button>
      </div>

      {/* Existing Handoffs */}
      {existingHandoffs.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-gray-700">Existing Handoffs</h4>
          {existingHandoffs.map((handoff, index) => {
            const targetAgent = agents.find((a) => a.id === handoff.toAgentId);
            if (!targetAgent) return null;

            return (
              <div
                key={index}
                className="p-3 bg-white border border-gray-200 rounded-lg hover:shadow-sm transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ArrowRight className="h-4 w-4 text-gray-400" />
                    <span className="text-sm font-medium">{targetAgent.name}</span>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${getAgentTypeColor(targetAgent.type)}`}>
                      {targetAgent.type}
                    </span>
                    {handoff.priority > 0 && (
                      <span className="px-2 py-0.5 text-xs bg-gray-100 rounded-full">
                        Priority: {handoff.priority}
                      </span>
                    )}
                  </div>
                  {onRemoveHandoff && (
                    <button
                      onClick={() => onRemoveHandoff(sourceAgentId, handoff.toAgentId)}
                      className="p-1 hover:bg-red-50 text-red-600 rounded transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>

                {handoff.conditions && Object.keys(handoff.conditions).length > 0 && (
                  <pre className="mt-2 p-2 bg-gray-50 rounded text-xs overflow-x-auto">
                    {JSON.stringify(handoff.conditions, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default HandoffManager;