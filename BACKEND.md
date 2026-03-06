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
- Production: `https://nextai-backend.onrender.com`
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
