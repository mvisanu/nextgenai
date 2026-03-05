# Product Requirements Document
## NextAgentAI — Agentic Manufacturing Intelligence MVP
**Version:** 1.0
**Date:** 2026-03-04
**Status:** Draft

---

## 1. Executive Summary

NextAgentAI is a portfolio-grade agentic AI system that answers complex manufacturing and maintenance questions by orchestrating vector search, GraphRAG, and SQL tools in a single coherent workflow. It ingests three complementary datasets — synthetic incident narratives, real Kaggle manufacturing defects, and aircraft maintenance logs — stores them in PostgreSQL with pgvector, and exposes both a CLI and a Next.js web UI.

The system is designed to demonstrate mastery of the full modern AI stack: agentic tool-calling with Anthropic Claude, GraphRAG with k-hop neighbourhood expansion, vector similarity search, and structured SQL reasoning — all in one reproducible, open-source MVP.

---

## 2. Problem Statement

Quality engineers, maintenance planners, and plant managers work across three disconnected data silos:

1. **Incident narratives** — free-text reports describing defects, causes, and corrective actions
2. **Structured defect records** — inspections with product, type, severity, and disposition
3. **Time-series maintenance logs** — sensor readings and maintenance events per asset

No existing lightweight tool unifies these three modalities, allows natural-language querying across all three, surfaces *why* an answer was produced (citations + reasoning graph), or supports multi-hop analytical queries (e.g., "Which hydraulics subsystem has the highest defect recurrence correlated with missed maintenance intervals?").

---

## 3. Goals & Objectives

### Technical Goals
- Implement a full agentic loop: **plan → select tools → execute → verify → synthesise**
- Demonstrate GraphRAG with k-hop graph expansion, edge weights, and confidence-scored claims
- Use only local embeddings (no external embedding API) for full offline capability
- Abstract LLM calls behind a `LLMClient` interface defaulting to `claude-sonnet-4-6`

### Learning Goals
- Deep understanding of how vector search, graph expansion, SQL tool-calling, and LLM synthesis compose into a single agent
- Hands-on experience with pgvector, SQLAlchemy + Alembic, and structured LLM outputs (JSON mode)

### Success Metrics (Demo Acceptance)
- A multi-hop question produces a visible plan and executes >1 tool call
- Every claim in the answer carries a citation (`doc_id + chunk_id + char span`) and a confidence score (0.0–1.0)
- The UI renders a graph path for each agent run
- Local dev: `docker compose up` → demo works from a fresh clone with zero manual steps
- External demo: all three demo queries work from the public Vercel URL hitting the Render backend connected to Neon

---

## 4. Target Audience

### Primary Personas (Demo Characters)
| Persona | Role | Key Query Type |
|---|---|---|
| Quality Engineer | Investigates recurring defects on a production line | "Find incidents similar to this defect description; what's the likely root cause?" |
| Maintenance Planner | Schedules preventive work based on failure trends | "Show maintenance event trends for asset ASSET-247 over the last 90 days" |
| Plant Manager | Reviews operational risk across assets and product lines | "Which product lines have the highest critical defect rates this quarter?" |

### Actual Audience
Technical recruiters, engineering hiring panels, and peer engineers evaluating the portfolio. The UI and README must tell a clear story without requiring explanation.

### Anti-Personas
- End customers of a real manufacturing company (this is not a production SaaS)
- Non-technical stakeholders (no executive dashboard or simplified UX needed)

---

## 5. Product Scope

### In Scope (MVP)
- Ingest pipeline for three datasets (Kaggle + synthetic) with column mapping to canonical schemas
- PostgreSQL + pgvector as the single persistence layer (chunks, graph, SQL demo data)
- Local sentence-transformers embeddings (`all-MiniLM-L6-v2`, 384-dim — update `vector(384)` in schema)
- Full GraphRAG: entity extraction at ingest, graph node/edge storage, k-hop expansion at query time
- Agent orchestrator with: intent classifier, planner, tool executor, verifier, synthesiser
- Three tools: `VectorSearchTool`, `SQLQueryTool` (SELECT-only), `PythonComputeTool` (sandboxed)
- CLI: `ingest`, `ask` subcommands
- Web UI: chat panel, agent timeline, graph viewer (React Flow), citations drawer
- shadcn/ui component library (via MCP) for all frontend components
- `docker compose up` single-command local development startup
- External cloud deployment: Neon (database) + Render (backend) + Vercel (frontend) — all free tiers
- Structured JSON logging of every agent run (steps, tool calls, citations, graph path)

