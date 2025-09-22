import React, { useRef, useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Bot, Wrench, Trash2, Link2, Play, AlertCircle } from 'lucide-react';
import { CanvasNode, CanvasEdge } from '../../types/agent';

interface AgentCanvasProps {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  zoom: number;
  panOffset: { x: number; y: number };
  selectedNode: string | null;
  selectedEdge: string | null;
  onNodeSelect: (nodeId: string | null) => void;
  onEdgeSelect: (edgeId: string | null) => void;
  onNodeDelete: (nodeId: string) => void;
  onNodesChange: (nodes: CanvasNode[]) => void;
  onEdgesChange: (edges: CanvasEdge[]) => void;
  isDragging?: boolean;
  isPreviewMode?: boolean;
}

const AgentCanvas: React.FC<AgentCanvasProps> = ({
  nodes,
  edges,
  zoom,
  panOffset,
  selectedNode,
  selectedEdge,
  onNodeSelect,
  onEdgeSelect,
  onNodeDelete,
  onNodesChange,
  onEdgesChange,
  isDragging,
  isPreviewMode,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
  const [connectionStart, setConnectionStart] = useState<string | null>(null);
  const [connectionPreview, setConnectionPreview] = useState<{ x: number; y: number } | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  // Calculate edge path between nodes
  const getEdgePath = (edge: CanvasEdge): string => {
    const sourceNode = nodes.find((n) => n.id === edge.source);
    const targetNode = nodes.find((n) => n.id === edge.target);

    if (!sourceNode || !targetNode) return '';

    const sx = sourceNode.position.x + 120; // Right side of source node
    const sy = sourceNode.position.y + 40; // Middle of source node
    const tx = targetNode.position.x; // Left side of target node
    const ty = targetNode.position.y + 40; // Middle of target node

    // Bezier curve for smooth connection
    const mx = (sx + tx) / 2;
    const c1x = sx + (mx - sx) * 0.5;
    const c2x = tx - (tx - mx) * 0.5;

    return `M ${sx},${sy} C ${c1x},${sy} ${c2x},${ty} ${tx},${ty}`;
  };

  // Handle node dragging
  const handleNodeMouseDown = (nodeId: string, event: React.MouseEvent) => {
    if (isPreviewMode) return;

    event.stopPropagation();
    setDraggingNode(nodeId);
    const node = nodes.find((n) => n.id === nodeId);
    if (node) {
      setDragStartPos({
        x: event.clientX - node.position.x * zoom - panOffset.x,
        y: event.clientY - node.position.y * zoom - panOffset.y,
      });
    }
    onNodeSelect(nodeId);
  };

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (draggingNode) {
        const newNodes = nodes.map((node) => {
          if (node.id === draggingNode) {
            return {
              ...node,
              position: {
                x: (event.clientX - dragStartPos.x - panOffset.x) / zoom,
                y: (event.clientY - dragStartPos.y - panOffset.y) / zoom,
              },
            };
          }
          return node;
        });
        onNodesChange(newNodes);
      }

      if (connectionStart && canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        setConnectionPreview({
          x: (event.clientX - rect.left - panOffset.x) / zoom,
          y: (event.clientY - rect.top - panOffset.y) / zoom,
        });
      }
    },
    [draggingNode, dragStartPos, nodes, onNodesChange, panOffset, zoom, connectionStart]
  );

  const handleMouseUp = useCallback(() => {
    if (connectionStart && hoveredNode && hoveredNode !== connectionStart) {
      const newEdge: CanvasEdge = {
        id: `edge-${Date.now()}`,
        source: connectionStart,
        target: hoveredNode,
        type: 'handoff',
        animated: true,
      };
      onEdgesChange([...edges, newEdge]);
    }

    setDraggingNode(null);
    setConnectionStart(null);
    setConnectionPreview(null);
  }, [connectionStart, hoveredNode, edges, onEdgesChange]);

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Get node icon based on type
  const getNodeIcon = (node: CanvasNode) => {
    switch (node.type) {
      case 'agent':
        return <Bot className="h-5 w-5" />;
      case 'tool':
        return <Wrench className="h-5 w-5" />;
      case 'condition':
        return <AlertCircle className="h-5 w-5" />;
      case 'start':
        return <Play className="h-5 w-5" />;
      default:
        return <Bot className="h-5 w-5" />;
    }
  };

  // Get node color based on type
  const getNodeColor = (node: CanvasNode) => {
    if (node.type === 'agent') {
      const agentType = node.data.agent?.type;
      switch (agentType) {
        case 'service':
          return 'bg-blue-100 border-blue-300 text-blue-800';
        case 'order':
          return 'bg-green-100 border-green-300 text-green-800';
        case 'payment':
          return 'bg-purple-100 border-purple-300 text-purple-800';
        case 'scheduling':
          return 'bg-yellow-100 border-yellow-300 text-yellow-800';
        case 'triage':
          return 'bg-orange-100 border-orange-300 text-orange-800';
        case 'supervisor':
          return 'bg-red-100 border-red-300 text-red-800';
        default:
          return 'bg-gray-100 border-gray-300 text-gray-800';
      }
    } else if (node.type === 'tool') {
      return 'bg-indigo-100 border-indigo-300 text-indigo-800';
    } else if (node.type === 'condition') {
      return 'bg-amber-100 border-amber-300 text-amber-800';
    }
    return 'bg-white border-gray-300 text-gray-800';
  };

  return (
    <div
      ref={canvasRef}
      className="absolute inset-0"
      style={{
        transform: `scale(${zoom}) translate(${panOffset.x}px, ${panOffset.y}px)`,
        transformOrigin: 'top left',
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
      onClick={() => {
        onNodeSelect(null);
        onEdgeSelect(null);
      }}
    >
      {/* Grid background */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{
          backgroundImage: `
            repeating-linear-gradient(0deg, #f3f4f6 0px, transparent 1px, transparent 39px, #f3f4f6 40px),
            repeating-linear-gradient(90deg, #f3f4f6 0px, transparent 1px, transparent 39px, #f3f4f6 40px)
          `,
          backgroundSize: '40px 40px',
        }}
      />

      {/* Edges */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        {edges.map((edge) => {
          const path = getEdgePath(edge);
          const isSelected = selectedEdge === edge.id;

          return (
            <g key={edge.id}>
              {/* Invisible wider path for easier selection */}
              <path
                d={path}
                fill="none"
                stroke="transparent"
                strokeWidth="20"
                className="pointer-events-auto cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdgeSelect(edge.id);
                }}
              />
              {/* Visible edge */}
              <path
                d={path}
                fill="none"
                stroke={isSelected ? '#3b82f6' : '#9ca3af'}
                strokeWidth={isSelected ? 3 : 2}
                strokeDasharray={edge.animated ? '5 5' : undefined}
                className="pointer-events-none"
              >
                {edge.animated && (
                  <animate
                    attributeName="stroke-dashoffset"
                    from="0"
                    to="-10"
                    dur="1s"
                    repeatCount="indefinite"
                  />
                )}
              </path>
              {/* Edge label */}
              {edge.label && (
                <text
                  x={(nodes.find((n) => n.id === edge.source)?.position.x! + 120 +
                      nodes.find((n) => n.id === edge.target)?.position.x!) / 2}
                  y={(nodes.find((n) => n.id === edge.source)?.position.y! + 40 +
                      nodes.find((n) => n.id === edge.target)?.position.y! + 40) / 2}
                  textAnchor="middle"
                  className="text-xs fill-gray-500 pointer-events-none"
                >
                  {edge.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Connection preview line */}
        {connectionStart && connectionPreview && (
          <line
            x1={nodes.find((n) => n.id === connectionStart)?.position.x! + 120}
            y1={nodes.find((n) => n.id === connectionStart)?.position.y! + 40}
            x2={connectionPreview.x}
            y2={connectionPreview.y}
            stroke="#3b82f6"
            strokeWidth="2"
            strokeDasharray="5 5"
            className="pointer-events-none"
          />
        )}
      </svg>

      {/* Nodes */}
      {nodes.map((node) => {
        const isSelected = selectedNode === node.id;
        const isHovered = hoveredNode === node.id;

        return (
          <motion.div
            key={node.id}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className={`absolute flex flex-col items-center ${
              isSelected ? 'z-20' : 'z-10'
            }`}
            style={{
              left: node.position.x,
              top: node.position.y,
              cursor: draggingNode === node.id ? 'grabbing' : 'grab',
            }}
            onMouseDown={(e) => handleNodeMouseDown(node.id, e)}
            onMouseEnter={() => setHoveredNode(node.id)}
            onMouseLeave={() => setHoveredNode(null)}
          >
            <div
              className={`
                relative px-4 py-3 rounded-lg border-2 shadow-sm
                transition-all duration-200 min-w-[120px]
                ${getNodeColor(node)}
                ${isSelected ? 'ring-2 ring-primary-500 ring-offset-2' : ''}
                ${isHovered && !isPreviewMode ? 'shadow-lg scale-105' : ''}
              `}
            >
              <div className="flex items-center gap-2">
                {getNodeIcon(node)}
                <span className="text-sm font-medium truncate max-w-[100px]">
                  {node.data.label}
                </span>
              </div>

              {/* Node type badge */}
              {node.type === 'agent' && node.data.agent && (
                <div className="mt-1 text-xs opacity-75">
                  {node.data.agent.type}
                </div>
              )}

              {/* Action buttons */}
              {!isPreviewMode && isSelected && (
                <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 flex gap-1 bg-white rounded-lg shadow-lg p-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConnectionStart(node.id);
                    }}
                    className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                    title="Create connection"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onNodeDelete(node.id);
                    }}
                    className="p-1.5 hover:bg-red-100 text-red-600 rounded transition-colors"
                    title="Delete node"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Connection ports */}
              {!isPreviewMode && (
                <>
                  {/* Input port */}
                  <div className="absolute -left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 bg-white border-2 border-gray-400 rounded-full" />
                  {/* Output port */}
                  <div
                    className="absolute -right-2 top-1/2 transform -translate-y-1/2 w-3 h-3 bg-white border-2 border-primary-500 rounded-full cursor-crosshair"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setConnectionStart(node.id);
                    }}
                  />
                </>
              )}
            </div>
          </motion.div>
        );
      })}

      {/* Preview mode indicator */}
      {isPreviewMode && (
        <div className="absolute top-4 left-4 px-3 py-2 bg-blue-100 text-blue-800 rounded-lg shadow-sm">
          <div className="flex items-center gap-2">
            <Play className="h-4 w-4" />
            <span className="text-sm font-medium">Preview Mode</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentCanvas;