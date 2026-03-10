# NextAgentAI — Product Requirements Document

This file consolidates all wave PRDs into a single reference.

---

# prd2.md — NextAgentAI Wave 3: User Experience & Intelligence Expansion

**Version:** 1.1  **Date:** 2026-03-07  **Status:** Draft

---

## Executive Summary

NextAgentAI has completed two waves of development: a production-ready MVP (Wave 0) and a
performance/RAG optimisation layer (Waves 1–2). The platform successfully classifies natural-language
queries, plans multi-step tool sequences, executes vector/SQL/compute tools in parallel, and returns
cited, confidence-scored answers grounded in real manufacturing and clinical data.

Wave 3 addresses the gap between a technically impressive platform and a genuinely useful daily tool.
Key findings from user experience analysis:

- Every query starts from scratch — no memory of prior conversation, no history, no favourites
- Results are ephemeral — no export, no saved reports, no sharing
- The UI exposes only a fraction of the data the backend already returns (timing, caching, conflict
  detection, BM25 vs vector source labels, next_steps, assumptions)
- 7+ second synthesis latency with no incremental output makes the agent feel slow
- The 28 example queries on separate pages are never one click away from execution
- Dashboard tabs 3–5 show static mock charts despite the DB having real data

Wave 3 fixes these issues in priority order, with zero breaking changes to the existing agent pipeline.

---

## Pre-Implementation Warnings

Read these before starting any epic. They address known failure modes that will silently break
implementations if not handled upfront.

**Warning 1 — Epic 1 pronoun resolution scope:** "resolve 'it'/'them' via context" is a hard NLP
problem. Implement ONLY as "pass last query's explicit filters forward" — not open-ended pronoun
resolution. Full coreference resolution is out of scope; that would add 3–4 weeks.

**Warning 2 — Epic 3 streaming cold start:** SSE fixes perceived latency but NOT the 60-second cold
start on Render free tier. `EAGER_MODEL_LOAD=true` is a hard requirement for the 1.5s first-token
target, not optional. Document this clearly in the env var table.

**Warning 3 — Epic 9 Alembic CONCURRENTLY transaction:** `CREATE INDEX CONCURRENTLY` cannot run
inside a PostgreSQL transaction block. Every migration that uses it must call `op.execute("COMMIT")`
immediately before the `CREATE INDEX CONCURRENTLY` statement, otherwise the migration silently fails
and leaves the index uncreated.

**Rollback rule:** Every Alembic migration written in Wave 3 must have a working `downgrade()`
function. Every epic that modifies the orchestrator must be gated by an env var feature flag so it
can be disabled without a redeploy if it causes regressions.

---

## User Personas

