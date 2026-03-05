# TASKS.md — NextAgentAI: Agentic Manufacturing Intelligence MVP

**Generated:** 2026-03-04
**Source PRD:** PRD.md v1.0
**Owner Roles:** `backend-architect` | `frontend-developer` | `deployment-engineer`
**Effort Scale:** S ≈ 2h | M ≈ 4h | L ≈ 8h | XL ≈ 2d

Tasks are numbered in strict dependency order. No task may begin until every task in its **Blocked-by** list is marked complete.

---

## Phase 0: Infrastructure & Scaffolding

---

### T-001 — Initialise repo structure and base configuration files

**Owner:** `deployment-engineer`
**Effort:** M

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

**Owner:** `deployment-engineer`
**Effort:** M

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

**Owner:** `deployment-engineer`
**Effort:** S

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

**Owner:** `backend-architect`
**Effort:** S

**Description:**
Create `backend/requirements.txt` with all Python dependencies pinned at the minor version. Verify the environment installs cleanly.

**Acceptance Criteria:**
- `requirements.txt` includes (at minimum): `fastapi`, `uvicorn[standard]`, `sqlalchemy`, `alembic`, `psycopg2-binary`, `pgvector`, `anthropic`, `sentence-transformers`, `kagglehub`, `pydantic`, `pydantic-settings`, `python-dotenv`, `spacy`, `pytest`, `httpx`
- `pip install -r requirements.txt` completes without errors on Python 3.11+
- `python -c "import fastapi, sqlalchemy, anthropic, sentence_transformers, kagglehub"` exits 0

**Blocked-by:** T-001

---

### T-004 — SQLAlchemy ORM models and Alembic migration baseline

**Owner:** `backend-architect`
**Effort:** M

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

**Owner:** `backend-architect`
**Effort:** S

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

**Owner:** `backend-architect`
**Effort:** S

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

**Owner:** `backend-architect`
**Effort:** S

**Description:**
Implement `backend/app/observability/logging.py`. All log entries must be newline-delimited JSON. Logs must not contain API keys or raw PII.

**Acceptance Criteria:**
- `get_logger(name)` returns a logger that emits JSON lines to stdout with fields: `timestamp`, `level`, `logger`, `message`, `extra`
- A `scrub_secrets(record)` filter strips any field value matching the pattern of the `ANTHROPIC_API_KEY` or `PG_DSN`
- Logger used in at least one module (e.g., `session.py`) without errors
- Running `python -c "from backend.app.observability.logging import get_logger; get_logger('test').info('ok')"` emits valid JSON

**Blocked-by:** T-003

---

## Phase 1: Data Ingestion Pipeline

---

### T-008 — Synthetic incident narrative generator

**Owner:** `backend-architect`
**Effort:** L

**Description:**
Implement `backend/app/ingest/synthetic.py`. Generate 10,000 synthetic incident report rows as a CSV and optionally insert directly into `incident_reports`. Rows must cover a variety of assets, systems, subsystems, severities, and narrative styles to support meaningful vector search diversity.

**Acceptance Criteria:**
- `generate_synthetic_incidents(n=10000, output_path=...) -> pd.DataFrame` produces a DataFrame with all columns: `incident_id`, `asset_id`, `system`, `sub_system`, `event_date`, `location`, `severity`, `narrative`, `corrective_action`, `source='synthetic'`
- At least 5 distinct values each for `system`, `sub_system`, `severity`
- `narrative` field averages 80–200 words (sufficient for chunking)
- Output CSV written to path from `config.yaml` (`data/synthetic/incidents_synth.csv`)
- Function is idempotent: re-running does not raise if file already exists (checks first)
- 10,000 rows generated in < 60s on a modern laptop

**Blocked-by:** T-005, T-007

---

### T-009 — Kaggle dataset loader and column mapper

**Owner:** `backend-architect`
**Effort:** L

**Description:**
Implement `backend/app/ingest/kaggle_loader.py`. Downloads the three Kaggle datasets using `kagglehub`, applies per-dataset column mapping to canonical schema, and returns typed DataFrames. Must fall back to `demo/seed_sql/` CSV fixtures if Kaggle credentials are absent.

**Acceptance Criteria:**
- `load_manufacturing_defects(config) -> pd.DataFrame` maps `fahmidachowdhury/manufacturing-defects` columns to: `defect_id`, `product`, `defect_type`, `severity`, `inspection_date`, `plant`, `lot_number`, `action_taken`
- `load_defects_supplemental(config) -> pd.DataFrame` maps `rabieelkharoua/predicting-manufacturing-defects-dataset` to the same canonical schema
- `load_maintenance_logs(config) -> pd.DataFrame` maps `merishnasuwal/aircraft-historical-maintenance-dataset` to: `log_id`, `asset_id`, `ts`, `metric_name`, `metric_value`, `unit`
- If `KAGGLE_USERNAME`/`KAGGLE_KEY` are absent, loader reads from `demo/seed_sql/*.csv` fallback fixtures and logs a `WARNING`
- All three functions raise `ValueError` with column name in message if a required source column is missing
- `demo/seed_sql/` directory contains at least 3 seed CSV files (one per dataset) with ≥ 20 rows each to support demo without Kaggle credentials

**Blocked-by:** T-005, T-007

---

### T-010 — Database bulk-load for all three canonical tables

**Owner:** `backend-architect`
**Effort:** M

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

