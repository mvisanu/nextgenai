# NextAgentAI — Task Breakdown

This file consolidates all wave task breakdowns into a single reference.

---

# tasks2.md — NextAgentAI Wave 3 Task Breakdown
Generated from prd2.md v1.1 | Date: 2026-03-07

---

## Pre-Implementation Warnings (Read Before Starting Any Task)

**Warning 1 — Epic 1 pronoun resolution scope:** "Resolve 'it'/'them' via context" is a hard NLP problem. Implement ONLY as "pass last query's explicit filters forward" — not open-ended pronoun coreference resolution. Full coreference resolution is out of scope.

**Warning 2 — Epic 3 streaming cold start:** `EAGER_MODEL_LOAD=true` is a hard requirement for the 1.5s first-token target, not optional. SSE fixes perceived latency but NOT the 60-second cold start on Render free tier.

**Warning 3 — Alembic CONCURRENTLY transaction:** `CREATE INDEX CONCURRENTLY` cannot run inside a PostgreSQL transaction block. Every migration that uses it must call `op.execute("COMMIT")` immediately before the `CREATE INDEX CONCURRENTLY` statement.

**Rollback rule:** Every Alembic migration must have a working `downgrade()` function.

**Feature flags:** `CONVERSATIONAL_MEMORY_ENABLED` gates Epic 1 orchestrator changes. `STREAMING_ENABLED` gates Epic 3 SSE changes. Both must be env-var-controlled so features can be disabled without a redeploy.

**SQL guardrails:** All new analytics endpoints use the named-query pattern only — no raw SQL generation. SELECT-only enforced.

---

## Summary Table

| Task ID | Title | Epic | Sprint | Priority | Effort | Depends On |
|---------|-------|------|--------|----------|--------|------------|
| W3-001 | Alembic migration: add session_id to agent_runs | Epic 1 | 1 | P0 | XS | none |
| W3-002 | Alembic migration: add is_favourite to agent_runs | Epic 2 | 1 | P0 | XS | none |
| W3-003 | Add session_id and conversation_history to QueryRequest schema | Epic 1 | 1 | P0 | XS | none |
| W3-004 | Add is_favourite to RunSummary schema | Epic 2 | 1 | P0 | XS | none |
| W3-005 | Update agent_runs SQLAlchemy model: session_id + is_favourite columns | Epic 1 & 2 | 1 | P0 | XS | W3-001, W3-002 |
| W3-006 | Orchestrator: inject conversation_history into synthesis prompt | Epic 1 | 1 | P0 | S | W3-003, W3-005 |
| W3-007 | Backend: GET /runs and PATCH /runs/{id}/favourite endpoints | Epic 2 | 1 | P0 | S | W3-004, W3-005 |
| W3-008 | ChatPanel: session UUID, history accumulation, session pill, clear reset | Epic 1 | 1 | P0 | S | W3-003 |
| W3-009 | Frontend: HistorySidebar component | Epic 2 | 1 | P0 | M | W3-007 |
| W3-010 | ChatPanel: useSearchParams run loading from ?run= URL | Epic 2 | 1 | P0 | S | W3-007 |
| W3-011 | Add stream() method to LLMClient in client.py | Epic 3 | 2 | P1 | S | none |
| W3-012 | Backend SSE streaming endpoint in query.py | Epic 3 | 2 | P1 | M | W3-011 |
| W3-013 | ChatPanel: streaming renderer with ReadableStream and fallback | Epic 3 | 2 | P1 | M | W3-012 |
| W3-014 | New analytics.py: /analytics/defects, /maintenance, /diseases endpoints | Epic 4 | 2 | P1 | S | none |
| W3-015 | Dashboard: wire Tabs 3, 4, 5 to real analytics endpoints | Epic 4 | 2 | P1 | M | W3-014 |
| W3-016 | New ExportModal.tsx: PDF and JSON export | Epic 5 | 2 | P1 | M | none |
| W3-017 | ChatPanel: Export button on assistant messages | Epic 5 | 2 | P1 | XS | W3-016 |
| W3-018 | AgentTimeline: CSV download button on SQL result tables | Epic 5 | 2 | P1 | S | none |
| W3-019 | CitationsDrawer: Prev/Next nav, "1 of N" counter, offset highlighting, conflict badge | Epic 6 | 2 | P1 | S | none |
| W3-020 | Examples pages: "Run Query" button + localStorage + navigate to / | Epic 7 | 3 | P2 | S | none |
| W3-021 | ChatPanel: on-mount localStorage check and auto-submit with debounce | Epic 7 | 3 | P2 | S | W3-020 |
| W3-022 | GraphViewer: node search input + opacity dimming + fitView to selection | Epic 8 | 3 | P2 | M | none |
| W3-023 | GraphViewer: viewport-aware popover positioning | Epic 8 | 3 | P2 | S | none |
| W3-024 | GraphViewer: edge weight labels on SIMILAR_TO edges | Epic 8 | 3 | P2 | XS | none |
| W3-025 | Alembic migration: HNSW + GIN FTS + agent_runs composite index | Epic 9 | 3 | P2 | S | none |
| W3-026 | Add medical_case_trends named query to sql_tool.py | Epic 9 | 3 | P2 | XS | none |
| W3-027 | ChatPanel: persistent medical disclaimer banner | Epic 9 | 3 | P2 | XS | none |
| W3-028 | Fix CR-007: replace get_event_loop with get_running_loop in compute_tool.py | Epic 10 | 3 | P2 | XS | none |
| W3-029 | Add source field to VectorHit schema and tag hits in retrieval.py | Epic 10 | 3 | P2 | S | none |
| W3-030 | AgentTimeline: CACHED badge, timing breakdown bar chart, source labels | Epic 10 | 3 | P2 | S | W3-029 |
| W3-031 | ChatPanel: collapsible AGENT NOTES section for next_steps and assumptions | Epic 10 | 3 | P2 | XS | none |

---

## Sprint 1 — Epics 1 & 2 (P0, ~6 days)

### Sprint 1 Overview

Sprint 1 establishes the foundational database schema changes (two migrations), the Pydantic schema additions, the orchestrator history injection, the history/favourites API endpoints, and all associated frontend components. The migrations and schema changes have no dependencies and can begin immediately in parallel. Frontend work depends on the API endpoints being defined.

**Parallel work frontier for Sprint 1:** W3-001, W3-002, W3-003, W3-004 can all start simultaneously.

---

### W3-001 · Alembic migration: add session_id column to agent_runs

| Field | Value |
|-------|-------|
| **Owner** | backend-architect |
| **Epic** | Epic 1 — Conversational Memory & Multi-turn Queries |
| **Sprint** | 1 |
| **Priority** | P0 |
| **Effort** | XS |
| **Depends On** | none |

**Files to modify:**
- NEW: `backend/app/db/migrations/<timestamp>_add_session_id_to_agent_runs.py`

**Description:**
Create an Alembic migration that adds a nullable `session_id UUID` column to the `agent_runs` table. The column must be nullable with no default value so that existing rows are not affected and existing API callers remain unbroken — this is a zero-breaking-change schema addition. The migration must include a fully working `downgrade()` function that drops the column cleanly. Use `op.add_column("agent_runs", sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=True))` in `upgrade()`. No data backfill is needed because the column is nullable.

**Acceptance Criteria:**
- [ ] Migration file created in `backend/app/db/migrations/` with a timestamp prefix following the existing naming convention (e.g., `20260307_001_add_session_id_to_agent_runs.py`)
- [ ] `upgrade()` adds `session_id UUID NULLABLE` to `agent_runs` using `op.add_column()`; existing rows remain unmodified with `session_id = NULL`
- [ ] `downgrade()` drops the `session_id` column using `op.drop_column("agent_runs", "session_id")`; running `alembic downgrade -1` leaves the table in its pre-migration state
- [ ] Running `alembic upgrade head` followed by `alembic downgrade -1` followed by `alembic upgrade head` completes without error on a clean test database
- [ ] `alembic history` shows the new migration in the chain with no orphaned heads

---

### W3-002 · Alembic migration: add is_favourite column to agent_runs

| Field | Value |
|-------|-------|
| **Owner** | backend-architect |
| **Epic** | Epic 2 — Query History & Favourites |
| **Sprint** | 1 |
| **Priority** | P0 |
| **Effort** | XS |
| **Depends On** | none |

**Files to modify:**
- NEW: `backend/app/db/migrations/<timestamp>_add_is_favourite_to_agent_runs.py`

**Description:**
Create an Alembic migration that adds an `is_favourite BOOLEAN NOT NULL DEFAULT FALSE` column to the `agent_runs` table. Unlike `session_id`, this column can carry a `NOT NULL` constraint because `FALSE` is a safe default for all existing rows — no row will violate the constraint after the migration. The migration must include a fully working `downgrade()` function. This migration is independent of W3-001 and can be authored and run in any order relative to it; both will be applied sequentially at deploy time.

**Acceptance Criteria:**
- [ ] Migration file created in `backend/app/db/migrations/` with a timestamp prefix that sorts correctly relative to W3-001
- [ ] `upgrade()` adds `is_favourite BOOLEAN NOT NULL DEFAULT FALSE` to `agent_runs` using `op.add_column()`
- [ ] All existing rows in `agent_runs` have `is_favourite = FALSE` immediately after `upgrade()` completes
- [ ] `downgrade()` drops the `is_favourite` column; running `alembic downgrade -1` restores the pre-migration state with no trace of the column
- [ ] Running `alembic upgrade head` followed by `alembic downgrade -1` completes without error

---

### W3-003 · Add session_id and conversation_history optional fields to QueryRequest schema

| Field | Value |
|-------|-------|
| **Owner** | backend-architect |
| **Epic** | Epic 1 — Conversational Memory & Multi-turn Queries |
| **Sprint** | 1 |
| **Priority** | P0 |
| **Effort** | XS |
| **Depends On** | none |

**Files to modify:**
- EDIT: `backend/app/schemas/models.py`

**Description:**
Add two optional fields to the `QueryRequest` Pydantic v2 model: `session_id: str | None = None` and `conversation_history: list[dict] | None = None`. Both fields must be fully optional with `None` defaults so that all existing API callers continue to work without any changes to their request payloads. The `conversation_history` field holds a list of prior turn dicts in the format `{"query": str, "answer_summary": str}`. No validation beyond type-checking is needed at the schema level — the orchestrator enforces the max-5-turns limit during synthesis. This change is additive only: no existing field is modified or removed.

**Acceptance Criteria:**
- [ ] `QueryRequest` in `backend/app/schemas/models.py` has `session_id: str | None = None` field
- [ ] `QueryRequest` has `conversation_history: list[dict] | None = None` field
- [ ] Existing test suite passes without modification — no test that constructs `QueryRequest(query="test")` without the new fields should fail
- [ ] `QueryRequest(query="test")` instantiation (omitting both new fields) succeeds with both fields defaulting to `None`
- [ ] `QueryRequest.model_json_schema()` shows both new fields as optional (not in the `required` array)

---

### W3-004 · Add is_favourite field to RunSummary schema

| Field | Value |
|-------|-------|
| **Owner** | backend-architect |
| **Epic** | Epic 2 — Query History & Favourites |
| **Sprint** | 1 |
| **Priority** | P0 |
| **Effort** | XS |
| **Depends On** | none |

**Files to modify:**
- EDIT: `backend/app/schemas/models.py`

**Description:**
Add `is_favourite: bool = False` to the `RunSummary` Pydantic model (or create `RunSummary` as a new model if it does not yet exist as a distinct class). `RunSummary` is the lightweight response shape returned by `GET /runs` and represents one row from `agent_runs`: fields `id`, `query`, `intent`, `created_at`, `cached`, `latency_ms`, `is_favourite`. If `RunSummary` does not exist, create it in `models.py`. The `is_favourite` field must default to `False` for backward compatibility with any code that constructs a `RunSummary` without providing the field.

**Acceptance Criteria:**
- [ ] `RunSummary` Pydantic model exists in `backend/app/schemas/models.py` with all seven fields: `id`, `query`, `intent`, `created_at`, `cached`, `latency_ms`, `is_favourite`
- [ ] `is_favourite: bool = False` is present and defaults correctly when not provided
- [ ] `RunSummary` can be instantiated without providing `is_favourite` (e.g., `RunSummary(id=..., query=..., ...)` with `is_favourite` omitted)
- [ ] The model serialises correctly: `RunSummary(...).model_dump()` returns `is_favourite` as a boolean value, not a string

---

### W3-005 · Update agent_runs SQLAlchemy model: session_id + is_favourite columns

| Field | Value |
|-------|-------|
| **Owner** | backend-architect |
| **Epic** | Epic 1 & 2 |
| **Sprint** | 1 |
| **Priority** | P0 |
| **Effort** | XS |
| **Depends On** | W3-001, W3-002 |

**Files to modify:**
- EDIT: `backend/app/db/models.py`

