"use client";

// ============================================================
// GraphViewer.tsx
// Implements: T-035-F
// - Renders graph_path.nodes and graph_path.edges via @xyflow/react
// - entity nodes: circular, purple
// - chunk nodes: rectangular, teal
// - Edge labels: type + weight
// - Clicking a node shows a Popover with label, type, up to 3 linked excerpts
// - fitView on load; zoom + pan controls visible
// - Empty state: "Submit a query to see the graph"
// ============================================================

import React, { useCallback, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeTypes,
  type OnInit,
  MarkerType,
  Handle,
  Position,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

import { useRunContext } from "../lib/context";
import type { GraphNode, GraphEdge, VectorHit } from "../lib/api";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ENTITY_NODE_COLOUR = "#7c3aed"; // purple-700
const CHUNK_NODE_COLOUR = "#0d9488";  // teal-600

const EDGE_TYPE_COLOURS: Record<GraphEdge["type"], string> = {
  mentions: "#9ca3af",       // grey-400
  similarity: "#3b82f6",    // blue-500
  co_occurrence: "#8b5cf6", // purple-500
};

// ---------------------------------------------------------------------------
// Custom node data types
// ---------------------------------------------------------------------------

interface NodeData extends Record<string, unknown> {
  label: string;
  nodeType: "entity" | "chunk";
  properties: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Custom node: EntityNode (circular, purple)
// ---------------------------------------------------------------------------

function EntityNode({ data }: NodeProps) {
  const d = data as NodeData;
  return (
    <>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div
        className="flex items-center justify-center rounded-full border-2 text-white text-center"
        style={{
          width: 80,
          height: 80,
          backgroundColor: ENTITY_NODE_COLOUR,
          borderColor: "#5b21b6",
          fontSize: "10px",
          fontWeight: 600,
          lineHeight: "1.2",
          wordBreak: "break-word",
          padding: "4px",
        }}
        title={d.label}
      >
        <span
          style={{
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
          }}
        >
          {d.label}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Custom node: ChunkNode (rectangular, teal)
// ---------------------------------------------------------------------------

function ChunkNode({ data }: NodeProps) {
  const d = data as NodeData;
  return (
    <>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div
        className="flex items-center justify-center rounded-md border-2 text-white text-center"
        style={{
          width: 120,
          minHeight: 44,
          backgroundColor: CHUNK_NODE_COLOUR,
          borderColor: "#0f766e",
          fontSize: "10px",
          fontWeight: 500,
          lineHeight: "1.3",
          wordBreak: "break-word",
          padding: "4px 8px",
        }}
        title={d.label}
      >
        <span
          style={{
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
          }}
        >
          {d.label}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </>
  );
}

// ---------------------------------------------------------------------------
// nodeTypes registry — defined outside component to prevent re-render warnings
// ---------------------------------------------------------------------------

const nodeTypes: NodeTypes = {
  entity: EntityNode,
  chunk: ChunkNode,
};

// ---------------------------------------------------------------------------
// Layout: two-row grid (entity nodes on top row, chunk nodes on bottom row)
// ---------------------------------------------------------------------------

function computeLayout(
  graphNodes: GraphNode[],
  graphEdges: GraphEdge[]
): { rfNodes: Node<NodeData>[]; rfEdges: Edge[] } {
  const entityNodes = graphNodes.filter((n) => n.type === "entity");
  const chunkNodes = graphNodes.filter((n) => n.type === "chunk");

  const ENTITY_SPACING_X = 120;
  const CHUNK_SPACING_X = 160;
  const ENTITY_ROW_Y = 60;
  const CHUNK_ROW_Y = 280;
  const CENTER_X = 500;

  const rfNodes: Node<NodeData>[] = [
    ...entityNodes.map((n, i) => ({
      id: n.id,
      type: "entity" as const,
      position: {
        x:
          CENTER_X +
          i * ENTITY_SPACING_X -
          (entityNodes.length * ENTITY_SPACING_X) / 2,
        y: ENTITY_ROW_Y,
      },
      data: {
        label: (n.label ?? n.id).slice(0, 40),
        nodeType: n.type,
        properties: n.properties,
      } as NodeData,
    })),
    ...chunkNodes.map((n, i) => ({
      id: n.id,
      type: "chunk" as const,
      position: {
        x:
          CENTER_X +
          i * CHUNK_SPACING_X -
          (chunkNodes.length * CHUNK_SPACING_X) / 2,
        y: CHUNK_ROW_Y,
      },
      data: {
        label: (n.label ?? n.id).slice(0, 50),
        nodeType: n.type,
        properties: n.properties,
      } as NodeData,
    })),
  ];

  const rfEdges: Edge[] = graphEdges.map((e) => ({
    id: e.id,
    source: e.from_node,
    target: e.to_node,
    label:
      e.weight !== null
        ? `${e.type} (${e.weight.toFixed(2)})`
        : e.type,
    style: {
      stroke: EDGE_TYPE_COLOURS[e.type],
      strokeWidth: 1.5,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: EDGE_TYPE_COLOURS[e.type],
    },
    labelStyle: { fontSize: 9, fill: "#6b7280" },
    labelBgStyle: { fill: "#f9fafb", fillOpacity: 0.8 },
  }));

  return { rfNodes, rfEdges };
}

// ---------------------------------------------------------------------------
// Node detail popover content
// ---------------------------------------------------------------------------

function NodeDetailPopover({
  node,
  vectorHits,
}: {
  node: GraphNode;
  vectorHits: VectorHit[];
}) {
  // Match chunk node: id format is "chunk:{embed_id}"
  const nodeChunkId = node.id.startsWith("chunk:")
    ? node.id.slice("chunk:".length)
    : null;

  const linkedExcerpts = nodeChunkId
    ? vectorHits.filter((h) => h.chunk_id === nodeChunkId).slice(0, 3)
    : [];

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-muted-foreground mb-0.5">Label</p>
        <p className="text-sm font-medium break-words">{node.label ?? node.id}</p>
      </div>

      <div className="flex items-center gap-2">
        <p className="text-xs text-muted-foreground">Type</p>
        <Badge
          variant="outline"
          className={cn(
            "text-xs",
            node.type === "entity"
              ? "bg-purple-100 text-purple-800 border-purple-200"
              : "bg-teal-100 text-teal-800 border-teal-200"
          )}
        >
          {node.type}
        </Badge>
      </div>

      {node.properties && Object.keys(node.properties).length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">Properties</p>
          <div className="space-y-0.5">
            {Object.entries(node.properties)
              .slice(0, 4)
              .map(([k, v]) => (
                <p key={k} className="text-xs">
                  <span className="font-medium">{k}:</span> {String(v)}
                </p>
              ))}
          </div>
        </div>
      )}

      {linkedExcerpts.length > 0 && (
        <>
          <Separator />
          <div>
            <p className="text-xs text-muted-foreground mb-1">
              Linked excerpts ({linkedExcerpts.length})
            </p>
            <ScrollArea className="max-h-32">
              <div className="space-y-2">
                {linkedExcerpts.map((hit) => (
                  <p
                    key={hit.chunk_id}
                    className="text-xs text-muted-foreground italic border-l-2 border-border pl-2"
                  >
                    {hit.excerpt.slice(0, 120)}
                    {hit.excerpt.length > 120 ? "…" : ""}
                  </p>
                ))}
              </div>
            </ScrollArea>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// GraphViewer
// ---------------------------------------------------------------------------

export default function GraphViewer() {
  const { runData } = useRunContext();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<NodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance<Node<NodeData>, Edge> | null>(null);

  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [popoverAnchor, setPopoverAnchor] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Rebuild layout whenever graph_path changes
  const graphPath = runData?.graph_path;
  const prevPathRef = React.useRef<typeof graphPath>(undefined);

  React.useEffect(() => {
    if (!graphPath) return;
    if (graphPath === prevPathRef.current) return;
    prevPathRef.current = graphPath;

    const { rfNodes, rfEdges } = computeLayout(graphPath.nodes, graphPath.edges);
    setNodes(rfNodes);
    setEdges(rfEdges);

    // fitView after layout settles
    setTimeout(() => {
      rfInstance?.fitView({ padding: 0.2 });
    }, 100);
  }, [graphPath, rfInstance, setNodes, setEdges]);

  const onInit: OnInit<Node<NodeData>, Edge> = useCallback(
    (instance) => {
      setRfInstance(instance);
    },
    []
  );

  const handleNodeClick = useCallback(
    (event: React.MouseEvent, rfNode: Node) => {
      if (!runData) return;
      const nodeData = runData.graph_path.nodes.find(
        (n) => n.id === rfNode.id
      );
      if (!nodeData) return;

      setSelectedNode(nodeData);
      setPopoverAnchor({ x: event.clientX, y: event.clientY });
      setPopoverOpen(true);
    },
    [runData]
  );

  if (!runData || !runData.graph_path.nodes.length) {
    return (
      <div className="flex items-center justify-center h-full text-center px-4">
        <p className="text-sm text-muted-foreground">
          Submit a query to see the graph
        </p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onInit={onInit}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={3}
        attributionPosition="bottom-right"
      >
        <Background gap={16} size={1} />
        <Controls />
        <MiniMap
          nodeColor={(n) =>
            n.type === "entity" ? ENTITY_NODE_COLOUR : CHUNK_NODE_COLOUR
          }
          nodeStrokeWidth={2}
          zoomable
          pannable
        />
      </ReactFlow>

      {/* Node detail popover anchored at click position */}
      {popoverOpen && selectedNode && popoverAnchor && (
        <div
          className="fixed z-50"
          style={{ left: popoverAnchor.x + 8, top: popoverAnchor.y + 8 }}
        >
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <span />
            </PopoverTrigger>
            <PopoverContent
              className="w-80 p-4"
              side="right"
              onInteractOutside={() => setPopoverOpen(false)}
            >
              <NodeDetailPopover
                node={selectedNode}
                vectorHits={runData.evidence.vector_hits}
              />
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
}