**Owner:** `backend-architect`
**Effort:** M

**Description:**
Implement `backend/app/rag/chunker.py`. Split narrative text into overlapping token-window chunks suitable for embedding.

**Acceptance Criteria:**
- `chunk_text(text: str, chunk_size: int = 400, overlap: int = 75) -> list[dict]` returns list of `{chunk_index, chunk_text, char_start, char_end}`
- Chunks respect token boundaries (use `tiktoken` or equivalent); chunk size 300–600 tokens, overlap 50–100 tokens (defaults from config)
- Overlap windows are consistent: `chunk[i+1]` starts `overlap` tokens before `chunk[i]` ends
- A 1,000-token document with size=400, overlap=75 produces exactly the expected chunk count (verify formula)
- No chunk is empty or whitespace-only

**Blocked-by:** T-003

---

### T-012 — Local embedding wrapper

**Owner:** `backend-architect`
**Effort:** S

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

**Owner:** `backend-architect`
**Effort:** M

**Description:**
Wire T-011 and T-012 together: for each incident report, chunk the narrative, embed each chunk, and write rows to `incident_embeddings`.

**Acceptance Criteria:**
- `embed_and_store_incidents(session, config)` processes all rows in `incident_reports`
- Each chunk produces one row in `incident_embeddings` with: `embed_id` (UUID), `incident_id`, `chunk_index`, `chunk_text`, `embedding` (vector(384))
- Processes in batches of 256 chunks; batch size configurable
- Re-running skips incidents already embedded (idempotent)
- After full ingest: `SELECT COUNT(*) FROM incident_embeddings` returns ≥ 10,000 (roughly 1+ chunk per incident on average)
- 10k incidents embedded in < 5 minutes on CPU

**Blocked-by:** T-010, T-011, T-012

---

## Phase 2: Vector Search & Embeddings

---

### T-014 — pgvector IVFFlat index and retrieval module

**Owner:** `backend-architect`
**Effort:** M

**Description:**
Implement `backend/app/rag/retrieval.py`. Perform cosine similarity search via pgvector, applying optional metadata filters. The IVFFlat index is created by the Alembic migration (T-004).

**Acceptance Criteria:**
- `vector_search(session, query_embedding, top_k=8, filters={}) -> list[dict]` returns items with: `chunk_id`, `incident_id`, `score`, `excerpt`, `metadata`
- Supports filters: `system` (exact match), `severity` (exact match), `date_range` (tuple of ISO date strings)
- Uses `<=>` cosine distance operator via pgvector
- Results ordered by ascending distance (highest similarity first)
- Returns results in < 500ms against a 10k-incident dataset (verified with `time.perf_counter`)
- Returns empty list (not an error) when no results exceed `similarity_threshold`

**Blocked-by:** T-013

---

### T-015 — VectorSearchTool wrapper

**Owner:** `backend-architect`
**Effort:** S

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

## Phase 3: GraphRAG (Graph Build + Query)

---

### T-016 — Entity extraction for graph construction

**Owner:** `backend-architect`
**Effort:** M

**Description:**
Implement entity extraction logic in `backend/app/graph/builder.py` using spaCy `en_core_web_sm`. Extract entities from incident narratives to be used as graph nodes.

**Acceptance Criteria:**
- `extract_entities(text: str) -> list[dict]` returns entities with: `label` (text), `type` (mapped from spaCy entity type to one of: `asset`, `system`, `subsystem`, `product`, `defect_type`, or `other`), `char_start`, `char_end`
- spaCy model `en_core_web_sm` loaded once as a singleton
- Entities of type `PRODUCT`, `ORG`, `FAC` mapped to appropriate canonical types; fallback to `other`
- Custom regex patterns supplement spaCy for domain terms (e.g., "ASSET-\d+", "Line \d+", "SN-\d+")
- `extract_entities("Hydraulic actuator crack on Line 1 asset ASSET-247")` returns ≥ 2 entities

**Blocked-by:** T-003

---

### T-017 — Graph node and edge construction at ingest

**Owner:** `backend-architect`
**Effort:** L

**Description:**
Complete `backend/app/graph/builder.py`. For each chunk: create chunk nodes, extract and create entity nodes, create `mentions` edges (chunk→entity), create `co_occurrence` edges (entity→entity within same chunk), and create `similarity` edges (chunk→chunk where cosine similarity > threshold).

**Acceptance Criteria:**
- `build_graph(session, config)` processes all rows in `incident_embeddings`
- `graph_node` populated with one row per unique entity and one row per chunk; `type` field is `'entity'` or `'chunk'`
- `graph_edge` contains: `mentions` edges from chunk to every entity it references; `co_occurrence` edges between entity pairs in the same chunk; `similarity` edges between chunk pairs whose embedding cosine similarity exceeds `graph.edge_similarity_threshold` (0.80)
- Similarity edges computed in batch using chunk embedding matrix (not pairwise at query time)
- Upsert on conflict: re-running `build_graph` does not create duplicate nodes or edges
- After full ingest: `SELECT COUNT(*) FROM graph_node` > 0 and `SELECT COUNT(*) FROM graph_edge` > 0

**Blocked-by:** T-013, T-016

---

### T-018 — k-hop graph expander

**Owner:** `backend-architect`
**Effort:** M

