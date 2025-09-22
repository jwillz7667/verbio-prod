import React, { useState } from 'react';
import { Search, Wrench, Package, Calendar, CreditCard, Building, Plus } from 'lucide-react';
import { AgentTool } from '../../types/agent';

interface ToolSelectorProps {
  tools: AgentTool[];
  onSelect: (tool: AgentTool, targetAgentId?: string) => void;
  targetAgentId?: string;
}

const categoryIcons: Record<string, React.ElementType> = {
  order: Package,
  payment: CreditCard,
  scheduling: Calendar,
  business: Building,
  custom: Wrench,
};

const categoryColors: Record<string, string> = {
  order: 'bg-green-100 text-green-700 border-green-300',
  payment: 'bg-purple-100 text-purple-700 border-purple-300',
  scheduling: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  business: 'bg-blue-100 text-blue-700 border-blue-300',
  custom: 'bg-gray-100 text-gray-700 border-gray-300',
};

const ToolSelector: React.FC<ToolSelectorProps> = ({ tools, onSelect, targetAgentId }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const filteredTools = tools.filter((tool) => {
    const matchesSearch = tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          tool.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !selectedCategory || tool.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = Array.from(new Set(tools.map((t) => t.category)));

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search tools..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {/* Category filters */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`px-3 py-1 text-xs rounded-full border transition-colors ${
            !selectedCategory
              ? 'bg-primary-100 text-primary-700 border-primary-300'
              : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
          }`}
        >
          All
        </button>
        {categories.map((category) => {
          const Icon = categoryIcons[category] || Wrench;
          return (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors flex items-center gap-1 ${
                selectedCategory === category
                  ? categoryColors[category]
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              <Icon className="h-3 w-3" />
              {category}
            </button>
          );
        })}
      </div>

      {/* Tools list */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {filteredTools.map((tool) => {
          const Icon = categoryIcons[tool.category] || Wrench;
          return (
            <div
              key={tool.id}
              draggable
              className="p-3 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-all cursor-move group"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-gray-500" />
                    <h4 className="font-medium text-sm text-gray-900">{tool.name}</h4>
                  </div>
                  {tool.description && (
                    <p className="mt-1 text-xs text-gray-500 line-clamp-2">{tool.description}</p>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <span className={`px-2 py-0.5 text-xs rounded-full border ${categoryColors[tool.category]}`}>
                      {tool.category}
                    </span>
                    <span className="text-xs text-gray-400">
                      {tool.implementation_type}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => onSelect(tool, targetAgentId)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-100 rounded transition-all"
                  title="Add to canvas"
                >
                  <Plus className="h-4 w-4 text-gray-600" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredTools.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <Wrench className="h-8 w-8 mx-auto mb-2 text-gray-300" />
          <p className="text-sm">No tools found</p>
        </div>
      )}
    </div>
  );
};

export default ToolSelector;