# TASKS.md — NextAgentAI Master Task List

> Consolidated from: TASKS.md (Wave 0 — MVP), TASKS2.md (Wave 1 — Performance), TASKS3.md (Wave 2 — RAG & Agent)
>
> | Wave | Tasks | Status |
> |---|---|---|
> | Wave 0 — MVP Implementation | T-001 to T-045 (48 tasks) | ALL COMPLETE |
> | Wave 1 — Performance Optimizations | T-01 to T-17 (17 tasks) | ALL COMPLETE |
> | Wave 2 — RAG & Agent Optimizations | T3-01 to T3-15 (15 tasks) | 12 DONE · 1 SKIPPED · 2 pending |
>
> **Effort Scale:** XS ≈ 1h | S ≈ 2h | M ≈ 4h | L ≈ 8h | XL ≈ 2d

---

## Wave 0 — MVP Implementation

**Generated:** 2026-03-04 | **Source PRD:** PRD.md v1.0
**Owner Roles:** `backend-architect` | `frontend-developer` | `deployment-engineer`

Tasks are numbered in strict dependency order. No task may begin until every task in its **Blocked-by** list is marked complete.

---

### Phase 0: Infrastructure & Scaffolding

---

### T-001 — Initialise repo structure and base configuration files

**Owner:** `deployment-engineer` | **Effort:** M

**Description:**
Create the full directory scaffold exactly as specified in the PRD (Section 8). Create placeholder `__init__.py` files, `.gitignore`, `.env.example`, and `config.yaml` with all keys from PRD Section 11. No implementation logic yet — pure structure.

**Acceptance Criteria:**
- All directories exist: `backend/app/{api,agent,rag,graph,tools,ingest,db,schemas,llm,observability}`, `backend/src/`, `backend/tests/`, `frontend/app/{components,lib}`, `demo/{docs,seed_sql}`, `data/synthetic/`
- `.env.example` contains: `PG_DSN`, `ANTHROPIC_API_KEY`, `KAGGLE_USERNAME`, `KAGGLE_KEY`
- `config.yaml` contains all keys from PRD Section 11 with correct default values (model: `claude-sonnet-4-6`, dim: 384, chunk_size_tokens: 400, chunk_overlap_tokens: 75, top_k: 8, k_hop: 2, max_steps: 10)
- `.gitignore` excludes: `.env`, `data/synthetic/`, `data/kaggle/`, `__pycache__/`, `.venv/`, `node_modules/`
- `git init` completed and initial commit made

**Blocked-by:** *(none)*

---

### T-002 — PostgreSQL Docker Compose service (local dev)

**Owner:** `deployment-engineer` | **Effort:** M

**Description:**
Define the `docker-compose.yml` with the `postgres` service using the `pgvector/pgvector:pg16` image. This service is for **local development only** — production uses Neon (see T-002b). Configure environment variables, health check, and a named volume. The backend and frontend services will be added in T-039; only the DB service is needed here so all other local dev tasks can depend on a running database.

**Acceptance Criteria:**
- `docker-compose.yml` defines a `postgres` service using image `pgvector/pgvector:pg16`
- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` sourced from `.env`
- Health check: `pg_isready -U ${POSTGRES_USER}` with interval 5s, retries 10
- Named volume `pgdata` mounted to `/var/lib/postgresql/data`
- Port `5432` exposed to host
- Running `docker compose up postgres` starts Postgres and health check passes within 60s
- A comment at the top of `docker-compose.yml` explicitly states: "LOCAL DEVELOPMENT ONLY — not the production deployment mechanism"

**Blocked-by:** T-001

---

### T-002b — Neon database provisioning and connection

**Owner:** `deployment-engineer` | **Effort:** S

**Description:**
Provision a Neon free-tier PostgreSQL project for external deployment. Neon is a serverless PostgreSQL provider with pgvector support built-in — it replaces the `pgvector/pgvector:pg16` Docker image for the cloud deployment path. Document the connection string format and wire it into `.env.example`.

**Acceptance Criteria:**
- Neon free-tier project created (documented in README external deployment section)
- pgvector extension enabled on the Neon database: `CREATE EXTENSION IF NOT EXISTS vector;` executes without error
- `DATABASE_URL` environment variable added to `.env.example` in standard `postgresql://user:password@host/dbname?sslmode=require` format
- `DATABASE_URL` works as the SQLAlchemy connection string (`PG_DSN` in `config.yaml` maps to this var)
- `alembic upgrade head` runs successfully against the Neon database, creating all tables and indexes
- Neon connection string documented in README under "External Deployment" with a note to add it as a Render environment secret

**Blocked-by:** T-001

---

### T-003 — Python virtual environment, `requirements.txt`, and project install

**Owner:** `backend-architect` | **Effort:** S

**Description:**
Create `backend/requirements.txt` with all Python dependencies pinned at the minor version. Verify the environment installs cleanly.

**Acceptance Criteria:**
- `requirements.txt` includes (at minimum): `fastapi`, `uvicorn[standard]`, `sqlalchemy`, `alembic`, `psycopg2-binary`, `pgvector`, `anthropic`, `sentence-transformers`, `kagglehub`, `pydantic`, `pydantic-settings`, `python-dotenv`, `spacy`, `pytest`, `httpx`
- `pip install -r requirements.txt` completes without errors on Python 3.11+
- `python -c "import fastapi, sqlalchemy, anthropic, sentence_transformers, kagglehub"` exits 0

**Blocked-by:** T-001

---

### T-004 — SQLAlchemy ORM models and Alembic migration baseline

**Owner:** `backend-architect` | **Effort:** M

**Description:**
Implement all ORM models in `backend/app/db/models.py` exactly matching the schema in PRD Section 7. Initialise Alembic and create the initial migration that enables the `vector` extension and creates all seven tables with all indexes.

**Acceptance Criteria:**
- `backend/app/db/models.py` defines ORM classes for: `IncidentReport`, `ManufacturingDefect`, `MaintenanceLog`, `IncidentEmbedding`, `GraphNode`, `GraphEdge`, `AgentRun`
- `IncidentEmbedding.embedding` typed as `Vector(384)`
- All foreign key relationships and cascade rules match PRD schema exactly
- `alembic init` run; `alembic.ini` and `backend/app/db/migrations/` created
- `alembic upgrade head` against a running Postgres creates all tables and all indexes (verify with `\dt` and `\di`)
- IVFFlat index `idx_incident_embeddings_vec` created with `lists=100` on `embedding vector_cosine_ops`

**Blocked-by:** T-002, T-003

---

### T-005 — Database session factory and settings loader

**Owner:** `backend-architect` | **Effort:** S

**Description:**
Implement `backend/app/db/session.py` (async SQLAlchemy session factory) and a Pydantic `Settings` class in `backend/app/schemas/` (or a dedicated `config.py`) that reads all values from `config.yaml` and environment variables.

**Acceptance Criteria:**
- `get_session()` yields an async SQLAlchemy session; connection string sourced from `Settings.database.dsn`
- `Settings` loads `config.yaml` and overrides with env vars; all PRD Section 11 keys accessible as typed attributes
- `from backend.app.db.session import get_session` succeeds in a running Python interpreter pointed at the test DB
- Session closes cleanly on context exit; no connection leaks

**Blocked-by:** T-004

---

### T-006 — LLM client interface and Claude adapter

**Owner:** `backend-architect` | **Effort:** S

**Description:**
Implement `backend/app/llm/client.py`. Define an abstract `LLMClient` base class and a `ClaudeClient` concrete implementation using the `anthropic` SDK targeting `claude-sonnet-4-6`. Must support JSON-mode structured output.

**Acceptance Criteria:**
- `LLMClient` abstract class defines: `complete(prompt: str, system: str, json_mode: bool) -> str`
- `ClaudeClient` reads `ANTHROPIC_API_KEY` from env; model defaults to `claude-sonnet-4-6` but is overridable via `config.yaml`
- `json_mode=True` sets `response_format` appropriately so the model returns parseable JSON
- `ClaudeClient.complete(...)` called with a simple prompt returns a non-empty string without raising
- API key missing raises `EnvironmentError` with a clear message