### P1 — Field Engineer (Primary)
**Context:** Uses the platform on a tablet on the factory floor to diagnose a recurring hydraulic
failure. Submits 3–5 queries per session, each building on the last ("show me older ones", "filter
to critical only"). Needs fast answers, clear citations, and the ability to paste a report into a
maintenance ticket.

**Pain points:** Multi-query friction (no context), no export, cold-start 60s wait.

### P2 — Quality Data Analyst (Primary)
**Context:** Power user. Queries twice daily. Has a mental library of 10–15 proven queries. Needs
dashboard charts reflecting real aggregations, not mock data. Wants to track defect trends and flag
anomalies.

**Pain points:** Mock dashboard data, no query history/favourites, no anomaly threshold alerting.

### P3 — Medical Researcher (Secondary)
**Context:** Uses the clinical domain for case-series analysis. Needs the same feature parity as
aircraft domain (HNSW index, full citation highlighting, identical SQL query coverage). Needs strong
disclaimer visibility.

**Pain points:** Medical domain behind aircraft in capability, citation highlighting not working
end-to-end.

---

## Epics

---

### Epic 1 — Conversational Memory & Multi-turn Queries [P0]

**Rationale:** The #1 friction point. Without memory, every query is an island. Field engineers
naturally refine queries in 2–4 follow-up messages. Implementing session-scoped context enables
this without any architectural change to the agent — the orchestrator already accepts `filters`
and the LLM already receives a context string.

**User Stories:**
- As a field engineer, I can ask "narrow it to critical severity" without repeating my original query.
- As an analyst, my follow-up "show only last 30 days" applies the date range to the previous result set.
- As any user, the chat panel shows which session I'm in and lets me start a fresh session.

**Acceptance Criteria:**
- Backend: `QueryRequest` gains optional `session_id: str | None = None` and
  `conversation_history: list[dict] | None = None` fields — all optional, zero breaking change
  for existing API callers
- Orchestrator prepends last N (max 5) query/answer pairs to the synthesis context only;
  format: `"Prior turn {i}: Q: {query} | A: {answer_summary}"`; does NOT re-run vector or SQL
  tools against history
- Frontend: `ChatPanel` generates a `session_id` (UUID) on first query and stores it in
  component state (NOT localStorage)
- Session resets when user clicks the Clear (Trash) button; next query starts fresh with no history
- Frontend shows active session indicator — small pill: "Session active • N turns"
- Follow-up queries that pass context are resolved by the synthesis prompt using prior turn filters,
  not by open-ended pronoun coreference resolution (scope boundary: pass explicit filters forward only)
- `session_id` stored in `agent_runs.session_id` (new nullable column, Alembic migration with
  `downgrade()`)
- Epic gated by `CONVERSATIONAL_MEMORY_ENABLED` env var (default `true`)

**Key backend files:**
- `backend/app/schemas/models.py` — add fields to `QueryRequest`
- `backend/app/agent/orchestrator.py` — inject history into synthesis prompt; save session_id
- `backend/app/db/models.py` — add `session_id UUID` nullable column to `agent_runs`
- `backend/app/db/migrations/` — new migration with `downgrade()`

**Key frontend files:**
- `frontend/app/components/ChatPanel.tsx` — session UUID, history accumulation, session pill, clear reset

**Effort:** M (3–4 days: schema migration + orchestrator prompt change + frontend state)

---

### Epic 2 — Query History & Favourites [P0]

**Rationale:** `agent_runs` already stores every query with full results. Surfacing this in a
sidebar costs almost nothing on the backend but dramatically increases platform stickiness.

**User Stories:**
- As an analyst, I see my last 20 queries in a sidebar and click to reload any result instantly.
- As a power user, I star a query to add it to Favourites, accessible at the top of the history list.
- As a field engineer, I share a query result URL with a colleague.

**Acceptance Criteria:**
- `GET /runs?limit=20&offset=0` returns paginated run summaries:
  `{ id, query, intent, created_at, cached, latency_ms, is_favourite }`
- `PATCH /runs/{run_id}/favourite` toggles `is_favourite: bool`; returns updated summary
- Frontend: new `HistorySidebar.tsx` component — collapsible left sidebar, 240px wide, toggled
  by clock icon in ChatPanel header
- History items show: query text (truncated 60 chars), intent badge, relative timestamp, star icon
- Favourites pinned to top of list; non-favourites in reverse chronological order
- Clicking a history item loads `runData` into the existing `AgentTimeline` + `GraphViewer` without
  re-executing the query (uses existing `GET /runs/{run_id}` endpoint)
- "Share" icon copies `?run=<run_id>` to clipboard; visiting that URL loads the cached run via
  `useSearchParams` in `ChatPanel`
- Alembic migration: add `is_favourite BOOLEAN DEFAULT FALSE` column to `agent_runs`; migration
  must include `downgrade()` that drops the column

**Key backend files:**
- `backend/app/api/runs.py` — `GET /runs` paginated list + `PATCH /runs/{id}/favourite`
- `backend/app/db/models.py` — add `is_favourite` column
- `backend/app/db/migrations/` — migration with `downgrade()`

**Key frontend files:**
- `frontend/app/components/HistorySidebar.tsx` (new component)
- `frontend/app/components/ChatPanel.tsx` — `useSearchParams` run loading, share URL logic

**Effort:** M (3 days: backend endpoint + migration + frontend sidebar)

---

### Epic 3 — Streaming Synthesis Output [P1]

**Rationale:** 5–7s synthesis with a spinner destroys perceived performance. Streaming tokens to
the UI makes the agent feel 3× faster even if wall-clock time is identical.

**Pre-condition:** `EAGER_MODEL_LOAD=true` must be set on Render to load the embedding model at
startup. Without this, the first-token target of 1.5s is not achievable on cold instances regardless
of streaming implementation.

**User Stories:**
- As any user, I see the answer appear word-by-word starting within ~1s of submitting.
- As a field engineer, I can start reading the answer before it finishes generating.

**Acceptance Criteria:**
- Backend: `POST /query` with `Accept: text/event-stream` header triggers SSE streaming mode
- SSE event types:
  - `data: {"type": "token", "text": "..."}` — one per LLM token during synthesis
  - `data: {"type": "done", "run": {...}}` — full `QueryResponse` at end
  - `data: {"type": "error", "message": "..."}` — on failure
- Only the synthesis Anthropic call uses `stream=True`; intent classification, tool execution,
  and verification remain non-streaming (no change to orchestrator state machine)
- `backend/app/llm/client.py` gains `stream(prompt) -> AsyncIterator[str]` method on `LLMClient`
- Frontend: `ChatPanel` switches to `fetch` with `ReadableStream`; renders tokens progressively
  into the message bubble as they arrive
- Claims, evidence table, and graph panel rendered only after `type:done` event
- Fallback: if SSE connection fails, retry once with existing non-streaming `POST /query`
- First token appears within 1.5s of submission on a warm Render instance
- Feature gated by `STREAMING_ENABLED` env var (default `true`)

**Key backend files:**
- `backend/app/api/query.py` — SSE streaming variant of the query endpoint
- `backend/app/llm/client.py` — add `stream()` async iterator method

**Key frontend files:**
- `frontend/app/components/ChatPanel.tsx` — streaming renderer, fallback logic

**Effort:** L (4–5 days: SSE endpoint + frontend streaming renderer + fallback)

---

### Epic 4 — Real Dashboard Analytics [P1]

**Rationale:** Tabs 3–5 of the dashboard show mock Recharts charts. The DB has real data.
Wiring these to actual SQL aggregations replaces demo content with operational value.

**User Stories:**
- As a data analyst, Tab 3 (Defect Analytics) shows real defect counts by product from the
  `manufacturing_defects` table, filterable by date range.
- As a field engineer, Tab 4 (Maintenance Trends) shows a real time-series from `maintenance_logs`.
- As a medical researcher, disease analytics (Tab 3 medical) shows real disease frequency from
  `disease_records`.

**Acceptance Criteria:**
- New `backend/app/api/analytics.py` file with three endpoints:
  - `GET /analytics/defects?from=&to=&domain=` — reuses `defect_counts_by_product` named query;
    returns `[{product, defect_type, count}]`
  - `GET /analytics/maintenance?from=&to=` — reuses `maintenance_trends` named query;
    returns `[{month, event_type, count}]`
  - `GET /analytics/diseases?from=&to=&specialty=` — reuses `disease_counts_by_specialty` named query;
    returns `[{specialty, disease, count}]`
- All endpoints enforce SELECT-only via existing SQL guardrail; all added to CORS origin list
- Dashboard Tabs 3–5 replace mock data arrays with `useEffect` API calls to new endpoints
- Existing date-range pickers (already in Tab 2 UI) wired to pass `from`/`to` query params
- Charts re-render on domain switch (AIRCRAFT ↔ MEDICAL)
- Loading skeleton shown while fetching; error state shown if endpoint fails
- No flash of stale mock data on load

**Key backend files:**
- `backend/app/api/analytics.py` (new file)

**Key frontend files:**
- `frontend/app/dashboard/page.tsx` — wire Tabs 3, 4, 5 to real analytics endpoints

**Effort:** M (3 days: 3 new API endpoints + frontend data wiring)

---

### Epic 5 — Export & Reporting [P1]

**Rationale:** Results are currently ephemeral. Field engineers and analysts need to share
findings in maintenance tickets, reports, and medical notes. Export is table-stakes for a
professional analytics tool.

**User Stories:**
- As a field engineer, I export a query result (answer + claims + evidence table) as PDF.
- As an analyst, I export SQL results from the AgentTimeline as CSV.
- As a medical researcher, I export a clinical query result with citations formatted as references.

**Acceptance Criteria:**
- "Export" button (Download icon) appears in ChatPanel message actions for assistant messages
- Export options dialog via new `ExportModal.tsx` component: PDF and JSON (raw `QueryResponse`)
- PDF generated client-side via `@react-pdf/renderer` — no server round-trip
- PDF template:
  - Header: NEXTAGENTAI logo | query text | run ID | timestamp
  - Section 1: Answer text
  - Section 2: Claims table — Claim | Confidence | Citation ID
  - Section 3: Evidence table — Source | Excerpt (truncated 200 chars) | Score
  - Footer: "Generated by NextAgentAI | run_id: ..."
- JSON export: `JSON.stringify(queryResponse, null, 2)` downloaded as `run_<id>.json`
- SQL result tables in `AgentTimeline` gain a "CSV" download button (first 1000 rows)
- CSV generated client-side via `Papa.unparse()` (papaparse); column headers from `result.columns`
- No backend changes required

**Key frontend files:**
- `frontend/app/components/ChatPanel.tsx` — Export button on assistant messages
- `frontend/app/components/ExportModal.tsx` (new component) — PDF + JSON export
- `frontend/app/components/AgentTimeline.tsx` — CSV download button on SQL result tables

**Effort:** M (3 days: PDF template + export buttons + CSV download)

---

### Epic 6 — Enhanced Citation UX [P1]

**Rationale:** Citations are the trust mechanism. Three issues undermine them: (a) only first
citation shown per claim, (b) char-offset highlighting not rendering (T3-11 deferred), (c)
conflicted claims have no visual indicator.

**User Stories:**
- As a field engineer, I click [1] and see the highlighted passage in the source document, not
  just the raw chunk text.
- As an analyst, I see "CONFLICT DETECTED" badge on claims where the graph scorer detected
  contradictory evidence.
- As a medical researcher, I navigate between multiple citations for a single claim using
  Prev/Next buttons.

**Acceptance Criteria:**
- `CitationsDrawer`: add Prev/Next buttons when `citations.length > 1`; show "1 of N" counter
- Char offset highlighting implemented via:
  ```typescript
  function highlightRange(text: string, start: number, end: number): ReactNode {
    return (<>{text.slice(0, start)}<mark>{text.slice(start, end)}</mark>{text.slice(end)}</>);
  }
  ```
  Uses `char_start`/`char_end` from citation metadata
- Conflict badge: if `claim.conflict_flagged === true`, show amber "CONFLICT" badge next to
  confidence score in both inline claims and CitationsDrawer
- Claims with `confidence < 0.4` display with 2-line clamp and "Read more" chevron to expand
- Backend: `conflict_flagged` field propagation from graph scorer → verifier → claim objects
  in `QueryResponse` already implemented in T3-07; this epic is frontend display only

**Key frontend files:**
- `frontend/app/components/CitationsDrawer.tsx` — Prev/Next nav, offset highlighting, conflict badge

**Effort:** S (2 days: all frontend changes; no backend work)

---

### Epic 7 — Examples → Chat Integration [P2]

**Rationale:** 28 example queries exist on separate pages with zero integration to the main
chat. Users copy-paste. One button click fixes this entirely.

**User Stories:**
- As any user, I click "Run this query" on an example and it pre-fills the ChatPanel input
  and submits immediately.
- As a new user, the examples page functions as an interactive tutorial.

**Acceptance Criteria:**
- `/examples` and `/medical-examples` — each example card gains a "Run Query" button
- On click:
  1. Store query text in `localStorage` key `pending_query`
  2. Store domain in `localStorage` key `pending_domain` (`AIRCRAFT` or `MEDICAL`)
  3. Navigate to `/`
- `ChatPanel` on mount checks `localStorage` for `pending_query`; if present, sets domain to
  `pending_domain`, pre-fills input, and auto-submits after 300ms debounce (allows health check
  to settle first)
- Both localStorage keys cleared immediately after submission
- If `ChatPanel` mounts with no `pending_query`, behaviour is unchanged

**Key frontend files:**
- `frontend/app/examples/page.tsx` — "Run this query" button + localStorage write + navigate
- `frontend/app/medical-examples/page.tsx` — "Run this query" button + localStorage write + navigate
- `frontend/app/components/ChatPanel.tsx` — localStorage read on mount + auto-submit

**Effort:** S (1 day: localStorage bridge + auto-submit in ChatPanel)

---

### Epic 8 — Graph Enhancements [P2]

**Rationale:** The knowledge graph is visually impressive but hard to use at scale. Node
popovers go offscreen; there's no way to find a specific entity; no edge weight visibility.

**User Stories:**
- As an analyst, I type in a search box to highlight nodes matching a term.
- As a field engineer, I click a node and the popover stays within the viewport.
- As a researcher, I see edge weights labeled on graph edges (e.g., "similarity: 0.87").

**Acceptance Criteria:**
- Search input (top-right of `GraphViewer`) filters visible nodes by label substring;
  non-matching nodes dim to 20% opacity; matching nodes highlighted with white ring
- "Fit to selection" button: after search, calls
  `reactFlowInstance.fitView({ nodes: matchingNodes })` to zoom to matching nodes only
- Viewport-aware popover positioning: `if (x + POPOVER_WIDTH > window.innerWidth)` flip to
  left; same vertical check: `if (y + POPOVER_HEIGHT > window.innerHeight)` flip upward
- Edge labels: `similarity` / `SIMILAR_TO` edges show weight formatted to 2dp on hover
  (ReactFlow edge label: `label={edge.type === 'SIMILAR_TO' ? edge.weight.toFixed(2) : undefined}`)
- No changes to graph data structures or backend

**Key frontend files:**
- `frontend/app/components/GraphViewer.tsx` — search input, fitView, viewport-aware popover,
  edge labels

**Effort:** M (2–3 days: search filter + popover positioning + edge labels)

---

### Epic 9 — Medical Domain Parity [P2]

**Rationale:** Medical domain is a first-class use case but trails aircraft in index performance
(IVFFlat vs HNSW — aircraft already migrated as T-10) and is missing one analytics SQL query
needed for Tab 4 parity.

**Pre-condition:** See Warning 3 above — `op.execute("COMMIT")` must precede every
`CREATE INDEX CONCURRENTLY` in the migration or it will silently fail.

**User Stories:**
- As a medical researcher, search results return with the same latency as aircraft queries.
- As a researcher, the "CONFLICT DETECTED" badge works on clinical claims just as on aircraft.

**Acceptance Criteria:**
- New Alembic migration:
  ```python
  def upgrade():
      op.execute("COMMIT")  # required: CONCURRENTLY cannot run in a transaction block
      op.execute("""
          CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_medical_embeddings_hnsw
          ON medical_embeddings USING hnsw (embedding vector_cosine_ops)
          WITH (m = 16, ef_construction = 64)
      """)
      # GIN full-text search indexes for BM25 hybrid retrieval
      op.execute("""
          CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_incident_reports_fts
          ON incident_reports USING GIN(to_tsvector('english', narrative))
      """)
      op.execute("""
          CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_medical_cases_fts
          ON medical_cases USING GIN(to_tsvector('english', narrative))
      """)
      op.execute("""
          CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_runs_query_ts
          ON agent_runs (LOWER(query), created_at DESC)
      """)

  def downgrade():
      op.execute("DROP INDEX IF EXISTS idx_medical_embeddings_hnsw")
      op.execute("DROP INDEX IF EXISTS idx_incident_reports_fts")
      op.execute("DROP INDEX IF EXISTS idx_medical_cases_fts")
      op.execute("DROP INDEX IF EXISTS idx_agent_runs_query_ts")
  ```
- `EXPLAIN (ANALYZE, FORMAT JSON)` on a medical embedding query confirms
  "Index Scan using idx_medical_embeddings_hnsw"
- New named SQL query `medical_case_trends` added to `sql_tool.py`:
  ```sql
  SELECT DATE_TRUNC('month', date) AS month, specialty, COUNT(*) AS case_count
  FROM disease_records
  WHERE date >= CURRENT_DATE - INTERVAL ':days days'
  GROUP BY month, specialty ORDER BY month
  ```
  This provides Tab 4 parity for medical domain in the analytics dashboard
- Medical disclaimer banner: persistent amber banner beneath the ChatPanel input when
  domain = MEDICAL: "Clinical data is for research only. Not for diagnostic or treatment decisions."
- Verify `conflict_flagged` propagation works for medical claims (same code path as aircraft)
- All three pending Wave 3 SQL migrations applied (GIN FTS indexes on both domains + agent_runs
  index)

**Key backend files:**
- `backend/app/db/migrations/` — new migration with `downgrade()`
- `backend/app/tools/sql_tool.py` — add `medical_case_trends` named query

**Key frontend files:**
- `frontend/app/components/ChatPanel.tsx` — persistent medical disclaimer banner

**Effort:** S (1–2 days: migration + 1 new SQL query + disclaimer banner)

---

### Epic 10 — Developer Experience & Observability Improvements [P2]

**Rationale:** The backend captures rich telemetry (state timings, cache hits, BM25 vs vector
source) that the UI never shows. Surfacing this increases trust and aids debugging.

**User Stories:**
- As any user, I see a "CACHED" badge on query results that were served from cache.
- As a developer, the AgentTimeline shows per-stage latency as a mini bar chart.
- As an analyst, vector hits show whether they came from BM25, vector, or both (hybrid).

**Acceptance Criteria:**
- Fix CR-007: `compute_tool.py` `run_async()` replaces `asyncio.get_event_loop()` with
  `asyncio.get_running_loop()`; `grep -r "get_event_loop" backend/` returns zero results
- `RunSummary.cached === true` → green "CACHED" pill badge in `AgentTimeline` header
- Timing breakdown: new collapsible "TIMING BREAKDOWN" row beneath plan text in `AgentTimeline`;
  horizontal bar chart (inline CSS, no new chart library) showing ms per stage:
  `classify | vector | sql | graph | synthesise | verify`; bar widths sum correctly to total
  `latency_ms`
- Vector hit metadata: add `source: Literal["bm25", "vector", "hybrid"]` field to `VectorHit`
  schema in `schemas/models.py` and tag each hit in `retrieval.py` during hybrid merge step;
  displayed as small badge per hit in expanded timeline step
- `next_steps` and `assumptions` from `QueryResponse` rendered beneath the main answer in
  `ChatPanel` as a collapsible "AGENT NOTES" section (collapsed by default)

**Key backend files:**
- `backend/app/tools/compute_tool.py` — fix CR-007
- `backend/app/rag/retrieval.py` — add `source` label to vector hits
- `backend/app/schemas/models.py` — add `source` field to `VectorHit`

**Key frontend files:**
- `frontend/app/components/AgentTimeline.tsx` — CACHED badge, timing bar chart, source labels
- `frontend/app/components/ChatPanel.tsx` — AGENT NOTES collapsible section

**Effort:** S (2 days: mostly frontend display changes; one small backend schema addition)

---

## Technical Constraints

- **No breaking API changes:** All new `QueryRequest` fields must be optional with defaults;
  existing single-query callers must be unaffected
- **Existing agent pipeline unchanged:** Orchestrator's 8-stage state machine is not modified;
  new features hook in via prompt context injection or post-processing only
- **SQL guardrails preserved:** New analytics endpoints use the same named-query pattern — no
  raw SQL generation; SELECT-only enforced on all new endpoints
- **graph_path always returned:** Backend contract unchanged; `GraphViewer` 3-tier fallback intact
- **Render free tier:** SSE streaming is supported (HTTP/1.1 chunked); persistent WebSocket
  connections not recommended (15-min spindown risk); `EAGER_MODEL_LOAD=true` required for
  streaming first-token target
- **CORS:** New endpoints (`/analytics/*`, `/runs`, `PATCH /runs/*/favourite`) must be added to
  the explicit CORS origin list; no wildcard origins
- **Hydration:** `<html>` `suppressHydrationWarning` retained; no new SSR-breaking class names
- **Dashboard height:** `calc(100vh - 46px)` pattern maintained for all dashboard tabs
- **AppHeader shared:** No page-level duplicate headers; `NavDropdown` and `DomainSwitcher` stay
  in `AppHeader` only
- **Alembic migrations:** Every migration must have a working `downgrade()`; `CREATE INDEX
  CONCURRENTLY` requires `op.execute("COMMIT")` before the statement (cannot run in transaction)
- **Feature flags:** All epics touching the orchestrator must be gated by an env var so they can
  be disabled without a redeploy; documented in the environment variable table below

---

## Environment Variables (Wave 3 Additions)

| Variable | Default | Purpose |
|----------|---------|---------|
| `CONVERSATIONAL_MEMORY_ENABLED` | `true` | Gates Epic 1 session context injection |
| `STREAMING_ENABLED` | `true` | Gates Epic 3 SSE streaming synthesis |
| `EAGER_MODEL_LOAD` | `false` | Must be `true` on Render for streaming 1.5s first-token target |

---

## Success Metrics

| Metric | Baseline (Wave 2) | Wave 3 Target |
|--------|------------------|---------------|
| Multi-turn query capability | 0% (no memory) | 100% (session context) |
| Time-to-first-token (synthesis) | 5–7s (batch) | <1.5s (streaming, warm instance) |
| Dashboard tabs with real data | 2/5 (40%) | 5/5 (100%) |
| Citation highlighting working | Partial (T3-11 deferred) | 100% (offset highlighting) |
| Queries with export option | 0% | 100% |
| Example queries directly runnable | 0% (copy-paste only) | 100% (Run button) |
| Medical vs Aircraft feature parity | ~70% | ~95% |
| Known CR/BUG items resolved | CR-007 open | CR-007 fixed (`grep` confirms zero `get_event_loop`) |
| Agent runs with shareable URLs | 0% | 100% (`?run=<run_id>` format) |
| Dashboard tabs loading skeleton | 0% | 100% (no flash of mock data) |

---

## Out of Scope (Wave 3)

The following are explicitly deferred:

- **Authentication / RBAC** — No user accounts this wave; single shared session
- **Rate limiting** — Deferred; platform audience is small and controlled
- **Fine-tuned embeddings** — Generic `all-MiniLM-L6-v2` retained; domain fine-tuning is Wave 4+
- **Multi-hop query decomposition** — Adds latency; unclear UX benefit at current scale
- **Batch ingest API** — Single-document ingest sufficient for current data volumes
- **pgvector native C binding (T3-05)** — Driver stability risk retained
- **Native async BFS graph traversal (T3-09)** — Current sync-via-run_sync() acceptable
- **Anomaly alerting / webhooks** — Requires background job infrastructure not yet present
- **Mobile-first layout** — Current desktop layout is acceptable; mobile pass planned for Wave 4
- **Full coreference / pronoun resolution** — Scoped to filter-forwarding only (see Warning 1)
- **OpenTelemetry distributed tracing** — Phase 3 Priority 10 item; not Wave 3
- **Cross-encoder re-ranking** — Phase 3 Priority 6 item; not Wave 3
- **Admin telemetry dashboard (`/admin/telemetry`)** — Phase 3 item; not Wave 3

---

## Implementation Priority Matrix

| Epic | User Value | Effort | Priority | Sprint |
|------|-----------|--------|----------|--------|
| Epic 1 — Conversational Memory | Very High | M | **P0** | Sprint 1 |
| Epic 2 — Query History & Favourites | High | M | **P0** | Sprint 1 |
| Epic 3 — Streaming Synthesis | High | L | **P1** | Sprint 2 |
| Epic 4 — Real Dashboard Analytics | High | M | **P1** | Sprint 2 |
| Epic 5 — Export & Reporting | High | M | **P1** | Sprint 2 |
| Epic 6 — Enhanced Citation UX | Medium | S | **P1** | Sprint 2 |
| Epic 7 — Examples → Chat Integration | Medium | S | **P2** | Sprint 3 |
| Epic 8 — Graph Enhancements | Medium | M | **P2** | Sprint 3 |
| Epic 9 — Medical Domain Parity | Medium | S | **P2** | Sprint 3 |
| Epic 10 — Dev Experience & Observability | Low | S | **P2** | Sprint 3 |

**Sprint 1 (P0):** ~6 days total — Epics 1 + 2
**Sprint 2 (P1):** ~13 days total — Epics 3 + 4 + 5 + 6
**Sprint 3 (P2):** ~8 days total — Epics 7 + 8 + 9 + 10

---

## Key Files to Modify

| File | Change |
|------|--------|
| `backend/app/schemas/models.py` | Add `session_id`, `conversation_history` to `QueryRequest`; add `is_favourite` to `RunSummary`; add `source: Literal["bm25","vector","hybrid"]` to `VectorHit` |
| `backend/app/agent/orchestrator.py` | Inject `conversation_history` into synthesis prompt; pass `session_id` to save step; gate with `CONVERSATIONAL_MEMORY_ENABLED` env var |
| `backend/app/api/query.py` | Add SSE streaming endpoint (Accept: text/event-stream variant) |
| `backend/app/api/analytics.py` (new file) | 3 analytics aggregate endpoints: `/analytics/defects`, `/analytics/maintenance`, `/analytics/diseases` |
| `backend/app/api/runs.py` | `GET /runs?limit=&offset=` paginated list + `PATCH /runs/{id}/favourite` |
| `backend/app/db/models.py` | Add `session_id UUID` nullable + `is_favourite BOOLEAN DEFAULT FALSE` to `agent_runs` |
| `backend/app/tools/compute_tool.py` | Fix CR-007: replace `asyncio.get_event_loop()` with `asyncio.get_running_loop()` |
| `backend/app/tools/sql_tool.py` | Add `medical_case_trends` named query |
| `backend/app/rag/retrieval.py` | Add `source` label to vector hits during hybrid merge |
| `backend/app/llm/client.py` | Add `stream(prompt) -> AsyncIterator[str]` method to `LLMClient` |
| `backend/app/db/migrations/` (new — Epic 1) | Add `session_id` column to `agent_runs`; include `downgrade()` |
| `backend/app/db/migrations/` (new — Epic 2) | Add `is_favourite` column to `agent_runs`; include `downgrade()` |
| `backend/app/db/migrations/` (new — Epic 9) | HNSW medical + GIN FTS indexes + agent_runs index; all with `COMMIT` before `CONCURRENTLY`; include `downgrade()` |
| `frontend/app/components/ChatPanel.tsx` | Session state + history accumulation + session pill, streaming renderer, pending_query check, Export button, AGENT NOTES section, medical disclaimer banner |
| `frontend/app/components/AgentTimeline.tsx` | CACHED badge, timing bar chart, source labels per hit, CSV download button |
| `frontend/app/components/CitationsDrawer.tsx` | Prev/Next nav, "1 of N" counter, char-offset highlighting, conflict badge |
| `frontend/app/components/GraphViewer.tsx` | Node search filter + fitView, viewport-aware popover, edge weight labels |
| `frontend/app/components/HistorySidebar.tsx` (new) | History + favourites sidebar with share URL |
| `frontend/app/components/ExportModal.tsx` (new) | PDF (react-pdf/renderer) + JSON export modal |
| `frontend/app/dashboard/page.tsx` | Wire Tabs 3, 4, 5 to real analytics API; loading skeleton; domain switch |
| `frontend/app/examples/page.tsx` | "Run this query" button + localStorage write + navigate |
| `frontend/app/medical-examples/page.tsx` | "Run this query" button + localStorage write + navigate |

---

## Verification Checklist

Run all 10 checks before marking Wave 3 complete:

1. **Multi-turn:** Submit "hydraulic leak last 30 days" → then "show only critical severity" →
   confirm second query returns filtered results without repeating original terms in the request payload.

2. **History:** Submit 3 queries → all appear in history sidebar in reverse chronological order →
   star one → persists on page refresh → click history item → result reloads with zero additional
   calls to `/query` (verify in browser Network tab).

3. **Streaming:** Submit any hybrid query → first tokens appear in UI within 1.5s (warm instance,
   `EAGER_MODEL_LOAD=true`) → claims and graph panel load only after `type:done` event → confirm
   fallback to non-streaming works when SSE fails.

4. **Dashboard:** Navigate to Tab 3 → confirm chart values match
   `SELECT defect_type, COUNT(*) FROM manufacturing_defects GROUP BY defect_type` (run query
   directly in psql to verify) → change date range → chart re-fetches → switch domain to MEDICAL →
   Tab 3 updates to disease data.

5. **Export:** Submit a query → click Export → PDF → open PDF → verify answer text, claims table
   (claim | confidence | citation ID), evidence table (source | excerpt | score), and `run_id`
   footer are all present. Export → JSON → verify file parses with `JSON.parse()` without error.

6. **Citations:** Find a claim with `citations.length > 1` → open CitationsDrawer → verify Prev/Next
   buttons and "1 of N" counter work → verify `<mark>` wraps exactly the character range defined by
   `char_start`/`char_end` → find any claim with `conflict_flagged === true` → verify amber CONFLICT
   badge appears.

7. **Examples:** Navigate to `/examples` → click "Run this query" on example #1 → confirm redirect
   to `/` → query auto-submits with domain set to AIRCRAFT → `pending_query` and `pending_domain`
   are cleared from localStorage after submission.

8. **Graph search:** Submit a hybrid query with graph data → type "hydraulic" in GraphViewer search
   box → confirm non-matching nodes dim to 20% opacity → click "Fit to selection" → viewport zooms
   to matching nodes.

9. **Medical HNSW:** Run `EXPLAIN (ANALYZE, FORMAT JSON) SELECT ...` on a medical embedding query →
   confirm output contains "Index Scan using idx_medical_embeddings_hnsw". Verify medical disclaimer
   banner is visible when MEDICAL domain is active.

10. **CR-007:** Run `grep -r "get_event_loop" backend/` → zero results. Verify CACHED badge renders
    on a repeated query (cache hit). Verify AGENT NOTES section collapses and expands correctly.


---

# prd3.md — NextAgentAI Wave 4: Supabase Auth

## Product Requirements Document v1.0

**Date:** 2026-03-08
**Status:** Draft — Ready for Implementation

---

## 1. Overview & Goals

### 1.1 What Auth Adds to NextAgentAI

NextAgentAI currently has no access control: any visitor can submit queries, view all run history, and access the analytics dashboard. Wave 4 adds email/password authentication via **Supabase Auth**, giving the platform three concrete capabilities:

1. **Personalisation** — run history (`agent_runs`) is scoped per user; each user sees only their own queries and favourites. The `user_id` (Supabase UUID) is stored on `agent_runs`.
2. **Demo gating** — the query interface, history sidebar, and analytics dashboard are protected behind sign-in. The public landing experience is the sign-in page, which links to sign-up.
3. **Run history ownership** — `PATCH /runs/{run_id}/favourite` and `GET /runs` are user-scoped; the backend verifies the Supabase JWT and attaches `user_id` to every query.

### 1.2 Non-Goals (This Phase)

- No OAuth/social login (Google, GitHub). Email/password only.
- No RBAC or organisation-level access control.
- No Supabase Storage or Realtime features.
- No row-level security (RLS) policies — auth is enforced at the FastAPI layer.
- No account deletion or email-change flows.
- No multi-factor authentication.

---

## 2. User Stories & Acceptance Criteria

### US-001: Sign Up

**As a new visitor, I want to register with my email and password so I can access the platform.**

| # | Acceptance Criterion |
|---|---|
| AC-001-1 | Sign-up form accepts `email` and `password` (min 8 chars). |
| AC-001-2 | On submit, calls `supabase.auth.signUp({ email, password, options: { emailRedirectTo } })`. |
| AC-001-3 | When Supabase has email confirmation enabled: shows "Check your email for a confirmation link" message without redirecting. |
| AC-001-4 | When email confirmation is disabled (dev): redirects to `/` on success. |
| AC-001-5 | Displays inline error for duplicate email: "An account with this email already exists." |
| AC-001-6 | Displays inline error for weak password: "Password must be at least 8 characters." |
| AC-001-7 | Submit button is disabled and shows a spinner while the request is in flight. |
| AC-001-8 | Link to `/sign-in` is present on the sign-up page. |

### US-002: Sign In

**As a registered user, I want to sign in with my email and password.**

| # | Acceptance Criterion |
|---|---|
| AC-002-1 | Sign-in form accepts `email` and `password`. |
| AC-002-2 | On submit, calls `supabase.auth.signInWithPassword({ email, password })`. |
| AC-002-3 | On success, redirects to the `?next=` param path if present, else to `/`. |
| AC-002-4 | Displays inline error for invalid credentials: "Invalid email or password." |
| AC-002-5 | Displays inline error for unconfirmed email: "Please confirm your email before signing in." |
| AC-002-6 | Displays inline error for rate limit: "Too many attempts. Please wait before trying again." |
| AC-002-7 | Submit button disabled and spinner shown during request. |
| AC-002-8 | Links to `/forgot-password` and `/sign-up` present on the sign-in page. |

### US-003: Forgot Password

**As a user who forgot their password, I want to receive a reset email.**

| # | Acceptance Criterion |
|---|---|
| AC-003-1 | Forgot-password form accepts `email` only. |
| AC-003-2 | On submit, calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: RESET_URL })`. |
| AC-003-3 | On success (regardless of whether the email exists), shows: "If that email is registered, a reset link has been sent." — no email enumeration. |
| AC-003-4 | Displays inline error for rate limit: "Too many attempts. Please wait." |
| AC-003-5 | Link back to `/sign-in` present. |

### US-004: Reset Password

**As a user who clicked a reset link in their email, I want to set a new password.**

| # | Acceptance Criterion |
|---|---|
| AC-004-1 | Page at `/reset-password` reads the `#access_token` hash fragment (Supabase appends this to the `redirectTo` URL). |
| AC-004-2 | On `onAuthStateChange` event `PASSWORD_RECOVERY`, the page enables the new-password form. |
| AC-004-3 | On submit, calls `supabase.auth.updateUser({ password: newPassword })`. |
| AC-004-4 | On success, redirects to `/sign-in?message=password-updated`. |
| AC-004-5 | Shows error if token is expired or invalid: "This reset link has expired. Please request a new one." |
| AC-004-6 | Password field has minimum 8-character validation. |

