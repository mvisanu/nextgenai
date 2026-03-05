# BACKEND.md — NextAgentAI Backend Architecture Handoff

**Version:** 1.0.0
**Date:** 2026-03-04
**For:** Frontend developer agent

---

## Overview

NextAgentAI is a portfolio-grade agentic AI system that answers manufacturing and maintenance questions by orchestrating vector search, GraphRAG, and SQL tools in a single agent loop. The backend is built with FastAPI + SQLAlchemy + pgvector and uses Anthropic's `claude-sonnet-4-6` as the LLM.

**Key architectural decisions:**
- Single PostgreSQL database (with pgvector extension) for all persistence: embeddings, graph, SQL data, agent runs
- Local sentence-transformers embeddings (`all-MiniLM-L6-v2`, 384-dim) — no external embedding API needed
- Agent is a deterministic state machine: CLASSIFY → PLAN → EXECUTE → EXPAND_GRAPH → RE_RANK → SYNTHESISE → VERIFY → SAVE
- No authentication/RLS — this is a portfolio demo with no multi-tenancy
- CORS open to `http://localhost:3000` (Next.js dev) and configurable Vercel origin

---

## Stack and Dependencies

| Component | Technology | Version |
|---|---|---|
| Language | Python | 3.11+ |
| Web framework | FastAPI + uvicorn | 0.115.6 / 0.32.1 |
| ORM | SQLAlchemy (async) | 2.0.36 |
| Migrations | Alembic | 1.14.0 |
| DB driver | psycopg2-binary + asyncpg | 2.9.10 / 0.30.0 |
| Vector DB | PostgreSQL + pgvector | pg16 / 0.3.6 |
| LLM | Anthropic claude-sonnet-4-6 | 0.40.0 |
| Embeddings | sentence-transformers/all-MiniLM-L6-v2 | 3.3.1 |
| NLP | spaCy en_core_web_sm | 3.8.3 |
| Tokenizer | tiktoken (cl100k_base) | 0.8.0 |
| Data loading | kagglehub + pandas | 0.3.6 / 2.2.3 |
| Validation | Pydantic v2 + pydantic-settings | 2.10.4 / 2.7.0 |
| Logging | python-json-logger | 3.2.1 |

---

## Database Schema

### PostgreSQL + pgvector (7 tables)

All tables use `TEXT` primary keys (UUIDs as strings).

```
incident_reports
├── incident_id    TEXT PK
├── asset_id       TEXT (indexed)
├── system         TEXT
├── sub_system     TEXT
├── event_date     DATE (indexed)
├── location       TEXT
├── severity       TEXT
├── narrative      TEXT
├── corrective_action TEXT
└── source         TEXT  DEFAULT 'synthetic'

manufacturing_defects
├── defect_id      TEXT PK
├── product        TEXT (indexed)
├── defect_type    TEXT
├── severity       TEXT
├── inspection_date DATE
├── plant          TEXT
├── lot_number     TEXT
├── action_taken   TEXT
└── source         TEXT  DEFAULT 'kaggle'

maintenance_logs
├── log_id         TEXT PK
├── asset_id       TEXT
├── ts             TIMESTAMP
├── metric_name    TEXT
├── metric_value   FLOAT
├── unit           TEXT
└── source         TEXT  DEFAULT 'kaggle'

incident_embeddings
├── embed_id       TEXT PK       ← this is the chunk_id in API responses
├── incident_id    TEXT FK → incident_reports (CASCADE)
├── chunk_index    INT
├── chunk_text     TEXT
├── embedding      vector(384)   ← IVFFlat cosine index (lists=100)
├── char_start     INT
├── char_end       INT
└── created_at     TIMESTAMP

graph_node
├── id             TEXT PK       ← prefixed: "chunk:{embed_id}" or "entity:{uuid}"
├── type           TEXT          ← 'chunk' | 'entity'
├── label          TEXT
└── properties     JSONB

graph_edge
├── id             TEXT PK
├── from_node      TEXT FK → graph_node (CASCADE) (indexed)
├── to_node        TEXT FK → graph_node (CASCADE) (indexed)
├── type           TEXT          ← 'mentions' | 'similarity' | 'co_occurrence'
├── weight         FLOAT
└── properties     JSONB

agent_runs
├── run_id         TEXT PK       ← UUID returned in QueryResponse
├── query          TEXT
├── result         JSONB         ← full QueryResponse serialised
└── created_at     TIMESTAMP
```

