"use client";

import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
} from "react";
import * as d3 from "d3";
import { useGraphData, type MergedNode, type MergedEdge, type NodeDomain } from "./useGraphData";

// ---------------------------------------------------------------------------
// Types for D3 simulation
// ---------------------------------------------------------------------------

interface SimNode extends MergedNode {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

interface SimLink {
  source: SimNode | string;
  target: SimNode | string;
  domain: NodeDomain;
  weight: number;
  id: string;
  label: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DOMAIN_COLORS: Record<NodeDomain, string> = {
  aircraft: "#00d4ff",
  medical: "#a855f7",
  bridge: "#f59e0b",
};
const UNCONNECTED_COLOR = "#374151";
const MIN_RADIUS = 4;
const MAX_RADIUS = 18;

// ---------------------------------------------------------------------------
// SidePanel component
// ---------------------------------------------------------------------------

interface SidePanelProps {
  node: MergedNode;
  edges: MergedEdge[];
  nodes: MergedNode[];
  onClose: () => void;
  onNavigate: (node: MergedNode) => void;
}

function SidePanel({ node, edges, nodes, onClose, onNavigate }: SidePanelProps) {
  const connectedIds = useMemo<Set<string>>(() => {
    const ids = new Set<string>();
    for (const e of edges) {
      const src = typeof e.source === "string" ? e.source : (e.source as MergedNode).id;
      const tgt = typeof e.target === "string" ? e.target : (e.target as MergedNode).id;
      if (src === node.id) ids.add(tgt);
      if (tgt === node.id) ids.add(src);
    }
    return ids;
  }, [edges, node.id]);

  const connectedNodes = useMemo<MergedNode[]>(() => {
    return nodes
      .filter((n) => connectedIds.has(n.id))
      .slice(0, 10);
  }, [nodes, connectedIds]);

  const domainColor = DOMAIN_COLORS[node.domain];

  const handleQueryNode = useCallback(() => {
    const pendingDomain = node.domain === "medical" ? "medical" : "aircraft";
    localStorage.setItem("pending_query", node.label);
    localStorage.setItem("pending_domain", pendingDomain);
    window.open("/", "_blank");
  }, [node.label, node.domain]);

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        width: 280,
        height: "100%",
        background: "rgba(10,10,15,0.97)",
        borderLeft: `1px solid ${domainColor}40`,
        display: "flex",
        flexDirection: "column",
        zIndex: 100,
        fontFamily: "JetBrains Mono, monospace",
        animation: "slideInRight 0.18s ease-out",
      }}
    >
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);   opacity: 1; }
        }
      `}</style>

      {/* Header */}
      <div
        style={{
          padding: "12px 14px",
          borderBottom: `1px solid ${domainColor}30`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <span style={{ color: domainColor, fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase" }}>
          NODE DETAIL
        </span>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: "#6b7280",
            cursor: "pointer",
            fontSize: 16,
            lineHeight: 1,
            padding: "0 2px",
          }}
          aria-label="Close panel"
        >
          ×
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: "14px", overflowY: "auto", flex: 1 }}>
        {/* ID */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ color: "#4b5563", fontSize: 9, letterSpacing: "0.12em", marginBottom: 2 }}>ID</div>
          <div style={{ color: "#9ca3af", fontSize: 10, wordBreak: "break-all" }}>{node.id}</div>
        </div>

        {/* Label */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ color: "#4b5563", fontSize: 9, letterSpacing: "0.12em", marginBottom: 2 }}>LABEL</div>
          <div style={{ color: "#e5e7eb", fontSize: 12, fontWeight: 600 }}>{node.label}</div>
        </div>

        {/* Domain badge */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ color: "#4b5563", fontSize: 9, letterSpacing: "0.12em", marginBottom: 4 }}>DOMAIN</div>
          <span
            style={{
              background: `${domainColor}20`,
              border: `1px solid ${domainColor}60`,
              color: domainColor,
              fontSize: 9,
              letterSpacing: "0.12em",
              padding: "2px 8px",
              borderRadius: 3,
              textTransform: "uppercase",
            }}
          >
            {node.domain}
          </span>
        </div>

        {/* Type */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ color: "#4b5563", fontSize: 9, letterSpacing: "0.12em", marginBottom: 2 }}>TYPE</div>
          <div style={{ color: "#9ca3af", fontSize: 10 }}>{node.type}</div>
        </div>

        {/* Degree */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ color: "#4b5563", fontSize: 9, letterSpacing: "0.12em", marginBottom: 2 }}>DEGREE</div>
          <div style={{ color: "#9ca3af", fontSize: 10 }}>{node.degree}</div>
        </div>

        {/* Description */}
        {node.description && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ color: "#4b5563", fontSize: 9, letterSpacing: "0.12em", marginBottom: 4 }}>DESCRIPTION</div>
            <div style={{ color: "#6b7280", fontSize: 9, lineHeight: 1.6 }}>{node.description}</div>
          </div>
        )}

        {/* Connected nodes */}
        {connectedNodes.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ color: "#4b5563", fontSize: 9, letterSpacing: "0.12em", marginBottom: 6 }}>
              CONNECTED NODES ({connectedIds.size})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {connectedNodes.map((cn) => (
                <button
                  key={cn.id}
                  onClick={() => onNavigate(cn)}
                  style={{
                    background: `${DOMAIN_COLORS[cn.domain]}10`,
                    border: `1px solid ${DOMAIN_COLORS[cn.domain]}30`,
                    color: DOMAIN_COLORS[cn.domain],
                    fontSize: 9,
                    padding: "4px 8px",
                    borderRadius: 3,
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "JetBrains Mono, monospace",
                    letterSpacing: "0.05em",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={cn.label}
                >
                  {cn.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer action */}
      <div style={{ padding: "12px 14px", borderTop: `1px solid ${domainColor}20`, flexShrink: 0 }}>
        <button
          onClick={handleQueryNode}
          style={{
            width: "100%",
            background: `${domainColor}18`,
            border: `1px solid ${domainColor}50`,
            color: domainColor,
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 9,
            letterSpacing: "0.15em",
            padding: "8px 0",
            borderRadius: 4,
            cursor: "pointer",
            textTransform: "uppercase",
          }}
        >
          QUERY THIS NODE
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main ObsidianGraph component
// ---------------------------------------------------------------------------

export default function ObsidianGraph() {
  const { nodes, edges, loading, error, aircraftEmpty, medicalEmpty, indexingDomains, refetch, buildIndex } =
    useGraphData();

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [visibleDomains, setVisibleDomains] = useState<Set<string>>(
    new Set(["aircraft", "medical", "bridge"])
  );
  const [paused, setPaused] = useState(false);
  const [zoomK, setZoomK] = useState(1);
  const [selectedNode, setSelectedNode] = useState<MergedNode | null>(null);
  const [slowStart, setSlowStart] = useState(false);

  // Fetch on mount
  useEffect(() => {
    refetch();
    const timer = setTimeout(() => setSlowStart(true), 5000);
    return () => clearTimeout(timer);
  }, [refetch]);

  // -------------------------------------------------------------------------
  // Derived filtered sets — MEMOIZED (requirement 18 & 20)
  // -------------------------------------------------------------------------

  const visibleNodes = useMemo<MergedNode[]>(() => {
    return nodes.filter((n) => visibleDomains.has(n.domain));
  }, [nodes, visibleDomains]);

  const visibleLinks = useMemo<MergedEdge[]>(() => {
    const nodeIds = new Set(visibleNodes.map((n) => n.id));
    return edges.filter(
      (e) =>
        visibleDomains.has(e.domain) &&
        nodeIds.has(typeof e.source === "string" ? e.source : (e.source as MergedNode).id) &&
        nodeIds.has(typeof e.target === "string" ? e.target : (e.target as MergedNode).id)
    );
  }, [edges, visibleNodes, visibleDomains]);

  const maxDegree = useMemo<number>(
    () => Math.max(1, ...visibleNodes.map((n) => n.degree)),
    [visibleNodes]
  );

  // Memoized copies passed to D3 (D3 mutates these — isolate from React state)
  const simNodes = useMemo<SimNode[]>(
    () => visibleNodes.map((n) => ({ ...n })),
    [visibleNodes]
  );

  const simLinks = useMemo<SimLink[]>(
    () =>
      visibleLinks.map((e) => ({
        ...e,
        source: typeof e.source === "object" ? (e.source as { id: string }).id : e.source,
        target: typeof e.target === "object" ? (e.target as { id: string }).id : e.target,
      })),
    [visibleLinks]
  );

  // Stabilise mode so a one-node difference at the boundary doesn't cause
  // both effects to teardown/restart on the same render.
  const USE_CANVAS = useMemo(() => simNodes.length > 500, [simNodes.length]);

  // -------------------------------------------------------------------------
  // Stats
  // -------------------------------------------------------------------------

  const statsAircraft = useMemo(
    () => nodes.filter((n) => n.domain === "aircraft").length,
    [nodes]
  );
  const statsMedical = useMemo(
    () => nodes.filter((n) => n.domain === "medical").length,
    [nodes]
  );

  // -------------------------------------------------------------------------
  // Radius scale
  // -------------------------------------------------------------------------

  const radiusOf = useCallback(
    (d: SimNode) => {
      if (d.degree === 0) return MIN_RADIUS;
      return MIN_RADIUS + ((d.degree / maxDegree) * (MAX_RADIUS - MIN_RADIUS));
    },
    [maxDegree]
  );

  const domainColor = useCallback(
    (domain: NodeDomain) => DOMAIN_COLORS[domain] ?? UNCONNECTED_COLOR,
    []
  );

  // -------------------------------------------------------------------------
  // Zoom ref — shared between the useEffect and controls
  // -------------------------------------------------------------------------

  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const simRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null);
  const pausedRef = useRef(paused);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  // -------------------------------------------------------------------------
  // Canvas renderer — activates when simNodes.length > 500
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!USE_CANVAS) return;
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d")!;
    const width  = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width  = width  * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const nodesCopy: SimNode[] = visibleNodes.map((n) => ({ ...n }));
    const linksCopy: SimLink[] = visibleLinks.map((l) => ({
      ...l,
      source: typeof l.source === "object" ? (l.source as { id: string }).id : l.source,
      target: typeof l.target === "object" ? (l.target as { id: string }).id : l.target,
    }));

    const sim = d3
      .forceSimulation<SimNode>(nodesCopy)
      .alphaDecay(0.04)
      .velocityDecay(0.4)
      .force("link", d3.forceLink<SimNode, SimLink>(linksCopy).id((d) => d.id).distance(80).strength(0.4))
      .force("charge", d3.forceManyBody<SimNode>().strength(-120).theta(0.9))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide<SimNode>().radius((d) => radiusOf(d) + 4));

    // Pre-warm: limited ticks to avoid blocking the main thread on large graphs
    sim.stop();
    for (let i = 0; i < 30; i++) sim.tick();

    function draw() {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#0a0a0f";
      ctx.fillRect(0, 0, width, height);

      // Draw edges
      for (const l of linksCopy) {
        const s = l.source as SimNode;
        const t = l.target as SimNode;
        // Use null/undefined check — !s.x is falsy for x=0 (center-left nodes)
        if (s.x == null || t.x == null) continue;
        const mx = (s.x + t.x) / 2;
        const my = (s.y! + t.y!) / 2 - 30;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y!);
        ctx.quadraticCurveTo(mx, my, t.x, t.y!);
        ctx.strokeStyle = domainColor(l.domain) + "4d";
        ctx.lineWidth = Math.max(0.5, Math.min(3, l.weight));
        ctx.globalAlpha = 0.3;
        ctx.stroke();
      }

      // Draw nodes
      ctx.globalAlpha = 1;
      for (const n of nodesCopy) {
        if (n.x == null) continue;
        const r = radiusOf(n);
        const color = domainColor(n.domain);
        ctx.shadowBlur = 8;
        ctx.shadowColor = color;
        ctx.beginPath();
        ctx.arc(n.x, n.y!, r, 0, 2 * Math.PI);
        ctx.fillStyle = color + "33";
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }

    simRef.current = sim as unknown as d3.Simulation<SimNode, SimLink>;
    sim.on("tick", draw).alpha(0.3).restart();
    draw();

    return () => { sim.stop(); };
    // radiusOf intentionally omitted — changes only when maxDegree changes (already listed).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [USE_CANVAS, visibleNodes, visibleLinks, maxDegree]);

  // -------------------------------------------------------------------------
  // D3 force simulation — re-runs when filtered sets or maxDegree change
  // -------------------------------------------------------------------------

  useEffect(() => {
    // Canvas path is active — do not also run the SVG simulation.
    if (USE_CANVAS) return;
    const svg = d3.select(svgRef.current!);
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight - 46;

    // Clear previous render
    svg.selectAll("*").remove();

    // ---- Defs: radial gradient + glow filters ----
    const defs = svg.append("defs");

    // Radial background gradient
    const radGrad = defs
      .append("radialGradient")
      .attr("id", "bg-glow")
      .attr("cx", "50%")
      .attr("cy", "50%")
      .attr("r", "50%");
    radGrad.append("stop").attr("offset", "0%").attr("stop-color", "#0d1a2e").attr("stop-opacity", 1);
    radGrad.append("stop").attr("offset", "100%").attr("stop-color", "#0a0a0f").attr("stop-opacity", 1);

    // Glow filters
    const glowDomains: Array<{ id: string; color: string }> = [
      { id: "glow-aircraft", color: "#00d4ff" },
      { id: "glow-medical", color: "#a855f7" },
      { id: "glow-bridge", color: "#f59e0b" },
    ];
    for (const { id, color } of glowDomains) {
      const filter = defs.append("filter").attr("id", id).attr("x", "-50%").attr("y", "-50%").attr("width", "200%").attr("height", "200%");
      filter
        .append("feGaussianBlur")
        .attr("in", "SourceGraphic")
        .attr("stdDeviation", "3")
        .attr("result", "blur");
      const merge = filter.append("feMerge");
      merge.append("feMergeNode").attr("in", "blur");
      merge.append("feMergeNode").attr("in", "SourceGraphic");
    }

    // ---- Background rect ----
    svg
      .append("rect")
      .attr("width", "100%")
      .attr("height", "100%")
      .attr("fill", "url(#bg-glow)");

    // ---- Label visibility style ----
    svg
      .append("style")
      .text(`.obs-node-label { opacity: ${zoomK >= 0.6 ? 1 : 0}; transition: opacity 0.2s; }`);

    // ---- Main group (zoom target) ----
    const g = svg.append("g").attr("class", "zoom-g");

    // Use local copies so that D3's in-place mutation (x/y on nodes,
    // source/target object replacement on links) does not corrupt the React memos.
    // These copies are declared here and reused by the simulation below.
    const svgNodes: SimNode[] = simNodes.map((n) => ({ ...n }));
    const svgLinks: SimLink[] = simLinks.map((l) => ({ ...l }));

    // ---- Links ----
    // Bind to svgLinks so ticked() reads D3-mutated source/target objects.
    const linkG = g.append("g").attr("class", "links");
    const linkSel = linkG
      .selectAll<SVGPathElement, SimLink>("path")
      .data(svgLinks, (d) => d.id)
      .join("path")
      .attr("fill", "none")
      .attr("stroke", (d) => DOMAIN_COLORS[d.domain] ?? "#374151")
      .attr("stroke-width", (d) => Math.max(0.5, d.weight * 0.4))
      .attr("stroke-opacity", 0.3)
      .attr("stroke-linecap", "round");

    // ---- Nodes group ----
    // Bind to svgNodes so ticked() reads D3-mutated x/y values.
    const nodeG = g.append("g").attr("class", "nodes");
    const nodeSel = nodeG
      .selectAll<SVGGElement, SimNode>("g.node")
      .data(svgNodes, (d) => d.id)
      .join("g")
      .attr("class", "node")
      .style("cursor", "pointer");

    // Circle
    nodeSel
      .append("circle")
      .attr("r", radiusOf)
      .attr("fill", (d) => (d.degree > 0 ? DOMAIN_COLORS[d.domain] : UNCONNECTED_COLOR))
      .attr("fill-opacity", 0.85)
      .attr("filter", (d) => `url(#glow-${d.domain})`)
      .attr("stroke", (d) => DOMAIN_COLORS[d.domain] ?? UNCONNECTED_COLOR)
      .attr("stroke-width", 0.5)
      .attr("stroke-opacity", 0.6);

    // Label
    nodeSel
      .append("text")
      .attr("class", "obs-node-label")
      .attr("dy", (d) => radiusOf(d) + 10)
      .attr("text-anchor", "middle")
      .attr("font-family", "JetBrains Mono, monospace")
      .attr("font-size", 9)
      .attr("fill", "#9ca3af")
      .attr("pointer-events", "none")
      .text((d) => {
        const lbl = d.label;
        return lbl.length > 24 ? lbl.slice(0, 21) + "..." : lbl;
      });

    // ---- Drag behaviour ----
    const drag = d3
      .drag<SVGGElement, SimNode>()
      .on("start", (event, d) => {
        if (!event.active) sim.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) sim.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    nodeSel.call(drag);

    // ---- Hover ----
    nodeSel
      .on("mouseenter", function (_, d) {
        const hoverId = d.id;
        const connectedIds = new Set<string>();
        // Use svgLinks (D3-mutated copies) — source/target may be objects after tick
        svgLinks.forEach((l) => {
          const src = typeof l.source === "object" ? (l.source as SimNode).id : l.source;
          const tgt = typeof l.target === "object" ? (l.target as SimNode).id : l.target;
          if (src === hoverId) connectedIds.add(tgt);
          if (tgt === hoverId) connectedIds.add(src);
        });

        nodeSel.select("circle").attr("transform", (nd) =>
          nd.id === hoverId ? "scale(1.4)" : "scale(1)"
        );
        nodeSel.filter((nd) => nd.id === hoverId).raise();

        linkSel.attr("stroke-opacity", (l) => {
          const src = typeof l.source === "object" ? (l.source as SimNode).id : l.source;
          const tgt = typeof l.target === "object" ? (l.target as SimNode).id : l.target;
          if (src === hoverId || tgt === hoverId) return 0.9;
          return 0.05;
        });
      })
      .on("mouseleave", function () {
        nodeSel.select("circle").attr("transform", "scale(1)");
        linkSel.attr("stroke-opacity", 0.3);
      })
      .on("click", (_, d) => {
        setSelectedNode((prev) => (prev?.id === d.id ? null : (d as MergedNode)));
      });

    // ---- Force simulation ----
    // svgNodes and svgLinks were declared above when binding D3 selections.
    // Reuse them here — D3 will mutate them in-place (x/y on nodes,
    // source/target string→object on links) which is expected and safe
    // because these are local copies, not the React memos.
    const sim = d3
      .forceSimulation<SimNode, SimLink>(svgNodes)
      .alphaDecay(0.04)
      .velocityDecay(0.4)
      .force(
        "link",
        d3
          .forceLink<SimNode, SimLink>(svgLinks)
          .id((d) => d.id)
          .distance(60)
          .strength(0.4)
      )
      .force("charge", d3.forceManyBody<SimNode>().strength(-120).theta(0.9))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide<SimNode>().radius((d) => radiusOf(d) + 4));

    // Pre-warm: limited ticks to avoid blocking the main thread on large graphs
    sim.stop();
    for (let i = 0; i < 30; i++) sim.tick();

    // Position elements after pre-warm
    const ticked = () => {
      linkSel.attr("d", (d) => {
        const src = d.source as SimNode;
        const tgt = d.target as SimNode;
        const sx = src.x ?? 0;
        const sy = src.y ?? 0;
        const tx = tgt.x ?? 0;
        const ty = tgt.y ?? 0;
        const mx = (sx + tx) / 2;
        const my = (sy + ty) / 2 - Math.hypot(tx - sx, ty - sy) * 0.15;
        return `M${sx},${sy} Q${mx},${my} ${tx},${ty}`;
      });

      nodeSel.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    };

    // Do one manual tick draw after pre-warm
    ticked();

    // Resume simulation from alpha
    sim.alpha(0.5).on("tick", () => {
      if (!pausedRef.current) ticked();
    });

    sim.restart();
    simRef.current = sim;

    // ---- Zoom ----
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4.0])
      .on("zoom", (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        g.attr("transform", event.transform.toString());
        setZoomK(event.transform.k);
        // Update label style
        svg.select("style").text(
          `.obs-node-label { opacity: ${event.transform.k >= 0.6 ? 1 : 0}; transition: opacity 0.2s; }`
        );
      });

    svg.call(zoom);

    // Double-click to reset
    svg.on("dblclick.zoom", () => {
      svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
    });

    zoomRef.current = zoom;

    return () => {
      sim.stop();
      simRef.current = null;
    };
    // Re-run when filtered node/link sets or maxDegree change.
    // radiusOf is intentionally omitted — it only changes when maxDegree changes,
    // which is already listed; including both would cause a double execution.
    // USE_CANVAS guards the top of this effect, so it must be in the dep list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [USE_CANVAS, visibleNodes, visibleLinks, maxDegree]);

  // -------------------------------------------------------------------------
  // Pause / resume
  // -------------------------------------------------------------------------

  const togglePause = useCallback(() => {
    setPaused((prev) => {
      const next = !prev;
      if (simRef.current) {
        if (next) {
          simRef.current.stop();
        } else {
          simRef.current.restart();
        }
      }
      return next;
    });
  }, []);

  // -------------------------------------------------------------------------
  // Reset zoom
  // -------------------------------------------------------------------------

  const resetView = useCallback(() => {
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current)
        .transition()
        .duration(500)
        .call(zoomRef.current.transform, d3.zoomIdentity);
    }
  }, []);

  // -------------------------------------------------------------------------
  // Domain filter helpers
  // -------------------------------------------------------------------------

  const toggleDomain = useCallback((domain: string) => {
    setVisibleDomains((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) {
        // Keep at least one domain visible
        if (next.size > 1) next.delete(domain);
      } else {
        next.add(domain);
      }
      return next;
    });
  }, []);

  const showAll = useCallback(() => {
    setVisibleDomains(new Set(["aircraft", "medical", "bridge"]));
  }, []);

  // -------------------------------------------------------------------------
  // LOADING state
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div
        style={{
          position: "relative",
          height: "calc(100vh - 46px)",
          width: "100%",
          background: "#0a0a0f",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
        }}
      >
        {/* Pulsing rings */}
        <div style={{ position: "relative", width: 100, height: 100 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                inset: i * 14,
                borderRadius: "50%",
                border: `1px solid #00d4ff`,
                opacity: 0.7 - i * 0.2,
                animation: `obsRingPulse ${1.4 + i * 0.5}s ease-in-out infinite`,
                animationDelay: `${i * 0.25}s`,
              }}
            />
          ))}
          <style>{`
            @keyframes obsRingPulse {
              0%, 100% { transform: scale(1); opacity: 0.5; }
              50%       { transform: scale(1.08); opacity: 0.9; }
            }
          `}</style>
        </div>

        <p
          style={{
            fontFamily: "Orbitron, monospace",
            color: "#00d4ff",
            fontSize: 11,
            letterSpacing: "0.25em",
            textTransform: "uppercase",
          }}
        >
          INITIALISING KNOWLEDGE GRAPH...
        </p>

        {slowStart && (
          <p
            style={{
              fontFamily: "JetBrains Mono, monospace",
              color: "#6b7280",
              fontSize: 10,
              letterSpacing: "0.1em",
              textAlign: "center",
              maxWidth: 320,
            }}
          >
            Backend warming up — this may take 30s on first load
          </p>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // ERROR state
  // -------------------------------------------------------------------------

  if (error) {
    return (
      <div
        style={{
          height: "calc(100vh - 46px)",
          width: "100%",
          background: "#0a0a0f",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 12,
          fontFamily: "JetBrains Mono, monospace",
          color: "#ef4444",
          fontSize: 11,
          letterSpacing: "0.1em",
        }}
      >
        <div>GRAPH LOAD ERROR</div>
        <div style={{ color: "#6b7280", fontSize: 10 }}>{error}</div>
        <button
          onClick={refetch}
          style={{
            marginTop: 8,
            background: "#1f2937",
            border: "1px solid #374151",
            color: "#9ca3af",
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 9,
            letterSpacing: "0.12em",
            padding: "6px 16px",
            borderRadius: 4,
            cursor: "pointer",
            textTransform: "uppercase",
          }}
        >
          RETRY
        </button>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // BOTH EMPTY state (no data at all)
  // -------------------------------------------------------------------------

  if (aircraftEmpty && medicalEmpty && nodes.length === 0) {
    return (
      <div
        style={{
          height: "calc(100vh - 46px)",
          width: "100%",
          background: "#0a0a0f",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
          fontFamily: "JetBrains Mono, monospace",
        }}
      >
        <p style={{ color: "#6b7280", fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase" }}>
          KNOWLEDGE GRAPH EMPTY — INDEX A DOMAIN TO BEGIN
        </p>
        <div style={{ display: "flex", gap: 16 }}>
          {(["aircraft", "medical"] as const).map((domain) => {
            const isIndexing = indexingDomains.has(domain);
            const otherIndexing = indexingDomains.size > 0 && !isIndexing;
            const disabled = isIndexing || otherIndexing;
            return (
              <button
                key={domain}
                onClick={() => !disabled && buildIndex(domain)}
                disabled={disabled}
                style={{
                  background: `${DOMAIN_COLORS[domain]}18`,
                  border: `1px solid ${disabled ? DOMAIN_COLORS[domain] + "30" : DOMAIN_COLORS[domain] + "60"}`,
                  color: disabled ? DOMAIN_COLORS[domain] + "60" : DOMAIN_COLORS[domain],
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 10,
                  letterSpacing: "0.15em",
                  padding: "10px 24px",
                  borderRadius: 4,
                  cursor: disabled ? "not-allowed" : "pointer",
                  textTransform: "uppercase",
                }}
              >
                {isIndexing ? `INDEXING ${domain.toUpperCase()}…` : `BUILD INDEX — ${domain.toUpperCase()}`}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // MAIN RENDER
  // -------------------------------------------------------------------------

  const ctrlBtnBase: React.CSSProperties = {
    background: "rgba(10,10,15,0.85)",
    border: "1px solid #1f2937",
    color: "#9ca3af",
    fontFamily: "JetBrains Mono, monospace",
    fontSize: 9,
    letterSpacing: "0.12em",
    padding: "5px 10px",
    borderRadius: 3,
    cursor: "pointer",
    textTransform: "uppercase",
    transition: "border-color 0.15s, color 0.15s",
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        height: "calc(100vh - 46px)",
        width: "100%",
        overflow: "hidden",
        background: "#0a0a0f",
      }}
    >
      {/* Graph canvas — SVG for <= 500 nodes, HTML canvas for > 500 */}
      {USE_CANVAS ? (
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: "100%", display: "block" }}
        />
      ) : (
        <svg
          ref={svgRef}
          style={{ width: "100%", height: "100%", display: "block" }}
        />
      )}

      {/* Controls overlay — top left */}
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          zIndex: 50,
        }}
      >
        {/* Domain toggles */}
        <div style={{ display: "flex", gap: 6 }}>
          {(["aircraft", "medical"] as const).map((domain) => {
            const active = visibleDomains.has(domain);
            return (
              <button
                key={domain}
                onClick={() => toggleDomain(domain)}
                style={{
                  ...ctrlBtnBase,
                  borderColor: active ? `${DOMAIN_COLORS[domain]}80` : "#1f2937",
                  color: active ? DOMAIN_COLORS[domain] : "#6b7280",
                }}
              >
                {active ? "✦" : "◇"} {domain.toUpperCase()}
              </button>
            );
          })}
          <button
            onClick={showAll}
            style={{ ...ctrlBtnBase, borderColor: "#374151", color: "#9ca3af" }}
          >
            ✦ ALL
          </button>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={resetView} style={{ ...ctrlBtnBase }}>
            ⟲ RESET VIEW
          </button>
          <button
            onClick={togglePause}
            style={{
              ...ctrlBtnBase,
              borderColor: paused ? "#f59e0b60" : "#1f2937",
              color: paused ? "#f59e0b" : "#9ca3af",
            }}
          >
            {paused ? "▶ RESUME" : "⏸ PAUSE"}
          </button>
        </div>
      </div>

      {/* Stats overlay — bottom left */}
      <div
        style={{
          position: "absolute",
          bottom: 14,
          left: 14,
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 10,
          color: "#374151",
          letterSpacing: "0.08em",
          zIndex: 50,
          lineHeight: 1.8,
        }}
      >
        <div>
          NODES: {visibleNodes.length} · EDGES: {visibleLinks.length} · AIRCRAFT:{" "}
          {statsAircraft} · MEDICAL: {statsMedical}
        </div>
        {/* Auto-indexing indicator */}
        {indexingDomains.size > 0 && (
          <div style={{
            marginTop: 4,
            display: "flex",
            alignItems: "center",
            gap: 6,
            color: "#f59e0b",
          }}>
            <span style={{
              display: "inline-block",
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#f59e0b",
              animation: "pulse 1.2s ease-in-out infinite",
            }} />
            INDEXING{" "}
            {[...indexingDomains].map((d) => d.toUpperCase()).join(" + ")}{" "}
            — GRAPH WILL UPGRADE WHEN READY
          </div>
        )}
      </div>

      {/* Side panel */}
      {selectedNode && (
        <SidePanel
          node={selectedNode}
          edges={edges}
          nodes={nodes}
          onClose={() => setSelectedNode(null)}
          onNavigate={(n) => setSelectedNode(n)}
        />
      )}

      {/* Partial index warning — shows when graph has data but one domain is empty */}
      {nodes.length > 0 && (aircraftEmpty || medicalEmpty) && (
        <div style={{
          position: "absolute",
          bottom: 40,
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(10,10,20,0.9)",
          border: "1px solid #92400e",
          padding: "8px 20px",
          zIndex: 15,
          display: "flex",
          alignItems: "center",
          gap: 16,
          whiteSpace: "nowrap",
        }}>
          {aircraftEmpty && (() => {
            const isIndexing = indexingDomains.has("aircraft");
            const otherIndexing = indexingDomains.size > 0 && !isIndexing;
            const disabled = isIndexing || otherIndexing;
            return (
              <>
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#f59e0b", letterSpacing: "0.08em" }}>
                  {isIndexing ? "AIRCRAFT INDEXING…" : "AIRCRAFT INDEX NOT BUILT"}
                </span>
                {!isIndexing && (
                  <button
                    onClick={() => !disabled && buildIndex("aircraft")}
                    disabled={disabled}
                    style={{
                      fontFamily: "Orbitron, monospace",
                      fontSize: 9,
                      padding: "3px 12px",
                      border: `1px solid ${disabled ? "#f59e0b60" : "#f59e0b"}`,
                      color: disabled ? "#f59e0b60" : "#f59e0b",
                      background: "transparent",
                      cursor: disabled ? "not-allowed" : "pointer",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase" as const,
                    }}
                  >
                    BUILD INDEX
                  </button>
                )}
              </>
            );
          })()}
          {medicalEmpty && (() => {
            const isIndexing = indexingDomains.has("medical");
            const otherIndexing = indexingDomains.size > 0 && !isIndexing;
            const disabled = isIndexing || otherIndexing;
            return (
              <>
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#a855f7", letterSpacing: "0.08em" }}>
                  {isIndexing ? "MEDICAL INDEXING…" : "MEDICAL INDEX NOT BUILT"}
                </span>
                {!isIndexing && (
                  <button
                    onClick={() => !disabled && buildIndex("medical")}
                    disabled={disabled}
                    style={{
                      fontFamily: "Orbitron, monospace",
                      fontSize: 9,
                      padding: "3px 12px",
                      border: `1px solid ${disabled ? "#a855f760" : "#a855f7"}`,
                      color: disabled ? "#a855f760" : "#a855f7",
                      background: "transparent",
                      cursor: disabled ? "not-allowed" : "pointer",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase" as const,
                    }}
                  >
                    BUILD INDEX
                  </button>
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