### In Scope (Post-MVP)
- PDF ingestion (currently TXT/MD/CSV only)
- Web fetch tool (togglable)
- Multi-tenant auth (API key per user)
- Real-time streaming of agent steps to UI via SSE
- Node centrality scoring in graph re-ranking

### Out of Scope
- Production deployment, scaling, or security hardening
- Multi-organisation data isolation
- Mobile UI
- Fine-tuning any model

---

## 6. Feature Requirements

### F1 — Data Ingestion Pipeline

**Description:** Load three datasets into PostgreSQL, generate synthetic incident narratives if not present, chunk narratives, embed chunks, and build the knowledge graph.

**User Story:** As a developer, I want to run one command that ingests all data so the system is query-ready.

**Acceptance Criteria:**
- `python -m src.cli ingest --config config.yaml` completes without errors
- Synthetic incident narratives are auto-generated (10,000 rows) if no CSV is found at the configured path
- Real Kaggle data downloaded via `kagglehub` and column-mapped to canonical schemas
- All three canonical tables populated in Postgres
- `incident_embeddings` table populated with 384-dim vectors (chunk size ~300–600 tokens, overlap 50–100 tokens)
- Graph nodes created for: entities (asset, system, subsystem, product, defect type), document chunks
- Graph edges created for: chunk→entity (mentions), entity→entity (co-occurrence), chunk→chunk (similarity > threshold)

**Datasets:**
| Dataset | Kaggle Slug | Maps To |
|---|---|---|
| Manufacturing Defects | `fahmidachowdhury/manufacturing-defects` | `manufacturing_defects` |
| Aircraft Maintenance (2012–2017) | `merishnasuwal/aircraft-historical-maintenance-dataset` | `maintenance_logs` |
| Predicting Manufacturing Defects | `rabieelkharoua/predicting-manufacturing-defects-dataset` | `manufacturing_defects` (supplemental) |
| Incident Narratives | synthetic (generated) | `incident_reports` |

---

### F2 — Vector Search Tool

**Description:** Embed a query, retrieve top-k similar incident narrative chunks via cosine similarity on pgvector, return scored excerpts.

**User Story:** As a quality engineer, I want to find past incidents similar to a defect I'm investigating.

**Acceptance Criteria:**
- `VectorSearchTool(query_text, filters={}, top_k=8)` returns chunks with: `chunk_id`, `incident_id`, `score`, `excerpt`, `metadata`
- Optional filters: `system`, `severity`, `date_range`
- Uses IVFFlat index (`lists=100`) on `embedding vector_cosine_ops`
- Returns results in < 500ms on local hardware for 10k records

---

### F3 — SQL Query Tool

**Description:** Execute read-only SQL against Postgres; enforce SELECT-only guardrail.

**User Story:** As a plant manager, I want to query defect trends without writing SQL myself.

**Acceptance Criteria:**
- `SQLQueryTool(sql)` rejects any statement containing `DROP`, `DELETE`, `UPDATE`, `INSERT`, `CREATE`, `ALTER`, `TRUNCATE` (case-insensitive, with regex)
- Returns: column names, rows, row count
- Pre-built named queries available: defect counts by product+type (last N days), severity distribution, maintenance trends by event type, incidents×defects join

---

### F4 — Agent Orchestrator

**Description:** Deterministic state machine that classifies intent, plans tool calls, executes tools, verifies claims, and synthesises a cited answer.

**User Story:** As any persona, I want to ask a natural language question and receive a grounded, cited answer with visible reasoning.

**Acceptance Criteria:**
- Intent classified as one of: `vector_only`, `sql_only`, `hybrid`, `compute`
- Plan generated and returned as user-visible text before execution begins
- Tool calls logged with: tool name, inputs, outputs summary, latency, errors
- Each claim in the final answer has: `citation[]` (chunk_id + char span) and `confidence` (0.0–1.0)
- If insufficient evidence found: agent states what was searched and proposes next steps
- Max 10 tool-call steps per run; timeout enforced per tool

**Output Schema:**
```json
{
  "answer": "...",
  "claims": [{"text": "...", "confidence": 0.87, "citations": [...]}],
  "evidence": {"vector_hits": [...], "sql_rows": [...]},
  "graph_path": {"nodes": [...], "edges": [...]},
  "run_summary": {"steps": [...], "tools_used": [...], "total_latency_ms": 0},
  "assumptions": [...],
  "next_steps": [...]
}
```

---

### F5 — GraphRAG

**Description:** At query time, map retrieved chunks to entity nodes, expand k-hop neighbourhood, re-rank by similarity + edge weight, and constrain answer generation to the evidence set.