### Indexes
- `idx_incidents_asset_id` — `incident_reports(asset_id)`
- `idx_incidents_event_date` — `incident_reports(event_date)`
- `idx_defects_product` — `manufacturing_defects(product)`
- `idx_logs_asset_ts` — `maintenance_logs(asset_id, ts)`
- `idx_incident_embeddings_vec` — IVFFlat on `incident_embeddings(embedding vector_cosine_ops)` with `lists=100`
- `idx_graph_edge_from` — `graph_edge(from_node)`
- `idx_graph_edge_to` — `graph_edge(to_node)`

---

## Authentication

**No authentication is implemented.** This is a portfolio demo with a single user / no tenant isolation.

All endpoints are public. To add API key auth in future, use FastAPI's `Security` dependency with an `APIKeyHeader`.

---

## Environment Variables

All variables are read from the process environment (`.env` file via `python-dotenv` or Docker `env_file`).

| Variable | Required | Description | Example |
|---|---|---|---|
| `PG_DSN` | Yes | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/nextai` |
| `DATABASE_URL` | Alias for PG_DSN | Same as above — used by some tools | Same as PG_DSN |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude | `sk-ant-...` |
| `KAGGLE_USERNAME` | Optional | Kaggle account username for dataset download | `your_username` |
| `KAGGLE_KEY` | Optional | Kaggle API key | `abcdef123...` |
| `POSTGRES_DB` | Docker only | DB name for docker-compose postgres service | `nextai` |
| `POSTGRES_USER` | Docker only | DB user for docker-compose postgres service | `postgres` |
| `POSTGRES_PASSWORD` | Docker only | DB password for docker-compose postgres service | `postgres` |
| `LLM_MODEL` | Optional | Override the LLM model (default: claude-sonnet-4-6) | `claude-sonnet-4-6` |

**Neon (external deployment):**
```
PG_DSN=postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/nextai?sslmode=require
DATABASE_URL=postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/nextai?sslmode=require
```
Note: asyncpg driver strips `sslmode=require` automatically; psycopg2 keeps it.

---

## Local Dev Setup

### Option 1: Docker Compose (recommended — single command)

Prerequisites: Docker Desktop installed.

```bash
# 1. Clone the repo
git clone https://github.com/your-username/NextAgentAI.git
cd NextAgentAI

# 2. Copy and fill in environment variables
cp .env.example .env
# Edit .env: set ANTHROPIC_API_KEY at minimum
# Kaggle credentials optional (seed CSVs are used as fallback)

# 3. Start all services (postgres + backend + frontend)
docker compose up

# Services start on:
#   PostgreSQL:  localhost:5432
#   Backend API: http://localhost:8000
#   Frontend:    http://localhost:3000

# 4. On first start, the entrypoint.sh detects empty tables and
#    auto-triggers the ingest pipeline (~3-5 minutes). Watch logs:
docker compose logs -f backend
```

### Option 2: Local Python (no Docker)

Prerequisites: Python 3.11+, PostgreSQL 16 with pgvector extension.

```bash
# 1. Set up PostgreSQL with pgvector
# macOS: brew install postgresql pgvector
# Linux: apt install postgresql && pip install pgvector

# 2. Create database and enable extension
psql -U postgres -c "CREATE DATABASE nextai"
psql -U postgres -d nextai -c "CREATE EXTENSION IF NOT EXISTS vector"