**Blocked-by:** T-003

---

### T-007 — Structured JSON logging module

**Owner:** `backend-architect` | **Effort:** S

**Description:**
Implement `backend/app/observability/logging.py`. All log entries must be newline-delimited JSON. Logs must not contain API keys or raw PII.

**Acceptance Criteria:**
- `get_logger(name)` returns a logger that emits JSON lines to stdout with fields: `timestamp`, `level`, `logger`, `message`, `extra`
- A `scrub_secrets(record)` filter strips any field value matching the pattern of the `ANTHROPIC_API_KEY` or `PG_DSN`
- Logger used in at least one module (e.g., `session.py`) without errors
- Running `python -c "from backend.app.observability.logging import get_logger; get_logger('test').info('ok')"` emits valid JSON

**Blocked-by:** T-003

---

### Phase 1: Data Ingestion Pipeline

---

### T-008 — Synthetic incident narrative generator

**Owner:** `backend-architect` | **Effort:** L

**Description:**
Implement `backend/app/ingest/synthetic.py`. Generate 10,000 synthetic incident report rows as a CSV and optionally insert directly into `incident_reports`.

**Acceptance Criteria:**
- `generate_synthetic_incidents(n=10000, output_path=...) -> pd.DataFrame` produces a DataFrame with all columns: `incident_id`, `asset_id`, `system`, `sub_system`, `event_date`, `location`, `severity`, `narrative`, `corrective_action`, `source='synthetic'`
- At least 5 distinct values each for `system`, `sub_system`, `severity`
- `narrative` field averages 80–200 words
- Output CSV written to path from `config.yaml` (`data/synthetic/incidents_synth.csv`)
- Function is idempotent: re-running does not raise if file already exists
- 10,000 rows generated in < 60s on a modern laptop

**Blocked-by:** T-005, T-007

---

### T-009 — Kaggle dataset loader and column mapper

**Owner:** `backend-architect` | **Effort:** L

**Description:**
Implement `backend/app/ingest/kaggle_loader.py`. Downloads the three Kaggle datasets using `kagglehub`, applies per-dataset column mapping to canonical schema, and returns typed DataFrames. Must fall back to `demo/seed_sql/` CSV fixtures if Kaggle credentials are absent.

**Acceptance Criteria:**
- `load_manufacturing_defects(config) -> pd.DataFrame` maps `fahmidachowdhury/manufacturing-defects` columns to: `defect_id`, `product`, `defect_type`, `severity`, `inspection_date`, `plant`, `lot_number`, `action_taken`
- `load_defects_supplemental(config) -> pd.DataFrame` maps `rabieelkharoua/predicting-manufacturing-defects-dataset` to the same canonical schema
- `load_maintenance_logs(config) -> pd.DataFrame` maps `merishnasuwal/aircraft-historical-maintenance-dataset` to: `log_id`, `asset_id`, `ts`, `metric_name`, `metric_value`, `unit`
- If `KAGGLE_USERNAME`/`KAGGLE_KEY` are absent, loader reads from `demo/seed_sql/*.csv` fallback fixtures and logs a `WARNING`
- All three functions raise `ValueError` with column name in message if a required source column is missing
- `demo/seed_sql/` directory contains at least 3 seed CSV files with ≥ 20 rows each

**Blocked-by:** T-005, T-007

---

### T-010 — Database bulk-load for all three canonical tables

**Owner:** `backend-architect` | **Effort:** M

**Description:**
Implement the DB-write step of the ingest pipeline: take typed DataFrames from T-008 and T-009 and upsert them into `incident_reports`, `manufacturing_defects`, and `maintenance_logs` using SQLAlchemy bulk operations.

**Acceptance Criteria:**
- Upsert (insert-or-skip on conflict) so re-running ingest does not duplicate rows
- `incident_reports` contains ≥ 10,000 rows after a full ingest
- `manufacturing_defects` contains rows from both Kaggle sources (or seed fallback)
- `maintenance_logs` populated from aircraft maintenance dataset (or seed fallback)
- Bulk write for 10k incidents completes in < 30s
- Any row-level insert error is logged and skipped; overall pipeline does not halt

**Blocked-by:** T-008, T-009

---

### T-011 — Token-aware chunker

**Owner:** `backend-architect` | **Effort:** M

**Description:**
Implement `backend/app/rag/chunker.py`. Split narrative text into overlapping token-window chunks suitable for embedding.

**Acceptance Criteria:**
- `chunk_text(text: str, chunk_size: int = 400, overlap: int = 75) -> list[dict]` returns list of `{chunk_index, chunk_text, char_start, char_end}`
- Chunks respect token boundaries; chunk size 300–600 tokens, overlap 50–100 tokens
- Overlap windows are consistent: `chunk[i+1]` starts `overlap` tokens before `chunk[i]` ends
- A 1,000-token document with size=400, overlap=75 produces exactly the expected chunk count
- No chunk is empty or whitespace-only

**Blocked-by:** T-003

---

### T-012 — Local embedding wrapper

**Owner:** `backend-architect` | **Effort:** S

**Description:**
Implement `backend/app/rag/embeddings.py`. Wrap `sentence-transformers/all-MiniLM-L6-v2` to produce 384-dimensional vectors. Must be a singleton (model loaded once per process).

**Acceptance Criteria:**
- `EmbeddingModel.encode(texts: list[str]) -> np.ndarray` returns array of shape `(n, 384)`
- Model loaded lazily on first call; subsequent calls reuse the same instance
- `encode(["test"])` returns a vector of exactly 384 floats
- Works without internet access once model is cached (offline mode)
- Encoding 1,000 short texts completes in < 10s on CPU

**Blocked-by:** T-003

---

### T-013 — Chunk embedding and storage

**Owner:** `backend-architect` | **Effort:** M

**Description:**
Wire T-011 and T-012 together: for each incident report, chunk the narrative, embed each chunk, and write rows to `incident_embeddings`.

**Acceptance Criteria:**
- `embed_and_store_incidents(session, config)` processes all rows in `incident_reports`
- Each chunk produces one row in `incident_embeddings` with: `embed_id` (UUID), `incident_id`, `chunk_index`, `chunk_text`, `embedding` (vector(384))
- Processes in batches of 256 chunks; batch size configurable
- Re-running skips incidents already embedded (idempotent)
- After full ingest: `SELECT COUNT(*) FROM incident_embeddings` returns ≥ 10,000
- 10k incidents embedded in < 5 minutes on CPU

**Blocked-by:** T-010, T-011, T-012

---

### Phase 2: Vector Search & Embeddings

---

### T-014 — pgvector IVFFlat index and retrieval module

**Owner:** `backend-architect` | **Effort:** M

**Description:**
Implement `backend/app/rag/retrieval.py`. Perform cosine similarity search via pgvector, applying optional metadata filters.

**Acceptance Criteria:**
- `vector_search(session, query_embedding, top_k=8, filters={}) -> list[dict]` returns items with: `chunk_id`, `incident_id`, `score`, `excerpt`, `metadata`
- Supports filters: `system` (exact match), `severity` (exact match), `date_range` (tuple of ISO date strings)
- Uses `<=>` cosine distance operator via pgvector
- Results ordered by ascending distance (highest similarity first)
- Returns results in < 500ms against a 10k-incident dataset
- Returns empty list (not an error) when no results exceed `similarity_threshold`

**Blocked-by:** T-013

---

### T-015 — VectorSearchTool wrapper

**Owner:** `backend-architect` | **Effort:** S

**Description:**
Implement `backend/app/tools/vector_tool.py`. Wraps the retrieval module as a named, callable tool conforming to the agent tool interface.

**Acceptance Criteria:**
- Class `VectorSearchTool` with method `run(query_text: str, filters: dict = {}, top_k: int = 8) -> dict`
- Return value includes: `tool_name`, `results` (list from retrieval), `latency_ms`, `error` (None if successful)
- Embeds `query_text` using `EmbeddingModel` before calling `vector_search`
- Raises `ToolTimeoutError` if execution exceeds `agent.tool_timeout_seconds` from config
- `VectorSearchTool("hydraulic actuator crack").run(...)` returns ≥ 1 result against the seeded dataset

