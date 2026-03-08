# NextAgentAI

Dual-domain agentic intelligence platform. Ask natural-language questions over clinical case reports and aircraft/manufacturing datasets — vector search, SQL, knowledge-graph traversal, and Claude-synthesised cited answers in one industrial-grade UI.

**Live demo:** https://nextgenai-seven.vercel.app
**API:** https://nextgenai-5bf8.onrender.com/api/docs

> The Render backend runs on a free tier and spins down after 15 minutes of inactivity. The first query on a cold instance may take ~60 seconds. The frontend shows a "BACKEND WARMING UP" banner while it reconnects.

---

## What it does

A user types a free-text query in either **Aircraft** or **Medical** domain mode. The agent:

1. **Classifies intent** — `vector_only`, `sql_only`, `hybrid`, or `compute` (Haiku, ~0.7s)
2. **Plans a tool sequence** — up to 5 steps (Haiku, ~1s)
3. **Executes tools** — vector search (HNSW/IVFFlat cosine over pgvector), SQL SELECT (guardrailed), knowledge-graph traversal, or statistical compute (~30ms)
4. **Synthesises an answer** — Claude Sonnet 4.6 generates a cited response from the evidence (~7s)
5. **Verifies claims** — confidence scores and citations attached (Haiku, ~1s)
6. **Returns structured output** — answer, claims with confidence scores, citations, graph path, run summary

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React, TypeScript, Tailwind CSS |
| UI | Custom industrial SCADA theme (Orbitron / Rajdhani / JetBrains Mono) |
| Backend | FastAPI, Python 3.11, SQLAlchemy 2, Alembic |
| Database | PostgreSQL 16 + pgvector (Neon for production, Docker for local) |
| Embeddings | `sentence-transformers/all-MiniLM-L6-v2` (384 dimensions) |
| NER | spaCy `en_core_web_sm` |
| LLM | Claude Sonnet 4.6 (synthesis) + Haiku 4.5 (classify / plan / verify) |
| Diagrams | Mermaid.js |
| Graph | ReactFlow |
| Deployment | Vercel (frontend) + Render (backend, Docker) |

---

## Repository Layout

```
NextAgentAI/
├── backend/
│   ├── app/
│   │   ├── agent/          # orchestrator, intent, planner, verifier
│   │   ├── api/            # FastAPI routers: query, ingest, docs, healthz
│   │   ├── db/             # SQLAlchemy models, session, Alembic migrations
│   │   ├── graph/          # GraphRAG builder, expander, scorer
│   │   ├── ingest/         # Pipeline, Kaggle loader, synthetic data generator, medical_pipeline
│   │   ├── llm/            # Anthropic client wrapper
│   │   ├── rag/            # Chunker, embeddings, retrieval (aircraft + medical)
│   │   ├── schemas/        # Pydantic request/response models
│   │   ├── tools/          # vector_tool, sql_tool, compute_tool
│   │   └── main.py         # FastAPI app factory + CORS
│   ├── tests/
│   ├── Dockerfile
│   ├── entrypoint.sh       # wait-for-db → migrate → seed aircraft → seed medical → uvicorn
│   └── requirements.txt
├── frontend/
│   └── app/
│       ├── components/     # AppHeader (shared), ChatPanel, GraphViewer, AgentTimeline, MermaidDiagram
│       ├── dashboard/      # Five-tab analytics dashboard (domain-aware)
│       ├── diagram/        # MVP + enterprise architecture diagrams
│       ├── data/           # Kaggle dataset showcase
│       ├── review/         # Architecture review & learning guide
│       ├── examples/       # Example queries (aircraft)
│       ├── medical-examples/ # 14 clinical example queries
│       ├── faq/            # FAQ page
│       └── lib/            # api.ts, theme, domain-context
├── docker-compose.yml
├── render.yaml
└── CLAUDE.md
```

---

## Database Schema

Ten tables in PostgreSQL:

| Table | Domain | Purpose |
|---|---|---|
| `incident_reports` | Aircraft | Narrative text incidents — source for vector embeddings |
| `manufacturing_defects` | Aircraft | Structured defect records — SQL aggregation |
| `maintenance_logs` | Aircraft | Time-series sensor/maintenance events — trend queries |
| `incident_embeddings` | Aircraft | 384-dim pgvector chunks with char offsets (HNSW index) |
| `medical_cases` | Medical | Clinical case narratives mirroring incident_reports structure |
| `medical_embeddings` | Medical | 384-dim pgvector chunks with IVFFlat cosine index (lists=100) |
| `disease_records` | Medical | Structured disease/symptom rows for SQL aggregation |
| `graph_node` | Shared | Knowledge graph nodes (entity or chunk) |
| `graph_edge` | Shared | Edges: `mentions`, `similarity`, `co_occurrence` |
| `agent_runs` | Shared | Persisted full JSON output per query |

---

## Datasets (Kaggle)