### US-005: Sign Out

**As a signed-in user, I want to sign out.**

| # | Acceptance Criterion |
|---|---|
| AC-005-1 | Sign-out button visible in `AppHeader` when user is authenticated (right side, after the domain switcher separator). |
| AC-005-2 | Calls `supabase.auth.signOut()`. |
| AC-005-3 | Redirects to `/sign-in` on success. |
| AC-005-4 | `AuthContext` user state is set to `null`. |
| AC-005-5 | Session cookies are cleared by the `@supabase/ssr` middleware. |

### US-006: Session Persistence

**As a signed-in user, I expect to remain signed in across page refreshes and new tabs.**

| # | Acceptance Criterion |
|---|---|
| AC-006-1 | Supabase session is stored in cookies (not `localStorage`) via `@supabase/ssr`. |
| AC-006-2 | Next.js middleware reads the cookie on every request and refreshes the token if expired. |
| AC-006-3 | `AuthContext` initialises with the persisted user from `supabase.auth.getUser()` on mount. |
| AC-006-4 | No full-page flash/redirect on refresh when session is valid. |

### US-007: Route Protection

**As an unauthenticated visitor, I should be redirected to sign-in when accessing protected routes.**

| # | Acceptance Criterion |
|---|---|
| AC-007-1 | Protected routes: `/`, `/dashboard`, `/data`, `/review`, `/examples`, `/medical-examples`, `/agent`, `/diagram`, `/faq`. |
| AC-007-2 | Public routes: `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`. |
| AC-007-3 | Redirect uses the pattern `/sign-in?next=<original-path>`. |
| AC-007-4 | After sign-in, user is redirected to the originally requested path (from `?next=`). |
| AC-007-5 | Redirect is enforced in Next.js middleware (server-side), not only client-side. |

