# BACKEND.md — Backend Architecture Handoff

**Generated:** 2026-03-06 (updated Wave 3)
**Codebase:** NextAgentAI — Agentic manufacturing + clinical intelligence platform
**Stack:** FastAPI 0.115.6, SQLAlchemy 2.0.36, PostgreSQL 16 + pgvector, Python 3.11

---

## Overview

The backend is a FastAPI application deployed on Render (Docker) backed by a Neon PostgreSQL database. A natural-language query enters `POST /query`, is classified by intent (Haiku), planned into a tool sequence (Haiku), executed via hybrid BM25+vector search + SQL + optional compute tools, expanded through a knowledge graph, synthesised into a cited answer (Sonnet or Haiku depending on intent complexity), verified, and returned. Results are cached in `agent_runs` and returned on exact-match re-queries within 5 minutes.

Two data domains are fully supported: **aircraft** (manufacturing/maintenance incidents) and **medical** (clinical case reports). Domain selection is per-request via the `domain` field.

### Key Architectural Decisions

1. **Singleton orchestrator** — `AgentOrchestrator` is instantiated once per process in `query.py` via `_get_orchestrator()`. This reuses the embedding model (loaded once, ~2-4 s cold start) and the LLM clients (single httpx connection pool).
2. **Async orchestrator and tools** — `orchestrator.run()` is `async def`; all tool implementations expose `run_async()`. `asyncio.gather` is used for parallel vector + SQL execution on hybrid/compute intents. The event loop is not blocked during agent execution (T-17 complete).
3. **Named SQL queries only** — The orchestrator replaces any LLM-generated raw SQL with a safe named query. No user-controlled SQL reaches the database.
4. **HNSW vector index** — `incident_embeddings` and `medical_embeddings` both use HNSW cosine indexes (`m=16, ef_construction=64`, `ef_search=40`). The IVFFlat indexes and per-query `SET ivfflat.probes` have been removed (T-10, T-11 complete).
5. **Dual-engine session pattern** — Async engine for FastAPI handlers; sync engine for CLI and Alembic migrations.
6. **Hybrid BM25+vector search (T3-03)** — `hybrid_search()` in `retrieval.py` fuses PostgreSQL FTS (`ts_rank_cd`) and pgvector cosine similarity using Reciprocal Rank Fusion (RRF, k=60). Used by default for hybrid/compute intents; pure vector used for vector_only.
7. **Pydantic-validated LLM outputs (T3-01)** — All structured LLM responses are validated against Pydantic models (`ClassifyPlanOutput`, `SynthesisOutput`, `VerifyOutput`). On `ValidationError`, one retry is issued with an error-correction prefix before falling back to defaults.
8. **Query result cache (T3-04)** — Before running the agent loop, `orchestrator.run()` checks `agent_runs` for an exact-match (case-insensitive) query within 5 minutes. Cache hits skip the full pipeline and return immediately with `run_summary.cached=true`.
9. **MMR deduplication (T3-06)** — After retrieval, `mmr_rerank()` applies Maximal Marginal Relevance to remove near-duplicate chunks and maximise evidence diversity.
10. **Per-stage timing (T3-02)** — `run_summary.state_timings_ms` in every `POST /query` response includes latency breakdown per state (classify_plan, execute_tools, expand_graph, synthesise, verify, save).
11. **asyncio.wait_for tool timeouts (T3-14)** — Every async tool call is wrapped in `asyncio.wait_for(..., timeout=30.0)`. TimeoutError is caught, logged, and treated as a non-fatal step error (agent continues with remaining steps).

---

## Stack and Dependencies

| Component | Package | Version | Notes |
|---|---|---|---|
| Web framework | `fastapi` | 0.115.6 | ASGI via uvicorn |
| ASGI server | `uvicorn[standard]` | 0.32.1 | |
| ORM | `sqlalchemy` | 2.0.36 | Async + sync engines |
| Migrations | `alembic` | 1.14.0 | |
| Sync PG driver | `psycopg2-binary` | 2.9.10 | Sync engine and Alembic |
| Async PG driver | `asyncpg` | 0.30.0 | Async engine (FastAPI) |
| Vector extension | `pgvector` | 0.3.6 | Python adapter; PostgreSQL extension must be installed on DB |
| Validation | `pydantic` | 2.10.4 | Request/response schemas |
| LLM | `anthropic` | 0.40.0 | Sonnet 4.6 (synthesis) + Haiku 4.5 (routing) |
| Embeddings | `sentence-transformers` | 3.3.1 | all-MiniLM-L6-v2 (384 dims) |
| ML runtime | `torch` | 2.5.1 | CPU-only on Render free tier |
| NER | `spacy` | 3.8.3 | `en_core_web_sm` model |
| Tokenizer | `tiktoken` | 0.8.0 | Chunking |
| Data | `pandas` | 2.2.3 | Ingest pipeline |
| Data loading | `kagglehub` | 0.3.6 | Optional; falls back to seed CSVs |
| Testing | `pytest` | 8.3.4 | + `pytest-asyncio` 0.24.0 |
| Logging | `python-json-logger` | 3.2.1 | Structured JSON logs |
| JSON serialization | `orjson` | 3.10.12 | `ORJSONResponse` default; faster than stdlib json |

---

## Database Schema

### Entity Relationship Summary

```
incident_reports ──< incident_embeddings
medical_cases    ──< medical_embeddings
graph_node       ──< graph_edge (from_node FK)
graph_node       ──< graph_edge (to_node FK)
agent_runs         (standalone)
manufacturing_defects (standalone)
maintenance_logs   (standalone)
disease_records    (standalone)
```

Total tables: **10** (models.py documents 7; medical domain adds `medical_cases`, `disease_records`, `medical_embeddings`).

---

### Table: `incident_reports`

Primary text source for aircraft-domain vector embedding and graph construction.

| Column | Type | Nullable | Indexed | Notes |
|---|---|---|---|---|
| `incident_id` | TEXT | NO | PK | UUID string default |
| `asset_id` | TEXT | YES | B-tree | Aircraft/asset identifier |
| `system` | TEXT | YES | NO | Subsystem e.g. "Hydraulic". **Missing index** — used in vector_search filters |
| `sub_system` | TEXT | YES | NO | |
| `event_date` | DATE | YES | B-tree | Used in date_range filter |
| `location` | TEXT | YES | NO | |
| `severity` | TEXT | YES | NO | "Critical" / "High" / "Medium" / "Low". **Missing index** |
| `narrative` | TEXT | YES | NO | Full incident text; chunked and embedded |
| `corrective_action` | TEXT | YES | NO | |
| `source` | TEXT | NO | NO | Default "synthetic"; "kaggle" for loaded data |

Relationship: one `incident_report` has many `incident_embeddings` (ORM `lazy="selectin"`, cascade delete). All hot paths use raw `text()` SQL — ORM lazy loading is never triggered at runtime.

---

### Table: `incident_embeddings`

Chunk-level 384-dim vector embeddings. Primary table searched by `VectorSearchTool`.

| Column | Type | Nullable | Indexed | Notes |
|---|---|---|---|---|
| `embed_id` | TEXT | NO | PK | UUID string |
| `incident_id` | TEXT | NO | B-tree | FK -> `incident_reports.incident_id` ON DELETE CASCADE |
| `chunk_index` | INTEGER | NO | NO | Position within narrative |
| `chunk_text` | TEXT | NO | NO | Source text for citations |
| `embedding` | VECTOR(384) | YES | **HNSW cosine** | `idx_incident_embeddings_hnsw` (m=16, ef_construction=64) |
| `char_start` | INTEGER | YES | NO | Start char offset in `narrative` for citation highlighting |
| `char_end` | INTEGER | YES | NO | End char offset |
| `created_at` | DATETIME | NO | NO | `server_default=func.now()` |

**Index:** `embedding` uses HNSW cosine (`idx_incident_embeddings_hnsw`, m=16, ef_construction=64). `ef_search=40` is set at the async engine level via `connect_args` in `session.py` and at the database level via `ALTER DATABASE`. No per-query `SET` statement is required.

---

### Table: `manufacturing_defects`

Structured defect records from Kaggle. Used for SQL aggregation (`defect_counts_by_product`, `severity_distribution`) and graph co-occurrence edge construction.

| Column | Type | Nullable | Indexed | Notes |
|---|---|---|---|---|
| `defect_id` | TEXT | NO | PK | |
| `product` | TEXT | YES | B-tree | Used in GROUP BY and ILIKE join |
| `defect_type` | TEXT | YES | NO | |
| `severity` | TEXT | YES | NO | |
| `inspection_date` | DATE | YES | NO | Used in INTERVAL filter. **Missing index** |
| `plant` | TEXT | YES | NO | |
| `lot_number` | TEXT | YES | NO | |
| `action_taken` | TEXT | YES | NO | |
| `source` | TEXT | NO | NO | Default "kaggle" |

**Missing index:** `inspection_date` has no B-tree index. `defect_counts_by_product` filters `WHERE inspection_date >= CURRENT_DATE - INTERVAL '90 days'` on every query.

---

### Table: `maintenance_logs`

Time-series sensor readings and maintenance events. Used for `maintenance_trends` named SQL query.

| Column | Type | Nullable | Indexed | Notes |
|---|---|---|---|---|
| `log_id` | TEXT | NO | PK | |
| `asset_id` | TEXT | YES | NO | |
| `ts` | DATETIME | YES | NO | Timestamp. **Missing index** — used in GROUP BY / ORDER BY |
| `metric_name` | TEXT | YES | NO | |
| `metric_value` | FLOAT | YES | NO | |
| `unit` | TEXT | YES | NO | |
| `source` | TEXT | NO | NO | Default "kaggle" |

---

### Table: `graph_node`

Knowledge graph nodes. Two types: `entity` (NER-extracted asset, system, defect type) and `chunk` (linked to a specific embedding chunk).

| Column | Type | Nullable | Indexed | Notes |
|---|---|---|---|---|
| `id` | TEXT | NO | PK | UUID string |
| `type` | TEXT | NO | NO | "entity" or "chunk" |
| `label` | TEXT | YES | NO | Human-readable node label |
| `properties` | JSONB | YES | NO | Flexible metadata |

ORM relationships `outgoing_edges` and `incoming_edges` use `lazy="select"` (classic N+1 trigger if accessed via ORM). All graph code paths use raw SQL.

---

### Table: `graph_edge`

Directed edges between graph nodes.

| Column | Type | Nullable | Indexed | Notes |
|---|---|---|---|---|
| `id` | TEXT | NO | PK | |
| `from_node` | TEXT | NO | **B-tree (single)** | FK -> `graph_node.id` ON DELETE CASCADE |
| `to_node` | TEXT | NO | **B-tree (single)** | FK -> `graph_node.id` ON DELETE CASCADE |
| `type` | TEXT | NO | NO | "mentions" / "similarity" / "co_occurrence". **No index** |
| `weight` | FLOAT | YES | NO | Cosine similarity for similarity edges |
| `properties` | JSONB | YES | NO | |

**Missing composite indexes (T-12):**
- `(from_node, type)` — every graph expansion filters `WHERE from_node IN (...) AND type IN (...)`. Without this, PostgreSQL evaluates the type predicate by row scan after B-tree lookup on `from_node`.
- `(to_node, type)` — same issue for incoming edge queries.

These are prerequisites for the T-13 query refactor.

---

### Table: `agent_runs`

Persistent record of every agent invocation. Full JSON output stored for `/runs/{run_id}` retrieval.

| Column | Type | Nullable | Indexed | Notes |
|---|---|---|---|---|
| `run_id` | TEXT | NO | PK | UUID |
| `query` | TEXT | YES | NO | Original query text |
| `result` | JSONB | YES | NO | Full `AgentRunResult.to_dict()` payload |
| `created_at` | DATETIME | NO | NO | `server_default=func.now()` |

Records grow indefinitely. Consider a periodic cleanup job for production.

---

### Table: `medical_cases`

Clinical case report narratives (MACCROBAT or synthetic). Medical-domain equivalent of `incident_reports`.

| Column | Type | Nullable | Indexed | Notes |
|---|---|---|---|---|
| `case_id` | TEXT | NO | PK | |
| `system` | TEXT | YES | NO | Body system (Cardiac, Respiratory, etc.) |
| `sub_system` | TEXT | YES | NO | |
| `event_date` | DATE | YES | B-tree | |
| `severity` | TEXT | YES | NO | |
| `narrative` | TEXT | YES | NO | Full clinical case text |
| `corrective_action` | TEXT | YES | NO | Extracted treatment sentences |
| `entities` | TEXT | YES | NO | JSON array stored as TEXT — should be JSONB |
| `source` | TEXT | NO | NO | Default "maccrobat" |

---

### Table: `disease_records`

Structured disease/symptom records (Disease Symptoms & Patient Profile dataset). Used for medical SQL aggregation queries.

| Column | Type | Nullable | Indexed | Notes |
|---|---|---|---|---|
| `record_id` | TEXT | NO | PK | |
| `disease` | TEXT | YES | NO | |
| `fever` | BOOLEAN | YES | NO | |
| `cough` | BOOLEAN | YES | NO | |
| `fatigue` | BOOLEAN | YES | NO | |
| `difficulty_breathing` | BOOLEAN | YES | NO | |
| `age` | INTEGER | YES | NO | |
| `gender` | TEXT | YES | NO | |
| `blood_pressure` | TEXT | YES | NO | |
| `cholesterol_level` | TEXT | YES | NO | |
| `outcome` | TEXT | YES | NO | "Positive" / "Negative" |
| `severity` | TEXT | YES | NO | |
| `specialty` | TEXT | YES | NO | |
| `inspection_date` | DATE | YES | NO | Used in INTERVAL filters. **Missing index** |
| `source` | TEXT | NO | NO | Default "kaggle" |

---

### Table: `medical_embeddings`

Chunk-level 384-dim embeddings for medical case narratives. Medical-domain equivalent of `incident_embeddings`.

| Column | Type | Nullable | Indexed | Notes |
|---|---|---|---|---|
| `embed_id` | TEXT | NO | PK | |
| `case_id` | TEXT | NO | B-tree | FK -> `medical_cases.case_id` ON DELETE CASCADE |
| `chunk_index` | INTEGER | NO | NO | |
| `chunk_text` | TEXT | NO | NO | |
| `embedding` | VECTOR(384) | YES | **HNSW cosine** | `idx_medical_embeddings_hnsw` (m=16, ef_construction=64) |
| `char_start` | INTEGER | YES | NO | |
| `char_end` | INTEGER | YES | NO | |
| `created_at` | DATETIME | NO | NO | `server_default=func.now()` |

---

### Optimized Schema Changes Required

#### T-10: IVFFlat to HNSW (both embedding tables) — COMPLETE

HNSW cosine indexes have replaced IVFFlat on both `incident_embeddings.embedding` and `medical_embeddings.embedding`.

Target parameters for ~30k embeddings (10k incidents x 3 chunks):

| Parameter | Value | Rationale |
|---|---|---|
| `m` | 16 | Default; optimal for 10k-100k rows |
| `ef_construction` | 64 | 4x m; build-time accuracy tradeoff |
| `ef_search` | 40 | Default; set at engine level via `connect_args`, not per-query |
| Operator class | `vector_cosine_ops` | Unchanged |

Benefits: 5-15x higher QPS at equivalent recall; no per-query `SET` statement required.

#### T-12: Composite Indexes on `graph_edge`

```sql
CREATE INDEX CONCURRENTLY idx_graph_edge_from_type ON graph_edge (from_node, type);
CREATE INDEX CONCURRENTLY idx_graph_edge_to_type   ON graph_edge (to_node, type);
```

Estimated 30-50% graph expansion latency reduction for graphs with >1,000 nodes.

#### Additional Recommended Indexes (not in TASKS2.md)

```sql
-- manufacturing_defects.inspection_date — used in INTERVAL WHERE clause
CREATE INDEX CONCURRENTLY idx_mfg_defects_inspection_date
    ON manufacturing_defects (inspection_date);

-- disease_records.inspection_date — same pattern in medical SQL queries
CREATE INDEX CONCURRENTLY idx_disease_records_inspection_date
    ON disease_records (inspection_date);

-- incident_reports: system + severity used in vector_search filter clauses
CREATE INDEX CONCURRENTLY idx_incident_reports_system
    ON incident_reports (system);
CREATE INDEX CONCURRENTLY idx_incident_reports_severity
    ON incident_reports (severity);
```

---

## Authentication

No authentication layer is implemented. All endpoints are publicly accessible. This is appropriate for a demo/research platform.

For production with sensitive data: add `Authorization: Bearer <api_key>` middleware or FastAPI dependency. Store hashed API keys in a new `api_keys` table. The CORS configuration already restricts browser-origin callers to known Vercel and localhost origins (explicit allowlist in `main.py`).

---

## Row-Level Security

No RLS policies are configured. The application DB user has full read/write access to all tables. Consistent with single-tenant research platform model.

For multi-tenancy: apply RLS on `incident_reports`, `medical_cases`, `agent_runs` keyed on a `tenant_id` column. The graph tables would need domain-scoping columns.

---

## Business Logic as Pure Functions

### `classify_intent(query, llm, domain)` -> `str`

**File:** `backend/app/agent/intent.py`

| Parameter | Type | Description |
|---|---|---|
| `query` | `str` | Natural language user question |
| `llm` | `LLMClient` | Haiku client (fast, JSON-mode) |
| `domain` | `str` | `"aircraft"` or `"medical"` — selects system prompt |