**Blocked-by:** T-014

---

### Phase 3: GraphRAG (Graph Build + Query)

---

### T-016 — Entity extraction for graph construction

**Owner:** `backend-architect` | **Effort:** M

**Description:**
Implement entity extraction logic in `backend/app/graph/builder.py` using spaCy `en_core_web_sm`. Extract entities from incident narratives to be used as graph nodes.

**Acceptance Criteria:**
- `extract_entities(text: str) -> list[dict]` returns entities with: `label`, `type`, `char_start`, `char_end`
- spaCy model `en_core_web_sm` loaded once as a singleton
- Entities of type `PRODUCT`, `ORG`, `FAC` mapped to appropriate canonical types; fallback to `other`
- Custom regex patterns supplement spaCy for domain terms
- `extract_entities("Hydraulic actuator crack on Line 1 asset ASSET-247")` returns ≥ 2 entities

**Blocked-by:** T-003

---

### T-017 — Graph node and edge construction at ingest

**Owner:** `backend-architect` | **Effort:** L

**Description:**
Complete `backend/app/graph/builder.py`. For each chunk: create chunk nodes, extract and create entity nodes, create `mentions` edges (chunk→entity), create `co_occurrence` edges (entity→entity within same chunk), and create `similarity` edges (chunk→chunk where cosine similarity > threshold).

**Acceptance Criteria:**
- `build_graph(session, config)` processes all rows in `incident_embeddings`
- `graph_node` populated with one row per unique entity and one row per chunk
- `graph_edge` contains: `mentions`, `co_occurrence`, and `similarity` edges
- Similarity edges computed in batch using chunk embedding matrix
- Upsert on conflict: re-running `build_graph` does not create duplicate nodes or edges
- After full ingest: `SELECT COUNT(*) FROM graph_node` > 0 and `SELECT COUNT(*) FROM graph_edge` > 0

**Blocked-by:** T-013, T-016

---

### T-018 — k-hop graph expander

**Owner:** `backend-architect` | **Effort:** M

**Description:**
Implement `backend/app/graph/expander.py`. Starting from a set of seed chunk/entity IDs, expand to k-hop neighbours via recursive SQL CTEs or iterative queries.

**Acceptance Criteria:**
- `expand_graph(session, seed_ids: list[str], k: int = 2) -> dict` returns `{nodes: list[GraphNode], edges: list[GraphEdge]}`
- Expansion follows both `mentions` and `co_occurrence` edge types; `similarity` edges included at hop 1 only
- k=0 returns only seed nodes; k=2 returns up to 2 hops as per config default
- Expansion of 8 seed nodes with k=2 completes in < 2s against the seeded graph

**Blocked-by:** T-017

---

### T-019 — Graph evidence re-ranker

**Owner:** `backend-architect` | **Effort:** M

**Description:**
Implement `backend/app/graph/scorer.py`. Re-rank expanded graph evidence by combining vector similarity score, edge weight, and recency.

**Acceptance Criteria:**
- `rank_evidence(vector_hits, graph_nodes, graph_edges, config) -> list[dict]` returns a ranked list
- Score formula: `0.5 * similarity_score + 0.3 * edge_weight + 0.2 * recency_score`
- Output items include: `node_id`, `type`, `text_excerpt`, `composite_score`, `source_incident_id`
- Conflicting sources flagged with `conflict=True` in item metadata
- Returns at most `top_k * 2` items

**Blocked-by:** T-018

---

### Phase 4: SQL Tool & Pre-built Queries

---

### T-020 — SQL guardrail and SQLQueryTool

**Owner:** `backend-architect` | **Effort:** M

**Description:**
Implement `backend/app/tools/sql_tool.py`. Enforce SELECT-only access via regex before executing any SQL. Implement four pre-built named queries.

**Acceptance Criteria:**
- `SQLQueryTool.run(sql: str) -> dict` raises `SQLGuardrailError` for any statement matching `\b(DROP|DELETE|UPDATE|INSERT|CREATE|ALTER|TRUNCATE)\b`
- Returns on success: `{columns, rows, row_count, latency_ms}`
- Pre-built named queries via `SQLQueryTool.run_named(name, params)`: `defect_counts_by_product`, `severity_distribution`, `maintenance_trends`, `incidents_defects_join`
- All dangerous patterns blocked; valid SELECT must pass

**Blocked-by:** T-005

---

### T-021 — PythonComputeTool (sandboxed execution)

**Owner:** `backend-architect` | **Effort:** M

**Description:**
Implement `backend/app/tools/compute_tool.py`. Allow the agent to execute simple Python snippets for arithmetic/statistical computation. Sandbox by restricting builtins and blocking imports of dangerous modules.

**Acceptance Criteria:**
- `PythonComputeTool.run(code: str, context: dict = {}) -> dict` executes code in a restricted namespace
- Blocked: `import os`, `import sys`, `import subprocess`, `open(...)`, `__import__`
- Allowed builtins: `len`, `sum`, `min`, `max`, `round`, `abs`, `sorted`, `enumerate`, `zip`, `range`, `list`, `dict`, `str`, `int`, `float`
- `context` dict injected as local variables
- Returns: `{result, stdout, error}`
- Execution timeout enforced at 5 seconds; raises `ToolTimeoutError` on breach
- Attempting `import os` raises `ToolSecurityError` (not crashes the process)

**Blocked-by:** T-005

---

### Phase 5: Agent Orchestrator

---

### T-022 — Intent classifier

**Owner:** `backend-architect` | **Effort:** M

**Description:**
Implement `backend/app/agent/intent.py`. Classify a natural language query into one of four routing intents using the LLM client with a constrained prompt.

**Acceptance Criteria:**
- `classify_intent(query: str, llm: LLMClient) -> str` returns one of: `vector_only`, `sql_only`, `hybrid`, `compute`
- Uses `json_mode=True`; parses `{"intent": "..."}` from LLM response
- Falls back to `hybrid` if LLM response cannot be parsed
- Latency logged via structured logger

**Blocked-by:** T-006, T-007

---

### T-023 — Planner

**Owner:** `backend-architect` | **Effort:** M

**Description:**
Implement `backend/app/agent/planner.py`. Generate a numbered step-by-step tool execution plan from the intent and query.

**Acceptance Criteria:**
- `generate_plan(query: str, intent: str, llm: LLMClient) -> list[dict]` returns an ordered list of plan steps
- Each step: `{step_number, description, tool, tool_inputs}`
- `vector_only` intent produces a plan with exactly one `VectorSearchTool` step
- `hybrid` intent produces a plan with at least one vector step and one SQL step

**Blocked-by:** T-022

---

### T-024 — Claim verifier and confidence scorer

**Owner:** `backend-architect` | **Effort:** M

**Description:**
Implement `backend/app/agent/verifier.py`. After synthesis, verify each claim against the evidence set and assign a confidence score.

**Acceptance Criteria:**
- `verify_claims(claims, evidence, llm) -> list[dict]` returns claims with `confidence` field added/updated
- Each returned claim: `{text, confidence, citations}`
- Citation: `{chunk_id, incident_id, char_start, char_end}`
- Confidence reduced when fewer than 2 evidence items support a claim
- Conflicting evidence reduces confidence by at least 0.2 and adds `conflict_note`
- Claims unsupported by any evidence get `confidence ≤ 0.3`

**Blocked-by:** T-019, T-006

---

### T-025 — Agent orchestrator state machine

**Owner:** `backend-architect` | **Effort:** XL

**Description:**
Implement `backend/app/agent/orchestrator.py`. The top-level state machine that drives the full agentic loop: classify → plan → execute tools → expand graph → re-rank → synthesise → verify → return structured output.