**Description:**
Implement `backend/app/graph/expander.py`. Starting from a set of seed chunk/entity IDs, expand to k-hop neighbours via recursive SQL CTEs or iterative queries.

**Acceptance Criteria:**
- `expand_graph(session, seed_ids: list[str], k: int = 2) -> dict` returns `{nodes: list[GraphNode], edges: list[GraphEdge]}`
- Expansion follows both `mentions` and `co_occurrence` edge types; `similarity` edges included at hop 1 only
- Result contains all nodes and edges within k hops of any seed node
- k=0 returns only seed nodes; k=2 returns up to 2 hops as per config default
- Expansion of 8 seed nodes with k=2 completes in < 2s against the seeded graph

**Blocked-by:** T-017

---

### T-019 — Graph evidence re-ranker

**Owner:** `backend-architect`
**Effort:** M

**Description:**
Implement `backend/app/graph/scorer.py`. Re-rank expanded graph evidence by combining vector similarity score, edge weight, and recency.

**Acceptance Criteria:**
- `rank_evidence(vector_hits: list, graph_nodes: list, graph_edges: list, config) -> list[dict]` returns a ranked list of evidence items
- Score formula: `0.5 * similarity_score + 0.3 * edge_weight + 0.2 * recency_score` (recency normalised 0–1 over dataset date range)
- Output items include: `node_id`, `type`, `text_excerpt`, `composite_score`, `source_incident_id`
- Conflicting sources (same entity, contradictory evidence) flagged with `conflict=True` in item metadata
- Returns at most `top_k * 2` items (configurable ceiling)

**Blocked-by:** T-018

---

## Phase 4: SQL Tool & Pre-built Queries

---

### T-020 — SQL guardrail and SQLQueryTool

**Owner:** `backend-architect`
**Effort:** M

**Description:**
Implement `backend/app/tools/sql_tool.py`. Enforce SELECT-only access via regex before executing any SQL. Implement four pre-built named queries.

**Acceptance Criteria:**
- `SQLQueryTool.run(sql: str) -> dict` raises `SQLGuardrailError` for any statement matching (case-insensitive): `\b(DROP|DELETE|UPDATE|INSERT|CREATE|ALTER|TRUNCATE)\b`
- Returns on success: `{columns: list[str], rows: list[list], row_count: int, latency_ms: float}`
- Pre-built named queries accessible via `SQLQueryTool.run_named(name, params)`:
  - `defect_counts_by_product`: counts grouped by `product`, `defect_type` filtered to last N days
  - `severity_distribution`: count per severity level across `manufacturing_defects`
  - `maintenance_trends`: event counts by `metric_name` grouped by month
  - `incidents_defects_join`: join `incident_reports` and `manufacturing_defects` on `asset_id` returning matched pairs
- Regex guardrail tested against: `DROP TABLE foo`, `delete from bar`, `UPDATE x SET y=1`, `insert into z`, `CREATE INDEX`, `ALTER TABLE`, `TRUNCATE foo` — all must raise
- Valid `SELECT COUNT(*) FROM incident_reports` must pass and return correct row count

**Blocked-by:** T-005

---

### T-021 — PythonComputeTool (sandboxed execution)

**Owner:** `backend-architect`
**Effort:** M

**Description:**
Implement `backend/app/tools/compute_tool.py`. Allow the agent to execute simple Python snippets for arithmetic/statistical computation. Sandbox by restricting builtins and blocking imports of dangerous modules.

**Acceptance Criteria:**
- `PythonComputeTool.run(code: str, context: dict = {}) -> dict` executes code in a restricted namespace
- Blocked: `import os`, `import sys`, `import subprocess`, `open(...)`, `__import__`
- Allowed builtins: `len`, `sum`, `min`, `max`, `round`, `abs`, `sorted`, `enumerate`, `zip`, `range`, `list`, `dict`, `str`, `int`, `float`
- `context` dict injected as local variables (e.g., pass in `sql_rows` from a prior SQL result)
- Returns: `{result: any, stdout: str, error: str | None}`
- Execution timeout enforced at 5 seconds; raises `ToolTimeoutError` on breach
- Attempting `import os` raises `ToolSecurityError` (not crashes the process)

**Blocked-by:** T-005

---

## Phase 5: Agent Orchestrator

---

### T-022 — Intent classifier

**Owner:** `backend-architect`
**Effort:** M

**Description:**
Implement `backend/app/agent/intent.py`. Classify a natural language query into one of four routing intents using the LLM client with a constrained prompt.

**Acceptance Criteria:**
- `classify_intent(query: str, llm: LLMClient) -> str` returns one of: `vector_only`, `sql_only`, `hybrid`, `compute`
- Uses `json_mode=True`; parses `{"intent": "..."}` from LLM response
- Falls back to `hybrid` if LLM response cannot be parsed
- "find similar incidents" → `vector_only`
- "show defect trends by product for last 90 days" → `sql_only`
- "classify defect and recommend action" → `hybrid`
- Latency logged via structured logger

**Blocked-by:** T-006, T-007

---

### T-023 — Planner

**Owner:** `backend-architect`
**Effort:** M

**Description:**
Implement `backend/app/agent/planner.py`. Generate a numbered step-by-step tool execution plan from the intent and query.