**User Story:** As a technical reviewer, I want to see the graph reasoning path the agent followed.

**Acceptance Criteria:**
- Graph built during ingestion: nodes for entities + chunks, edges for mentions + similarity
- At query time: top-k chunks → entity nodes → k=1..2 hop expansion → re-ranked evidence set
- Answer generation explicitly constrained to the evidence set (no hallucination beyond retrieved context)
- Citations reference `incident_id + chunk_id + char_start + char_end`
- Conflicting sources reduce claim confidence and surface the conflict explicitly

---

### F6 — CLI

**Description:** Developer-facing command-line interface.

**Acceptance Criteria:**
- `python -m src.cli ingest --config config.yaml`
- `python -m src.cli ask "Find similar incidents to: hydraulic actuator crack on Line 1"`
- `python -m src.cli ask "Show defect trends by product for last 90 days"`
- `python -m src.cli ask "Given this incident text, classify defect and recommend action: <text>"`
- Output formatted as readable text with evidence section

---

### F7 — Web UI

**Description:** Next.js App Router frontend with four panels.

**Tech:** Next.js + TypeScript + shadcn/ui (via MCP) + React Flow (graph)

**Acceptance Criteria:**
- **Chat panel** — submit query, stream answer text
- **Agent timeline** — show each step: intent, plan, tool calls (name + latency), verification
- **Graph viewer** — React Flow renders `graph_path` nodes/edges; clicking a node shows related chunks in a tooltip/drawer
- **Citations drawer** — clicking any citation opens the source chunk text with the cited span highlighted
- All components built with shadcn/ui primitives

---

## 7. Data Model

### PostgreSQL Schema

```sql
-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE incident_reports (
  incident_id       TEXT PRIMARY KEY,
  asset_id          TEXT,
  system            TEXT,
  sub_system        TEXT,
  event_date        DATE,
  location          TEXT,
  severity          TEXT,
  narrative         TEXT,
  corrective_action TEXT,
  source            TEXT DEFAULT 'synthetic'
);

CREATE TABLE manufacturing_defects (
  defect_id        TEXT PRIMARY KEY,
  product          TEXT,
  defect_type      TEXT,
  severity         TEXT,
  inspection_date  DATE,
  plant            TEXT,
  lot_number       TEXT,
  action_taken     TEXT,
  source           TEXT DEFAULT 'kaggle'
);

CREATE TABLE maintenance_logs (
  log_id       TEXT PRIMARY KEY,
  asset_id     TEXT,
  ts           TIMESTAMP,
  metric_name  TEXT,
  metric_value DOUBLE PRECISION,
  unit         TEXT,
  source       TEXT DEFAULT 'kaggle'
);

-- Chunks + embeddings (384-dim for all-MiniLM-L6-v2)
CREATE TABLE incident_embeddings (
  embed_id    TEXT PRIMARY KEY,
  incident_id TEXT REFERENCES incident_reports(incident_id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  chunk_text  TEXT NOT NULL,
  embedding   vector(384),
  created_at  TIMESTAMP DEFAULT NOW()
);

-- Knowledge graph
CREATE TABLE graph_node (
  id         TEXT PRIMARY KEY,
  type       TEXT,   -- 'entity' | 'chunk'
  label      TEXT,
  properties JSONB
);

CREATE TABLE graph_edge (
  id        TEXT PRIMARY KEY,
  from_node TEXT REFERENCES graph_node(id),
  to_node   TEXT REFERENCES graph_node(id),
  type      TEXT,   -- 'mentions' | 'similarity' | 'co_occurrence'
  weight    FLOAT,
  properties JSONB
);

-- Agent run storage
CREATE TABLE agent_runs (
  run_id     TEXT PRIMARY KEY,
  query      TEXT,
  result     JSONB,  -- full output schema
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_incident_embeddings_vec ON incident_embeddings
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_incidents_asset_id ON incident_reports(asset_id);
CREATE INDEX idx_incidents_event_date ON incident_reports(event_date);
CREATE INDEX idx_defects_product ON manufacturing_defects(product);
CREATE INDEX idx_logs_asset_ts ON maintenance_logs(asset_id, ts);
CREATE INDEX idx_graph_edge_from ON graph_edge(from_node);
CREATE INDEX idx_graph_edge_to ON graph_edge(to_node);
```

---

## 8. Repo Structure