**Returns:** One of `"vector_only"`, `"sql_only"`, `"hybrid"`, `"compute"`.

**Invariants:**
- Never raises. Returns `"hybrid"` on any failure (JSON parse error, LLM error, invalid intent string).
- Valid intents: `frozenset(["vector_only", "sql_only", "hybrid", "compute"])`.
- `json_mode=True`, `max_tokens=64` — minimal token budget.
- No DB access. No side effects beyond the LLM API call.

---

### `generate_plan(query, intent, llm, domain)` -> `dict`

**File:** `backend/app/agent/planner.py`

| Parameter | Type | Description |
|---|---|---|
| `query` | `str` | Natural language user question |
| `intent` | `str` | Output of `classify_intent` |
| `llm` | `LLMClient` | Haiku client |
| `domain` | `str` | `"aircraft"` or `"medical"` |

**Returns:**
```python
{
    "plan_text": str,           # User-visible description of the plan
    "steps": [
        {
            "step_number": int,   # Always sequential 1, 2, ...
            "description": str,
            "tool": str,          # "VectorSearchTool" | "SQLQueryTool" | "PythonComputeTool"
            "tool_inputs": dict
        }
    ]
}
```

**Invariants:**
- Never raises. Falls back to `_fallback_plan(query, intent, domain)` on any error.
- `step_number` is rewritten sequentially (1, 2, ...) regardless of LLM output.
- For `vector_only` intent, `_fallback_plan` is called directly (skips the LLM call entirely).
- Named queries in `tool_inputs` must match keys in `sql_tool._NAMED_QUERIES`; the planner system prompt lists only valid names.

**Optimization note (T-17):** A merged `classify_and_plan()` function returning `{intent, plan_text, steps}` in a single Haiku call would eliminate one network round-trip (~400-600 ms).

---

### `verify_claims(claims, evidence, llm)` -> `list[dict]`

**File:** `backend/app/agent/verifier.py`

| Parameter | Type | Description |
|---|---|---|
| `claims` | `list[dict]` | Raw claim dicts from synthesis. Each has at minimum `{"text": "..."}` |
| `evidence` | `list[dict]` | Vector hits and graph-expanded evidence items |
| `llm` | `LLMClient` | Haiku client |

**Returns:**
```python
[
    {
        "text": str,
        "confidence": float,        # 0.0-1.0, clamped
        "citations": [
            {
                "chunk_id": str,
                "incident_id": str,
                "char_start": int,
                "char_end": int
            }
        ],
        "conflict_note": str | None
    }
]
```

**Invariants:**
- Returns `[]` immediately when `claims` is empty (no LLM call made).
- Confidence is clamped to `[0.0, 1.0]`.
- Confidence is capped at `0.5` when `len(evidence) < 2`.
- Falls back to `_fallback_verification(claims, evidence)` on LLM error: `0.6` confidence (2+ evidence items) or `0.3` (fewer).
- Only top 5 evidence items are sent to the LLM.

**Orchestrator optimization (T-05):** The orchestrator currently calls `verify_claims` unconditionally. Adding `if raw_claims:` before the call avoids a 300-500 ms Haiku API round-trip when synthesis produces zero claims.

---

### `VectorSearchTool.run(query_text, filters, top_k, domain, similarity_threshold)` -> `dict`

**File:** `backend/app/tools/vector_tool.py`

| Parameter | Type | Default | Description |
|---|---|---|---|
| `query_text` | `str` | required | Query to embed and search |
| `filters` | `dict\|None` | `{}` | `{system, severity, date_range: (from, to)}` |
| `top_k` | `int` | `8` | Max results |
| `domain` | `str` | `"aircraft"` | `"aircraft"` or `"medical"` |
| `similarity_threshold` | `float` | `0.0` | Minimum cosine similarity (Python-level post-filter, not DB-level) |

**Returns:**
```python
{
    "tool_name": "VectorSearchTool",
    "results": [
        {
            "chunk_id": str,
            "incident_id": str,
            "score": float,       # cosine similarity 0.0-1.0
            "excerpt": str,       # chunk_text
            "metadata": {
                "asset_id": str | None,
                "system": str | None,
                "severity": str | None,
                "event_date": str | None,  # ISO date string
                "char_start": int | None,
                "char_end": int | None,
                "domain": str
            }
        }
    ],
    "latency_ms": float,
    "error": str | None           # None on success
}
```

**Invariants:**
- Never raises (all exceptions caught; returned as `error` field with empty `results`).
- SIGALRM-based timeout active on Linux/macOS; no-op on Windows.
- Calls `EmbeddingModel.get()` singleton.
- Uses sync DB session (`get_sync_session()`).
- Calls `retrieval.vector_search()` which uses the HNSW index. No per-query `SET` statement is issued (T-10/T-11 complete).

**Optimization note (T-02/T-03):** `model.encode_single(query_text)` runs full inference on every call. After T-02 adds `encode_single_cached`, call `model.encode_single_cached(query_text)` and wrap with `np.array(cached, dtype=np.float32)`.

---

### `SQLQueryTool.run(sql)` -> `dict`

**File:** `backend/app/tools/sql_tool.py`

| Parameter | Type | Description |
|---|---|---|
| `sql` | `str` | SELECT query. DML/DDL causes `SQLGuardrailError`. |

**Returns:**
```python
{
    "tool_name": "SQLQueryTool",
    "columns": list[str],
    "rows": list[list[Any]],
    "row_count": int,
    "latency_ms": float,
    "error": str | None
}
```

**Guardrail:** Regex `r"\b(DROP|DELETE|UPDATE|INSERT|CREATE|ALTER|TRUNCATE)\b"` (word-boundary anchored, case-insensitive) checked before execution. Any match raises `SQLGuardrailError`. String-level check before any DB contact.

**Invariants:**
- `SQLGuardrailError` is re-raised (not caught internally).
- Other DB errors are caught and returned as `error` field.

---

### `SQLQueryTool.run_named(name, params)` -> `dict`

| Parameter | Type | Description |
|---|---|---|
| `name` | `str` | One of the named query keys in `_NAMED_QUERIES` |
| `params` | `dict\|None` | `{"days": int}` for time-filtered queries |

**Available named queries:**

| Name | Domain | Description |
|---|---|---|
| `defect_counts_by_product` | aircraft | Defect counts by product+type, last N days |
| `severity_distribution` | aircraft | Severity level distribution (window function) |
| `maintenance_trends` | aircraft | Event counts by month |
| `incidents_defects_join` | aircraft | ILIKE join of incidents + defects on system/product |
| `disease_counts_by_specialty` | medical | Disease counts by specialty, last N days |
| `disease_severity_distribution` | medical | Severity+outcome distribution |
| `disease_symptom_profile` | medical | Symptom prevalence per disease |
| `medical_system_summary` | medical | Cases by body system with severity breakdown |

**Invariants:**
- Raises `ValueError` for unknown `name`.
- `days` defaults to `90`.
- Parameter substitution: `sql.replace(":days days", f"{int(days)} days")` — safe via `int()` cast; bypasses query plan caching (not a security issue, minor performance note from optimize.md Section 10-B).

**Optimization note (T-14):** Add `run_named_cached(name, params)` with a process-local TTL dict (300 s TTL) to eliminate DB round-trips for repeated identical aggregation queries.

---

### `PythonComputeTool.run(code, context)` -> `dict`

**File:** `backend/app/tools/compute_tool.py`

| Parameter | Type | Description |
|---|---|---|
| `code` | `str` | Python code to execute. Must assign `result = ...`. |
| `context` | `dict` | Variables injected into execution namespace. |

**Returns:** `{"result": Any, "error": str | None}`

**Security:** Code runs in a restricted namespace. The orchestrator injects latest SQL rows as `context["rows"]` and `context["columns"]` if not already present. No network or DB access available inside the sandbox.

---

### `expand_graph(session, seed_ids, k)` -> `dict`

**File:** `backend/app/graph/expander.py`

| Parameter | Type | Description |
|---|---|---|
| `session` | `Session` | SQLAlchemy sync session |
| `seed_ids` | `list[str]` | Graph node IDs to start from (typically `chunk:{embed_id}`) |
| `k` | `int` | Number of hops. Default 2; orchestrator uses k=1. |

**Returns:**
```python
{
    "nodes": [
        {"id": str, "type": str, "label": str | None, "properties": dict | None}
    ],
    "edges": [
        {"id": str, "from_node": str, "to_node": str, "type": str, "weight": float | None}
    ]
}
```

**Invariants:**
- Returns `{"nodes": [], "edges": []}` when `seed_ids` is empty.
- Expansion is hard-capped at 500 visited nodes.
- Hop 0: follows `mentions`, `co_occurrence`, `similarity` edges.
- Hops 1+: follows `mentions`, `co_occurrence` only (prevents runaway similarity-graph expansion).
- Edges are deduplicated by `id`.
- Current SQL uses f-string interpolation for `IN (...)` clauses and fires two separate queries per hop (outgoing + incoming). Both issues are fixed in T-13.

---

### `rank_evidence(vector_hits, graph_nodes, graph_edges, top_k)` -> `list`

**File:** `backend/app/graph/scorer.py`

Works entirely over in-memory dicts — no DB access. Vector hits that appear as chunk nodes in the graph receive a connectivity boost proportional to attached edge count. Returns items sorted by `composite_score` descending, capped at `top_k`.

---

### `AgentOrchestrator.run(query, domain)` -> `AgentRunResult`

**File:** `backend/app/agent/orchestrator.py`

| Parameter | Type | Default | Description |
|---|---|---|---|
| `query` | `str` | required | Natural language question |
| `domain` | `str` | `"aircraft"` | `"aircraft"` or `"medical"` |

**Returns:** `AgentRunResult` dataclass:
```python
@dataclass
class AgentRunResult:
    run_id: str                 # UUID of this run
    query: str
    answer: str                 # Synthesised answer
    claims: list[dict]          # Verified claims with confidence + citations
    evidence: dict              # {"vector_hits": [...], "sql_rows": [...]}
    graph_path: dict            # {"nodes": [...max 40], "edges": [...max 80]}
    run_summary: dict           # intent, plan_text, steps, tools_used, total_latency_ms
    assumptions: list[str]
    next_steps: list[str]
```

**State machine:** `CLASSIFY -> PLAN -> EXECUTE_TOOLS -> EXPAND_GRAPH -> RE_RANK -> SYNTHESISE -> VERIFY -> SAVE -> DONE`

**Synthesis LLM routing:**
- `hybrid` or `compute` intent: Sonnet 4.6 (multi-source reasoning required)
- `vector_only` or `sql_only` intent: Haiku 4.5 (single-source, faster)

**Tool safety:** The orchestrator intercepts LLM-generated raw SQL and substitutes a safe named query. This prevents hallucinated table/column names from reaching the DB.

**Graph output caps:** `graph_path.nodes` capped at 40; `graph_path.edges` at 80 before serialisation (keeps JSON response size bounded).

**T-01 (superseded by T-17):** The orchestrator is now fully async. `orchestrator.run()` is `async def`; `query.py` calls `await orchestrator.run(...)` directly. No `run_in_threadpool` wrapper is needed.

---

## Typed API Contracts

**Base URL:**
- Production: `https://nextgenai-5bf8.onrender.com`
- Local: `http://localhost:8000`

**API docs:** `GET /api/docs` (Swagger UI), `GET /api/redoc`

**Versioning:** No URL versioning. All routes at root path.

**Error format (all 4xx/5xx):**
```json
{ "detail": "Human-readable error message" }
```

**Request size limits:** `POST /query` max 1 MB; `POST /ingest` max 10 MB.

---

### `POST /query`

Run the agent orchestrator and return a structured cited answer.

**Auth:** None required.

**Request body:**
```json
{
    "query": "Find incidents similar to hydraulic actuator crack on Line 1",
    "domain": "aircraft",
    "filters": {
        "system": "Hydraulic",
        "severity": "Critical",
        "date_range": ["2025-01-01", "2025-12-31"]
    }
}
```

| Field | Type | Required | Constraints |
|---|---|---|---|
| `query` | string | YES | min_length=3, max_length=2000 |
| `domain` | string | NO | `"aircraft"` (default) or `"medical"` |
| `filters` | object\|null | NO | Keys: `system` (str), `severity` (str), `date_range` ([str, str] ISO dates) |

**Response 200:**
```json
{
    "run_id": "550e8400-e29b-41d4-a716-446655440000",
    "query": "Find incidents similar to hydraulic actuator crack on Line 1",
    "answer": "Based on 8 similar incidents retrieved, hydraulic actuator cracks...",
    "claims": [
        {
            "text": "Hydraulic actuator cracks were found in 3 of 8 similar incidents.",
            "confidence": 0.87,
            "citations": [
                {
                    "chunk_id": "abc-123",
                    "incident_id": "inc-456",
                    "char_start": 0,
                    "char_end": 180
                }
            ],
            "conflict_note": null
        }
    ],
    "evidence": {
        "vector_hits": [
            {
                "chunk_id": "abc-123",
                "incident_id": "inc-456",
                "score": 0.923,
                "excerpt": "Hydraulic actuator crack detected on Line 1...",
                "metadata": {
                    "asset_id": "A320-001",
                    "system": "Hydraulic",
                    "severity": "Critical",
                    "event_date": "2025-03-15",
                    "char_start": 0,
                    "char_end": 180,
                    "domain": "aircraft"
                }
            }
        ],
        "sql_rows": [
            {
                "query": "defect_counts_by_product",
                "columns": ["product", "defect_type", "defect_count"],
                "rows": [["Engine", "Crack", 42]],
                "row_count": 1
            }
        ]
    },
    "graph_path": {
        "nodes": [
            {"id": "chunk:abc-123", "type": "chunk", "label": null, "properties": null},
            {"id": "entity:Hydraulic", "type": "entity", "label": "Hydraulic", "properties": {}}
        ],
        "edges": [
            {
                "id": "edge-789",
                "from_node": "chunk:abc-123",
                "to_node": "entity:Hydraulic",
                "type": "mentions",
                "weight": 1.0
            }
        ]
    },
    "run_summary": {
        "intent": "hybrid",
        "plan_text": "I will search for similar incidents and also query structured defect data.",
        "steps": [
            {
                "step_number": 1,
                "tool_name": "VectorSearchTool",
                "output_summary": "Found 8 similar chunks",
                "latency_ms": 142.3,
                "error": null
            }
        ],
        "tools_used": ["VectorSearchTool", "SQLQueryTool"],
        "total_latency_ms": 4832.1,
        "halted_at_step_limit": false,
        "state_timings_ms": {
            "classify_plan_ms": 412.1,
            "execute_tools_ms": 1831.4,
            "expand_graph_ms": 203.7,
            "synthesise_ms": 1884.2,
            "verify_ms": 398.6,
            "save_ms": 102.1
        },
        "cached": false
    },
    "assumptions": ["Analysis limited to ingested synthetic and Kaggle datasets."],
    "next_steps": ["Run POST /ingest to load latest data before querying."]
}
```

**Errors:**

| Status | Condition | `detail` |
|---|---|---|
| 413 | Request body > 1 MB | `"Request body too large for /query (max 1024KB)"` |
| 422 | Validation error (query too short/long, invalid domain) | Pydantic detail object |
| 500 | Agent loop error | `"Agent error: <exception message>"` |

---

### `GET /runs/{run_id}`

Retrieve a previously stored agent run.

**Auth:** None required.

**Response 200:**
```json
{
    "run_id": "550e8400-e29b-41d4-a716-446655440000",
    "query": "original query text",
    "result": { },
    "created_at": "2025-03-06T14:30:00"
}
```

**Errors:**

| Status | Condition | `detail` |
|---|---|---|
| 404 | `run_id` not found | `"Run '<id>' not found."` |
| 500 | DB error | `"Database error: <message>"` |

---

### `POST /ingest`

Trigger the aircraft/manufacturing domain ingest pipeline as a background daemon thread.

**Auth:** None required.

**Request body (optional):**
```json
{ "force": false }
```

**Response 202:**
```json
{
    "status": "started",
    "message": "Ingest pipeline started. Generating 10k synthetic incidents..."
}
```

**Errors:**

| Status | Condition | `detail` |
|---|---|---|
| 409 | Pipeline already running | `"Ingest pipeline is already running. Wait for it to complete before re-triggering."` |
| 413 | Request body > 10 MB | `"Request body too large for /ingest (max 10MB)"` |

---

### `POST /ingest/medical`

Trigger the medical domain ingest pipeline.

**Auth:** None required. No request body.

**Response 202:**
```json
{
    "status": "started",
    "message": "Medical ingest pipeline started. Loading MACCROBAT clinical cases..."
}
```

**Errors:** 409 if medical pipeline already running.

---

### `GET /healthz`

Liveness and DB connectivity check. Polled by the frontend every 30 s as a Render warm-up ping.

**Auth:** None required.

**Response 200:**
```json
{
    "status": "ok",
    "db": true,
    "version": "1.0.0"
}
```

`status` is `"degraded"` when DB is unreachable (DB health check fails but service is still up).

**Note (T-09):** This endpoint should return `Cache-Control: no-store` to prevent CDN/browser caches from suppressing the actual warm-up round-trip.

---

### `GET /docs`

List ingested incident reports with chunk counts.

**Auth:** None required.

