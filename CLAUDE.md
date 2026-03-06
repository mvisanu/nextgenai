# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Agentic manufacturing intelligence platform. A user submits a natural-language query; the agent classifies intent, plans a multi-step tool sequence, executes vector search / SQL / graph traversal / compute tools, and synthesises a cited response via Claude Sonnet 4.6.

**Live:** https://nextgenai-seven.vercel.app | API: https://nextai-backend.onrender.com

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

# ── Backend tests ──────────────────────────────────────────────────────────────
cd backend
pip install -r requirements.txt
pytest tests/
pytest tests/test_sql_guardrails.py   # single file
pytest -k "test_router"               # single test

# ── CLI (runs inside container or with venv activated) ─────────────────────────
python -m backend.src.cli ingest --config backend/config.yaml
python -m backend.src.cli ask "Show defect trends by product for last 90 days"
```

## Architecture

### Backend modules (`backend/app/`)

| Package | Key files | Purpose |
|---|---|---|
| `agent/` | `orchestrator.py`, `intent.py`, `planner.py`, `verifier.py` | Intent classification → plan → tool loop → verify |
| `api/` | `query.py`, `ingest.py`, `docs.py` | FastAPI routers: `POST /query`, `POST /ingest`, `GET /healthz`, `GET /docs` |
| `db/` | `models.py`, `session.py`, `migrations/` | 7-table SQLAlchemy schema, async/sync engines, Alembic |
| `graph/` | `builder.py`, `expander.py`, `scorer.py` | GraphRAG: build nodes/edges, expand subgraph, score paths |
| `ingest/` | `pipeline.py`, `kaggle_loader.py`, `synthetic.py` | Load Kaggle CSVs or generate synthetic data, chunk & embed |
| `llm/` | `client.py` | Anthropic SDK wrapper — `get_llm_client()` (Sonnet), `get_fast_llm_client()` (Haiku) |
| `rag/` | `chunker.py`, `embeddings.py`, `retrieval.py` | Sentence-level chunking, SentenceTransformer embed, pgvector HNSW search |
| `schemas/` | `models.py` | Pydantic v2 request/response models (canonical source of truth) |
| `tools/` | `vector_tool.py`, `sql_tool.py`, `compute_tool.py` | Guardrailed tool implementations |
| `main.py` | — | FastAPI app factory, CORS middleware, lifespan |

### Database tables (`backend/app/db/models.py`)

| Table | Description |
|---|---|
| `incident_reports` | Narrative text — primary vector embedding source |
| `manufacturing_defects` | Structured defect records — SQL aggregation |
| `maintenance_logs` | Time-series sensor/maintenance events |
| `incident_embeddings` | 384-dim pgvector chunks with char offsets |
| `graph_node` | KG nodes: `entity` or `chunk` type |
| `graph_edge` | KG edges: `mentions`, `similarity`, `co_occurrence` |
| `agent_runs` | Persisted full JSON output per query |

### Frontend pages (`frontend/app/`)

| Route | Component | Description |
|---|---|---|
| `/` | `page.tsx` | ChatPanel + GraphViewer (collapsible) + AgentTimeline — main query interface |
| `/dashboard` | `dashboard/page.tsx` | Five-tab analytics dashboard |
| `/diagram` | `diagram/page.tsx` | Mermaid architecture diagrams (MVP + enterprise) |
| `/data` | `data/page.tsx` | Kaggle dataset showcase |
| `/review` | `review/page.tsx` | Architecture review + learning guide |
| `/examples` | `examples/page.tsx` | Pre-built example queries (aircraft) |
| `/medical-examples` | `medical-examples/page.tsx` | 14 pre-built clinical example queries |
| `/faq` | `faq/page.tsx` | FAQ |

Key frontend files:
- `app/lib/api.ts` — typed API client, `postQuery()`, `getHealth()`, etc.
- `app/lib/theme.tsx` — `ThemeToggle`, `FontSizeControl`, CSS var system
- `app/components/ChatPanel.tsx` — real API calls, health-check warm-up, citations
- `app/components/MermaidDiagram.tsx` — per-diagram `%%{init}%%` theming, single init

## Configuration

- `backend/config.yaml` — dataset CSV paths, embedding model, chunk size/overlap, top-k
- `.env` (repo root, gitignored) — `ANTHROPIC_API_KEY`, `PG_DSN`, `DATABASE_URL`
- `frontend/.env.local` (gitignored) — `NEXT_PUBLIC_API_URL=http://localhost:8000`
- `render.yaml` — Render Docker deployment blueprint
- `docker-compose.yml` — local dev: postgres (5432) + backend (8000); frontend runs separately

## Key Constraints

- **SQL guardrails**: `sql_tool.py` rejects any non-SELECT statement at parse time
- **Vector metadata**: `incident_embeddings` stores `char_start`/`char_end` per chunk for citation highlighting
- **Agent output**: always includes `evidence` (vector hits + SQL rows), `claims` with `confidence`, `citations`
- **CORS**: never use `allow_origins=["*"]` with `allow_credentials=True` — illegal per Fetch spec; use explicit origin list in `main.py`; extend via `CORS_ORIGINS` env var
- **Mermaid**: call `mermaid.initialize()` once only; inject theme via `%%{init}%%` per diagram; use timestamp-suffixed IDs to avoid DOM ID collisions
- **Render cold starts**: frontend pings `GET /healthz` on mount (no preflight) to wake the backend before user submits first query
- **LLM routing**: use `get_fast_llm_client()` (Haiku) for classify/plan/verify — simple JSON tasks; use `get_llm_client()` (Sonnet) for synthesis only. Do not use Sonnet for routing.
- **graph_path always present**: backend always returns `graph_path: {nodes:[], edges:[]}` (never null). In `GraphViewer.tsx`, check `nodes.length > 0` before deciding mock vs real — never rely on `?? fallback` alone.
- **Hydration**: `<html>` in `layout.tsx` has `suppressHydrationWarning`; do NOT put `dark`/`text-medium` in the static SSR className — the inline theme script owns those classes.
- **Graph pane**: collapsible via `PanelRightClose`/`PanelRightOpen` button in `page.tsx`; state lives in `Home` component.

## Environment Variables

| Variable | Where | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | `.env` / Render dashboard | Claude API — must be `sk-ant-api03-...` format |
| `PG_DSN` | `.env` / Render dashboard | PostgreSQL DSN for sync connections |
| `DATABASE_URL` | `.env` / Render dashboard | Same as `PG_DSN` (asyncpg uses `postgresql+asyncpg://`) |
| `CORS_ORIGINS` | Render dashboard | Comma-separated extra allowed origins |
| `NEXT_PUBLIC_API_URL` | `frontend/.env.local` / Vercel | Backend base URL |