```
NextAgentAI/
├── backend/
│   ├── app/
│   │   ├── main.py                    # FastAPI app factory
│   │   ├── api/
│   │   │   ├── ingest.py              # POST /ingest
│   │   │   ├── query.py               # POST /query, GET /runs/{run_id}
│   │   │   └── docs.py                # GET /docs, GET /docs/{id}/chunks/{id}
│   │   ├── agent/
│   │   │   ├── orchestrator.py        # State machine (plan→execute→verify→synthesise)
│   │   │   ├── intent.py              # Intent classifier
│   │   │   ├── planner.py             # Plan generation
│   │   │   └── verifier.py            # Claim verification + confidence scoring
│   │   ├── rag/
│   │   │   ├── chunker.py             # Token-aware chunking with overlap
│   │   │   ├── embeddings.py          # Local sentence-transformers wrapper
│   │   │   └── retrieval.py           # pgvector cosine search
│   │   ├── graph/
│   │   │   ├── builder.py             # Entity extraction + graph construction at ingest
│   │   │   ├── expander.py            # k-hop neighbourhood expansion
│   │   │   └── scorer.py              # Re-ranking: similarity + edge weight + recency
│   │   ├── tools/
│   │   │   ├── vector_tool.py         # VectorSearchTool
│   │   │   ├── sql_tool.py            # SQLQueryTool (SELECT-only guardrail)
│   │   │   └── compute_tool.py        # PythonComputeTool (sandboxed exec)
│   │   ├── ingest/
│   │   │   ├── pipeline.py            # Orchestrates all ingest steps
│   │   │   ├── kaggle_loader.py       # kagglehub download + column mapping
│   │   │   └── synthetic.py           # Synthetic incident narrative generator
│   │   ├── db/
│   │   │   ├── models.py              # SQLAlchemy ORM models
│   │   │   ├── session.py             # DB connection / session factory
│   │   │   └── migrations/            # Alembic migrations
│   │   ├── schemas/                   # Pydantic request/response schemas
│   │   ├── llm/
│   │   │   └── client.py              # LLMClient interface + Claude adapter
│   │   └── observability/
│   │       └── logging.py             # Structured JSON logging
│   ├── src/
│   │   └── cli.py                     # python -m src.cli entrypoint
│   ├── tests/
│   │   ├── test_sql_guardrails.py
│   │   ├── test_vector_retrieval.py
│   │   └── test_agent_router.py
│   ├── Dockerfile                     # Used for both local Docker and Render deployment
│   └── requirements.txt
├── frontend/
│   ├── app/                           # Next.js App Router
│   │   ├── page.tsx                   # Main layout (4-panel)
│   │   ├── components/
│   │   │   ├── ChatPanel.tsx
│   │   │   ├── AgentTimeline.tsx
│   │   │   ├── GraphViewer.tsx        # React Flow graph
│   │   │   └── CitationsDrawer.tsx
│   │   └── lib/
│   │       └── api.ts                 # Typed API client
│   ├── Dockerfile
│   └── package.json
├── demo/
│   ├── docs/                          # 10 sample markdown docs for demo
│   └── seed_sql/                      # Sample SQL seed if Kaggle unavailable
├── data/
│   └── synthetic/                     # Auto-generated CSVs (gitignored)
├── config.yaml                        # Dataset paths + model params
├── docker-compose.yml                 # LOCAL DEVELOPMENT ONLY (postgres + backend + frontend)
├── render.yaml                        # Render Blueprint — external backend deployment
├── vercel.json                        # Vercel config — external frontend deployment (if needed)
├── .env.example
└── README.md
```

---

## 9. API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/ingest` | Trigger full ingestion pipeline |
| `GET` | `/docs` | List ingested documents |
| `GET` | `/docs/{doc_id}/chunks/{chunk_id}` | Fetch chunk text + metadata |
| `POST` | `/query` | Run agent with GraphRAG; returns full output schema |
| `GET` | `/runs/{run_id}` | Fetch stored agent run trace |
| `POST` | `/sql/run` | (Internal) Execute read-only SQL |

---

## 10. Technical Stack

| Layer | Choice | Rationale |
|---|---|---|
| LLM | `claude-sonnet-4-6` via Anthropic API | Structured JSON output, tool-use, strong reasoning |
| Embeddings | `sentence-transformers/all-MiniLM-L6-v2` (384-dim) | Local, no API key, fast |
| Vector DB | PostgreSQL + pgvector (IVFFlat index) | Single DB for all persistence |
| Graph DB | PostgreSQL `graph_node` + `graph_edge` tables | MVP simplicity; no Neo4j overhead |
| Backend | FastAPI + SQLAlchemy + Alembic | Typed, async-ready, migration support |
| Frontend | Next.js App Router + TypeScript | Modern, SSR-capable |
| UI Components | shadcn/ui (via MCP) | Consistent, accessible, customisable |
| Graph Viz | React Flow | Best-in-class interactive graph for React |
| Infra (local dev) | Docker Compose (postgres + backend + frontend) | One-command local startup; `docker-compose.yml` is development-only |
| Infra (external) | Vercel (frontend) + Render (backend) + Neon (database) | Free-tier cloud deployment; auto CI/CD from GitHub push |
| Data | kagglehub + synthetic generator | Real + synthetic without manual downloads |