**Acceptance Criteria:**
- `AgentOrchestrator.run(query: str) -> AgentRunResult` executes the full loop
- State transitions logged: `intent`, `plan`, `tool_start`, `tool_end`, `graph_expand`, `synthesise`, `verify`
- Max 10 tool-call steps enforced; if limit reached, agent returns partial result with `run_summary.halted_at_step_limit=true`
- Output conforms to the full schema: `answer`, `claims`, `evidence`, `graph_path`, `run_summary`, `assumptions`, `next_steps`
- Run saved to `agent_runs` table with `run_id` (UUID) and full result JSON

**Blocked-by:** T-015, T-020, T-021, T-023, T-024

---

### Phase 6: FastAPI Backend & CLI

---

### T-026 — FastAPI app factory and Pydantic schemas

**Owner:** `backend-architect` | **Effort:** M

**Description:**
Implement `backend/app/main.py` (FastAPI app factory with lifespan, CORS, and middleware) and all Pydantic request/response schemas in `backend/app/schemas/`.

**Acceptance Criteria:**
- `create_app()` returns a configured FastAPI application
- CORS allows `http://localhost:3000`
- Lifespan context manager: initialises DB pool on startup, disposes on shutdown
- Pydantic schemas defined for: `QueryRequest`, `QueryResponse`, `IngestResponse`, `ChunkResponse`
- `uvicorn backend.app.main:app --reload` starts without errors

**Blocked-by:** T-005, T-007

---

### T-027 — Ingest API route (`POST /ingest`)

**Owner:** `backend-architect` | **Effort:** S

**Description:**
Implement `backend/app/api/ingest.py`. Triggers the full ingestion pipeline as a background task.

**Acceptance Criteria:**
- `POST /ingest` returns `202 Accepted` immediately with `{status: "started", message: "..."}`
- Pipeline runs as a FastAPI `BackgroundTask`
- Calling `POST /ingest` when ingest is already running returns `409 Conflict`

**Blocked-by:** T-026, T-010, T-013, T-017

---

### T-028 — Query API routes (`POST /query`, `GET /runs/{run_id}`)

**Owner:** `backend-architect` | **Effort:** M

**Description:**
Implement `backend/app/api/query.py`. Expose the agent orchestrator via HTTP.

**Acceptance Criteria:**
- `POST /query` with body `{"query": "..."}` returns full `QueryResponse` JSON
- `POST /query` returns `400` if `query` is empty or > 2,000 characters
- `GET /runs/{run_id}` returns stored agent run; returns `404` if not found
- `run_id` present in both response bodies and retrievable via `GET /runs/{run_id}`
- All three demo queries return HTTP 200 with non-empty `answer`

**Blocked-by:** T-025, T-026

---

### T-029 — Docs API routes (`GET /docs`, `GET /docs/{doc_id}/chunks/{chunk_id}`)

**Owner:** `backend-architect` | **Effort:** S

**Description:**
Implement `backend/app/api/docs.py`. Allow the frontend citations drawer to fetch source chunk text.

**Acceptance Criteria:**
- `GET /docs` returns paginated list with `?page=` and `?limit=` query params (max limit 100)
- `GET /docs/{doc_id}/chunks/{chunk_id}` returns `ChunkResponse` with `chunk_text` and `char_start`/`char_end`
- Returns `404` with descriptive message if `doc_id` or `chunk_id` not found

**Blocked-by:** T-026

---

### T-030 — CLI entrypoint (`ingest` and `ask` subcommands)

**Owner:** `backend-architect` | **Effort:** M

**Description:**
Implement `backend/src/cli.py`. Developer-facing CLI using `argparse` or `click`.

**Acceptance Criteria:**
- `python -m src.cli ingest --config config.yaml` runs the full ingest pipeline and prints progress to stdout
- `python -m src.cli ask "<query>"` runs the agent and prints formatted output
- `python -m src.cli ask --json "<query>"` outputs raw JSON matching the PRD F4 schema
- `--help` on both subcommands prints usage

**Blocked-by:** T-025

---

### Phase 7: Frontend (Next.js + shadcn/ui + React Flow)

---

### T-031-F — Next.js project scaffold and API client

**Owner:** `frontend-developer` | **Effort:** M

**Description:**
Scaffold the Next.js App Router project in `frontend/`. Install dependencies and create the typed API client in `frontend/app/lib/api.ts`.

**Acceptance Criteria:**
- `npm run dev` starts Next.js on port 3000 without errors
- `tsconfig.json` configured with strict mode and path aliases
- shadcn/ui initialised; at least `Button`, `Card`, `Drawer`, `Badge`, `ScrollArea` components added
- `frontend/app/lib/api.ts` exports: `postQuery()`, `getRunById()`, `getChunk()`
- `npm run build` completes without type errors

**Blocked-by:** T-001

---

### T-032-F — Four-panel main layout (`page.tsx`)

**Owner:** `frontend-developer` | **Effort:** M

**Description:**
Implement `frontend/app/page.tsx`. Create the four-panel layout using shadcn/ui `Card` and CSS grid/flexbox.

**Acceptance Criteria:**
- Layout renders four named panels: **Chat**, **Agent Timeline**, **Graph Viewer**, **Citations**
- Layout is responsive to viewport height
- No hardcoded hex colours; all colour references use CSS variables

**Blocked-by:** T-031-F

---

### T-033-F — ChatPanel component

**Owner:** `frontend-developer` | **Effort:** M

**Description:**
Implement `frontend/app/components/ChatPanel.tsx`. Chat input + message history with query submission wired to the API client.

**Acceptance Criteria:**
- Text input with submit button (keyboard shortcut: Enter)
- On submit: calls `postQuery`, shows a loading spinner
- On success: renders `answer` text in a message bubble with markdown rendering
- On error: shows an error alert with the error message
- Query input disabled while a request is in flight

**Blocked-by:** T-032-F

---

### T-034-F — AgentTimeline component

**Owner:** `frontend-developer` | **Effort:** M

**Description:**
Implement `frontend/app/components/AgentTimeline.tsx`. Render the `run_summary.steps` array as a vertical timeline.

**Acceptance Criteria:**
- Each step rendered as a timeline item: step number, tool name (with icon/badge), latency (ms), status (success/error)
- Error steps highlighted in red
- Tool names rendered as `Badge` components with colour coding per tool type

**Blocked-by:** T-032-F

---

### T-035-F — GraphViewer component (React Flow)

**Owner:** `frontend-developer` | **Effort:** L

**Description:**
Implement `frontend/app/components/GraphViewer.tsx`. Render the `graph_path` from the agent response using React Flow.

**Acceptance Criteria:**
- Renders `graph_path.nodes` and `graph_path.edges` as a React Flow graph
- Node types styled differently: `entity` nodes (circular, purple), `chunk` nodes (rectangular, teal)
- Clicking a node opens a tooltip or side-drawer showing: node label, type, and up to 3 linked chunk excerpts
- Graph auto-fits to the panel on load (`fitView`)

**Blocked-by:** T-032-F

---

### T-036-F — CitationsDrawer component

**Owner:** `frontend-developer` | **Effort:** M

**Description:**
Implement `frontend/app/components/CitationsDrawer.tsx`. Clicking any citation in the answer opens a drawer with the source chunk text and highlighted cited span.

**Acceptance Criteria:**
- `claims` array rendered as inline citation links (`[1]`, `[2]`)
- Clicking a citation link opens a shadcn/ui `Drawer` from the right
- Drawer fetches chunk via `getChunk(doc_id, chunk_id)` and highlights cited span
- `confidence` score displayed as a `Badge` with colour: green ≥ 0.7, yellow 0.4–0.69, red < 0.4
- Drawer closes on Escape key or outside click

**Blocked-by:** T-033-F, T-035-F

---

### Phase 8: Docker & Deployment

---

### T-037 — Backend Dockerfile

**Owner:** `deployment-engineer` | **Effort:** M

**Description:**
Write `backend/Dockerfile`. Multi-stage build: install dependencies, copy source, expose port 8000.

**Acceptance Criteria:**
- Base image: `python:3.11-slim`
- `sentence-transformers/all-MiniLM-L6-v2` model pre-downloaded during build
- `spacy` model `en_core_web_sm` downloaded during build
- Entrypoint: `uvicorn backend.app.main:app --host 0.0.0.0 --port 8000`
- `docker run` with correct env vars starts the API and `GET /healthz` returns `{"status": "ok"}`