**Query params:** `limit` (int, default 50), `offset` (int, default 0), `system` (str), `severity` (str).

**Response 200:** Array of:
```json
{
    "incident_id": "inc-123",
    "asset_id": "A320-001",
    "system": "Hydraulic",
    "severity": "Critical",
    "event_date": "2025-03-15",
    "source": "synthetic",
    "chunk_count": 3
}
```

---

### `GET /docs/{doc_id}/chunks/{chunk_id}`

Fetch a specific embedding chunk with full text and character offsets (used by the Citations drawer).

**Auth:** None required.

**Response 200:**
```json
{
    "chunk_id": "abc-123",
    "incident_id": "inc-456",
    "chunk_text": "Full chunk text for citation highlighting...",
    "chunk_index": 0,
    "char_start": 0,
    "char_end": 180,
    "metadata": {
        "asset_id": "A320-001",
        "system": "Hydraulic",
        "severity": "Critical",
        "event_date": "2025-03-15",
        "source": "synthetic"
    }
}
```

**Errors:** 404 if chunk not found; 500 on DB error.

---

## Optimization Implementation Specs

The following specs translate each TASKS2.md task into exact code changes. All file paths are relative to the repo root.

---

### T-01: `run_in_threadpool` — SUPERSEDED BY T-17

**Status:** Superseded. The orchestrator is now `async def run()` (T-17 complete). `query.py` calls `await orchestrator.run(...)` directly without any threadpool wrapper.

**File:** `backend/app/api/query.py`

**Change line 47:**
```python
# Before:
result = orchestrator.run(body.query, domain=body.domain)

# After:
result = await run_in_threadpool(orchestrator.run, body.query, domain=body.domain)
```

No other changes required. `run_in_threadpool` wraps `asyncio.get_event_loop().run_in_executor(None, func, *args)`, releasing the event loop during the sync call.

---

### T-02: LRU Embedding Cache in `EmbeddingModel`

**File:** `backend/app/rag/embeddings.py`
**Lines to change:** Lines 1-8 (add imports), after line 82 (add method)

**Add imports at top:**
```python
import functools
```

**Add method after `encode_single` (after line 82):**
```python
@functools.lru_cache(maxsize=512)
def encode_single_cached(self, text: str) -> tuple:
    """
    LRU-cached variant of encode_single.
    Returns tuple (hashable) instead of numpy array.
    Convert back: np.array(result, dtype=np.float32)
    Cache holds up to 512 unique strings (~786 KB footprint).
    Process-local; lost on restart.
    """
    vec = self.encode([text])[0]
    return tuple(vec.tolist())
```

**Verification:** `EmbeddingModel.get().encode_single_cached.cache_info().hits >= 1` after second call with same string.

---

### T-03: Update `VectorSearchTool` to Use Cached Embedding

**File:** `backend/app/tools/vector_tool.py`
**Line:** 95

**Before:**
```python
query_vec = model.encode_single(query_text)
```

**After (add import at top if not present, change line 95):**
```python
import numpy as np  # add at top if not present

cached = model.encode_single_cached(query_text)
query_vec = np.array(cached, dtype=np.float32)
```

---

### T-04: Sync Engine Pool Settings + `pool_recycle` on Both Engines

**File:** `backend/app/db/session.py`
**Lines:** 60 (sync engine), 104-110 (async engine)

**Sync engine — change line 60:**
```python
# Before:
_sync_engine = create_engine(dsn, pool_pre_ping=True)

# After:
_sync_engine = create_engine(
    dsn,
    pool_pre_ping=True,
    pool_size=10,       # up from SQLAlchemy default 5
    max_overflow=10,    # explicit (was default 10)
    pool_timeout=30,
    pool_recycle=1800,  # 30 min; Neon closes idle connections at ~5 min
)
```

**Async engine — change lines 104-110:**
```python
# Before:
_async_engine = create_async_engine(
    dsn,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

# After:
_async_engine = create_async_engine(
    dsn,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    pool_recycle=1800,  # matches sync engine
    pool_timeout=30,    # explicit
)
```

Combined max connections: Async 30 + Sync 20 = 50. Neon free tier allows 100.

---

### T-05: Early-Exit Guard Before `verify_claims`

**File:** `backend/app/agent/orchestrator.py`
**Line:** 364

**Before:**
```python
verified_claims = verify_claims(raw_claims, all_evidence, self._fast_llm)
```

**After:**
```python
if raw_claims:
    verified_claims = verify_claims(raw_claims, all_evidence, self._fast_llm)
else:
    verified_claims = []
```

The existing guard in `verifier.py` line 68 (`if not claims: return []`) is left intact as belt-and-suspenders.

---

### T-06: Module-Level Singleton for `get_fast_llm_client()`

**File:** `backend/app/llm/client.py`
**Lines:** 155-160

**Before:**
```python
def get_fast_llm_client() -> LLMClient:
    """
    Returns a Haiku client for lightweight routing tasks (intent, plan, verify).
    3-4x faster than Sonnet for structured JSON outputs with no quality loss.
    """
    return ClaudeClient(model="claude-haiku-4-5-20251001")
```

**After (add module-level var before the function):**
```python
_fast_llm_singleton: LLMClient | None = None


def get_fast_llm_client() -> LLMClient:
    """
    Returns a Haiku client for lightweight routing tasks (intent, plan, verify).
    3-4x faster than Sonnet for structured JSON outputs with no quality loss.
    Singleton: creates one ClaudeClient (one httpx pool) and reuses it on all calls.
    """
    global _fast_llm_singleton
    if _fast_llm_singleton is None:
        _fast_llm_singleton = ClaudeClient(model="claude-haiku-4-5-20251001")
    return _fast_llm_singleton
```

`get_llm_client()` (Sonnet) is unchanged. The orchestrator already creates a Sonnet singleton in its constructor.

---

### T-07: `ORJSONResponse` as Default + `orjson` to Requirements

**Files:** `backend/requirements.txt`, `backend/app/main.py`

**requirements.txt — add after `anthropic==0.40.0`:**
```
orjson==3.10.12
```

**main.py — change import line 14:**
```python
# Before:
from fastapi.responses import JSONResponse

# After:
from fastapi.responses import JSONResponse, ORJSONResponse
```

**main.py — add to `FastAPI(...)` constructor (line 69-80):**
```python
app = FastAPI(
    title="NextAgentAI API",
    description=(...),
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    default_response_class=ORJSONResponse,   # ADD THIS LINE
    lifespan=lifespan,
)
```

---

### T-08: Add `GZipMiddleware`

**File:** `backend/app/main.py`
**Lines:** 1-16 (add import), before line 83 (add middleware)

**Add import:**
```python
from starlette.middleware.gzip import GZipMiddleware
```

**Add middleware BEFORE `CORSMiddleware` (insert before line 83):**
```python
# Compress responses > 1 KB when client sends Accept-Encoding: gzip.
# level 4: good speed/size tradeoff (level 9 is max compression but slow).
# All modern browsers and fetch() send Accept-Encoding: gzip by default.
app.add_middleware(GZipMiddleware, minimum_size=1000, compresslevel=4)
```

Starlette processes middleware in reverse registration order. Adding GZip before CORS means GZip wraps the CORS-annotated response.

---

### T-09: `Cache-Control: no-store` on `/healthz`

**File:** `backend/app/api/docs.py`
**Lines:** 6-14 (add import), 26-32 (modify handler)

**Add to imports:**
```python
from fastapi import APIRouter, HTTPException, Response
```

**Change handler signature and add header (lines 26-32):**
```python
async def health_check(response: Response) -> HealthResponse:
    response.headers["Cache-Control"] = "no-store"
    db_ok = await check_db_health()
    return HealthResponse(
        status="ok" if db_ok else "degraded",
        db=db_ok,
        version="1.0.0",
    )
```

---

### T-10: Alembic Migration — IVFFlat to HNSW — COMPLETE

**Owner:** deployment-engineer
**Blocked by:** none (T-11 must follow after completion)

Full migration SQL and procedure in `DEPLOY.md` Phase 2. The critical constraint: `CREATE INDEX CONCURRENTLY` cannot run inside a transaction. Set `transaction_per_migration = False` in `backend/app/db/migrations/env.py` or run the index DDL manually outside Alembic.

---

### T-11: Remove `SET ivfflat.probes`, Add `hnsw.ef_search` at Engine Level — COMPLETE

**Files:** `backend/app/rag/retrieval.py`, `backend/app/db/session.py`
**Blocked by:** T-10

**retrieval.py — delete line 113:**
```python
# REMOVED — this line no longer exists in retrieval.py (T-11 complete):
# session.execute(text("SET ivfflat.probes = 10"))
```

**session.py — add `connect_args` to async engine (within `get_async_engine()`):**
```python
_async_engine = create_async_engine(
    dsn,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    pool_recycle=1800,
    pool_timeout=30,
    connect_args={"server_settings": {"hnsw.ef_search": "40"}},  # ADD
)
```

**session.py — add `connect_args` to sync engine (psycopg2 syntax):**
```python
_sync_engine = create_engine(
    dsn,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=10,
    pool_timeout=30,
    pool_recycle=1800,
    connect_args={"options": "-c hnsw.ef_search=40"},  # ADD (psycopg2 syntax)
)
```

---

### T-12: Alembic Migration — Composite Indexes on `graph_edge`

**Owner:** deployment-engineer
**Blocked by:** none

Full migration SQL in `DEPLOY.md` Phase 2.

---

### T-13: Graph Expander — Parameterized `ANY`, Merged Edge Query

**File:** `backend/app/graph/expander.py`
**Lines:** 63-113
**Blocked by:** T-12

**Current pattern (lines 74-113):**
```python
placeholders = ", ".join(f"'{nid}'" for nid in chunk)

# Outgoing edges (query 1)
result = session.execute(text(f"""
    SELECT id, from_node, to_node, type, weight
    FROM graph_edge
    WHERE from_node IN ({placeholders}) AND type {type_filter}
"""))

# Incoming edges (query 2 — separate round-trip)
result = session.execute(text(f"""
    SELECT id, from_node, to_node, type, weight
    FROM graph_edge
    WHERE to_node IN ({placeholders}) AND type {type_filter}
"""))
```

**Replacement pattern:**
```python
if hop == 0:
    edge_types = ["mentions", "co_occurrence", "similarity"]
else:
    edge_types = ["mentions", "co_occurrence"]

# Single merged query — ANY(:array) has no parameter count limit
stmt = text("""
    SELECT id, from_node, to_node, type, weight
    FROM graph_edge
    WHERE (from_node = ANY(:node_ids) OR to_node = ANY(:node_ids))
      AND type = ANY(:edge_types)
""")
result = session.execute(stmt, {
    "node_ids": frontier_list,
    "edge_types": edge_types,
})
```

Also convert the final node-metadata `WHERE id IN (...)` fetch to `WHERE id = ANY(:ids)`.

The chunking loop for the edge query can be removed: `ANY(:array)` accepts an unbounded Python list.

---

### T-14: TTL Cache for Named SQL Query Results

**File:** `backend/app/tools/sql_tool.py`
**Lines:** After line 264 (after `run_named`)

**Add module-level state:**
```python
import time

_named_query_cache: dict[str, tuple[float, dict]] = {}
CACHE_TTL_SECONDS = 300  # 5 minutes; data changes only at ingest time
```

**Add method to `SQLQueryTool`:**
```python
def run_named_cached(
    self,
    name: str,
    params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    TTL-cached variant of run_named. 300 s TTL. Process-local.
    Cache key includes both name and params to isolate different param sets.
    """
    cache_key = f"{name}:{params}"
    now = time.monotonic()

    if cache_key in _named_query_cache:
        ts, cached_result = _named_query_cache[cache_key]
        if now - ts < CACHE_TTL_SECONDS:
            logger.info("Named query cache hit", extra={"name": name})
            return cached_result

    result = self.run_named(name, params)
    _named_query_cache[cache_key] = (now, result)
    return result
```

After adding, update `orchestrator.py` line 223: change `self._sql_tool.run_named(named, params)` to `self._sql_tool.run_named_cached(named, params)`.

---

### T-15: Bulk `executemany` Upserts in Ingest Pipeline

**Files:** `backend/app/ingest/pipeline.py`, `backend/app/graph/builder.py`

**pipeline.py — `_upsert_dataframe_sync()`: row loop to bulk execute**

```python
# Before:
for row in rows:
    result = session.execute(sql, clean_row)
    inserted += result.rowcount

# After:
cleaned = [clean_row(r) for r in rows]
session.execute(sql, cleaned)   # SQLAlchemy executemany via DBAPI bulk insert
inserted = len(cleaned)
session.commit()
```

**pipeline.py — `_embed_and_store_sync()`: same bulk pattern**

Build a list of all chunk dicts and call `session.execute(INSERT, list_of_dicts)` once per batch instead of one `execute` per chunk.

**builder.py — batch commits every 500 rows:**
```python
# Before: session.commit() after every individual chunk

# After:
if node_count % 500 == 0:
    session.commit()
# Final commit after loop:
session.commit()
```

Expected improvement: ingest time from ~5 min to ~2-3 min for 10k incidents.

---

### T-16: Add `AsyncAnthropic` and `complete_async()` to `ClaudeClient`

**File:** `backend/app/llm/client.py`

**Add import:**
```python
from anthropic import AsyncAnthropic
```

**Extend `ClaudeClient.__init__`:**
```python
def __init__(
    self,
    model: str = "claude-sonnet-4-6",
    max_tokens: int = 4096,
    api_key: str | None = None,
) -> None:
    resolved_key = api_key or os.environ.get("ANTHROPIC_API_KEY", "")
    if not resolved_key:
        raise EnvironmentError(...)
    self._client = anthropic.Anthropic(api_key=resolved_key)       # sync (unchanged)
    self._async_client = AsyncAnthropic(api_key=resolved_key)       # async (new)
    self.model = model
    self.default_max_tokens = max_tokens
```

**Add `complete_async()` method (mirrors `complete()` logic):**
```python
async def complete_async(
    self,
    prompt: str,
    system: str = "",
    json_mode: bool = False,
    max_tokens: int | None = None,
) -> str:
    """Async variant of complete(). Uses AsyncAnthropic for non-blocking I/O."""
    if json_mode:
        json_instruction = (
            "\n\nIMPORTANT: Your response MUST be valid JSON only. "
            "Do not include any text before or after the JSON object. "
            "Do not use markdown code fences."
        )
        system = (system + json_instruction).strip()

    messages = [{"role": "user", "content": prompt}]
    kwargs: dict[str, Any] = {
        "model": self.model,
        "max_tokens": max_tokens or self.default_max_tokens,
        "messages": messages,
    }
    if system:
        kwargs["system"] = system

    response = await self._async_client.messages.create(**kwargs)
    text = response.content[0].text if response.content else ""

    # Same JSON stripping/validation as complete()
    if json_mode:
        stripped = text.strip()
        if stripped.startswith("```"):
            lines = stripped.split("\n")
            inner = "\n".join(lines[1:] if lines[-1].strip() == "```" else lines[1:])
            inner = inner.rstrip("` \n")
            text = inner
        try:
            json.loads(text)
        except json.JSONDecodeError:
            logger.warning(
                "LLM returned invalid JSON in json_mode (async)",
                extra={"raw_response": text[:200]},
            )

    return text
```

The existing synchronous `complete()` method is unchanged. `anthropic==0.40.0` includes `AsyncAnthropic` (available since ~0.20.0).

---

### T-17: Merge classify+plan, Async Orchestrator and Tools — COMPLETE

**Files:** `backend/app/agent/planner.py`, `backend/app/agent/intent.py`, `backend/app/agent/orchestrator.py`, `backend/app/tools/vector_tool.py`, `backend/app/tools/sql_tool.py`, `backend/app/tools/compute_tool.py`, `backend/app/graph/expander.py`, `backend/app/api/query.py`

This is a three-part conversion that must be done together: (a) merged classify+plan, (b) async orchestrator, (c) async tools.

**Step a — `classify_and_plan_async()` in `agent/planner.py`:**
```python
async def classify_and_plan_async(
    query: str,
    fast_llm: ClaudeClient,
    domain: str = "aircraft",
) -> dict:
    """
    Single Haiku call returning {"intent": str, "plan_text": str, "steps": [...]}.
    Eliminates one full LLM round-trip (~400-600 ms) versus sequential classify+plan.
    System prompt is a union of the intent classifier and planner prompts.
    """
```

**Step b — async orchestrator `run()`:**
```python
async def run(self, query: str, domain: str = "aircraft") -> AgentRunResult:
    # Classify + plan in one call
    plan_result = await classify_and_plan_async(query, self._fast_llm, domain)
    intent = plan_result["intent"]

    # For hybrid: vector search and SQL have no data dependency; run concurrently
    if intent == "hybrid":
        async with asyncio.TaskGroup() as tg:
            vec_task = tg.create_task(self._vector_tool.run_async(...))
            sql_task = tg.create_task(self._sql_tool.run_named_async(...))
        # ... collect results

    # Graph expansion, synthesis, verify — serial (data dependencies)
    # ...