---

## 3. Architecture Decisions

### 3.1 Supabase Project Configuration

Supabase Auth uses its **own hosted PostgreSQL database** for auth tables (`auth.users`, `auth.sessions`, etc.). This is entirely separate from the Neon PostgreSQL database used for application data.

**Decision: Use Supabase's hosted PostgreSQL for auth only.**

Rationale:
- Neon is already handling pgvector workloads; mixing Supabase RLS migrations into the Neon schema adds risk.
- Supabase Auth's `auth.*` tables are managed automatically by Supabase infrastructure.
- The only linkage needed is `user_id UUID` (the Supabase user UUID) stored as a column on `agent_runs` in Neon.
- JWT verification on the FastAPI backend is done using `SUPABASE_JWT_SECRET` — no outbound HTTP call required per request.

### 3.2 SSR Package Choice

**Decision: Use `@supabase/ssr` (not the deprecated `@supabase/auth-helpers-nextjs`).**

`@supabase/ssr` is the current recommended package for Next.js App Router. It provides:
- `createBrowserClient` for client components
- `createServerClient` for Server Components, Route Handlers, and middleware
- Cookie-based session management compatible with App Router's server/client split
- Automatic token refresh in middleware via `supabase.auth.getUser()`

Packages to install: `@supabase/ssr` (latest stable) + `@supabase/supabase-js` v2.

