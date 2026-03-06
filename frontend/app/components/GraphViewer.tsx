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
// Note: @xyflow/react/dist/style.css is imported globally in layout.tsx

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

import { useRunContext } from "../lib/context";
import { useDomain } from "../lib/domain-context";
import type { GraphNode, GraphEdge, GraphPath, VectorHit } from "../lib/api";

// ---------------------------------------------------------------------------
// Build a synthetic graph from vector hits when the backend graph is empty.
// Produces chunk nodes (one per hit) + similarity edges between adjacent hits.
// ---------------------------------------------------------------------------

function buildSyntheticGraph(hits: VectorHit[]): GraphPath {
  const nodes: GraphNode[] = hits.map((h) => ({
    id: `chunk:${h.chunk_id}`,
    type: "chunk" as const,
    label: h.excerpt.slice(0, 80) || h.chunk_id,
    properties: {
      incident_id: h.incident_id,
      score: h.score,
      severity: h.metadata.severity ?? null,
      event_date: h.metadata.event_date ?? null,
    },
  }));

  // Connect consecutive hits with similarity edges (they're already ranked by score)
  const edges: GraphEdge[] = [];
  for (let i = 0; i < hits.length - 1; i++) {
    const a = hits[i];
    const b = hits[i + 1];
    // Approximate similarity: average of their individual scores (both vs same query)
    const weight = Math.round(((a.score + b.score) / 2) * 100) / 100;
    edges.push({
      id: `sim:${a.chunk_id.slice(-8)}:${b.chunk_id.slice(-8)}`,
      from_node: `chunk:${a.chunk_id}`,
      to_node: `chunk:${b.chunk_id}`,
      type: "similarity" as const,
      weight,
    });
  }

  return { nodes, edges };
}

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
// Static mock graphs — shown before any real query is submitted
// ---------------------------------------------------------------------------

const AIRCRAFT_GRAPH: GraphPath = {
  nodes: [
    { id: "e:hydraulic",    type: "entity", label: "Hydraulic System",  properties: { category: "System",  risk: "High"   } },
    { id: "e:avionics",     type: "entity", label: "Avionics",          properties: { category: "System",  risk: "Medium" } },
    { id: "e:seal-fail",    type: "entity", label: "Seal Failure",      properties: { category: "Defect",  occurrences: 34 } },
    { id: "e:corrosion",    type: "entity", label: "Corrosion",         properties: { category: "Defect",  occurrences: 21 } },
    { id: "e:avx-short",   type: "entity", label: "Short Circuit",     properties: { category: "Defect",  occurrences: 18 } },
    { id: "chunk:INC-2847", type: "chunk",  label: "INC-2847: Hydraulic leak near actuator; seal degradation confirmed",           properties: { severity: "High",     date: "2024-11-14" } },
    { id: "chunk:INC-3012", type: "chunk",  label: "INC-3012: Intermittent short in avionics harness; chafing observed",           properties: { severity: "Critical", date: "2024-12-01" } },
    { id: "chunk:INC-2901", type: "chunk",  label: "INC-2901: Corrosion on fastener around skin panel; lot quarantined",           properties: { severity: "Medium",   date: "2024-11-22" } },
    { id: "chunk:INC-3156", type: "chunk",  label: "INC-3156: Seal replaced on actuator; pressure restored to nominal spec",       properties: { severity: "Low",      date: "2025-01-08" } },
  ],
  edges: [
    { id: "ae1", from_node: "e:hydraulic",    to_node: "chunk:INC-2847", type: "mentions",      weight: 0.92 },
    { id: "ae2", from_node: "e:avionics",     to_node: "chunk:INC-3012", type: "mentions",      weight: 0.88 },
    { id: "ae3", from_node: "e:corrosion",    to_node: "chunk:INC-2901", type: "mentions",      weight: 0.85 },
    { id: "ae4", from_node: "e:seal-fail",    to_node: "chunk:INC-2847", type: "mentions",      weight: 0.95 },
    { id: "ae5", from_node: "e:seal-fail",    to_node: "chunk:INC-3156", type: "similarity",    weight: 0.78 },
    { id: "ae6", from_node: "chunk:INC-2847", to_node: "chunk:INC-3156", type: "similarity",    weight: 0.81 },
    { id: "ae7", from_node: "e:hydraulic",    to_node: "e:seal-fail",    type: "co_occurrence", weight: 0.90 },
    { id: "ae8", from_node: "e:avx-short",   to_node: "chunk:INC-3012", type: "mentions",      weight: 0.93 },
  ],
};