**Acceptance Criteria:**
- `generate_plan(query: str, intent: str, llm: LLMClient) -> list[dict]` returns an ordered list of plan steps
- Each step: `{step_number: int, description: str, tool: str, tool_inputs: dict}`
- Plan returned as user-visible text before any tool executes (returned in agent run output)
- `vector_only` intent produces a plan with exactly one `VectorSearchTool` step
- `hybrid` intent produces a plan with at least one vector step and one SQL step
- `sql_only` intent produces a plan using `SQLQueryTool` with appropriate named query or generated SQL

**Blocked-by:** T-022

---

### T-024 — Claim verifier and confidence scorer

**Owner:** `backend-architect`
**Effort:** M

**Description:**
Implement `backend/app/agent/verifier.py`. After synthesis, verify each claim against the evidence set and assign a confidence score.

**Acceptance Criteria:**
- `verify_claims(claims: list[dict], evidence: list[dict], llm: LLMClient) -> list[dict]` returns claims with `confidence` field added/updated
- Each returned claim: `{text: str, confidence: float, citations: list[dict]}`
- Citation: `{chunk_id: str, incident_id: str, char_start: int, char_end: int}`
- Confidence reduced when fewer than 2 evidence items support a claim
- Conflicting evidence (flagged by scorer, T-019) reduces confidence by at least 0.2 and adds `conflict_note` to claim
- Claims unsupported by any evidence get `confidence ≤ 0.3`

**Blocked-by:** T-019, T-006

---

### T-025 — Agent orchestrator state machine

**Owner:** `backend-architect`
**Effort:** XL

**Description:**
Implement `backend/app/agent/orchestrator.py`. The top-level state machine that drives the full agentic loop: classify → plan → execute tools → expand graph → re-rank → synthesise → verify → return structured output.

**Acceptance Criteria:**
- `AgentOrchestrator.run(query: str) -> AgentRunResult` executes the full loop
- State transitions logged: `intent`, `plan`, `tool_start`, `tool_end`, `graph_expand`, `synthesise`, `verify`
- Max 10 tool-call steps enforced; if limit reached, agent returns partial result with `run_summary.halted_at_step_limit=true`
- Each tool step logged with: `tool_name`, `inputs`, `output_summary`, `latency_ms`, `error`
- Output conforms to the full schema from PRD Section F4:
  ```
  answer, claims (text+confidence+citations), evidence (vector_hits+sql_rows),
  graph_path (nodes+edges), run_summary (steps+tools_used+total_latency_ms),
  assumptions, next_steps
  ```
- If no evidence found: `answer` states what was searched; `next_steps` populated with suggestions
- Run saved to `agent_runs` table with `run_id` (UUID) and full result JSON
- Demo query 1 (vector-only) executes and returns ≥ 1 claim with citation
- Demo query 2 (sql_only) executes and returns SQL rows in evidence
- Demo query 3 (hybrid) executes both vector and SQL tools and returns a cited answer

**Blocked-by:** T-015, T-020, T-021, T-023, T-024

---

## Phase 6: FastAPI Backend & CLI

---

### T-026 — FastAPI app factory and Pydantic schemas

**Owner:** `backend-architect`
**Effort:** M

**Description:**
Implement `backend/app/main.py` (FastAPI app factory with lifespan, CORS, and middleware) and all Pydantic request/response schemas in `backend/app/schemas/`.

**Acceptance Criteria:**
- `create_app()` returns a configured FastAPI application
- CORS allows `http://localhost:3000` (frontend dev origin)
- Lifespan context manager: initialises DB pool on startup, disposes on shutdown
- Request body size limit: 1MB for `/query`; 10MB for `/ingest`
- Pydantic schemas defined for:
  - `QueryRequest`: `{query: str, filters: dict | None}`
  - `QueryResponse`: full agent output schema (all fields from PRD F4)
  - `IngestResponse`: `{status: str, message: str}`
  - `ChunkResponse`: `{chunk_id: str, incident_id: str, chunk_text: str, char_start: int, char_end: int, metadata: dict}`
- `uvicorn backend.app.main:app --reload` starts without errors

**Blocked-by:** T-005, T-007

---

### T-027 — Ingest API route (`POST /ingest`)

**Owner:** `backend-architect`
**Effort:** S

**Description:**
Implement `backend/app/api/ingest.py`. Triggers the full ingestion pipeline (T-008 through T-017) as a background task.

**Acceptance Criteria:**
- `POST /ingest` returns `202 Accepted` immediately with `{status: "started", message: "..."}`
- Pipeline runs as a FastAPI `BackgroundTask`
- Pipeline completion or failure logged with structured JSON
- Calling `POST /ingest` when ingest is already running returns `409 Conflict`
- `POST /ingest` followed by waiting 5 minutes: all three canonical tables populated and `incident_embeddings` populated

**Blocked-by:** T-026, T-010, T-013, T-017

---

### T-028 — Query API routes (`POST /query`, `GET /runs/{run_id}`)

**Owner:** `backend-architect`
**Effort:** M

**Description:**
Implement `backend/app/api/query.py`. Expose the agent orchestrator via HTTP.

**Acceptance Criteria:**
- `POST /query` with body `{"query": "..."}` returns full `QueryResponse` JSON matching PRD F4 schema
- `POST /query` returns `400` if `query` is empty or > 2,000 characters
- `GET /runs/{run_id}` returns stored agent run from `agent_runs` table; returns `404` if not found
- `run_id` present in both response bodies and retrievable via `GET /runs/{run_id}`
- Response time for cached/warm query < 30s (agent timeout)
- All three demo queries return HTTP 200 with non-empty `answer`

