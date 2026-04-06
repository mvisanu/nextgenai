# Obsidian-Style Knowledge Graph Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/obsidian-graph` — a full-screen Obsidian-style force-directed knowledge graph combining both aircraft and medical domain data, inside the NextGenAI SCADA aesthetic.

**Architecture:** Pure D3 force-simulation on a `<svg>` canvas (fallback to `<canvas>` when nodes > 500). A `useGraphData` hook fetches both domains in parallel, merges node/edge arrays, injects a synthetic bridge node, and returns typed state. `ObsidianGraph.tsx` is a pure presentation component that receives this state and owns all D3/SVG logic. The page wrapper uses `dynamic({ ssr: false })` per the existing LightRAG pattern.

**Tech Stack:** React 19, TypeScript, D3 v7 (`d3-force`, `d3-zoom`, `d3-selection`), Next.js 16 App Router, Tailwind, SCADA theme (Orbitron / Rajdhani / JetBrains Mono)

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/app/obsidian-graph/page.tsx` | Create | Dynamic-import wrapper + Suspense boundary |
| `frontend/app/obsidian-graph/useGraphData.ts` | Create | Data fetching, merging, bridge node injection |
| `frontend/app/obsidian-graph/ObsidianGraph.tsx` | Create | D3 SVG force graph, zoom/pan, side panel, controls |
| `frontend/app/components/AppHeader.tsx` | Modify | Add KNOWLEDGE GRAPH nav item |
| `frontend/middleware.ts` | Modify | Add `/obsidian-graph` to PROTECTED_PATHS |

---

## Task 1: Install D3

**Files:**
- Modify: `frontend/package.json` (via npm install)

- [ ] **Step 1: Check if d3 is already installed**

```bash
cd frontend && cat package.json | grep '"d3'
```

Expected output: nothing (d3 is NOT in package.json currently).

- [ ] **Step 2: Install d3 and its types**

```bash
cd frontend && npm install d3 && npm install --save-dev @types/d3
```

Expected: `added N packages` with no errors. `d3` appears in `dependencies`, `@types/d3` in `devDependencies`.

- [ ] **Step 3: Verify install**

```bash
cd frontend && node -e "const d3 = require('d3'); console.log(d3.version)"
```

Expected: prints a version string like `7.9.0`

- [ ] **Step 4: Commit**

```bash
cd frontend && git add package.json package-lock.json
git commit -m "chore: install d3 v7 for obsidian-graph force simulation"
```

---

## Task 2: Add nav item to AppHeader + protect route in middleware

**Files:**
- Modify: `frontend/app/components/AppHeader.tsx:26-38`
- Modify: `frontend/middleware.ts:5-16`

- [ ] **Step 1: Add KNOWLEDGE GRAPH to NAV_ITEMS in AppHeader.tsx**

In `frontend/app/components/AppHeader.tsx`, find the NAV_ITEMS array and add the new entry after the LIGHTRAG item:

```typescript
// Before (lines 26-38):
export const NAV_ITEMS = [
  { href: "/",                    label: "HOME",            icon: Home,           accent: "--col-green"  },
  { href: "/dashboard",           label: "DASHBOARD",       icon: LayoutDashboard,accent: "--col-cyan"   },
  { href: "/data",                label: "DATA",            icon: Database,       accent: "--col-amber"  },
  { href: "/review",              label: "REVIEW",          icon: GraduationCap,  accent: "--col-purple" },
  { href: "/examples",            label: "EXAMPLES",        icon: FlaskConical,   accent: "--col-green"  },
  { href: "/medical-examples",    label: "MED-EX",          icon: Stethoscope,    accent: "--col-cyan"   },
  { href: "/examples?tab=industries", label: "INDUSTRIES",  icon: Building2,      accent: "--col-purple" },
  { href: "/agent",               label: "AGENT",           icon: Bot,            accent: "--col-pink"   },
  { href: "/diagram",             label: "DIAGRAM",         icon: GitBranch,      accent: "--col-cyan"   },
  { href: "/faq",                 label: "FAQ",             icon: HelpCircle,     accent: "--col-cyan"   },
  { href: "/lightrag",            label: "LIGHTRAG",        icon: Network,        accent: "--col-cyan"   },
] as const;

// After — add Brain import and KNOWLEDGE GRAPH entry:
```

First add `Brain` to the lucide-react import line (line 10):

```typescript
import { LayoutDashboard, HelpCircle, Database, GraduationCap, FlaskConical, GitBranch, Stethoscope, ChevronDown, Bot, Home, Building2, LogOut, Network, Brain } from "lucide-react";
```

Then add the new nav item at the end of NAV_ITEMS (before `] as const`):

```typescript
  { href: "/obsidian-graph",      label: "KNOWLEDGE GRAPH", icon: Brain,          accent: "--col-cyan"   },
```

- [ ] **Step 2: Add /obsidian-graph to PROTECTED_PATHS in middleware.ts**

```typescript
// Before:
const PROTECTED_PATHS = [
  '/',
  '/dashboard',
  '/data',
  '/review',
  '/examples',
  '/medical-examples',
  '/agent',
  '/diagram',
  '/faq',
  '/lightrag',
]