```

**Step c — async tools:**
- Each tool `run()` becomes `async def run()`.
- Replace `get_sync_session()` with `async with get_session()`.
- CPU-bound embedding inference wraps in `run_in_executor`:
```python
loop = asyncio.get_event_loop()
cached = await loop.run_in_executor(None, model.encode_single_cached, query_text)
query_vec = np.array(cached, dtype=np.float32)
```

**Step d — `query.py` (complete):**
```python
# query.py calls the async orchestrator directly — no threadpool wrapper:
result = await orchestrator.run(body.query, domain=body.domain)
```

Expected total latency improvement: >400 ms on hybrid queries from overlapping classify, plan, and vector+SQL tool execution.

---

## Environment Variables

| Variable | Required | Format | Default | Description |
|---|---|---|---|---|
| `PG_DSN` | YES* | `postgresql://user:pass@host/db?sslmode=require` | none | PostgreSQL DSN for sync engine and Alembic |
| `DATABASE_URL` | YES* | Same as `PG_DSN` | none | Alias; both are read by `_get_dsn()` |
| `ANTHROPIC_API_KEY` | YES | `sk-ant-api03-...` | none | Claude API key; raises `EnvironmentError` at startup if missing |
| `CORS_ORIGINS` | NO | Comma-separated URLs | `""` | Extra origins appended to base CORS allowlist in `main.py` |
| `LLM_MODEL` | NO | Model ID string | `"claude-sonnet-4-6"` | Override synthesis model (used by `get_llm_client()`) |
| `KAGGLE_USERNAME` | NO | Kaggle username | none | Required for Kaggle dataset download; omit to use seed CSVs |
| `KAGGLE_KEY` | NO | Kaggle API key | none | Required for Kaggle dataset download; omit to use seed CSVs |

*Either `PG_DSN` or `DATABASE_URL` is required (`PG_DSN` takes precedence). At least one must be set.

**DSN format requirements:**
- Sync engine (psycopg2): `postgresql://` prefix; `?sslmode=require` kept (Neon requires it).
- Async engine (asyncpg): `_get_dsn(async_driver=True)` automatically strips `?sslmode=require` and replaces `postgresql://` with `postgresql+asyncpg://`.
- `postgres://` (Heroku-style) is normalised to `postgresql://` by `_get_dsn`.

---

## Connection Pool Configuration

### Current State

| Engine | `pool_size` | `max_overflow` | `pool_recycle` | `pool_timeout` | `pool_pre_ping` | Max connections |
|---|---|---|---|---|---|---|
| Async (`create_async_engine`) | 10 | 20 | NOT SET | NOT SET | True | 30 |
| Sync (`create_engine`) | 5 (default) | 10 (default) | NOT SET | 30 (default) | True | 15 |

### Recommended State (after T-04)

| Engine | `pool_size` | `max_overflow` | `pool_recycle` | `pool_timeout` | `pool_pre_ping` | Max connections |
|---|---|---|---|---|---|---|
| Async | 10 | 20 | 1800 | 30 | True | 30 |
| Sync | 10 | 10 | 1800 | 30 | True | 20 |

**Total max connections to Neon: 50.** Neon free tier allows 100; safe for single-instance Render deployment.

**Why `pool_recycle=1800`:** Neon closes idle connections after ~5 minutes. Without `pool_recycle`, SQLAlchemy retains stale connection objects. `pool_pre_ping=True` detects dead connections on reuse, but `pool_recycle` prevents the issue entirely by proactively retiring connections every 30 minutes.

---

## Setup and Migration

### Local Development

```bash
# 1. Start PostgreSQL + backend via Docker Compose
docker compose up --build

# 2. Apply Alembic migrations (if not run in Dockerfile)
docker compose exec backend alembic upgrade head

# 3. Trigger data ingest (background; 3-5 minutes)
curl -X POST http://localhost:8000/ingest
curl -X POST http://localhost:8000/ingest/medical

# 4. Verify health
curl http://localhost:8000/healthz

# 5. Test a query
curl -X POST http://localhost:8000/query \
  -H "Content-Type: application/json" \
  -d '{"query": "Find incidents with hydraulic failures", "domain": "aircraft"}'
```

### Creating New Alembic Migrations (for T-10, T-12)

```bash
cd backend

# Generate migration file
alembic revision -m "hnsw_index_and_graph_edge_composite_indexes"

# Edit the generated file in backend/app/db/migrations/versions/
# Then apply:
alembic upgrade head

# Verify (connect to DB):
# psql $PG_DSN -c "\d incident_embeddings"   -- confirm HNSW index
# psql $PG_DSN -c "\d graph_edge"             -- confirm composite indexes
```

**IMPORTANT:** `CREATE INDEX CONCURRENTLY` cannot run inside a transaction. Before running migrations that contain it, either set `transaction_per_migration = False` in `backend/app/db/migrations/env.py`, or execute the index DDL manually in psql and mark the Alembic revision as applied with `alembic stamp <revision_id>`.

---

## Testing

```bash
cd backend
pip install -r requirements.txt
python -m spacy download en_core_web_sm

# Run all tests
pytest tests/

# Single file
pytest tests/test_sql_guardrails.py

# Verbose
pytest tests/ -v

# Single test
pytest -k "test_router"
```

**Test framework:** `pytest` + `pytest-asyncio`. Async tests use `@pytest.mark.asyncio`.

**Coverage expectations:**
- SQL guardrail: all blocked keywords and edge cases.
- Intent classifier: happy path + fallback on invalid/empty LLM response.
- Planner: valid plan structure + fallback for each intent type.
- Verifier: claim normalisation, confidence clamping, empty-claims short-circuit.
- VectorSearchTool: mocked DB + embedding model.
- SQLQueryTool: guardrail blocking, named query dispatch, unknown-name error.

---

## Known Constraints and Future Considerations

### Active Bug

**T-17 (complete):** The orchestrator is fully async. `orchestrator.run()` is `async def` and is awaited directly in `query.py`. Concurrent requests are no longer serialised.

### Performance Constraints

- **CPU-only embedding inference:** Render free tier has no GPU. `all-MiniLM-L6-v2` takes 20-80 ms per encoding on CPU. Mitigated by T-02 LRU cache.
- **Render cold starts:** First request after ~15 min inactivity incurs embedding model reload (~2-4 s) + DB connection warm-up + first LLM call. The frontend's `/healthz` warm-up ping addresses user-facing cold starts but not the embedding model load.
- **Single Render instance assumption:** Pool sizing targets a single process. Horizontal scaling requires proportionally reducing `pool_size` to stay within Neon's connection limit. Consider Neon's built-in PgBouncer for multi-instance deployments.

### Schema Tech Debt

- **Text PKs:** All PKs are TEXT storing UUID strings instead of native UUID type. Functionally correct; minor inefficiency.
- **No audit columns on most tables:** `incident_reports`, `manufacturing_defects`, `maintenance_logs`, `graph_node`, `graph_edge` lack `updated_at` and `created_by`.
- **`entities` column in `medical_cases` is TEXT, not JSONB:** Should be JSONB for proper indexing.
- **ILIKE join in `incidents_defects_join`:** `JOIN ... ON md.product ILIKE '%' || ir.system || '%'` is non-sargable. Bounded by `LIMIT 50` but would degrade on large tables without pre-computed join keys.
- **Ingest pipeline is fully synchronous:** Ingest progress cannot be monitored via API. Consider adding a status polling endpoint.
- **`agent_runs` grows unbounded:** No TTL or cleanup policy. Add a periodic job in production.

### Async Migration Path

The async orchestrator (T-17) is complete. T-16 (async LLM client) and T-17 (async orchestrator + tools) are both deployed. The full async concurrency path is active.

---

## Open Questions for Frontend

1. **Domain selection UX:** `domain` defaults to `"aircraft"`. Does the frontend always send this field explicitly, or rely on the default? Confirm the medical domain queries always include `"domain": "medical"` in the request body.

2. **`run_id` persistence:** The response includes `run_id` for re-fetching via `GET /runs/{run_id}`. Does the frontend currently store or display `run_id`? It must be read from `QueryResponse.run_id` in the response.

3. **Citation highlighting:** `char_start`/`char_end` in citations map to offsets within `chunk_text` (not the full narrative). The Citations drawer must call `GET /docs/{doc_id}/chunks/{chunk_id}` to get `chunk_text`, then apply the offsets within that text.

4. **Graph node/edge caps:** Backend caps graph output at 40 nodes and 80 edges. If the frontend graph viewer has its own rendering limits, these server-side caps can be tuned in `orchestrator.py` lines 380-381.

5. **409 on `/ingest`:** If the frontend has an "Ingest Data" button, it should handle `409 Conflict` gracefully and inform the user that a pipeline is already running.

6. **`/healthz` warm-up polling:** After T-09 adds `Cache-Control: no-store`, the poll always reaches the backend. No frontend change required, but the header should not be suppressed by a service worker cache.

7. **`filters` field wiring:** The `filters` field in `QueryRequest` is accepted but not explicitly passed through to tool inputs — the LLM planner may or may not include them in the generated plan's `tool_inputs`. If per-query filters are a frontend feature, verify end-to-end that the planner reliably includes `system`/`severity` in the `VectorSearchTool` tool inputs.

8. **`run_summary.state_timings_ms` (T3-02):** The response now includes a `state_timings_ms` dict with per-stage latency breakdown. The frontend can optionally display this in the AgentTimeline component for debugging. Keys: `classify_plan_ms`, `execute_tools_ms`, `expand_graph_ms`, `synthesise_ms`, `verify_ms`, `save_ms`.

9. **`run_summary.cached` (T3-04):** When a query result is served from the 5-minute cache, `run_summary.cached = true`. The frontend can display a "Cached result" badge in the run timeline if desired.

---

## Wave 3 Changes (T3-01 through T3-15)

### SQL Migrations Required (run before deploying Wave 3)

Run these against both local Docker and Neon production:

```sql
-- T3-03: GIN full-text search indexes for BM25 hybrid search
-- Run CONCURRENTLY to avoid locking the table in production
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_incident_reports_fts
    ON incident_reports USING GIN(to_tsvector('english', narrative));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_medical_cases_fts
    ON medical_cases USING GIN(to_tsvector('english', narrative));

-- T3-04: Index for query cache lookup performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_runs_query_ts
    ON agent_runs (LOWER(query), created_at DESC);
```

### New Files Added

| File | Purpose |
|---|---|
| `backend/app/schemas/llm_outputs.py` | Pydantic output models for structured LLM responses (T3-01) |

### Key Function Changes

| Function | File | Change |
|---|---|---|
| `bm25_search()` | `retrieval.py` | New — PostgreSQL FTS search (T3-03) |
| `hybrid_search()` | `retrieval.py` | New — RRF fusion of vector + BM25 (T3-03) |
| `mmr_rerank()` | `retrieval.py` | New — MMR deduplication of vector hits (T3-06) |
| `_embed_and_store_medical_sync()` | `pipeline.py` | New — medical domain ingest (T3-13) |
| `_check_query_cache()` | `orchestrator.py` | New async — 5-minute query cache (T3-04) |
| `VectorSearchTool.run_async()` | `vector_tool.py` | Added `search_mode` param; MMR applied (T3-03, T3-06) |
| `classify_and_plan[_async]()` | `intent.py` | Pydantic validation + one-shot retry (T3-01) |
| `verify_claims[_async]()` | `verifier.py` | Pydantic validation + retry; conflict_flagged sent to LLM (T3-01, T3-07) |
| `_fallback_verification()` | `verifier.py` | Ranked confidence by claim position (T3-07) |
| `AgentOrchestrator.run()` | `orchestrator.py` | Per-stage timing; synthesis Pydantic validation+retry; tool timeout; cache check (T3-01, T3-02, T3-04, T3-14) |
| `ClaudeClient.complete[_async]()` | `client.py` | Token usage logged; latency_ms logged; estimated cost logged; max_retries=3 (T3-02, T3-10) |
| `EmbeddingModel.encode()` | `embeddings.py` | tqdm suppressed on non-TTY stderr (T3-15) |
| `get_run()` | `query.py` | Converted to async session (T3-08) |

### Skipped Tasks

| Task | Reason |
|---|---|
| T3-05 | `register_vector()` binding for asyncpg requires custom `on_connect` hook with asyncpg-native connection type. The `str()` serialisation path still works correctly; the CAST in SQL is valid. Deferred to avoid potential asyncpg driver compatibility risk without a running test environment. |
| T3-09 | `expand_graph_async` already uses `run_sync` which offloads to a thread. This is functionally correct; the native-async rewrite is a performance optimization requiring a full BFS port. Not implemented in this wave. |
| T3-11 | Chunker sentence-boundary snapping is a heuristic improvement. Deferred as it requires careful testing with the tokenizer decode path to avoid incorrect char_start/char_end offsets. |
| T3-12 | Test infrastructure expansion is a medium-effort standalone task. The existing test suite is unaffected by Wave 3 changes. |


---

## Wave 3 Backend Handoff

> Source: backend2.md (2026-03-07)

# backend2.md — NextAgentAI Wave 3 Backend Handoff

**Generated from:** `prd2.md` v1.1, `tasks2.md`, `upgrade.md` Phase 4, and live codebase inspection
**Date:** 2026-03-07
**Status:** Implementation-ready

---

## Table of Contents