**Blocked-by:** T-025, T-026

---

### T-029 — Docs API routes (`GET /docs`, `GET /docs/{doc_id}/chunks/{chunk_id}`)

**Owner:** `backend-architect`
**Effort:** S

**Description:**
Implement `backend/app/api/docs.py`. Allow the frontend citations drawer to fetch source chunk text.

**Acceptance Criteria:**
- `GET /docs` returns paginated list of `incident_id`, `asset_id`, `system`, `severity`, `event_date`, `source`; supports `?page=` and `?limit=` query params (max limit 100)
- `GET /docs/{doc_id}/chunks/{chunk_id}` returns `ChunkResponse` with `chunk_text` and `char_start`/`char_end`
- Returns `404` with descriptive message if `doc_id` or `chunk_id` not found
- `GET /docs/{doc_id}/chunks/{chunk_id}` used by the UI citations drawer to highlight cited spans

**Blocked-by:** T-026

---

### T-030 — CLI entrypoint (`ingest` and `ask` subcommands)

**Owner:** `backend-architect`
**Effort:** M

**Description:**
Implement `backend/src/cli.py`. Developer-facing CLI using `argparse` or `click`.

**Acceptance Criteria:**
- `python -m src.cli ingest --config config.yaml` runs the full ingest pipeline and prints progress to stdout
- `python -m src.cli ask "<query>"` runs the agent and prints formatted output: answer, evidence summary, claims with confidence, and graph path node count
- `python -m src.cli ask --json "<query>"` outputs raw JSON matching the PRD F4 schema
- All three demo queries from PRD Section 14 execute without error
- `--help` on both subcommands prints usage
- Config path defaults to `config.yaml` in cwd if `--config` not provided

**Blocked-by:** T-025

---

## Phase 7: Frontend (Next.js + shadcn/ui + React Flow)

---

### T-031-F — Next.js project scaffold and API client

**Owner:** `frontend-developer`
**Effort:** M

**Description:**
Scaffold the Next.js App Router project in `frontend/`. Install dependencies: `next`, `typescript`, `react-flow-renderer` (or `@xyflow/react`), `shadcn/ui` (via CLI). Create the typed API client in `frontend/app/lib/api.ts`.

**Acceptance Criteria:**
- `npm run dev` starts Next.js on port 3000 without errors
- `tsconfig.json` configured with strict mode and path aliases (`@/` → `./app/`)
- shadcn/ui initialised (`npx shadcn-ui@latest init`); at least `Button`, `Card`, `Drawer`, `Badge`, `ScrollArea` components added
- `frontend/app/lib/api.ts` exports:
  - `postQuery(query: string, filters?: object): Promise<QueryResponse>`
  - `getRunById(runId: string): Promise<QueryResponse>`
  - `getChunk(docId: string, chunkId: string): Promise<ChunkResponse>`
- All API client functions use typed request/response interfaces matching PRD F4 schema
- `npm run build` completes without type errors

**Blocked-by:** T-001

---

### T-032-F — Four-panel main layout (`page.tsx`)

**Owner:** `frontend-developer`
**Effort:** M

**Description:**
Implement `frontend/app/page.tsx`. Create the four-panel layout using shadcn/ui `Card` and CSS grid/flexbox.

**Acceptance Criteria:**
- Layout renders four named panels: **Chat**, **Agent Timeline**, **Graph Viewer**, **Citations**
- Panels are visible and labelled on initial load with placeholder content
- Layout is responsive to viewport height (panels fill screen without overflow)
- Panel borders and typography use shadcn/ui design tokens
- No hardcoded hex colours; all colour references use CSS variables from shadcn/ui theme

**Blocked-by:** T-031-F

---

### T-033-F — ChatPanel component

**Owner:** `frontend-developer`
**Effort:** M

**Description:**
Implement `frontend/app/components/ChatPanel.tsx`. Chat input + message history with query submission wired to the API client.

**Acceptance Criteria:**
- Text input with submit button (keyboard shortcut: Enter)
- On submit: calls `postQuery`, shows a loading spinner (shadcn/ui `Skeleton` or `Spinner`)
- On success: renders `answer` text in a message bubble; answer text supports markdown rendering
- On error: shows an error alert (shadcn/ui `Alert`) with the error message
- Message history scrolls; older messages remain visible above the latest
- Query input disabled while a request is in flight
- `run_id` from response stored in state and passed to other panels via a shared state mechanism (context or prop drilling)

**Blocked-by:** T-032-F

---

### T-034-F — AgentTimeline component

**Owner:** `frontend-developer`
**Effort:** M

**Description:**
Implement `frontend/app/components/AgentTimeline.tsx`. Render the `run_summary.steps` array as a vertical timeline.

**Acceptance Criteria:**
- Each step rendered as a timeline item: step number, tool name (with icon/badge), latency (ms), status (success/error)
- Steps appear in execution order
- Error steps highlighted in red (shadcn/ui destructive variant)
- Tool names rendered as shadcn/ui `Badge` components with colour coding per tool type: vector (blue), SQL (green), compute (orange)
- Timeline scrollable if steps exceed panel height
- Empty state shown ("No run yet") when `run_summary` is null

**Blocked-by:** T-032-F

---

### T-035-F — GraphViewer component (React Flow)

**Owner:** `frontend-developer`
**Effort:** L