# 3. Clone and configure
git clone https://github.com/your-username/NextAgentAI.git
cd NextAgentAI
cp .env.example .env
# Edit .env with your values

# 4. Install Python dependencies
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# 5. Download spaCy model
python -m spacy download en_core_web_sm

# 6. Run database migrations
export PG_DSN="postgresql://postgres:postgres@localhost:5432/nextai"
alembic upgrade head

# 7. Run the ingest pipeline
python -m src.cli ingest --config ../config.yaml
# This takes 3-5 minutes; downloads/generates ~10k rows

# 8. Start the API server
uvicorn backend.app.main:app --reload --port 8000
```

---

## API Reference

**Base URL:** `http://localhost:8000` (local dev) or `https://nextai-backend.onrender.com` (external)

**Content-Type:** `application/json` for all requests/responses.

**Error format:**
```json
{
  "detail": "Human-readable error message"
}
```

**Request size limits:**
- `POST /query`: 1 MB
- `POST /ingest`: 10 MB

---

### GET /healthz

Liveness and DB health check.

**No auth required.**

**Response 200:**
```typescript
interface HealthResponse {
  status: "ok" | "degraded";
  db: boolean;
  version: string;
}
```

**Example:**
```json
{
  "status": "ok",
  "db": true,
  "version": "1.0.0"
}
```

---

### POST /ingest

Trigger the full data ingestion pipeline as a background task.
Returns immediately (202 Accepted). Monitor backend logs for progress.

**No auth required.**

**Request body (optional):**
```typescript
interface IngestRequest {
  force?: boolean;  // unused in current implementation, reserved
}
```

**Response 202:**
```typescript
interface IngestResponse {
  status: "started";
  message: string;
}
```

**Response 409 (Conflict) — already running:**
```json
{
  "detail": "Ingest pipeline is already running. Wait for it to complete before re-triggering."
}
```

**Notes:**
- First ingest takes approximately 3–5 minutes on a modern laptop (10k incidents + embeddings + graph)
- Subsequent calls re-ingest (upsert, no duplicates)
- If Kaggle credentials are absent, falls back to `demo/seed_sql/*.csv` fixtures

---

### POST /query

Run the agent orchestrator and return a structured, cited answer.

**No auth required.**

**Request body:**
```typescript
interface QueryRequest {
  query: string;           // 3–2000 characters
  filters?: {
    system?: string;       // exact match on incident_reports.system
    severity?: string;     // exact match on incident_reports.severity
    date_range?: [string, string];  // ISO dates [from, to]
  } | null;
}
```

**Response 200:**
```typescript
interface QueryResponse {
  run_id: string;           // UUID — use GET /runs/{run_id} to re-fetch
  query: string;
  answer: string;
  claims: Claim[];
  evidence: Evidence;
  graph_path: GraphPath;
  run_summary: RunSummary;
  assumptions: string[];
  next_steps: string[];
}

interface Claim {
  text: string;
  confidence: number;        // 0.0–1.0
  citations: Citation[];
  conflict_note: string | null;
}

interface Citation {
  chunk_id: string;          // embed_id from incident_embeddings
  incident_id: string;
  char_start: number;        // character offset in chunk_text (for highlighting)
  char_end: number;
}

interface Evidence {
  vector_hits: VectorHit[];
  sql_rows: SqlResult[];
}

interface VectorHit {
  chunk_id: string;
  incident_id: string;
  score: number;             // cosine similarity 0.0–1.0
  excerpt: string;           // chunk_text
  metadata: {
    asset_id: string | null;
    system: string | null;
    severity: string | null;
    event_date: string | null;  // ISO date or null
    char_start: number | null;
    char_end: number | null;
  };
}

interface SqlResult {
  query: string;             // named query or SQL string
  columns: string[];
  rows: unknown[][];
  row_count: number;
}

interface GraphPath {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface GraphNode {
  id: string;               // "chunk:{embed_id}" or "entity:{uuid}"
  type: "chunk" | "entity";
  label: string | null;
  properties: Record<string, unknown> | null;
}

interface GraphEdge {
  id: string;
  from_node: string;
  to_node: string;
  type: "mentions" | "similarity" | "co_occurrence";
  weight: number | null;
}

interface RunSummary {
  intent: "vector_only" | "sql_only" | "hybrid" | "compute";
  plan_text: string;         // User-readable plan description
  steps: StepSummary[];
  tools_used: string[];
  total_latency_ms: number;
  halted_at_step_limit: boolean;
}

interface StepSummary {
  step_number: number;
  tool_name: string;
  output_summary: string;
  latency_ms: number;
  error: string | null;
}
```

