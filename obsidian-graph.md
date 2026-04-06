# Claude Code Prompt: Obsidian-Style Knowledge Graph Page

## Context
- Project: NextGenAI (FastAPI + Next.js 16 App Router + pgvector + LightRAG + Supabase)
- Frontend: `frontend/app/` — SCADA industrial theme (Orbitron / Rajdhani / JetBrains Mono)
- Existing graph: `frontend/app/components/GraphViewer.tsx` — uses React Flow, DO NOT modify
- Existing LightRAG graph: `frontend/app/components/LightRAGGraphViewer.tsx` — dynamic ssr:false
- Existing data: aircraft domain (incident_reports + manufacturing_defects + graph_node/graph_edge) and medical domain (medical_cases + medical_embeddings + graph_node/graph_edge)
- Existing API endpoints: `GET /lightrag/graph/{domain}` returns `{nodes, edges}` for aircraft and medical
- Live API: https://nextgenai-5bf8.onrender.com
- AppHeader: 46px fixed — all pages use `height: calc(100vh - 46px)` NOT `100vh`
- NEVER import LightRAGGraphViewer as static import — always `dynamic(..., { ssr: false })`

---

## Objective

Build a new page at `frontend/app/obsidian-graph/page.tsx` that renders a full-screen
Obsidian-style knowledge graph combining BOTH the aircraft and medical domain data.

The page must look and feel like Obsidian's graph view: dark canvas, glowing nodes,
animated force-directed layout, floating node labels, domain-color-coded clusters,
interactive hover/click/zoom/pan — but rendered inside the NextGenAI SCADA aesthetic.

This is a showcase page. It should be the most visually impressive page in the app.

---

## Files to create or modify

### New files
- `frontend/app/obsidian-graph/page.tsx` — main page wrapper with Suspense
- `frontend/app/obsidian-graph/ObsidianGraph.tsx` — dynamic-imported graph component
- `frontend/app/obsidian-graph/useGraphData.ts` — data fetching hook for both domains

### Modified files
- `frontend/app/components/AppHeader.tsx` — add OBSIDIAN GRAPH nav item
- `frontend/app/layout.tsx` — no changes needed (AppHeader already shared)

---

## Implementation requirements

### `useGraphData.ts`
- Fetch from `GET /lightrag/graph/aircraft` and `GET /lightrag/graph/medical` in parallel using `Promise.all`
- Merge the two node/edge arrays into a single graph dataset
- Tag each node with `domain: "aircraft" | "medical"` based on which endpoint it came from
- Tag each edge with `domain` matching its source node's domain
- Add a synthetic "bridge" node in the centre labelled "NEXTAGENTAI" that connects to the top 5 highest-degree nodes from each domain
- Return `{ nodes, edges, loading, error }`
- Handle empty index gracefully (API returns empty arrays — show a placeholder message)

### `ObsidianGraph.tsx` — the core component

**Canvas and layout**
- Use `d3-force` (already likely in project — if not, install) for physics simulation
- Full-screen SVG canvas: `width: 100%`, `height: calc(100vh - 46px)`
- Dark background: `#0a0a0f` with a subtle radial gradient glow at the centre
- Force simulation: `forceLink` + `forceManyBody` (strength -120) + `forceCenter` + `forceCollide`
- Run simulation for 300 ticks before first render (pre-warm), then animate live

**Node rendering**
- Nodes are SVG circles with a glowing outer ring (drop-shadow filter)
- Node size: scale by degree (number of connections) — min 4px, max 18px
- Node colours by domain:
  - Aircraft: `#00d4ff` (cyan — matches SCADA vector colour)
  - Medical: `#a855f7` (purple — matches SCADA medical colour)  
  - Bridge/hub: `#f59e0b` (amber — matches SCADA compute colour)
  - Unconnected: `#374151` (dim grey)
- Glow filter: SVG `feGaussianBlur` + `feComposite` — same technique as Obsidian
- On hover: node pulses (scale 1.4, glow intensifies), connected edges highlight, neighbouring nodes brighten
- On click: open a side panel showing node details (id, type, domain, connected nodes list)

