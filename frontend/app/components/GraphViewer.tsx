"use client";

// ============================================================
// GraphViewer.tsx — Neon knowledge graph on void canvas
// entity nodes: purple-glow circles
// chunk nodes: cyan-glow rectangles
// dark dot-grid background, glowing edges
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
import { ScrollArea } from "@/components/ui/scroll-area";

import { useRunContext } from "../lib/context";
import type { GraphNode, GraphEdge, VectorHit } from "../lib/api";

// ---------------------------------------------------------------------------
// Node colours — neon industrial palette
// ---------------------------------------------------------------------------

const ENTITY_BG    = "#1a0a2e";
const ENTITY_BORDER = "#9b55d4";
const ENTITY_TEXT  = "#c084fc";

const CHUNK_BG     = "#051a1a";
const CHUNK_BORDER  = "#08d4ef";
const CHUNK_TEXT   = "#67e8f9";

const EDGE_COLOURS: Record<GraphEdge["type"], string> = {
  mentions:      "#4f93f4",
  similarity:    "#0dce84",
  co_occurrence: "#9b55d4",
};

// ---------------------------------------------------------------------------
// Node data
// ---------------------------------------------------------------------------

interface NodeData extends Record<string, unknown> {
  label: string;
  nodeType: "entity" | "chunk";
  properties: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Entity node — circular, purple glow
// ---------------------------------------------------------------------------

function EntityNode({ data }: NodeProps) {
  const d = data as NodeData;
  return (
    <>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div
        style={{
          width: 92,
          height: 92,
          borderRadius: "50%",
          border: `2px solid ${ENTITY_BORDER}`,
          backgroundColor: ENTITY_BG,
          boxShadow: `0 0 14px ${ENTITY_BORDER}55, inset 0 0 10px ${ENTITY_BORDER}22`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "6px",
          cursor: "pointer",
        }}
        title={d.label}
      >
        <span
          style={{
            fontFamily: "var(--font-mono, monospace)",
            fontSize: "11px",
            fontWeight: 500,
            color: ENTITY_TEXT,
            lineHeight: "1.25",
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            wordBreak: "break-word",
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
// Chunk node — rectangle, cyan glow
// ---------------------------------------------------------------------------

function ChunkNode({ data }: NodeProps) {
  const d = data as NodeData;
  return (
    <>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div
        style={{
          width: 148,
          minHeight: 52,
          borderRadius: "2px",
          border: `1.5px solid ${CHUNK_BORDER}`,
          backgroundColor: CHUNK_BG,
          boxShadow: `0 0 12px ${CHUNK_BORDER}44, inset 0 0 8px ${CHUNK_BORDER}18`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "5px 8px",
          cursor: "pointer",
        }}
        title={d.label}
      >
        <span
          style={{
            fontFamily: "var(--font-mono, monospace)",
            fontSize: "11px",
            fontWeight: 400,
            color: CHUNK_TEXT,
            lineHeight: "1.3",
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            wordBreak: "break-word",
          }}
        >
          {d.label}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </>
  );
}

const nodeTypes: NodeTypes = {
  entity: EntityNode,
  chunk: ChunkNode,
};

// ---------------------------------------------------------------------------
// Layout: entity nodes top row, chunk nodes bottom row
// ---------------------------------------------------------------------------

function computeLayout(
  graphNodes: GraphNode[],
  graphEdges: GraphEdge[]
): { rfNodes: Node<NodeData>[]; rfEdges: Edge[] } {
  const entityNodes = graphNodes.filter((n) => n.type === "entity");
  const chunkNodes  = graphNodes.filter((n) => n.type === "chunk");

  const ENTITY_SPACING_X = 120;
  const CHUNK_SPACING_X  = 160;
  const ENTITY_ROW_Y     = 60;
  const CHUNK_ROW_Y      = 280;
  const CENTER_X         = 500;

  const rfNodes: Node<NodeData>[] = [
    ...entityNodes.map((n, i) => ({
      id: n.id,
      type: "entity" as const,
      position: {
        x: CENTER_X + i * ENTITY_SPACING_X - (entityNodes.length * ENTITY_SPACING_X) / 2,
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
        x: CENTER_X + i * CHUNK_SPACING_X - (chunkNodes.length * CHUNK_SPACING_X) / 2,
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
    label: e.weight !== null ? `${e.type} (${e.weight.toFixed(2)})` : e.type,
    style: {
      stroke: EDGE_COLOURS[e.type],
      strokeWidth: 1.5,
      filter: `drop-shadow(0 0 3px ${EDGE_COLOURS[e.type]}88)`,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: EDGE_COLOURS[e.type],
    },
    labelStyle: {
      fontFamily: "var(--font-mono, monospace)",
      fontSize: 10,
      fill: "#6b7e95",
    },
    labelBgStyle: { fill: "#0c1117", fillOpacity: 0.85 },
  }));

  return { rfNodes, rfEdges };
}

// ---------------------------------------------------------------------------
// Node detail popover
// ---------------------------------------------------------------------------

function NodeDetailPopover({
  node,
  vectorHits,
}: {
  node: GraphNode;
  vectorHits: VectorHit[];
}) {
  const nodeChunkId = node.id.startsWith("chunk:")
    ? node.id.slice("chunk:".length)
    : null;

  const linkedExcerpts = nodeChunkId
    ? vectorHits.filter((h) => h.chunk_id === nodeChunkId).slice(0, 3)
    : [];

  const isEntity = node.type === "entity";
  const accentColor = isEntity ? ENTITY_BORDER : CHUNK_BORDER;
  const accentText  = isEntity ? ENTITY_TEXT : CHUNK_TEXT;

  return (
    <div
      style={{
        fontFamily: "var(--font-mono, monospace)",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      {/* Type badge */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span
          style={{
            fontSize: "0.65rem",
            fontFamily: "var(--font-display, monospace)",
            fontWeight: 700,
            letterSpacing: "0.14em",
            padding: "1px 6px",
            border: `1px solid ${accentColor}88`,
            borderRadius: "2px",
            color: accentText,
            backgroundColor: `${accentColor}18`,
            boxShadow: `0 0 6px ${accentColor}33`,
          }}
        >
          {node.type.toUpperCase()}
        </span>
      </div>

      {/* Label */}
      <div>
        <p style={{ fontSize: "0.68rem", color: "hsl(var(--text-dim))", letterSpacing: "0.1em", marginBottom: "2px" }}>
          LABEL
        </p>
        <p style={{ fontSize: "0.93rem", color: "hsl(var(--text-primary))", wordBreak: "break-word", lineHeight: "1.4" }}>
          {node.label ?? node.id}
        </p>
      </div>

      {/* Properties */}
      {node.properties && Object.keys(node.properties).length > 0 && (
        <div>
          <p style={{ fontSize: "0.68rem", color: "hsl(var(--text-dim))", letterSpacing: "0.1em", marginBottom: "4px" }}>
            PROPERTIES
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {Object.entries(node.properties).slice(0, 4).map(([k, v]) => (
              <div key={k} style={{ display: "flex", gap: "6px", fontSize: "0.85rem" }}>
                <span style={{ color: "hsl(var(--text-secondary))", flexShrink: 0 }}>{k}:</span>
                <span style={{ color: "hsl(var(--text-primary))" }}>{String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Linked excerpts */}
      {linkedExcerpts.length > 0 && (
        <div>
          <div
            style={{
              height: 1,
              backgroundColor: "hsl(var(--border-base))",
              marginBottom: "8px",
            }}
          />
          <p style={{ fontSize: "0.68rem", color: "hsl(var(--text-dim))", letterSpacing: "0.1em", marginBottom: "5px" }}>
            LINKED EXCERPTS ({linkedExcerpts.length})
          </p>
          <ScrollArea style={{ maxHeight: "96px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {linkedExcerpts.map((hit) => (
                <p
                  key={hit.chunk_id}
                  style={{
                    fontSize: "0.80rem",
                    color: "hsl(var(--text-secondary))",
                    fontStyle: "italic",
                    lineHeight: "1.4",
                    borderLeft: `2px solid ${CHUNK_BORDER}66`,
                    paddingLeft: "7px",
                  }}
                >
                  {hit.excerpt.slice(0, 120)}{hit.excerpt.length > 120 ? "…" : ""}
                </p>
              ))}
            </div>
          </ScrollArea>
        </div>
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
  const [popoverAnchor, setPopoverAnchor] = useState<{ x: number; y: number } | null>(null);

  const graphPath = runData?.graph_path;
  const prevPathRef = React.useRef<typeof graphPath>(undefined);

  React.useEffect(() => {
    if (!graphPath) return;
    if (graphPath === prevPathRef.current) return;
    prevPathRef.current = graphPath;

    const { rfNodes, rfEdges } = computeLayout(graphPath.nodes, graphPath.edges);
    setNodes(rfNodes);
    setEdges(rfEdges);

    setTimeout(() => {
      rfInstance?.fitView({ padding: 0.2 });
    }, 100);
  }, [graphPath, rfInstance, setNodes, setEdges]);

  const onInit: OnInit<Node<NodeData>, Edge> = useCallback((instance) => {
    setRfInstance(instance);
  }, []);

  const handleNodeClick = useCallback(
    (event: React.MouseEvent, rfNode: Node) => {
      if (!runData) return;
      const nodeData = runData.graph_path.nodes.find((n) => n.id === rfNode.id);
      if (!nodeData) return;
      setSelectedNode(nodeData);
      setPopoverAnchor({ x: event.clientX, y: event.clientY });
      setPopoverOpen(true);
    },
    [runData]
  );

  if (!runData || !runData.graph_path.nodes.length) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full"
        style={{ gap: "10px", textAlign: "center", padding: "16px" }}
      >
        {/* Decorative node cluster hint */}
        <div style={{ position: "relative", width: 64, height: 44 }}>
          <div
            style={{
              position: "absolute",
              top: 0,
              left: "50%",
              transform: "translateX(-50%)",
              width: 24,
              height: 24,
              borderRadius: "50%",
              border: `1.5px solid ${ENTITY_BORDER}66`,
              backgroundColor: `${ENTITY_BG}`,
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              width: 28,
              height: 18,
              borderRadius: "2px",
              border: `1px solid ${CHUNK_BORDER}55`,
              backgroundColor: `${CHUNK_BG}`,
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: 0,
              right: 0,
              width: 28,
              height: 18,
              borderRadius: "2px",
              border: `1px solid ${CHUNK_BORDER}55`,
              backgroundColor: `${CHUNK_BG}`,
            }}
          />
        </div>

        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.78rem",
            color: "hsl(var(--text-dim))",
            letterSpacing: "0.12em",
          }}
        >
          GRAPH AWAITING DATA
          <br />
          <span style={{ fontSize: "0.68rem", opacity: 0.6 }}>
            submit a query to populate
          </span>
        </p>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
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
        <Background gap={20} size={1} color="hsl(210 22% 12%)" />
        <Controls />
        <MiniMap
          nodeColor={(n) => (n.type === "entity" ? ENTITY_BORDER : CHUNK_BORDER)}
          nodeStrokeWidth={2}
          maskColor="hsl(216 40% 3% / 0.7)"
          zoomable
          pannable
        />
      </ReactFlow>

      {/* Node detail popover */}
      {popoverOpen && selectedNode && popoverAnchor && (
        <div
          style={{
            position: "fixed",
            zIndex: 50,
            left: popoverAnchor.x + 10,
            top: popoverAnchor.y + 10,
          }}
        >
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <span />
            </PopoverTrigger>
            <PopoverContent
              className="w-72 p-4"
              side="right"
              onInteractOutside={() => setPopoverOpen(false)}
              style={{
                backgroundColor: "hsl(var(--bg-elevated))",
                border: "1px solid hsl(var(--border-strong))",
                borderRadius: "2px",
                boxShadow: "0 8px 32px hsl(216 40% 3% / 0.8)",
              }}
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