**Description:**
Implement `frontend/app/components/GraphViewer.tsx`. Render the `graph_path` from the agent response using React Flow.

**Acceptance Criteria:**
- Renders `graph_path.nodes` and `graph_path.edges` as a React Flow graph
- Node types styled differently: `entity` nodes (circular, purple), `chunk` nodes (rectangular, teal)
- Edge labels show `type` (`mentions`, `similarity`, `co_occurrence`) and `weight`
- Clicking a node opens a tooltip or side-drawer showing: node label, type, and up to 3 linked chunk excerpts
- Graph auto-fits to the panel on load (`fitView`)
- Empty state shown ("Submit a query to see the graph") when `graph_path` is null
- Zoom and pan controls visible

**Blocked-by:** T-032-F

---

### T-036-F — CitationsDrawer component

**Owner:** `frontend-developer`
**Effort:** M

**Description:**
Implement `frontend/app/components/CitationsDrawer.tsx`. Clicking any citation in the answer opens a drawer with the source chunk text and highlighted cited span.

**Acceptance Criteria:**
- `claims` array from agent response rendered in the Chat panel answer as inline citation links (e.g., `[1]`, `[2]`)
- Clicking a citation link opens a shadcn/ui `Drawer` (or `Sheet`) from the right
- Drawer fetches chunk via `getChunk(doc_id, chunk_id)` and displays full `chunk_text`
- Cited span (`char_start` to `char_end`) highlighted within the chunk text (e.g., `<mark>` element styled with shadcn accent)
- `confidence` score displayed as a `Badge` with colour: green ≥ 0.7, yellow 0.4–0.69, red < 0.4
- Drawer closes on Escape key or outside click

**Blocked-by:** T-033-F, T-035-F

---

## Phase 8: Docker & Deployment

---

### T-037 — Backend Dockerfile

**Owner:** `deployment-engineer`
**Effort:** M

**Description:**
Write `backend/Dockerfile`. Multi-stage build: install dependencies, copy source, expose port 8000.

**Acceptance Criteria:**
- Base image: `python:3.11-slim`
- Dependencies installed via `pip install --no-cache-dir -r requirements.txt` in a build stage
- `sentence-transformers/all-MiniLM-L6-v2` model pre-downloaded during build (so ingest works offline at container start)
- `spacy` model `en_core_web_sm` downloaded during build (`python -m spacy download en_core_web_sm`)
- Working directory: `/app`; source copied to `/app`
- Entrypoint: `uvicorn backend.app.main:app --host 0.0.0.0 --port 8000`
- Image builds in < 10 minutes on a standard laptop
- `docker run` with correct env vars starts the API and `GET /healthz` returns `{"status": "ok"}`

**Blocked-by:** T-028, T-030

---

### T-038 — Frontend Dockerfile

**Owner:** `deployment-engineer`
**Effort:** S

**Description:**
Write `frontend/Dockerfile`. Multi-stage build: install deps and build Next.js static output, then serve with a minimal Node image.

**Acceptance Criteria:**
- Build stage: `node:20-alpine`, runs `npm ci` and `npm run build`
- Runtime stage: `node:20-alpine`, copies `.next/` output and runs `npm start`
- `NEXT_PUBLIC_API_URL` build arg wired to Next.js env (defaults to `http://backend:8000`)
- Port 3000 exposed
- `npm run build` inside container completes without type errors
- `docker run` serves the Next.js app; `GET /` returns HTTP 200

**Blocked-by:** T-036-F

---

### T-039 — Complete `docker-compose.yml` with all three services (LOCAL DEV ONLY)

**Owner:** `deployment-engineer`
**Effort:** M

**Description:**
Extend `docker-compose.yml` (started in T-002) to add `backend` and `frontend` services. This file is **local development only** — it is not used for external/production deployment. Add an Alembic migration step and an optional seed/ingest step on first startup. External deployment uses Render (T-039b) for the backend and Vercel (T-039c) for the frontend.

**Acceptance Criteria:**
- Three services: `postgres` (from T-002), `backend`, `frontend` — all for local development
- `backend` depends_on `postgres` with `condition: service_healthy`
- `frontend` depends_on `backend`
- `backend` service runs Alembic migrations before starting Uvicorn (use an entrypoint script: `alembic upgrade head && uvicorn ...`)
- `ANTHROPIC_API_KEY`, `PG_DSN`, `KAGGLE_USERNAME`, `KAGGLE_KEY` sourced from `.env` file
- `NEXT_PUBLIC_API_URL=http://backend:8000` set in `frontend` environment
- `docker compose up --build` from a fresh clone (with `.env` populated): all three services start, health checks pass, `GET http://localhost:8000/healthz` returns `{"status": "ok"}`, and `GET http://localhost:3000` returns HTTP 200
- `docker compose down -v` cleanly removes containers and volumes
- Header comment in `docker-compose.yml` clearly states this is for local dev only, not production

**Blocked-by:** T-002, T-037, T-038

---

### T-039b — Render deployment configuration (external backend)

**Owner:** `deployment-engineer`
**Effort:** M

**Description:**
Create `render.yaml` (Render Blueprint file) at the repo root to define the backend web service on Render's free tier. Render builds the backend from `backend/Dockerfile` and deploys it as a web service. Note: Render free-tier web services spin down after 15 minutes of inactivity; this is acceptable for a portfolio demo and must be documented prominently in the README.