**Edge rendering**
- SVG lines with opacity 0.3 default, 0.8 on hover/selection
- Edge colour: match source node domain colour at 50% opacity
- Curved edges using SVG quadratic bezier (not straight lines) for the Obsidian look
- Edge thickness: scale by weight if available, else uniform 1px

**Node labels**
- Floating text labels below each node
- Font: JetBrains Mono (matches SCADA theme)
- Font size: 9px default, 11px on hover
- Truncate labels > 24 chars with ellipsis
- Labels fade in on zoom level > 0.6 (hidden when zoomed out to reduce clutter)
- Highlighted node label: white, full opacity

**Zoom and pan**
- Implement zoom/pan using `d3-zoom` on the SVG element
- Zoom range: 0.1 → 4.0
- Scroll to zoom, drag to pan
- Double-click: zoom to fit all nodes
- Ctrl+scroll: zoom centred on cursor

**Controls overlay (top-left corner)**
- Domain filter toggle buttons: `[✦ AIRCRAFT]` `[✦ MEDICAL]` `[✦ ALL]`
  - Toggle shows/hides nodes and edges by domain
  - Active domain button glows in domain colour
- `[⟲ RESET VIEW]` — resets zoom/pan to fit all
- `[⏸ PAUSE]` / `[▶ RESUME]` — pause/resume physics simulation

**Stats overlay (bottom-left corner)**
- Live counts: `NODES: N` · `EDGES: N` · `AIRCRAFT: N` · `MEDICAL: N`
- Font: JetBrains Mono, 10px, dim green — SCADA terminal style

**Side panel (right side, slides in on node click)**
- Width: 280px, slides in from right with CSS transition
- Background: `rgba(10,10,20,0.95)` with left border in node's domain colour
- Shows:
  - Node ID (truncated, monospace)
  - Domain badge (AIRCRAFT / MEDICAL) in domain colour
  - Type (entity / chunk / concept)
  - Degree: N connections
  - Connected nodes list (up to 10, each clickable — clicking navigates to that node)
- Close button top-right
- `[🔍 QUERY THIS NODE]` button — opens a new tab to the main chat page with the node ID pre-filled as a query

**Loading state**
- Full-screen loading animation: pulsing concentric rings in SCADA cyan
- Text: "INITIALISING KNOWLEDGE GRAPH..." in Orbitron font
- Show Render cold-start warning if loading takes > 5s: "Backend warming up — this may take 30s on first load"

**Empty state**
- If both domains return 0 nodes: show message with index trigger buttons
- "AIRCRAFT INDEX NOT BUILT" + `[BUILD INDEX]` button → calls `POST /lightrag/index/aircraft`
- "MEDICAL INDEX NOT BUILT" + `[BUILD INDEX]` button → calls `POST /lightrag/index/medical`
- Poll `GET /lightrag/status/{domain}` every 5s while building

**Performance**
- For graphs with > 500 nodes: switch to Canvas renderer (use `<canvas>` instead of SVG)
- Debounce label rendering — only re-render labels on zoom/pan end, not during
- Memoize node and edge arrays — no inline array expressions (causes React re-render loops)

