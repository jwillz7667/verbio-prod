import React, { useState } from 'react';
import { Shield, Plus, Trash2, Check, X } from 'lucide-react';
import { AgentGuardrail } from '../../types/agent';

interface GuardrailEditorProps {
  businessId: string;
  guardrails?: AgentGuardrail[];
  onUpdate?: (guardrails: AgentGuardrail[]) => void;
}

const GuardrailEditor: React.FC<GuardrailEditorProps> = ({
  businessId,
  guardrails = [],
  onUpdate
}) => {
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newGuardrail, setNewGuardrail] = useState<Partial<AgentGuardrail>>({
    type: 'input',
    action: 'block',
  });

  const guardrailTypes = [
    { value: 'input', label: 'Input Validation', icon: '📥' },
    { value: 'output', label: 'Output Validation', icon: '📤' },
    { value: 'function_call', label: 'Function Call', icon: '⚡' },
  ];

  const actionTypes = [
    { value: 'block', label: 'Block', color: 'text-red-600 bg-red-100' },
    { value: 'warn', label: 'Warn', color: 'text-yellow-600 bg-yellow-100' },
    { value: 'modify', label: 'Modify', color: 'text-blue-600 bg-blue-100' },
  ];

  const commonRules = [
    { name: 'No PII', description: 'Block personal information', schema: { contains_pii: false } },
    { name: 'Profanity Filter', description: 'Block inappropriate language', schema: { profanity: false } },
    { name: 'Max Length', description: 'Limit response length', schema: { maxLength: 500 } },
    { name: 'Required Fields', description: 'Ensure required data', schema: { required: ['name', 'email'] } },
    { name: 'Rate Limit', description: 'Limit requests per minute', schema: { rateLimit: 10 } },
  ];

  const handleAddGuardrail = () => {
    if (!newGuardrail.name || !newGuardrail.description) return;

    const guardrail: AgentGuardrail = {
      id: `gr-${Date.now()}`,
      business_id: businessId,
      name: newGuardrail.name,
      description: newGuardrail.description,
      type: newGuardrail.type as AgentGuardrail['type'],
      validation_schema: newGuardrail.validation_schema,
      action: newGuardrail.action as AgentGuardrail['action'],
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    onUpdate?.([...guardrails, guardrail]);
    setIsAddingNew(false);
    setNewGuardrail({ type: 'input', action: 'block' });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Shield className="h-4 w-4 text-gray-600" />
          Guardrails
        </h3>
        <button
          onClick={() => setIsAddingNew(true)}
          className="px-2 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors flex items-center gap-1"
        >
          <Plus className="h-3 w-3" />
          Add Rule
        </button>
      </div>

      {/* Quick Templates */}
      <div className="bg-gray-50 rounded-lg p-3">
        <p className="text-xs font-medium text-gray-700 mb-2">Quick Templates</p>
        <div className="space-y-1">
          {commonRules.map((rule) => (
            <button
              key={rule.name}
              onClick={() => {
                setNewGuardrail({
                  name: rule.name,
                  description: rule.description,
                  validation_schema: rule.schema,
                  type: 'input',
                  action: 'block',
                });
                setIsAddingNew(true);
              }}
              className="w-full text-left px-2 py-1 text-xs bg-white border border-gray-200 rounded hover:bg-gray-50 transition-colors"
            >
              <span className="font-medium">{rule.name}</span>
              <span className="text-gray-500 ml-2">{rule.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Add New Guardrail Form */}
      {isAddingNew && (
        <div className="bg-white border border-primary-200 rounded-lg p-3 space-y-3">
          <input
            type="text"
            placeholder="Rule name"
            value={newGuardrail.name || ''}
            onChange={(e) => setNewGuardrail({ ...newGuardrail, name: e.target.value })}
            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
          />

          <input
            type="text"
            placeholder="Description"
            value={newGuardrail.description || ''}
            onChange={(e) => setNewGuardrail({ ...newGuardrail, description: e.target.value })}
            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
          />

          <div className="grid grid-cols-2 gap-2">
            <select
              value={newGuardrail.type}
              onChange={(e) => setNewGuardrail({ ...newGuardrail, type: e.target.value as AgentGuardrail['type'] })}
              className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              {guardrailTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.icon} {type.label}
                </option>
              ))}
            </select>

            <select
              value={newGuardrail.action}
              onChange={(e) => setNewGuardrail({ ...newGuardrail, action: e.target.value as AgentGuardrail['action'] })}
              className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              {actionTypes.map((action) => (
                <option key={action.value} value={action.value}>
                  {action.label}
                </option>
              ))}
            </select>
          </div>

          <textarea
            placeholder="Validation schema (JSON)"
            value={newGuardrail.validation_schema ? JSON.stringify(newGuardrail.validation_schema, null, 2) : ''}
            onChange={(e) => {
              try {
                setNewGuardrail({ ...newGuardrail, validation_schema: JSON.parse(e.target.value) });
              } catch {
                // Invalid JSON, keep as is
              }
            }}
            className="w-full px-2 py-1 text-xs font-mono border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
            rows={3}
          />

          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setIsAddingNew(false);
                setNewGuardrail({ type: 'input', action: 'block' });
              }}
              className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={handleAddGuardrail}
              className="px-3 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700"
            >
              Add Guardrail
            </button>
          </div>
        </div>
      )}

      {/* Existing Guardrails */}
      <div className="space-y-2">
        {guardrails.map((guardrail) => {
          const typeConfig = guardrailTypes.find((t) => t.value === guardrail.type);
          const actionConfig = actionTypes.find((a) => a.value === guardrail.action);

          return (
            <div
              key={guardrail.id}
              className="p-3 bg-white border border-gray-200 rounded-lg hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{typeConfig?.icon}</span>
                    <h4 className="text-sm font-medium text-gray-900">{guardrail.name}</h4>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${actionConfig?.color}`}>
                      {guardrail.action}
                    </span>
                    {guardrail.is_active ? (
                      <Check className="h-3 w-3 text-green-600" />
                    ) : (
                      <X className="h-3 w-3 text-gray-400" />
                    )}
                  </div>
                  {guardrail.description && (
                    <p className="text-xs text-gray-500 mt-1">{guardrail.description}</p>
                  )}
                  {guardrail.validation_schema && (
                    <pre className="mt-2 p-2 bg-gray-50 rounded text-xs overflow-x-auto">
                      {JSON.stringify(guardrail.validation_schema, null, 2)}
                    </pre>
                  )}
                </div>
                <button
                  onClick={() => {
                    const updated = guardrails.filter((g) => g.id !== guardrail.id);
                    onUpdate?.(updated);
                  }}
                  className="p-1 hover:bg-red-50 text-red-600 rounded transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {guardrails.length === 0 && !isAddingNew && (
        <div className="text-center py-6 text-gray-500">
          <Shield className="h-8 w-8 mx-auto mb-2 text-gray-300" />
          <p className="text-sm">No guardrails configured</p>
          <p className="text-xs mt-1">Add rules to protect your agent</p>
        </div>
      )}
    </div>
  );
};

export default GuardrailEditor;