**Blocked-by:** T-028, T-030

---

### T-038 — Frontend Dockerfile

**Owner:** `deployment-engineer` | **Effort:** S

**Description:**
Write `frontend/Dockerfile`. Multi-stage build: install deps and build Next.js static output, then serve with a minimal Node image.

**Acceptance Criteria:**
- Build stage: `node:20-alpine`, runs `npm ci` and `npm run build`
- Runtime stage: `node:20-alpine`, copies `.next/` output and runs `npm start`
- `NEXT_PUBLIC_API_URL` build arg wired to Next.js env
- Port 3000 exposed

**Blocked-by:** T-036-F

---

### T-039 — Complete `docker-compose.yml` with all three services (LOCAL DEV ONLY)

**Owner:** `deployment-engineer` | **Effort:** M

**Description:**
Extend `docker-compose.yml` (started in T-002) to add `backend` and `frontend` services. This file is **local development only**.

**Acceptance Criteria:**
- Three services: `postgres`, `backend`, `frontend`
- `backend` depends_on `postgres` with `condition: service_healthy`
- `backend` service runs Alembic migrations before starting Uvicorn
- `docker compose up --build` from a fresh clone: all three services start, health checks pass
- `docker compose down -v` cleanly removes containers and volumes

**Blocked-by:** T-002, T-037, T-038

---

### T-039b — Render deployment configuration (external backend)

**Owner:** `deployment-engineer` | **Effort:** M

**Description:**
Create `render.yaml` (Render Blueprint file) at the repo root to define the backend web service on Render's free tier.

**Acceptance Criteria:**
- `render.yaml` present at repo root, defining one `web` service pointing to the `backend/Dockerfile`
- Health check path set to `/healthz` in `render.yaml`
- `ANTHROPIC_API_KEY` and `DATABASE_URL` documented as Render environment secrets
- `GET /healthz` returns `{"status": "ok"}` on the public Render URL

**Blocked-by:** T-037

---

### T-039c — Vercel deployment configuration (external frontend)

**Owner:** `deployment-engineer` | **Effort:** S

**Description:**
Configure the Vercel project for the Next.js frontend. Set `NEXT_PUBLIC_API_URL` as a Vercel environment variable pointing to the Render backend URL.

**Acceptance Criteria:**
- `NEXT_PUBLIC_API_URL` set as a Vercel environment variable
- Frontend deploys successfully on `git push`
- All panels render correctly on the Vercel URL; no CORS errors

**Blocked-by:** T-038

---

### T-040 — Ingest-on-startup entrypoint script and seed data

**Owner:** `deployment-engineer` | **Effort:** M

**Description:**
Create a Docker entrypoint script that: runs Alembic migrations, then runs `python -m src.cli ingest` on first boot (skipping if data already present), then starts Uvicorn.

**Acceptance Criteria:**
- `backend/entrypoint.sh` script: `alembic upgrade head`, checks if `incident_reports` has rows; if empty runs ingest, then starts Uvicorn
- `demo/seed_sql/` fixtures allow ingest to complete without Kaggle credentials
- Second startup (data already present): skips ingest and starts API immediately (< 15s)

**Blocked-by:** T-039, T-030

---

### T-041 — Health check endpoint and README

**Owner:** `deployment-engineer` | **Effort:** M

**Description:**
Add `GET /healthz` to the FastAPI app and write `README.md` with full setup and demo instructions.

**Acceptance Criteria:**
- `GET /healthz` returns `{"status": "ok", "db": "connected", "embeddings_loaded": true}` when healthy
- Returns `{"status": "degraded", ...}` with 503 if DB is unreachable
- `README.md` contains: overview, prerequisites, Local Dev quickstart, External Deployment steps, three demo queries with expected outputs

**Blocked-by:** T-039, T-039b, T-039c

---

### Phase 9: Tests & Validation

---

### T-042 — SQL guardrail unit tests

**Owner:** `backend-architect` | **Effort:** S

**Description:**
Implement `backend/tests/test_sql_guardrails.py`. Covers all dangerous statement patterns and valid SELECT cases.

**Acceptance Criteria:**
- Tests for all seven blocked keywords: `DROP`, `DELETE`, `UPDATE`, `INSERT`, `CREATE`, `ALTER`, `TRUNCATE`
- Tests use mixed case and inline whitespace
- Tests for valid SELECTs: simple `SELECT *`, `SELECT COUNT(*)`, multi-line SELECT with JOIN
- All tests pass with `pytest backend/tests/test_sql_guardrails.py`

**Blocked-by:** T-020

---

### T-043 — Vector retrieval unit tests

**Owner:** `backend-architect` | **Effort:** S

**Description:**
Implement `backend/tests/test_vector_retrieval.py`. Validates that `VectorSearchTool` returns meaningful results against the seeded dataset.

**Blocked-by:** T-015

---

### T-044 — Agent intent router unit tests

**Owner:** `backend-architect` | **Effort:** S

**Description:**
Implement `backend/tests/test_agent_router.py`. Validates the intent classifier routes correctly for the three canonical query patterns.

**Blocked-by:** T-022

---

### T-045 — End-to-end demo validation

**Owner:** `backend-architect` | **Effort:** M

**Description:**
Manually execute and verify all three demo queries from PRD Section 14 against the fully running system — both locally via Docker Compose and externally via the public Vercel URL.

**Acceptance Criteria:**
- Demo query 1 (vector-only): returns ≥ 3 incident excerpts with `score > 0.5` and cited `chunk_id`
- Demo query 2 (sql_only): returns a SQL result with ≥ 2 product rows
- Demo query 3 (hybrid): executes both vector and SQL tools, returns answer with ≥ 1 claim having `confidence ≥ 0.6`
- All three queries complete in < 30s wall-clock time

**Blocked-by:** T-040, T-041, T-039b, T-039c, T-042, T-043, T-044, T-036-F

---

### Wave 0 Phase Summary

| Phase | Tasks | Total Effort |
|---|---|---|
| 0 — Infrastructure & Scaffolding | T-001 to T-007, T-002b | ~2.5d |
| 1 — Data Ingestion Pipeline | T-008 to T-013 | ~3d |
| 2 — Vector Search & Embeddings | T-014, T-015 | ~6h |
| 3 — GraphRAG | T-016 to T-019 | ~1.5d |
| 4 — SQL Tool & Pre-built Queries | T-020, T-021 | ~8h |
| 5 — Agent Orchestrator | T-022 to T-025 | ~2.5d |
| 6 — FastAPI Backend & CLI | T-026 to T-030 | ~1.5d |
| 7 — Frontend | T-031-F to T-036-F | ~2.5d |
| 8 — Docker & Deployment | T-037 to T-041, T-039b, T-039c | ~2d |
| 9 — Tests & Validation | T-042 to T-045 | ~1d |
| **Total** | **48 tasks** | **~18 working days** |

---

## Wave 1 — Performance Optimizations

> Generated from: optimize.md | Generated on: 2026-03-06 | Total tasks: 17 | **ALL COMPLETE**

### Assumptions & Clarifications

- The IVFFlat index is assumed to exist in production. Verify with `\d incident_embeddings` in psql before the HNSW migration is run.
- The Render deployment is assumed to run a single instance. Pool sizing values assume a single-process deployment.
- Neon's support for `CREATE INDEX CONCURRENTLY` must be validated on a dev database before applying to production.
- `anthropic==0.40.0` includes `AsyncAnthropic` (available since ~0.20.0).
- The graph expander's string-interpolated `IN (...)` SQL assumes node IDs are internal UUIDs and do not originate from user input.
- `orjson` is not currently in `requirements.txt`; T-07 must add it explicitly since the project does not use `fastapi[all]`.

---

### Wave 1 Summary Table

