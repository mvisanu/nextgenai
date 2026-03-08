# NextAgentAI — Frontend Handoff Document

Wave 3 implementation. Covers all new components, modified files, API integrations, and architecture decisions introduced in this sprint.

---

## Completed Work

### Sprint 1 — Session Memory + History Sidebar

**ChatPanel session memory** (`frontend/app/components/ChatPanel.tsx`)

- Component split into `ChatPanelInner` (uses `useSearchParams`) wrapped by a default-exported `ChatPanel` with `<Suspense>`. Required by Next.js App Router — any component using `useSearchParams` must be inside a Suspense boundary.
- Session state: `sessionId: string | null` (set to `crypto.randomUUID()` on first query), `conversationHistory: ConversationTurn[]` (max 5 turns). Stored in component state only — NOT localStorage.
- Session pill: "Session active • N turns" displayed below the input when `sessionTurns >= 1`.
- Clear button (Trash2 icon): resets messages, inputValue, error, runData, sessionId, and conversationHistory.
- Share URL: on mount, reads `?run=<run_id>` from `useSearchParams`, calls `getRun(runId)`, and populates runData without re-querying.
- localStorage bridge: on mount, reads `localStorage.pending_query` + `localStorage.pending_domain`, sets domain, pre-fills input, then auto-submits after a 300 ms debounce (calls `submitQuery(pendingQuery)` directly to avoid async `setInputValue` timing). Both keys are deleted after reading.

**HistorySidebar** (`frontend/app/components/HistorySidebar.tsx`) — new file

- 240 px collapsible panel, dark SCADA theme. Toggled by a Clock icon button in the ChatPanel header.
- On open: fetches `getRuns(20, 0)`. Sorted: favourites first, then reverse chronological.
- `RunItem`: query text 2-line clamped to 60 chars, intent badge colour-coded, relative timestamp, star icon (optimistic toggle via `patchFavourite`), share icon (copies `?run=<id>` URL to clipboard).
- Click-to-load: calls `getRun(run.id)` and calls the `onLoad` prop callback with the full `QueryResponse`. No re-query of the backend.
- Props: `open: boolean`, `onClose: () => void`, `onLoad: (r: QueryResponse) => void`.

---

### Sprint 2 — Streaming, Export, Timeline, Citations

**SSE streaming** (`frontend/app/components/ChatPanel.tsx`)

- `submitQuery()` attempts streaming first: `fetch(url, { headers: { Accept: "text/event-stream" } })`. Parses SSE lines: `{type:"token", content:"..."}` appended to the in-progress message; `{type:"done", data: QueryResponse}` finalises runData. If the response Content-Type is not `text/event-stream`, falls through to the non-streaming `postQuery()` path. Non-streaming path retries up to 3x with 4 s delay on network/502 errors.

**ExportModal** (`frontend/app/components/ExportModal.tsx`) — new file

- Modal overlay with PDF and JSON export options.
- PDF: `@react-pdf/renderer` — `ExportPdfDocument` React component with dark industrial theme (`#0a0f0a` background, `#00ff88` accent). Sections: header (title, query, run_id, timestamp), Answer, Claims table (Claim | Confidence | Citation ID), Evidence table (Source | Excerpt <= 200 chars | Score), footer with run_id. Generated via `pdf(<ExportPdfDocument />).toBlob()`.
- JSON: `JSON.stringify(runData, null, 2)` downloaded as `run_<id>.json`.
- Export button (Download icon) appears on hover on assistant messages in ChatPanel.
- Props: `open: boolean`, `onClose: () => void`, `runData: QueryResponse`.
- Note: `@react-pdf/renderer` must be in `package.json` dependencies. If not yet installed, run `npm install @react-pdf/renderer` in `frontend/`.

**AgentNotes** (`frontend/app/components/ChatPanel.tsx`)

- Collapsible section on assistant messages showing `next_steps` and `assumptions` from `QueryResponse`. Collapsed by default. Amber text on dark panel. Toggled with a ChevronDown/Up icon.

**Medical disclaimer** (`frontend/app/components/ChatPanel.tsx`)

- Persistent amber banner when `domain === "medical"`. Text: "Clinical information provided for demonstration purposes only. Not for medical decision-making."

**AgentTimeline** (`frontend/app/components/AgentTimeline.tsx`) — complete rewrite

- `SourceBadge`: inline badge on vector hits — `"bm25"` amber, `"vector"` cyan, `"hybrid"` purple.
- CSV download: `downloadCsv()` helper using manual CSV encoding with quoting (no external library required). 1 000-row limit. Shown as a Download icon + "CSV" label button on SQL result tables.
- `TimingBreakdown`: collapsible horizontal bar chart. Stages: classify, vector, sql, graph, synthesise, verify. Bars are proportional to `totalMs`. Amber labels. Uses `state_timings_ms` from `RunSummary`.
- `RunHeader`: CACHED green pill badge when `summary.cached === true`. Timing breakdown shown below plan text.