**Response 500:**
```json
{
  "detail": "Agent error: <error message>"
}
```

**Notes:**
- P90 latency is approximately 10–25 seconds for hybrid queries (LLM calls are sequential)
- `run_id` is persisted in the `agent_runs` table and can be retrieved with `GET /runs/{run_id}`
- `graph_path.nodes` is capped at 100 nodes; `graph_path.edges` at 200 edges for response size

---

### GET /runs/{run_id}

Retrieve the full result of a previously executed agent run.

**No auth required.**

**Path parameter:** `run_id` (UUID string)

**Response 200:**
```typescript
interface RunRecord {
  run_id: string;
  query: string;
  result: QueryResponse;   // full response object as stored
  created_at: string | null;  // ISO datetime
}
```

**Response 404:**
```json
{
  "detail": "Run '{run_id}' not found."
}
```

---

### GET /docs

List ingested incident documents with chunk counts.

**No auth required.**

**Query parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `limit` | int | 50 | Max results to return |
| `offset` | int | 0 | Pagination offset |
| `system` | string | — | Filter by system (exact match) |
| `severity` | string | — | Filter by severity (exact match) |

**Response 200:**
```typescript
type DocListResponse = DocListItem[];

interface DocListItem {
  incident_id: string;
  asset_id: string | null;
  system: string | null;
  severity: string | null;
  event_date: string | null;  // ISO date string
  source: string;              // 'synthetic' | 'kaggle'
  chunk_count: number;
}
```

---

### GET /docs/{doc_id}/chunks/{chunk_id}

Fetch a specific chunk from an incident document.
Used by the Citations drawer to show highlighted source text.

**No auth required.**

**Path parameters:**
- `doc_id`: `incident_id` from the incident_reports table
- `chunk_id`: `embed_id` from the incident_embeddings table (same as `chunk_id` in citations)

**Response 200:**
```typescript
interface ChunkResponse {
  chunk_id: string;           // embed_id
  incident_id: string;
  chunk_text: string;         // Full chunk text for display
  chunk_index: number;
  char_start: number;         // Highlight these offsets in chunk_text for the citation
  char_end: number;
  metadata: {
    asset_id: string | null;
    system: string | null;
    severity: string | null;
    event_date: string | null;
    source: string;
  };
}
```

**Response 404:**
```json
{
  "detail": "Chunk '{chunk_id}' not found in document '{doc_id}'."
}
```

**How to use for citation highlighting:**
```typescript
// Given a citation from QueryResponse:
const citation = claim.citations[0];

// Fetch the chunk
const res = await fetch(`/docs/${citation.incident_id}/chunks/${citation.chunk_id}`);
const chunk: ChunkResponse = await res.json();

// Highlight the cited span:
const before = chunk.chunk_text.slice(0, citation.char_start);
const highlighted = chunk.chunk_text.slice(citation.char_start, citation.char_end);
const after = chunk.chunk_text.slice(citation.char_end);
```

---

## Agent Output Schema — TypeScript Interfaces (Complete)

The following is the complete canonical TypeScript interface for all frontend consumers:

```typescript
// ============================================================
// NextAgentAI — Complete Agent Output TypeScript Interfaces
// Generated from: backend/app/schemas/models.py
// ============================================================

export interface Citation {
  chunk_id: string;
  incident_id: string;
  char_start: number;
  char_end: number;
}

export interface Claim {
  text: string;
  confidence: number;        // 0.0–1.0
  citations: Citation[];
  conflict_note: string | null;
}

export interface VectorHit {
  chunk_id: string;
  incident_id: string;
  score: number;
  excerpt: string;
  metadata: {
    asset_id: string | null;
    system: string | null;
    severity: string | null;
    event_date: string | null;
    char_start: number | null;
    char_end: number | null;
  };
}

export interface SqlResult {
  query: string;
  columns: string[];
  rows: unknown[][];
  row_count: number;
}

export interface Evidence {
  vector_hits: VectorHit[];
  sql_rows: SqlResult[];
}

export interface GraphNode {
  id: string;
  type: "chunk" | "entity";
  label: string | null;
  properties: Record<string, unknown> | null;
}

export interface GraphEdge {
  id: string;
  from_node: string;
  to_node: string;
  type: "mentions" | "similarity" | "co_occurrence";
  weight: number | null;
}

export interface GraphPath {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface StepSummary {
  step_number: number;
  tool_name: string;
  output_summary: string;
  latency_ms: number;
  error: string | null;
}

export interface RunSummary {
  intent: "vector_only" | "sql_only" | "hybrid" | "compute";
  plan_text: string;
  steps: StepSummary[];
  tools_used: string[];
  total_latency_ms: number;
  halted_at_step_limit: boolean;
}

export interface QueryRequest {
  query: string;
  filters?: {
    system?: string;
    severity?: string;
    date_range?: [string, string];
  } | null;
}

export interface QueryResponse {
  run_id: string;
  query: string;
  answer: string;
  claims: Claim[];
  evidence: Evidence;
  graph_path: GraphPath;
  run_summary: RunSummary;
  assumptions: string[];
  next_steps: string[];
}

export interface ChunkResponse {
  chunk_id: string;
  incident_id: string;
  chunk_text: string;
  chunk_index: number;
  char_start: number;
  char_end: number;
  metadata: {
    asset_id: string | null;
    system: string | null;
    severity: string | null;
    event_date: string | null;
    source: string;
  };
}

export interface DocListItem {
  incident_id: string;
  asset_id: string | null;
  system: string | null;
  severity: string | null;
  event_date: string | null;
  source: string;
  chunk_count: number;
}

export interface IngestResponse {
  status: "started" | "already_running" | "complete" | "failed";
  message: string;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  db: boolean;
  version: string;
}

export interface RunRecord {
  run_id: string;
  query: string;
  result: QueryResponse;
  created_at: string | null;
}
```

---

## Business Logic Modules

All business logic lives under `backend/app/`:

| Module | File | Key Functions |
|---|---|---|
| Chunker | `rag/chunker.py` | `chunk_text(text, chunk_size=400, overlap=75)` |
| Embeddings | `rag/embeddings.py` | `EmbeddingModel.get().encode(texts)` — singleton |
| Retrieval | `rag/retrieval.py` | `vector_search(session, query_embedding, top_k, filters)` |
| Graph builder | `graph/builder.py` | `extract_entities(text)`, `build_graph(session)` |
| Graph expander | `graph/expander.py` | `expand_graph(session, seed_ids, k=2)` |
| Graph scorer | `graph/scorer.py` | `rank_evidence(vector_hits, graph_nodes, graph_edges)` |
| SQL tool | `tools/sql_tool.py` | `SQLQueryTool.run(sql)`, `run_named(name, params)` |
| Vector tool | `tools/vector_tool.py` | `VectorSearchTool.run(query_text, filters, top_k)` |
| Compute tool | `tools/compute_tool.py` | `PythonComputeTool.run(code, context)` |
| Intent | `agent/intent.py` | `classify_intent(query, llm)` |
| Planner | `agent/planner.py` | `generate_plan(query, intent, llm)` |
| Verifier | `agent/verifier.py` | `verify_claims(claims, evidence, llm)` |
| Orchestrator | `agent/orchestrator.py` | `AgentOrchestrator.run(query)` |
| LLM client | `llm/client.py` | `ClaudeClient.complete(prompt, system, json_mode)` |
| Logging | `observability/logging.py` | `get_logger(__name__)` |