**Acceptance Criteria:**
- `render.yaml` present at repo root, defining one `web` service pointing to the `backend/Dockerfile`
- Build command and start command (Uvicorn) correctly specified in `render.yaml`
- Health check path set to `/healthz` in `render.yaml`
- `ANTHROPIC_API_KEY` and `DATABASE_URL` documented as Render environment secrets (not hardcoded in `render.yaml`)
- Deploying to Render from GitHub (via Render Dashboard → "New Blueprint") starts the FastAPI app successfully
- `GET /healthz` returns `{"status": "ok"}` on the public Render URL
- README "External Deployment" section includes the 15-minute spin-down caveat prominently

**Blocked-by:** T-037

---

### T-039c — Vercel deployment configuration (external frontend)

**Owner:** `deployment-engineer`
**Effort:** S

**Description:**
Configure the Vercel project for the Next.js frontend. Set `NEXT_PUBLIC_API_URL` as a Vercel environment variable pointing to the Render backend URL. Create `vercel.json` at the repo root if any non-default Vercel configuration is needed (likely minimal for a Next.js project).

**Acceptance Criteria:**
- `vercel.json` present at repo root (even if minimal — e.g., specifying the framework or root directory); absence is acceptable only if Vercel auto-detects Next.js correctly without it
- `NEXT_PUBLIC_API_URL` set as a Vercel environment variable pointing to the Render backend public URL
- Frontend deploys successfully on `git push` to the connected GitHub branch via Vercel auto CI/CD
- All four panels (Chat, Agent Timeline, Graph Viewer, Citations) render correctly on the Vercel URL
- API calls from the Vercel frontend reach the Render backend successfully (no CORS errors)
- README "External Deployment" section documents the Vercel setup steps

**Blocked-by:** T-038

---

### T-040 — Ingest-on-startup entrypoint script and seed data

**Owner:** `deployment-engineer`
**Effort:** M

**Description:**
Create a Docker entrypoint script that: runs Alembic migrations, then runs `python -m src.cli ingest` on first boot (skipping if data already present), then starts Uvicorn. Ensure `demo/seed_sql/` fixtures allow ingest to complete without Kaggle credentials.

**Acceptance Criteria:**
- `backend/entrypoint.sh` script: `alembic upgrade head`, then checks if `incident_reports` has rows; if empty runs `python -m src.cli ingest --config config.yaml`, then starts Uvicorn
- `demo/seed_sql/manufacturing_defects.csv`, `demo/seed_sql/defects_prediction.csv`, `demo/seed_sql/aircraft_maintenance.csv` exist with ≥ 20 rows each in canonical schema column order
- `docker compose up` from fresh clone without Kaggle credentials: ingest completes using seed data, all tables populated, API queries return results
- `docker compose up` second time (data already present): skips ingest and starts API immediately (< 15s to first request)

**Blocked-by:** T-039, T-030

---

### T-041 — Health check endpoint and README

**Owner:** `deployment-engineer`
**Effort:** M

**Description:**
Add `GET /healthz` to the FastAPI app and write `README.md` with full setup and demo instructions covering both local development (Docker Compose) and external deployment (Neon + Render + Vercel).

**Acceptance Criteria:**
- `GET /healthz` returns `{"status": "ok", "db": "connected", "embeddings_loaded": true}` when all subsystems are healthy
- Returns `{"status": "degraded", ...}` with 503 if DB is unreachable
- `README.md` contains:
  - Project overview (2–3 paragraphs)
  - Prerequisites list
  - **Local Development** section: `docker compose up` quickstart (5 steps or fewer)
  - **External Deployment** section: step-by-step setup for Neon (provision project, enable pgvector, copy `DATABASE_URL`) + Render (connect GitHub repo, set env secrets, deploy via Blueprint) + Vercel (connect GitHub repo, set `NEXT_PUBLIC_API_URL`, deploy)
  - Render free-tier 15-minute spin-down caveat in a prominent note or warning block
  - Kaggle credentials setup note (prominent warning)
  - Three demo queries with expected outputs
  - Repo structure summary
  - Tech stack table (including Neon, Render, Vercel)
- README is readable by a technical recruiter without prior context

**Blocked-by:** T-039, T-039b, T-039c

---

## Phase 9: Tests & Validation

---

### T-042 — SQL guardrail unit tests

**Owner:** `backend-architect`
**Effort:** S

**Description:**
Implement `backend/tests/test_sql_guardrails.py`. Covers all dangerous statement patterns and valid SELECT cases.

**Acceptance Criteria:**
- Tests for all seven blocked keywords: `DROP`, `DELETE`, `UPDATE`, `INSERT`, `CREATE`, `ALTER`, `TRUNCATE`
- Tests use mixed case and inline whitespace to verify regex is case-insensitive and not bypassable by spacing
- Tests for valid SELECTs: simple `SELECT *`, `SELECT COUNT(*)`, multi-line SELECT with JOIN — all must pass guardrail
- Test for `SQLQueryTool.run_named("defect_counts_by_product", {"days": 90})` returns a result dict with `columns` and `rows` keys
- All tests pass with `pytest backend/tests/test_sql_guardrails.py`

**Blocked-by:** T-020

---

### T-043 — Vector retrieval unit tests

**Owner:** `backend-architect`
**Effort:** S