### 3.3 Session State Architecture

Session state follows the existing context pattern (`RunContext`, `DomainContext`) in `frontend/app/lib/`:

- `AuthContext` (`frontend/app/lib/auth-context.tsx`) — client-side context holding `user: User | null`, `accessToken: string | null`, and `loading: boolean`
- Initialised via `supabase.auth.getUser()` on mount
- `onAuthStateChange` subscription keeps context in sync across tabs and after token refresh
- Provider wraps the tree in `layout.tsx` alongside existing `RunProvider` and `DomainProvider`

### 3.4 AppHeader Integration

`AppHeader` is a `"use client"` component. The user email pill and sign-out button are added to the right side of the header, after the existing `DomainSwitcher` separator, following the exact same inline style pattern used by existing header buttons.

`useAuth()` from `AuthContext` provides `user`, `accessToken`, and `signOut`. When `user === null`, nothing is rendered in this slot (middleware already redirected unauthenticated users).

### 3.5 Backend JWT Verification

**Decision: FastAPI validates Supabase JWTs locally using `python-jose` + `SUPABASE_JWT_SECRET`.**

The Supabase JWT is a standard HS256 JWT signed with the project's `JWT_SECRET` (available in Supabase dashboard → Settings → API). FastAPI decodes and verifies it without calling the Supabase API on each request.