---

## CORS Configuration

The backend allows the following origins:
- `http://localhost:3000` (Next.js dev server)
- `http://127.0.0.1:3000`
- `https://next-agent-ai.vercel.app` (update with your actual Vercel URL in `backend/app/main.py`)
- `*` (temporarily open for demo; restrict before any production use)

The CORS configuration is in `backend/app/main.py` → `CORS_ORIGINS` list.

---

## How to Run Tests

```bash
# From the backend/ directory
cd backend

# Run all unit tests (fast, no DB needed)
pytest

# Run with verbose output
pytest -v

# Run a specific test file
pytest tests/test_sql_guardrails.py
pytest tests/test_vector_retrieval.py
pytest tests/test_agent_router.py

# Run integration tests (requires DB + ingested data)
pytest -m integration

# Run everything including integration tests
pytest -m "" --ignore=tests/test_vector_retrieval.py  # exclude slow embedding tests
pytest -m "not integration"  # unit tests only (default)
```

**Test coverage by file:**

| File | What it covers | DB required |
|---|---|---|
| `test_sql_guardrails.py` | Regex guardrail: all DML/DDL blocked, valid SELECT passes | No |
| `test_vector_retrieval.py` | Chunker, embedding shape/normalization, vector search ordering | Embedding: No; `@pytest.mark.integration`: Yes |
| `test_agent_router.py` | Intent routing patterns, planner fallback, mock LLM responses | No |

---

## Setup and Migration Commands Reference

```bash
# Run all pending migrations
alembic upgrade head

# Check current migration revision
alembic current

# Generate a new migration after model changes
alembic revision --autogenerate -m "description"

# Downgrade one revision
alembic downgrade -1

# View migration history
alembic history --verbose
```

---

## External Deployment (Neon + Render + Vercel)