// After:
const PROTECTED_PATHS = [
  '/',
  '/dashboard',
  '/data',
  '/review',
  '/examples',
  '/medical-examples',
  '/agent',
  '/diagram',
  '/faq',
  '/lightrag',
  '/obsidian-graph',
]
```

- [ ] **Step 3: Start dev server and confirm nav item appears**

```bash
cd frontend && npm run dev
```

Open `http://localhost:3005` and click the NAVIGATE dropdown — KNOWLEDGE GRAPH should appear with a Brain icon. Clicking it 404s (page not created yet) — that's expected.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/components/AppHeader.tsx frontend/middleware.ts
git commit -m "feat: add KNOWLEDGE GRAPH nav item and protect /obsidian-graph route"
```

---

## Task 3: Create `useGraphData.ts`

**Files:**
- Create: `frontend/app/obsidian-graph/useGraphData.ts`

This hook fetches both domains in parallel, merges nodes/edges, tags them with `domain`, computes node degree, injects a synthetic bridge node connecting to the top 5 highest-degree nodes from each domain.

- [ ] **Step 1: Create the hook file**

Create `frontend/app/obsidian-graph/useGraphData.ts`:

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getLightRAGGraph,
  getLightRAGStatus,
  triggerLightRAGIndex,
  type LightRAGGraphNode,
  type LightRAGGraphEdge,
  type LightRAGStatus,
} from "../lib/api";

// ── Extended types with domain tag ────────────────────────────────────────────

export type NodeDomain = "aircraft" | "medical" | "bridge";

export interface MergedNode extends LightRAGGraphNode {
  domain: NodeDomain;
  degree: number; // computed — number of edges touching this node
}

export interface MergedEdge extends LightRAGGraphEdge {
  domain: NodeDomain;
}

export interface GraphData {
  nodes: MergedNode[];
  edges: MergedEdge[];
  loading: boolean;
  error: string | null;
  aircraftStatus: LightRAGStatus | null;
  medicalStatus: LightRAGStatus | null;
  aircraftEmpty: boolean;
  medicalEmpty: boolean;
  refetch: () => void;
  buildIndex: (domain: "aircraft" | "medical") => Promise<void>;
}

const BRIDGE_NODE_ID = "NEXTAGENTAI_BRIDGE";
const TOP_K_CONNECTIONS = 5; // connect bridge to top-K nodes per domain

// ── Helper: compute degree map from edges ────────────────────────────────────

function computeDegrees(
  edges: { source: string; target: string }[]
): Map<string, number> {
  const deg = new Map<string, number>();
  for (const e of edges) {
    deg.set(e.source, (deg.get(e.source) ?? 0) + 1);
    deg.set(e.target, (deg.get(e.target) ?? 0) + 1);
  }
  return deg;
}

// ── Helper: pick top-K nodes by degree from a domain ─────────────────────────

function topKByDegree(
  nodes: MergedNode[],
  domain: NodeDomain,
  k: number
): MergedNode[] {
  return nodes
    .filter((n) => n.domain === domain)
    .sort((a, b) => b.degree - a.degree)
    .slice(0, k);
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useGraphData(): GraphData {
  const [nodes, setNodes] = useState<MergedNode[]>([]);
  const [edges, setEdges] = useState<MergedEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aircraftStatus, setAircraftStatus] = useState<LightRAGStatus | null>(null);
  const [medicalStatus, setMedicalStatus] = useState<LightRAGStatus | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Parallel fetch: graph data + status for both domains
      const [aircraftGraph, medicalGraph, aircraftStat, medicalStat] =
        await Promise.all([
          getLightRAGGraph("aircraft", 300).catch(() => null),
          getLightRAGGraph("medical", 300).catch(() => null),
          getLightRAGStatus("aircraft").catch(() => null),
          getLightRAGStatus("medical").catch(() => null),
        ]);

      setAircraftStatus(aircraftStat);
      setMedicalStatus(medicalStat);

      // Tag nodes by domain
      const aircraftNodes: MergedNode[] = (aircraftGraph?.nodes ?? []).map(
        (n) => ({ ...n, domain: "aircraft" as NodeDomain, degree: 0 })
      );
      const medicalNodes: MergedNode[] = (medicalGraph?.nodes ?? []).map(
        (n) => ({ ...n, domain: "medical" as NodeDomain, degree: 0 })
      );

      // Tag edges by domain — edges within aircraft domain get aircraft tag
      // We determine domain by checking if the source node is in aircraft set
      const aircraftNodeIds = new Set(aircraftNodes.map((n) => n.id));
      const aircraftEdges: MergedEdge[] = (aircraftGraph?.edges ?? []).map(
        (e) => ({ ...e, domain: "aircraft" as NodeDomain })
      );
      const medicalEdges: MergedEdge[] = (medicalGraph?.edges ?? []).map(
        (e) => ({ ...e, domain: "medical" as NodeDomain })
      );

      const allEdges = [...aircraftEdges, ...medicalEdges];
      const allNodesFlat = [...aircraftNodes, ...medicalNodes];

      // Compute degree for all nodes
      const degreeMap = computeDegrees(allEdges);
      for (const n of allNodesFlat) {
        n.degree = degreeMap.get(n.id) ?? 0;
      }

      // Inject bridge node if either domain has data
      const bridgeEdges: MergedEdge[] = [];
      let bridgeNode: MergedNode | null = null;

      if (allNodesFlat.length > 0) {
        bridgeNode = {
          id: BRIDGE_NODE_ID,
          label: "NEXTAGENTAI",
          type: "hub",
          description: "Central hub connecting aircraft and medical knowledge domains",
          weight: 10,
          domain: "bridge",
          degree: 0,
        };

        // Connect bridge to top-K in each domain
        const topAircraft = topKByDegree(allNodesFlat, "aircraft", TOP_K_CONNECTIONS);
        const topMedical = topKByDegree(allNodesFlat, "medical", TOP_K_CONNECTIONS);

        let bridgeEdgeIdx = 0;
        for (const n of [...topAircraft, ...topMedical]) {
          const edgeDomain: NodeDomain =
            n.domain === "aircraft" ? "aircraft" : "medical";
          bridgeEdges.push({
            id: `bridge_edge_${bridgeEdgeIdx++}`,
            source: BRIDGE_NODE_ID,
            target: n.id,
            label: "connects",
            weight: 1,
            description: "",
            domain: edgeDomain,
          });
        }

        bridgeNode.degree = bridgeEdges.length;
      }

      const finalNodes: MergedNode[] = bridgeNode
        ? [bridgeNode, ...allNodesFlat]
        : allNodesFlat;
      const finalEdges: MergedEdge[] = [...allEdges, ...bridgeEdges];

      setNodes(finalNodes);
      setEdges(finalEdges);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const buildIndex = useCallback(
    async (domain: "aircraft" | "medical") => {
      await triggerLightRAGIndex(domain);
    },
    []
  );

  const aircraftEmpty =
    !loading && nodes.filter((n) => n.domain === "aircraft").length === 0;
  const medicalEmpty =
    !loading && nodes.filter((n) => n.domain === "medical").length === 0;

  return {
    nodes,
    edges,
    loading,
    error,
    aircraftStatus,
    medicalStatus,
    aircraftEmpty,
    medicalEmpty,
    refetch: fetch,
    buildIndex,
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles (no browser needed)**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors from `useGraphData.ts`.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/obsidian-graph/useGraphData.ts
git commit -m "feat: add useGraphData hook — parallel fetch, domain tagging, bridge node injection"
```

