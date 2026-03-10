# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Agentic manufacturing intelligence platform. A user submits a natural-language query; the agent classifies intent, plans a multi-step tool sequence, executes vector search / SQL / graph traversal / compute tools, and synthesises a cited response via Claude Sonnet 4.6.

**Live:** https://nextgenai-seven.vercel.app | API: https://nextgenai-5bf8.onrender.com

## Stack

- **Frontend**: Next.js 16 App Router, TypeScript, Tailwind, industrial SCADA theme (Orbitron / Rajdhani / JetBrains Mono)
- **Backend**: FastAPI, Python 3.11, SQLAlchemy 2 (async + sync), Alembic
- **Database**: PostgreSQL 16 + pgvector — Neon for production, Docker for local dev
- **Embeddings**: `sentence-transformers/all-MiniLM-L6-v2` (384 dims), HNSW cosine index
- **NER**: spaCy `en_core_web_sm`
- **LLM**: Anthropic Claude Sonnet 4.6 (`claude-sonnet-4-6`) for synthesis; Haiku 4.5 (`claude-haiku-4-5-20251001`) for classify/plan/verify
- **Deployment**: Vercel (frontend) + Render Docker (backend)

## Commands

```bash
# ── Local dev ──────────────────────────────────────────────────────────────────
# 1. Backend + DB via Docker Compose (port 8000, pg on 5432)
docker compose up --build

# 2. Frontend dev server (requires frontend/.env.local with NEXT_PUBLIC_API_URL)
cd frontend && npm run dev        # http://localhost:3005

# ── Backend tests — ALWAYS use the venv ────────────────────────────────────────
cd backend
.venv/Scripts/python -m pytest tests/              # full suite (560 tests)
.venv/Scripts/python -m pytest tests/test_wave3_*.py  # Wave 3 tests only
.venv/Scripts/python -m pytest tests/test_sql_guardrails.py  # single file
.venv/Scripts/python -m pytest -k "test_router"    # single test

# ── CLI (runs inside container or with venv activated) ─────────────────────────
python -m backend.src.cli ingest --config backend/config.yaml
python -m backend.src.cli ask "Show defect trends by product for last 90 days"
```

**Important:** Always run pytest via `.venv/Scripts/python -m pytest` (not bare `pytest`) to avoid `ModuleNotFoundError` for `pgvector`, `psycopg2`, `asyncpg`.

## Architecture

### Backend modules (`backend/app/`)

| Package | Key files | Purpose |
|---|---|---|
| `agent/` | `orchestrator.py`, `intent.py`, `planner.py`, `verifier.py` | Intent classification → plan → tool loop → verify |
| `api/` | `query.py`, `runs.py`, `analytics.py`, `ingest.py`, `docs.py` | FastAPI routers: `POST /query`, `GET /runs`, `GET /analytics/*`, `POST /ingest`, `GET /healthz` |
| `auth/` | `jwt.py` | JWT verification via `python-jose` (HS256); `verify_token()` + `get_current_user` (hard, raises 401) + `get_optional_user` (soft, returns `None` for anonymous) FastAPI dependencies — **currently inactive**: all API routes are fully public (no `Depends(get_current_user/get_optional_user)` applied); module retained for future re-enablement |
| `db/` | `models.py`, `session.py`, `migrations/` | 7-table SQLAlchemy schema + Wave 3 columns, async/sync engines, Alembic |
| `graph/` | `builder.py`, `expander.py`, `scorer.py` | GraphRAG: build nodes/edges, expand subgraph, score paths |
| `ingest/` | `pipeline.py`, `kaggle_loader.py`, `synthetic.py` | Load Kaggle CSVs or generate synthetic data, chunk & embed |
| `llm/` | `client.py` | Anthropic SDK wrapper — `get_llm_client()` / `get_async_llm_client()` (Sonnet), `get_fast_llm_client()` / `get_async_fast_llm_client()` (Haiku); `stream()` async iterator for SSE synthesis |
| `rag/` | `chunker.py`, `embeddings.py`, `retrieval.py` | Sentence-level chunking, SentenceTransformer embed, pgvector HNSW search, BM25 + hybrid RRF |
| `schemas/` | `models.py` | Pydantic v2 request/response models (canonical source of truth) |
| `tools/` | `vector_tool.py`, `sql_tool.py`, `compute_tool.py` | Guardrailed tool implementations |
| `main.py` | — | FastAPI app factory, CORS middleware, lifespan, router registration |