**CitationsDrawer** (`frontend/app/components/CitationsDrawer.tsx`) — modified

- Prev/Next navigation: `citationNavIndex: number` state (resets when active citation changes). `totalCitations = activeCitation?.citations.length`. ChevronLeft/ChevronRight buttons shown when `totalCitations > 1`. "N of M" counter.
- Conflict badge: amber "CONFLICT" pill next to the confidence meter when `activeCitation.conflict_flagged === true`.
- `HighlightedChunkText` uses `currentCitation` (the nav-indexed citation) for `char_start`/`char_end` highlighting.

---

### Sprint 3 — Examples Run Button + Graph Search

**Examples pages** (`frontend/app/examples/page.tsx`, `frontend/app/medical-examples/page.tsx`) — modified

- Each `ExampleCard` gains a "RUN" button (green Play icon). `handleRunQuery()` writes `localStorage.pending_query` + `localStorage.pending_domain` (`"AIRCRAFT"` or `"MEDICAL"`) then calls `router.push("/")`.
- ChatPanel reads these on mount, auto-submits, and clears both keys.

**GraphViewer** (`frontend/app/components/GraphViewer.tsx`) — modified

- Search input (top-right of graph pane): text input with Search icon. Matching nodes get a white 2 px ring; non-matching nodes dim to 20% opacity. `filteredNodes` is `useMemo`-derived (required to prevent ReactFlow `StoreUpdater` infinite loop — see CLAUDE.md constraint).
- FIT button appears when matches exist: calls `rfInstance.fitView({ nodes: matchingRfNodes, duration: 300, padding: 0.3 })`.
- Viewport-aware popover: constants `POPOVER_WIDTH = 288`, `POPOVER_HEIGHT = 320`. On `handleNodeClick`, flips left if `x + POPOVER_WIDTH > window.innerWidth`, flips up if `y + POPOVER_HEIGHT > window.innerHeight`.
- Edge weight label: `similarity` / `SIMILAR_TO` edges render `label={edge.weight.toFixed(2)}` with dimmed labelStyle.

---

### Dashboard Tabs 3/4/5 — Real Analytics API

**Tab3DefectAnalytics** (`frontend/app/dashboard/components/Tab3DefectAnalytics.tsx`) — modified

- `useEffect` fetches `getAnalyticsDefects()` (aircraft) or `getAnalyticsDiseases()` (medical) on mount and domain change.
- API rows grouped by `defect_type` / `disease`, summed, sorted descending, top 10.
- Chart 1 ("By type" vertical bar) uses real API data when available; falls back to mock on error.
- KPI "TOTAL DEFECTS / CASES (YTD)" shows live total derived from API data when available.
- Loading skeleton shown in Chart 1 while fetching. Amber error banner on API failure.
- Charts 2/3/4 (severity breakdown, trend, NLP themes) remain on mock data — the current `GET /analytics/defects` endpoint does not return severity breakdowns, weekly trends, or TF-IDF keywords.

**Tab4MaintenanceTrends** (`frontend/app/dashboard/components/Tab4MaintenanceTrends.tsx`) — modified

- `useEffect` fetches `getAnalyticsMaintenance()` on mount (aircraft domain only; medical domain skips).
- API rows aggregated by `month` (sum across all event types), sorted chronologically.
- New "MAINTENANCE EVENTS BY MONTH" bar chart panel prepended above the existing asset-selector view. Shows loading / "NO DATA" / bar chart states.
- Amber error banner when API unavailable; existing asset-selector detail panel continues using mock data.

**Tab5DataEval** (`frontend/app/dashboard/components/Tab5DataEval.tsx`) — modified

- `useEffect` fetches `getAnalyticsDefects()` / `getAnalyticsDiseases()` on mount and domain change.
- Derives live counts: total records, unique products/specialties, unique defect types/conditions.
- Live counts merged at the top of the Dataset Health table, replacing any matching static mock rows.
- Static eval metrics table (`EVAL_METRICS` / `MEDICAL_EVAL_METRICS`) remains unchanged — no backend eval endpoint exists.
- Loading state shown in Dataset Health section while fetching.

---

## API Client (`frontend/app/lib/api.ts`)

All additions are additive — no existing signatures were changed.

### New interfaces

```typescript
// Wave 3 — Session memory
interface ConversationTurn { query: string; answer_summary: string; }

// Wave 3 — History
interface HistoryRunSummary {
  id: string; query: string; intent: string; created_at: string;
  is_favourite: boolean; cached: boolean;
}
interface RunListResponse { items: HistoryRunSummary[]; total: number; }

// Wave 3 — Analytics
interface DefectAnalytics  { product: string | null; defect_type: string | null; count: number; }
interface MaintenanceTrend { month: string | null; event_type: string | null; count: number; }
interface DiseaseAnalytics { specialty: string | null; disease: string | null; count: number; }
```