---

## Task 4: Create `page.tsx` — Route wrapper

**Files:**
- Create: `frontend/app/obsidian-graph/page.tsx`

This is a thin wrapper. The `ObsidianGraph` component doesn't exist yet — that's fine; we'll create an empty placeholder so the page renders without 404.

- [ ] **Step 1: Create placeholder ObsidianGraph.tsx**

Create `frontend/app/obsidian-graph/ObsidianGraph.tsx` with a placeholder:

```typescript
"use client";

export default function ObsidianGraph() {
  return (
    <div
      style={{
        height: "calc(100vh - 46px)",
        width: "100%",
        background: "#0a0a0f",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#00d4ff",
        fontFamily: "Orbitron, monospace",
        fontSize: "12px",
        letterSpacing: "0.2em",
      }}
    >
      KNOWLEDGE GRAPH — INITIALISING...
    </div>
  );
}
```

- [ ] **Step 2: Create page.tsx**

Create `frontend/app/obsidian-graph/page.tsx`:

```typescript
import dynamic from "next/dynamic";
import React, { Suspense } from "react";

// MUST be dynamic ssr:false — D3 requires browser APIs (window, document)
const ObsidianGraph = dynamic(
  () => import("./ObsidianGraph"),
  { ssr: false }
);

function GraphLoadingScreen() {
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
        gap: "16px",
      }}
    >
      {/* Pulsing concentric rings */}
      <div style={{ position: "relative", width: 80, height: 80 }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              inset: i * 10,
              borderRadius: "50%",
              border: "1px solid #00d4ff",
              opacity: 0.6 - i * 0.15,
              animation: `pulse ${1.2 + i * 0.4}s ease-in-out infinite`,
              animationDelay: `${i * 0.2}s`,
            }}
          />
        ))}
      </div>
      <p
        style={{
          fontFamily: "Orbitron, monospace",
          color: "#00d4ff",
          fontSize: "11px",
          letterSpacing: "0.2em",
          textTransform: "uppercase",
        }}
      >
        INITIALISING KNOWLEDGE GRAPH...
      </p>
    </div>
  );
}

function ObsidianGraphInner() {
  return (
    <div
      style={{ height: "calc(100vh - 46px)", width: "100%", background: "#0a0a0f" }}
    >
      <Suspense fallback={<GraphLoadingScreen />}>
        <ObsidianGraph />
      </Suspense>
    </div>
  );
}

export default function ObsidianGraphPage() {
  return (
    <Suspense fallback={<GraphLoadingScreen />}>
      <ObsidianGraphInner />
    </Suspense>
  );
}
```

- [ ] **Step 3: Verify page renders at /obsidian-graph**

Visit `http://localhost:3005/obsidian-graph`. Should show "KNOWLEDGE GRAPH — INITIALISING..." on dark background with no console errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/obsidian-graph/page.tsx frontend/app/obsidian-graph/ObsidianGraph.tsx
git commit -m "feat: scaffold /obsidian-graph route with placeholder and loading screen"
```

---

## Task 5: Build `ObsidianGraph.tsx` — SVG Canvas + Zoom/Pan

**Files:**
- Modify: `frontend/app/obsidian-graph/ObsidianGraph.tsx`

Replace the placeholder with the real component, built incrementally. This task covers: canvas setup, zoom/pan via d3-zoom, SVG filters (glow), force simulation pre-warm.

- [ ] **Step 1: Replace ObsidianGraph.tsx with D3 scaffold**

```typescript
"use client";

import React, {
  useRef,
  useEffect,
  useState,
  useMemo,
  useCallback,
} from "react";
import * as d3 from "d3";
import { useGraphData, type MergedNode, type MergedEdge } from "./useGraphData";
import { triggerLightRAGIndex } from "../lib/api";

// ── Colour constants (SCADA palette) ─────────────────────────────────────────
const COL = {
  aircraft: "#00d4ff",
  medical:  "#a855f7",
  bridge:   "#f59e0b",
  dimGrey:  "#374151",
  edge:     "#1e3a4a",
  text:     "#94a3b8",
  textHi:   "#f1f5f9",
  bg:       "#0a0a0f",
  panel:    "rgba(10,10,20,0.95)",
};

function domainColor(domain: string): string {
  if (domain === "aircraft") return COL.aircraft;
  if (domain === "medical")  return COL.medical;
  if (domain === "bridge")   return COL.bridge;
  return COL.dimGrey;
}

// ── D3 simulation node/link types ─────────────────────────────────────────────
interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  type: string;
  domain: string;
  weight: number;
  degree: number;
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  id: string;
  domain: string;
  weight: number;
}