### API endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/query` | Main agent query — returns `QueryResponse`; supports SSE streaming via `Accept: text/event-stream` — **public** |
| `GET` | `/runs` | Paginated run history — `?limit=20&offset=0` — **public**; returns all runs (no user filter) |
| `GET` | `/runs/{run_id}` | Single run full response — **public** |
| `PATCH` | `/runs/{run_id}/favourite` | Toggle `is_favourite` on a run — **public** |
| `GET` | `/analytics/defects` | Defect aggregates — `?from=&to=&domain=` — **public** |
| `GET` | `/analytics/maintenance` | Maintenance trends — `?from=&to=` — **public** |
| `GET` | `/analytics/diseases` | Disease aggregates — `?from=&to=&specialty=` — **public** |
| `POST` | `/ingest` | Ingest documents — public |
| `GET` | `/healthz` | Health check — `Cache-Control: no-store` — public |

### Database tables (`backend/app/db/models.py`)

| Table | Description |
|---|---|
| `incident_reports` | Narrative text — primary vector embedding source |
| `manufacturing_defects` | Structured defect records — SQL aggregation |
| `maintenance_logs` | Time-series sensor/maintenance events |
| `incident_embeddings` | 384-dim pgvector chunks with char offsets — HNSW cosine index |
| `medical_embeddings` | 384-dim pgvector chunks for medical/clinical domain — HNSW cosine index |
| `graph_node` | KG nodes: `entity` or `chunk` type |
| `graph_edge` | KG edges: `mentions`, `similarity`, `co_occurrence` |
| `agent_runs` | Persisted full JSON output per query; Wave 3 adds `session_id UUID` (nullable) and `is_favourite BOOLEAN DEFAULT FALSE`; Wave 4 adds `user_id UUID` (nullable) — Supabase user UUID |

### Wave 3 Alembic migrations (in `backend/app/db/migrations/versions/`)

| File | Change |
|---|---|
| `0003_add_session_id_to_agent_runs.py` | Adds `session_id UUID` nullable column |
| `0004_add_is_favourite_to_agent_runs.py` | Adds `is_favourite BOOLEAN NOT NULL DEFAULT FALSE` |
| `0005_wave3_indexes.py` | HNSW on `medical_embeddings` + GIN FTS on `incident_reports`/`medical_cases` + composite index on `agent_runs(LOWER(query), created_at DESC)` — all use `op.execute("COMMIT")` before `CONCURRENTLY` |
| `0006_add_user_id_to_agent_runs.py` | Adds `user_id UUID` nullable column + `idx_agent_runs_user_id` HNSW index (user_id, created_at DESC) |

### Frontend pages (`frontend/app/`)

| Route | Component | Description |
|---|---|---|
| `/` | `page.tsx` | ChatPanel + GraphViewer (collapsible) + AgentTimeline — main query interface |
| `/agent` | `agent/page.tsx` | Agent architecture — 4 tabs: STATE MACHINE, LLM ROUTING, INTENT & TOOLS, REQUEST FLOW |
| `/dashboard` | `dashboard/page.tsx` | Five-tab analytics dashboard (Tabs 3–5 use real API data) |
| `/diagram` | `diagram/page.tsx` | Mermaid architecture diagrams (MVP + enterprise) |
| `/data` | `data/page.tsx` | Kaggle dataset showcase |
| `/review` | `review/page.tsx` | Architecture review + learning guide |
| `/examples` | `examples/page.tsx` | Pre-built example queries (aircraft) — "Run Query" button bridges to ChatPanel |
| `/medical-examples` | `medical-examples/page.tsx` | 14 pre-built clinical example queries — "Run Query" button bridges to ChatPanel |
| `/faq` | `faq/page.tsx` | FAQ |