Protected endpoints: `POST /query`, `GET /runs`, `PATCH /runs/{run_id}/favourite`, `GET /runs/{run_id}`, `GET /analytics/*`

Public endpoints: `GET /healthz`, `POST /ingest`, `GET /docs`, root `GET /`

The `user_id` is extracted from the JWT `sub` claim (Supabase user UUID) and attached to newly saved `agent_runs` rows.

### 3.6 `user_id` on `agent_runs`

A new Alembic migration `0006_add_user_id_to_agent_runs.py` adds:
```
user_id UUID NULLABLE
```
Nullable to preserve all existing rows. New runs written by authenticated users will have `user_id` set. `GET /runs` queries are filtered by `user_id` when a valid JWT is present.

---

## 4. Frontend Implementation Plan

### 4.1 New npm Packages

```
@supabase/supabase-js   ^2.x   (latest stable)
@supabase/ssr           ^0.x   (latest stable)
```

No other new dependencies. All form components use existing Tailwind + inline SCADA styles.

### 4.2 File Delivery Table

| File | Type | Purpose |
|---|---|---|
| `frontend/app/lib/supabase.ts` | New | Browser Supabase client singleton via `createBrowserClient` |
| `frontend/app/lib/supabase-server.ts` | New | Server Supabase client factory via `createServerClient` (RSC / Route Handlers) |
| `frontend/middleware.ts` | New | Next.js middleware: session refresh + route protection redirects |
| `frontend/app/lib/auth-context.tsx` | New | `AuthContext` + `AuthProvider` + `useAuth()` hook — matches `RunContext` pattern |
| `frontend/app/(auth)/sign-in/page.tsx` | New | Sign-in page |
| `frontend/app/(auth)/sign-up/page.tsx` | New | Sign-up page |
| `frontend/app/(auth)/forgot-password/page.tsx` | New | Forgot password page |
| `frontend/app/(auth)/reset-password/page.tsx` | New | Reset password page (reads `#access_token` hash) |
| `frontend/app/layout.tsx` | Modify | Add `<AuthProvider>` wrapping existing providers |
| `frontend/app/components/AppHeader.tsx` | Modify | Add user email pill + SIGN OUT button to right side |
| `frontend/app/lib/api.ts` | Modify | Add `Authorization: Bearer <token>` header injection to `apiFetch` |

### 4.3 `frontend/app/lib/supabase.ts`

- Exports a singleton `createBrowserClient` instance.
- Called from client components and `auth-context.tsx`.
- Uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

```typescript
import { createBrowserClient } from '@supabase/ssr'

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
```

### 4.4 `frontend/app/lib/supabase-server.ts`

- Exports a `createClient()` factory for server-side use (Server Components, Route Handlers).
- Uses `cookies()` from `next/headers` with read-only `getAll`.
- Must be called inside async Server Components or Route Handlers only.

### 4.5 `frontend/middleware.ts`

Located at `frontend/middleware.ts` (Next.js App Router convention — note: NOT inside `app/`).

**Responsibilities:**
1. Create a `createServerClient` instance with full `getAll`/`setAll` cookie access on the request/response pair.
2. Call `await supabase.auth.getUser()` — refreshes session token if expired, writes updated cookies to response.
3. Check if the current path requires auth. If `user` is null and path is protected, redirect to `/sign-in?next=<path>`.
4. Allow all `/(auth)/` paths through without check.

**Matcher config:**
```typescript
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon|api/docs|api/openapi).*)'],
}
```

**Critical:** `supabase.auth.getUser()` MUST be called (not `getSession()`) — it verifies the token server-side and triggers cookie refresh.

**Protected paths:** `/`, `/dashboard`, `/data`, `/review`, `/examples`, `/medical-examples`, `/agent`, `/diagram`, `/faq`

**Public paths:** `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`

**Open redirect protection:** Validate `next` param — must start with `/` and not contain `://` or start with `//`. Reject and default to `/` if invalid.

### 4.6 `frontend/app/lib/auth-context.tsx`

Follows the exact structural pattern as `frontend/app/lib/context.tsx` (`RunContext`):

```typescript
"use client"

interface AuthContextValue {
  user: User | null          // supabase User type
  accessToken: string | null // JWT for API calls
  loading: boolean           // true until getUser() resolves on mount
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) { ... }
export function useAuth(): AuthContextValue { ... }
```

**Implementation notes:**
- On mount: calls `supabase.auth.getUser()` to populate `user` and set `loading = false`.
- Subscribes to `supabase.auth.onAuthStateChange()` to keep `user` and `accessToken` in sync. Handles `TOKEN_REFRESHED`, `SIGNED_IN`, `SIGNED_OUT`, `PASSWORD_RECOVERY`.
- `signOut()` calls `supabase.auth.signOut()` then `router.push('/sign-in')`.
- `loading = true` guard prevents flash of unauthenticated content during SSR hydration.

### 4.7 Auth Pages — `frontend/app/(auth)/`

The `(auth)` route group is a Next.js App Router route group (parentheses = no URL segment). All four pages inherit the root `layout.tsx` (which provides `AppHeader`).

**Shared UI constraints for all auth pages:**
- Full-height container: `height: calc(100vh - 46px)` (accounts for 46px AppHeader).
- Dark background: `background: hsl(var(--bg-void))`.
- Form card: `background: hsl(var(--bg-surface))`, border `hsl(var(--border-base))`, border-radius `2px`, max-width `420px`, centred.
- Heading: `font-family: var(--font-display)` (Orbitron), `font-size: 1rem`, `letter-spacing: 0.2em`, `text-transform: uppercase`, colour `hsl(var(--col-green))`.
- Labels: `font-family: var(--font-mono)`, `font-size: 0.65rem`, `letter-spacing: 0.1em`, `color: hsl(var(--text-dim))`.
- Inputs: `font-family: var(--font-mono)`, dark background `hsl(var(--bg-void))`, border `hsl(var(--border-base))`, focus border `hsl(var(--col-green))`, border-radius `2px`. Match ChatPanel query input style.
- Primary button: `background: hsl(var(--col-green) / 0.15)`, border `hsl(var(--col-green))`, text `hsl(var(--col-green))`, hover: `background: hsl(var(--col-green) / 0.25)`. Font: `var(--font-display)`, `font-size: 0.6rem`, `letter-spacing: 0.14em`.
- Error display: `AlertCircle` lucide icon, `color: hsl(var(--col-red))`, `font-family: var(--font-mono)`, `font-size: 0.72rem`. Matches ChatPanel error banner style.
- Success/info display: same structure but `color: hsl(var(--col-cyan))`.
- All pages are `"use client"` components.

**`/sign-in/page.tsx` specifics:**
- Fields: Email, Password.
- On submit: `supabase.auth.signInWithPassword({ email, password })`.
- Error mapping: `Invalid login credentials` → "Invalid email or password." | `Email not confirmed` → "Please confirm your email before signing in." | rate limit → "Too many attempts."
- On success: `router.push(searchParams.get('next') ?? '/')`.
- Shows info banner if `searchParams.get('message') === 'password-updated'`: "Your password has been updated."
- Footer links: "Don't have an account? SIGN UP" → `/sign-up`, "Forgot password?" → `/forgot-password`.

**`/sign-up/page.tsx` specifics:**
- Fields: Email, Password, Confirm Password (client-side match validation).
- On submit: `supabase.auth.signUp({ email, password, options: { emailRedirectTo: SITE_URL + '/sign-in' } })`.
- If `data.user && !data.session`: show "Check your email for a confirmation link."
- If `data.session`: redirect to `/`.
- Footer link: "Already have an account? SIGN IN" → `/sign-in`.

**`/forgot-password/page.tsx` specifics:**
- Field: Email only.
- On submit: `supabase.auth.resetPasswordForEmail(email, { redirectTo: SITE_URL + '/reset-password' })`.
- Always shows success message (no email enumeration).
- Footer link: back to `/sign-in`.