| Task | Description | Owner | Effort | Blocked by |
|---|---|---|---|---|
| T-01 | Wrap `orchestrator.run()` in `run_in_threadpool` to unblock event loop | backend-architect | XS | none |
| T-02 | Add LRU embedding cache in `EmbeddingModel` | backend-architect | S | none |
| T-03 | Update `VectorSearchTool` to use the LRU embedding cache | backend-architect | XS | T-02 |
| T-04 | Tune sync DB engine pool settings and add `pool_recycle` to both engines | backend-architect | XS | none |
| T-05 | Add early-exit guard for empty claims before `verify_claims` | backend-architect | XS | none |
| T-06 | Add module-level singleton caching to `get_fast_llm_client()` | backend-architect | XS | none |
| T-07 | Add `ORJSONResponse` as default response class and add `orjson` to requirements | backend-architect | XS | none |
| T-08 | Add `GZipMiddleware` to FastAPI app | backend-architect | XS | none |
| T-09 | Add `Cache-Control: no-store` header to `/healthz` endpoint | backend-architect | XS | none |
| T-10 | Write Alembic migration: drop IVFFlat, create HNSW indexes for both domains | deployment-engineer | M | none |
| T-11 | Remove `SET ivfflat.probes` and add `hnsw.ef_search` in `retrieval.py` + session engine | backend-architect | XS | T-10 |
| T-12 | Write Alembic migration: composite indexes on `graph_edge(from_node, type)` and `(to_node, type)` | deployment-engineer | S | none |
| T-13 | Refactor graph expander to use parameterized `ANY(:array)` and merge outgoing+incoming edge queries | backend-architect | S | T-12 |
| T-14 | Add TTL-based named query result cache to `SQLQueryTool` | backend-architect | S | none |
| T-15 | Bulk `executemany` upserts in ingest pipeline for rows and embeddings; batch commits in graph builder | backend-architect | M | none |
| T-16 | Add `AsyncAnthropic` async variant (`complete_async`) to `ClaudeClient` | backend-architect | M | none |
| T-17 | Merge classify+plan into a single Haiku call; convert orchestrator to async; convert tools to async | backend-architect | XL | T-01, T-16 |

### Parallel Work Waves

**Wave 1 (no blockers):** T-01, T-02, T-04, T-05, T-06, T-07, T-08, T-09, T-10, T-12, T-14, T-15, T-16
**Wave 2 (blocked by Wave 1):** T-03 (→T-02), T-11 (→T-10), T-13 (→T-12)
**Wave 3 (blocked by Wave 2):** T-17 (→T-01, T-16)

---

### T-01 · Wrap `orchestrator.run()` in `run_in_threadpool`

**Owner:** backend-architect | **Effort:** XS | **Blocked by:** none

`query.py`'s `async def run_query` calls the synchronous `orchestrator.run()` directly without `await` or `run_in_executor`. This blocks the uvicorn event loop for the full 3–8 second agent duration.

**Acceptance Criteria:**
- `run_query` calls `await run_in_threadpool(orchestrator.run, body.query, domain=body.domain)`
- `from fastapi.concurrency import run_in_threadpool` is imported in `query.py`

---

### T-02 · Add LRU embedding cache (`encode_single_cached`)

**Owner:** backend-architect | **Effort:** S | **Blocked by:** none

Every vector search triggers a full 384-dim inference pass (~20–80 ms on CPU). An `lru_cache(maxsize=512)` keyed on the query string eliminates this for cache hits.

**Acceptance Criteria:**
- `EmbeddingModel` has `encode_single_cached(self, text: str) -> tuple` decorated with `@functools.lru_cache(maxsize=512)`
- Returns a `tuple` of floats (hashable, required by `lru_cache`)
- Calling `encode_single_cached` with the same string twice does not invoke `self.encode()` on the second call

---

### T-03 · Update `VectorSearchTool` to call the LRU-cached embedding method

**Owner:** backend-architect | **Effort:** XS | **Blocked by:** T-02

**Acceptance Criteria:**
- `VectorSearchTool.run()` calls `model.encode_single_cached(query_text)` and wraps the result with `np.array(cached, dtype=np.float32)`

---

### T-04 · Tune sync DB engine pool settings

**Owner:** backend-architect | **Effort:** XS | **Blocked by:** none

Under 3–5 concurrent requests, the 5-connection sync pool is exhausted. Neon also closes idle connections; `pool_recycle=1800` prevents stale-connection errors after Render cold starts.

**Acceptance Criteria:**
- Sync engine explicitly sets `pool_size=10`, `max_overflow=10`, `pool_timeout=30`, `pool_recycle=1800`
- Async engine adds `pool_recycle=1800` and `pool_timeout=30`

---

### T-05 · Add early-exit guard for empty `raw_claims` before `verify_claims`

**Owner:** backend-architect | **Effort:** XS | **Blocked by:** none

**Acceptance Criteria:**
- Orchestrator checks `if raw_claims:` before calling `verify_claims`; when false, sets `verified_claims = []` without calling the LLM

---

### T-06 · Add module-level singleton to `get_fast_llm_client()`

**Owner:** backend-architect | **Effort:** XS | **Blocked by:** none

**Acceptance Criteria:**
- Module-level `_fast_llm_singleton: LLMClient | None = None` added to `client.py`
- `get_fast_llm_client()` initializes and caches the singleton on first call

---

### T-07 · Set `ORJSONResponse` as FastAPI default response class

**Owner:** backend-architect | **Effort:** XS | **Blocked by:** none

**Acceptance Criteria:**
- `orjson==3.10.12` added to `backend/requirements.txt`
- `FastAPI(...)` constructor includes `default_response_class=ORJSONResponse`

---

### T-08 · Add `GZipMiddleware` to the FastAPI app

**Owner:** backend-architect | **Effort:** XS | **Blocked by:** none

**Acceptance Criteria:**
- `app.add_middleware(GZipMiddleware, minimum_size=1000, compresslevel=4)` called before CORS middleware

---

### T-09 · Add `Cache-Control: no-store` header to `/healthz`

**Owner:** backend-architect | **Effort:** XS | **Blocked by:** none

**Acceptance Criteria:**
- `/healthz` route returns `ORJSONResponse({"status": "ok"}, headers={"Cache-Control": "no-store"})`

---

### T-10 · Write Alembic migration: replace IVFFlat with HNSW indexes

**Owner:** deployment-engineer | **Effort:** M | **Blocked by:** none

**Acceptance Criteria:**
- `upgrade()` drops IVFFlat index and creates HNSW indexes using `USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)` via `CREATE INDEX CONCURRENTLY`
- Applied to both `incident_embeddings` and `medical_embeddings`
- `downgrade()` drops both HNSW indexes

---

### T-11 · Replace `SET ivfflat.probes` with `hnsw.ef_search`

**Owner:** backend-architect | **Effort:** XS | **Blocked by:** T-10

**Acceptance Criteria:**
- `retrieval.py` no longer contains `SET ivfflat.probes`
- Async engine in `session.py` includes `connect_args={"server_settings": {"hnsw.ef_search": "40"}}`

---

### T-12 · Write Alembic migration: composite indexes on `graph_edge`

**Owner:** deployment-engineer | **Effort:** S | **Blocked by:** none

**Acceptance Criteria:**
- `upgrade()` creates `idx_graph_edge_from_type ON graph_edge (from_node, type)` via `CREATE INDEX CONCURRENTLY`
- `upgrade()` creates `idx_graph_edge_to_type ON graph_edge (to_node, type)` via `CREATE INDEX CONCURRENTLY`
- `downgrade()` drops both indexes

---

### T-13 · Refactor graph expander: parameterized `ANY(:array)`, merged edge query

**Owner:** backend-architect | **Effort:** S | **Blocked by:** T-12

**Acceptance Criteria:**
- f-string `placeholders = ", ".join(f"'{nid}'" for nid in chunk)` pattern removed
- Edge lookup uses `WHERE (from_node = ANY(:node_ids) OR to_node = ANY(:node_ids)) AND type = ANY(:edge_types)` with bound parameters
- Separate outgoing and incoming query loops merged into a single query per chunk/hop

---

### T-14 · Add TTL-based named query result cache to `SQLQueryTool`