Key frontend files:
- `app/layout.tsx` — renders `<AppHeader />` above all `{children}`; provider nesting: `ThemeProvider` → `AuthProvider` → `DomainProvider` → `RunProvider`
- `app/components/AppHeader.tsx` — shared site-wide header: NEXTAGENTAI logo, VECTOR/SQL/GRAPH status dots, `NavDropdown` (exported), `DomainSwitcher`, user email pill + SIGN OUT button (Wave 4)
- `app/lib/api.ts` — typed API client: `postQuery()`, `getHealth()`, `getRuns()`, `getRun()`, `patchFavourite()`, `getAnalyticsDefects()`, `getAnalyticsMaintenance()`, `getAnalyticsDiseases()` — protected functions accept optional `accessToken?: string` as last param
- `app/lib/supabase.ts` — browser Supabase client singleton (`createBrowserClient`)
- `app/lib/supabase-server.ts` — server Supabase client factory (`createServerClient`, per-request)
- `app/lib/auth-context.tsx` — `AuthProvider` + `useAuth()` hook; provides `{ user, accessToken, loading, signOut }`
- `middleware.ts` — Next.js middleware: session refresh via `supabase.auth.getUser()` + route protection redirects to `/sign-in?next=<path>`
- `app/(auth)/sign-in/page.tsx`, `sign-up/page.tsx`, `forgot-password/page.tsx`, `reset-password/page.tsx` — auth pages (SCADA theme, `"use client"`)
- `app/lib/theme.tsx` — `ThemeToggle`, `FontSizeControl`, CSS var system
- `app/components/ChatPanel.tsx` — real API calls, session memory (UUID in component state), SSE streaming renderer, health-check warm-up, citations, retry loop, clear button, AGENT NOTES section, medical disclaimer banner, examples localStorage bridge
- `app/components/AgentTimeline.tsx` — execution trace; steps click-to-expand; CACHED badge; timing breakdown bar chart; source labels (BM25/VECTOR/HYBRID); CSV download on SQL tables
- `app/components/GraphViewer.tsx` — 3-tier graph display; node search filter; viewport-aware popover; edge weight labels; `graphPath` and `vectorHitsForGraph` must be `useMemo`
- `app/components/HistorySidebar.tsx` — collapsible history sidebar (240px); fetches `GET /runs`; favourites pinned; share URL via `?run=<id>`
- `app/components/CitationsDrawer.tsx` — Prev/Next nav; "1 of N" counter; `highlightRange()` char-offset highlighting; conflict badge
- `app/components/ExportModal.tsx` — PDF export via `@react-pdf/renderer`; JSON download
- `app/components/MermaidDiagram.tsx` — per-diagram `%%{init}%%` theming, single init

## Configuration

- `backend/config.yaml` — dataset CSV paths, embedding model, chunk size/overlap, top-k
- `.env` (repo root, gitignored) — `ANTHROPIC_API_KEY`, `PG_DSN`, `DATABASE_URL`
- `frontend/.env.local` (gitignored) — `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`
- `frontend/.env.local.example` — template with all required vars including Wave 4 Supabase vars
- `render.yaml` — Render Docker deployment blueprint
- `docker-compose.yml` — local dev: postgres (5432) + backend (8000); frontend runs separately

## Key Constraints