**Description:**
Implement `backend/tests/test_vector_retrieval.py`. Validates that `VectorSearchTool` returns meaningful results against the seeded dataset.

**Acceptance Criteria:**
- Test: `VectorSearchTool("hydraulic actuator crack").run()` returns ≥ 1 result with `score > 0`
- Test: all returned items contain required fields: `chunk_id`, `incident_id`, `score`, `excerpt`
- Test: `top_k=3` returns at most 3 results
- Test: filter `severity="critical"` returns only items from critical incidents (or empty list if none match)
- Tests run against the test DB (use a pytest fixture that ensures `incident_embeddings` has ≥ 100 rows)
- All tests pass with `pytest backend/tests/test_vector_retrieval.py`

**Blocked-by:** T-015

---

### T-044 — Agent intent router unit tests

**Owner:** `backend-architect`
**Effort:** S

**Description:**
Implement `backend/tests/test_agent_router.py`. Validates the intent classifier routes correctly for the three canonical query patterns from the PRD.

**Acceptance Criteria:**
- Test: "Find similar incidents to: hydraulic actuator crack on Line 1" → intent `vector_only`
- Test: "Show defect trends by product and defect_type for the last 90 days" → intent `sql_only`
- Test: "Given this incident text, classify defect and recommend action" → intent `hybrid`
- Tests use the real `ClaudeClient` (integration test, requires `ANTHROPIC_API_KEY` in env) OR a mock `LLMClient` that returns deterministic JSON
- Both mock and integration variants implemented; mock variant runs without API key
- All tests pass with `pytest backend/tests/test_agent_router.py`

**Blocked-by:** T-022

---

### T-045 — End-to-end demo validation

**Owner:** `backend-architect`
**Effort:** M

**Description:**
Manually execute and verify all three demo queries from PRD Section 14 against the fully running system — both locally via Docker Compose and externally via the public Vercel URL. Document results.

**Acceptance Criteria:**
- Demo query 1 (`vector_only`): returns ≥ 3 incident excerpts with `score > 0.5` and cited `chunk_id`
- Demo query 2 (`sql_only`): returns a SQL result with ≥ 2 product rows and a populated `graph_path`
- Demo query 3 (`hybrid`): executes both vector and SQL tools (visible in `run_summary.tools_used`), returns answer with ≥ 1 claim having `confidence ≥ 0.6` and a citation
- All three queries complete in < 30s wall-clock time
- UI renders all four panels correctly for each query (manually verified)
- `docker compose up` from a fresh clone reproduces all three results without manual steps (local dev path)
- All three demo queries work from the public Vercel URL, hitting the Render backend connected to the Neon database (external deployment path)

**Blocked-by:** T-040, T-041, T-039b, T-039c, T-042, T-043, T-044, T-036-F

---

## Dependency Summary

```
T-001 → T-002, T-002b, T-003, T-031-F
T-002, T-003 → T-004
T-002b → (Neon DB ready for Alembic migrations — parallel path to T-004 for external deploy)
T-004 → T-005
T-005 → T-008, T-009, T-020, T-021, T-026
T-003 → T-006, T-007, T-011, T-012, T-016
T-006, T-007 → T-022
T-008, T-009 → T-010
T-010, T-011, T-012 → T-013
T-013, T-016 → T-017
T-013 → T-014
T-014 → T-015
T-017 → T-018
T-018 → T-019
T-019, T-006 → T-024
T-022 → T-023
T-015, T-020, T-021, T-023, T-024 → T-025
T-005, T-007 → T-026
T-026, T-010, T-013, T-017 → T-027
T-025, T-026 → T-028
T-026 → T-029
T-025 → T-030
T-031-F → T-032-F
T-032-F → T-033-F, T-034-F, T-035-F
T-033-F, T-035-F → T-036-F
T-028, T-030 → T-037
T-036-F → T-038
T-002, T-037, T-038 → T-039
T-037 → T-039b
T-038 → T-039c
T-039, T-030 → T-040
T-039, T-039b, T-039c → T-041
T-020 → T-042
T-015 → T-043
T-022 → T-044
T-040, T-041, T-039b, T-039c, T-042, T-043, T-044, T-036-F → T-045
```

---

## Phase Summary Table

| Phase | Tasks | Total Effort |
|---|---|---|
| 0 — Infrastructure & Scaffolding | T-001 to T-007, T-002b | S+M+S+S+M+S+S+S = ~2.5d |
| 1 — Data Ingestion Pipeline | T-008 to T-013 | L+L+M+M+S+M = ~3d |
| 2 — Vector Search & Embeddings | T-014, T-015 | M+S = ~6h |
| 3 — GraphRAG | T-016 to T-019 | M+L+M+M = ~1.5d |
| 4 — SQL Tool & Pre-built Queries | T-020, T-021 | M+M = ~8h |
| 5 — Agent Orchestrator | T-022 to T-025 | M+M+M+XL = ~2.5d |
| 6 — FastAPI Backend & CLI | T-026 to T-030 | M+S+M+S+M = ~1.5d |
| 7 — Frontend | T-031-F to T-036-F | M+M+M+M+L+M = ~2.5d |
| 8 — Docker & Deployment | T-037 to T-041, T-039b, T-039c | M+S+M+M+S+M+M = ~2d |
| 9 — Tests & Validation | T-042 to T-045 | S+S+S+M = ~1d |
| **Total** | **48 tasks** | **~18 working days** |