### Step 1: Neon Database
1. Sign up at [neon.tech](https://neon.tech/) (free tier)
2. Create a new project → copy the connection string
3. Enable pgvector: run `CREATE EXTENSION IF NOT EXISTS vector;` in the Neon SQL editor
4. Run migrations against Neon:
   ```bash
   PG_DSN="postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/nextai?sslmode=require" \
   alembic upgrade head
   ```

### Step 2: Render Backend
1. Push this repo to GitHub
2. Sign up at [render.com](https://render.com/) → "New Web Service" → "Deploy from GitHub"
3. Render auto-detects `render.yaml` — select the `nextai-backend` service
4. Set environment secrets in the Render dashboard:
   - `PG_DSN` = Neon connection string
   - `DATABASE_URL` = same as PG_DSN
   - `ANTHROPIC_API_KEY` = your key
5. Deploy — the backend URL will be `https://nextai-backend.onrender.com`

### Step 3: Vercel Frontend
1. Sign up at [vercel.com](https://vercel.com/) → "New Project" → import from GitHub
2. Set environment variable: `NEXT_PUBLIC_API_URL=https://nextai-backend.onrender.com`
3. Deploy

### Step 4: Trigger Ingest on External Deploy
After the Render backend is running:
```bash
curl -X POST https://nextai-backend.onrender.com/ingest
```
Or use the UI's ingest button. The pipeline runs in the background (~5 min).

---

## Known Limitations and Constraints

### Render Free Tier Spin-Down
Render free web services spin down after 15 minutes of inactivity and take approximately 30–50 seconds to cold-start on the next request. The frontend should:
- Show a "warming up..." spinner if `GET /healthz` returns non-OK for more than 5 seconds
- Retry `POST /query` once if it fails within the first 60 seconds of a session

### Embedding Model Cold Start
The sentence-transformers model (`all-MiniLM-L6-v2`) is pre-downloaded in the Dockerfile layer and should be available immediately. However, the first `EmbeddingModel.get()` call loads it into memory (~90MB), which takes 2–5 seconds on Render's free tier. Subsequent calls are instant.

### IVFFlat Index Requirement
The IVFFlat vector index requires the table to have data before it can be efficiently queried. Running vector search against an empty `incident_embeddings` table will work but will do a full table scan (slower). Trigger ingest first.

### Graph Size Cap
The `expand_graph` function caps at 500 nodes to prevent memory issues. The `QueryResponse.graph_path` is further capped at 100 nodes / 200 edges for response size. For React Flow rendering, this is more than sufficient.

### PythonComputeTool Sandbox
The compute tool sandbox uses Python's `threading` module for timeout enforcement. The `signal.alarm` POSIX-based timeout is available on Linux (production) but not on Windows (dev). On Windows, the execution timeout is not enforced at the OS level — rely on the 5-second thread join timeout.

### Kaggle Datasets
Without `KAGGLE_USERNAME` / `KAGGLE_KEY`, the system falls back to `demo/seed_sql/*.csv` fixtures with ~25 rows per dataset. Vector search and graph features work fully with synthetic incidents (10k rows), but SQL aggregation queries will return minimal data from the seed fixtures.

### Agent Latency
Agent end-to-end latency for hybrid queries is approximately 10–30 seconds due to sequential LLM calls (intent → plan → synthesise → verify). This is acceptable for a demo but would need streaming (SSE) for production UX. The `run_summary.total_latency_ms` field tracks total latency precisely.

### No Streaming
The current implementation returns the full response in one HTTP call. The PRD lists SSE streaming as post-MVP. For now, the frontend should show a loading state while waiting for `POST /query` to complete.

---

## Open Questions for Frontend

1. **Render URL**: Update `CORS_ORIGINS` in `backend/app/main.py` with your actual Vercel deployment URL once known.

2. **Ingest button**: Should the UI expose a "Re-ingest Data" button? The endpoint is `POST /ingest` and returns immediately with 202. If yes, polling `GET /healthz` every 10 seconds while ingest runs can indicate readiness.

3. **Graph layout**: `graph_path.nodes` contains nodes with `type: "chunk" | "entity"`. Suggested React Flow rendering:
   - `chunk` nodes: blue rectangles, labelled with first 50 chars of label
   - `entity` nodes: coloured by entity type from `properties.entity_type` (asset=green, system=orange, defect_type=red)
   - Edge colour by type: mentions=grey, similarity=blue, co_occurrence=purple

4. **Citation highlighting**: Use `char_start` and `char_end` from `Citation` to highlight the cited span within `ChunkResponse.chunk_text`. These are character offsets within the chunk text, not the original full narrative.

5. **Confidence display**: Claims should be colour-coded by confidence score. FRONTEND.md Section 11 is the authoritative specification: confidence >= 0.7 = green, 0.4–0.69 = yellow, < 0.4 = red. The implementation in `CitationsDrawer.tsx` follows these thresholds.

6. **Conflict notes**: If `claim.conflict_note != null`, display it as a warning badge on the claim card.

7. **Demo queries**: The three demo queries guaranteed to work on first run:
   ```
   "Find similar incidents to: hydraulic actuator crack observed during routine inspection on Line 1"
   "Show defect trends by product and defect_type for the last 90 days"
   "Given this incident: corrosion found on avionics connector SN-482910, classify the likely defect category and recommend next maintenance action"
   ```
