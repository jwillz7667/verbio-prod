import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  Plus,
  Save,
  Link2,
  Shield,
  Wrench,
  ChevronRight,
  ChevronLeft,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Grid,
  TestTube,
  Eye,
  Download,
  Upload,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import { agentApi } from '../services/agentApi';
import { Agent, AgentTool, CanvasNode, CanvasEdge } from '../types/agent';
import AgentCanvas from '../components/agents/AgentCanvas';
import ToolSelector from '../components/agents/ToolSelector';
import AgentTestPanel from '../components/agents/AgentTestPanel';
import GuardrailEditor from '../components/agents/GuardrailEditor';
import HandoffManager from '../components/agents/HandoffManager';

interface SidebarTab {
  id: string;
  label: string;
  icon: React.ElementType;
}

const sidebarTabs: SidebarTab[] = [
  { id: 'templates', label: 'Templates', icon: Grid },
  { id: 'agents', label: 'Agents', icon: Bot },
  { id: 'tools', label: 'Tools', icon: Wrench },
  { id: 'handoffs', label: 'Handoffs', icon: Link2 },
  { id: 'guardrails', label: 'Guardrails', icon: Shield },
];

const AgentBuilder: React.FC = () => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const businessId = user?.businessId || '';

  // Canvas state
  const [canvasNodes, setCanvasNodes] = useState<CanvasNode[]>([]);
  const [canvasEdges, setCanvasEdges] = useState<CanvasEdge[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });

  // UI state
  const [activeTab, setActiveTab] = useState('templates');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isTestPanelOpen, setIsTestPanelOpen] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedItem, setDraggedItem] = useState<any>(null);

  // Canvas ref for interactions
  const canvasRef = useRef<HTMLDivElement>(null);

  // Fetch data
  const { data: templates } = useQuery({
    queryKey: ['agent-templates'],
    queryFn: () => agentApi.getTemplates(),
  });

  const { data: agents } = useQuery({
    queryKey: ['agents', businessId],
    queryFn: () => agentApi.getAgents(businessId),
    enabled: !!businessId,
  });

  const { data: tools } = useQuery({
    queryKey: ['agent-tools', businessId],
    queryFn: () => agentApi.getTools(businessId),
    enabled: !!businessId,
  });

  // Mutations

  const createFromTemplateMutation = useMutation({
    mutationFn: (templateType: string) =>
      agentApi.createFromTemplate(businessId, { templateType }),
    onSuccess: (agent) => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast.success('Agent created from template');
      addAgentToCanvas(agent);
    },
  });

  const saveWorkflowMutation = useMutation({
    mutationFn: (workflow: any) => agentApi.createWorkflow(businessId, workflow),
    onSuccess: () => {
      toast.success('Workflow saved successfully');
    },
  });

  // Canvas operations
  const addAgentToCanvas = (agent: Agent) => {
    const newNode: CanvasNode = {
      id: `node-${agent.id}`,
      type: 'agent',
      data: {
        label: agent.name,
        agent,
      },
      position: {
        x: 100 + canvasNodes.length * 150,
        y: 100 + (canvasNodes.length % 3) * 100,
      },
    };
    setCanvasNodes([...canvasNodes, newNode]);
  };

  const addToolToCanvas = (tool: AgentTool, targetAgentId?: string) => {
    const newNode: CanvasNode = {
      id: `tool-${tool.id}`,
      type: 'tool',
      data: {
        label: tool.name,
        tool,
      },
      position: {
        x: 200 + canvasNodes.length * 100,
        y: 200 + (canvasNodes.length % 3) * 80,
      },
    };
    setCanvasNodes([...canvasNodes, newNode]);

    // If target agent specified, create connection
    if (targetAgentId) {
      const newEdge: CanvasEdge = {
        id: `edge-${targetAgentId}-${tool.id}`,
        source: targetAgentId,
        target: newNode.id,
        type: 'tool',
        label: 'uses',
      };
      setCanvasEdges([...canvasEdges, newEdge]);
    }
  };

  const deleteNode = (nodeId: string) => {
    setCanvasNodes(canvasNodes.filter(n => n.id !== nodeId));
    setCanvasEdges(canvasEdges.filter(e => e.source !== nodeId && e.target !== nodeId));
    setSelectedNode(null);
  };

  const createHandoff = (fromId: string, toId: string) => {
    const newEdge: CanvasEdge = {
      id: `handoff-${fromId}-${toId}`,
      source: fromId,
      target: toId,
      type: 'handoff',
      label: 'handoff to',
      animated: true,
    };
    setCanvasEdges([...canvasEdges, newEdge]);
  };

  // Zoom controls
  const handleZoomIn = () => setZoom(Math.min(zoom * 1.2, 3));
  const handleZoomOut = () => setZoom(Math.max(zoom / 1.2, 0.3));
  const handleFitToScreen = () => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  };

  // Export/Import workflow
  const exportWorkflow = () => {
    const workflow = {
      nodes: canvasNodes,
      edges: canvasEdges,
      metadata: {
        exportedAt: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    const blob = new Blob([JSON.stringify(workflow, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'agent-workflow.json';
    a.click();
  };

  const importWorkflow = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const workflow = JSON.parse(e.target?.result as string);
        setCanvasNodes(workflow.nodes || []);
        setCanvasEdges(workflow.edges || []);
        toast.success('Workflow imported successfully');
      } catch (error) {
        toast.error('Failed to import workflow');
      }
    };
    reader.readAsText(file);
  };

  // Drag and drop handlers
  const handleDragStart = (event: React.DragEvent, item: any, type: string) => {
    setIsDragging(true);
    setDraggedItem({ ...item, type });
    event.dataTransfer.effectAllowed = 'copy';
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    setDraggedItem(null);
  };

  const handleCanvasDrop = (event: React.DragEvent) => {
    event.preventDefault();
    if (!draggedItem || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = (event.clientX - rect.left - panOffset.x) / zoom;
    const y = (event.clientY - rect.top - panOffset.y) / zoom;

    if (draggedItem.type === 'agent') {
      const newNode: CanvasNode = {
        id: `node-${Date.now()}`,
        type: 'agent',
        data: {
          label: draggedItem.name,
          agent: draggedItem,
        },
        position: { x, y },
      };
      setCanvasNodes([...canvasNodes, newNode]);
    } else if (draggedItem.type === 'tool') {
      const newNode: CanvasNode = {
        id: `tool-${Date.now()}`,
        type: 'tool',
        data: {
          label: draggedItem.name,
          tool: draggedItem,
        },
        position: { x, y },
      };
      setCanvasNodes([...canvasNodes, newNode]);
    }

    handleDragEnd();
  };

  const handleCanvasDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  return (
    <div className="h-screen flex overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {isSidebarOpen && (
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: 320 }}
            exit={{ width: 0 }}
            className="bg-white border-r border-gray-200 flex flex-col"
          >
            {/* Sidebar Header */}
            <div className="p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Agent Builder</h2>
              <p className="text-sm text-gray-500 mt-1">Drag and drop to build workflows</p>
            </div>

            {/* Sidebar Tabs */}
            <div className="flex border-b border-gray-200">
              {sidebarTabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 py-2 px-3 text-sm font-medium transition-colors ${
                      activeTab === tab.id
                        ? 'text-primary-600 border-b-2 border-primary-600'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Icon className="h-4 w-4 mx-auto mb-1" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Sidebar Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {activeTab === 'templates' && (
                <div className="space-y-3">
                  {templates &&
                    Object.entries(templates).map(([key, template]) => (
                      <div
                        key={key}
                        draggable
                        onDragStart={(e) => handleDragStart(e, template, 'template')}
                        onDragEnd={handleDragEnd}
                        className="p-3 bg-gradient-to-r from-primary-50 to-primary-100 rounded-lg cursor-move hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Bot className="h-5 w-5 text-primary-600" />
                            <span className="font-medium text-gray-900">{template.name}</span>
                          </div>
                          <button
                            onClick={() => createFromTemplateMutation.mutate(key)}
                            className="p-1 hover:bg-white rounded transition-colors"
                          >
                            <Plus className="h-4 w-4 text-primary-600" />
                          </button>
                        </div>
                        <p className="text-xs text-gray-600 mt-1">{template.description}</p>
                      </div>
                    ))}
                </div>
              )}

              {activeTab === 'agents' && (
                <div className="space-y-3">
                  {agents?.map((agent) => (
                    <div
                      key={agent.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, agent, 'agent')}
                      onDragEnd={handleDragEnd}
                      className="p-3 bg-white border border-gray-200 rounded-lg cursor-move hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Bot className="h-5 w-5 text-gray-600" />
                          <span className="font-medium text-gray-900">{agent.name}</span>
                        </div>
                        <span className="text-xs px-2 py-1 bg-gray-100 rounded-full">
                          {agent.type}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'tools' && <ToolSelector tools={tools || []} onSelect={addToolToCanvas} />}

              {activeTab === 'handoffs' && selectedNode && (
                <HandoffManager
                  sourceAgentId={selectedNode}
                  agents={agents || []}
                  onCreateHandoff={createHandoff}
                />
              )}

              {activeTab === 'guardrails' && selectedNode && (
                <GuardrailEditor businessId={businessId} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Canvas Area */}
      <div className="flex-1 flex flex-col">
        {/* Toolbar */}
        <div className="bg-white border-b border-gray-200 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                {isSidebarOpen ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
              </button>

              <div className="h-8 w-px bg-gray-300 mx-2" />

              <button
                onClick={handleZoomOut}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Zoom Out"
              >
                <ZoomOut className="h-5 w-5" />
              </button>
              <span className="text-sm text-gray-600 min-w-[60px] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={handleZoomIn}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Zoom In"
              >
                <ZoomIn className="h-5 w-5" />
              </button>
              <button
                onClick={handleFitToScreen}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Fit to Screen"
              >
                <Maximize2 className="h-5 w-5" />
              </button>

              <div className="h-8 w-px bg-gray-300 mx-2" />

              <button
                onClick={() => setIsPreviewMode(!isPreviewMode)}
                className={`p-2 rounded-lg transition-colors ${
                  isPreviewMode ? 'bg-primary-100 text-primary-600' : 'hover:bg-gray-100'
                }`}
                title="Preview Mode"
              >
                <Eye className="h-5 w-5" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsTestPanelOpen(!isTestPanelOpen)}
                className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center gap-2"
              >
                <TestTube className="h-4 w-4" />
                Test Agent
              </button>

              <label className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center gap-2 cursor-pointer">
                <Upload className="h-4 w-4" />
                Import
                <input type="file" accept=".json" onChange={importWorkflow} className="hidden" />
              </label>

              <button
                onClick={exportWorkflow}
                className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Export
              </button>

              <button
                onClick={() => saveWorkflowMutation.mutate({
                  name: 'My Workflow',
                  nodes: canvasNodes,
                  edges: canvasEdges,
                })}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-2"
              >
                <Save className="h-4 w-4" />
                Save Workflow
              </button>
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div
          ref={canvasRef}
          className="flex-1 relative overflow-hidden bg-gray-50"
          onDrop={handleCanvasDrop}
          onDragOver={handleCanvasDragOver}
        >
          <AgentCanvas
            nodes={canvasNodes}
            edges={canvasEdges}
            zoom={zoom}
            panOffset={panOffset}
            selectedNode={selectedNode}
            selectedEdge={selectedEdge}
            onNodeSelect={setSelectedNode}
            onEdgeSelect={setSelectedEdge}
            onNodeDelete={deleteNode}
            onNodesChange={setCanvasNodes}
            onEdgesChange={setCanvasEdges}
            isDragging={isDragging}
            isPreviewMode={isPreviewMode}
          />
        </div>
      </div>

      {/* Test Panel */}
      <AnimatePresence>
        {isTestPanelOpen && selectedNode && (
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: 400 }}
            exit={{ width: 0 }}
            className="bg-white border-l border-gray-200"
          >
            <AgentTestPanel
              agentId={selectedNode}
              businessId={businessId}
              onClose={() => setIsTestPanelOpen(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AgentBuilder;