| Dataset | Author | Used for |
|---|---|---|
| Manufacturing Defects | fahmidachowdhury | `manufacturing_defects` table, SQL tool |
| Aircraft Historical Maintenance 2012-2017 | merishnasuwal | `maintenance_logs` table, trend queries |
| Predicting Manufacturing Defects | rabieelkharoua | `incident_reports` + vector embeddings |
| MACCROBAT Clinical NER | Clinical NLP | `medical_cases` table, medical vector embeddings (synthetic fallback) |

Data is seeded automatically on first container start if tables are empty (aircraft and medical pipelines run independently).

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/query` | Run agent query (aircraft domain), returns cited answer |
| `POST` | `/query/medical` | Run agent query (medical domain), returns cited answer |
| `GET` | `/runs/{run_id}` | Retrieve stored run by ID |
| `GET` | `/docs` | List ingested incident documents |
| `GET` | `/docs/{doc_id}/chunks/{chunk_id}` | Fetch specific chunk for citation display |
| `POST` | `/ingest` | Trigger aircraft ingest pipeline |
| `POST` | `/ingest/medical` | Trigger medical ingest pipeline |
| `GET` | `/healthz` | Liveness + DB health check |
| `GET` | `/api/docs` | Swagger UI |

---

## Local Development

### Prerequisites
- Docker Desktop
- Node.js 18+

### 1. Clone and configure

```bash
git clone https://github.com/your-org/NextAgentAI.git
cd NextAgentAI
```

Create `.env` in the repo root (never commit this):

```env
ANTHROPIC_API_KEY=sk-ant-api03-...
PG_DSN=postgresql://postgres:postgres@localhost:5432/nextai
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nextai
```

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 2. Start the backend

```bash
docker compose up --build
```

This starts:
- PostgreSQL 16 + pgvector on port `5432`
- FastAPI backend on port `8000` (waits for DB, runs migrations, seeds aircraft data, seeds medical data)

### 3. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend available at `http://localhost:3005`.

### 4. Run backend tests

```bash
cd backend
pip install -r requirements.txt
pytest tests/
pytest tests/test_sql_guardrails.py    # single file
pytest -k "test_router"               # single test
```

---

## Deployment

### Backend → Render

The `render.yaml` blueprint deploys via Docker. Required environment variables in Render dashboard:

| Variable | Value |
|---|---|
| `PG_DSN` | `postgresql://user:pass@host.neon.tech/neondb?sslmode=require` |
| `DATABASE_URL` | `postgresql+asyncpg://user:pass@host.neon.tech/neondb?ssl=require` |
| `ANTHROPIC_API_KEY` | Your Anthropic API key (`sk-ant-api03-...`) |
| `CORS_ORIGINS` | Additional allowed origins, comma-separated (optional) |

> **DSN format**: `PG_DSN` uses psycopg2 syntax (`sslmode=require`); `DATABASE_URL` uses asyncpg syntax (`postgresql+asyncpg://` prefix + `ssl=require`). Both require `?` before query params — a missing `?` produces `"db":false` in `/healthz`.

### Frontend → Vercel

Connect the GitHub repo to Vercel. Required environment variable:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://nextgenai-5bf8.onrender.com` |

---

## Frontend Pages

| Route | Description |
|---|---|
| `/` | Main chat interface: ChatPanel, GraphViewer (domain-aware, collapsible), AgentTimeline |
| `/agent` | Agent architecture viewer — STATE MACHINE, LLM ROUTING, INTENT & TOOLS, REQUEST FLOW |
| `/dashboard` | Five-tab analytics dashboard with domain-aware tabs and labels |
| `/diagram` | Architecture diagrams: MVP stack and enterprise scale (Mermaid) |
| `/data` | Kaggle dataset showcase with schema details |
| `/review` | Architecture review and learning guide |
| `/examples` | Pre-built example queries (aircraft domain) + Industry Use Cases with client CTA |
| `/medical-examples` | 14 clinical example queries (medical domain) |
| `/faq` | Frequently asked questions |

---

## Navigation

Every page shares a global `AppHeader` rendered by `layout.tsx`. It contains:
- NEXTAGENTAI branding and tool status indicators (VECTOR / SQL / GRAPH)
- **NAVIGATE** dropdown — links to all pages (HOME, DASHBOARD, DATA, REVIEW, EXAMPLES, MED-EX, **INDUSTRIES**, AGENT, DIAGRAM, FAQ)
- **Domain switcher** — toggle between Aircraft and Medical modes

Each page's own sub-header contains only page-specific content (back link, subtitle, status info). The NAVIGATE dropdown and DomainSwitcher are **not** duplicated in sub-headers — only in the global AppHeader.

---

## Domain Switcher

The domain toggle (aircraft / medical) appears in the global header. Switching domains changes:

- **Chat panel** — system prompt, query placeholder, and disclaimer text
- **Knowledge graph** — shows aircraft SCADA graph or clinical knowledge graph
- **Dashboard tabs** — relabelled for the active domain (e.g. "INCIDENT EXPLORER" → "CASE EXPLORER", "DEFECT ANALYTICS" → "DISEASE ANALYTICS")
- **Domain banner** — coloured strip beneath the dashboard header indicating active mode
- **Backend routing** — queries POST to `/query` or `/query/medical` based on active domain