### `page.tsx`
```tsx
import dynamic from "next/dynamic";
import React, { Suspense } from "react";

const ObsidianGraph = dynamic(
  () => import("./ObsidianGraph"),
  { ssr: false }
);

function ObsidianGraphInner() {
  return (
    <div style={{ height: "calc(100vh - 46px)", width: "100%", background: "#0a0a0f" }}>
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

### AppHeader nav item
Add to NAV_ITEMS in `AppHeader.tsx`:
```tsx
{ 
  href: "/obsidian-graph", 
  label: "KNOWLEDGE GRAPH", 
  icon: Network,        // import Network from lucide-react
  accent: "--col-cyan"  // matches aircraft/vector colour
}
```

---

## Visual design spec

**Colour palette (SCADA theme)**
```css
--bg-deep:     #0a0a0f   /* canvas background */
--bg-panel:    #0d1117   /* side panel background */
--col-aircraft: #00d4ff  /* cyan — aircraft nodes */
--col-medical:  #a855f7  /* purple — medical nodes */
--col-bridge:   #f59e0b  /* amber — hub/bridge node */
--col-edge:     #1e3a4a  /* dim edge default */
--col-text:     #94a3b8  /* label text */
--col-text-hi:  #f1f5f9  /* highlighted label */
--glow-aircraft: drop-shadow(0 0 6px #00d4ff)
--glow-medical:  drop-shadow(0 0 6px #a855f7)
```

**Typography**
- Node labels: JetBrains Mono 9px
- Panel headings: Orbitron 11px letter-spacing: 0.15em
- Panel body: Rajdhani 13px
- Stats overlay: JetBrains Mono 10px

**Glow effect SVG filter (define once in `<defs>`)**
```svg
<filter id="glow-cyan">
  <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
  <feMerge>
    <feMergeNode in="coloredBlur"/>
    <feMergeNode in="SourceGraphic"/>
  </feMerge>
</filter>
<filter id="glow-purple">
  <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
  <feMerge>
    <feMergeNode in="coloredBlur"/>
    <feMergeNode in="SourceGraphic"/>
  </feMerge>
</filter>
```

---

## npm packages to install (if not already present)

```bash
cd frontend
npm install d3 d3-force d3-zoom d3-selection
npm install --save-dev @types/d3
```

Check `package.json` first — d3 may already be installed via the existing LightRAG graph.

---

## Supabase / auth
- This page is protected — middleware already handles redirect to /sign-in if unauthenticated
- No changes needed to auth layer

---

## Acceptance criteria

- [ ] Page renders at `/obsidian-graph` with no SSR errors
- [ ] Both aircraft and medical nodes visible, colour-coded correctly
- [ ] Force simulation runs — nodes animate into position on load
- [ ] Hover: node glows, connected edges highlight, neighbour nodes brighten
- [ ] Click: side panel slides in with node details
- [ ] Domain filter buttons show/hide nodes by domain
- [ ] Zoom/pan works (scroll + drag)
- [ ] Double-click resets view to fit all
- [ ] Stats overlay shows live node/edge counts
- [ ] Loading state shows during data fetch
- [ ] Empty state with index build buttons if no data
- [ ] KNOWLEDGE GRAPH nav item appears in AppHeader
- [ ] Height is `calc(100vh - 46px)` — no overflow under AppHeader
- [ ] No static import of ObsidianGraph — must be `dynamic({ ssr: false })`
- [ ] graphNodes and graphEdges are memoized — no inline array expressions
- [ ] `useMemo` on all derived data passed as props (prevents React Flow / D3 infinite loops)
- [ ] Works on both aircraft and medical domain simultaneously
- [ ] `[🔍 QUERY THIS NODE]` button navigates to main chat with node pre-filled

---

## Test cases

- Load page with both domains indexed → both clusters visible, bridge node in centre
- Load page with only aircraft indexed → aircraft cluster visible, medical empty state
- Load page with neither indexed → full empty state with both BUILD INDEX buttons
- Click a node → side panel opens with correct data
- Click connected node in side panel → graph navigates to that node (centres and highlights)
- Toggle AIRCRAFT filter off → aircraft nodes and edges disappear, medical remains
- Zoom in past 0.6 → labels appear
- Zoom out below 0.6 → labels fade
- Pause simulation → nodes stop moving
- Query button → opens `/` with node ID in chat input
```

---

## Reference: existing graph components to study before building

Read these files before writing any code:
- `frontend/app/components/LightRAGGraphViewer.tsx` — existing D3/React Flow implementation
- `frontend/app/lightrag/page.tsx` — how memoization and dynamic import are used
- `frontend/app/components/GraphViewer.tsx` — 3-tier graph display pattern

Do NOT modify any of these files. Build the new page independently.