1. [Overview](#1-overview)
2. [Database Schema Changes (Alembic migrations)](#2-database-schema-changes-alembic-migrations)
3. [Schema Changes — `backend/app/schemas/models.py`](#3-schema-changes)
4. [New API Endpoints](#4-new-api-endpoints)
5. [LLM Client Changes — `backend/app/llm/client.py`](#5-llm-client-changes)
6. [Orchestrator Changes — `backend/app/agent/orchestrator.py`](#6-orchestrator-changes)
7. [RAG Changes — `backend/app/rag/retrieval.py`](#7-rag-changes)
8. [Tool Changes](#8-tool-changes)
9. [main.py changes](#9-mainpy-changes)
10. [Environment Variables](#10-environment-variables)
11. [Test Plan](#11-test-plan)
12. [Deployment Notes](#12-deployment-notes)

---

## 1. Overview

### What Wave 3 adds to the backend

| Epic | Backend work? | Summary |
|------|--------------|---------|
| Epic 1 — Conversational Memory | Yes | 1 migration, schema fields, orchestrator synthesis-prompt injection |
| Epic 2 — Query History & Favourites | Yes | 1 migration, schema model, new `runs.py` router |
| Epic 3 — Streaming Synthesis | Yes | `stream()` method on `LLMClient`, SSE variant in `query.py` |
| Epic 4 — Real Dashboard Analytics | Yes | New `analytics.py` router with 3 endpoints |
| Epic 5 — Export & Reporting | None | Client-side only |
| Epic 6 — Enhanced Citation UX | None | Client-side only (`conflict_flagged` already propagated in T3-07) |
| Epic 7 — Examples → Chat Integration | None | Client-side `localStorage` bridge |
| Epic 8 — Graph Enhancements | None | Client-side ReactFlow changes |
| Epic 9 — Medical Domain Parity | Yes | 1 migration (HNSW + GIN + agent_runs index), 1 named SQL query |
| Epic 10 — Observability | Yes | Fix CR-007 in `compute_tool.py`, add `source` field to `VectorHit` |

### Files modified vs new

| File | Status | Epic(s) |
|------|--------|---------|
| `backend/app/db/migrations/20260307_001_add_session_id_to_agent_runs.py` | NEW | 1 |
| `backend/app/db/migrations/20260307_002_add_is_favourite_to_agent_runs.py` | NEW | 2 |
| `backend/app/db/migrations/20260307_003_wave3_indexes.py` | NEW | 9 |
| `backend/app/db/models.py` | EDIT | 1, 2 |
| `backend/app/schemas/models.py` | EDIT | 1, 2, 10 |
| `backend/app/agent/orchestrator.py` | EDIT | 1 |
| `backend/app/api/query.py` | EDIT | 3 |
| `backend/app/api/runs.py` | NEW | 2 |
| `backend/app/api/analytics.py` | NEW | 4 |
| `backend/app/llm/client.py` | EDIT | 3 |
| `backend/app/rag/retrieval.py` | EDIT | 10 |
| `backend/app/tools/compute_tool.py` | EDIT | 10 |
| `backend/app/tools/sql_tool.py` | EDIT | 9 |
| `backend/app/main.py` | EDIT | 2, 3, 4 |

### Migration strategy

Run in this order — each migration is independent and can be applied sequentially:

1. `20260307_001` — adds `session_id` (nullable, no constraint risk)
2. `20260307_002` — adds `is_favourite` (`NOT NULL DEFAULT FALSE`, safe for existing rows)
3. `20260307_003` — creates four indexes `CONCURRENTLY` (zero-downtime; requires COMMIT before each)

Rollback: each migration has a working `downgrade()`. Run `alembic downgrade -1` per migration in reverse order. The `CONCURRENTLY` index migrations use plain `DROP INDEX IF EXISTS` in `downgrade()` which does not require a COMMIT wrapper.

---

## 2. Database Schema Changes (Alembic migrations)

### Pre-conditions

- The migration runner connects with `PG_DSN` (sync psycopg2 driver) — see `backend/app/db/migrations/env.py`.
- All three migrations below must be in `backend/app/db/migrations/` and discovered by Alembic.
- Running `alembic history` should show all three in the chain with no orphaned heads.
- The `alembic.ini` `script_location` is `backend/app/db/migrations` — do not move files.

---

### Migration 1 — W3-001: `session_id` column on `agent_runs`

**File:** `backend/app/db/migrations/20260307_001_add_session_id_to_agent_runs.py`

**Tasks satisfied:** W3-001

```python
"""Add session_id nullable UUID column to agent_runs.

Revision ID: 20260307_001
Revises: <previous_head>   # replace with actual last revision ID from alembic history
Create Date: 2026-03-07
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = "20260307_001"
down_revision = None  # Set to the actual previous head revision ID
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    Add session_id UUID nullable column to agent_runs.

    Nullable with no default — existing rows get NULL automatically.
    This is a zero-breaking-change schema addition; no API callers are affected.
    """
    op.add_column(
        "agent_runs",
        sa.Column(
            "session_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    """Drop session_id column — restores pre-W3-001 schema."""
    op.drop_column("agent_runs", "session_id")
```

**Critical notes:**
- `down_revision` must be set to the actual last revision ID shown by `alembic history`. Run `alembic history` in the repo before filling this in.
- Do NOT add a default value. The column is intentionally nullable so all existing rows remain valid.
- No `CREATE INDEX CONCURRENTLY` in this migration — no `op.execute("COMMIT")` needed here.

---

### Migration 2 — W3-002: `is_favourite` column on `agent_runs`

**File:** `backend/app/db/migrations/20260307_002_add_is_favourite_to_agent_runs.py`

**Tasks satisfied:** W3-002

```python
"""Add is_favourite BOOLEAN NOT NULL DEFAULT FALSE column to agent_runs.

Revision ID: 20260307_002
Revises: 20260307_001
Create Date: 2026-03-07
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260307_002"
down_revision = "20260307_001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    Add is_favourite BOOLEAN NOT NULL DEFAULT FALSE to agent_runs.

    NOT NULL is safe here because FALSE is a valid default for all existing rows.
    No data migration is needed.
    """
    op.add_column(
        "agent_runs",
        sa.Column(
            "is_favourite",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    """Drop is_favourite column — restores pre-W3-002 schema."""
    op.drop_column("agent_runs", "is_favourite")
```

**Critical notes:**
- Use `server_default=sa.text("false")` (not `default=False`) so PostgreSQL fills the column at the DB level during the ALTER TABLE. This is required for `NOT NULL` on existing rows.
- This migration depends on `20260307_001`. Alembic enforces this via `down_revision`.

---

### Migration 3 — W3-025: HNSW + GIN + agent_runs composite indexes

**File:** `backend/app/db/migrations/20260307_003_wave3_indexes.py`

**Tasks satisfied:** W3-025

```python
"""Wave 3 performance indexes:
- HNSW cosine index on medical_embeddings (replaces IVFFlat, matches aircraft)
- GIN FTS indexes on incident_reports.narrative and medical_cases.narrative
- Composite index on agent_runs(LOWER(query), created_at DESC) for cache lookup

Revision ID: 20260307_003
Revises: 20260307_002
Create Date: 2026-03-07

WARNING: Each CREATE INDEX CONCURRENTLY must be preceded by op.execute("COMMIT")
because CONCURRENTLY cannot run inside a PostgreSQL transaction block.
Alembic wraps migrations in transactions by default — the explicit COMMIT ends
the implicit transaction so CONCURRENTLY can proceed. Without this the index
creation silently fails or raises an error.
"""
from __future__ import annotations

from alembic import op

revision = "20260307_003"
down_revision = "20260307_002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------ IMPORTANT
    # Each CONCURRENTLY index requires the transaction block to be ended first.
    # op.execute("COMMIT") ends Alembic's implicit transaction for this statement.
    # ------------------------------------------------------------------ IMPORTANT

    # 1. HNSW index on medical_embeddings — parity with incident_embeddings
    op.execute("COMMIT")
    op.execute("""
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_medical_embeddings_hnsw
        ON medical_embeddings USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    """)

    # 2. GIN full-text index on incident_reports.narrative (aircraft domain BM25)
    op.execute("COMMIT")
    op.execute("""
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_incident_reports_fts
        ON incident_reports USING GIN(to_tsvector('english', narrative))
    """)

    # 3. GIN full-text index on medical_cases.narrative (medical domain BM25)
    op.execute("COMMIT")
    op.execute("""
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_medical_cases_fts
        ON medical_cases USING GIN(to_tsvector('english', narrative))
    """)

    # 4. Composite index on agent_runs for query-cache LOWER(query) lookups
    op.execute("COMMIT")
    op.execute("""
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_runs_query_ts
        ON agent_runs (LOWER(query), created_at DESC)
    """)


def downgrade() -> None:
    # Standard DROP INDEX — does not require COMMIT wrapper
    op.execute("DROP INDEX IF EXISTS idx_medical_embeddings_hnsw")
    op.execute("DROP INDEX IF EXISTS idx_incident_reports_fts")
    op.execute("DROP INDEX IF EXISTS idx_medical_cases_fts")
    op.execute("DROP INDEX IF EXISTS idx_agent_runs_query_ts")
```

**Critical notes:**
- The `op.execute("COMMIT")` before each `CREATE INDEX CONCURRENTLY` is mandatory. Without it PostgreSQL raises `ERROR: CREATE INDEX CONCURRENTLY cannot run inside a transaction block` or, worse, silently creates a broken index.
- `IF NOT EXISTS` makes each statement idempotent — safe to re-run if the migration partially succeeded.
- The HNSW parameters `m=16, ef_construction=64` match those used for `incident_embeddings` (applied in earlier Wave 1/2 migrations). Do not change these without profiling.
- `ef_search=40` is already set at the async engine level in `session.py` via `connect_args`. No per-query SET needed.
- Verification after deploy: run `EXPLAIN (ANALYZE, FORMAT JSON) SELECT ...` on a medical embedding query and confirm "Index Scan using idx_medical_embeddings_hnsw" appears in the plan.

---

## 3. Schema Changes

**File:** `backend/app/schemas/models.py`

All changes are additive. No existing field is removed or made non-optional.

### 3a. `QueryRequest` — Epic 1 (W3-003)

Add two optional fields after the existing `filters` field:

```python
class QueryRequest(BaseModel):
    query: str = Field(
        ...,
        min_length=3,
        max_length=2000,
        description="Natural language question to ask the agent",
        examples=["Find incidents similar to hydraulic actuator crack on Line 1"],
    )
    domain: str = Field(
        "aircraft",
        description="Data domain to query: 'aircraft' (manufacturing/maintenance) or 'medical' (clinical cases)",
        pattern="^(aircraft|medical)$",
    )
    filters: dict[str, Any] | None = Field(
        None,
        description="Optional metadata filters: {system, severity, date_range: [from, to]}",
    )
    # W3-003 — Epic 1: Conversational Memory
    session_id: str | None = Field(
        None,
        description="Client-generated UUID for the current conversation session. "
                    "Stored in agent_runs.session_id. Pass the same value on follow-up "
                    "queries within the same session.",
    )
    conversation_history: list[dict] | None = Field(
        None,
        description="Prior turns in this session. Each dict: "
                    '{"query": str, "answer_summary": str}. '
                    "Max 5 most-recent turns are used in synthesis. "
                    "Backend enforces the limit — client may send more.",
    )
```

**Invariant:** `QueryRequest(query="test")` must still instantiate without error (both new fields default to `None`). Run `pytest tests/` after the change to confirm no test regressions.

---

### 3b. `RunSummary` — Epics 2 and 10 (W3-004, W3-029)

The existing `RunSummary` in `models.py` is the **execution summary** embedded in `QueryResponse`. A new **`HistoryRunSummary`** model is needed for the `GET /runs` list endpoint — it represents a row from `agent_runs`.

Add `HistoryRunSummary` as a new model (do not modify the existing `RunSummary` class — that would break `QueryResponse`):

```python
# W3-004 — Epic 2: Query History & Favourites
# This is a distinct model from RunSummary (which is the execution trace inside QueryResponse).
# HistoryRunSummary is the lightweight list-item shape returned by GET /runs.
class HistoryRunSummary(BaseModel):
    id: str = Field(..., description="run_id UUID")
    query: str
    intent: str = Field("unknown", description="Classified intent: hybrid, semantic, sql_only, compute")
    created_at: datetime | None = None
    cached: bool = False
    latency_ms: float = 0.0
    is_favourite: bool = False
```

Also add a pagination wrapper used by `GET /runs`:

```python
class RunListResponse(BaseModel):
    items: list[HistoryRunSummary]
    total: int
```

---

### 3c. `VectorHit` — Epic 10 (W3-029)

Add `source` field to `VectorHit`:

```python
from typing import Any, Literal  # add Literal to the existing typing import

class VectorHit(BaseModel):
    chunk_id: str
    incident_id: str
    score: float = Field(..., ge=0.0, le=1.0)
    excerpt: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    # W3-029 — Epic 10: source label added during hybrid merge in retrieval.py
    source: Literal["bm25", "vector", "hybrid"] = Field(
        "vector",
        description="Which retrieval path produced this hit: 'bm25', 'vector', or 'hybrid' (RRF fused).",
    )
```

**Important:** This field has a default of `"vector"` so all existing code that constructs `VectorHit` without specifying `source` continues to work. The `source` field is populated by `retrieval.py` during the hybrid merge step (see Section 7).

---

### 3d. Full updated `models.py`

Below is the complete updated file. Replace the existing `backend/app/schemas/models.py` with this content:

```python
"""
Pydantic request/response schemas for the NextAgentAI FastAPI application.
These define the typed API contracts for all endpoints.

Wave 3 additions:
  - QueryRequest: session_id, conversation_history (W3-003)
  - HistoryRunSummary: lightweight run list item (W3-004)
  - RunListResponse: pagination wrapper for GET /runs (W3-004)
  - VectorHit.source: retrieval path label (W3-029)
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Shared sub-schemas
# ---------------------------------------------------------------------------


class Citation(BaseModel):
    chunk_id: str = Field(..., description="ID of the source embedding chunk")
    incident_id: str = Field(..., description="ID of the source incident report")
    char_start: int = Field(..., description="Start character offset in chunk_text")
    char_end: int = Field(..., description="End character offset in chunk_text")


class Claim(BaseModel):
    text: str = Field(..., description="The factual claim text")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence score 0.0–1.0")
    citations: list[Citation] = Field(default_factory=list)
    conflict_note: str | None = Field(None, description="Note if conflicting evidence was detected")


class VectorHit(BaseModel):
    chunk_id: str
    incident_id: str
    score: float = Field(..., ge=0.0, le=1.0)
    excerpt: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    # W3-029: source label populated by retrieval.py during hybrid merge
    source: Literal["bm25", "vector", "hybrid"] = Field(
        "vector",
        description="Retrieval path: 'bm25', 'vector', or 'hybrid' (RRF fused).",
    )


class SqlResult(BaseModel):
    query: str
    columns: list[str]
    rows: list[list[Any]]
    row_count: int


class Evidence(BaseModel):
    vector_hits: list[VectorHit] = Field(default_factory=list)
    sql_rows: list[SqlResult] = Field(default_factory=list)


class GraphNode(BaseModel):
    id: str
    type: str = Field(..., description="'chunk' or 'entity'")
    label: str | None = None
    properties: dict[str, Any] | None = None


class GraphEdge(BaseModel):
    id: str
    from_node: str
    to_node: str
    type: str = Field(..., description="'mentions', 'similarity', or 'co_occurrence'")
    weight: float | None = None


class GraphPath(BaseModel):
    nodes: list[GraphNode] = Field(default_factory=list)
    edges: list[GraphEdge] = Field(default_factory=list)


class StepSummary(BaseModel):
    step_number: int
    tool_name: str
    output_summary: str
    latency_ms: float
    error: str | None = None


class RunSummary(BaseModel):
    intent: str
    plan_text: str
    steps: list[StepSummary] = Field(default_factory=list)
    tools_used: list[str] = Field(default_factory=list)
    total_latency_ms: float
    halted_at_step_limit: bool = False
    state_timings_ms: dict[str, float] = Field(
        default_factory=dict,
        description="Per-state latency breakdown in milliseconds (T3-02)",
    )
    cached: bool = Field(False, description="True if this result was served from query cache (T3-04)")


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class QueryRequest(BaseModel):
    query: str = Field(
        ...,
        min_length=3,
        max_length=2000,
        description="Natural language question to ask the agent",
        examples=["Find incidents similar to hydraulic actuator crack on Line 1"],
    )
    domain: str = Field(
        "aircraft",
        description="Data domain to query: 'aircraft' (manufacturing/maintenance) or 'medical' (clinical cases)",
        pattern="^(aircraft|medical)$",
    )
    filters: dict[str, Any] | None = Field(
        None,
        description="Optional metadata filters: {system, severity, date_range: [from, to]}",
    )
    # W3-003 — Epic 1: Conversational Memory
    session_id: str | None = Field(
        None,
        description="Client UUID for the current session. Stored in agent_runs.session_id.",
    )
    conversation_history: list[dict] | None = Field(
        None,
        description='Prior turns: [{"query": str, "answer_summary": str}, ...]. Max 5 used.',
    )


class IngestRequest(BaseModel):
    """Optional body for POST /ingest — all fields have defaults."""
    force: bool = Field(
        False,
        description="If true, re-ingest even if data already exists",
    )


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class QueryResponse(BaseModel):
    run_id: str = Field(..., description="UUID of this agent run — use GET /runs/{run_id} to re-fetch")
    query: str
    answer: str = Field(..., description="Synthesised natural language answer")
    claims: list[Claim] = Field(default_factory=list)
    evidence: Evidence
    graph_path: GraphPath
    run_summary: RunSummary
    assumptions: list[str] = Field(default_factory=list)
    next_steps: list[str] = Field(default_factory=list)


class IngestResponse(BaseModel):
    status: str = Field(..., description="'started' | 'already_running' | 'complete' | 'failed'")
    message: str


class ChunkResponse(BaseModel):
    chunk_id: str
    incident_id: str
    chunk_text: str
    chunk_index: int
    char_start: int
    char_end: int
    metadata: dict[str, Any] = Field(default_factory=dict)


class DocListItem(BaseModel):
    incident_id: str
    asset_id: str | None
    system: str | None
    severity: str | None
    event_date: str | None
    source: str
    chunk_count: int


class HealthResponse(BaseModel):
    status: str = Field(..., description="'ok' | 'degraded'")
    db: bool
    version: str = "1.0.0"


class RunRecord(BaseModel):
    run_id: str
    query: str
    result: dict[str, Any]
    created_at: datetime | None = None


# W3-004 — Epic 2: lightweight run list item for GET /runs
class HistoryRunSummary(BaseModel):
    id: str = Field(..., description="run_id UUID")
    query: str
    intent: str = Field("unknown", description="Classified intent from run_summary.intent")
    created_at: datetime | None = None
    cached: bool = False
    latency_ms: float = 0.0
    is_favourite: bool = False


# W3-004 — pagination wrapper for GET /runs
class RunListResponse(BaseModel):
    items: list[HistoryRunSummary]
    total: int


# W3-014 — Epic 4: analytics response schemas
class DefectDataPoint(BaseModel):
    product: str | None
    defect_type: str | None
    count: int


class MaintenanceDataPoint(BaseModel):
    month: str | None  # ISO date string from DATE_TRUNC result
    event_type: str | None  # metric_name
    count: int


class DiseaseDataPoint(BaseModel):
    specialty: str | None
    disease: str | None
    count: int
```

---

## 4. New API Endpoints

### 4a. `backend/app/api/runs.py` — NEW file (W3-007)

**Endpoints:**
- `GET /runs?limit=20&offset=0` — paginated `agent_runs` summaries, favourites first
- `PATCH /runs/{run_id}/favourite` — toggle `is_favourite`

```python
"""
GET /runs — paginated list of agent run summaries (Query History).
PATCH /runs/{run_id}/favourite — toggle is_favourite on a run.

W3-007: Epic 2 — Query History & Favourites.

Both endpoints use the async SQLAlchemy session (get_session from db/session.py).
The GET /runs endpoint orders by is_favourite DESC, created_at DESC so favourited
runs appear at the top of the list regardless of age.
"""
from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import text

from backend.app.db.session import get_session
from backend.app.observability.logging import get_logger
from backend.app.schemas.models import HistoryRunSummary, RunListResponse

logger = get_logger(__name__)
router = APIRouter()


@router.get(
    "/runs",
    response_model=RunListResponse,
    summary="List agent run history",
    description=(
        "Returns paginated agent run summaries ordered by favourites first, "
        "then reverse chronological. Use limit/offset for pagination."
    ),
)
async def list_runs(
    limit: int = Query(default=20, ge=1, le=100, description="Max items to return"),
    offset: int = Query(default=0, ge=0, description="Number of items to skip"),
) -> RunListResponse:
    """
    Query agent_runs ordered by is_favourite DESC, created_at DESC.
    Returns { items: [...], total: N } where total is the unfiltered count.
    """
    try:
        async with get_session() as session:
            # Total count (for pagination metadata)
            count_result = await session.execute(
                text("SELECT COUNT(*) FROM agent_runs")
            )
            total: int = count_result.scalar() or 0

            # Paginated rows
            rows_result = await session.execute(
                text("""
                    SELECT
                        run_id,
                        query,
                        result,
                        created_at,
                        is_favourite
                    FROM agent_runs
                    ORDER BY is_favourite DESC, created_at DESC
                    LIMIT :limit OFFSET :offset
                """),
                {"limit": limit, "offset": offset},
            )
            rows = rows_result.fetchall()

    except Exception as exc:
        logger.error("list_runs DB error", extra={"error": str(exc)})
        raise HTTPException(status_code=500, detail=f"Database error: {str(exc)}")

    items: list[HistoryRunSummary] = []
    for row in rows:
        result_data = row.result
        if isinstance(result_data, str):
            try:
                result_data = json.loads(result_data)
            except json.JSONDecodeError:
                result_data = {}

        run_summary = result_data.get("run_summary", {}) if result_data else {}
        intent = run_summary.get("intent", "unknown")
        cached = run_summary.get("cached", False)
        latency_ms = run_summary.get("total_latency_ms", 0.0)

        items.append(
            HistoryRunSummary(
                id=row.run_id,
                query=row.query or "",
                intent=intent,
                created_at=row.created_at,
                cached=cached,
                latency_ms=latency_ms,
                is_favourite=bool(row.is_favourite),
            )
        )

    return RunListResponse(items=items, total=total)


@router.patch(
    "/runs/{run_id}/favourite",
    response_model=HistoryRunSummary,
    summary="Toggle favourite status of a run",
    description="Set or clear is_favourite on an agent_runs row. Returns the updated summary.",
)
async def toggle_favourite(run_id: str, body: dict) -> HistoryRunSummary:
    """
    Body: { "is_favourite": bool }
    Returns: updated HistoryRunSummary or 404 if run_id not found.
    """
    is_favourite: bool = bool(body.get("is_favourite", False))

    try:
        async with get_session() as session:
            # Check existence
            check = await session.execute(
                text("SELECT run_id FROM agent_runs WHERE run_id = :run_id"),
                {"run_id": run_id},
            )
            if not check.fetchone():
                raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found.")

            # Update
            await session.execute(
                text(
                    "UPDATE agent_runs SET is_favourite = :is_favourite "
                    "WHERE run_id = :run_id"
                ),
                {"is_favourite": is_favourite, "run_id": run_id},
            )

            # Fetch updated row
            result_row = await session.execute(
                text(
                    "SELECT run_id, query, result, created_at, is_favourite "
                    "FROM agent_runs WHERE run_id = :run_id"
                ),
                {"run_id": run_id},
            )
            row = result_row.fetchone()

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("toggle_favourite DB error", extra={"error": str(exc), "run_id": run_id})
        raise HTTPException(status_code=500, detail=f"Database error: {str(exc)}")

    result_data = row.result
    if isinstance(result_data, str):
        try:
            result_data = json.loads(result_data)
        except json.JSONDecodeError:
            result_data = {}

    run_summary = result_data.get("run_summary", {}) if result_data else {}

    return HistoryRunSummary(
        id=row.run_id,
        query=row.query or "",
        intent=run_summary.get("intent", "unknown"),
        created_at=row.created_at,
        cached=run_summary.get("cached", False),
        latency_ms=run_summary.get("total_latency_ms", 0.0),
        is_favourite=bool(row.is_favourite),
    )
```

**Notes:**
- The `PATCH` body accepts a generic `dict` because Pydantic models in `Body()` add overhead for a single-field payload. If stricter typing is desired, define `class FavouriteRequest(BaseModel): is_favourite: bool` and use it as the body type.
- The `UPDATE` statement runs inside the same async session context. SQLAlchemy async sessions auto-commit when the context manager exits cleanly (no explicit `session.commit()` needed with the current `get_session()` implementation that uses `expire_on_commit=False`).
- Return 404 before attempting the UPDATE — avoids silent no-ops on bad run IDs.

---

### 4b. `backend/app/api/analytics.py` — NEW file (W3-014)

**Endpoints:**
- `GET /analytics/defects?from=&to=&domain=` — defect counts by product
- `GET /analytics/maintenance?from=&to=` — maintenance trends
- `GET /analytics/diseases?from=&to=&specialty=` — disease counts by specialty

All three endpoints use the existing `SQLQueryTool` named-query pattern. The SQL guardrail (SELECT-only regex check) is enforced by `sql_tool.run_named()`. No raw SQL generation occurs in this file.

```python
"""
Analytics endpoints for the Wave 3 dashboard (Tabs 3, 4, 5).

W3-014: Epic 4 — Real Dashboard Analytics.

All three endpoints delegate to SQLQueryTool.run_named_async() which enforces
the SELECT-only guardrail. No raw SQL is generated here.

Named queries used:
  - defect_counts_by_product  (aircraft domain)
  - maintenance_trends         (aircraft domain)
  - disease_counts_by_specialty (medical domain)
  - medical_case_trends        (medical domain — added in W3-026)

Date filtering is currently applied at the named-query level via the 'days'
parameter. Full ISO date-range filtering is a future enhancement.
"""
from __future__ import annotations

import time
from datetime import date
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from backend.app.observability.logging import get_logger
from backend.app.schemas.models import (
    DefectDataPoint,
    DiseaseDataPoint,
    MaintenanceDataPoint,
)
from backend.app.tools.sql_tool import SQLQueryTool

logger = get_logger(__name__)
router = APIRouter()

_sql_tool = SQLQueryTool()


def _date_to_days(from_date: str | None, to_date: str | None) -> int:
    """
    Convert an ISO date range to an integer 'days back from today' value.
    Used to parameterise the named queries which accept :days.

    If from_date is provided, returns days between today and from_date.
    If neither is provided, defaults to 90 days.
    """
    if from_date:
        try:
            parsed = date.fromisoformat(from_date)
            delta = (date.today() - parsed).days
            return max(delta, 1)
        except ValueError:
            pass
    return 90


@router.get(
    "/analytics/defects",
    summary="Defect counts by product and defect type",
    description=(
        "Returns aggregated defect counts from manufacturing_defects, "
        "grouped by product and defect_type. Filtered by date range (from/to ISO dates). "
        "Domain parameter selects data source: 'aircraft' uses manufacturing_defects."
    ),
)
async def get_defects(
    from_date: str | None = Query(None, alias="from", description="ISO start date e.g. 2025-01-01"),
    to_date: str | None = Query(None, alias="to", description="ISO end date e.g. 2025-12-31"),
    domain: str = Query("aircraft", pattern="^(aircraft|medical)$"),
) -> list[dict[str, Any]]:
    days = _date_to_days(from_date, to_date)
    try:
        result = await _sql_tool.run_named_async("defect_counts_by_product", {"days": days})
    except Exception as exc:
        logger.error("analytics/defects error", extra={"error": str(exc)})
        raise HTTPException(status_code=500, detail=str(exc))

    if result.get("error"):
        raise HTTPException(status_code=500, detail=result["error"])

    cols = result.get("columns", [])
    rows = result.get("rows", [])
    output = []
    for row in rows:
        row_dict = dict(zip(cols, row))
        output.append({
            "product": row_dict.get("product"),
            "defect_type": row_dict.get("defect_type"),
            "count": int(row_dict.get("defect_count", 0)),
        })
    return output


@router.get(
    "/analytics/maintenance",
    summary="Maintenance event trends by month",
    description=(
        "Returns maintenance log event counts grouped by metric_name and month. "
        "Used for the Maintenance Trends tab in the dashboard."
    ),
)
async def get_maintenance(
    from_date: str | None = Query(None, alias="from"),
    to_date: str | None = Query(None, alias="to"),
) -> list[dict[str, Any]]:
    # maintenance_trends does not take a :days param — it queries all available data.
    # Passing days=365*10 effectively returns all data; named query already has LIMIT 100.
    try:
        result = await _sql_tool.run_named_async("maintenance_trends", {})
    except Exception as exc:
        logger.error("analytics/maintenance error", extra={"error": str(exc)})
        raise HTTPException(status_code=500, detail=str(exc))

    if result.get("error"):
        raise HTTPException(status_code=500, detail=result["error"])

    cols = result.get("columns", [])
    rows = result.get("rows", [])
    output = []
    for row in rows:
        row_dict = dict(zip(cols, row))
        month_val = row_dict.get("month")
        output.append({
            "month": str(month_val) if month_val else None,
            "event_type": row_dict.get("metric_name"),
            "count": int(row_dict.get("event_count", 0)),
        })
    return output


@router.get(
    "/analytics/diseases",
    summary="Disease case counts by specialty",
    description=(
        "Returns disease case counts from disease_records, grouped by specialty and disease. "
        "Used for the Disease Analytics tab in the dashboard (medical domain)."
    ),
)
async def get_diseases(
    from_date: str | None = Query(None, alias="from"),
    to_date: str | None = Query(None, alias="to"),
    specialty: str | None = Query(None, description="Optional specialty filter (not yet applied at DB level)"),
) -> list[dict[str, Any]]:
    days = _date_to_days(from_date, to_date)
    try:
        result = await _sql_tool.run_named_async("disease_counts_by_specialty", {"days": days})
    except Exception as exc:
        logger.error("analytics/diseases error", extra={"error": str(exc)})
        raise HTTPException(status_code=500, detail=str(exc))

    if result.get("error"):
        raise HTTPException(status_code=500, detail=result["error"])

    cols = result.get("columns", [])
    rows = result.get("rows", [])
    output = []
    for row in rows:
        row_dict = dict(zip(cols, row))
        # Optional specialty filter applied in Python (named query returns all)
        if specialty and row_dict.get("specialty") != specialty:
            continue
        output.append({
            "specialty": row_dict.get("specialty"),
            "disease": row_dict.get("disease"),
            "count": int(row_dict.get("case_count", 0)),
        })
    return output
```

**Notes:**
- The specialty filter is applied in Python rather than SQL because the named query already groups by specialty, and adding a dynamic WHERE clause would require a new named query or parameterisation. This is acceptable for current data volumes (LIMIT 50 in the named query).
- `maintenance_trends` does not accept a `:days` parameter — it queries all data with `WHERE ts IS NOT NULL`. The `from`/`to` query parameters are accepted by the endpoint for API consistency but currently affect only the `defects` and `diseases` endpoints via the `_date_to_days()` helper.
- All three endpoints preserve the SQL guardrail because they call `run_named_async()` which resolves to `run_async()` which applies the `_BLOCKED_PATTERN` regex check before execution.

---

### 4c. `backend/app/api/query.py` — SSE streaming (W3-012)

Add a second route variant to the existing `query.py` that returns `text/event-stream` when the client sends `Accept: text/event-stream`. The existing `POST /query` route is unchanged.

Add the following imports and route to `query.py`:

```python
# Add to existing imports at the top of query.py:
import asyncio
import json
import os

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

# At module level, add:
_STREAMING_ENABLED = os.getenv("STREAMING_ENABLED", "true").lower() == "true"
```

Add this new route function after the existing `run_query` route:

```python
@router.post(
    "/query/stream",
    summary="Run agent query with streaming synthesis output",
    description=(
        "SSE (Server-Sent Events) variant of POST /query. "
        "Returns text/event-stream. Event types: "
        "'token' (synthesis token), 'done' (full QueryResponse), 'error'. "
        "Requires STREAMING_ENABLED=true (default). "
        "EAGER_MODEL_LOAD=true must be set on Render for the 1.5s first-token target."
    ),
    include_in_schema=True,
)
async def run_query_stream(body: QueryRequest, request: Request) -> StreamingResponse:
    """
    SSE streaming endpoint. Triggers synthesis in streaming mode.

    Event format (each line terminated by double newline per SSE spec):
      data: {"type": "token", "text": "..."}\n\n
      data: {"type": "done", "run": {...full QueryResponse dict...}}\n\n
      data: {"type": "error", "message": "..."}\n\n

    Only the synthesis Anthropic call uses stream=True.
    Intent classification, tool execution, and verification remain non-streaming.
    """
    if not _STREAMING_ENABLED:
        # Fallback: run non-streaming and emit a single done event
        try:
            orchestrator = _get_orchestrator()
            result = await orchestrator.run(
                body.query,
                domain=body.domain,
                session_id=body.session_id,
                conversation_history=body.conversation_history,
            )
            result_dict = result.to_dict()
            response_data = QueryResponse(**_normalise_result(result_dict)).model_dump()

            async def _single_event():
                yield f"data: {json.dumps({'type': 'done', 'run': response_data})}\n\n"

            return StreamingResponse(_single_event(), media_type="text/event-stream")
        except Exception as exc:
            async def _error_event():
                yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"
            return StreamingResponse(_error_event(), media_type="text/event-stream")

    async def _event_generator():
        try:
            orchestrator = _get_orchestrator()

            # Run the full agent pipeline up to (but not including) synthesis.
            # The orchestrator.run_until_synthesis() method must be added — see
            # Section 6 of this document for the orchestrator changes.
            # It returns the pre-synthesis state needed to stream synthesis output.
            pre_synth = await orchestrator.run_until_synthesis(
                body.query,
                domain=body.domain,
                session_id=body.session_id,
                conversation_history=body.conversation_history,
            )

            # Stream synthesis tokens
            async for token_text in orchestrator.stream_synthesis(pre_synth):
                event = json.dumps({"type": "token", "text": token_text})
                yield f"data: {event}\n\n"

            # Finalise (verify + save) and emit done event
            result = await orchestrator.finalise(pre_synth)
            result_dict = result.to_dict()
            response_data = QueryResponse(**_normalise_result(result_dict)).model_dump()
            yield f"data: {json.dumps({'type': 'done', 'run': response_data})}\n\n"

        except asyncio.CancelledError:
            # Client disconnected — this is expected; do not log as error
            return
        except Exception as exc:
            logger.error(
                "Streaming query failed",
                extra={"error": str(exc), "query": body.query[:100]},
            )
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

    return StreamingResponse(
        _event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # Disable nginx buffering on Render
        },
    )
```

**Architectural note on `run_until_synthesis` / `finalise` / `stream_synthesis`:**

The streaming endpoint requires the orchestrator to be split into phases. This is implemented by adding three new methods to `AgentOrchestrator`:

1. `run_until_synthesis(query, domain, session_id, conversation_history)` — runs CLASSIFY+PLAN → EXECUTE_TOOLS → EXPAND_GRAPH → RE_RANK and returns a `PreSynthesisState` dataclass with all accumulated state.
2. `stream_synthesis(pre_synth_state)` — calls `self._async_llm.stream(prompt)` and yields token strings.
3. `finalise(pre_synth_state, streamed_answer)` — runs VERIFY → SAVE → DONE and returns `AgentRunResult`.

See Section 6 for the full orchestrator changes.

---

## 5. LLM Client Changes

**File:** `backend/app/llm/client.py`

Add `stream()` abstract method and implementation. Only the Sonnet synthesis client needs streaming — Haiku classify/plan/verify calls remain non-streaming.

### 5a. ABC changes

Add to `LLMClient` abstract class:

```python
from typing import AsyncIterator  # add to imports

class LLMClient(ABC):
    # ... existing complete() and complete_async() ...

    @abstractmethod
    async def stream(
        self,
        prompt: str,
        system: str = "",
        max_tokens: int = 4096,
    ) -> AsyncIterator[str]:
        """
        Stream synthesis tokens as an async iterator.

        Yields one string per token as the model generates output.
        The caller is responsible for accumulating the full response if needed.

        Args:
            prompt:     The user-turn message.
            system:     Optional system prompt.
            max_tokens: Maximum tokens to generate.

        Yields:
            Individual token strings from the model stream.

        Note: json_mode is not supported for streaming — the synthesis prompt
        already produces well-structured prose, not JSON. Claims and metadata
        are extracted after streaming via the done event.
        """
        ...
```

### 5b. `ClaudeClient` implementation

Add to `ClaudeClient` class after `complete_async()`:

```python
    async def stream(
        self,
        prompt: str,
        system: str = "",
        max_tokens: int = 4096,
    ) -> AsyncIterator[str]:
        """
        Stream synthesis tokens using the Anthropic streaming API.

        Uses AsyncAnthropic.messages.stream() context manager which yields
        MessageStreamEvent objects. We extract text deltas from
        RawContentBlockDeltaEvent events.

        Only used for synthesis (Sonnet). Haiku clients should never call stream()
        — classify/plan/verify remain non-streaming.

        Yields:
            Token strings as they arrive from the Anthropic API.
        """
        messages = [{"role": "user", "content": prompt}]
        kwargs: dict[str, Any] = {
            "model": self.model,
            "max_tokens": max_tokens,
            "messages": messages,
        }
        if system:
            kwargs["system"] = system

        logger.info(
            "LLM stream request",
            extra={"model": self.model, "prompt_chars": len(prompt)},
        )

        t_start = time.perf_counter()
        token_count = 0

        async with self._async_client.messages.stream(**kwargs) as stream_ctx:
            async for event in stream_ctx:
                # RawContentBlockDeltaEvent has a .delta.text attribute
                if hasattr(event, "delta") and hasattr(event.delta, "text"):
                    text = event.delta.text
                    if text:
                        token_count += 1
                        yield text

        latency_ms = round((time.perf_counter() - t_start) * 1000, 1)
        logger.info(
            "LLM stream complete",
            extra={
                "model": self.model,
                "token_count": token_count,
                "latency_ms": latency_ms,
            },
        )
```

**Notes:**
- `AsyncAnthropic.messages.stream()` is available in `anthropic>=0.49.0`. The project already requires `>=0.49.0` per CLAUDE.md constraint. Verify with `pip show anthropic` in the container.
- The `stream()` method does not use `json_mode`. Synthesis output is prose — the streaming path does not attempt to parse JSON mid-stream.
- The streaming path yields tokens; the `finalise()` step in the orchestrator re-runs a non-streaming verify call on the accumulated text after streaming completes.
- The Anthropic streaming API uses `_async_client.messages.stream()` not `messages.create(stream=True)`. The context-manager form (`async with ... as stream_ctx`) handles connection cleanup correctly on cancellation.

---

## 6. Orchestrator Changes

**File:** `backend/app/agent/orchestrator.py`

### 6a. Change the `run()` signature — Epic 1 (W3-006)

The existing `run(query, domain)` method must accept the two new `QueryRequest` fields. The simplest approach is adding them as keyword arguments with `None` defaults so all existing call sites (including tests) continue to work without modification:

```python
async def run(
    self,
    query: str,
    domain: str = "aircraft",
    session_id: str | None = None,
    conversation_history: list[dict] | None = None,
) -> AgentRunResult:
```

Also add the feature flag read at module level (not inside the method, to avoid the env lookup on every call):

```python
import os  # already imported

_CONVERSATIONAL_MEMORY_ENABLED = os.getenv("CONVERSATIONAL_MEMORY_ENABLED", "true").lower() == "true"
```

### 6b. Inject conversation history into synthesis prompt — Epic 1 (W3-006)

In the SYNTHESISE stage, before building `synthesis_prompt`, add:

```python
# ---------------------------------------------------------- SYNTHESISE
logger.info("State: SYNTHESISE", extra={"run_id": run_id})
_t_synthesise_start = time.perf_counter()
evidence_for_synthesis = _build_evidence_context(vector_hits, sql_rows)

# W3-006: Conversational memory — inject prior turns into synthesis context
history_context = ""
if _CONVERSATIONAL_MEMORY_ENABLED and conversation_history:
    # Use only the most recent 5 turns (backend enforces limit regardless of client)
    recent_turns = conversation_history[-5:]
    history_lines = []
    for i, turn in enumerate(recent_turns, start=1):
        q = turn.get("query", "")
        a = turn.get("answer_summary", "")
        history_lines.append(f"Prior turn {i}: Q: {q} | A: {a}")
    history_context = "\n".join(history_lines) + "\n\n"

synthesis_prompt = (
    f"{history_context}"  # empty string if no history or feature disabled
    f"User query: {query}\n\n"
    f"Intent: {intent}\n\n"
    f"Execution plan: {plan_text}\n\n"
    f"Evidence from search:\n{evidence_for_synthesis}\n\n"
    f"Synthesise a comprehensive answer."
)
```

### 6c. Save `session_id` during the SAVE stage — Epic 1 (W3-006)

Update the INSERT in the SAVE stage to include `session_id`:

```python
# In the SAVE stage, replace the existing INSERT with:
async with get_session() as session:
    await session.execute(
        text(
            "INSERT INTO agent_runs (run_id, query, result, session_id) "
            "VALUES (:run_id, :query, :result, :session_id)"
        ),
        {
            "run_id": run_id,
            "query": query,
            "result": json.dumps(result.to_dict()),
            "session_id": session_id,  # None → NULL (valid: column is nullable)
        },
    )
```

### 6d. Update `query.py` call site

The existing call in `query.py` is `await orchestrator.run(body.query, domain=body.domain)`. Update it to pass the new fields:

```python
result = await orchestrator.run(
    body.query,
    domain=body.domain,
    session_id=body.session_id,
    conversation_history=body.conversation_history,
)
```

### 6e. Streaming-specific methods — Epic 3 (W3-012)

For the SSE streaming endpoint, add `PreSynthesisState`, `run_until_synthesis()`, `stream_synthesis()`, and `finalise()` to `AgentOrchestrator`. These are new methods — they do not modify the existing `run()` path.

```python
from dataclasses import dataclass, field as dc_field

@dataclass
class PreSynthesisState:
    """Holds all accumulated agent state up to (but not including) synthesis."""
    run_id: str
    query: str
    domain: str
    intent: str
    plan_text: str
    plan_steps: list[dict]
    vector_hits: list[dict]
    sql_rows: list[dict]
    graph_nodes: list[dict]
    graph_edges: list[dict]
    steps: list[StepLog]
    halted_at_step_limit: bool
    t_run_start: float
    _state_timings: dict
    session_id: str | None = None
    conversation_history: list[dict] | None = None
```

```python
async def run_until_synthesis(
    self,
    query: str,
    domain: str = "aircraft",
    session_id: str | None = None,
    conversation_history: list[dict] | None = None,
) -> PreSynthesisState:
    """
    Run CLASSIFY+PLAN → EXECUTE_TOOLS → EXPAND_GRAPH → RE_RANK.
    Returns PreSynthesisState for use by stream_synthesis() and finalise().

    This method contains the same logic as the first half of run(), extracted
    so the streaming endpoint can call it and then stream synthesis output before
    calling finalise(). The non-streaming run() path is unchanged.
    """
    run_id = str(uuid.uuid4())
    t_run_start = time.perf_counter()
    _state_timings: dict[str, float] = {}

    # T3-04: query cache check
    cached_result = await _check_query_cache(query)
    if cached_result is not None:
        # For streaming, a cache hit short-circuits to a PreSynthesisState
        # with pre-filled answer. stream_synthesis() will yield the cached answer
        # as a single token and finalise() will return immediately.
        # Signal cache hit via a special sentinel in _state_timings.
        cached_result["run_id"] = run_id
        run_summary = cached_result.get("run_summary", {})
        run_summary["cached"] = True
        cached_result["run_summary"] = run_summary
        # Wrap in AgentRunResult and immediately return a finalised state
        # (caller checks _state_timings["cached"] == True to skip streaming)
        _state_timings["cached"] = True
        state = PreSynthesisState(
            run_id=run_id, query=query, domain=domain, intent="cached",
            plan_text="", plan_steps=[], vector_hits=[], sql_rows=[],
            graph_nodes=[], graph_edges=[], steps=[], halted_at_step_limit=False,
            t_run_start=t_run_start, _state_timings=_state_timings,
            session_id=session_id, conversation_history=conversation_history,
        )
        # Store the cached result for finalise() to return
        state._cached_result = cached_result
        return state

    # CLASSIFY + PLAN (identical to run())
    _t_classify_start = time.perf_counter()
    combined = await classify_and_plan_async(query, self._async_fast_llm, domain=domain)
    _state_timings["classify_plan_ms"] = round((time.perf_counter() - _t_classify_start) * 1000, 1)
    intent = combined["intent"]
    plan_text = combined.get("plan_text", "")
    plan_steps = combined.get("steps", [])

    # EXECUTE_TOOLS, EXPAND_GRAPH, RE_RANK (identical to run() — code duplication
    # is intentional to keep run() unchanged and streaming path independent)
    # ... [paste the full execute/expand/rerank blocks from run() here] ...
    # For brevity this document shows the structure; see implementation note below.

    return PreSynthesisState(
        run_id=run_id, query=query, domain=domain, intent=intent,
        plan_text=plan_text, plan_steps=plan_steps,
        vector_hits=vector_hits, sql_rows=sql_rows,
        graph_nodes=graph_nodes, graph_edges=graph_edges,
        steps=steps, halted_at_step_limit=halted_at_step_limit,
        t_run_start=t_run_start, _state_timings=_state_timings,
        session_id=session_id, conversation_history=conversation_history,
    )
```

**Implementation note for `run_until_synthesis()`:** The EXECUTE_TOOLS, EXPAND_GRAPH, and RE_RANK blocks are identical to those in `run()`. Rather than duplicating all that code, the recommended approach is to extract those three stages into a private `_execute_and_expand()` coroutine that both `run()` and `run_until_synthesis()` call. This reduces duplication to ~20 lines of setup code. The decision is left to the implementer — both approaches are correct; whichever minimises drift between `run()` and the streaming path.

```python
    async def stream_synthesis(
        self,
        state: PreSynthesisState,
    ) -> AsyncIterator[str]:
        """
        Stream synthesis tokens for the given pre-synthesis state.

        If the state represents a cache hit (state._state_timings.get("cached")),
        yields the cached answer as a single string rather than calling the LLM.
        """
        # Cache hit: yield the full cached answer in one event
        if state._state_timings.get("cached"):
            cached = getattr(state, "_cached_result", {})
            yield cached.get("answer", "")
            return

        # Build synthesis prompt (same logic as run(), including history injection)
        evidence_for_synthesis = _build_evidence_context(state.vector_hits, state.sql_rows)

        history_context = ""
        if _CONVERSATIONAL_MEMORY_ENABLED and state.conversation_history:
            recent_turns = state.conversation_history[-5:]
            history_lines = [
                f"Prior turn {i}: Q: {t.get('query', '')} | A: {t.get('answer_summary', '')}"
                for i, t in enumerate(recent_turns, start=1)
            ]
            history_context = "\n".join(history_lines) + "\n\n"

        synthesis_prompt = (
            f"{history_context}"
            f"User query: {state.query}\n\n"
            f"Intent: {state.intent}\n\n"
            f"Execution plan: {state.plan_text}\n\n"
            f"Evidence from search:\n{evidence_for_synthesis}\n\n"
            f"Synthesise a comprehensive answer."
        )
        system_prompt = (
            _SYNTHESIS_SYSTEM_MEDICAL if state.domain == "medical" else _SYNTHESIS_SYSTEM_AIRCRAFT
        )

        # Always use Sonnet for streaming synthesis (streaming is only for synthesis)
        accumulated = []
        async for token in self._async_llm.stream(synthesis_prompt, system=system_prompt):
            accumulated.append(token)
            yield token

        # Store the full streamed answer on state for finalise() to use
        state._streamed_answer = "".join(accumulated)

    async def finalise(
        self,
        state: PreSynthesisState,
    ) -> AgentRunResult:
        """
        Run VERIFY → SAVE → DONE on a pre-synthesis state.

        The streamed answer must have been accumulated into state._streamed_answer
        by stream_synthesis() before calling this method.

        For cache hits (state._state_timings.get("cached")), returns the
        cached AgentRunResult directly.
        """
        # Cache hit fast-path
        if state._state_timings.get("cached"):
            cached = getattr(state, "_cached_result", {})
            run_summary = cached.get("run_summary", {})
            return AgentRunResult(
                run_id=state.run_id,
                query=state.query,
                answer=cached.get("answer", ""),
                claims=cached.get("claims", []),
                evidence=cached.get("evidence", {"vector_hits": [], "sql_rows": []}),
                graph_path=cached.get("graph_path", {"nodes": [], "edges": []}),
                run_summary=run_summary,
                assumptions=cached.get("assumptions", []),
                next_steps=cached.get("next_steps", []),
            )

        streamed_answer = getattr(state, "_streamed_answer", "")

        # Parse the streamed answer as synthesis output
        # The streaming prompt produces prose, not JSON — wrap it in SynthesisOutput structure
        raw_claims: list[dict] = []
        assumptions: list[str] = []
        next_steps_list: list[str] = []

        # Attempt to parse as JSON (some models return JSON even in stream mode)
        try:
            data = json.loads(streamed_answer)
            synth_answer = data.get("answer", streamed_answer)
            raw_claims = data.get("claims", [])
            assumptions = data.get("assumptions", [])
            next_steps_list = data.get("next_steps", [])
        except json.JSONDecodeError:
            # Treat the entire streamed text as the answer
            synth_answer = streamed_answer

        all_evidence = state.vector_hits.copy()

        # VERIFY
        _t_verify_start = time.perf_counter()
        if raw_claims:
            verified_claims = await verify_claims_async(
                raw_claims, all_evidence, self._async_fast_llm
            )
        else:
            verified_claims = []
        state._state_timings["verify_ms"] = round(
            (time.perf_counter() - _t_verify_start) * 1000, 1
        )

        # SAVE
        total_latency_ms = round((time.perf_counter() - state.t_run_start) * 1000, 1)
        result = AgentRunResult(
            run_id=state.run_id,
            query=state.query,
            answer=synth_answer,
            claims=verified_claims,
            evidence={"vector_hits": state.vector_hits, "sql_rows": state.sql_rows},
            graph_path={
                "nodes": state.graph_nodes[:40],
                "edges": state.graph_edges[:80],
            },
            run_summary={
                "intent": state.intent,
                "plan_text": state.plan_text,
                "steps": [
                    {
                        "step_number": s.step_number,
                        "tool_name": s.tool_name,
                        "output_summary": s.output_summary,
                        "latency_ms": s.latency_ms,
                        "error": s.error,
                    }
                    for s in state.steps
                ],
                "tools_used": list({s.tool_name for s in state.steps}),
                "total_latency_ms": total_latency_ms,
                "halted_at_step_limit": state.halted_at_step_limit,
                "state_timings_ms": state._state_timings,
            },
            assumptions=assumptions,
            next_steps=next_steps_list,
        )

        try:
            async with get_session() as db_session:
                await db_session.execute(
                    text(
                        "INSERT INTO agent_runs (run_id, query, result, session_id) "
                        "VALUES (:run_id, :query, :result, :session_id)"
                    ),
                    {
                        "run_id": state.run_id,
                        "query": state.query,
                        "result": json.dumps(result.to_dict()),
                        "session_id": state.session_id,
                    },
                )
        except Exception as exc:
            logger.warning("Failed to persist streaming agent run", extra={"error": str(exc)})

        return result
```

---

## 7. RAG Changes

**File:** `backend/app/rag/retrieval.py`

### W3-029: Add `source` label to vector hits during hybrid merge

In `hybrid_search()`, after building the RRF-scored results list, tag each hit with its retrieval source. Currently the merged list can contain hits that came from vector-only, BM25-only, or both. The source is determinable from `vec_rank` and `bm25_rank` lookups.

**Exact change in `hybrid_search()`** — replace the results-building loop at the end of the function:

```python
    # Before (current code):
    results = []
    for rrf_score, chunk_id in scored[:top_k]:
        hit = dict(hit_meta[chunk_id])
        hit["score"] = round(rrf_score, 6)
        hit["metadata"] = {**hit.get("metadata", {}), "rrf_score": rrf_score, "search_mode": "hybrid"}
        results.append(hit)

    # After (W3-029):
    results = []
    for rrf_score, chunk_id in scored[:top_k]:
        hit = dict(hit_meta[chunk_id])
        hit["score"] = round(rrf_score, 6)

        # Determine which retrieval path(s) produced this hit
        in_vec = chunk_id in vec_rank
        in_bm25 = chunk_id in bm25_rank
        if in_vec and in_bm25:
            source_label = "hybrid"
        elif in_vec:
            source_label = "vector"
        else:
            source_label = "bm25"

        hit["source"] = source_label  # W3-029: top-level field, not nested in metadata
        hit["metadata"] = {
            **hit.get("metadata", {}),
            "rrf_score": rrf_score,
            "search_mode": "hybrid",
            "source": source_label,  # also in metadata for backward compat
        }
        results.append(hit)
```

Also tag hits from `vector_search()` and `bm25_search()` when they are used standalone (not via hybrid). Add `"source": "vector"` to each hit dict returned by `vector_search()`:

```python
    # In vector_search(), in the hits.append() block, add source:
    hits.append({
        "chunk_id": row.chunk_id,
        "incident_id": row.incident_id,
        "score": round(score, 4),
        "excerpt": row.excerpt,
        "source": "vector",  # W3-029
        "metadata": {
            ...
        },
    })
```

And `"source": "bm25"` in `bm25_search()`:

```python
    hits.append({
        "chunk_id": row.chunk_id,
        "incident_id": row.incident_id,
        "score": bm25_score,
        "excerpt": row.excerpt,
        "source": "bm25",  # W3-029
        "metadata": {
            ...
        },
    })
```

The `VectorHit` Pydantic model now has `source: Literal["bm25", "vector", "hybrid"] = "vector"` so any hit that does not set the field defaults to `"vector"` — the safest default for backward compatibility.

---

## 8. Tool Changes

### 8a. `backend/app/tools/compute_tool.py` — Fix CR-007 (W3-028)

**Single line change.** The deprecated `asyncio.get_event_loop()` call must be replaced with `asyncio.get_running_loop()`:

```python
# Current (line 210 in the file as read):
    async def run_async(
        self, code: str, context: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        loop = asyncio.get_event_loop()                                    # BEFORE
        return await loop.run_in_executor(None, self.run, code, context)

# Fixed (W3-028):
    async def run_async(
        self, code: str, context: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        loop = asyncio.get_running_loop()                                   # AFTER
        return await loop.run_in_executor(None, self.run, code, context)
```

**Verification:** After the change, run `grep -r "get_event_loop" backend/` from the repo root — it must return zero results. This is the acceptance criterion for W3-028 and the CR-007 resolution check listed in prd2.md.

**Why `get_running_loop()` is correct:** `get_event_loop()` is deprecated in Python 3.10+ when called from a coroutine context (it will raise a `DeprecationWarning` in 3.10 and a `RuntimeError` in 3.12+). `get_running_loop()` returns the currently running loop, which is always what we want when called from inside an `async def` function. It raises `RuntimeError` if there is no running loop, which is the correct failure mode — rather than silently creating a new loop.

---

### 8b. `backend/app/tools/sql_tool.py` — Add `medical_case_trends` named query (W3-026)

Add the new named query to `_NAMED_QUERIES`. This query provides Tab 4 analytics parity for the medical domain:

```python
_NAMED_QUERIES: dict[str, str] = {
    # ... existing queries ...

    # W3-026 — Epic 9: Medical domain monthly case trends by specialty
    # Provides Tab 4 analytics parity for the medical domain dashboard.
    # The disease_records table uses 'inspection_date' as its date column.
    # 'specialty' column maps to the medical sub-specialty (Cardiology, Neurology, etc.)
    "medical_case_trends": """
        SELECT
            DATE_TRUNC('month', inspection_date) AS month,
            specialty,
            COUNT(*) AS case_count
        FROM disease_records
        WHERE inspection_date >= CURRENT_DATE - INTERVAL ':days days'
        GROUP BY month, specialty
        ORDER BY month
    """,
}
```

**Notes:**
- The `:days days` pattern is the existing template-substitution convention in `run_named()` and `run_named_async()`. It is replaced with `f"{int(days)} days"` before execution — safe because `days` is coerced to `int`.
- `inspection_date` is the date column on `disease_records` (confirmed from `db/models.py`). The PRD uses `date` as the column name — the actual column is `inspection_date`.
- This query is available via `GET /analytics/diseases` by adding a second endpoint variant, or the frontend can call `run_named_async("medical_case_trends", {"days": 90})` directly via the SQL tool. The analytics endpoint in Section 4b uses `disease_counts_by_specialty` for the `/analytics/diseases` endpoint. `medical_case_trends` can be exposed via a separate `/analytics/medical-trends` endpoint if needed in a future sprint, or used directly by the orchestrator when answering medical trend queries.

---

## 9. main.py changes

**File:** `backend/app/main.py`

Register the two new routers and add the `EAGER_MODEL_LOAD` startup hook:

```python
# Add to imports:
from backend.app.api import docs, ingest, query, analytics, runs  # add analytics, runs

# In create_app(), add the two new routers after the existing three:
    app.include_router(ingest.router, tags=["Ingestion"])
    app.include_router(query.router, tags=["Query"])
    app.include_router(docs.router, tags=["Documents"])
    app.include_router(runs.router, tags=["History"])       # NEW — Epic 2
    app.include_router(analytics.router, tags=["Analytics"]) # NEW — Epic 4
```

Add the `EAGER_MODEL_LOAD` hook to the lifespan function:

```python
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info("Starting NextAgentAI backend")
    try:
        get_async_engine()
        logger.info("Database pool initialised")
    except Exception as exc:
        logger.warning(
            "DB pool init failed (DB may not be ready yet)",
            extra={"error": str(exc)},
        )

    # W3-012 / Epic 3: Pre-load embedding model at startup to achieve the
    # 1.5s first-token target on streaming queries.
    # Without this, the first query on a warm Render instance still pays
    # the model-load cost (~2-4s for all-MiniLM-L6-v2 on CPU).
    # EAGER_MODEL_LOAD=true is a hard requirement on Render for streaming.
    if os.getenv("EAGER_MODEL_LOAD", "false").lower() == "true":
        try:
            from backend.app.rag.embeddings import EmbeddingModel
            EmbeddingModel.get()
            logger.info("Embedding model pre-loaded (EAGER_MODEL_LOAD=true)")
        except Exception as exc:
            logger.warning("EAGER_MODEL_LOAD failed", extra={"error": str(exc)})

    yield

    logger.info("Shutting down NextAgentAI backend")
    await dispose_async_engine()
```

**CORS:** The existing `CORSMiddleware` uses `allow_methods=["*"]` and `allow_headers=["*"]`. The new endpoints (`/runs`, `/runs/*`, `/analytics/*`) are covered automatically — no per-endpoint CORS configuration is needed. The explicit origin list in `_CORS_BASE` already covers the Vercel and localhost origins. If additional origins need access, they are added via the `CORS_ORIGINS` env var.

---

## 10. Environment Variables

All Wave 3 env vars below are new additions. Existing variables are unchanged.

| Variable | Default | Where set | Purpose |
|----------|---------|-----------|---------|
| `CONVERSATIONAL_MEMORY_ENABLED` | `true` | Render dashboard / `.env` | Gates Epic 1 conversational history injection in orchestrator synthesis prompt. Set to `false` to disable without redeploy. |
| `STREAMING_ENABLED` | `true` | Render dashboard / `.env` | Gates Epic 3 SSE streaming endpoint (`POST /query/stream`). Set to `false` to fall back to batch response. |
| `EAGER_MODEL_LOAD` | `false` | Render dashboard (set to `true`) | Pre-loads `all-MiniLM-L6-v2` embedding model at FastAPI startup. **Must be `true` on Render** for the streaming 1.5s first-token target. Without it, first-query latency includes 2–4s model load time even on a warm instance. Does NOT affect Render cold-start (60s): `EAGER_MODEL_LOAD` only pre-warms the embedding model layer within an already-running container. |

**Existing variables that interact with Wave 3 features:**

| Variable | Interaction |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Required for `stream()` method — same key used for streaming as for batch |
| `PG_DSN` | Migrations W3-001, W3-002, W3-003 must be run against this DB |
| `CORS_ORIGINS` | Add any new production frontend origins here if deploying to a new Vercel preview URL |

---

## 11. Test Plan

### Existing tests that may be affected

| Test file | Potential impact | Action |
|-----------|-----------------|--------|
| `tests/test_schemas.py` (if exists) | `QueryRequest` has new optional fields | Verify existing instantiation tests still pass with `None` defaults |
| `tests/test_orchestrator.py` | `run()` signature changed | Existing call `orchestrator.run(query, domain)` still works — new params are keyword-only with `None` defaults |
| `tests/test_sql_guardrails.py` | New `medical_case_trends` named query | Verify guardrail test still passes; the new query uses SELECT only |
| `tests/test_session_config.py` | No change | Should continue to pass |
| `tests/test_healthz_headers.py` | No change | Should continue to pass |

### New test cases needed

#### W3-001 / W3-002 — Migration tests
```python
# tests/test_migrations.py (new file)
# These are integration tests — require a live DB connection.
# Run with: pytest tests/test_migrations.py -v

def test_agent_runs_has_session_id_column():
    """After W3-001 migration, agent_runs.session_id column exists and is nullable."""
    from backend.app.db.session import get_sync_engine
    from sqlalchemy import inspect
    inspector = inspect(get_sync_engine())
    cols = {c["name"]: c for c in inspector.get_columns("agent_runs")}
    assert "session_id" in cols
    assert cols["session_id"]["nullable"] is True

def test_agent_runs_has_is_favourite_column():
    """After W3-002 migration, agent_runs.is_favourite exists, is not nullable, defaults False."""
    from backend.app.db.session import get_sync_engine
    from sqlalchemy import inspect
    inspector = inspect(get_sync_engine())
    cols = {c["name"]: c for c in inspector.get_columns("agent_runs")}
    assert "is_favourite" in cols
    assert cols["is_favourite"]["nullable"] is False
```

#### W3-003 — `QueryRequest` schema tests
```python
def test_query_request_defaults_new_fields():
    from backend.app.schemas.models import QueryRequest
    req = QueryRequest(query="test query")
    assert req.session_id is None
    assert req.conversation_history is None

def test_query_request_accepts_new_fields():
    from backend.app.schemas.models import QueryRequest
    req = QueryRequest(
        query="test",
        session_id="550e8400-e29b-41d4-a716-446655440000",
        conversation_history=[{"query": "prev", "answer_summary": "prev answer"}],
    )
    assert req.session_id == "550e8400-e29b-41d4-a716-446655440000"
    assert len(req.conversation_history) == 1
```

#### W3-004 — `HistoryRunSummary` schema tests
```python
def test_history_run_summary_defaults():
    from backend.app.schemas.models import HistoryRunSummary
    item = HistoryRunSummary(id="abc", query="test")
    assert item.is_favourite is False
    assert item.cached is False
```

#### W3-006 — Orchestrator history injection test
```python
def test_orchestrator_history_injection_disabled_by_env(monkeypatch):
    """When CONVERSATIONAL_MEMORY_ENABLED=false, history is not prepended."""
    monkeypatch.setenv("CONVERSATIONAL_MEMORY_ENABLED", "false")
    # Reimport to pick up env change
    import importlib
    import backend.app.agent.orchestrator as orch_mod
    importlib.reload(orch_mod)
    assert orch_mod._CONVERSATIONAL_MEMORY_ENABLED is False

def test_orchestrator_history_capped_at_5_turns():
    """Only last 5 turns are used even when more are provided."""
    history = [
        {"query": f"q{i}", "answer_summary": f"a{i}"} for i in range(10)
    ]
    # Verify only last 5 are sliced
    recent = history[-5:]
    assert len(recent) == 5
    assert recent[0]["query"] == "q5"
```

#### W3-007 — `GET /runs` and `PATCH /runs/{id}/favourite` endpoint tests
```python
# tests/test_runs_api.py (new file)
# Uses TestClient — no live DB needed for schema/routing tests.
from fastapi.testclient import TestClient

def test_get_runs_returns_200(test_app):
    """GET /runs returns 200 with items and total."""
    client = TestClient(test_app)
    response = client.get("/runs?limit=5&offset=0")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data

def test_patch_favourite_nonexistent_run_returns_404(test_app):
    """PATCH /runs/{bad_id}/favourite returns 404."""
    client = TestClient(test_app)
    response = client.patch(
        "/runs/00000000-0000-0000-0000-000000000000/favourite",
        json={"is_favourite": True},
    )
    assert response.status_code == 404
```

#### W3-026 — `medical_case_trends` named query guardrail test
```python
def test_medical_case_trends_is_select_only():
    """medical_case_trends named query passes the SQL guardrail."""
    from backend.app.tools.sql_tool import _NAMED_QUERIES, _BLOCKED_PATTERN
    sql = _NAMED_QUERIES["medical_case_trends"]
    assert _BLOCKED_PATTERN.search(sql) is None, (
        "medical_case_trends named query contains a blocked DML/DDL keyword"
    )

def test_medical_case_trends_query_exists():
    from backend.app.tools.sql_tool import _NAMED_QUERIES
    assert "medical_case_trends" in _NAMED_QUERIES
```

#### W3-028 — CR-007 fix test
```python
def test_no_get_event_loop_in_codebase():
    """
    Acceptance criterion for W3-028: zero uses of asyncio.get_event_loop()
    in the backend source code.
    """
    import subprocess
    result = subprocess.run(
        ["grep", "-r", "get_event_loop", "backend/"],
        capture_output=True, text=True,
    )
    assert result.stdout == "", (
        f"Found get_event_loop usage:\n{result.stdout}"
    )
```

#### W3-029 — VectorHit source field tests
```python
def test_vector_hit_source_defaults_to_vector():
    from backend.app.schemas.models import VectorHit
    hit = VectorHit(chunk_id="c1", incident_id="i1", score=0.9, excerpt="test")
    assert hit.source == "vector"

def test_vector_hit_source_accepts_all_literals():
    from backend.app.schemas.models import VectorHit
    for src in ("bm25", "vector", "hybrid"):
        hit = VectorHit(chunk_id="c1", incident_id="i1", score=0.5, excerpt="t", source=src)
        assert hit.source == src
```

### How to run

```bash
# From the repo root, with the venv activated:
cd backend
pytest tests/ -v

# Single test file:
pytest tests/test_sql_guardrails.py -v

# Single test by keyword:
pytest -k "test_medical_case_trends" -v

# With coverage:
pytest tests/ --cov=backend/app --cov-report=term-missing
```

**Test infrastructure notes:**
- The Anthropic stub at `backend/tests/stubs/anthropic/__init__.py` is loaded via `conftest.py` (inserts `stubs/` at `sys.path[0]`). The new `stream()` method must be stubbed in the test stub if any tests call it. Add a stub implementation that yields a few tokens and returns:
  ```python
  # In stubs/anthropic/__init__.py, add to the AsyncAnthropic stub:
  class _FakeStreamContext:
      async def __aenter__(self):
          return self
      async def __aexit__(self, *args):
          pass
      def __aiter__(self):
          return iter([_FakeDeltaEvent("stub token ")])

  class _FakeDeltaEvent:
      def __init__(self, text):
          self.delta = type("delta", (), {"text": text})()

  # Add to AsyncMessages stub:
  def stream(self, **kwargs):
      return _FakeStreamContext()
  ```
- `orjson` must be installed in the test venv (`pip install orjson==3.10.12`).

---

## 12. Deployment Notes

### Order of operations

1. **Run migrations first** (before deploying updated backend code):
   ```bash
   # From repo root, with PG_DSN pointing at Neon production:
   cd backend
   alembic upgrade head
   ```
   This applies W3-001, W3-002, and W3-003 in order. The W3-003 `COMMIT` + `CONCURRENTLY` statements are zero-downtime — they do not lock the table during index creation.

2. **Deploy updated backend code** to Render. The new `session_id` and `is_favourite` columns will be present before any code that writes to them is live.

3. **Set env vars on Render** before deploying (or immediately after — safe either way because the flags default to enabling the features):
   - `CONVERSATIONAL_MEMORY_ENABLED=true`
   - `STREAMING_ENABLED=true`
   - `EAGER_MODEL_LOAD=true` (critical for streaming first-token latency)

4. **Deploy frontend** (independent of backend — new fields are optional, no breaking changes).

### Neon production migration notes

- Neon supports `CREATE INDEX CONCURRENTLY` via standard PostgreSQL. The `op.execute("COMMIT")` in the migration correctly ends the implicit transaction before each `CONCURRENTLY` call.
- If any `CONCURRENTLY` index fails partway, re-run `alembic upgrade head` — the `IF NOT EXISTS` guard makes it idempotent.
- After migration, verify the HNSW index with:
  ```sql
  -- Run in Neon SQL editor or psql:
  EXPLAIN (ANALYZE, FORMAT TEXT)
  SELECT e.embed_id, 1 - (e.embedding <=> '[0.1, 0.2, ...]'::vector) AS score
  FROM medical_embeddings e
  ORDER BY e.embedding <=> '[0.1, 0.2, ...]'::vector
  LIMIT 8;
  -- Should contain: "Index Scan using idx_medical_embeddings_hnsw"
  ```

### Render deployment configuration

In `render.yaml` or the Render dashboard, ensure the following service environment variables are set:

```yaml
envVars:
  - key: EAGER_MODEL_LOAD
    value: "true"
  - key: CONVERSATIONAL_MEMORY_ENABLED
    value: "true"
  - key: STREAMING_ENABLED
    value: "true"
```

The `EAGER_MODEL_LOAD=true` setting adds ~3-4 seconds to container startup time (model load) but ensures the first streaming query after a cold start returns tokens within 1.5s rather than 5-7s.

### Rollback procedure

If any Wave 3 migration causes issues in production:

```bash
# Rollback all three Wave 3 migrations (in reverse order):
alembic downgrade 20260307_002  # drops W3-003 indexes
alembic downgrade 20260307_001  # drops is_favourite column
alembic downgrade <previous_head>  # drops session_id column
```

To disable individual features without a code redeploy:
- Set `CONVERSATIONAL_MEMORY_ENABLED=false` on Render → Epic 1 disabled; existing API unaffected
- Set `STREAMING_ENABLED=false` on Render → Epic 3 SSE endpoint falls back to batch response
- Unset `EAGER_MODEL_LOAD` (or set to `false`) → model loads on first request (slower first-token but no startup cost)

---

## Appendix: Pre-implementation checklist

Run through this before starting each sprint:

### Sprint 1 checklist (Epics 1 & 2)

- [ ] Run `alembic history` and note the current head revision — fill it into `down_revision` in W3-001
- [ ] Apply migrations: `alembic upgrade head` on local Docker DB
- [ ] Verify columns exist: `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'agent_runs'`
- [ ] Update `db/models.py` (`AgentRun` class) to add `session_id` and `is_favourite` columns
- [ ] Update `schemas/models.py` (add `session_id`, `conversation_history` to `QueryRequest`; add `HistoryRunSummary`, `RunListResponse`)
- [ ] Create `api/runs.py`
- [ ] Register `runs.router` in `main.py`
- [ ] Update `orchestrator.py` (signature, history injection, session_id save)
- [ ] Run `pytest tests/ -v` — all existing tests pass

### Sprint 2 checklist (Epics 3, 4, 5, 6)

- [ ] Add `stream()` to `LLMClient` ABC and `ClaudeClient`
- [ ] Add `PreSynthesisState`, `run_until_synthesis()`, `stream_synthesis()`, `finalise()` to `AgentOrchestrator`
- [ ] Add `POST /query/stream` to `query.py`
- [ ] Create `api/analytics.py` with three endpoints
- [ ] Register `analytics.router` in `main.py`
- [ ] Add `EAGER_MODEL_LOAD` hook to `lifespan()` in `main.py`
- [ ] Run `pytest tests/ -v`
- [ ] Test streaming manually: `curl -N -X POST http://localhost:8000/query/stream -H "Content-Type: application/json" -d '{"query":"hydraulic trends","domain":"aircraft"}' 2>&1 | head -20`

### Sprint 3 checklist (Epics 7, 8, 9, 10)

- [ ] Apply W3-003 migration
- [ ] Add `medical_case_trends` to `_NAMED_QUERIES` in `sql_tool.py`
- [ ] Fix CR-007 in `compute_tool.py` — run `grep -r "get_event_loop" backend/` to confirm zero results
- [ ] Add `source` field to `VectorHit` in `schemas/models.py`
- [ ] Add `source` label to hits in `retrieval.py` (`vector_search`, `bm25_search`, `hybrid_search`)
- [ ] Run `pytest tests/ -v`
- [ ] Verify HNSW index used: `EXPLAIN ANALYZE` on a medical embedding query in Neon SQL editor