// ── Node radius based on degree ───────────────────────────────────────────────
function nodeRadius(degree: number, maxDegree: number): number {
  if (maxDegree === 0) return 6;
  return 4 + (degree / maxDegree) * 14; // min 4, max 18
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ObsidianGraph() {
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef   = useRef<SVGGElement>(null); // main group (transformed by zoom)
  const simRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null);

  const { nodes, edges, loading, error, aircraftEmpty, medicalEmpty, buildIndex, refetch } =
    useGraphData();

  // ── Domain filter state ───────────────────────────────────────────────────
  const [visibleDomains, setVisibleDomains] = useState<Set<string>>(
    new Set(["aircraft", "medical", "bridge"])
  );
  const [paused, setPaused] = useState(false);
  const [zoomK, setZoomK] = useState(1); // current zoom scale (for label visibility)
  const [selectedNode, setSelectedNode] = useState<SimNode | null>(null);
  const [slowStart, setSlowStart] = useState(false); // > 5s loading warning

  // ── Slow-start warning (> 5s) ─────────────────────────────────────────────
  useEffect(() => {
    if (!loading) { setSlowStart(false); return; }
    const t = setTimeout(() => setSlowStart(true), 5000);
    return () => clearTimeout(t);
  }, [loading]);

  // ── Convert to D3 types (memoized — no inline arrays) ────────────────────
  const simNodes: SimNode[] = useMemo(
    () =>
      nodes.map((n) => ({
        id: n.id,
        label: n.label,
        type: n.type,
        domain: n.domain,
        weight: n.weight,
        degree: n.degree,
      })),
    [nodes]
  );

  const simLinks: SimLink[] = useMemo(
    () =>
      edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        domain: e.domain,
        weight: e.weight,
      })),
    [edges]
  );

  const maxDegree = useMemo(
    () => Math.max(1, ...simNodes.map((n) => n.degree)),
    [simNodes]
  );

  // ── Visible nodes/links after domain filter ───────────────────────────────
  const visibleNodes = useMemo(
    () => simNodes.filter((n) => visibleDomains.has(n.domain)),
    [simNodes, visibleDomains]
  );

  const visibleNodeIds = useMemo(
    () => new Set(visibleNodes.map((n) => n.id)),
    [visibleNodes]
  );

  const visibleLinks = useMemo(
    () =>
      simLinks.filter(
        (l) =>
          visibleNodeIds.has(l.source as string) &&
          visibleNodeIds.has(l.target as string)
      ),
    [simLinks, visibleNodeIds]
  );

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(
    () => ({
      total: visibleNodes.length,
      edges: visibleLinks.length,
      aircraft: visibleNodes.filter((n) => n.domain === "aircraft").length,
      medical:  visibleNodes.filter((n) => n.domain === "medical").length,
    }),
    [visibleNodes, visibleLinks]
  );

  // ── Build/update D3 simulation ────────────────────────────────────────────
  useEffect(() => {
    if (!svgRef.current || !gRef.current) return;
    if (visibleNodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    const g   = d3.select(gRef.current);
    const width  = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    // ── Zoom behavior ───────────────────────────────────────────────────────
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4.0])
      .on("zoom", (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        g.attr("transform", event.transform.toString());
        setZoomK(event.transform.k);
      });

    svg.call(zoom);

    // Double-click to fit all
    svg.on("dblclick.zoom", () => {
      svg.transition().duration(750).call(
        zoom.transform,
        d3.zoomIdentity
      );
    });

    // ── Force simulation ────────────────────────────────────────────────────
    // Deep-copy nodes so D3 can mutate x/y without affecting React state
    const nodesCopy: SimNode[] = visibleNodes.map((n) => ({ ...n }));
    const linksCopy: SimLink[] = visibleLinks.map((l) => ({ ...l }));

    const sim = d3
      .forceSimulation<SimNode>(nodesCopy)
      .force(
        "link",
        d3
          .forceLink<SimNode, SimLink>(linksCopy)
          .id((d) => d.id)
          .distance(80)
          .strength(0.4)
      )
      .force("charge", d3.forceManyBody<SimNode>().strength(-120))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide<SimNode>().radius((d) => nodeRadius(d.degree, maxDegree) + 4));

    simRef.current = sim as unknown as d3.Simulation<SimNode, SimLink>;

    // Pre-warm 300 ticks before first render
    sim.stop();
    for (let i = 0; i < 300; i++) sim.tick();

    // ── Render edges ────────────────────────────────────────────────────────
    g.selectAll(".obs-link").remove();
    const link = g
      .selectAll<SVGPathElement, SimLink>(".obs-link")
      .data(linksCopy)
      .join("path")
      .attr("class", "obs-link")
      .attr("fill", "none")
      .attr("stroke", (d) => domainColor(d.domain) + "4d") // 30% opacity
      .attr("stroke-width", (d) => Math.max(0.5, Math.min(3, d.weight)))
      .attr("opacity", 0.3);

    // ── Render nodes ────────────────────────────────────────────────────────
    g.selectAll(".obs-node-g").remove();
    const nodeG = g
      .selectAll<SVGGElement, SimNode>(".obs-node-g")
      .data(nodesCopy)
      .join("g")
      .attr("class", "obs-node-g")
      .style("cursor", "pointer")
      .call(
        d3
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
          })
      );

    // Outer glow ring
    nodeG
      .append("circle")
      .attr("r", (d) => nodeRadius(d.degree, maxDegree) + 4)
      .attr("fill", "none")
      .attr("stroke", (d) => domainColor(d.domain))
      .attr("stroke-width", 0.5)
      .attr("opacity", 0.25)
      .attr("filter", (d) => `url(#glow-${d.domain})`);

    // Inner filled circle
    nodeG
      .append("circle")
      .attr("class", "obs-node-circle")
      .attr("r", (d) => nodeRadius(d.degree, maxDegree))
      .attr("fill", (d) => domainColor(d.domain) + "33") // 20% fill
      .attr("stroke", (d) => domainColor(d.domain))
      .attr("stroke-width", 1.5);

    // Hover interactions
    nodeG
      .on("mouseenter", function (_, d) {
        d3.select(this).select(".obs-node-circle")
          .transition().duration(150)
          .attr("r", nodeRadius(d.degree, maxDegree) * 1.4)
          .attr("filter", `url(#glow-${d.domain})`);

        // Highlight connected edges
        link.attr("opacity", (l) => {
          const src = (l.source as SimNode).id;
          const tgt = (l.target as SimNode).id;
          return src === d.id || tgt === d.id ? 0.9 : 0.05;
        });
      })
      .on("mouseleave", function (_, d) {
        d3.select(this).select(".obs-node-circle")
          .transition().duration(150)
          .attr("r", nodeRadius(d.degree, maxDegree))
          .attr("filter", null);

        link.attr("opacity", 0.3);
      })
      .on("click", (_, d) => {
        setSelectedNode(d);
      });

    // Labels (visibility controlled by zoomK via React state)
    nodeG
      .append("text")
      .attr("class", "obs-node-label")
      .attr("dy", (d) => nodeRadius(d.degree, maxDegree) + 12)
      .attr("text-anchor", "middle")
      .attr("fill", COL.text)
      .attr("font-family", "JetBrains Mono, monospace")
      .attr("font-size", 9)
      .attr("pointer-events", "none")
      .text((d) =>
        d.label.length > 24 ? d.label.slice(0, 23) + "…" : d.label
      );

    // ── Tick function — update positions ────────────────────────────────────
    function ticked() {
      // Quadratic bezier for curved edges
      link.attr("d", (d) => {
        const s = d.source as SimNode;
        const t = d.target as SimNode;
        const mx = (s.x! + t.x!) / 2;
        const my = (s.y! + t.y!) / 2 - 30; // control point offset
        return `M${s.x},${s.y} Q${mx},${my} ${t.x},${t.y}`;
      });

      nodeG.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    }

    // Resume simulation (live animation)
    sim.on("tick", ticked).alpha(0.3).restart();

    // Apply initial positions from pre-warm before restarting
    ticked();

    return () => {
      sim.stop();
    };
  }, [visibleNodes, visibleLinks, maxDegree]); // re-run when filter changes

  // ── Pause/resume ──────────────────────────────────────────────────────────
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    if (paused) {
      sim.stop();
    } else {
      sim.alpha(0.1).restart();
    }
  }, [paused]);

  // ── Label visibility (controlled via CSS class on SVG) ───────────────────
  // We use inline style on the SVG to show/hide labels based on zoom level
  const labelOpacity = zoomK >= 0.6 ? 1 : 0;

  // ── Render ────────────────────────────────────────────────────────────────

  // Loading state
  if (loading) {
    return (
      <div
        style={{
          height: "calc(100vh - 46px)",
          width: "100%",
          background: COL.bg,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
        }}
      >
        <div style={{ position: "relative", width: 80, height: 80 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                inset: i * 10,
                borderRadius: "50%",
                border: `1px solid ${COL.aircraft}`,
                opacity: 0.6 - i * 0.15,
                animation: `pulse ${1.2 + i * 0.4}s ease-in-out infinite`,
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}
        </div>
        <p style={{ fontFamily: "Orbitron, monospace", color: COL.aircraft, fontSize: 11, letterSpacing: "0.2em" }}>
          INITIALISING KNOWLEDGE GRAPH...
        </p>
        {slowStart && (
          <p style={{ fontFamily: "Rajdhani, sans-serif", color: "#94a3b8", fontSize: 13, maxWidth: 300, textAlign: "center" }}>
            Backend warming up — this may take 30s on first load
          </p>
        )}
        <style>{`@keyframes pulse { 0%,100% { opacity: 0.2; transform: scale(0.95); } 50% { opacity: 0.7; transform: scale(1.05); } }`}</style>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div style={{ height: "calc(100vh - 46px)", background: COL.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ fontFamily: "JetBrains Mono, monospace", color: "#ef4444", fontSize: 12 }}>{error}</p>
      </div>
    );
  }

  // Empty state — both domains have no data
  if (aircraftEmpty && medicalEmpty) {
    return (
      <div style={{ height: "calc(100vh - 46px)", background: COL.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24 }}>
        <p style={{ fontFamily: "Orbitron, monospace", color: COL.aircraft, fontSize: 12, letterSpacing: "0.15em" }}>
          KNOWLEDGE GRAPH EMPTY
        </p>
        <div style={{ display: "flex", gap: 16 }}>
          {(["aircraft", "medical"] as const).map((d) => (
            <button
              key={d}
              onClick={async () => { await buildIndex(d); refetch(); }}
              style={{
                fontFamily: "Orbitron, monospace", fontSize: 10,
                padding: "8px 20px", letterSpacing: "0.12em",
                border: `1px solid ${domainColor(d)}`,
                color: domainColor(d), background: "transparent",
                cursor: "pointer", textTransform: "uppercase",
              }}
            >
              {d.toUpperCase()} — BUILD INDEX
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Main graph render ──────────────────────────────────────────────────────
  return (
    <div style={{ position: "relative", height: "calc(100vh - 46px)", width: "100%", background: COL.bg, overflow: "hidden" }}>

      {/* SVG Canvas */}
      <svg
        ref={svgRef}
        style={{ width: "100%", height: "100%", display: "block" }}
      >
        <defs>
          {/* Radial gradient background glow */}
          <radialGradient id="bg-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#001a2e" stopOpacity={0.8} />
            <stop offset="100%" stopColor="#0a0a0f" stopOpacity={1} />
          </radialGradient>

          {/* Glow filters per domain */}
          {(["aircraft", "medical", "bridge"] as const).map((domain) => (
            <filter key={domain} id={`glow-${domain}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          ))}
        </defs>

        {/* Background radial gradient */}
        <rect width="100%" height="100%" fill="url(#bg-glow)" />

        {/* Main graph group — D3 transforms this for zoom/pan */}
        <g
          ref={gRef}
          style={{
            // Apply label visibility via CSS — no re-render of SVG needed
          }}
        >
          {/* D3 renders all children via useEffect imperatively */}
        </g>

        {/* Label visibility — apply CSS variable on the SVG level */}
        <style>{`.obs-node-label { opacity: ${labelOpacity}; transition: opacity 0.3s; }`}</style>
      </svg>

      {/* Controls overlay (top-left) */}
      <div style={{
        position: "absolute", top: 12, left: 12,
        display: "flex", flexDirection: "column", gap: 6,
        zIndex: 10,
      }}>
        {/* Domain filters */}
        <div style={{ display: "flex", gap: 4 }}>
          {(["aircraft", "medical"] as const).map((d) => {
            const active = visibleDomains.has(d);
            const color  = domainColor(d);
            return (
              <button
                key={d}
                onClick={() => {
                  setVisibleDomains((prev) => {
                    const next = new Set(prev);
                    if (next.has(d)) next.delete(d);
                    else next.add(d);
                    return next;
                  });
                }}
                style={{
                  fontFamily: "Orbitron, monospace",
                  fontSize: 9, letterSpacing: "0.12em",
                  padding: "3px 10px",
                  border: `1px solid ${active ? color : "#374151"}`,
                  color: active ? color : "#374151",
                  background: active ? color + "22" : "transparent",
                  cursor: "pointer",
                  boxShadow: active ? `0 0 8px ${color}44` : "none",
                  transition: "all 0.15s",
                }}
              >
                ✦ {d.toUpperCase()}
              </button>
            );
          })}
          <button
            onClick={() => setVisibleDomains(new Set(["aircraft", "medical", "bridge"]))}
            style={{
              fontFamily: "Orbitron, monospace",
              fontSize: 9, letterSpacing: "0.12em",
              padding: "3px 10px",
              border: "1px solid #94a3b8",
              color: "#94a3b8",
              background: "transparent",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            ✦ ALL
          </button>
        </div>

        {/* Simulation controls */}
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={() => {
              const svg = d3.select(svgRef.current!);
              svg.transition().duration(750).call(
                d3.zoom<SVGSVGElement, unknown>().transform,
                d3.zoomIdentity
              );
            }}
            style={{
              fontFamily: "Orbitron, monospace", fontSize: 9,
              letterSpacing: "0.1em", padding: "3px 10px",
              border: "1px solid #1e3a4a", color: "#94a3b8",
              background: "transparent", cursor: "pointer",
            }}
          >
            ⟲ RESET VIEW
          </button>
          <button
            onClick={() => setPaused((p) => !p)}
            style={{
              fontFamily: "Orbitron, monospace", fontSize: 9,
              letterSpacing: "0.1em", padding: "3px 10px",
              border: "1px solid #1e3a4a", color: "#94a3b8",
              background: "transparent", cursor: "pointer",
            }}
          >
            {paused ? "▶ RESUME" : "⏸ PAUSE"}
          </button>
        </div>
      </div>

      {/* Stats overlay (bottom-left) */}
      <div style={{
        position: "absolute", bottom: 12, left: 12,
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 10, color: "#4b5563",
        display: "flex", gap: 12,
        letterSpacing: "0.08em",
        zIndex: 10,
      }}>
        <span>NODES: {stats.total}</span>
        <span>·</span>
        <span>EDGES: {stats.edges}</span>
        <span>·</span>
        <span style={{ color: COL.aircraft + "aa" }}>AIRCRAFT: {stats.aircraft}</span>
        <span>·</span>
        <span style={{ color: COL.medical + "aa" }}>MEDICAL: {stats.medical}</span>
      </div>

      {/* Side panel (right, slides in on node click) */}
      {selectedNode && (
        <SidePanel
          node={selectedNode}
          edges={simLinks}
          nodes={simNodes}
          onClose={() => setSelectedNode(null)}
          onNavigate={(nodeId) => {
            const target = simNodes.find((n) => n.id === nodeId);
            if (target) setSelectedNode(target);
          }}
        />
      )}
    </div>
  );
}

// ── Side Panel ────────────────────────────────────────────────────────────────

interface SidePanelProps {
  node: SimNode;
  edges: SimLink[];
  nodes: SimNode[];
  onClose: () => void;
  onNavigate: (nodeId: string) => void;
}

function SidePanel({ node, edges, nodes, onClose, onNavigate }: SidePanelProps) {
  const color = domainColor(node.domain);

  const connectedIds = useMemo(() => {
    const ids: string[] = [];
    for (const e of edges) {
      const src = typeof e.source === "string" ? e.source : (e.source as SimNode).id;
      const tgt = typeof e.target === "string" ? e.target : (e.target as SimNode).id;
      if (src === node.id) ids.push(tgt);
      else if (tgt === node.id) ids.push(src);
    }
    return [...new Set(ids)].slice(0, 10);
  }, [node.id, edges]);

  const connectedNodes = useMemo(
    () => nodes.filter((n) => connectedIds.includes(n.id)),
    [nodes, connectedIds]
  );

  const handleQueryNode = useCallback(() => {
    localStorage.setItem("pending_query", node.label);
    localStorage.setItem("pending_domain", node.domain === "medical" ? "medical" : "aircraft");
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
        background: "rgba(10,10,20,0.95)",
        borderLeft: `1px solid ${color}44`,
        padding: "16px 14px",
        overflowY: "auto",
        zIndex: 20,
        animation: "slideIn 0.2s ease-out",
      }}
    >
      <style>{`
        @keyframes slideIn { from { transform: translateX(280px); } to { transform: translateX(0); } }
      `}</style>

      {/* Close button */}
      <button
        onClick={onClose}
        style={{
          position: "absolute", top: 10, right: 10,
          background: "transparent", border: "none",
          color: "#94a3b8", cursor: "pointer", fontSize: 16,
        }}
      >
        ✕
      </button>

      {/* Node ID */}
      <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "#4b5563", letterSpacing: "0.1em", marginBottom: 4 }}>
        {node.id.length > 32 ? node.id.slice(0, 31) + "…" : node.id}
      </p>

      {/* Label */}
      <p style={{ fontFamily: "Orbitron, monospace", fontSize: 11, color, letterSpacing: "0.12em", marginBottom: 8, textTransform: "uppercase" }}>
        {node.label}
      </p>

      {/* Domain badge */}
      <span style={{
        display: "inline-block",
        fontFamily: "JetBrains Mono, monospace", fontSize: 9,
        padding: "2px 8px", border: `1px solid ${color}`,
        color, letterSpacing: "0.1em", marginBottom: 8,
      }}>
        {node.domain.toUpperCase()}
      </span>

      {/* Type + degree */}
      <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#4b5563", marginBottom: 12, lineHeight: 1.8 }}>
        <div>TYPE: {node.type.toUpperCase()}</div>
        <div>DEGREE: {node.degree} connections</div>
        <div>WEIGHT: {node.weight.toFixed(2)}</div>
      </div>

      {/* Connected nodes */}
      {connectedNodes.length > 0 && (
        <>
          <p style={{ fontFamily: "Orbitron, monospace", fontSize: 9, color: "#4b5563", letterSpacing: "0.12em", marginBottom: 6 }}>
            CONNECTED NODES
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 12 }}>
            {connectedNodes.map((n) => (
              <button
                key={n.id}
                onClick={() => onNavigate(n.id)}
                style={{
                  fontFamily: "Rajdhani, sans-serif", fontSize: 12,
                  color: domainColor(n.domain),
                  background: "transparent",
                  border: `1px solid ${domainColor(n.domain)}22`,
                  padding: "3px 8px", cursor: "pointer",
                  textAlign: "left",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  transition: "border-color 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = domainColor(n.domain) + "88")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = domainColor(n.domain) + "22")}
              >
                {n.label.length > 28 ? n.label.slice(0, 27) + "…" : n.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Query button */}
      <button
        onClick={handleQueryNode}
        style={{
          width: "100%",
          fontFamily: "Orbitron, monospace", fontSize: 9,
          letterSpacing: "0.12em", padding: "8px",
          border: `1px solid ${color}`,
          color, background: color + "11",
          cursor: "pointer",
          textTransform: "uppercase",
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = color + "22")}
        onMouseLeave={(e) => (e.currentTarget.style.background = color + "11")}
      >
        🔍 QUERY THIS NODE
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors (or only pre-existing unrelated errors).

- [ ] **Step 3: Open the page and verify graph renders**

Visit `http://localhost:3005/obsidian-graph`.

Verify:
- Dark canvas with radial glow
- Nodes appear as coloured circles (cyan for aircraft, purple for medical, amber for NEXTAGENTAI bridge)
- Nodes animate via force simulation
- Hover: node grows, connected edges highlight
- Click: side panel slides in from right
- PAUSE button stops animation
- Domain filter buttons show/hide nodes
- Stats overlay shows live counts

- [ ] **Step 4: Verify QUERY THIS NODE writes to localStorage**

Click any node → click "🔍 QUERY THIS NODE" → new tab opens at `/`. Open DevTools → Application → localStorage → confirm `pending_query` and `pending_domain` are set.

- [ ] **Step 5: Verify label fade by zoom**

Scroll to zoom out below 0.6× → labels disappear. Scroll to zoom in past 0.6× → labels reappear.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/obsidian-graph/ObsidianGraph.tsx
git commit -m "feat: build ObsidianGraph D3 force simulation with hover/click/zoom/pan/side-panel"
```

---

## Task 6: Performance — Canvas fallback for large graphs (> 500 nodes)

**Files:**
- Modify: `frontend/app/obsidian-graph/ObsidianGraph.tsx` (add canvas renderer branch)

- [ ] **Step 1: Add canvas renderer for large graphs**

In `ObsidianGraph.tsx`, add a canvas renderer that activates when `simNodes.length > 500`. Add these additions:

After the `simRef` declaration, add a canvas ref:

```typescript
const canvasRef = useRef<HTMLCanvasElement>(null);
const USE_CANVAS = simNodes.length > 500;
```

Add a canvas-based `useEffect` that runs when `USE_CANVAS` is true:

```typescript
useEffect(() => {
  if (!USE_CANVAS) return;
  if (!canvasRef.current) return;

  const canvas = canvasRef.current;
  const ctx = canvas.getContext("2d")!;
  const width  = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width  = width;
  canvas.height = height;

  const nodesCopy: SimNode[] = visibleNodes.map((n) => ({ ...n }));
  const linksCopy: SimLink[] = visibleLinks.map((l) => ({ ...l }));

  const sim = d3
    .forceSimulation<SimNode>(nodesCopy)
    .force("link", d3.forceLink<SimNode, SimLink>(linksCopy).id((d) => d.id).distance(80).strength(0.4))
    .force("charge", d3.forceManyBody<SimNode>().strength(-120))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collide", d3.forceCollide<SimNode>().radius((d) => nodeRadius(d.degree, maxDegree) + 4));

  simRef.current = sim as unknown as d3.Simulation<SimNode, SimLink>;
  sim.stop();
  for (let i = 0; i < 300; i++) sim.tick();

  function draw() {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, width, height);

    // Draw edges
    for (const l of linksCopy) {
      const s = l.source as SimNode;
      const t = l.target as SimNode;
      ctx.beginPath();
      ctx.moveTo(s.x!, s.y!);
      const mx = (s.x! + t.x!) / 2;
      const my = (s.y! + t.y!) / 2 - 30;
      ctx.quadraticCurveTo(mx, my, t.x!, t.y!);
      ctx.strokeStyle = domainColor(l.domain) + "4d";
      ctx.lineWidth = Math.max(0.5, Math.min(3, l.weight));
      ctx.globalAlpha = 0.3;
      ctx.stroke();
    }

    // Draw nodes
    ctx.globalAlpha = 1;
    for (const n of nodesCopy) {
      const r = nodeRadius(n.degree, maxDegree);
      const color = domainColor(n.domain);
      // Glow
      ctx.shadowBlur = 8;
      ctx.shadowColor = color;
      ctx.beginPath();
      ctx.arc(n.x!, n.y!, r, 0, 2 * Math.PI);
      ctx.fillStyle = color + "33";
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  sim.on("tick", draw).alpha(0.3).restart();
  draw();

  return () => { sim.stop(); };
}, [USE_CANVAS, visibleNodes, visibleLinks, maxDegree]);
```

In the render section, swap the SVG canvas for a `<canvas>` when `USE_CANVAS`:

```typescript
// In the main graph render section, replace the <svg> with:
{USE_CANVAS ? (
  <canvas
    ref={canvasRef}
    style={{ width: "100%", height: "100%", display: "block" }}
  />
) : (
  <svg ref={svgRef} style={{ width: "100%", height: "100%", display: "block" }}>
    {/* ...existing SVG content... */}
  </svg>
)}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/obsidian-graph/ObsidianGraph.tsx
git commit -m "feat: add canvas renderer fallback for graphs with > 500 nodes"
```

---

## Task 7: Empty state — partial data (one domain indexed)

**Files:**
- Modify: `frontend/app/obsidian-graph/ObsidianGraph.tsx`

The current empty state only handles the case when both domains are empty. We need to handle the case where only one domain has data (show the available cluster + an amber warning for the empty domain).

- [ ] **Step 1: Add partial empty state banner**

In `ObsidianGraph.tsx`, inside the main graph render (before the SVG), add a conditional banner:

```typescript
{/* Partial index warning */}
{(aircraftEmpty || medicalEmpty) && !aircraftEmpty === !medicalEmpty ? null : (
  <div style={{
    position: "absolute", bottom: 40, left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(10,10,20,0.9)",
    border: "1px solid #92400e",
    padding: "8px 16px", zIndex: 15,
    display: "flex", alignItems: "center", gap: 12,
  }}>
    {aircraftEmpty && (
      <>
        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#f59e0b" }}>
          AIRCRAFT INDEX NOT BUILT
        </span>
        <button
          onClick={async () => { await buildIndex("aircraft"); refetch(); }}
          style={{
            fontFamily: "Orbitron, monospace", fontSize: 9,
            padding: "3px 10px", border: "1px solid #f59e0b",
            color: "#f59e0b", background: "transparent",
            cursor: "pointer", letterSpacing: "0.1em",
          }}
        >
          BUILD INDEX
        </button>
      </>
    )}
    {medicalEmpty && (
      <>
        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#a855f7" }}>
          MEDICAL INDEX NOT BUILT
        </span>
        <button
          onClick={async () => { await buildIndex("medical"); refetch(); }}
          style={{
            fontFamily: "Orbitron, monospace", fontSize: 9,
            padding: "3px 10px", border: "1px solid #a855f7",
            color: "#a855f7", background: "transparent",
            cursor: "pointer", letterSpacing: "0.1em",
          }}
        >
          BUILD INDEX
        </button>
      </>
    )}
  </div>
)}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add frontend/app/obsidian-graph/ObsidianGraph.tsx
git commit -m "feat: add partial empty state banner with per-domain BUILD INDEX buttons"
```

---

## Task 8: Final verification — acceptance criteria walkthrough

**Files:** No file changes — this is a manual/automated test step.

- [ ] **Step 1: Full build check (no SSR errors)**

```bash
cd frontend && npm run build 2>&1 | tail -30
```

Expected: `✓ Compiled successfully` with no errors. The `/obsidian-graph` route should appear in the output as a client component (dynamic).

- [ ] **Step 2: Run dev and walk through acceptance criteria**

Visit `http://localhost:3005/obsidian-graph` and verify each item:

```
[✓] Page renders at /obsidian-graph with no SSR errors
[✓] Both aircraft and medical nodes visible, colour-coded correctly (cyan / purple)
[✓] Force simulation runs — nodes animate into position on load
[✓] Hover: node glows, connected edges highlight, neighbour nodes brighten
[✓] Click: side panel slides in with node details (id, domain badge, type, degree, connected list)
[✓] Domain filter buttons show/hide nodes by domain
[✓] Zoom/pan works (scroll + drag)
[✓] Double-click resets view to fit all
[✓] Stats overlay shows live node/edge counts
[✓] Loading state shows during data fetch
[✓] Empty state with index build buttons if no data
[✓] KNOWLEDGE GRAPH nav item appears in AppHeader dropdown with Brain icon
[✓] Height is calc(100vh - 46px) — no overflow under 46px AppHeader
[✓] No static import of ObsidianGraph — confirmed dynamic({ ssr: false }) in page.tsx
[✓] graphNodes/edges are memoized — confirmed useMemo in useGraphData and simNodes/simLinks in ObsidianGraph
[✓] Works on both aircraft and medical domain simultaneously
[✓] QUERY THIS NODE button opens / with node pre-filled via localStorage
[✓] Canvas renderer activates when nodes > 500 (verify with a large dataset or by temporarily changing threshold)
```

- [ ] **Step 3: Verify no static import of ObsidianGraph**

```bash
grep -n "import ObsidianGraph" frontend/app/obsidian-graph/page.tsx
```

Expected: no static import — only the `dynamic(...)` call.

- [ ] **Step 4: Verify no inline array expressions as props**

```bash
grep -n "nodes={.*\[\]}" frontend/app/obsidian-graph/ObsidianGraph.tsx
```

Expected: no matches. All arrays passed as props are from `useMemo`.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: obsidian-graph — full-screen D3 force knowledge graph, SCADA theme, aircraft+medical domains"
```

---

## Appendix: SCADA CSS variables reference

These are already defined in the project's global CSS — no changes needed:

```css
--col-cyan:   hsl(191 97% 42%)   /* #00d4ff aircraft */
--col-purple: hsl(271 91% 65%)   /* #a855f7 medical */
--col-amber:  hsl(38 92% 50%)    /* #f59e0b bridge/compute */
--col-green:  hsl(142 71% 45%)   /* #22c55e success */
--col-pink:   hsl(330 81% 60%)   /* #f472b6 agent */
```

## Appendix: Key constraints from CLAUDE.md (do not violate)

- `ObsidianGraph` MUST be imported via `dynamic({ ssr: false })` — never as a static import
- `height: "calc(100vh - 46px)"` — never `100vh` or `h-screen`
- `graphNodes` and `graphEdges` (and all arrays passed as D3 data) MUST be `useMemo`
- Do NOT modify `GraphViewer.tsx` or `LightRAGGraphViewer.tsx`
- `Network` icon already imported in AppHeader — use `Brain` to differentiate KNOWLEDGE GRAPH from LIGHTRAG
- `pending_query` + `pending_domain` localStorage keys for the examples bridge — use these exact keys in "QUERY THIS NODE"