**`/reset-password/page.tsx` specifics:**
- On mount: subscribe to `supabase.auth.onAuthStateChange`. When event is `PASSWORD_RECOVERY`, enable the form.
- Field: New Password (min 8 chars).
- On submit: `supabase.auth.updateUser({ password: newPassword })`.
- On success: `router.push('/sign-in?message=password-updated')`.
- On expired token: "This reset link has expired. Please request a new one." with link to `/forgot-password`.

### 4.8 `frontend/app/layout.tsx` Modifications

Add `AuthProvider` as the outermost app-state provider:

```
<ThemeProvider>
  <AuthProvider>          ← ADD (wraps everything below)
    <DomainProvider>
      <RunProvider>
        <AppHeader />
        {children}
      </RunProvider>
    </DomainProvider>
  </AuthProvider>
</ThemeProvider>
```

### 4.9 `frontend/app/components/AppHeader.tsx` Modifications

After the final vertical separator on the right side, add:

1. **User email pill** (when `user !== null` and `!loading`): `font-family: var(--font-mono)`, `0.6rem`, `color: hsl(var(--text-dim))`, max-width 160px, overflow ellipsis, full email in `title` attribute.
2. **SIGN OUT button**: Identical style to the `NAVIGATE` dropdown trigger (border, mono font, `--col-cyan` hover). Uses `LogOut` lucide icon at size 10. Calls `signOut()` from `useAuth()`.

When `loading === true`, render nothing in this slot to avoid hydration flash.

### 4.10 `frontend/app/lib/api.ts` Modifications

Update `apiFetch` to accept an optional `accessToken` parameter:

```typescript
async function apiFetch<T>(
  path: string,
  options?: RequestInit,
  accessToken?: string
): Promise<T>
```

When `accessToken` is provided, add `Authorization: Bearer <token>` to request headers.

Update all protected exported functions to accept and forward `accessToken?: string`:
- `postQuery`, `getRuns`, `getRun`, `patchFavourite`, `getAnalyticsDefects`, `getAnalyticsMaintenance`, `getAnalyticsDiseases`

Callers obtain the token from `useAuth().accessToken`.

---

## 5. Backend Implementation Plan

### 5.1 New Python Dependency

Add to `backend/requirements.txt`:
```
python-jose[cryptography]>=3.3.0
```

### 5.2 JWT Auth Module

Create `backend/app/auth/jwt.py`:

- `verify_token(token: str) -> dict` — decodes and validates the JWT using `SUPABASE_JWT_SECRET` (HS256). Returns claims dict on success.
- Raises `HTTPException(401)` if: token missing, signature invalid, token expired, or `sub` claim absent.
- FastAPI dependency `get_current_user(request: Request) -> dict` — extracts `Authorization: Bearer <token>` header, calls `verify_token`, returns claims.

Also create `backend/app/auth/__init__.py`.

The dependency is applied **per-router** (not globally) so `/healthz` and `/ingest` remain public.

### 5.3 Protected Endpoint Changes

| Router file | Endpoint | Change |
|---|---|---|
| `backend/app/api/query.py` | `POST /query` | Add `Depends(get_current_user)` — `user_id = current_user["sub"]` passed to orchestrator and stored on `agent_runs`. |
| `backend/app/api/runs.py` | `GET /runs` | Add `Depends(get_current_user)` — add `WHERE user_id = :user_id` filter. |
| `backend/app/api/runs.py` | `GET /runs/{run_id}` | Add `Depends(get_current_user)` — add `AND user_id = :user_id` guard. |
| `backend/app/api/runs.py` | `PATCH /runs/{run_id}/favourite` | Add `Depends(get_current_user)` — add `AND user_id = :user_id` guard; return 404 for other users' runs. |
| `backend/app/api/analytics.py` | `GET /analytics/*` | Add `Depends(get_current_user)` — analytics are not user-scoped but require auth. |

Public (no auth required): `GET /healthz`, `POST /ingest`, `GET /docs`, root.

### 5.4 Orchestrator `user_id` Threading

`orchestrator.run()` gains an optional `user_id: str | None = None` parameter. When saving the `agent_runs` row at the end of the run (`_save_run()`), `user_id` is included in the INSERT.

### 5.5 Alembic Migration `0006_add_user_id_to_agent_runs.py`

```python
"""Add user_id to agent_runs

Revision ID: 0006_add_user_id
Revises: 0005_wave3_indexes
Create Date: 2026-03-08
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0006_add_user_id"
down_revision = "0005_wave3_indexes"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column(
        "agent_runs",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.execute("COMMIT")
    op.execute("""
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_runs_user_id
        ON agent_runs (user_id, created_at DESC)
    """)

def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_agent_runs_user_id")
    op.drop_column("agent_runs", "user_id")
```

### 5.6 `AgentRun` ORM Model Update

Add to `AgentRun` in `backend/app/db/models.py`:
```python
from sqlalchemy.dialects.postgresql import UUID as PGUUID
user_id = Column(PGUUID(as_uuid=True), nullable=True, index=True)
```

---

## 6. Environment Variables

### 6.1 Frontend

| Variable | Description | Where to Set |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (e.g. `https://xxxx.supabase.co`) | `frontend/.env.local` (dev), Vercel dashboard (prod) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key | `frontend/.env.local` (dev), Vercel dashboard (prod) |
| `NEXT_PUBLIC_SITE_URL` | Full frontend URL for email redirect links | `frontend/.env.local` (`http://localhost:3005` dev), Vercel dashboard (`https://nextgenai-seven.vercel.app` prod) |

### 6.2 Backend

| Variable | Description | Where to Set |
|---|---|---|
| `SUPABASE_JWT_SECRET` | JWT secret from Supabase dashboard → Settings → API → JWT Settings | `.env` (dev), Render dashboard (prod) |

### 6.3 Supabase Dashboard Configuration

| Setting | Value |
|---|---|
| Auth → Email → Confirm email | Enabled (prod), can disable for dev |
| Auth → URL Configuration → Site URL | `https://nextgenai-seven.vercel.app` |
| Auth → URL Configuration → Redirect URLs | `https://nextgenai-seven.vercel.app/**`, `http://localhost:3005/**` |
| Auth → Email Templates → Reset Password | `redirectTo` points to `NEXT_PUBLIC_SITE_URL/reset-password` |

### 6.4 Updated `frontend/.env.local` Template

```bash
# Existing
NEXT_PUBLIC_API_URL=http://localhost:8000

# Wave 4 — Auth
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
NEXT_PUBLIC_SITE_URL=http://localhost:3005
```

---

## 7. UI/UX Specification

### 7.1 Auth Page Layout

```
[AppHeader — 46px, always visible]
[full-height container: calc(100vh - 46px), bg: hsl(var(--bg-void))]
  [centred card: max-width 420px, bg: hsl(var(--bg-surface)), border: hsl(var(--border-base)), p: 32px, border-radius: 2px]
    [panel header bar: .panel-hdr style, Orbitron title in --col-green]
    [form fields with --font-mono inputs]
    [primary button: --col-green accent, --font-display label]
    [error/success message: AlertCircle icon + mono text]
    [footer links: --font-mono, --text-dim]
```

The `.panel-hdr`, `.panel-dot`, `.corner-tl` etc. CSS classes already exist in `globals.css` — reuse them to match the existing panel aesthetic.

### 7.2 Error Display Styling

Matches the existing ChatPanel error banner:

```tsx
<div style={{
  display: "flex", alignItems: "flex-start", gap: "8px",
  padding: "10px 12px",
  background: "hsl(var(--col-red) / 0.1)",
  border: "1px solid hsl(var(--col-red) / 0.3)",
  borderRadius: "2px",
  color: "hsl(var(--col-red))",
  fontFamily: "var(--font-mono)",
  fontSize: "0.72rem",
  lineHeight: 1.5,
}}>
  <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
  <span>{errorMessage}</span>
</div>
```

If `--col-red` is not yet defined in the CSS var system, add it to `globals.css` with fallback `0 84% 60%` (Tailwind red-500 in HSL).

### 7.3 AppHeader User Pill (right side, after DomainSwitcher)

```
[vertical separator]
[email pill: font-mono 0.6rem, text-dim, max-w-160px, overflow ellipsis, title=fullEmail]
[SIGN OUT button: NAVIGATE-trigger style, --col-cyan hover, LogOut icon size 10]
```

### 7.4 Protected Route Redirect UX

- Middleware redirects to `/sign-in?next=/dashboard` — no "unauthorised" error shown, just the normal sign-in form.
- After sign-in: `router.push(searchParams.get('next') ?? '/')`.
- `next` param validated: must start with `/`, must not contain `://` or start with `//`.

### 7.5 Loading State

