"use client";

/**
 * LightRAGGraphViewer — Standalone React Flow graph for LightRAG knowledge graphs.
 * Do NOT modify GraphViewer.tsx — this is a completely separate component.
 * Uses dagre for automatic layout, SCADA theme colors, and minimap/controls.
 */

import React, { useCallback, useMemo } from "react";
import {
  ReactFlow,
  Node,
  Edge,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import type { LightRAGGraphNode, LightRAGGraphEdge } from "../lib/api";
import { Network } from "lucide-react";

// ── Node type → color mapping ──────────────────────────────────────────────────
const NODE_TYPE_CONFIG: Record<string, { color: string }> = {
  component: { color: "#6b7280" },
  supplier:  { color: "#a855f7" },
  engineer:  { color: "#3b82f6" },
  aircraft:  { color: "#0891b2" },
  product:   { color: "#0891b2" },
  part:      { color: "#6b7280" },
  defect:    { color: "#ef4444" },
  failure:   { color: "#ef4444" },
  device:    { color: "#0891b2" },
  hospital:  { color: "#a855f7" },
  doctor:    { color: "#3b82f6" },
  person:    { color: "#3b82f6" },
  entity:    { color: "#06b6d4" },
  default:   { color: "#06b6d4" },
};

function getNodeColor(type: string): string {
  return (NODE_TYPE_CONFIG[type] ?? NODE_TYPE_CONFIG.default).color;
}

// ── Dagre auto-layout ──────────────────────────────────────────────────────────
function applyDagreLayout(
  nodes: Node[],
  edges: Edge[],
  direction: "LR" | "TB" = "TB"
): Node[] {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction, nodesep: 60, ranksep: 80 });
  nodes.forEach((n) => dagreGraph.setNode(n.id, { width: 80, height: 40 }));
  edges.forEach((e) => dagreGraph.setEdge(e.source, e.target));
  dagre.layout(dagreGraph);
  return nodes.map((n) => {
    const pos = dagreGraph.node(n.id);
    return { ...n, position: { x: pos.x - 40, y: pos.y - 20 } };
  });
}

// ── Props ──────────────────────────────────────────────────────────────────────
interface LightRAGGraphViewerProps {
  nodes: LightRAGGraphNode[];
  edges: LightRAGGraphEdge[];
  onNodeClick: (node: { id: string; data: LightRAGGraphNode }) => void;
  loading?: boolean;
  domain: string;
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function LightRAGGraphViewer({
  nodes: rawNodes,
  edges: rawEdges,
  onNodeClick,
  loading = false,
  domain,
}: LightRAGGraphViewerProps) {
  // Convert API nodes to React Flow nodes
  const rfNodesRaw: Node[] = useMemo(
    () =>
      rawNodes.map((n) => {
        const size = Math.max(40, Math.min(80, 40 + n.weight * 10));
        const color = getNodeColor(n.type);
        return {
          id: n.id,
          position: { x: 0, y: 0 }, // overwritten by dagre
          data: { ...n, label: n.label },
          style: {
            background: color + "22",
            border: `1px solid ${color}`,
            color: color,
            borderRadius: 4,
            fontSize: 10,
            fontFamily: "JetBrains Mono, monospace",
            padding: "4px 8px",
            width: size,
            textAlign: "center" as const,
            whiteSpace: "nowrap" as const,
            overflow: "hidden" as const,
            textOverflow: "ellipsis" as const,
          },
        };
      }),
    [rawNodes]
  );

  // Convert API edges to React Flow edges
  const rfEdgesRaw: Edge[] = useMemo(
    () =>
      rawEdges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label || undefined,
        style: {
          stroke: "#0e7490",
          strokeWidth: Math.max(1, Math.min(4, e.weight)),
        },
        labelStyle: {
          fontSize: 9,
          fontFamily: "JetBrains Mono, monospace",
          fill: "#0e7490",
        },
      })),
    [rawEdges]
  );

  // Apply dagre layout
  const rfNodesLaid = useMemo(
    () => applyDagreLayout(rfNodesRaw, rfEdgesRaw, "TB"),
    [rfNodesRaw, rfEdgesRaw]
  );

  const [nodes, , onNodesChange] = useNodesState(rfNodesLaid);
  const [edges, , onEdgesChange] = useEdgesState(rfEdgesRaw);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onNodeClick({ id: node.id, data: node.data as unknown as LightRAGGraphNode });
    },
    [onNodeClick]
  );

  // Empty state
  if (!loading && rawNodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-cyan-700">
        <Network size={48} className="opacity-30" />
        <p className="font-[Orbitron] text-xs tracking-widest uppercase">
          Knowledge graph is empty
        </p>
        <p className="font-[Rajdhani] text-sm">
          Click INDEX DATA to extract entities and build the graph
        </p>
        <a
          href="https://github.com/HKUDS/LightRAG"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-cyan-600 hover:text-cyan-400 underline font-[JetBrains_Mono]"
        >
          Learn about LightRAG →
        </a>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          <p className="font-[Orbitron] text-cyan-600 text-xs tracking-widest uppercase">
            Loading graph...
          </p>
        </div>
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={handleNodeClick}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.1}
      maxZoom={2.5}
      proOptions={{ hideAttribution: true }}
    >
      <MiniMap
        nodeColor={(n) => getNodeColor((n.data as unknown as LightRAGGraphNode)?.type ?? "default")}
        maskColor="rgba(0,0,0,0.7)"
        style={{
          background: "#0f1623",
          border: "1px solid rgba(6,182,212,0.2)",
        }}
      />
      <Controls
        style={{
          background: "#0f1623",
          border: "1px solid rgba(6,182,212,0.2)",
        }}
      />
      <Background
        variant={BackgroundVariant.Dots}
        color="#1e293b"
        gap={20}
        size={1}
      />
    </ReactFlow>
  );
}