**Owner:** backend-architect | **Effort:** S | **Blocked by:** none

**Acceptance Criteria:**
- Module-level `_named_query_cache: dict[str, tuple[float, dict]] = {}` and `CACHE_TTL_SECONDS = 300` added
- `SQLQueryTool` exposes `run_named_cached(name, params)` method with TTL-based cache

---

### T-15 · Replace row-by-row inserts with bulk `executemany`

**Owner:** backend-architect | **Effort:** M | **Blocked by:** none

**Acceptance Criteria:**
- `_upsert_dataframe_sync()` passes a list of row dicts to `session.execute(sql, [list_of_dicts])`
- `_embed_and_store_sync()` similarly uses bulk `executemany` for embedding insertions
- `graph/builder.py` commits only every 500 rows (or at loop end)

---

### T-16 · Add `AsyncAnthropic` and `complete_async()` to `ClaudeClient`

**Owner:** backend-architect | **Effort:** M | **Blocked by:** none

**Acceptance Criteria:**
- `from anthropic import AsyncAnthropic` imported in `client.py`
- `ClaudeClient.__init__` instantiates `self._async_client = AsyncAnthropic(api_key=key)`
- `ClaudeClient.complete_async(prompt, system, json_mode, max_tokens)` implemented as `async def`

---

### T-17 · Merge classify+plan into one Haiku call; convert orchestrator and tools to async

**Owner:** backend-architect | **Effort:** XL | **Blocked by:** T-01, T-16

**Note:** Encompasses (a) new `classify_and_plan()` function, (b) full async conversion of `orchestrator.run()` with `asyncio.gather`, and (c) async conversion of all tool implementations.

**Acceptance Criteria:**
- New `classify_and_plan_async(query, fast_llm_client, domain)` returns `{"intent": ..., "steps": [...]}` in a single Haiku API call
- `orchestrator.run()` converted to `async def run(...)` using `asyncio.gather` for parallel tool execution
- All tool `run()` methods converted to `async def run(...)` using async session
- CPU-bound embedding inference wrapped in `asyncio.get_running_loop().run_in_executor(None, ...)`

---

## Wave 2 — RAG & Agent Optimizations

> Generated: 2026-03-06 | Based on code analysis of post-TASKS2 codebase state (all T-01–T-17 applied, BUG-001–BUG-008 fixed).

All 17 Wave 1 items have been implemented and all eight findings.md bugs have been patched. What remains are retrieval quality gaps, observability gaps, structured-output gaps, and several smaller correctness issues.

### Wave 2 Summary Table

| Task | Priority | Effort | Status | Impact |
|---|---|---|---|---|
| T3-01 | High | M | DONE | Prevents silent claim degradation on malformed LLM output |
| T3-02 | High | M | DONE | Token cost visibility + per-stage latency for diagnosis |
| T3-03 | High | L | DONE | BM25+vector hybrid — improves keyword query recall significantly |
| T3-04 | High | M | DONE | Eliminates redundant agent loops for repeated example queries |
| T3-05 | Medium | S | SKIPPED | Removes string serialization overhead on every vector search |
| T3-06 | Medium | S | DONE | Reduces duplicate evidence in synthesis, improves answer breadth |
| T3-07 | Medium | S | DONE | Conflict signal now reaches verifier; fallback confidence ranked |
| T3-08 | Medium | S | DONE | Fixes blocking sync call in async GET /runs/{run_id} handler |
| T3-09 | Medium | M | DONE | Graph expansion no longer occupies thread via run_sync |
| T3-10 | Medium | S | DONE | Transient API errors retry before falling back to degraded answer |
| T3-11 | Medium | M | DONE | Citation char offsets are correct; sentence-boundary chunking |
| T3-12 | Medium | M | DONE | Async orchestrator path has integration test coverage |
| T3-13 | Medium | M | DONE | Medical domain queries return results (currently zero hits) |
| T3-14 | Low | S | DONE | Async tool hangs are time-bounded on all platforms |
| T3-15 | Low | XS | DONE | Removes tqdm ANSI noise from Render server logs |

### Parallel Work Waves

**Wave 1 (no blockers):** T3-01, T3-02, T3-03, T3-05, T3-06, T3-07, T3-08, T3-09, T3-10, T3-11, T3-13, T3-14, T3-15
**Wave 2 (blocked by Wave 1):** T3-04 (→T3-01), T3-12 (benefits from T3-01)

---

### T3-01: Add Pydantic validation + one-shot retry for all LLM structured outputs [DONE]

**Priority:** High | **Effort:** M | **Dependencies:** none

Every LLM call that expects JSON does a raw `json.loads(response)` and then accesses dict keys with `.get()`. If the model returns structurally valid JSON but with wrong field names or wrong value types, the error is silently swallowed.

**Specific locations:**
- `backend/app/agent/orchestrator.py` — `synthesis = json.loads(synthesis_response)` — no schema validation
- `backend/app/agent/verifier.py` — `data = json.loads(response)` then `data.get("verified_claims", [])` — no structural check
- `backend/app/agent/intent.py` — `data = json.loads(response)` — no validation that `steps` entries contain `tool`, `tool_inputs`, `step_number`
- `backend/app/llm/client.py` `_parse_response_text()` — logs a warning on invalid JSON but returns the raw string

**Implementation:**
- Define three Pydantic models: `ClassifyPlanOutput`, `SynthesisOutput`, `VerifyOutput` in `backend/app/schemas/llm_outputs.py`
- In each caller, wrap `json.loads` result in `Model.model_validate(data)`. On `ValidationError`, issue exactly one retry with error-correction prefix, then validate again. If retry also fails, fall through to existing fallback.
- Add a test that injects a mock LLM returning structurally invalid JSON and asserts the retry fires exactly once.

---

### T3-02: Token usage tracking and per-stage latency histograms [DONE]

**Priority:** High | **Effort:** M | **Dependencies:** none

The LLM logs in `client.py` record `prompt_chars` and `output_chars` but not token counts. The Anthropic SDK response object at `response.usage` already contains `input_tokens` and `output_tokens` — these are never logged.

**Implementation:**
- In `client.py` `complete()` and `complete_async()`: add `input_tokens`, `output_tokens`, and `estimated_cost_usd` to the LLM response log entry.
- In `orchestrator.py` `run()`: add `_state_timings: dict[str, float]` dict. Record `time.perf_counter()` at the start and end of each named state block (CLASSIFY+PLAN, EXECUTE_TOOLS, EXPAND_GRAPH, SYNTHESISE, VERIFY, SAVE).
- Extend `RunSummary` Pydantic schema to include `state_timings_ms: dict[str, float] = Field(default_factory=dict)`.

---

### T3-03: Hybrid BM25 + vector search (sparse-dense fusion) [DONE]

**Priority:** High | **Effort:** L | **Dependencies:** none

`retrieval.py` uses pure cosine similarity over dense embeddings. BM25 excels on exact-keyword queries where the dense model under-performs — for example, "find defect_id BOLT-2847" or "show incidents mentioning hydraulic pump part number 4792".

**Implementation:**
- Write a new Alembic migration adding GIN full-text indexes on `incident_reports.narrative` and `medical_cases.narrative`.
- Add `bm25_search(session, query_text, top_k, domain)` function in `retrieval.py`.
- Add `hybrid_search(session, query_embedding, query_text, top_k, alpha, domain)` using Reciprocal Rank Fusion (RRF): `score = 1/(k + rank_vector) + 1/(k + rank_bm25)` where `k=60`.
- Update `VectorSearchTool.run_async()` to accept `search_mode: Literal["vector", "hybrid"] = "vector"`.
- Update `orchestrator.py` to pass `search_mode="hybrid"` for `hybrid` and `compute` intents.
- `alpha` parameter from `config.yaml` with default `0.7`.

---

### T3-04: Semantic query cache (skip full agent loop for near-duplicate queries) [DONE]

**Priority:** High | **Effort:** M | **Dependencies:** T3-01

The `agent_runs` table persists every query result. However, the orchestrator never checks it before running. The frontend example queries fire the same ~14 fixed queries repeatedly, each costing 3-8 seconds and ~$0.003.