Domain selection is persisted to `localStorage`.

Each domain maintains its own isolated session. Switching between Aircraft and Medical restores the previous conversation, session ID, conversation history, and knowledge graph for that domain — no data bleeds across domains.

---

## Key Design Decisions

- **CORS**: `allow_origins` uses an explicit list (never `"*"`) because `allow_credentials=True` + wildcard is illegal per the Fetch spec. Add extra origins via `CORS_ORIGINS` env var.
- **SQL guardrails**: The SQL tool rejects any statement that is not a `SELECT`. DDL and DML are blocked at parse time.
- **Mermaid theming**: Each diagram carries its own `%%{init}%%` directive so theme variables are applied per-render without re-calling `mermaid.initialize()` (which corrupts parser state).
- **Render cold starts**: The frontend pings `GET /healthz` on mount to wake the backend before the user submits a query, since GET requests have no CORS preflight.
- **Dual-pipeline seeding**: `entrypoint.sh` runs aircraft and medical seeding as independent steps — each checks its own table row count so neither blocks the other.
- **IVFFlat vs HNSW**: Aircraft embeddings use HNSW (better recall, higher build cost); medical embeddings use IVFFlat with `lists=100` (faster build for ~800 synthetic chunks).
- **Synthetic medical data**: If MACCROBAT CSV is not present at ingest time, the pipeline generates 200 realistic clinical cases across 5 specialties (Cardiac, Respiratory, Neurological, GI, Musculoskeletal) with realistic NER entity distributions.
- **LLM tiering**: Haiku handles classify/plan/verify (fast, JSON-only tasks); Sonnet handles synthesis (quality matters). This brings typical query latency from ~18s to ~10s.
- **Knowledge graph fallback**: `graph_path` is always returned as `{nodes:[], edges:[]}` (never null). `GraphViewer` checks `nodes.length > 0` to decide whether to show live or mock graph data.
- **`anthropic` SDK version**: backend requires `>=0.49.0` for `AsyncAnthropic`. Running `0.40.0` silently breaks synthesis and returns no claims/confidence scores.
- **GraphViewer memoization**: `graphPath` and `vectorHitsForGraph` are wrapped in `useMemo` to prevent the ReactFlow `StoreUpdater` infinite re-render loop.
- **Synthetic graph grid layout**: when the backend returns no graph nodes, `GraphViewer` builds a synthetic graph from vector hits and displays chunk nodes in a `ceil(sqrt(n))`-column grid.
- **Render DSN format**: `PG_DSN` uses `postgresql://` + `sslmode=require`; `DATABASE_URL` uses `postgresql+asyncpg://` + `ssl=require`. Values are not interchangeable — swapping them causes auth failures. No line-breaks in hostname when copy-pasting from Neon.
- **Seed check (dual-table)**: `entrypoint.sh` checks both `incident_reports AND incident_embeddings` (aircraft) and `medical_cases AND medical_embeddings` (medical). Re-seeds if either table is empty — prevents queries returning 0 results after a schema reset.
- **AgentTimeline expand**: each tool step is click-to-expand. Vector hits display min-max normalised scores + score bar (raw cosine values ~0.01 from synthetic template data are meaningless absolute values). SQL results rendered as a scrollable table.
- **Claim confidence as %**: displayed as integer percentage (`15%`) with colour thresholds `≥70%` green / `≥40%` amber / else red. Text wraps to 2 lines.
- **ChatPanel retry on 502**: 3-attempt retry loop with 4s delay for transient Render cold-start 502/preflight failures. Shows amber "retrying..." banner. Non-network errors (4xx) are not retried.
- **Clear button**: Trash2 icon appears in the input row once messages exist. Resets chat, graph, timeline, and input in one click.
- **Stale cache skip**: `orchestrator._check_query_cache()` skips cached entries with `claims: []` — ensures degraded responses cached during DB outages are replaced on next query.
- **Shared AppHeader**: `layout.tsx` renders `<AppHeader />` above all pages. The dashboard outer container uses `height: calc(100vh - 46px)` (not `100vh`) to stay within viewport. Page sub-headers must not duplicate the global NavDropdown or DomainSwitcher.
- **Domain session isolation**: each domain (aircraft / medical) has its own messages, session ID, conversation history, and run data. Switching domains saves the current state and restores the previous state for the target domain, including graph and timeline.
- **Graph completeness**: `GraphViewer` supplements the backend `graph_path` with any vector-hit chunk nodes not already present — ensuring all retrieved chunks are visible in the knowledge graph.
- **ExportModal (PDF)**: `ExportModal` is loaded via `next/dynamic` with `ssr: false` because `@react-pdf/renderer` uses browser canvas APIs at module load time and cannot be server-rendered.
- **Frontend dev mode**: `npm run dev` uses `--webpack` due to a Turbopack panic in Next.js 16 when `/_app` is resolved in an App Router project. Production `next build` is unaffected.