- **SQL guardrails**: `sql_tool.py` rejects any non-SELECT statement at parse time; analytics endpoints use named-query pattern only — no raw SQL generation
- **Vector metadata**: `incident_embeddings` stores `char_start`/`char_end` per chunk for citation highlighting
- **Agent output**: always includes `evidence` (vector hits + SQL rows), `claims` with `confidence` and `conflict_flagged`, `citations`, `next_steps`, `assumptions`
- **CORS**: never use `allow_origins=["*"]` with `allow_credentials=True`; use explicit origin list in `main.py`; extend via `CORS_ORIGINS` env var
- **Mermaid**: call `mermaid.initialize()` once only; inject theme via `%%{init}%%` per diagram; use timestamp-suffixed IDs to avoid DOM ID collisions
- **Render cold starts**: frontend pings `GET /healthz` on mount to wake backend; set `EAGER_MODEL_LOAD=true` on Render for streaming 1.5s first-token target
- **LLM routing**: use `get_fast_llm_client()` / `get_async_fast_llm_client()` (Haiku) for classify/plan/verify; use `get_llm_client()` / `get_async_llm_client()` (Sonnet) for synthesis only; use `stream()` on Sonnet client for SSE synthesis
- **Async orchestration**: `orchestrator.py` primary path is `async def run()`; `asyncio.gather(vector_task, sql_task)` for hybrid/compute intents; all LLM calls use `complete_async()`
- **Verifier max_tokens**: must be `1536` in `verifier.py` — lower values truncate the JSON response and silently drop all claims
- **ORJSONResponse**: `main.py` sets `default_response_class=ORJSONResponse`; FastAPI emits a deprecation warning (P3 — non-breaking); tracked in TEST_REPORT.md as BUG-W3-P3-001
- **graph_path always present**: backend always returns `graph_path: {nodes:[], edges:[]}` (never null). In `GraphViewer.tsx`, check `nodes.length > 0` before deciding display tier — 3-tier priority: (1) real backend graph, (2) synthetic graph built from vector hits (amber "VECTOR HITS" badge), (3) static mock (purple "SAMPLE DATA" badge)
- **Hydration**: `<html>` in `layout.tsx` has `suppressHydrationWarning`; do NOT put `dark`/`text-medium` in the static SSR className — the inline theme script owns those classes
- **Shared AppHeader**: `layout.tsx` renders `<AppHeader />` (46px) above every page. Pages must NOT define their own full-height global header. Do NOT add `DomainSwitcher` or a second `NavDropdown` to page sub-headers
- **Dashboard height**: dashboard outer div uses `height: "calc(100vh - 46px)"` (not `100vh`) to account for the 46px global AppHeader
- **Graph pane**: collapsible via `PanelRightClose`/`PanelRightOpen` button in `page.tsx`; state lives in `Home` component
- **CR-007 FIXED**: `compute_tool.py` and `vector_tool.py` now use `asyncio.get_running_loop()` — do not reintroduce `get_event_loop()`; CI check: `grep -r "get_event_loop" backend/app/` must return zero results
- **Claim confidence display**: scores rendered as integer `%` (e.g. `15%`) not raw decimal. Colour thresholds: `>=70%` green, `>=40%` amber, else red. Text wraps to 2 lines (no single-line truncation)
- **AgentTimeline expand**: each step is click-to-expand accordion. Vector hits shown with min-max normalised score + score bar. SQL results shown as scrollable table. Expand state: `expandedStep: number | null` (one open at a time)
- **Vector hit score normalisation**: raw cosine scores from synthetic data are ~0.01–0.02 (all similar due to template structure). Display normalises within result set: `(score - min) / (max - min)`. Best match = 1.000
- **ChatPanel retry**: on network/502 error, retries up to 3× with 4s delay. Shows amber banner "Connection issue, retrying... (N/3)". Does not retry on 4xx. After exhaustion: "Backend is temporarily unavailable."
- **ChatPanel clear**: Trash2 button appears left of input when messages exist and not loading. Clears messages, input, error, runData, session_id, and conversation_history (resets graph + timeline + session)
- **Session memory**: `session_id` UUID generated on first query and stored in ChatPanel component state (NOT localStorage); `conversation_history` max 5 turns injected into synthesis prompt only; gated by `CONVERSATIONAL_MEMORY_ENABLED` env var
- **Examples bridge**: `/examples` and `/medical-examples` "Run Query" buttons write to `localStorage` keys `pending_query` + `pending_domain`; ChatPanel reads and clears on mount with 300ms debounce
- **Query cache skip**: `_check_query_cache()` in `orchestrator.py` returns `None` (cache miss) when cached entry has `claims: []` — prevents stale degraded responses
- **Seed check**: `entrypoint.sh` verifies both tables per domain: aircraft checks `incident_reports AND incident_embeddings`; medical checks `medical_cases AND medical_embeddings`. Triggers re-seed if either is empty
- **`anthropic` package**: must be `>=0.49.0` — `AsyncAnthropic` and `stream()` introduced in that version
- **Render DB DSN format**: `PG_DSN` = `postgresql://...?sslmode=require`; `DATABASE_URL` = `postgresql+asyncpg://...?ssl=require`. The `?` must separate the DB name from query params
- **GraphViewer memoization**: `graphPath` and `vectorHitsForGraph` must be `useMemo` — plain inline expressions create new references each render and trigger the ReactFlow `StoreUpdater` infinite loop
- **Synthetic graph layout**: when backend returns empty `graph_path`, `GraphViewer` builds a synthetic graph from vector hits arranged in a `sqrt(n)`-column grid
- **Alembic CONCURRENTLY**: every `CREATE INDEX CONCURRENTLY` migration must call `op.execute("COMMIT")` immediately before the index statement; every migration must have a working `downgrade()`
- **Feature flags**: orchestrator-touching epics gated by env vars — `CONVERSATIONAL_MEMORY_ENABLED` (session history), `STREAMING_ENABLED` (SSE synthesis)
- **Wave 4 Auth — Supabase**: uses `@supabase/ssr` (not deprecated `@supabase/auth-helpers-nextjs`); `createBrowserClient` for client components, `createServerClient` for RSC/middleware
- **Wave 4 Auth — middleware**: `supabase.auth.getUser()` MUST be called (not `getSession()`) — verifies token server-side and triggers cookie refresh; protected routes: `/`, `/dashboard`, `/data`, `/review`, `/examples`, `/medical-examples`, `/agent`, `/diagram`, `/faq`; public routes: `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`
- **Wave 4 Auth — JWT**: backend validates Supabase JWTs locally via `python-jose` HS256 using `SUPABASE_JWT_SECRET`; no outbound Supabase API call per request; `user_id = claims["sub"]` stored on `agent_runs`; use `get_optional_user` on read/query endpoints (anonymous allowed), `get_current_user` only on write endpoints that strictly require identity
- **Wave 4 Auth — open redirect**: `?next=` param must start with `/` and not contain `://` or start with `//`; invalid values default to `/`
- **Wave 4 Auth — secrets**: `SUPABASE_JWT_SECRET` is backend-only — never in `NEXT_PUBLIC_` env vars or frontend code; Supabase anon key is safe to expose client-side (public by design)
- **Wave 4 Auth — `apiFetch`**: accepts optional third param `accessToken?: string`; injects `Authorization: Bearer <token>` when present; `getHealth()` never receives a token — must stay CORS simple request
- **Wave 4 Auth — graceful degradation**: `auth-context.tsx` wraps `supabase.auth.getUser()` in `.catch()` so a missing/placeholder anon key never crashes the app — user stays `null`, `loading` resolves to `false`, app renders in anonymous mode; `supabase.ts` defensive fallbacks prevent `createBrowserClient(undefined, undefined)` crash
- **Wave 4 Auth — anonymous queries**: `POST /query`, `GET /runs`, `GET /runs/{id}` use `get_optional_user` — requests without a Bearer token are accepted (user_id=null); `PATCH /runs/{id}/favourite` raises 401 when unauthenticated
- **Frontend dev mode — webpack only**: `npm run dev` uses `--webpack` flag. Next.js 16.1.6 Turbopack panics with `OptionAppProject no longer exists` when building the `/_app` Pages Router endpoint inside an App Router project. Do NOT switch to `--turbo` or remove `--webpack`; production `next build` (webpack) is unaffected.
- **ExportModal SSR constraint**: `ExportModal` must always be imported via `dynamic(() => import("./ExportModal"), { ssr: false })` — never as a static import. `@react-pdf/renderer` calls `StyleSheet.create()` (which uses browser canvas APIs) at module load time; static import crashes Next.js SSR with a `ReferenceError`.
- **Domain session isolation**: `ChatPanel` uses three React refs for per-domain state: `domainSnapshotsRef` (stores `{messages, sessionId, conversationHistory, runData}` per domain key), `currentStateRef` (updated every render to avoid stale closure in the domain-switch effect), and `prevDomainRef` (detects domain change). On domain switch, the effect saves current state into the previous domain's snapshot and restores the new domain's snapshot. `updateRunData` wrapper calls `setRunData` AND writes to the current domain's snapshot so graph/timeline restore correctly.
- **GraphViewer graph completeness**: when the backend returns a real graph (`nodes.length > 0`), `GraphViewer` supplements it with any vector hit chunks whose `chunk_id` is not already represented as a graph node. This ensures all N vector hits are visible in the graph, not just the subset included in `graph_path`.
- **`useSearchParams` Suspense requirement**: any page component that calls `useSearchParams()` must be wrapped in `<React.Suspense>` in Next.js App Router. Pattern: rename the component to `<Name>Inner`, export a wrapper `<Name>` that renders `<Suspense fallback={null}><NameInner /></Suspense>`.
- **Main page height**: `page.tsx` outer div uses `style={{ height: "calc(100vh - 46px)", width: "100%" }}` (not `h-screen` / `100vh`) so the content area fits below the 46px AppHeader without overflow.
- **INDUSTRIES nav item**: `AppHeader.tsx` NAV_ITEMS includes `{ href: "/examples?tab=industries", label: "INDUSTRIES", icon: Building2, accent: "--col-purple" }` — links directly to the industries tab of the examples page. The `Building2` icon is imported from `lucide-react`.