**Description:**
Update the `AgentRun` SQLAlchemy ORM model class to reflect the two new columns added by migrations W3-001 and W3-002. Add `session_id = Column(UUID(as_uuid=True), nullable=True)` and `is_favourite = Column(Boolean, nullable=False, default=False)`. Import `UUID` from `sqlalchemy.dialects.postgresql` (not Python's built-in `uuid` module) and `Boolean` from `sqlalchemy`. This task depends on W3-001 and W3-002 so the database columns exist before the ORM is mapped against them; without the migrations the columns do not exist in the DB and ORM queries would fail at runtime.

**Acceptance Criteria:**
- [ ] `AgentRun` SQLAlchemy model in `backend/app/db/models.py` has `session_id = Column(UUID(as_uuid=True), nullable=True)`
- [ ] `AgentRun` model has `is_favourite = Column(Boolean, nullable=False, default=False)`
- [ ] Imports at the top of `models.py` include `UUID` from `sqlalchemy.dialects.postgresql` and `Boolean` from `sqlalchemy`
- [ ] Running `pytest backend/tests/` passes — no ORM mapping errors or import errors introduced
- [ ] `AgentRun.__table__.columns.keys()` contains both `"session_id"` and `"is_favourite"` when inspected

---

### W3-006 · Orchestrator: inject conversation_history into synthesis prompt

| Field | Value |
|-------|-------|
| **Owner** | backend-architect |
| **Epic** | Epic 1 — Conversational Memory & Multi-turn Queries |
| **Sprint** | 1 |
| **Priority** | P0 |
| **Effort** | S |
| **Depends On** | W3-003, W3-005 |

**Files to modify:**
- EDIT: `backend/app/agent/orchestrator.py`

**Description:**
Modify `orchestrator.py` to support conversational memory, gated by the `CONVERSATIONAL_MEMORY_ENABLED` environment variable (read via `os.getenv("CONVERSATIONAL_MEMORY_ENABLED", "true").lower() == "true"`). When enabled and `request.conversation_history` is non-empty, prepend up to the last 5 turns to the synthesis prompt context string using the format: `"Prior turn {i}: Q: {turn['query']} | A: {turn['answer_summary']}\n"` for each turn. The history is injected into the synthesis stage only — it does NOT cause the orchestrator to re-run vector search, SQL tools, or any other stage against historical queries. The implementation must not alter the 8-stage state machine structure (CLASSIFY → PLAN → EXECUTE_TOOLS → EXPAND_GRAPH → RE_RANK → SYNTHESISE → VERIFY → SAVE → DONE). Also save `request.session_id` to `AgentRun.session_id` during the SAVE stage. The scope boundary for "context" is: pass explicit filters forward only — not open-ended pronoun or coreference resolution.

**Acceptance Criteria:**
- [ ] When `CONVERSATIONAL_MEMORY_ENABLED=false` (env var set), the orchestrator ignores `conversation_history` entirely and the synthesis prompt is identical to pre-W3-006 behavior
- [ ] When enabled and `conversation_history` contains entries, the synthesis prompt contains lines in the format `"Prior turn 1: Q: <query> | A: <answer_summary>"` prepended before the main query context
- [ ] Maximum 5 prior turns are included; if `conversation_history` has more than 5 entries, only the most recent 5 (last 5 in the list) are prepended
- [ ] `session_id` from `QueryRequest` is written to `AgentRun.session_id` during the SAVE stage; if `session_id` is `None`, the column is written as `NULL`
- [ ] No new LLM calls are added; no vector or SQL tool calls are triggered by the history injection
- [ ] Existing tests in `backend/tests/` continue to pass (new fields default to `None`, so existing test fixtures require no changes)

---

### W3-007 · Backend: GET /runs and PATCH /runs/{id}/favourite endpoints

| Field | Value |
|-------|-------|
| **Owner** | backend-architect |
| **Epic** | Epic 2 — Query History & Favourites |
| **Sprint** | 1 |
| **Priority** | P0 |
| **Effort** | S |
| **Depends On** | W3-004, W3-005 |

**Files to modify:**
- NEW: `backend/app/api/runs.py`
- EDIT: `backend/app/main.py` (register the new router with prefix `/runs`)

**Description:**
Create `backend/app/api/runs.py` with two FastAPI route handlers. `GET /runs`: query params `limit: int = Query(default=20, le=100)` and `offset: int = Query(default=0, ge=0)`. Query `agent_runs` ordered by `is_favourite DESC, created_at DESC` and return `{ "items": [RunSummary, ...], "total": int }` where `total` is the total count of all runs (for pagination). `PATCH /runs/{run_id}/favourite`: accepts a request body `{ "is_favourite": bool }`, updates `agent_runs.is_favourite` for the given `run_id`, and returns the updated `RunSummary`. Return HTTP 404 if `run_id` does not exist. Both endpoints use the existing async SQLAlchemy session pattern (import `get_async_session` from `db/session.py`). Register the router in `main.py`. Add `/runs` and `/runs/*` to the CORS allowed-origins configuration — use the explicit origin list, never a wildcard combined with `allow_credentials=True`.

**Acceptance Criteria:**
- [ ] `GET /runs?limit=20&offset=0` returns HTTP 200 with JSON `{ "items": [...], "total": N }`
- [ ] Each item in `items` is a valid `RunSummary` with all seven fields: `id`, `query`, `intent`, `created_at`, `cached`, `latency_ms`, `is_favourite`
- [ ] Favourited runs (` is_favourite=true`) appear before non-favourited runs; within each group, results are in reverse chronological order
- [ ] `PATCH /runs/{run_id}/favourite` with body `{"is_favourite": true}` returns HTTP 200 with the updated `RunSummary` where `is_favourite === true`
- [ ] `PATCH /runs/{run_id}/favourite` with a non-existent `run_id` returns HTTP 404
- [ ] `GET /runs?limit=5&offset=10` returns at most 5 items starting from the 11th record (correct pagination offset)
- [ ] `GET /healthz` continues to return HTTP 200 after the router is registered (no startup regression)
- [ ] CORS is configured for the new routes using the explicit origins list (not a wildcard)

---

### W3-008 · ChatPanel: session UUID, history accumulation, session pill, clear reset

| Field | Value |
|-------|-------|
| **Owner** | frontend-developer |
| **Epic** | Epic 1 — Conversational Memory & Multi-turn Queries |
| **Sprint** | 1 |
| **Priority** | P0 |
| **Effort** | S |
| **Depends On** | W3-003 |

**Files to modify:**
- EDIT: `frontend/app/components/ChatPanel.tsx`

**Description:**
Update `ChatPanel.tsx` to support conversational memory on the frontend. On the first query submission of a new session, generate a session UUID using `crypto.randomUUID()` and store it in a `useRef` or `useState` (component state only — not localStorage). Pass `session_id` and the accumulated `conversation_history` array in the `POST /query` request body for every query after the first. After each successful assistant response, append `{ query: lastUserQuery, answer_summary: firstSentenceOfAnswer }` to the local `conversationHistory` state array (cap at the last 10 entries client-side — the backend enforces the max-5-turns limit during synthesis). Display a small pill element beneath the input field whenever `conversationHistory.length > 0`, with text "Session active • N turns" where N is `conversationHistory.length`. When the user clicks the Clear (Trash2) button, reset `sessionId` to `null`, clear `conversationHistory` to `[]`, and hide the session pill — the next query starts a fresh session. Scope: this is filter-forwarding only; no pronoun resolution logic is added to the frontend.

**Acceptance Criteria:**
- [ ] First query is submitted with `session_id: null` and `conversation_history: null` (or the fields are omitted from the request body entirely)
- [ ] Second and subsequent queries in the same session include `session_id` (a valid UUID v4 string) and `conversation_history` as an array of `{ query, answer_summary }` objects
- [ ] The session pill "Session active • N turns" is visible beneath the input after the first successful response; `N` increments with each completed turn
- [ ] Clicking the Trash2 (Clear) button resets session state: `sessionId` becomes `null`, `conversationHistory` becomes `[]`, and the session pill disappears immediately
- [ ] Session ID is stored in component state only — `localStorage` is not used for session management
- [ ] `crypto.randomUUID()` is called once per session (on the first submission), not on every render cycle

---

### W3-009 · Frontend: HistorySidebar component

| Field | Value |
|-------|-------|
| **Owner** | frontend-developer |
| **Epic** | Epic 2 — Query History & Favourites |
| **Sprint** | 1 |
| **Priority** | P0 |
| **Effort** | M |
| **Depends On** | W3-007 |

**Files to modify:**
- NEW: `frontend/app/components/HistorySidebar.tsx`
- EDIT: `frontend/app/page.tsx` (add sidebar toggle button and render `<HistorySidebar />` in the page layout)

**Description:**
Create `HistorySidebar.tsx` as a collapsible left sidebar (240px wide). A Clock icon button in the ChatPanel header area (or in the home page layout) toggles the sidebar open/closed. When opened, the sidebar calls `GET /runs?limit=20&offset=0` and renders the results as a scrollable list. Each history item displays: query text truncated to 60 characters with an ellipsis, an intent badge (e.g., "HYBRID", "SEMANTIC" — styled as a small coloured pill), a relative timestamp ("2 min ago", "3 hours ago", or a date string for items older than 24 hours), and a star icon for favouriting. Favourited items are visually pinned to the top of the list. Clicking the star icon calls `PATCH /runs/{run_id}/favourite` and optimistically updates the UI (star fills immediately; reverts on error). Clicking a history item calls the existing `GET /runs/{run_id}` endpoint to retrieve the full run and passes the result to the parent page's state (AgentTimeline and GraphViewer) without calling `POST /query`. A "Share" icon on each item copies `<window.location.origin>/?run=<run_id>` to the clipboard via `navigator.clipboard.writeText()` with a brief "Copied!" tooltip confirming the action. Show a loading skeleton (3–5 placeholder rows) while fetching and an error state if the endpoint fails. The sidebar must not conflict with the 46px global AppHeader — the sidebar content area should use `height: calc(100vh - 46px)`.

**Acceptance Criteria:**
- [ ] `HistorySidebar` renders as a 240px-wide panel; toggling the Clock icon shows/hides it without a page reload
- [ ] History items display: query text (max 60 chars, ellipsis), intent badge, relative timestamp, star icon
- [ ] Favourited items appear at the top of the list separated from non-favourites
- [ ] Clicking the star icon calls `PATCH /runs/{run_id}/favourite`, optimistically updates the star to filled (or unfilled), and reverts if the API call fails
- [ ] Clicking a history item loads the run into `AgentTimeline` and `GraphViewer` without triggering any `POST /query` request (verify in browser Network tab: zero `/query` calls on history click)
- [ ] Clicking the Share icon copies `<origin>/?run=<run_id>` to the clipboard; a brief tooltip or toast confirms the copy
- [ ] Loading skeleton is shown while `GET /runs` is in flight; error state message is shown if it returns a non-200 response
- [ ] Sidebar content area uses `height: calc(100vh - 46px)` to account for the global AppHeader; no overflow or scrollbar conflict

---

### W3-010 · ChatPanel: useSearchParams run loading from ?run= URL

| Field | Value |
|-------|-------|
| **Owner** | frontend-developer |
| **Epic** | Epic 2 — Query History & Favourites |
| **Sprint** | 1 |
| **Priority** | P0 |
| **Effort** | S |
| **Depends On** | W3-007 |

**Files to modify:**
- EDIT: `frontend/app/components/ChatPanel.tsx`

**Description:**
Add `useSearchParams` (from `next/navigation`) to `ChatPanel.tsx`. On component mount, check if the URL contains a `?run=<run_id>` query parameter. If it does, call `GET /runs/{run_id}` (using the existing API client pattern — the `GET /runs/{run_id}` endpoint already exists from the Wave 0 MVP) to retrieve the full cached run result, then hydrate the component state — displaying the answer in the chat message list, populating `AgentTimeline`, and updating `GraphViewer` — all without issuing any request to `POST /query`. This implements the "share URL" feature: a colleague visiting `/?run=<run_id>` sees the exact same result as the original query. After the pre-loaded run is displayed, submitting a new query clears the pre-loaded state and returns to normal operation. Per Next.js App Router requirements, wrap `useSearchParams` usage in a `Suspense` boundary.

**Acceptance Criteria:**
- [ ] Visiting `/?run=<valid_run_id>` causes `ChatPanel` to display the cached run result (answer text, claims, evidence) without calling `POST /query` (confirm in browser Network tab)
- [ ] The shared run result populates `AgentTimeline` and `GraphViewer` via the same state path used by a live query
- [ ] Visiting `/?run=<invalid_run_id>` shows an error message in the chat panel ("Run not found") without crashing the component
- [ ] After the pre-loaded run is displayed, submitting a new query clears the pre-loaded state and operates normally
- [ ] If no `?run=` param is present, component mount behavior is identical to pre-W3-010 (no regression)
- [ ] `useSearchParams` is wrapped in a `Suspense` boundary as required by Next.js App Router — no "missing Suspense boundary" hydration warning

---

## Sprint 2 — Epics 3, 4, 5, 6 (P1, ~13 days)

### Sprint 2 Overview

Sprint 2 adds the highest-value P1 features: streaming synthesis (the most complex task this wave), real dashboard analytics, PDF/CSV export, and enhanced citation UX. Epics 3, 4, 5, and 6 are largely independent of each other — Epic 3's backend (W3-011 → W3-012) and frontend (W3-013) form a single chain; Epic 4 (W3-014 → W3-015), Epic 5 (W3-016 → W3-017, W3-018 independent), and Epic 6 (W3-019 independent) can all run in parallel with Epic 3.

**Parallel work frontier for Sprint 2:** W3-011, W3-014, W3-016, W3-018, W3-019 can all start simultaneously.

---

### W3-011 · Add stream() method to LLMClient in client.py

| Field | Value |
|-------|-------|
| **Owner** | backend-architect |
| **Epic** | Epic 3 — Streaming Synthesis Output |
| **Sprint** | 2 |
| **Priority** | P1 |
| **Effort** | S |
| **Depends On** | none |

**Files to modify:**
- EDIT: `backend/app/llm/client.py`

**Description:**
Add a `stream(prompt: str) -> AsyncIterator[str]` abstract method to the `LLMClient` ABC and implement it in the concrete `AnthropicLLMClient` class. The implementation uses the Anthropic Python SDK's streaming API (`anthropic>=0.49.0`): `async with self._async_client.messages.stream(model=self._model, max_tokens=self._max_tokens, messages=[{"role": "user", "content": prompt}]) as stream: async for text in stream.text_stream: yield text`. This method is an `async def` generator function (using `yield` inside an `async def` makes it an async generator automatically — no `@asynccontextmanager` needed). Only the synthesis client (`get_async_llm_client()` / Sonnet 4.6) implements this method for Wave 3 — the fast client (Haiku) does not need streaming since classify/plan/verify remain non-streaming batch calls. The existing `complete()` and `complete_async()` methods must be unchanged.

**Acceptance Criteria:**
- [ ] `LLMClient` ABC declares `stream(prompt: str) -> AsyncIterator[str]` as an abstract method (use `@abstractmethod` and `AsyncGenerator` or `AsyncIterator` from `typing`)
- [ ] `AnthropicLLMClient` implements `stream()` using the Anthropic SDK's `messages.stream()` context manager
- [ ] `async for token in client.stream("hello"):` yields individual text tokens as strings (not entire sentences)
- [ ] The stream terminates cleanly when the generator is exhausted (no hanging HTTP connections)
- [ ] If the Anthropic API returns an error during streaming, the exception propagates to the caller (not silently swallowed)
- [ ] Existing non-streaming `complete()` and `complete_async()` methods are unchanged; all existing tests continue to pass

---

### W3-012 · Backend SSE streaming endpoint in query.py

| Field | Value |
|-------|-------|
| **Owner** | backend-architect |
| **Epic** | Epic 3 — Streaming Synthesis Output |
| **Sprint** | 2 |
| **Priority** | P1 |
| **Effort** | M |
| **Depends On** | W3-011 |

**Files to modify:**
- EDIT: `backend/app/api/query.py`

**Description:**
Modify `POST /query` in `query.py` to detect streaming mode by inspecting the `Accept` request header (`request.headers.get("Accept") == "text/event-stream"`). When streaming is requested and `STREAMING_ENABLED=true` (default), return a `StreamingResponse` (from `starlette.responses`) with `media_type="text/event-stream"`. The async generator driving the response: (1) runs all orchestrator stages up to and including EXECUTE_TOOLS and EXPAND_GRAPH using existing non-streaming calls (no change to those stages), (2) calls `llm_client.stream(synthesis_prompt)` for the SYNTHESISE stage and `yield`s `f'data: {json.dumps({"type": "token", "text": chunk})}\n\n'` for each token chunk, (3) after the stream completes, runs VERIFY and SAVE as normal, then yields `f'data: {json.dumps({"type": "done", "run": response.dict()})}\n\n'`, (4) on any exception, yields `f'data: {json.dumps({"type": "error", "message": str(e)})}\n\n'` and exits the generator. When `STREAMING_ENABLED=false` or the `Accept` header is absent, the endpoint falls through to the existing non-streaming JSON response (no regression).

**Acceptance Criteria:**
- [ ] `POST /query` with header `Accept: text/event-stream` returns `Content-Type: text/event-stream` (SSE) response
- [ ] SSE `token` events arrive progressively — the HTTP response body is not buffered until synthesis completes (verify with `curl -N` or a streaming-aware HTTP client)
- [ ] SSE `done` event payload is valid JSON that parses to a complete `QueryResponse` (including `claims`, `evidence`, `graph_path`, `citations`)
- [ ] On mid-stream Anthropic API error, an SSE `error` event is yielded and the connection closes cleanly (no HTTP 500 mid-stream)
- [ ] When `STREAMING_ENABLED=false` env var is set, `POST /query` with `Accept: text/event-stream` returns a standard JSON `QueryResponse` (non-streaming)
- [ ] `POST /query` without `Accept: text/event-stream` returns the standard JSON response unchanged (existing behavior preserved)

---

### W3-013 · ChatPanel: streaming renderer with ReadableStream and non-streaming fallback

| Field | Value |
|-------|-------|
| **Owner** | frontend-developer |
| **Epic** | Epic 3 — Streaming Synthesis Output |
| **Sprint** | 2 |
| **Priority** | P1 |
| **Effort** | M |
| **Depends On** | W3-012 |

**Files to modify:**
- EDIT: `frontend/app/components/ChatPanel.tsx`

**Description:**
Replace the `postQuery()` API call in `ChatPanel.tsx` with a streaming-first implementation using the native `fetch` API and `ReadableStream`. On submission: (1) call `fetch(apiUrl + "/query", { method: "POST", headers: { "Content-Type": "application/json", "Accept": "text/event-stream" }, body: JSON.stringify(payload) })`, (2) read the response body using `response.body.getReader()` and a `TextDecoder`, (3) accumulate bytes and split on the `\n\n` SSE delimiter, strip the `data: ` prefix from each line, and parse the JSON payload, (4) on `token` events, append the text token to the current assistant message bubble's content in React state — this produces the word-by-word rendering effect, (5) on `done` events, parse the full `QueryResponse` and update `runData`, claims, evidence, and graph state — identical to how the non-streaming response populated state previously, (6) on `error` events, display the error message. Fallback: if the `fetch` throws (network error) or if the connection drops before a `done` event, retry once using the existing non-streaming `postQuery()` method. The fallback shows the existing amber "Connection issue, retrying... (N/3)" banner consistent with the current retry UI. Claims panel, evidence table, and graph panel must render only after the `done` event arrives.

**Acceptance Criteria:**
- [ ] Submitting a query causes text to appear in the assistant message bubble incrementally as SSE `token` events arrive — visible word-by-word rendering visible before synthesis completes
- [ ] Claims panel, evidence table, and graph panel are populated only after the `done` event arrives (not during token streaming)
- [ ] If the SSE connection drops before a `done` event, `ChatPanel` falls back to the existing non-streaming `POST /query` call and shows the "Connection issue, retrying..." banner
- [ ] After a successful streaming response, `runData` state is functionally identical to a non-streaming response (graph, claims, evidence, citations all populated)
- [ ] The existing Clear (Trash2) button, health-check warm-up on mount, 3× retry-on-502 logic, and session pill (from W3-008) are not regressed by this change
- [ ] If the streaming fetch returns a non-2xx HTTP status code (e.g., 422 validation error), the error is displayed immediately and no retry is attempted (consistent with the existing behavior for 4xx errors)

---

### W3-014 · New analytics.py: /analytics/defects, /analytics/maintenance, /analytics/diseases

| Field | Value |
|-------|-------|
| **Owner** | backend-architect |
| **Epic** | Epic 4 — Real Dashboard Analytics |
| **Sprint** | 2 |
| **Priority** | P1 |
| **Effort** | S |
| **Depends On** | none |

**Files to modify:**
- NEW: `backend/app/api/analytics.py`
- EDIT: `backend/app/main.py` (register the analytics router with prefix `/analytics`)

**Description:**
Create `backend/app/api/analytics.py` with three FastAPI `GET` endpoints. All three must invoke named SQL queries via the existing `sql_tool.py` named-query runner — no raw SQL strings in this file. `GET /analytics/defects?from=&to=&domain=`: invokes the `defect_counts_by_product` named query with optional date-range filtering; returns `List[dict]` where each dict has `{product, defect_type, count}`. `GET /analytics/maintenance?from=&to=`: invokes the `maintenance_trends` named query; returns `List[dict]` with `{month, event_type, count}`. `GET /analytics/diseases?from=&to=&specialty=`: invokes the `disease_counts_by_specialty` named query with optional specialty filter; returns `List[dict]` with `{specialty, disease, count}`. All date parameters are optional ISO date strings (e.g., `from: str | None = Query(default=None)`). Register the router in `main.py`. Add the analytics routes to the CORS configuration using the explicit origins list.

**Acceptance Criteria:**
- [ ] `GET /analytics/defects` returns HTTP 200 with a JSON array; each item contains `product`, `defect_type`, and `count` fields
- [ ] `GET /analytics/defects?from=2025-01-01&to=2025-12-31` returns results filtered to that date range
- [ ] `GET /analytics/maintenance` returns HTTP 200 with a JSON array; each item contains `month`, `event_type`, and `count` fields
- [ ] `GET /analytics/diseases` returns HTTP 200 with a JSON array; each item contains `specialty`, `disease`, and `count` fields
- [ ] All three endpoints enforce SELECT-only via the named-query pattern (calling the tool's named query runner, not executing raw SQL strings)
- [ ] `GET /healthz` continues to return HTTP 200 after the analytics router is registered (no startup regression)
- [ ] All three endpoints are accessible from the frontend origin (CORS correctly configured — no wildcard with credentials)

---

### W3-015 · Dashboard: wire Tabs 3, 4, 5 to real analytics endpoints

| Field | Value |
|-------|-------|
| **Owner** | frontend-developer |
| **Epic** | Epic 4 — Real Dashboard Analytics |
| **Sprint** | 2 |
| **Priority** | P1 |
| **Effort** | M |
| **Depends On** | W3-014 |

**Files to modify:**
- EDIT: `frontend/app/dashboard/page.tsx`

**Description:**
Replace the static mock data arrays in dashboard Tabs 3, 4, and 5 with `useEffect` API calls to the new analytics endpoints. Tab 3 (Defect Analytics): on mount and on date-range change, call `GET /analytics/defects` with `from` and `to` from the existing date-range picker state; pass the current domain (`domain=AIRCRAFT` or `domain=MEDICAL`) to the endpoint. Render the returned data in the existing Recharts bar chart. Tab 4 (Maintenance Trends): call `GET /analytics/maintenance` with date-range params; render in the existing time-series line chart. Tab 5 / medical analytics: call `GET /analytics/diseases` with domain and date params. Initialize chart data state to `null` (not to the old mock array) so there is no flash of stale mock data on load. While the fetch is in-flight, show a loading skeleton — a grey placeholder block at the same height as the chart. If the endpoint returns an error, show an error message with a "Retry" button that re-triggers the `useEffect` fetch. When the domain switcher toggles between AIRCRAFT and MEDICAL, re-fetch all analytics tabs accordingly. The dashboard outer div must maintain `height: calc(100vh - 46px)` throughout.

**Acceptance Criteria:**
- [ ] Tab 3 chart values match a direct `SELECT defect_type, COUNT(*) FROM manufacturing_defects GROUP BY defect_type` query on the database (verify by running the SQL in psql)
- [ ] Changing the date-range picker causes Tab 3 to re-fetch with updated `from`/`to` query params and the chart re-renders with fresh data
- [ ] Tab 4 shows real data from `maintenance_logs` (at least one data point present, cross-verified against the DB)
- [ ] Switching domain from AIRCRAFT to MEDICAL causes the analytics tabs to re-fetch with the MEDICAL domain and display disease/clinical data
- [ ] Loading skeleton (grey placeholder bar at chart height) is visible while any analytics endpoint is in-flight — no flash of old mock data (chart state starts at `null`)
- [ ] Error state with a "Retry" button appears if an analytics endpoint returns a non-200 response
- [ ] Dashboard outer div retains `height: calc(100vh - 46px)` — no layout regression or scrollbar introduced

---

### W3-016 · New ExportModal.tsx: PDF and JSON export

| Field | Value |
|-------|-------|
| **Owner** | frontend-developer |
| **Epic** | Epic 5 — Export & Reporting |
| **Sprint** | 2 |
| **Priority** | P1 |
| **Effort** | M |
| **Depends On** | none |

**Files to modify:**
- NEW: `frontend/app/components/ExportModal.tsx`
- EDIT: `frontend/package.json` (add `@react-pdf/renderer` and `papaparse` dependencies)

**Description:**
Create `ExportModal.tsx`, a modal dialog component that receives a `queryResponse: QueryResponse` prop and offers two export options. PDF export: generated entirely client-side using `@react-pdf/renderer` (no server round-trip). The PDF template has four sections: (1) Header row — "NEXTAGENTAI" title, the query text, the run ID, and a formatted timestamp; (2) "Answer" section — the full synthesis text; (3) "Claims" table — three columns: Claim text | Confidence (rendered as integer %, e.g., "73%") | Citation ID; (4) "Evidence" table — three columns: Source | Excerpt (truncated to 200 chars) | Score (to 3 decimal places). Footer line: "Generated by NextAgentAI | run_id: <id>". JSON export: serialize `JSON.stringify(queryResponse, null, 2)` and trigger a browser download of the result as `run_<id>.json` using a Blob URL (`URL.createObjectURL(new Blob([json], { type: "application/json" }))`). The modal overlay follows the existing SCADA dark theme; the PDF document uses standard fonts (Helvetica/Courier) since custom Orbitron/Rajdhani font registration is out of scope for this task.

**Acceptance Criteria:**
- [ ] `ExportModal` renders as a modal overlay when triggered; it can be dismissed via Escape key or a close button
- [ ] Clicking "Export PDF" generates and downloads a `.pdf` file with no server API call (verify in browser Network tab — zero new requests on PDF export)
- [ ] The downloaded PDF contains all four sections: header (query, run ID, timestamp), answer text, claims table, evidence table
- [ ] Claims confidence in the PDF is rendered as integer percentage (e.g., "73%"), not raw decimal (e.g., "0.73")
- [ ] Clicking "Export JSON" downloads a file named `run_<id>.json`; the downloaded file parses with `JSON.parse()` without error
- [ ] The modal closes without triggering any download when dismissed
- [ ] `@react-pdf/renderer` appears in `frontend/package.json` dependencies after this task

---

### W3-017 · ChatPanel: Export button on assistant messages

| Field | Value |
|-------|-------|
| **Owner** | frontend-developer |
| **Epic** | Epic 5 — Export & Reporting |
| **Sprint** | 2 |
| **Priority** | P1 |
| **Effort** | XS |
| **Depends On** | W3-016 |

**Files to modify:**
- EDIT: `frontend/app/components/ChatPanel.tsx`

**Description:**
Add a Download icon button to the action row of each assistant message bubble in `ChatPanel.tsx`. The button is always visible on the message (not just on hover, for consistency with touch/tablet use on the factory floor). Clicking the button opens `<ExportModal>` with the `queryResponse` associated with that specific message passed as props. Use the Lucide `Download` icon consistent with the existing Lucide icon usage in the component. The Export button must only appear on assistant messages that have an associated `queryResponse` with a non-null `run_id` — it must not appear on user messages, on the loading/typing indicator bubble, or on error messages.

**Acceptance Criteria:**
- [ ] A Download icon button appears on each assistant message bubble that has a non-null `run_id`
- [ ] Clicking the Download button opens `ExportModal` with the correct `queryResponse` data for that specific message (not the most recent message's data)
- [ ] The Export button does not appear on user messages, loading indicators, or error messages
- [ ] The button has `aria-label="Export result"` for accessibility
- [ ] The existing message bubble layout is not disrupted by the button addition (no overflow, no layout shift)

---

### W3-018 · AgentTimeline: CSV download button on SQL result tables

| Field | Value |
|-------|-------|
| **Owner** | frontend-developer |
| **Epic** | Epic 5 — Export & Reporting |
| **Sprint** | 2 |
| **Priority** | P1 |
| **Effort** | S |
| **Depends On** | none |

**Files to modify:**
- EDIT: `frontend/app/components/AgentTimeline.tsx`
- EDIT: `frontend/package.json` (add `papaparse` if not already added in W3-016)

**Description:**
Add a "CSV" download button to the header row of each SQL result table rendered in the expanded step view within `AgentTimeline.tsx`. When clicked, use `Papa.unparse(rows, { columns: result.columns })` from the `papaparse` library to generate a CSV string from the SQL result rows (up to the first 1000 rows). Trigger a browser file download of the CSV using a Blob URL, with the filename `sql_result_step<N>_<timestamp>.csv`. The column headers come from `result.columns` already present in the SQL step data. The entire operation is client-side — no API call required. Position the "CSV" button in the top-right corner of the SQL result table header, using the Lucide `Download` icon.

**Acceptance Criteria:**
- [ ] A "CSV" download button appears in the header of each SQL result table within an expanded AgentTimeline step
- [ ] Clicking "CSV" triggers a browser file download of a `.csv` file without any network request
- [ ] The downloaded CSV file has column headers matching `result.columns` from the step data
- [ ] The CSV contains the correct data rows (up to 1000) — verify by opening the file in a spreadsheet application and cross-referencing with the on-screen table
- [ ] The CSV is generated via `Papa.unparse()` — `papaparse` appears in `frontend/package.json`
- [ ] The CSV button appears only on steps that have SQL result data; it does not appear on vector search steps or compute steps

---

### W3-019 · CitationsDrawer: Prev/Next nav, "1 of N" counter, offset highlighting, conflict badge

| Field | Value |
|-------|-------|
| **Owner** | frontend-developer |
| **Epic** | Epic 6 — Enhanced Citation UX |
| **Sprint** | 2 |
| **Priority** | P1 |
| **Effort** | S |
| **Depends On** | none |

**Files to modify:**
- EDIT: `frontend/app/components/CitationsDrawer.tsx`

**Description:**
Enhance `CitationsDrawer.tsx` with four independent changes. (1) Prev/Next navigation: when a claim has more than one citation, show "< Prev" and "Next >" buttons at the top of the drawer, plus a counter displaying "Citation N of M". Clicking Prev/Next cycles through the citations array by index. (2) Char-offset highlighting: implement and call `function highlightRange(text: string, start: number, end: number): ReactNode { return (<>{text.slice(0, start)}<mark className="bg-amber-400/30 text-amber-200">{text.slice(start, end)}</mark>{text.slice(end)}</>); }` using `citation.char_start` and `citation.char_end` from the citation metadata. If both values are `0` or `char_start === char_end`, render the full text without a `<mark>` element. (3) Conflict badge: if `claim.conflict_flagged === true`, render an amber badge with text "CONFLICT" next to the confidence score in the drawer header. The `conflict_flagged` field is already propagated from the backend (T3-07); this task is display-only. (4) Low-confidence clamp: claims with `confidence < 0.4` have their text clamped to 2 lines via CSS (`overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical`) with a "Read more" chevron button that removes the clamp on click.

**Acceptance Criteria:**
- [ ] When a claim has more than one citation, Prev and Next buttons appear; clicking them cycles through citations and the "Citation N of M" counter updates correctly
- [ ] When a claim has exactly one citation, Prev/Next buttons are absent
- [ ] The `<mark>` element wraps exactly the text between `char_start` and `char_end` — verified with a citation that has known non-zero offset values
- [ ] If `char_start === 0` and `char_end === 0` (or `char_start === char_end`), the full citation text renders without any `<mark>` element
- [ ] When `claim.conflict_flagged === true`, an amber "CONFLICT" badge is visible in the citations drawer header adjacent to the confidence score
- [ ] Claims with `confidence < 0.4` are visually clamped to 2 lines with a "Read more" chevron; clicking the chevron expands to the full text

---

## Sprint 3 — Epics 7, 8, 9, 10 (P2, ~8 days)

### Sprint 3 Overview

Sprint 3 delivers the P2 quality-of-life and domain-parity improvements. Most Sprint 3 tasks are independent of each other (they touch different files and epics). The only intra-sprint dependency chains are W3-020 → W3-021 (Examples localStorage write before ChatPanel reads it) and W3-029 → W3-030 (VectorHit schema must carry the `source` field before the timeline can display it).

**Parallel work frontier for Sprint 3:** W3-020, W3-022, W3-023, W3-024, W3-025, W3-026, W3-027, W3-028, W3-029, W3-031 can all start simultaneously. W3-021 follows W3-020. W3-030 follows W3-029.

---

### W3-020 · Examples pages: "Run Query" button + localStorage + navigate to /

| Field | Value |
|-------|-------|
| **Owner** | frontend-developer |
| **Epic** | Epic 7 — Examples → Chat Integration |
| **Sprint** | 3 |
| **Priority** | P2 |
| **Effort** | S |
| **Depends On** | none |

**Files to modify:**
- EDIT: `frontend/app/examples/page.tsx`
- EDIT: `frontend/app/medical-examples/page.tsx`

**Description:**
Add a "Run Query" button to every example query card on both the `/examples` and `/medical-examples` pages. When clicked, the handler: (1) calls `localStorage.setItem("pending_query", queryText)` with the full example query string, (2) calls `localStorage.setItem("pending_domain", "AIRCRAFT")` for `/examples` or `"MEDICAL"` for `/medical-examples`, (3) calls `router.push("/")` to navigate to the home page. Use `useRouter` from `next/navigation` for the navigation. The button should use the Lucide `Play` icon and be styled consistently with the existing card action buttons in each page. The pattern is nearly identical on both pages — apply the same change to both files. No other UI elements on the examples pages are modified.

**Acceptance Criteria:**
- [ ] Every example card on `/examples` has a "Run Query" button with a Play icon
- [ ] Every example card on `/medical-examples` has a "Run Query" button with a Play icon
- [ ] Clicking "Run Query" on `/examples` writes `localStorage["pending_query"]` = the example text and `localStorage["pending_domain"]` = `"AIRCRAFT"`
- [ ] Clicking "Run Query" on `/medical-examples` writes `localStorage["pending_domain"]` = `"MEDICAL"`
- [ ] The page navigates to `/` immediately after setting localStorage (no delay — `router.push("/")` is called synchronously in the click handler)
- [ ] The existing layout, heading, and all other UI on both examples pages are not modified by this change

---

### W3-021 · ChatPanel: on-mount localStorage check and auto-submit with 300ms debounce

| Field | Value |
|-------|-------|
| **Owner** | frontend-developer |
| **Epic** | Epic 7 — Examples → Chat Integration |
| **Sprint** | 3 |
| **Priority** | P2 |
| **Effort** | S |
| **Depends On** | W3-020 |

**Files to modify:**
- EDIT: `frontend/app/components/ChatPanel.tsx`

**Description:**
In `ChatPanel.tsx`, add a `useEffect` with an empty dependency array (runs exactly once on mount) that: (1) calls `localStorage.getItem("pending_query")`; if present, (2) reads `localStorage.getItem("pending_domain")` and sets the domain switcher state to `"AIRCRAFT"` or `"MEDICAL"` accordingly, (3) sets the chat input state to the pending query text, (4) schedules a `setTimeout` for 300ms after which the query is submitted programmatically by calling the same submit handler used for manual input (the 300ms debounce allows the health-check warm-up ping on mount to settle before submitting), (5) immediately after scheduling the timeout (not after it fires) calls `localStorage.removeItem("pending_query")` and `localStorage.removeItem("pending_domain")` so that a page refresh does not re-submit. The `setTimeout` reference is stored in a `useRef` and cleared in the `useEffect` cleanup function to prevent memory leaks. If `pending_query` is absent on mount, the effect exits immediately with no side effects.

**Acceptance Criteria:**
- [ ] Navigating to `/` from an examples page (after W3-020 sets localStorage) causes the query to auto-submit within approximately 300ms of the page becoming interactive
- [ ] The domain switcher reflects the correct domain (`AIRCRAFT` or `MEDICAL`) before the query is submitted
- [ ] Both `pending_query` and `pending_domain` are cleared from localStorage immediately after the `setTimeout` is scheduled — a hard page refresh after clicking "Run Query" but before the 300ms fires does NOT re-submit the query
- [ ] If `ChatPanel` mounts with no `pending_query` in localStorage, all mount behavior is identical to pre-W3-021 (no auto-submit, no domain change)
- [ ] The `setTimeout` reference is cleaned up in the `useEffect` return function (`return () => clearTimeout(timeoutRef.current)`) — no memory leak if the component unmounts before 300ms
- [ ] The auto-submit does not fire a second time if the component re-renders within the 300ms window (the effect dependency array is empty — runs once on mount only)

---

### W3-022 · GraphViewer: node search input + opacity dimming + fitView to selection

| Field | Value |
|-------|-------|
| **Owner** | frontend-developer |
| **Epic** | Epic 8 — Graph Enhancements |
| **Sprint** | 3 |
| **Priority** | P2 |
| **Effort** | M |
| **Depends On** | none |

**Files to modify:**
- EDIT: `frontend/app/components/GraphViewer.tsx`

**Description:**
Add a search input box positioned absolutely in the top-right corner of the ReactFlow container in `GraphViewer.tsx`. Track the search term in a `useState<string>("")` hook. Derive `matchingNodeIds: Set<string>` by filtering all nodes whose label includes the search term (case-insensitive, using `node.data.label.toLowerCase().includes(term.toLowerCase())`). Apply opacity overrides: non-matching nodes get `style={{ opacity: 0.2 }}` and matching nodes get `style={{ opacity: 1, boxShadow: "0 0 0 2px white" }}`. These style overrides are set on the `nodes` array passed to the ReactFlow component — not via direct DOM manipulation. Add a "Fit Selection" button adjacent to the search input. Use the `useReactFlow()` hook to access `reactFlowInstance`. When "Fit Selection" is clicked: if search term is non-empty, call `reactFlowInstance.fitView({ nodes: matchingNodes, padding: 0.2 })`; if search term is empty, call `reactFlowInstance.fitView({ padding: 0.2 })`. When the search input is cleared, remove all opacity overrides and ring borders.

**Acceptance Criteria:**
- [ ] A search input is visible in the top-right corner of the graph panel when the graph is displayed
- [ ] Typing a term causes nodes whose labels do not contain the term (case-insensitive) to dim to 20% opacity (`opacity: 0.2`)
- [ ] Matching nodes remain at full opacity and display a white ring border (`boxShadow: "0 0 0 2px white"`)
- [ ] Clicking "Fit Selection" zooms the ReactFlow viewport so matching nodes fill the view
- [ ] Clearing the search input restores all nodes to full opacity with no ring border
- [ ] The search and fitView changes do not trigger any backend calls or modify the graph data structures
- [ ] The search input and "Fit Selection" button do not visually conflict with the graph panel's existing toggle/close controls

---

### W3-023 · GraphViewer: viewport-aware popover positioning

| Field | Value |
|-------|-------|
| **Owner** | frontend-developer |
| **Epic** | Epic 8 — Graph Enhancements |
| **Sprint** | 3 |
| **Priority** | P2 |
| **Effort** | S |
| **Depends On** | none |

**Files to modify:**
- EDIT: `frontend/app/components/GraphViewer.tsx`

**Description:**
Update the node-click popover in `GraphViewer.tsx` to use viewport-aware positioning. Define `POPOVER_WIDTH = 280` and `POPOVER_HEIGHT = 200` as module-level constants. When a node is clicked, calculate its screen-space coordinates from the node's `positionAbsolute` and the current ReactFlow viewport transform (available via `useReactFlow()` or the `onNodeClick` callback parameters). Apply flip logic: `const flipLeft = (nodeScreenX + POPOVER_WIDTH) > window.innerWidth` — if true, render the popover to the left of the node by offsetting x by `-POPOVER_WIDTH`. `const flipUp = (nodeScreenY + POPOVER_HEIGHT) > window.innerHeight` — if true, render the popover above the node by offsetting y by `-POPOVER_HEIGHT`. The popover content (node label, type, excerpt text) is unchanged by this task.

**Acceptance Criteria:**
- [ ] Clicking a node positioned near the right edge of the browser window causes the popover to appear to the left of the node (not clipped)
- [ ] Clicking a node positioned near the bottom edge of the browser window causes the popover to open upward (not clipped)
- [ ] Clicking a node in the center of the graph panel produces the default popover position (right and below the node — unchanged)
- [ ] The popover content (node label, type, source excerpt) is identical before and after this change
- [ ] No new npm dependencies are introduced — positioning uses inline arithmetic, not a third-party tooltip library

---

### W3-024 · GraphViewer: edge weight labels on SIMILAR_TO / similarity edges

| Field | Value |
|-------|-------|
| **Owner** | frontend-developer |
| **Epic** | Epic 8 — Graph Enhancements |
| **Sprint** | 3 |
| **Priority** | P2 |
| **Effort** | XS |
| **Depends On** | none |

**Files to modify:**
- EDIT: `frontend/app/components/GraphViewer.tsx`

**Description:**
Update the ReactFlow edge array construction in `GraphViewer.tsx` to attach weight labels to similarity edges. When building the `edges` array passed to `<ReactFlow>`, check `edge.type === 'SIMILAR_TO' || edge.type === 'similarity'`. If true and `typeof edge.weight === 'number'`, set the ReactFlow edge's `label` prop to `edge.weight.toFixed(2)`. Also set `labelStyle={{ fontSize: 10, fill: "#888" }}` and `labelBgStyle={{ fill: "rgba(0,0,0,0.5)" }}` on the edge for readability. For all other edge types (`mentions`, `co_occurrence`, etc.), leave `label` undefined. The `weight` field is already present in graph edge data returned by the backend for similarity edges — no backend changes are needed.

**Acceptance Criteria:**
- [ ] After a query that returns a graph with similarity edges, those edges display a weight label formatted to 2 decimal places (e.g., "0.87")
- [ ] Non-similarity edges (`mentions`, `co_occurrence`) do not display weight labels
- [ ] If `edge.weight` is `null`, `undefined`, or `NaN` on a similarity edge, no label is rendered (no "NaN" or "undefined" text visible in the graph)
- [ ] Edge labels use a small font and semi-transparent dark background and do not significantly obscure the edge path or node labels
- [ ] All other graph rendering (node positions, colors, popover, search from W3-022) is unchanged

---

### W3-025 · Alembic migration: HNSW + GIN FTS + agent_runs composite index

| Field | Value |
|-------|-------|
| **Owner** | backend-architect |
| **Epic** | Epic 9 — Medical Domain Parity |
| **Sprint** | 3 |
| **Priority** | P2 |
| **Effort** | S |
| **Depends On** | none |

**Files to modify:**
- NEW: `backend/app/db/migrations/<timestamp>_add_medical_hnsw_and_fts_indexes.py`

**Description:**
Create an Alembic migration that adds four performance indexes. CRITICAL: every `CREATE INDEX CONCURRENTLY` statement must be immediately preceded by `op.execute("COMMIT")` — `CONCURRENTLY` cannot run inside a PostgreSQL transaction block, and without the explicit `COMMIT` the migration silently completes but leaves the index uncreated with no error. The four indexes to create: (1) HNSW index on `medical_embeddings` — `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_medical_embeddings_hnsw ON medical_embeddings USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)`; (2) GIN FTS index — `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_incident_reports_fts ON incident_reports USING GIN(to_tsvector('english', narrative))`; (3) GIN FTS index — `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_medical_cases_fts ON medical_cases USING GIN(to_tsvector('english', narrative))`; (4) composite index — `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_runs_query_ts ON agent_runs (LOWER(query), created_at DESC)`. The `downgrade()` function must drop all four indexes using `DROP INDEX IF EXISTS`. See prd2.md Epic 9 for the exact migration code template including the mandatory `op.execute("COMMIT")` calls.

**Acceptance Criteria:**
- [ ] Migration file contains `op.execute("COMMIT")` immediately before each of the four `CREATE INDEX CONCURRENTLY` statements (four COMMIT calls total)
- [ ] Running `alembic upgrade head` on a database without these indexes completes without error
- [ ] After the migration, running `EXPLAIN (ANALYZE, FORMAT JSON) SELECT embedding <=> '[0.1, ...]' FROM medical_embeddings ORDER BY embedding <=> '[0.1, ...]' LIMIT 10` confirms "Index Scan using idx_medical_embeddings_hnsw" in the plan output
- [ ] `downgrade()` drops all four indexes with `DROP INDEX IF EXISTS <name>`; running `alembic downgrade -1` leaves no orphaned indexes
- [ ] All four `CREATE INDEX` statements use `IF NOT EXISTS` — safe to re-run if the index was previously created manually
- [ ] Running `alembic upgrade head` → `alembic downgrade -1` → `alembic upgrade head` completes without error

---

### W3-026 · Add medical_case_trends named query to sql_tool.py

| Field | Value |
|-------|-------|
| **Owner** | backend-architect |
| **Epic** | Epic 9 — Medical Domain Parity |
| **Sprint** | 3 |
| **Priority** | P2 |
| **Effort** | XS |
| **Depends On** | none |

**Files to modify:**
- EDIT: `backend/app/tools/sql_tool.py`

**Description:**
Add a new entry `"medical_case_trends"` to the named queries dictionary in `sql_tool.py`. The SQL: `SELECT DATE_TRUNC('month', date) AS month, specialty, COUNT(*) AS case_count FROM disease_records WHERE date >= CURRENT_DATE - INTERVAL ':days days' GROUP BY month, specialty ORDER BY month`. This provides Tab 4 dashboard parity for the medical domain, mirroring the `maintenance_trends` named query that serves the aircraft Tab 4. The `:days` parameter is substituted via the existing named-query parameter injection pattern already used by all other queries in the tool. Named queries are inherently SELECT-only by construction — no guardrail changes needed.

**Acceptance Criteria:**
- [ ] `sql_tool.py` named queries dictionary contains the key `"medical_case_trends"` with the correct SQL string
- [ ] Calling `run_named("medical_case_trends", {"days": 90})` returns rows from `disease_records` grouped by month and specialty without raising an exception
- [ ] If `disease_records` is empty, the query returns an empty list (not an error or exception)
- [ ] Running `pytest backend/tests/test_sql_guardrails.py` passes — the new named query does not bypass any SQL guardrail
- [ ] The `:days` parameter placeholder substitutes correctly when executed (no raw `:days` string appears in the final executed SQL)

---

### W3-027 · ChatPanel: persistent medical disclaimer banner

| Field | Value |
|-------|-------|
| **Owner** | frontend-developer |
| **Epic** | Epic 9 — Medical Domain Parity |
| **Sprint** | 3 |
| **Priority** | P2 |
| **Effort** | XS |
| **Depends On** | none |

**Files to modify:**
- EDIT: `frontend/app/components/ChatPanel.tsx`

**Description:**
Add a persistent amber warning banner that renders below the chat input field in `ChatPanel.tsx` when the active domain is `MEDICAL`. The banner is a conditionally rendered `<div>` — `{domain === "MEDICAL" && <div ...>...</div>}`. Banner text: "Clinical data is for research only. Not for diagnostic or treatment decisions." Use amber styling consistent with the existing amber banners in the codebase: `className="bg-amber-900/20 border border-amber-500/30 text-amber-400 text-xs px-3 py-2 rounded"`. The banner has no dismiss button — it is permanently visible while the domain is MEDICAL. When the domain switches back to AIRCRAFT, the banner unmounts. The banner must render below the input field row, not above or inside the message list area.

**Acceptance Criteria:**
- [ ] When domain is set to `MEDICAL`, the amber disclaimer banner renders below the chat input area with the exact text: "Clinical data is for research only. Not for diagnostic or treatment decisions."
- [ ] There is no dismiss button or X icon on the banner — it cannot be hidden by the user while in MEDICAL domain
- [ ] When domain switches to `AIRCRAFT`, the banner is conditionally not rendered (not hidden with CSS visibility — it is absent from the DOM)
- [ ] The banner does not overlap or displace the input field, send button, session pill, or existing error banners (such as the "Connection issue, retrying..." amber banner)
- [ ] Styling uses amber colour tokens consistent with other amber UI elements in `ChatPanel.tsx`

---

### W3-028 · Fix CR-007: replace get_event_loop with get_running_loop in compute_tool.py

| Field | Value |
|-------|-------|
| **Owner** | backend-architect |
| **Epic** | Epic 10 — Developer Experience & Observability |
| **Sprint** | 3 |
| **Priority** | P2 |
| **Effort** | XS |
| **Depends On** | none |

**Files to modify:**
- EDIT: `backend/app/tools/compute_tool.py`

**Description:**
Replace `asyncio.get_event_loop()` with `asyncio.get_running_loop()` in the `run_async()` method of `compute_tool.py`. `asyncio.get_event_loop()` is deprecated since Python 3.10 and emits a `DeprecationWarning` when called from a coroutine running inside an event loop (which is always the case in FastAPI async request handlers). `asyncio.get_running_loop()` is the correct replacement: it returns the currently running event loop and raises `RuntimeError` if called outside a running loop — which is the expected behavior since `run_async()` should only ever be called from async context. The functional behavior of `run_async()` (wrapping the synchronous compute operation in `loop.run_in_executor()`) is unchanged by this fix.

**Acceptance Criteria:**
- [ ] `backend/app/tools/compute_tool.py` contains `asyncio.get_running_loop()` and does not contain `asyncio.get_event_loop()`
- [ ] Running `grep -r "get_event_loop" backend/` returns zero results across the entire backend directory
- [ ] Running `pytest backend/tests/` passes with no new failures introduced by this change
- [ ] No `DeprecationWarning` for `asyncio.get_event_loop` is emitted when running the test suite
- [ ] The behavior of `compute_tool.run_async()` is functionally unchanged (it still wraps the synchronous compute call in `loop.run_in_executor(None, ...)`)

---

### W3-029 · Add source field to VectorHit schema and tag hits in retrieval.py

| Field | Value |
|-------|-------|
| **Owner** | backend-architect |
| **Epic** | Epic 10 — Developer Experience & Observability |
| **Sprint** | 3 |
| **Priority** | P2 |
| **Effort** | S |
| **Depends On** | none |

**Files to modify:**
- EDIT: `backend/app/schemas/models.py`
- EDIT: `backend/app/rag/retrieval.py`

**Description:**
Add `source: Literal["bm25", "vector", "hybrid"] = "vector"` to the `VectorHit` Pydantic model in `schemas/models.py`. Import `Literal` from `typing` (already used elsewhere in the file). In `retrieval.py`, update the hybrid search merge step (`hybrid_search()` and `mmr_rerank()` if applicable): hits sourced exclusively from the BM25 path receive `source="bm25"`, hits sourced exclusively from the vector path receive `source="vector"`, and hits that appeared in both paths and were merged via RRF receive `source="hybrid"`. The `source` field defaults to `"vector"` so that the non-hybrid `vector_search()` function requires no code change — the default covers it. The `source` field must be included in the JSON serialization of `VectorHit` and will appear in the `evidence` array of the `QueryResponse`.

**Acceptance Criteria:**
- [ ] `VectorHit` Pydantic model has `source: Literal["bm25", "vector", "hybrid"] = "vector"` field
- [ ] After a hybrid search (`hybrid_search()`), each `VectorHit` has `source` set to `"bm25"`, `"vector"`, or `"hybrid"` based on which retrieval path(s) produced it — not all hits default to `"vector"`
- [ ] After a non-hybrid `vector_search()` call, `VectorHit` objects have `source = "vector"` (the default — no code change needed in `vector_search()`)
- [ ] Existing tests that construct or compare `VectorHit` objects do not fail (the field default handles backward compatibility)
- [ ] `VectorHit(...).model_dump()` includes the `source` field — it appears in the API response `evidence` array and is therefore visible to the frontend

---

### W3-030 · AgentTimeline: CACHED badge, timing breakdown bar chart, source labels

| Field | Value |
|-------|-------|
| **Owner** | frontend-developer |
| **Epic** | Epic 10 — Developer Experience & Observability |
| **Sprint** | 3 |
| **Priority** | P2 |
| **Effort** | S |
| **Depends On** | W3-029 |

**Files to modify:**
- EDIT: `frontend/app/components/AgentTimeline.tsx`

**Description:**
Three additions to `AgentTimeline.tsx`. (1) CACHED badge: when `runSummary.cached === true`, render a green pill badge labelled "CACHED" in the AgentTimeline header row adjacent to the latency display. Use `className="bg-green-900/30 border border-green-500/30 text-green-400 text-xs px-2 py-0.5 rounded"`. The badge is absent when `cached === false`. (2) Timing breakdown bar chart: add a collapsible "TIMING BREAKDOWN" section beneath the plan text in the timeline. When expanded, render a horizontal bar chart using inline CSS only (no new charting library). Each stage has a proportional bar: `classify | vector | sql | graph | synthesise | verify`. Bar widths are `(stagems / total_latency_ms) * 100`% of the container width. Render the stage name and ms value as a text label beside each bar. Stages absent from `state_timings_ms` render as a zero-width bar. (3) Source labels: in the expanded vector search step, each vector hit now shows a small colored badge for its `source` field — blue for `"bm25"`, cyan for `"vector"`, purple for `"hybrid"` — adjacent to the existing min-max normalised score bar.

**Acceptance Criteria:**
- [ ] A green "CACHED" badge is visible in the AgentTimeline header when `runSummary.cached === true`; the badge is absent when `cached === false`
- [ ] The "TIMING BREAKDOWN" section is collapsed by default; clicking the section header expands it to show the bar chart
- [ ] Bar chart widths are proportional: a stage taking 4000ms out of 6000ms total latency occupies approximately 66.7% of the container width
- [ ] All six stages appear in the bar chart; stages with `0ms` or absent from `state_timings_ms` render as zero-width bars (not errors or missing rows)
- [ ] Each vector hit in an expanded AgentTimeline step shows a source badge: blue for `"bm25"`, cyan for `"vector"`, purple for `"hybrid"`
- [ ] No new chart library is introduced — bar widths are implemented via inline `style={{ width: "X%" }}` on `<div>` elements

---

### W3-031 · ChatPanel: collapsible AGENT NOTES section for next_steps and assumptions

| Field | Value |
|-------|-------|
| **Owner** | frontend-developer |
| **Epic** | Epic 10 — Developer Experience & Observability |
| **Sprint** | 3 |
| **Priority** | P2 |
| **Effort** | XS |
| **Depends On** | none |

**Files to modify:**
- EDIT: `frontend/app/components/ChatPanel.tsx`

**Description:**
Add a collapsible "AGENT NOTES" section beneath the main assistant answer text in `ChatPanel.tsx`. Track the expanded state per-message using a `Set<number>` of expanded message indices in component state (or a per-message boolean). The toggle button uses the Lucide `ChevronDown`/`ChevronUp` icon and the label "AGENT NOTES". When expanded, the section renders two sub-sections: "Next Steps" — an unordered list of items from `queryResponse.next_steps` (or "None" if the array is empty or absent); "Assumptions" — an unordered list from `queryResponse.assumptions` (or "None" if absent). The section is collapsed by default. The "AGENT NOTES" toggle is only rendered when at least one of `next_steps` or `assumptions` is a non-empty array — if both are absent or empty `[]`, the toggle is not shown.

**Acceptance Criteria:**
- [ ] The "AGENT NOTES" toggle button appears beneath assistant messages only when `next_steps` or `assumptions` is a non-empty array in the `QueryResponse`
- [ ] The section is collapsed by default — no bulleted lists are visible until the toggle is clicked
- [ ] Clicking the toggle expands the section to show both sub-sections; clicking again collapses it
- [ ] The "Next Steps" sub-section renders each item in `next_steps` as a bullet point
- [ ] The "Assumptions" sub-section renders each item in `assumptions` as a bullet point
- [ ] When both `next_steps` and `assumptions` are empty arrays or absent, the "AGENT NOTES" toggle is not rendered at all (not rendered but hidden — it is absent from the DOM)

---

## Dependency Graph Summary

```
Sprint 1:
  W3-001 ──┐
  W3-002 ──┴──→ W3-005 ──→ W3-006
  W3-003 ───────────────→ W3-008
  W3-004 ──→ W3-007 ──→ W3-009
                      └──→ W3-010
  (W3-006 also depends on W3-003 via the schema it reads)

Sprint 2:
  W3-011 ──→ W3-012 ──→ W3-013
  W3-014 ──────────────→ W3-015
  W3-016 ──────────────→ W3-017
  W3-018  (independent)
  W3-019  (independent)

Sprint 3:
  W3-020 ──→ W3-021
  W3-029 ──→ W3-030
  W3-022, W3-023, W3-024, W3-025, W3-026, W3-027, W3-028, W3-031 (all independent)
```

---

## Parallel Work Waves

**Sprint 1 Wave A (no blockers):** W3-001, W3-002, W3-003, W3-004
**Sprint 1 Wave B:** W3-005 (after W3-001 + W3-002), W3-008 (after W3-003)
**Sprint 1 Wave C:** W3-006 (after W3-003 + W3-005), W3-007 (after W3-004 + W3-005)
**Sprint 1 Wave D:** W3-009 (after W3-007), W3-010 (after W3-007)

**Sprint 2 Wave A (no blockers):** W3-011, W3-014, W3-016, W3-018, W3-019
**Sprint 2 Wave B:** W3-012 (after W3-011), W3-015 (after W3-014), W3-017 (after W3-016)
**Sprint 2 Wave C:** W3-013 (after W3-012)

**Sprint 3 Wave A (no blockers):** W3-020, W3-022, W3-023, W3-024, W3-025, W3-026, W3-027, W3-028, W3-029, W3-031
**Sprint 3 Wave B:** W3-021 (after W3-020), W3-030 (after W3-029)

---

## Environment Variables (Wave 3 Additions)

| Variable | Default | Purpose | Render Requirement |
|----------|---------|---------|-------------------|
| `CONVERSATIONAL_MEMORY_ENABLED` | `true` | Gates Epic 1 session context injection in orchestrator; set to `false` to disable without redeploy | Optional |
| `STREAMING_ENABLED` | `true` | Gates Epic 3 SSE streaming synthesis endpoint; set to `false` to disable without redeploy | Optional |
| `EAGER_MODEL_LOAD` | `false` | Must be set to `true` on Render for 1.5s first-token target | **Hard requirement** for Epic 3 first-token SLA |

---

## Key Constraints Checklist

Every developer must verify these constraints before merging any Wave 3 task:

- [ ] All new `QueryRequest` fields are optional with `None` defaults — existing API callers send no new fields and continue to work unchanged
- [ ] No modifications to the orchestrator's 8-stage state machine structure (CLASSIFY → PLAN → EXECUTE_TOOLS → EXPAND_GRAPH → RE_RANK → SYNTHESISE → VERIFY → SAVE → DONE)
- [ ] All new analytics endpoints use the named-query pattern only — no raw SQL strings in `analytics.py`
- [ ] Every Alembic migration (W3-001, W3-002, W3-025) has a fully working `downgrade()` function verified by running it locally
- [ ] Every `CREATE INDEX CONCURRENTLY` statement in W3-025 is immediately preceded by `op.execute("COMMIT")`
- [ ] `graph_path` is always returned from the backend (never null); `GraphViewer` 3-tier fallback (real graph → synthetic → mock) is not regressed
- [ ] No new duplicate `<AppHeader>`, `DomainSwitcher`, or second `NavDropdown` added to any page sub-header
- [ ] Dashboard outer div retains `height: calc(100vh - 46px)` after any dashboard changes (W3-015)
- [ ] `<html suppressHydrationWarning>` in `layout.tsx` is not removed; no new SSR-breaking class names introduced
- [ ] CORS: new routes (`/analytics/*`, `/runs`, `PATCH /runs/*/favourite`) are added to the explicit origins list — never `allow_origins=["*"]` combined with `allow_credentials=True`
- [ ] Epic 1 scope boundary respected: conversation context is filter-forwarding only — no open-ended coreference or pronoun resolution logic added anywhere

---

## Verification Checklist (run before marking Wave 3 complete)

1. **Multi-turn:** Submit "hydraulic leak last 30 days" → then "show only critical severity" → confirm second query request payload in Network tab includes `conversation_history` array and `session_id`. Verify the response reflects filtered context.

2. **History:** Submit 3 queries → all appear in HistorySidebar in reverse chronological order → star one → persists on page refresh → click history item → result loads with zero `/query` calls (verify in Network tab).

3. **Streaming:** Submit any hybrid query on a warm Render instance (`EAGER_MODEL_LOAD=true`) → first tokens appear in UI within 1.5s → claims and graph panel load only after `type:done` event → disable SSE (set `STREAMING_ENABLED=false`) → confirm fallback to non-streaming works.

4. **Dashboard:** Navigate to Tab 3 → confirm chart values match `SELECT defect_type, COUNT(*) FROM manufacturing_defects GROUP BY defect_type` run in psql → change date range → chart re-fetches → switch domain to MEDICAL → Tab 3 updates to disease data.

5. **Export:** Submit a query → click Export → PDF → open PDF → verify all four sections present (header with run_id, answer, claims table with integer % confidence, evidence table with scores) → Export → JSON → `JSON.parse()` succeeds without error.

6. **Citations:** Find a claim with `citations.length > 1` → open CitationsDrawer → verify Prev/Next and "1 of N" counter work → verify `<mark>` wraps exactly `char_start` to `char_end` → find `conflict_flagged === true` claim → verify amber CONFLICT badge appears.

7. **Examples:** Navigate to `/examples` → click "Run Query" on any example → redirects to `/` → query auto-submits with domain AIRCRAFT → both localStorage keys cleared after submission (verify in DevTools Application → Local Storage).

8. **Graph search:** Submit a hybrid query → type a term in GraphViewer search box → non-matching nodes dim to 20% opacity → click "Fit to selection" → viewport zooms to matching nodes → clear search → all nodes return to full opacity.

9. **Medical HNSW:** Run `EXPLAIN (ANALYZE, FORMAT JSON) SELECT ...` on a medical embedding cosine query → confirm "Index Scan using idx_medical_embeddings_hnsw" in the plan. Verify medical disclaimer banner visible when MEDICAL domain active and absent when AIRCRAFT.

10. **CR-007 + observability:** Run `grep -r "get_event_loop" backend/` → zero results. Submit a query twice → CACHED badge renders on second response. Expand "TIMING BREAKDOWN" in AgentTimeline → bar widths proportional to timings. Expand a vector step → source badges present per hit.

---

## Task Count Summary

| Metric | Value |
|--------|-------|
| Total tasks | 31 |
| Sprint 1 (P0) tasks | 10 (W3-001 to W3-010) |
| Sprint 2 (P1) tasks | 9 (W3-011 to W3-019) |
| Sprint 3 (P2) tasks | 12 (W3-020 to W3-031) |
| backend-architect tasks | 14 (W3-001–W3-007, W3-011, W3-012, W3-014, W3-025, W3-026, W3-028, W3-029) |
| frontend-developer tasks | 17 (W3-008–W3-010, W3-013, W3-015–W3-024, W3-027, W3-030, W3-031) |
| XL tasks | 0 (no task was rated XL; all were decomposed to M or smaller) |

**Critical path (longest dependency chain):**
`W3-011 → W3-012 → W3-013` (streaming: 3 tasks, M+M effort) is the longest chain within a sprint. Across the full wave, the Sprint 1 backend chain `W3-001/W3-002 → W3-005 → W3-007 → W3-009` (4 levels deep) is the longest end-to-end dependency chain.


---

# tasks3.md — NextAgentAI Wave 4: Supabase Auth

> Generated from: `auth_prompt.md` + `prd3.md`
> Generated on: 2026-03-08
> Total tasks: 28

---

## Summary

| Phase | Name | Tasks | Earliest Start |
|---|---|---|---|
| 1 | Backend Auth Infrastructure | W4-001 → W4-009 | Immediately (no frontend dependency) |
| 2 | Frontend Auth Infrastructure | W4-010 → W4-015 | Immediately (parallel with Phase 1) |
| 3 | Auth Pages | W4-016 → W4-019 | After W4-013 (AuthProvider) |
| 4 | AppHeader + API Client Integration | W4-020 → W4-025 | After W4-013, W4-014, W4-015 |
| 5 | Environment, Deployment & Docs | W4-026 → W4-028 | After all Phase 4 tasks |

---

## Parallel Work Waves

**Wave 1 (no blockers):**
W4-001, W4-010

**Wave 2:**
W4-002 (after W4-001), W4-011 (after W4-010)

**Wave 3:**
W4-003, W4-004 (after W4-002); W4-012, W4-013 (after W4-011)

**Wave 4:**
W4-005 (after W4-003, W4-004); W4-014 (after W4-013); W4-015 (after W4-013)

**Wave 5:**
W4-006 (after W4-005); W4-016, W4-017, W4-018, W4-019 (after W4-014, W4-015)

**Wave 6:**
W4-007 (after W4-006); W4-020 (after W4-013); W4-021 (after W4-013, W4-015)

**Wave 7:**
W4-008 (after W4-007); W4-022 (after W4-021); W4-023 (after W4-021); W4-024 (after W4-021); W4-025 (after W4-022, W4-023, W4-024)

**Wave 8:**
W4-009 (after W4-008); W4-026, W4-027 (after W4-008, W4-025)

**Wave 9:**
W4-028 (after W4-026, W4-027)

---

## Dependency Graph Summary

```
Phase 1 (Backend)           Phase 2 (Frontend Infra)
    |                               |
    W4-001                       W4-010
    W4-002                       W4-011
    W4-003, W4-004               W4-012, W4-013
    W4-005                       W4-014, W4-015
    W4-006                            |
    W4-007               Phase 3 (Auth Pages)
    W4-008               W4-016, W4-017, W4-018, W4-019
    W4-009                            |
         \               Phase 4 (Integration)
          \              W4-020, W4-021
           \             W4-022, W4-023, W4-024, W4-025
            \                         |
             +----> Phase 5 (Env & Deploy)
                    W4-026, W4-027, W4-028
```

Phases 1 and 2 are fully independent and may be implemented in parallel. Phase 3 requires the `AuthProvider` and Supabase browser client (W4-013, W4-014). Phase 4 requires `AuthContext` + `apiFetch` + middleware. Phase 5 requires all code tasks complete.

---

## Key Constraints (from CLAUDE.md and prd3.md)

- **No `asyncio.get_event_loop()`** — any changes to `orchestrator.py` must use `asyncio.get_running_loop()` (CR-007). Verify with `grep -r "get_event_loop" backend/app/`.
- **`@supabase/ssr` only** — `@supabase/auth-helpers-nextjs` is deprecated and must not be used.
- **`tsc --noEmit` must pass** — run `npx tsc --noEmit` from `frontend/` before declaring Phase 4 complete.
- **525 existing tests must not regress** — run `backend/.venv/Scripts/python -m pytest tests/` after every backend change; target: 525+ passed, 5 skipped.
- **Alembic CONCURRENTLY pattern** — `op.execute("COMMIT")` must precede every `CREATE INDEX CONCURRENTLY`. Follow `0005_wave3_indexes.py` exactly.
- **AppHeader: additive only** — no second `DomainSwitcher`, `NavDropdown`, or logo. Auth additions go to the right side only.
- **Dashboard height unchanged** — `height: calc(100vh - 46px)` on dashboard outer div; do not alter.
- **`ORJSONResponse` default** — auth error responses from FastAPI use `ORJSONResponse` automatically; no special handling needed.
- **Open redirect protection** — `?next=` param must be validated: starts with `/`, does not contain `://`, does not start with `//`.
- **No new UI libraries** — all auth page styling uses existing Tailwind + inline SCADA CSS vars (no component library additions).
- **`SUPABASE_JWT_SECRET` stays backend-only** — never in `NEXT_PUBLIC_` env vars or frontend code.
- **Test runner** — always `backend/.venv/Scripts/python -m pytest tests/` from `backend/`; bare `pytest` will fail.

---

## Tasks

---

### W4-001: Add `python-jose[cryptography]` to backend requirements

**Phase**: 1 — Backend Auth Infrastructure
**Depends on**: none
**Files**:
- `backend/requirements.txt` — modify

**Acceptance criteria**:
- [ ] `python-jose[cryptography]>=3.3.0` is present in `backend/requirements.txt`.
- [ ] No duplicate or conflicting `jose` entries in the file.
- [ ] `pip install -r requirements.txt` completes without error in the backend venv.

**Key constraints**: Do not add any other new Python packages not required by auth.

---

### W4-002: Create `backend/app/auth/` package skeleton

**Phase**: 1 — Backend Auth Infrastructure
**Depends on**: W4-001
**Files**:
- `backend/app/auth/__init__.py` — create (empty or minimal exports)

**Acceptance criteria**:
- [ ] `backend/app/auth/__init__.py` exists.
- [ ] `from backend.app.auth import jwt` imports without error inside the venv.
- [ ] No circular imports introduced (verify by importing `main.py` in a dry run).

**Key constraints**: The `__init__.py` may be empty; the actual logic lives in `jwt.py` (W4-003).

---

### W4-003: Implement `backend/app/auth/jwt.py` — JWT verification

**Phase**: 1 — Backend Auth Infrastructure
**Depends on**: W4-002
**Files**:
- `backend/app/auth/jwt.py` — create

**Acceptance criteria**:
- [ ] `verify_token(token: str) -> dict` decodes a valid Supabase HS256 JWT using `SUPABASE_JWT_SECRET` from `os.environ` and returns the claims dict.
- [ ] `verify_token` raises `HTTPException(status_code=401)` for: expired token, wrong signature, missing `sub` claim, malformed token.
- [ ] `get_current_user(request: Request) -> dict` extracts the `Authorization: Bearer <token>` header, calls `verify_token`, returns claims. Raises `HTTPException(401)` if the header is absent.
- [ ] `SUPABASE_JWT_SECRET` is never logged or included in exception detail strings.
- [ ] Module imports cleanly: `from backend.app.auth.jwt import get_current_user`.

**Key constraints**: Algorithm must be `HS256`. Use `jose.jwt.decode()` from `python-jose`. Do not call the Supabase API on each request.

---

### W4-004: Add `user_id` column to `AgentRun` ORM model

**Phase**: 1 — Backend Auth Infrastructure
**Depends on**: W4-002
**Files**:
- `backend/app/db/models.py` — modify

**Acceptance criteria**:
- [ ] `AgentRun` ORM class has `user_id = Column(PGUUID(as_uuid=True), nullable=True, index=True)`.
- [ ] Import `from sqlalchemy.dialects.postgresql import UUID as PGUUID` is present (or reuses the existing import if already present).
- [ ] `nullable=True` — existing rows are unaffected.
- [ ] Existing tests that construct `AgentRun` objects do not fail (`pytest tests/` passes).

**Key constraints**: Do not change any other columns. `PGUUID(as_uuid=True)` must match the migration type used in W4-005.

---

### W4-005: Write Alembic migration `0006_add_user_id_to_agent_runs.py`

**Phase**: 1 — Backend Auth Infrastructure
**Depends on**: W4-003, W4-004
**Files**:
- `backend/app/db/migrations/versions/0006_add_user_id_to_agent_runs.py` — create

**Acceptance criteria**:
- [ ] `revision = "0006_add_user_id"`, `down_revision = "0005_wave3_indexes"`.
- [ ] `upgrade()` adds `user_id UUID NULLABLE` column to `agent_runs` via `op.add_column`.
- [ ] `upgrade()` calls `op.execute("COMMIT")` immediately before `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_runs_user_id ON agent_runs (user_id, created_at DESC)`.
- [ ] `downgrade()` drops the index with `DROP INDEX IF EXISTS` then drops the column.
- [ ] Migration file follows the exact structure and comment style of `0005_wave3_indexes.py`.
- [ ] `alembic history` shows the new revision in the chain (local Docker DB).

**Key constraints**: The CONCURRENTLY pattern is mandatory — see `0005_wave3_indexes.py`. Do not skip `op.execute("COMMIT")` or Neon will error. `downgrade()` must be a working reverse.

---

### W4-006: Thread `user_id` through `orchestrator.run()` and `_save_run()`

**Phase**: 1 — Backend Auth Infrastructure
**Depends on**: W4-005
**Files**:
- `backend/app/agent/orchestrator.py` — modify

**Acceptance criteria**:
- [ ] `orchestrator.run()` signature gains `user_id: str | None = None` as an optional keyword parameter after the existing `conversation_history` param.
- [ ] `_save_run()` (or equivalent internal save method) includes `user_id` in the `agent_runs` INSERT.
- [ ] When `user_id=None`, the INSERT stores `NULL` for `user_id` (preserves backward compatibility).
- [ ] No use of `asyncio.get_event_loop()` — `asyncio.get_running_loop()` only (CR-007). Verify with `grep -r "get_event_loop" backend/app/`.
- [ ] All existing 525 tests continue to pass after the change.

**Key constraints**: The `run()` method is `async`; `_save_run()` must also remain async or sync-in-executor as appropriate. Do not change the return type `AgentRunResult`.

---

### W4-007: Add `Depends(get_current_user)` to protected API routers

**Phase**: 1 — Backend Auth Infrastructure
**Depends on**: W4-006
**Files**:
- `backend/app/api/query.py` — modify
- `backend/app/api/runs.py` — modify
- `backend/app/api/analytics.py` — modify

**Acceptance criteria**:
- [ ] `POST /query`: receives `current_user: dict = Depends(get_current_user)`; extracts `user_id = current_user["sub"]`; passes `user_id` to `orchestrator.run()`.
- [ ] `GET /runs`: receives `Depends(get_current_user)`; adds `WHERE user_id = :user_id` filter so users see only their own runs.
- [ ] `GET /runs/{run_id}`: receives `Depends(get_current_user)`; adds `AND user_id = :user_id` guard; returns HTTP 404 if run belongs to a different user.
- [ ] `PATCH /runs/{run_id}/favourite`: receives `Depends(get_current_user)`; adds `AND user_id = :user_id` guard; returns HTTP 404 for another user's run.
- [ ] `GET /analytics/*`: receives `Depends(get_current_user)`; analytics results are not user-scoped (shared data) but auth is required.
- [ ] `GET /healthz`, `POST /ingest`, `GET /docs` remain public — no `Depends` added.
- [ ] `curl -X POST /query` without an `Authorization` header returns HTTP 401.

**Key constraints**: Import `get_current_user` from `backend.app.auth.jwt`. Do not apply auth globally in `main.py` — apply per-router so public endpoints stay public.

---

### W4-008: Write `backend/tests/test_auth_jwt.py`

**Phase**: 1 — Backend Auth Infrastructure
**Depends on**: W4-007
**Files**:
- `backend/tests/test_auth_jwt.py` — create

**Acceptance criteria**:
- [ ] Test `verify_token` with a validly signed HS256 JWT → returns claims dict with `sub` key.
- [ ] Test `verify_token` with an expired JWT → `HTTPException` with `status_code=401`.
- [ ] Test `verify_token` with a wrong-secret JWT → `HTTPException` with `status_code=401`.
- [ ] Test `get_current_user` with a missing `Authorization` header → `HTTPException` 401.
- [ ] Test `get_current_user` with a malformed `Authorization` header (no "Bearer" prefix) → `HTTPException` 401.
- [ ] All tests run via `backend/.venv/Scripts/python -m pytest tests/test_auth_jwt.py` without requiring a live database.
- [ ] No real `SUPABASE_JWT_SECRET` in test code — use a test secret to sign/verify test tokens.

**Key constraints**: Use the existing Anthropic stub pattern from `conftest.py` as a model for environment patching. Use `python-jose` directly in the test to mint test JWTs.

---

### W4-009: Write `backend/tests/test_wave4_user_id.py` and verify full suite

**Phase**: 1 — Backend Auth Infrastructure
**Depends on**: W4-008
**Files**:
- `backend/tests/test_wave4_user_id.py` — create

**Acceptance criteria**:
- [ ] Tests verify that `orchestrator.run(user_id="some-uuid")` stores `user_id` on the resulting `AgentRunResult` or equivalent output.
- [ ] Tests verify that `orchestrator.run()` with no `user_id` stores `None` without error.
- [ ] Full suite run: `backend/.venv/Scripts/python -m pytest tests/` reports 527+ passed, 5 skipped (original 525 + 2 new test files, net of any skipped).
- [ ] No regressions in any previously passing test.

**Key constraints**: Use mocks/stubs for DB and Anthropic calls — same pattern as existing orchestrator tests.

---

### W4-010: Install `@supabase/supabase-js` and `@supabase/ssr` in frontend

**Phase**: 2 — Frontend Auth Infrastructure
**Depends on**: none
**Files**:
- `frontend/package.json` — modified by npm
- `frontend/package-lock.json` — modified by npm

**Acceptance criteria**:
- [ ] `npm install @supabase/supabase-js @supabase/ssr` completes without error from `frontend/` directory.
- [ ] `@supabase/supabase-js` v2.x appears in `frontend/package.json` `dependencies`.
- [ ] `@supabase/ssr` latest stable appears in `frontend/package.json` `dependencies`.
- [ ] `@supabase/auth-helpers-nextjs` is NOT added (deprecated — not permitted).
- [ ] If peer dependency conflicts arise, `--legacy-peer-deps` may be used; document the flag if used.

**Key constraints**: `@supabase/ssr` only, never `@supabase/auth-helpers-nextjs`. Do not install any form/UI component libraries.

---

### W4-011: Create `frontend/app/lib/supabase.ts` — browser Supabase client

**Phase**: 2 — Frontend Auth Infrastructure
**Depends on**: W4-010
**Files**:
- `frontend/app/lib/supabase.ts` — create

**Acceptance criteria**:
- [ ] Exports a singleton `supabase` via `createBrowserClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)` from `@supabase/ssr`.
- [ ] Uses `process.env.NEXT_PUBLIC_SUPABASE_URL!` and `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!` — no hardcoded values.
- [ ] TypeScript: `npx tsc --noEmit` passes with this file present (even if env vars are undefined at build time).
- [ ] File contains no server-only imports (no `next/headers`, no `cookies()`).

**Key constraints**: This file is imported by client components and `auth-context.tsx`. Must be safe to import in `"use client"` context.

---

### W4-012: Create `frontend/app/lib/supabase-server.ts` — server Supabase client factory

**Phase**: 2 — Frontend Auth Infrastructure
**Depends on**: W4-011
**Files**:
- `frontend/app/lib/supabase-server.ts` — create

**Acceptance criteria**:
- [ ] Exports an async `createClient()` factory function using `createServerClient` from `@supabase/ssr`.
- [ ] Uses `cookies()` from `next/headers` with read-only `getAll` access pattern for reading session cookies.
- [ ] Returns a properly typed Supabase client usable in Server Components and Route Handlers.
- [ ] Must not be imported in `"use client"` components — contains server-only APIs.
- [ ] `npx tsc --noEmit` passes.

**Key constraints**: This factory is used by `middleware.ts` (W4-015) with a different cookie pattern (read+write). The server component version is read-only. Do not export a singleton — it must be a factory called per-request.

---

### W4-013: Create `frontend/app/lib/auth-context.tsx` — `AuthProvider` and `useAuth()`

**Phase**: 2 — Frontend Auth Infrastructure
**Depends on**: W4-011
**Files**:
- `frontend/app/lib/auth-context.tsx` — create

**Acceptance criteria**:
- [ ] `"use client"` directive at the top.
- [ ] `AuthContextValue` interface has: `user: User | null`, `accessToken: string | null`, `loading: boolean`, `signOut: () => Promise<void>`. The `User` type is imported from `@supabase/supabase-js` — no `any` casts.
- [ ] `AuthContext` created with `createContext<AuthContextValue | null>(null)`.
- [ ] `AuthProvider` on mount: calls `supabase.auth.getUser()` to populate `user`; sets `loading = false` when complete.
- [ ] `AuthProvider` subscribes to `supabase.auth.onAuthStateChange()` — handles `SIGNED_IN`, `SIGNED_OUT`, `TOKEN_REFRESHED`, `PASSWORD_RECOVERY` events to keep `user` and `accessToken` in sync.
- [ ] `signOut()` calls `supabase.auth.signOut()` then `router.push('/sign-in')`.
- [ ] `useAuth()` hook throws a descriptive error if called outside `AuthProvider`.
- [ ] Structural pattern matches `frontend/app/lib/context.tsx` (`RunContext`) exactly — same file organisation, same `createContext` / `useContext` pattern.
- [ ] `npx tsc --noEmit` passes.

**Key constraints**: `loading = true` guard prevents flash of unauthenticated content during SSR hydration. Import `supabase` singleton from `./supabase` (W4-011), not re-create it.

---

### W4-014: Update `frontend/app/layout.tsx` — add `<AuthProvider>`

**Phase**: 2 — Frontend Auth Infrastructure
**Depends on**: W4-013
**Files**:
- `frontend/app/layout.tsx` — modify

**Acceptance criteria**:
- [ ] `AuthProvider` is imported from `./lib/auth-context`.
- [ ] Provider nesting order (outermost to innermost): `ThemeProvider` → `AuthProvider` → `DomainProvider` → `RunProvider` → `AppHeader` + `{children}`.
- [ ] No other changes to `layout.tsx` — existing `suppressHydrationWarning`, `AppHeader`, and provider structure untouched.
- [ ] Dev server starts without error: `npm run dev` on port 3005.
- [ ] `npx tsc --noEmit` passes.

**Key constraints**: `AuthProvider` must wrap `DomainProvider` and `RunProvider` so `useAuth()` is available everywhere. Do not add a second `<AppHeader />`.

---

### W4-015: Create `frontend/middleware.ts` — session refresh and route protection

**Phase**: 2 — Frontend Auth Infrastructure
**Depends on**: W4-013
**Files**:
- `frontend/middleware.ts` — create (at `frontend/middleware.ts`, NOT inside `app/`)

**Acceptance criteria**:
- [ ] Creates a `createServerClient` instance with full `getAll`/`setAll` cookie access on the request/response pair (read from `request.cookies`, write to `response.cookies`).
- [ ] Calls `await supabase.auth.getUser()` — NOT `getSession()`. This verifies the token and triggers automatic cookie refresh.
- [ ] Protected paths: `/`, `/dashboard`, `/data`, `/review`, `/examples`, `/medical-examples`, `/agent`, `/diagram`, `/faq`.
- [ ] Public paths allowed without auth: `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`, and any path under `/(auth)/`.
- [ ] Unauthenticated request to a protected path redirects to `/sign-in?next=<original-path>`.
- [ ] `next` query param validated: value must start with `/` and must not contain `://` or start with `//`. Invalid values default to `/`.
- [ ] `export const config = { matcher: ['/((?!_next/static|_next/image|favicon|api/docs|api/openapi).*)'] }` is present.
- [ ] Visiting `http://localhost:3005/` without a session cookie redirects to `/sign-in?next=/`.
- [ ] `npx tsc --noEmit` passes.

**Key constraints**: `supabase.auth.getUser()` is mandatory (not `getSession()`). Middleware runs on every matched request — keep it fast. The file must be at `frontend/middleware.ts`, not `frontend/app/middleware.ts`.

---

### W4-016: Create `frontend/app/(auth)/sign-in/page.tsx`

**Phase**: 3 — Auth Pages
**Depends on**: W4-014, W4-015
**Files**:
- `frontend/app/(auth)/sign-in/page.tsx` — create

**Acceptance criteria**:
- [ ] `"use client"` directive present.
- [ ] Form fields: Email, Password. Both required.
- [ ] On submit: calls `supabase.auth.signInWithPassword({ email, password })`. Button is disabled and shows a spinner while in-flight.
- [ ] Error mapping: `"Invalid login credentials"` → "Invalid email or password." | `"Email not confirmed"` → "Please confirm your email before signing in." | rate-limit error → "Too many attempts. Please wait before trying again."
- [ ] On success: reads `searchParams.get('next')`; validates the value (starts with `/`, no `://`, no `//`); calls `router.push(validNext ?? '/')`.
- [ ] If `searchParams.get('message') === 'password-updated'`: shows cyan info banner "Your password has been updated."
- [ ] Footer links: "Don't have an account? SIGN UP" → `/sign-up`; "Forgot password?" → `/forgot-password`.
- [ ] Full-height container: `height: calc(100vh - 46px)`, `background: hsl(var(--bg-void))`.
- [ ] Form card: `background: hsl(var(--bg-surface))`, border `hsl(var(--border-base))`, `border-radius: 2px`, `max-width: 420px`, centred.
- [ ] Heading uses Orbitron (`var(--font-display)`), colour `hsl(var(--col-green))`.
- [ ] Error display uses `AlertCircle` (lucide-react), colour `hsl(var(--col-red))`, matches ChatPanel error banner style exactly.
- [ ] `npx tsc --noEmit` passes.

**Key constraints**: No new UI component libraries. Reuse `.panel-hdr`, `.panel-dot` CSS classes from `globals.css`. If `--col-red` is absent from `globals.css`, add it with HSL `0 84% 60%` (see W4-019 for the check). All inline styles match prd3.md § 4.7 spec exactly.

---

### W4-017: Create `frontend/app/(auth)/sign-up/page.tsx`

**Phase**: 3 — Auth Pages
**Depends on**: W4-014, W4-015
**Files**:
- `frontend/app/(auth)/sign-up/page.tsx` — create

**Acceptance criteria**:
- [ ] `"use client"` directive present.
- [ ] Form fields: Email, Password (min 8 chars), Confirm Password. Client-side validation: passwords must match before submit.
- [ ] On submit: calls `supabase.auth.signUp({ email, password, options: { emailRedirectTo: NEXT_PUBLIC_SITE_URL + '/sign-in' } })`. Button disabled + spinner while in-flight.
- [ ] If `data.user && !data.session`: shows cyan message "Check your email for a confirmation link." — no redirect.
- [ ] If `data.session` is present (email confirm disabled): `router.push('/')`.
- [ ] Error: duplicate email → "An account with this email already exists." | weak password → "Password must be at least 8 characters."
- [ ] Footer link: "Already have an account? SIGN IN" → `/sign-in`.
- [ ] Same card/heading/error styling as W4-016.
- [ ] `npx tsc --noEmit` passes.

**Key constraints**: `emailRedirectTo` uses `process.env.NEXT_PUBLIC_SITE_URL` — must never be hardcoded. Confirm Password field is client-side only validation, not sent to Supabase.

---

### W4-018: Create `frontend/app/(auth)/forgot-password/page.tsx`

**Phase**: 3 — Auth Pages
**Depends on**: W4-014, W4-015
**Files**:
- `frontend/app/(auth)/forgot-password/page.tsx` — create

**Acceptance criteria**:
- [ ] `"use client"` directive present.
- [ ] Form field: Email only.
- [ ] On submit: calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: NEXT_PUBLIC_SITE_URL + '/reset-password' })`. Button disabled + spinner while in-flight.
- [ ] On success (regardless of whether the email is registered): shows cyan message "If that email is registered, a reset link has been sent." — no email enumeration.
- [ ] Rate-limit error → "Too many attempts. Please wait."
- [ ] Footer link: back to `/sign-in`.
- [ ] Same card/heading/error styling as W4-016.
- [ ] `npx tsc --noEmit` passes.

**Key constraints**: The success message must always appear after submit — never reveal whether the email exists. `redirectTo` uses `NEXT_PUBLIC_SITE_URL` env var.

---

### W4-019: Create `frontend/app/(auth)/reset-password/page.tsx` and ensure `--col-red` CSS var

**Phase**: 3 — Auth Pages
**Depends on**: W4-014, W4-015
**Files**:
- `frontend/app/(auth)/reset-password/page.tsx` — create
- `frontend/app/globals.css` — modify only if `--col-red` is absent

**Acceptance criteria**:
- [ ] `"use client"` directive present.
- [ ] On mount: subscribes to `supabase.auth.onAuthStateChange`. When event is `PASSWORD_RECOVERY`, enables the new-password form.
- [ ] `createBrowserClient` is initialised before `onAuthStateChange` listener is registered to avoid missed events.
- [ ] Form field: New Password (min 8 chars, validated client-side before submit).
- [ ] On submit: calls `supabase.auth.updateUser({ password: newPassword })`. Button disabled + spinner while in-flight.
- [ ] On success: `router.push('/sign-in?message=password-updated')`.
- [ ] If token is expired or invalid (auth state change event delivers error): shows error "This reset link has expired. Please request a new one." with link to `/forgot-password`.
- [ ] `globals.css` check: if `--col-red` is not defined, add `--col-red: 0 84% 60%;` in the `:root` or `.dark` block consistent with existing colour var style.
- [ ] Same card/heading/error styling as W4-016.
- [ ] `npx tsc --noEmit` passes.

**Key constraints**: `PASSWORD_RECOVERY` event is the gate — the form must be disabled until that event fires. Do not attempt to parse the `#access_token` hash manually; let Supabase JS handle it via the auth state change listener.

---

### W4-020: Update `frontend/app/components/AppHeader.tsx` — user pill and SIGN OUT button

**Phase**: 4 — AppHeader + API Client Integration
**Depends on**: W4-013
**Files**:
- `frontend/app/components/AppHeader.tsx` — modify

**Acceptance criteria**:
- [ ] `useAuth()` imported from `../lib/auth-context`.
- [ ] When `loading === true`: auth slot renders nothing (prevents hydration flash).
- [ ] When `user !== null` and `!loading`: renders a user email pill (font-mono, 0.6rem, `color: hsl(var(--text-dim))`, max-width 160px, `overflow: hidden`, `text-overflow: ellipsis`, `white-space: nowrap`, full email in `title` attribute).
- [ ] SIGN OUT button appears after the email pill: identical border/font style to the existing `NAVIGATE` dropdown trigger; uses `LogOut` lucide icon at size 10; colour changes to `hsl(var(--col-cyan))` on hover; calls `signOut()` from `useAuth()`.
- [ ] Auth slot is placed after the existing `DomainSwitcher` separator — no second `NavDropdown`, no second `DomainSwitcher`, no logo duplication.
- [ ] Existing AppHeader controls (VECTOR/SQL/GRAPH status dots, NavDropdown, DomainSwitcher) are untouched.
- [ ] `npx tsc --noEmit` passes.

**Key constraints**: `AppHeader` is already `"use client"` — no directive change needed. The 46px header height must not change. Follow exact inline style pattern of existing header buttons.

---

### W4-021: Update `frontend/app/lib/api.ts` — add `accessToken` to `apiFetch` and protected functions

**Phase**: 4 — AppHeader + API Client Integration
**Depends on**: W4-013, W4-015
**Files**:
- `frontend/app/lib/api.ts` — modify

**Acceptance criteria**:
- [ ] `apiFetch<T>(path: string, options?: RequestInit, accessToken?: string): Promise<T>` — new third parameter `accessToken?: string`.
- [ ] When `accessToken` is truthy, adds `Authorization: Bearer <accessToken>` to request headers. When absent or `undefined`, no `Authorization` header is added (backward compatible).
- [ ] The following exported functions gain an `accessToken?: string` parameter (last param, optional) and forward it to `apiFetch`: `postQuery`, `getRuns`, `getRun`, `patchFavourite`, `getAnalyticsDefects`, `getAnalyticsMaintenance`, `getAnalyticsDiseases`.
- [ ] Functions without auth requirement (`getHealth`, `getDocs`, `getChunk`, `triggerIngest`, `getRunById`) remain unchanged.
- [ ] All updated function signatures remain backward-compatible — `accessToken` is always the last, optional parameter.
- [ ] `npx tsc --noEmit` passes with zero errors — `accessToken` typed as `string | undefined`, no `any` casts.

**Key constraints**: Do not break the existing CORS simple-request optimisation on `getHealth()`. Do not add `Authorization` header to `GET /healthz`. The `Content-Type` conditional logic for GET/HEAD requests must remain intact.

---

### W4-022: Update `frontend/app/components/ChatPanel.tsx` — pass `accessToken` to `postQuery()`

**Phase**: 4 — AppHeader + API Client Integration
**Depends on**: W4-021
**Files**:
- `frontend/app/components/ChatPanel.tsx` — modify

**Acceptance criteria**:
- [ ] `useAuth()` imported from `../lib/auth-context`; `accessToken` destructured.
- [ ] All calls to `postQuery(...)` include `accessToken` as the final argument.
- [ ] No other ChatPanel functionality is altered (retry logic, SSE streaming, session_id, conversation_history, clear button, health-check warm-up, citations, examples bridge).
- [ ] `npx tsc --noEmit` passes.

**Key constraints**: `accessToken` may be `null` initially (during `loading`); pass it as `accessToken ?? undefined` to match the `string | undefined` type in `postQuery`. Do not add loading gates that block existing ChatPanel behaviour.

---

### W4-023: Update `frontend/app/components/HistorySidebar.tsx` — pass `accessToken` to history API calls

**Phase**: 4 — AppHeader + API Client Integration
**Depends on**: W4-021
**Files**:
- `frontend/app/components/HistorySidebar.tsx` — modify

**Acceptance criteria**:
- [ ] `useAuth()` imported; `accessToken` destructured.
- [ ] All calls to `getRuns(...)` include `accessToken`.
- [ ] All calls to `patchFavourite(...)` include `accessToken`.
- [ ] Existing favourites-pinned ordering, share URL, and sidebar collapse behaviour unchanged.
- [ ] `npx tsc --noEmit` passes.

**Key constraints**: Pass `accessToken ?? undefined` to handle `null` during initialisation.

---

### W4-024: Update dashboard tab components — pass `accessToken` to analytics API calls

**Phase**: 4 — AppHeader + API Client Integration
**Depends on**: W4-021
**Files**:
- `frontend/app/dashboard/components/Tab3DefectAnalytics.tsx` — modify
- `frontend/app/dashboard/components/Tab4MaintenanceTrends.tsx` — modify
- `frontend/app/dashboard/components/Tab5DataEval.tsx` — modify (if it calls analytics API)

**Acceptance criteria**:
- [ ] `useAuth()` imported in each modified tab component; `accessToken` destructured.
- [ ] All calls to `getAnalyticsDefects(...)`, `getAnalyticsMaintenance(...)`, `getAnalyticsDiseases(...)` include `accessToken`.
- [ ] Dashboard outer div `height: calc(100vh - 46px)` is not altered.
- [ ] Tabs 1 and 2 (`Tab1AgentQuery.tsx`, `Tab2IncidentExplorer.tsx`) are checked: if they call protected API functions, update them; otherwise leave untouched.
- [ ] `npx tsc --noEmit` passes.

**Key constraints**: Pass `accessToken ?? undefined` to handle `null` during initialisation. Do not change chart data processing, date filter logic, or component layout.

---

### W4-025: TypeScript full check — `npx tsc --noEmit`

**Phase**: 4 — AppHeader + API Client Integration
**Depends on**: W4-022, W4-023, W4-024
**Files**:
- No file changes — verification task

**Acceptance criteria**:
- [ ] `npx tsc --noEmit` run from `frontend/` exits with code 0 and zero type errors.
- [ ] Any type errors found must be fixed before this task is marked complete (fix in the relevant Phase 4 task file).
- [ ] `User` type from `@supabase/supabase-js` is used throughout — no `any` casts on `user` or `accessToken`.
- [ ] All `apiFetch` callers pass correctly typed arguments.

**Key constraints**: This is a gate task — Phase 5 must not start until this passes.

---

### W4-026: Document environment variables — frontend `.env.local.example` and backend `.env.example`

**Phase**: 5 — Environment, Deployment & Docs
**Depends on**: W4-008, W4-025
**Files**:
- `frontend/.env.local.example` — create (or update if it already exists)
- `backend/.env.example` — create (or update if it already exists)

**Acceptance criteria**:
- [ ] `frontend/.env.local.example` contains all three new Wave 4 vars with placeholder values and comments:
  - `NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...`
  - `NEXT_PUBLIC_SITE_URL=http://localhost:3005`
- [ ] Existing `NEXT_PUBLIC_API_URL` line is preserved in the example file.
- [ ] `backend/.env.example` contains `SUPABASE_JWT_SECRET=your-supabase-jwt-secret` with a comment explaining where to find it (Supabase dashboard → Settings → API → JWT Settings).
- [ ] Neither file contains real secrets — only placeholder values.
- [ ] `SUPABASE_JWT_SECRET` does NOT appear in any `NEXT_PUBLIC_` variable or any frontend file.

**Key constraints**: These are documentation/example files only — they must be safe to commit to the repository. Real values go in `.env.local` and `.env` which are gitignored.

---

### W4-027: Update `CLAUDE.md` with Wave 4 auth constraints

**Phase**: 5 — Environment, Deployment & Docs
**Depends on**: W4-008, W4-025
**Files**:
- `CLAUDE.md` — modify

**Acceptance criteria**:
- [ ] API endpoint table updated: `POST /query`, `GET /runs`, `GET /runs/{run_id}`, `PATCH /runs/{run_id}/favourite`, `GET /analytics/*` descriptions note "requires Bearer token".
- [ ] Environment variables table includes the four new Wave 4 vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL` (frontend), `SUPABASE_JWT_SECRET` (backend).
- [ ] Key Constraints section gains auth constraints: `@supabase/ssr` only; `supabase.auth.getUser()` in middleware (not `getSession()`); `SUPABASE_JWT_SECRET` backend-only; `next` param validation pattern.
- [ ] Database table row for `agent_runs` updated to mention `user_id UUID nullable`.
- [ ] New module `backend/app/auth/jwt.py` added to the backend modules architecture table.
- [ ] No existing constraints are removed — only additions and amendments.

**Key constraints**: Follow the exact formatting, heading style, and table structure already in `CLAUDE.md`. Do not restructure sections.

---

### W4-028: Supabase dashboard configuration checklist and smoke test sign-off

**Phase**: 5 — Environment, Deployment & Docs
**Depends on**: W4-026, W4-027
**Files**:
- No code files — operational verification task

**Acceptance criteria**:
- [ ] Supabase dashboard → Auth → URL Configuration → Site URL set to `https://nextgenai-seven.vercel.app`.
- [ ] Supabase dashboard → Auth → URL Configuration → Redirect URLs includes: `https://nextgenai-seven.vercel.app/**` and `http://localhost:3005/**`.
- [ ] Supabase dashboard → Auth → Email → Confirm email: enabled for production.
- [ ] `SUPABASE_JWT_SECRET` added to Render dashboard environment variables (not committed to repo).
- [ ] `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL` added to Vercel project environment variables.
- [ ] Migration `0006_add_user_id_to_agent_runs.py` applied to Neon production database.
- [ ] Smoke test — prod sign-up flow: new email → confirmation received → sign in → query submitted → history shows single run → sign out → redirected to `/sign-in`.
- [ ] Smoke test — prod route guard: visit `https://nextgenai-seven.vercel.app/dashboard` while signed out → redirected to `/sign-in?next=/dashboard`.
- [ ] Smoke test — prod API auth: `curl -X POST https://nextgenai-5bf8.onrender.com/query` without token → HTTP 401.
- [ ] Smoke test — `PATCH /runs/{id}/favourite` with another user's run_id → HTTP 404.

**Key constraints**: Neon migration must use the CONCURRENTLY pattern. If JWT secret is rotated in Supabase, Render env var must be updated and backend redeployed. Document any production-only differences in `upgrade.md` or `DEPLOY.md`.

---

## Agent Assignment Reference

All tasks in this plan use the default agent roles from the project's `.claude/agents/` directory:

| Agent | Tasks | Scope |
|---|---|---|
| `backend-architect` | W4-001 → W4-009 | Python deps, JWT module, ORM model, Alembic migration, orchestrator threading, router guards, tests |
| `frontend-developer` | W4-010 → W4-025 | npm install, Supabase clients, AuthContext, layout, middleware, auth pages, AppHeader, api.ts, ChatPanel, HistorySidebar, dashboard tabs, TypeScript check |
| `deployment-engineer` | W4-026 → W4-028 | Env var docs, CLAUDE.md update, Supabase dashboard config, Render/Vercel env vars, Neon migration, smoke tests |

**Total: 28 tasks**
- `backend-architect`: 9 tasks (W4-001 to W4-009)
- `frontend-developer`: 16 tasks (W4-010 to W4-025)
- `deployment-engineer`: 3 tasks (W4-026 to W4-028)

**Critical path** (longest dependency chain):
W4-001 → W4-002 → W4-003 → W4-005 → W4-006 → W4-007 → W4-008 → W4-009 → W4-026 → W4-028
(10 tasks deep on the backend side, all sequential)

Frontend critical path:
W4-010 → W4-011 → W4-013 → W4-015 → W4-016 → (W4-021 via W4-015) → W4-022 → W4-025 → W4-026 → W4-028
(10 tasks deep on the frontend side)