During `AuthContext` initialisation (`loading === true`): `AppHeader` renders its user slot as empty. Auth pages themselves do not show a loading spinner (middleware handles redirect before page renders).

---

## 8. Acceptance Criteria Checklist

### 8.1 Functional

- [ ] Sign up with new email → confirmation email received (prod) or session created (dev).
- [ ] Sign in with valid credentials → redirected to `/`.
- [ ] Sign in with invalid credentials → inline error displayed.
- [ ] Sign in with unconfirmed email → specific error message shown.
- [ ] Forgot password → success message shown regardless of email existence.
- [ ] Reset password via email link → new password accepted, redirected to sign-in.
- [ ] Sign out → session cleared, redirected to `/sign-in`.
- [ ] Refresh page when signed in → session persists, no redirect.
- [ ] Visit `/dashboard` while signed out → redirected to `/sign-in?next=/dashboard`.
- [ ] After sign-in from redirect → returned to `/dashboard`.
- [ ] `AppHeader` shows user email and SIGN OUT when authenticated.
- [ ] `POST /query` without token → `HTTP 401`.
- [ ] `POST /query` with valid token → `HTTP 200`, `user_id` stored on `agent_runs`.
- [ ] `GET /runs` with valid token → returns only runs for that user.
- [ ] `PATCH /runs/{id}/favourite` with another user's run_id → `HTTP 404`.

### 8.2 TypeScript

- [ ] `tsc --noEmit` passes with zero errors in `frontend/`.
- [ ] `user` in `AuthContext` typed as `import('@supabase/supabase-js').User | null` — no `any` casts.
- [ ] `apiFetch` `accessToken` parameter is `string | undefined`.

### 8.3 Existing Tests

- [ ] `backend/.venv/Scripts/python -m pytest tests/` — 520 passed, 5 skipped (no regressions).
- [ ] New: `backend/tests/test_auth_jwt.py` — covers `verify_token` success, expired token 401, missing token 401, wrong secret 401.
- [ ] New: `backend/tests/test_wave4_user_id.py` — covers `user_id` storage on `POST /query`.

### 8.4 Security

- [ ] JWT secret not logged or exposed in error responses.
- [ ] `next` redirect param validated as relative path (starts with `/`, no `://`, no `//`).
- [ ] `SUPABASE_JWT_SECRET` never in frontend code or `NEXT_PUBLIC_` env vars.
- [ ] Supabase anon key is safe to expose client-side (by design — it is a public key).

---

## 9. Constraints & Risks

### 9.1 Constraints

| Constraint | Detail |
|---|---|
| Do not break existing functionality | All existing pages, ChatPanel, AgentTimeline, GraphViewer, Dashboard, HistorySidebar must work identically. |
| `@supabase/ssr` only | The deprecated `@supabase/auth-helpers-nextjs` is not permitted. |
| AppHeader: no duplicate controls | Auth additions are additive to the right side only. No second DomainSwitcher or NavDropdown. |
| Dashboard height unchanged | `height: calc(100vh - 46px)` — no change. |
| `asyncio.get_running_loop()` — no regression | Adding `user_id` to orchestrator must not reintroduce `get_event_loop()` (CR-007). |
| `ORJSONResponse` default | Auth error responses from FastAPI use `ORJSONResponse` automatically (already the default). |
| Alembic CONCURRENTLY pattern | Migration 0006 must follow the proven pattern: `op.execute("COMMIT")` before `CREATE INDEX CONCURRENTLY`. |

### 9.2 Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Token expiry mid-session | Medium | `@supabase/ssr` middleware auto-refreshes tokens. `onAuthStateChange` `TOKEN_REFRESHED` event updates `accessToken` in `AuthContext`. |
| `react-19` / `next-16` compatibility with `@supabase/ssr` | Low-Medium | `@supabase/ssr` supports Next.js 13+. Use `--legacy-peer-deps` if peer dep conflicts arise. |
| Existing `agent_runs` rows have no `user_id` | Certain | Nullable column — existing rows unaffected. `GET /runs` filters by `user_id`, so anonymous rows are never returned. Acceptable. |
| `SUPABASE_JWT_SECRET` rotation | Low | If rotated in Supabase dashboard, update env var on Render and redeploy. Document in `DEPLOY.md`. |
| `PASSWORD_RECOVERY` event timing on `/reset-password` | Low | Ensure `createBrowserClient` is initialised before `onAuthStateChange` listener is registered. |
| Open redirect via `?next=` | Medium | Validate `next` in middleware: must start with `/` and not contain `://` or `//`. |
| Neon migration 0006 requires CONCURRENTLY | Certain | Follow 0005 pattern exactly. |

---

## 10. Implementation Sequencing

### Phase 1 — Backend (no frontend breakage risk)
1. Add `python-jose[cryptography]` to `requirements.txt`.
2. Create `backend/app/auth/jwt.py` — `verify_token()` and `get_current_user` dependency.
3. Add `user_id` column to `AgentRun` ORM model.
4. Write migration `0006_add_user_id_to_agent_runs.py`.
5. Thread `user_id` through `orchestrator.run()` → `_save_run()`.
6. Add `Depends(get_current_user)` to protected routers.
7. Write `backend/tests/test_auth_jwt.py` and `test_wave4_user_id.py`.
8. Run full test suite — 525+ passing.
9. Apply migration to Neon (prod) and local Docker DB.

### Phase 2 — Frontend Auth Infrastructure
1. `npm install @supabase/supabase-js @supabase/ssr` (from `frontend/`).
2. Create `frontend/app/lib/supabase.ts` (browser client).
3. Create `frontend/app/lib/supabase-server.ts` (server client).
4. Create `frontend/app/lib/auth-context.tsx` (`AuthProvider` + `useAuth`).
5. Update `frontend/app/layout.tsx` — add `<AuthProvider>`.
6. Create `frontend/middleware.ts` (session refresh + route protection).
7. Verify: visit `http://localhost:3005/` without session → redirected to `/sign-in`.

### Phase 3 — Auth Pages
1. Create `frontend/app/(auth)/sign-in/page.tsx`.
2. Create `frontend/app/(auth)/sign-up/page.tsx`.
3. Create `frontend/app/(auth)/forgot-password/page.tsx`.
4. Create `frontend/app/(auth)/reset-password/page.tsx`.
5. Test all four flows end-to-end (dev, email confirm disabled).

### Phase 4 — AppHeader + API Client Integration
1. Update `frontend/app/components/AppHeader.tsx` — user pill + SIGN OUT button.
2. Update `frontend/app/lib/api.ts` — `accessToken` parameter on `apiFetch` and protected functions.
3. Update `ChatPanel.tsx` to pass `accessToken` from `useAuth()` to `postQuery()`.
4. Update `HistorySidebar.tsx` to pass `accessToken` to `getRuns()` and `patchFavourite()`.
5. Update dashboard tab components to pass `accessToken` to analytics functions.
6. TypeScript check: `npx tsc --noEmit`.

### Phase 5 — QA & Deployment
1. Full auth flow test (sign up → confirm → sign in → query → history → favourite → sign out).
2. Test `/reset-password` flow with a real email link.
3. Verify `PATCH /runs/{id}/favourite` returns 404 for another user's run.
4. Deploy backend to Render with `SUPABASE_JWT_SECRET` in dashboard.
5. Deploy frontend to Vercel with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`.
6. Configure Supabase Redirect URLs in Supabase dashboard.
7. Run smoke tests on live URLs.

---

## 11. Reference Files for Implementation

| File | Relevance |
|---|---|
| `frontend/app/layout.tsx` | Modify to add `<AuthProvider>`; insertion point is between `<ThemeProvider>` and `<DomainProvider>` |
| `frontend/app/components/AppHeader.tsx` | Modify right side — follow exact inline style pattern; use `useAuth()` |
| `frontend/app/lib/context.tsx` | Pattern reference for `AuthContext` structure |
| `frontend/app/lib/domain-context.tsx` | Pattern reference for provider/hook pattern |
| `frontend/app/lib/api.ts` | Modify `apiFetch` and all protected API functions |
| `frontend/app/components/ChatPanel.tsx` | Pass `accessToken` to `postQuery()` |
| `backend/app/db/models.py` | Add `user_id` to `AgentRun` — canonical schema source of truth |
| `backend/app/db/migrations/versions/0005_wave3_indexes.py` | Pattern reference for CONCURRENTLY + `op.execute("COMMIT")` |
| `backend/app/api/query.py` | Add `Depends(get_current_user)` to `POST /query` |
| `backend/app/agent/orchestrator.py` | Add `user_id` parameter to `run()` and `_save_run()` |