## Environment Variables

| Variable | Where | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | `.env` / Render dashboard | Claude API — must be `sk-ant-api03-...` format |
| `PG_DSN` | `.env` / Render dashboard | PostgreSQL DSN for sync connections |
| `DATABASE_URL` | `.env` / Render dashboard | Async DSN — use `postgresql+asyncpg://` prefix and `ssl=require` (not `sslmode=require`) |
| `CORS_ORIGINS` | Render dashboard | Comma-separated extra allowed origins |
| `NEXT_PUBLIC_API_URL` | `frontend/.env.local` / Vercel | Backend base URL |
| `CONVERSATIONAL_MEMORY_ENABLED` | `.env` / Render dashboard | Gates session context injection in orchestrator (default `true`) |
| `STREAMING_ENABLED` | `.env` / Render dashboard | Gates SSE streaming synthesis endpoint (default `true`) |
| `EAGER_MODEL_LOAD` | Render dashboard | Set `true` to load embedding model at startup — required for <1.5s first-token on streaming |
| `NEXT_PUBLIC_SUPABASE_URL` | `frontend/.env.local` / Vercel | Supabase project URL (e.g. `https://xxxx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `frontend/.env.local` / Vercel | Supabase anon/public key — safe to expose client-side |
| `NEXT_PUBLIC_SITE_URL` | `frontend/.env.local` / Vercel | Full frontend URL for email redirect links (`http://localhost:3005` dev, `https://nextgenai-seven.vercel.app` prod) |
| `SUPABASE_JWT_SECRET` | `.env` / Render dashboard | JWT secret from Supabase dashboard → Settings → API → JWT Settings — backend-only, never in frontend |

## Test Suite

- **Total tests**: 560 (344 pre-Wave 3 + 181 Wave 3 + 35 Wave 4)
- **Status**: 556 passed, 4 skipped (DB-dependent, expected without live PostgreSQL)
- **Run with**: `.venv/Scripts/python -m pytest tests/` from `backend/` — bare `pytest` will fail with missing native module errors
- **Wave 3 test files**: `backend/tests/test_wave3_schemas.py`, `test_wave3_runs_api.py`, `test_wave3_analytics_api.py`, `test_wave3_streaming.py`, `test_wave3_conversational_memory.py`, `test_wave3_compute_tool.py`, `test_wave3_retrieval_source.py`, `test_wave3_sql_queries.py`, `test_wave3_frontend_inspection.py`
- **Anthropic stub**: `backend/tests/stubs/anthropic/__init__.py` — contains both `Anthropic` (sync) and `AsyncAnthropic` (async) stub classes; loaded via `conftest.py`

## Wave 3 Reference Docs (repo root)

| File | Purpose |
|---|---|
| `prd2.md` | Wave 3 PRD v1.1 — 10 epics, acceptance criteria, constraints, verification checklist |
| `tasks2.md` | 31 atomic Wave 3 tasks (W3-001 → W3-031) with file paths and acceptance criteria |
| `backend2.md` | Backend handoff — full code for all new/modified backend files |
| `frontend.md` | Frontend handoff — all component changes, new components, npm packages |
| `TEST_REPORT.md` | Test results: 556/560 passing (4 skipped); Wave 4 auth bugs BUG-AUTH-001/002 resolved; E2E Wave 4 auth pages all passing |
| `upgrade.md` | Master implementation prompt — Phase 4 UX & Intelligence epics |
| `optimize.md` | Performance analysis — Wave 1/2 optimisations applied |

## Wave 4 Reference Docs (repo root)

| File | Purpose |
|---|---|
| `prd3.md` | Wave 4 PRD v1.0 — Supabase Auth; 7 user stories, architecture decisions, acceptance criteria |
| `tasks3.md` | 28 atomic Wave 4 tasks (W4-001 → W4-028); phases 1–5; critical path |
| `auth_prompt.md` | Auth implementation brief — sign-up/sign-in/reset/protect flows |