### Updated interfaces

```typescript
interface Claim {
  // ... existing fields
  conflict_flagged?: boolean;   // Wave 3 — amber CONFLICT badge
}
interface VectorHit {
  // ... existing fields
  source?: "bm25" | "vector" | "hybrid";  // Wave 3 — SourceBadge
}
interface RunSummary {
  // ... existing fields
  cached?: boolean;                            // Wave 3 — CACHED pill
  state_timings_ms?: Record<string, number>;   // Wave 3 — TimingBreakdown
}
interface QueryRequest {
  // ... existing fields
  session_id?: string | null;
  conversation_history?: ConversationTurn[] | null;
}
```

### New functions

| Function | Endpoint | Purpose |
|---|---|---|
| `getRuns(limit, offset)` | `GET /runs` | History sidebar list |
| `getRun(runId)` | `GET /runs/{id}` | Load single run (history + share URL) |
| `patchFavourite(runId, isFavourite)` | `PATCH /runs/{id}/favourite` | Star toggle |
| `getAnalyticsDefects(from?, to?, domain?)` | `GET /analytics/defects` | Defect analytics |
| `getAnalyticsMaintenance(from?, to?)` | `GET /analytics/maintenance` | Maintenance trends |
| `getAnalyticsDiseases(from?, to?, specialty?)` | `GET /analytics/diseases` | Medical analytics |

---

## Architecture Constraints (do not regress)

- `graphPath` and `vectorHitsForGraph` in `GraphViewer.tsx` must remain `useMemo` — inline expressions cause an infinite ReactFlow re-render loop.
- `filteredNodes` (node search result) must also be `useMemo` for the same reason.
- Dashboard outer div uses `height: "calc(100vh - 46px)"` — the global AppHeader is 46 px.
- Never add a second `DomainSwitcher` or `NavDropdown` to page sub-headers — they render in the global `AppHeader` via `layout.tsx`.
- `ChatPanel` must remain wrapped in `<Suspense>` because `ChatPanelInner` calls `useSearchParams()`.
- Session memory (sessionId + conversationHistory) must NOT be persisted to localStorage — it lives in component state only and resets on page reload by design.

---

## Pending / Out of Scope for This Wave

| Item | Reason |
|---|---|
| Backend `GET /runs`, `PATCH /runs/{id}/favourite` endpoints | Not in this sprint's backend scope — frontend stubs are in api.ts and will 404 until wired |
| Backend `GET /analytics/defects`, `/maintenance`, `/diseases` | Backend Wave 3 endpoints must be created on FastAPI side |
| `@react-pdf/renderer` install | Run `npm install @react-pdf/renderer` in `frontend/` — type error will resolve |
| CitationsDrawer `citation` undefined error (line 200) | Pre-existing — `citation` narrowing needed; deferred per T3-11 |
| GraphViewer edge type `"SIMILAR_TO"` vs `"similarity"` mismatch (line 329) | Pre-existing — backend edge type normalisation needed |
| T3-11 citation char-offset highlighting | Deferred — requires careful backend + frontend coordination |
| Wave 3 SQL migrations (GIN indexes) | Not yet applied to Neon prod — see MEMORY.md |

---

## File Index

| File | Status |
|---|---|
| `frontend/app/lib/api.ts` | Modified — new types + functions |
| `frontend/app/components/ChatPanel.tsx` | Complete rewrite — session, streaming, SSE, sidebar, export, agent notes, disclaimer |
| `frontend/app/components/HistorySidebar.tsx` | New |
| `frontend/app/components/ExportModal.tsx` | New |
| `frontend/app/components/AgentTimeline.tsx` | Complete rewrite — source badges, CSV, timing, CACHED |
| `frontend/app/components/CitationsDrawer.tsx` | Modified — Prev/Next nav, conflict badge, nav-indexed highlighting |
| `frontend/app/components/GraphViewer.tsx` | Modified — node search, viewport popover, edge weight labels |
| `frontend/app/examples/page.tsx` | Modified — RUN button + localStorage bridge |
| `frontend/app/medical-examples/page.tsx` | Modified — RUN button + localStorage bridge |
| `frontend/app/dashboard/components/Tab3DefectAnalytics.tsx` | Modified — real API for by-type chart + KPI total |
| `frontend/app/dashboard/components/Tab4MaintenanceTrends.tsx` | Modified — real API events-by-month panel |
| `frontend/app/dashboard/components/Tab5DataEval.tsx` | Modified — real API for dataset health metrics |