**Implementation:**
- Add `async def _check_cache(query, domain, ttl_seconds=300)` in `query.py`. Queries `agent_runs` for the same `(query, domain)` pair within 5 minutes.
- In `run_query()`: call `_check_cache()` before `orchestrator.run()`. On a hit, skip the agent loop entirely.
- Add Alembic migration: `CREATE INDEX CONCURRENTLY idx_agent_runs_query_domain_ts ON agent_runs (query, domain, created_at DESC)`.
- Encode domain in the query key as `f"{domain}::{query}"` (simpler, no migration needed).

---

### T3-05: Fix embedding serialisation anti-pattern in retrieval.py [SKIPPED]

**Priority:** Medium | **Effort:** S | **Dependencies:** none

`retrieval.py` line 70 converts the 384-dim numpy array to a Python list string before binding it to the SQL query: `"embedding": str(query_embedding.tolist())`. The `pgvector` Python package provides native numpy array binding via `register_vector()`.

*Skipped — deferred to future wave; string binding works correctly, performance impact is low.*

---

### T3-06: MMR (Maximal Marginal Relevance) deduplication of vector hits [DONE]

**Priority:** Medium | **Effort:** S | **Dependencies:** none

The current `vector_search()` returns the top-k chunks by cosine similarity. When multiple chunks from the same incident are retrieved, the synthesis prompt contains near-duplicate text.

**Implementation:**
- Add `mmr_rerank(hits: list[dict], query_embedding: np.ndarray, lambda_: float = 0.7, top_k: int = 8) -> list[dict]` in `retrieval.py`.
- Call `mmr_rerank()` in `VectorSearchTool.run_async()` after `vector_search()` returns. Fetch `top_k * 2` from DB, then MMR-select `top_k`.
- `lambda_` configurable via `config.yaml` (default `0.7` = 70% relevance, 30% diversity).

---

### T3-07: Verifier — expose conflict_note and reduce fallback confidence correctly [DONE]

**Priority:** Medium | **Effort:** S | **Dependencies:** none

1. `conflict=True` from `scorer.py` never reaches `verifier.py` — the verifier passes `evidence[:5]` without their `conflict` flag.
2. `_fallback_verification()` assigns identical `base_confidence` to every claim regardless of support.

**Implementation:**
- In `verify_claims_async()` and `verify_claims()`: include `conflict_flagged: item.get("conflict", False)` in `evidence_summary`.
- In `_fallback_verification()`: assign confidence proportional to claim position (first claim = `base_confidence`, each subsequent = `base_confidence - 0.05 * idx`, floored at 0.2).

---

### T3-08: GET /runs/{run_id} uses sync session inside async handler [DONE]

**Priority:** Medium | **Effort:** S | **Dependencies:** none

`query.py` `get_run()` is declared `async def` but calls `get_sync_session()` directly inside the handler body. This blocks the event loop for the duration of the DB round-trip (~5-20 ms per Neon connection).

**Implementation:**
- Change `get_run()` to use `async with get_session() as session:` with `await session.execute(...)`.
- Remove the `get_sync_session` import from `query.py` if no longer used.

---

### T3-09: graph/expander.py expand_graph_async uses run_sync [DONE]

**Priority:** Medium | **Effort:** M | **Dependencies:** none

`expand_graph_async()` uses `await session.run_sync(lambda sync_session: expand_graph(...))`. This means every graph expansion occupies a thread for its full duration (50-200 ms).

**Implementation:**
- Write `_expand_graph_async_native(session: AsyncSession, seed_ids, k)` that replicates the BFS loop using `await session.execute()` for each SQL query.
- Update `expand_graph_async()` to use `_expand_graph_async_native()` directly without `run_sync`.
- Sync `expand_graph()` unchanged.

---

### T3-10: Add LLM call retry with exponential backoff for transient API errors [DONE]

**Priority:** Medium | **Effort:** S | **Dependencies:** none

`ClaudeClient.complete()` and `complete_async()` have no retry logic. Anthropic's API returns HTTP 529 ("overloaded") and HTTP 500 errors during peak load on Render free tier.

**Implementation:**
- In `ClaudeClient.__init__()`, set `max_retries=3` explicitly on both `self._client` and `self._async_client`.
- Add logging before the API call that includes a `call_attempt` counter.
- Wrap `complete_async()` in a `try/except anthropic.APIStatusError` block with retry logging.

---

### T3-11: Chunker — fix char_start=-1 silent fallback and add sentence-boundary awareness [DONE]

**Priority:** Medium | **Effort:** M | **Dependencies:** none

`chunker.py` `_find_char_offset()` uses `source.find(target)` which returns `-1` when the target string is not found. The caller clamps `max(char_start, 0)` — so both offsets become 0, meaning the citation points to the beginning of the document regardless of where the chunk actually is.

**Implementation:**
- Fix `_find_char_offset()`: when `source.find(target)` returns `-1`, try with the first 100 characters of `target` (stripped). If even the fallback fails, return `(-1, -1)` explicitly and let the caller store `NULL` rather than `0, 0`.
- Add sentence-boundary snapping to `chunk_text()`: after computing the token window, check if the chunk starts mid-sentence and trim back to the nearest period/newline if so.

---

### T3-12: Add structured test infrastructure for async orchestrator and LLM mock [DONE]

**Priority:** Medium | **Effort:** M | **Dependencies:** none

`backend/tests/` has no tests that exercise the async `orchestrator.run()` path end-to-end. The T-17 async orchestrator, `classify_and_plan_async()`, and `verify_claims_async()` are all untested at the integration level.

**Implementation:**
- Create `backend/tests/stubs/llm_mock.py`: a `MockLLMClient(LLMClient)` with pre-programmed JSON responses.
- Update `backend/tests/conftest.py` to provide a `mock_llm` fixture.
- Write `backend/tests/test_orchestrator_async.py` with four test cases: `test_vector_only_query`, `test_hybrid_query_parallel_tools`, `test_synthesis_json_invalid_triggers_retry`, `test_max_steps_fallback`.

---

### T3-13: Ingest pipeline — medical domain embed_and_store not implemented [DONE]

**Priority:** Medium | **Effort:** M | **Dependencies:** none

`pipeline.py` `_embed_and_store_sync()` only processes `incident_reports` → `incident_embeddings`. The `medical_embeddings` table is never populated, so every medical-domain query returns zero hits.

**Implementation:**
- Add `_embed_and_store_medical_sync(session, chunk_size=400, overlap=75, batch_size=256)` in `pipeline.py` following the same pattern as `_embed_and_store_sync()` but targeting `medical_cases` → `medical_embeddings`.
- Call `_embed_and_store_medical_sync()` in `run_ingest_pipeline()` after the existing `_embed_and_store_sync()` call.
- Add `medical_chunks_embedded` key to the `summary` dict returned by `run_ingest_pipeline()`.

---

### T3-14: Add per-tool asyncio timeout using asyncio.wait_for in orchestrator [DONE]

**Priority:** Low | **Effort:** S | **Dependencies:** none

The async `run_async()` methods on all tools have **no timeout enforcement at all**. If pgvector or the embedding model hangs, the async path has no timeout — the request will hang indefinitely.

**Implementation:**
- In `orchestrator.py`, wrap each tool `await` call with `asyncio.wait_for(..., timeout=self.tool_timeout_seconds)`.
- Handle `asyncio.TimeoutError` specifically — log at WARNING level with `tool_name` and `timeout_seconds`, then treat the step as an error. Do not re-raise.

---

### T3-15: show_progress_bar suppressed — add isatty() check [DONE]

**Priority:** Low | **Effort:** XS | **Dependencies:** none

`embeddings.py` line 77: `show_progress_bar=len(texts) > 500`. On the Render server, this emits tqdm progress bars to stderr for batches >500 texts, adding ANSI noise to the log stream.

**Implementation:**
- Change to: `show_progress_bar=len(texts) > 500 and sys.stderr.isatty()`
- Add `import sys` to `embeddings.py` if not already present.