---

## 11. Configuration (`config.yaml`)

```yaml
database:
  dsn: "${PG_DSN}"

llm:
  provider: anthropic
  model: claude-sonnet-4-6
  max_tokens: 4096

embeddings:
  model: sentence-transformers/all-MiniLM-L6-v2
  dim: 384
  chunk_size_tokens: 400
  chunk_overlap_tokens: 75

vector_search:
  top_k: 8
  similarity_threshold: 0.75

graph:
  k_hop: 2
  edge_similarity_threshold: 0.80

agent:
  max_steps: 10
  tool_timeout_seconds: 30

datasets:
  incidents:
    synthetic: true
    synthetic_rows: 10000
    csv_path: data/synthetic/incidents_synth.csv
  defects:
    kaggle_slug: fahmidachowdhury/manufacturing-defects
    csv_path: data/kaggle/manufacturing_defects.csv
  defects_supplemental:
    kaggle_slug: rabieelkharoua/predicting-manufacturing-defects-dataset
    csv_path: data/kaggle/defects_prediction.csv
  maintenance:
    kaggle_slug: merishnasuwal/aircraft-historical-maintenance-dataset
    csv_path: data/kaggle/aircraft_maintenance.csv
```

---

## 12. Non-Functional Requirements

### Performance
- Vector search: < 500ms for 10k records
- Agent end-to-end: < 30s for hybrid queries (acceptable for demo)
- Ingest pipeline: < 5 minutes for all datasets on a modern laptop

### Security (MVP Level)
- Secrets via env vars only; `.env.example` provided, `.env` gitignored
- SQL tool enforces SELECT-only via regex guardrail (not DB-level permissions)
- Request/response size limits on FastAPI routes
- Logs sanitised (no API keys, no raw PII)

### Reproducibility
- **Local development:** `docker compose up` from a fresh clone starts all services (postgres + backend + frontend) and seeds demo data. `docker-compose.yml` is development-only and is not the production deployment mechanism.
- **External deployment:** Neon DB URL set as `DATABASE_URL` in `.env` and as a Render environment secret; `git push` to GitHub triggers automatic Vercel (frontend) and Render (backend) deployments. No Docker required on the external path.
- `KAGGLE_USERNAME` + `KAGGLE_KEY` env vars required for real dataset download; synthetic fallback works without them

---

## 13. Test Requirements

| Test File | What It Covers |
|---|---|
| `test_sql_guardrails.py` | Rejects DROP/DELETE/UPDATE/INSERT; accepts valid SELECT |
| `test_vector_retrieval.py` | `VectorSearchTool` returns top-k results with scores > 0 |
| `test_agent_router.py` | Intent classifier routes "find similar" → `vector_only`, "trend" → `sql_only`, "classify and recommend" → `hybrid` |

Run all: `pytest backend/tests/`
Run single: `pytest backend/tests/test_sql_guardrails.py`

---

## 14. Demo Queries (Must Work on First Run)

1. `"Find similar incidents to: hydraulic actuator crack observed during routine inspection on Line 1"`
   - Expected: top-k incident excerpts with similarity scores and cited chunk IDs

2. `"Show defect trends by product and defect_type for the last 90 days"`
   - Expected: SQL aggregation table + bar chart data + graph of related defect nodes

3. `"Given this incident: corrosion found on avionics connector SN-482910, classify the likely defect category and recommend next maintenance action"`
   - Expected: hybrid run — vector search for similar incidents + SQL for defect stats → cited answer with confidence scores + graph path

---

## 15. Open Questions & Risks

| Item | Status |
|---|---|
| Kaggle dataset column names differ from canonical schema — column mapping logic needed per dataset | Must define mapping at ingest |
| `all-MiniLM-L6-v2` produces 384-dim vectors — schema comment says 1536 (OpenAI size); must set `vector(384)` | Resolved: use 384 |
| Entity extraction strategy for graph building (NER model vs. regex vs. LLM call) | TBD — recommend spaCy `en_core_web_sm` for MVP speed |
| React Flow license is MIT for non-commercial use | Acceptable for portfolio |
| Kaggle API credentials required for real data; must document clearly in README | Add prominent note in README |
