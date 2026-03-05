# NextAgentAI

Dual-domain agentic intelligence platform. Ask natural-language questions over clinical case reports and aircraft/manufacturing datasets — vector search, SQL, knowledge-graph traversal, and Claude-synthesised cited answers in one industrial-grade UI.

**Live demo:** https://nextgenai-seven.vercel.app
**API:** https://nextai-backend.onrender.com/api/docs

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
│       ├── components/     # ChatPanel, GraphViewer, AgentTimeline, MermaidDiagram
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
| `PG_DSN` | Neon PostgreSQL connection string (`postgresql+asyncpg://...`) |
| `DATABASE_URL` | Same as `PG_DSN` |
| `ANTHROPIC_API_KEY` | Your Anthropic API key (`sk-ant-api03-...`) |
| `CORS_ORIGINS` | Additional allowed origins, comma-separated (optional) |

### Frontend → Vercel

Connect the GitHub repo to Vercel. Required environment variable:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://nextai-backend.onrender.com` |

---

## Frontend Pages

| Route | Description |
|---|---|
| `/` | Main chat interface: ChatPanel, GraphViewer (domain-aware, collapsible), AgentTimeline |
| `/dashboard` | Five-tab analytics dashboard with domain-aware tabs and labels |
| `/diagram` | Architecture diagrams: MVP stack and enterprise scale (Mermaid) |
| `/data` | Kaggle dataset showcase with schema details |
| `/review` | Architecture review and learning guide |
| `/examples` | Pre-built example queries (aircraft domain) |
| `/medical-examples` | 14 clinical example queries (medical domain) |
| `/faq` | Frequently asked questions |

---

## Domain Switcher

The header includes a domain toggle (aircraft / medical). Switching domains changes:

- **Chat panel** — system prompt, query placeholder, and disclaimer text
- **Knowledge graph** — shows aircraft SCADA graph or clinical knowledge graph
- **Dashboard tabs** — relabelled for the active domain (e.g. "INCIDENT EXPLORER" → "CASE EXPLORER", "DEFECT ANALYTICS" → "DISEASE ANALYTICS")
- **Domain banner** — coloured strip beneath the dashboard header indicating active mode
- **Backend routing** — queries POST to `/query` or `/query/medical` based on active domain

Domain selection is persisted to `localStorage`.

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