const MEDICAL_GRAPH: GraphPath = {
  nodes: [
    { id: "e:cardiology",   type: "entity", label: "Cardiology",         properties: { specialty: "Cardiac",    cases: 38 } },
    { id: "e:neurology",    type: "entity", label: "Neurology",          properties: { specialty: "Neuro",      cases: 22 } },
    { id: "e:troponin",     type: "entity", label: "Troponin Elevation", properties: { category: "Biomarker",  sensitivity: "High"   } },
    { id: "e:st-elev",      type: "entity", label: "ST-Elevation",       properties: { category: "ECG Finding", urgency: "Critical" } },
    { id: "e:bnp",          type: "entity", label: "Elevated BNP",       properties: { category: "Biomarker",  threshold: ">400 pg/mL" } },
    { id: "chunk:CASE-001", type: "chunk",  label: "CASE-001: Chest pain, ST-elevation, troponin positive — STEMI protocol initiated",          properties: { severity: "Critical", specialty: "Cardiology" } },
    { id: "chunk:CASE-002", type: "chunk",  label: "CASE-002: Dyspnoea, bilateral crackles, elevated BNP — acute decompensated heart failure",   properties: { severity: "High",     specialty: "Cardiology" } },
    { id: "chunk:CASE-003", type: "chunk",  label: "CASE-003: Sudden severe headache, neck stiffness, photophobia — subarachnoid haemorrhage",   properties: { severity: "Critical", specialty: "Neurology"  } },
    { id: "chunk:CASE-004", type: "chunk",  label: "CASE-004: Post-op bradycardia, pacing threshold elevated — pacemaker review initiated",      properties: { severity: "High",     specialty: "Cardiology" } },
  ],
  edges: [
    { id: "me1", from_node: "e:cardiology",   to_node: "chunk:CASE-001", type: "mentions",      weight: 0.96 },
    { id: "me2", from_node: "e:troponin",     to_node: "chunk:CASE-001", type: "mentions",      weight: 0.94 },
    { id: "me3", from_node: "e:st-elev",      to_node: "chunk:CASE-001", type: "mentions",      weight: 0.97 },
    { id: "me4", from_node: "e:bnp",          to_node: "chunk:CASE-002", type: "mentions",      weight: 0.89 },
    { id: "me5", from_node: "e:cardiology",   to_node: "chunk:CASE-002", type: "mentions",      weight: 0.91 },
    { id: "me6", from_node: "e:cardiology",   to_node: "chunk:CASE-004", type: "mentions",      weight: 0.82 },
    { id: "me7", from_node: "e:neurology",    to_node: "chunk:CASE-003", type: "mentions",      weight: 0.95 },
    { id: "me8", from_node: "chunk:CASE-001", to_node: "chunk:CASE-002", type: "similarity",    weight: 0.74 },
    { id: "me9", from_node: "e:troponin",     to_node: "e:st-elev",      type: "co_occurrence", weight: 0.88 },
    { id: "me10",from_node: "e:bnp",          to_node: "e:cardiology",   type: "co_occurrence", weight: 0.93 },
  ],
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
  graphEdges: GraphEdge[],
  hitByChunkId?: Map<string, VectorHit>
): { rfNodes: Node<NodeData>[]; rfEdges: Edge[] } {
  const entityNodes = graphNodes.filter((n) => n.type === "entity");
  const chunkNodes  = graphNodes.filter((n) => n.type === "chunk");

  const ENTITY_SPACING_X = 120;
  const CHUNK_SPACING_X  = 180;
  const CHUNK_SPACING_Y  = 120;
  const ENTITY_ROW_Y     = 60;
  const CHUNK_ROW_Y      = 280;
  const CENTER_X         = 500;

  // When there are no entity nodes (synthetic graph from vector hits), arrange
  // chunk nodes in a grid instead of a single long horizontal row.
  const chunkCols = entityNodes.length === 0
    ? Math.ceil(Math.sqrt(chunkNodes.length))
    : chunkNodes.length;
  const gridWidth  = chunkCols * CHUNK_SPACING_X;
  const gridStartY = entityNodes.length === 0 ? 40 : CHUNK_ROW_Y;

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
    ...chunkNodes.map((n, i) => {
      // Prefer the vector hit excerpt (more descriptive) over the DB-stored label
      const chunkId = n.id.startsWith("chunk:") ? n.id.slice("chunk:".length) : n.id;
      const hit = hitByChunkId?.get(chunkId);
      const rawLabel = hit?.excerpt ?? n.label ?? n.id;
      const col = i % chunkCols;
      const row = Math.floor(i / chunkCols);
      return {
        id: n.id,
        type: "chunk" as const,
        position: {
          x: CENTER_X + col * CHUNK_SPACING_X - gridWidth / 2,
          y: gridStartY + row * CHUNK_SPACING_Y,
        },
        data: {
          label: rawLabel.slice(0, 60),
          nodeType: n.type,
          properties: n.properties,
        } as NodeData,
      };
    }),
  ];


  const rfEdges: Edge[] = graphEdges.map((e) => {
    const colour = EDGE_COLOURS[e.type] ?? "#4f93f4";
    return {
      id: e.id,
      source: e.from_node,
      target: e.to_node,
      type: "smoothstep",
      // No inline labels — they overlap when many edges share the same path.
      // Edge type + weight visible in the legend and on node click.
      style: {
        stroke: colour,
        strokeWidth: 2,
        opacity: 0.85,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: colour,
      },
    };
  });

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
  const { domain } = useDomain();

  // Detect the actual queried domain from vector hit metadata so the graph
  // mock/badge matches the query result even if the UI selector changed.
  const queryDomain: string =
    runData?.evidence?.vector_hits?.[0]?.metadata?.domain ?? domain;
  const isMedical = queryDomain === "medical";

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<NodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance<Node<NodeData>, Edge> | null>(null);

  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [popoverAnchor, setPopoverAnchor] = useState<{ x: number; y: number } | null>(null);

  // Priority order for graph data:
  //  1. Real graph returned by backend (nodes.length > 0) — always query-specific
  //  2. Synthetic graph built from vector hits — query-specific, shown after a query
  //     when the backend graph is empty (graph not yet built in DB, or expansion failed)
  //  3. Static domain mock — shown only before the first query (no runData yet)
  const hasRealGraph = (runData?.graph_path?.nodes?.length ?? 0) > 0;
  const rawVectorHits = runData?.evidence?.vector_hits;
  const vectorHitsForGraph = React.useMemo(
    () => rawVectorHits ?? [],
    [rawVectorHits]
  );
  const hasSyntheticGraph = !hasRealGraph && vectorHitsForGraph.length > 0;

  const graphPath: GraphPath = React.useMemo(() => {
    if (hasRealGraph) return runData!.graph_path;
    if (hasSyntheticGraph) return buildSyntheticGraph(vectorHitsForGraph);
    return isMedical ? MEDICAL_GRAPH : AIRCRAFT_GRAPH;
  }, [hasRealGraph, hasSyntheticGraph, vectorHitsForGraph, isMedical, runData]);

  // isMockGraph = true only for the static pre-query sample data (not synthetic)
  const isMockGraph = !hasRealGraph && !hasSyntheticGraph;

  // Build a chunk_id → VectorHit map for label enrichment in computeLayout
  const hitByChunkId = React.useMemo(() => {
    const map = new Map<string, VectorHit>();
    for (const hit of vectorHitsForGraph) {
      map.set(hit.chunk_id, hit);
    }
    return map;
  }, [vectorHitsForGraph]);

  // Re-apply layout whenever graphPath changes OR when rfInstance becomes
  // available (ReactFlow measures node dimensions on mount; edges can only
  // be drawn after that measurement, so we must set edges again then).
  React.useEffect(() => {
    if (!graphPath) return;
    const { rfNodes, rfEdges } = computeLayout(graphPath.nodes, graphPath.edges, hitByChunkId);
    setNodes(rfNodes);
    setEdges(rfEdges);
    if (rfInstance) {
      setTimeout(() => rfInstance.fitView({ padding: 0.2 }), 100);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphPath, rfInstance, hitByChunkId]);

  const onInit: OnInit<Node<NodeData>, Edge> = useCallback((instance) => {
    setRfInstance(instance);
  }, []);

  const handleNodeClick = useCallback(
    (event: React.MouseEvent, rfNode: Node) => {
      const nodeData = graphPath.nodes.find((n) => n.id === rfNode.id);
      if (!nodeData) return;
      setSelectedNode(nodeData);
      setPopoverAnchor({ x: event.clientX, y: event.clientY });
      setPopoverOpen(true);
    },
    [graphPath]
  );

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

      {/* Domain / data source badge */}
      <div style={{
        position: "absolute",
        top: 8,
        left: 8,
        zIndex: 10,
        display: "flex",
        gap: "5px",
        alignItems: "center",
        pointerEvents: "none",
      }}>
        <span style={{
          fontFamily: "var(--font-display)",
          fontSize: "0.44rem",
          fontWeight: 700,
          letterSpacing: "0.16em",
          padding: "2px 7px",
          borderRadius: "2px",
          border: `1px solid ${isMedical ? CHUNK_BORDER + "88" : "#0dce8488"}`,
          backgroundColor: isMedical ? CHUNK_BG : "#051a0e",
          color: isMedical ? CHUNK_TEXT : "#0dce84",
        }}>
          {isMedical ? "⚕ CLINICAL GRAPH" : "⚙ AIRCRAFT GRAPH"}
        </span>
        <span style={{
          fontFamily: "var(--font-display)",
          fontSize: "0.44rem",
          fontWeight: 700,
          letterSpacing: "0.14em",
          padding: "2px 7px",
          borderRadius: "2px",
          border: `1px solid ${isMockGraph ? "#9b55d488" : hasSyntheticGraph ? "#f59e0b88" : "#0dce8488"}`,
          backgroundColor: isMockGraph ? "#1a0a2e" : hasSyntheticGraph ? "#1a0e00" : "#051a0e",
          color: isMockGraph ? "#c084fc" : hasSyntheticGraph ? "#f59e0b" : "#0dce84",
        }}>
          {isMockGraph ? "SAMPLE DATA" : hasSyntheticGraph ? "VECTOR HITS" : "LIVE QUERY"}
        </span>
      </div>

      {/* Edge colour legend — bottom-left */}
      <div style={{
        position: "absolute", bottom: 44, left: 8, zIndex: 10,
        display: "flex", flexDirection: "column", gap: "3px",
        pointerEvents: "none",
      }}>
        {(Object.entries(EDGE_COLOURS) as [string, string][]).map(([type, colour]) => (
          <div key={type} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <div style={{ width: 18, height: 2, backgroundColor: colour, borderRadius: 1 }} />
            <span style={{
              fontFamily: "var(--font-display)", fontSize: "0.38rem",
              letterSpacing: "0.12em", color: colour, opacity: 0.8,
            }}>
              {type.replace("_", " ").toUpperCase()}
            </span>
          </div>
        ))}
      </div>

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
                vectorHits={runData?.evidence.vector_hits ?? []}
              />
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
}
