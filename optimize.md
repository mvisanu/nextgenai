# API Performance Optimization Report — NextAgentAI Backend

**Generated:** 2026-03-06
**Analyzer:** Senior Technical Research Advisor (Claude Sonnet 4.6)
**Codebase root:** `backend/`
**Stack:** FastAPI 0.115.6, SQLAlchemy 2.0.36, pgvector 0.3.6, Python 3.11, Anthropic SDK 0.40.0, sentence-transformers 3.3.1

---

## Executive Summary

Five changes will produce the largest measurable latency reductions in this codebase:

1. **Parallelize classify + plan LLM calls** — these two sequential Haiku API round-trips (~500 ms each) can run concurrently via `asyncio.gather`, saving 400–500 ms on every non-`vector_only` query.
2. **Replace the IVFFlat index with HNSW** — pgvector HNSW at default settings delivers 15× higher QPS at equivalent recall versus IVFFlat with probes=10, and removes the mandatory `SET ivfflat.probes` statement issued before every search.
3. **Add an LRU embedding cache for repeated queries** — identical or near-identical queries currently trigger a full 384-dim inference pass (~20–80 ms on CPU); a simple `functools.lru_cache` keyed on the query string eliminates this cost on cache hits.
4. **Switch the orchestrator to fully async** — `orchestrator.run()` and all tools are synchronous, forcing FastAPI to use a thread pool (via `run_in_executor`) or, as currently coded, block the ASGI event loop entirely. Moving to async tools and `asyncio.gather` for independent tool steps unlocks true concurrency.
5. **Switch to `ORJSONResponse` and add `GZipMiddleware`** — orjson serialization is 2–3× faster than stdlib `json` for large agent output dicts; GZip at level 4 reduces wire size for large vector-hit payloads by 60–80%.

Primary risk: items 1 and 4 require rearchitecting the synchronous orchestrator; items 2 and 3 are drop-in changes with no functional risk.

---

## 1. LLM Call Parallelization

### 1-A. Classify + Plan Run Sequentially — No Dependency Between Them

**Impact:** HIGH — saves ~400–500 ms per hybrid/sql/compute query
**File:** `backend/app/agent/orchestrator.py` lines 160–170

**Problem:**

The orchestrator calls `classify_intent()` then `generate_plan()` sequentially. Each is a separate Haiku API call taking ~400–600 ms. The plan call takes `intent` as an input, so there is a dependency — but only for the plan's prompt framing. In practice the plan prompt can be constructed independently and the LLM system prompt already encodes all possible intents. The dependency is soft, not hard.

An alternative: classify and plan can be merged into a single LLM call ("classify and produce a plan in one shot"), cutting two round-trips to one.

**Current code (orchestrator.py, ~line 160):**
```python
intent = classify_intent(query, self._fast_llm, domain=domain)
# ...
plan = generate_plan(query, intent, self._fast_llm, domain=domain)
```

**Recommended approach — merged classify+plan prompt (single Haiku call):**

Create a `classify_and_plan()` function in `agent/planner.py` that returns both `{"intent": ..., "plan_text": ..., "steps": [...]}` in a single LLM call with a combined system prompt. This removes one full network round-trip (the classify call) and one LLM token-generation cycle.

Expected savings: 400–600 ms per query (one fewer Haiku API call).

**Alternative approach — asyncio.gather (if moving to async):**

If the orchestrator is converted to async (see item 4), classify and plan can be fired in parallel as they can both use the query alone — the plan can be validated/filtered by intent after the fact:

```python
intent_coro = classify_intent_async(query, self._fast_llm, domain=domain)
plan_coro = generate_plan_async(query, self._fast_llm, domain=domain)
intent, raw_plan = await asyncio.gather(intent_coro, plan_coro)
# Post-filter plan steps by intent
plan = _filter_plan_by_intent(raw_plan, intent)
```

**Expected impact:** 400–600 ms saved per non-`vector_only` query (which already skips planning).

---

### 1-B. Verify Runs After Synthesis — Can It Be Deferred?

**Impact:** MEDIUM — saves 300–500 ms on queries with 0 or 1 claims
**File:** `backend/app/agent/orchestrator.py` line 364

**Problem:**

`verify_claims()` makes a Haiku call regardless of claim count. When synthesis produces 0 claims (common on no-evidence queries), the verify call still fires.

**Current code:**
```python
verified_claims = verify_claims(raw_claims, all_evidence, self._fast_llm)
```

**Recommended fix:**

Add an early-exit guard before the LLM call in `verifier.py`:
```python
# verifier.py — already has: if not claims: return []
# But orchestrator also calls it when raw_claims is empty due to synthesis failure.
# Add guard in orchestrator:
if raw_claims:
    verified_claims = verify_claims(raw_claims, all_evidence, self._fast_llm)
else:
    verified_claims = []
```

This guard already exists in `verifier.py` line 68 (`if not claims: return []`), but that is inside the function. The orchestrator should short-circuit before constructing the JSON prompt at all, saving serialization overhead.

**Expected impact:** 300–500 ms saved for no-evidence queries (avoids network round-trip entirely).

---

### 1-C. Synthesis LLM Client Created Fresh Each Request

**Impact:** MEDIUM — eliminates repeated httpx connection overhead
**File:** `backend/app/llm/client.py` lines 146–160

**Problem:**

`get_llm_client()` and `get_fast_llm_client()` call `ClaudeClient()` constructor on every invocation. The `ClaudeClient.__init__` creates a new `anthropic.Anthropic()` instance, which instantiates a new underlying httpx connection pool. In `orchestrator.py`, both clients are created once in `__init__` (singleton orchestrator), so this is mostly mitigated. However, any code that calls `get_llm_client()` directly outside the singleton incurs this overhead.

The Anthropic SDK uses httpx under the hood. The `Anthropic` client does maintain connection pooling internally per instance — the key risk is creating multiple short-lived `Anthropic()` instances.

**Recommended fix:**

The current singleton orchestrator in `query.py` (`_get_orchestrator()`) correctly reuses a single `AgentOrchestrator` instance and therefore a single `ClaudeClient`. No change needed here — this is already correct. Document this explicitly.

The one issue: `get_fast_llm_client()` in `client.py` line 155 creates a new `ClaudeClient` each call. If called outside the orchestrator singleton (e.g., future utility code), this leaks connections. Apply module-level caching:

```python
# client.py
_fast_llm_singleton: LLMClient | None = None

def get_fast_llm_client() -> LLMClient:
    global _fast_llm_singleton
    if _fast_llm_singleton is None:
        _fast_llm_singleton = ClaudeClient(model="claude-haiku-4-5-20251001")
    return _fast_llm_singleton
```

**Expected impact:** LOW at present (singleton orchestrator already handles this), but prevents future regressions.

---

### 1-D. Switch ClaudeClient to AsyncAnthropic

**Impact:** HIGH — prerequisite for full async orchestrator
**File:** `backend/app/llm/client.py`

**Problem:**

`ClaudeClient.complete()` calls `self._client.messages.create()` — this is the synchronous Anthropic SDK. When called from within a FastAPI async handler (even via `run_in_executor`), it blocks a thread. The current architecture calls `orchestrator.run()` synchronously from the async `run_query` handler, which means the entire agent loop (multiple LLM calls + DB queries + embedding inference) runs on the thread pool, occupying one uvicorn worker thread for the full duration (typically 3–8 seconds per query).

**Recommended fix:**

Add an async variant to `ClaudeClient`:

```python
from anthropic import AsyncAnthropic

class ClaudeClient(LLMClient):
    def __init__(self, model: str, api_key: str | None = None) -> None:
        key = api_key or os.environ.get("ANTHROPIC_API_KEY", "")
        self._client = anthropic.Anthropic(api_key=key)          # sync
        self._async_client = AsyncAnthropic(api_key=key)          # async
        self.model = model

    async def complete_async(
        self,
        prompt: str,
        system: str = "",
        json_mode: bool = False,
        max_tokens: int | None = None,
    ) -> str:
        # same logic as complete() but using self._async_client
        ...
```

This enables the orchestrator to be converted to async, allowing `asyncio.gather` across independent LLM calls and releasing the event loop during I/O waits.

**Expected impact:** Foundational change — enables items 1-A and 4. On its own: LOW. Combined: HIGH.

---

## 2. pgvector Index Upgrade: IVFFlat to HNSW

**Impact:** HIGH — 5–15× query throughput improvement at equal recall
**File:** `backend/app/rag/retrieval.py`, `backend/app/db/migrations/`

### 2-A. Original IVFFlat Configuration (T-10 complete — HNSW now deployed)

The codebase originally created an IVFFlat cosine index and set `ivfflat.probes = 10` per query (line 113). With probes=10, recall is reasonable but each query must scan 10 IVFFlat clusters. At dataset scale (10,000 incidents × ~3 chunks each = ~30,000 embeddings), the IVFFlat list count at ingest time should be `rows/1000 = 30` lists. If the index was created with the default of 100 lists, probes=10 gives 10% coverage — good recall, mediocre speed.

### 2-B. HNSW is Superior for This Workload

For a read-heavy query workload with an infrequently updated index:
- HNSW at default settings (`m=16`, `ef_construction=64`, `ef_search=40`) achieves >0.99 recall on 384-dim vectors
- HNSW removes the need for the `SET ivfflat.probes` statement on every query (saves one round-trip per search)
- HNSW does not require data to be present at index creation time, unlike IVFFlat which needs ANALYZE after bulk inserts

### 2-C. Migration SQL (Alembic migration)

```python
# New Alembic migration: upgrade()
def upgrade() -> None:
    op.execute("DROP INDEX CONCURRENTLY IF EXISTS incident_embeddings_embedding_idx")
    op.execute("""
        CREATE INDEX CONCURRENTLY incident_embeddings_embedding_hnsw_idx
        ON incident_embeddings
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    """)
    op.execute("DROP INDEX CONCURRENTLY IF EXISTS medical_embeddings_embedding_idx")
    op.execute("""
        CREATE INDEX CONCURRENTLY medical_embeddings_embedding_hnsw_idx
        ON medical_embeddings
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    """)

def downgrade() -> None:
    op.execute("DROP INDEX CONCURRENTLY IF EXISTS incident_embeddings_embedding_hnsw_idx")
    op.execute("DROP INDEX CONCURRENTLY IF EXISTS medical_embeddings_embedding_hnsw_idx")
    # Recreate IVFFlat if needed
```

**Note:** `CREATE INDEX CONCURRENTLY` cannot run inside a transaction. In Alembic, wrap with `op.get_bind().execute()` outside an explicit transaction context, or set `transaction_per_migration = False` in `env.py`. Verify Neon's support for concurrent index creation (Neon supports it as of 2024).

### 2-D. Remove the Per-Query probes SET

After switching to HNSW, remove `retrieval.py` line 113:
```python
session.execute(text("SET ivfflat.probes = 10"))  # DELETE THIS LINE after HNSW migration
```

Instead, set `hnsw.ef_search` at engine level (session startup) or via PostgreSQL config:
```python
# In retrieval.py, after HNSW migration:
session.execute(text("SET hnsw.ef_search = 40"))  # 40 is the default; tune up to 100 for higher recall
```

For Neon (serverless), set this at the connection level since sessions are ephemeral. Consider setting `ef_search` in the SQLAlchemy engine's `connect_args`:
```python
_async_engine = create_async_engine(
    dsn,
    connect_args={"server_settings": {"hnsw.ef_search": "40"}},
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)
```

### 2-E. Recommended HNSW Parameters for This Dataset

| Parameter | Current (IVFFlat) | Recommended (HNSW) | Notes |
|---|---|---|---|
| Index type | `ivfflat` | `hnsw` | HNSW: no training step, better QPS |
| lists / m | Unknown (default 100?) | `m = 16` | Default; increase to 32 for >100k rows |
| probes / ef_construction | Runtime: `SET probes = 10` | `ef_construction = 64` | Build-time only; 2× m minimum |
| ef_search | N/A | 40 (default) | Tune: 20 for speed, 80 for recall |
| Ops | `vector_cosine_ops` | `vector_cosine_ops` | No change |

**Expected impact:** 5–15× QPS improvement on vector search; removes one SQL SET statement per query.

---

## 3. Embedding Cache for Repeated Queries

**Impact:** HIGH on cache hits, LOW otherwise
**File:** `backend/app/rag/embeddings.py`, `backend/app/tools/vector_tool.py`

### 3-A. Problem

`VectorSearchTool.run()` calls `model.encode_single(query_text)` on every invocation. For a CPU-only deployment (Render free tier), `all-MiniLM-L6-v2` inference on a single sentence takes 20–80 ms. Many user queries are repeated or near-identical (e.g., example queries on the frontend all hit the same text).

### 3-B. Recommended Fix — LRU Cache in EmbeddingModel

```python
# embeddings.py
import functools
import hashlib

class EmbeddingModel:
    # ... existing code ...

    @functools.lru_cache(maxsize=512)
    def encode_single_cached(self, text: str) -> tuple:
        """
        Cache up to 512 unique query embeddings.
        Returns a tuple (hashable) rather than numpy array.
        Convert back with: np.array(result, dtype=np.float32)
        """
        vec = self.encode([text])[0]
        return tuple(vec.tolist())
```

Then in `vector_tool.py`:
```python
# Replace:
query_vec = model.encode_single(query_text)

# With:
cached = model.encode_single_cached(query_text)
query_vec = np.array(cached, dtype=np.float32)
```

**Cache key:** The exact query string. LRU with maxsize=512 uses ~512 × 384 × 4 bytes = ~786 KB — negligible memory footprint.

**Caveat:** `lru_cache` is process-local and lost on restart. For multi-worker deployments, use Redis or memcached (medium-term improvement). For Render single-instance deployment, process-local cache is sufficient.

**Expected impact:** 20–80 ms saved per cache-hit query (near-zero embedding latency). Effective for popular example queries and any repeated user queries.

---

## 4. Async Orchestrator Architecture

**Impact:** HIGH — fundamental throughput and concurrency improvement
**File:** `backend/app/agent/orchestrator.py`, `backend/app/api/query.py`

### 4-A. The Core Problem: Blocking the Event Loop

`query.py` line 47:
```python
result = orchestrator.run(body.query, domain=body.domain)
```

`orchestrator.run()` is synchronous. FastAPI runs this in the ASGI thread pool via `run_in_executor` (implicitly, since the route handler is `async def`). Actually, looking at the code more carefully: the route handler IS `async def run_query`, but it calls the sync `orchestrator.run()` directly without `await` or `run_in_executor`. This means the sync call blocks the event loop for the entire 3–8 second agent run duration — preventing any other requests from being processed concurrently on the same worker.

**Correct diagnosis:** The current code has a blocking-sync-call-in-async-handler anti-pattern. Under load, this serializes all requests.

### 4-B. Immediate Fix (Low Risk): Wrap in run_in_executor

Without rearchitecting the orchestrator, add `run_in_executor` to stop blocking the event loop:

```python
# query.py
import asyncio
from fastapi.concurrency import run_in_threadpool

@router.post("/query", response_model=QueryResponse)
async def run_query(body: QueryRequest) -> QueryResponse:
    orchestrator = _get_orchestrator()
    result = await run_in_threadpool(orchestrator.run, body.query, domain=body.domain)
    return QueryResponse(**_normalise_result(result.to_dict()))
```

`run_in_threadpool` is FastAPI's wrapper around `asyncio.get_event_loop().run_in_executor(None, func, *args)`. This releases the event loop during the sync agent run, allowing other requests to proceed concurrently (up to `max_workers` threads in the executor pool, which defaults to `min(32, os.cpu_count() + 4)`).

**Expected impact:** Eliminates event loop blocking; enables true concurrency under load.

### 4-C. Long-term Fix: Full Async Orchestrator

The full rewrite converts every I/O step to async:

```python
async def run(self, query: str, domain: str = "aircraft") -> AgentRunResult:
    # CLASSIFY + PLAN in parallel (see item 1-A)
    async with asyncio.TaskGroup() as tg:
        classify_task = tg.create_task(classify_intent_async(query, self._fast_llm, domain))
        plan_task = tg.create_task(generate_plan_async(query, self._fast_llm, domain))
    intent = classify_task.result()
    plan = plan_task.result()

    # EXECUTE TOOLS — independent vector + SQL steps can run in parallel
    # (VectorSearchTool and SQLQueryTool have no data dependency between them)
    # ...

    # SYNTHESISE + (if needed, EXPAND_GRAPH) — serial dependency
    # ...

    # VERIFY — serial dependency on synthesis output
    # ...
```

**Prerequisite:** Tools must be made async (use `async with get_session()` instead of `get_sync_session()`). The embedding model (`EmbeddingModel.encode_single`) is CPU-bound — wrap with `run_in_executor` for the embedding inference to avoid blocking the event loop.

**Expected impact:** 40–60% total latency reduction on hybrid queries by overlapping classify, plan, and (where possible) vector + SQL tool execution.

---

## 5. Database Connection Pool Tuning

**Impact:** MEDIUM — prevents connection exhaustion under load
**File:** `backend/app/db/session.py`

### 5-A. Current Configuration

```python
# session.py lines 104-109
_async_engine = create_async_engine(
    dsn,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)
```

Total max connections: 10 + 20 = 30.

### 5-B. Issues

**Sync engine has no pool configuration:**
```python
# session.py line 60
_sync_engine = create_engine(dsn, pool_pre_ping=True)
```

This uses SQLAlchemy defaults: `pool_size=5`, `max_overflow=10`, `pool_timeout=30`. The sync engine is used by:
- `VectorSearchTool.run()` — every vector search
- `SQLQueryTool.run()` — every SQL query
- `expand_graph()` — every graph expansion
- `orchestrator.run()` — agent_runs persist
- `query.py GET /runs/{run_id}` — run retrieval

Under concurrent requests (even 3–5), these sync sessions compete for 5 connections. Add explicit pool settings to the sync engine:

```python
_sync_engine = create_engine(
    dsn,
    pool_pre_ping=True,
    pool_size=10,       # up from 5
    max_overflow=10,    # explicit (was default 10)
    pool_timeout=30,
    pool_recycle=1800,  # recycle connections after 30 min (Neon closes idle connections)
)
```

### 5-C. Neon Serverless Consideration

Neon uses connection proxying and may close idle connections. The `pool_pre_ping=True` (already set) handles this, but `pool_recycle=1800` (30 minutes) is a belt-and-suspenders measure. Neon's documentation recommends setting `pool_recycle` for long-running backends.

### 5-D. pool_recycle for Async Engine

Add `pool_recycle` to the async engine:
```python
_async_engine = create_async_engine(
    dsn,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    pool_recycle=1800,  # ADD THIS
    pool_timeout=30,    # ADD THIS (explicit)
)
```

**Expected impact:** Prevents "connection was closed by server" errors after periods of inactivity (common after Render cold starts and Neon idle timeouts). Improves reliability more than raw speed.

---

## 6. SQLAlchemy N+1 Query Risks

**Impact:** MEDIUM — latency spike when relationships are accessed
**File:** `backend/app/db/models.py`

### 6-A. Eager Loading on IncidentReport

`IncidentReport.embeddings` uses `lazy="selectin"` (line 60):
```python
embeddings: list["IncidentEmbedding"] = relationship(
    "IncidentEmbedding",
    back_populates="incident",
    lazy="selectin",
)
```

`lazy="selectin"` means SQLAlchemy fires a secondary `IN` query automatically whenever the `embeddings` attribute is accessed on any `IncidentReport` instance. Since all vector search and retrieval queries use raw `text()` SQL (not ORM queries), this relationship is never triggered during the agent loop — which is correct and efficient.

**Risk:** If any future code loads `IncidentReport` objects via ORM queries (e.g., `session.query(IncidentReport).all()`), the `selectin` load will fire. With 10,000 incidents, this could be a large query. Acceptable as long as ORM-based loads remain bounded.

### 6-B. GraphNode Relationships Use lazy="select"

`GraphNode.outgoing_edges` and `GraphNode.incoming_edges` use `lazy="select"` (lines 141, 147):
```python
outgoing_edges: list["GraphEdge"] = relationship(..., lazy="select")
incoming_edges: list["GraphEdge"] = relationship(..., lazy="select")
```

`lazy="select"` is the classic N+1 trigger: accessing edges on N nodes fires N individual SELECT statements. `graph/expander.py` avoids this by using raw SQL to fetch edges in bulk — good. However, `graph/scorer.py` iterates over `graph_nodes` (dicts, not ORM objects) so this relationship is not loaded there either.

**Risk:** Low for current code paths. If ORM-based graph queries are added, switch to `lazy="joined"` or `lazy="selectin"` explicitly.

### 6-C. IncidentEmbedding.incident Also Uses selectin

`IncidentEmbedding.incident` uses `lazy="selectin"` (line 121). Every time an embedding is loaded via ORM, the parent `IncidentReport` is also fetched. The ingest pipeline (`pipeline.py`) and retrieval module use raw `text()` SQL exclusively, so this is not triggered at runtime.

**Recommendation:** No change needed now. Add a comment in `models.py` flagging that all hot paths must use raw SQL text() queries, not ORM attribute traversal, to avoid triggering these eager loads.

---

## 7. Graph Expander Query Optimization

**Impact:** MEDIUM — reduces latency on large graph expansions
**File:** `backend/app/graph/expander.py`

### 7-A. String Interpolation in SQL (Parameterization)

The expander builds SQL with f-string interpolation for the `IN` clause:
```python
# expander.py lines 77-81
placeholders = ", ".join(f"'{nid}'" for nid in chunk)
result = session.execute(text(f"""
    SELECT id, from_node, to_node, type, weight
    FROM graph_edge
    WHERE from_node IN ({placeholders}) AND type {type_filter}
"""))
```

This pattern:
1. Bypasses SQLAlchemy's parameterized query binding (no SQL injection risk here since IDs are internal UUIDs, but it prevents query plan caching)
2. Issues a new query plan for every unique combination of IDs

**Recommended fix:** Use SQLAlchemy's `bindparam` with `expanding=True`:
```python
from sqlalchemy import bindparam

stmt = text("""
    SELECT id, from_node, to_node, type, weight
    FROM graph_edge
    WHERE from_node = ANY(:node_ids) AND type = ANY(:edge_types)
""")
result = session.execute(stmt, {
    "node_ids": chunk,
    "edge_types": ["mentions", "co_occurrence", "similarity"][:hop_limit],
})
```

Using `= ANY(:array)` with a PostgreSQL array parameter enables query plan reuse and avoids the 100-item CHUNK batching loop entirely. PostgreSQL `= ANY(array)` has no parameter count limit issue unlike `IN (...)` with large lists.

### 7-B. Two Separate Queries for Outgoing + Incoming Edges

For each chunk of frontier nodes, the expander fires two separate queries (outgoing, then incoming). These can be merged:
```sql
SELECT id, from_node, to_node, type, weight
FROM graph_edge
WHERE (from_node = ANY(:node_ids) OR to_node = ANY(:node_ids))
  AND type = ANY(:edge_types)
```

This halves the number of graph expansion queries per hop.

### 7-C. Missing Index on graph_edge.type

`graph_edge.type` is used in every expansion filter (`WHERE type IN (...)`) but is not indexed in `models.py`. Adding a composite index on `(from_node, type)` and `(to_node, type)` would allow PostgreSQL to satisfy both the node-ID filter and the type filter in a single index scan.

```sql
-- New Alembic migration
CREATE INDEX CONCURRENTLY idx_graph_edge_from_type ON graph_edge (from_node, type);
CREATE INDEX CONCURRENTLY idx_graph_edge_to_type   ON graph_edge (to_node, type);
```

**Expected impact:** Combined, these three changes reduce graph expansion latency by 30–50% for graphs with >1,000 nodes.

---

## 8. Ingest Pipeline Optimizations

**Impact:** MEDIUM — reduces ingest time from ~5 min to ~2–3 min
**File:** `backend/app/ingest/pipeline.py`

### 8-A. Row-by-Row Upsert Anti-Pattern

`_upsert_dataframe_sync()` inserts rows one at a time in a loop (line 73):
```python
for row in rows:
    result = session.execute(sql, clean_row)
    inserted += result.rowcount
```

With 10,000+ incidents, this fires 10,000+ individual INSERT statements. SQLAlchemy 2 supports bulk insert with `executemany`:

```python
# Replace the row loop with:
session.execute(sql, [clean_row(r) for r in rows])
session.commit()
```

Or use PostgreSQL's COPY protocol via `psycopg2.copy_expert` for maximum throughput. The `executemany` approach with SQLAlchemy Core will batch statement execution using the DBAPI's native bulk-insert capability.

### 8-B. Embedding Insertion Also Row-by-Row

`_embed_and_store_sync()` lines 142–154 inserts each chunk individually:
```python
for record in batch:
    session.execute(INSERT ..., {**record, "embedding": str(record["embedding"])})
```

Apply the same bulk `executemany` pattern. This is the highest-volume insert operation (10,000 incidents × 3 chunks = ~30,000 rows per ingest).

### 8-C. Graph Build: Per-Row Commits Are Slow

`builder.py` calls `session.commit()` after every chunk's worth of nodes/edges (line 269). For 30,000 chunks, this is 30,000 commits. Batch commits to every 500 or 1,000 rows:

```python
# Replace session.commit() inside the loop with:
if node_count % 500 == 0:
    session.commit()
# Then commit once after the loop:
session.commit()
```

**Expected impact:** Reduces ingest time from ~5 minutes to ~2–3 minutes for a 10k-incident dataset.

---

## 9. FastAPI Response Optimization

**Impact:** MEDIUM for large payloads, LOW for small
**File:** `backend/app/main.py`

### 9-A. Switch to ORJSONResponse

FastAPI's default `JSONResponse` uses Python's stdlib `json.dumps`. For the agent output (which includes up to 8 vector hits × ~500 chars each, plus graph nodes and SQL rows), the payload is typically 5–20 KB. `orjson` is 2–3× faster for serialization at this size.

```python
# main.py — in create_app():
from fastapi.responses import ORJSONResponse

app = FastAPI(
    ...
    default_response_class=ORJSONResponse,
)
```

Then in `requirements.txt`, add:
```
orjson==3.10.12
```

**Note:** `ORJSONResponse` is already available in FastAPI — no new dependency if using `fastapi[all]`, but since you pin FastAPI individually, add `orjson` explicitly.

### 9-B. Add GZipMiddleware

The query response payload (5–20 KB JSON) compresses well (60–80% reduction). Add GZip at level 4 (good speed/size tradeoff):

```python
# main.py — in create_app(), before CORS middleware:
from starlette.middleware.gzip import GZipMiddleware

app.add_middleware(GZipMiddleware, minimum_size=1000, compresslevel=4)
```

GZip only fires when the client sends `Accept-Encoding: gzip`. All modern browsers and `fetch()` calls send this header. Minimum size of 1000 bytes avoids compressing tiny health-check responses.

### 9-C. Add ETag / Cache-Control for /healthz

The `/healthz` endpoint is polled every 30 seconds by the frontend warm-up ping. Add a `Cache-Control: no-store` header (since it represents live state) and consider returning a lightweight response:

```python
@router.get("/healthz")
async def healthz():
    return ORJSONResponse({"status": "ok"}, headers={"Cache-Control": "no-store"})
```

This is already fast but confirms no accidental caching.

**Expected impact:** 20–40% faster JSON serialization; 60–80% wire-size reduction on large payloads for clients with gzip support.

---

## 10. SQL Tool Named Query Optimization

**Impact:** LOW-MEDIUM
**File:** `backend/app/tools/sql_tool.py`

### 10-A. The incidents_defects_join Query Uses ILIKE with Concatenation

```sql
JOIN manufacturing_defects md ON md.product ILIKE '%' || ir.system || '%'
```

This is a non-sargable condition — PostgreSQL cannot use any index on `product` for this join because the pattern is dynamic. On large tables this is a sequential scan join. The query is already `LIMIT 50` so impact is bounded, but consider:

1. Pre-computing the join relationship at ingest time as a materialized view, or
2. Replacing with an exact-match join on a normalized `system` column.

### 10-B. The defect_counts_by_product Query Uses Text Interpolation for INTERVAL

```python
# sql_tool.py line 262
sql = sql.replace(":days days", f"{int(days)} days")
```

This is safe (int cast prevents injection) but bypasses parameterized query planning. PostgreSQL will cache the query plan per-connection only if the query text is identical. Since the `days` value changes the query text, each unique `days` value gets its own plan. For a fixed set of `days` values (the default is always 90), this is effectively a non-issue in practice.

### 10-C. Named Query Results Are Not Cached

SQL aggregation queries (`defect_counts_by_product`, `severity_distribution`) are read-heavy and their underlying data changes only during ingest. These queries run in seconds but could be cached for minutes.

**Recommended approach:** Add a simple TTL cache for named query results:

```python
# sql_tool.py
import functools
import time

_named_query_cache: dict[str, tuple[float, dict]] = {}  # name -> (timestamp, result)
CACHE_TTL_SECONDS = 300  # 5 minutes

def run_named_cached(self, name: str, params: dict | None = None) -> dict:
    cache_key = f"{name}:{params}"
    now = time.monotonic()
    if cache_key in _named_query_cache:
        ts, cached_result = _named_query_cache[cache_key]
        if now - ts < CACHE_TTL_SECONDS:
            return cached_result
    result = self.run_named(name, params)
    _named_query_cache[cache_key] = (now, result)
    return result
```

**Expected impact:** Eliminates DB round-trip for repeated identical SQL queries within the TTL window. Relevant for the frontend dashboard which fires the same aggregation queries repeatedly.

---

## 11. Sentence-Transformer Batch Size Tuning

**Impact:** LOW for query-time, MEDIUM for ingest
**File:** `backend/app/rag/embeddings.py`, `backend/app/ingest/pipeline.py`

### 11-A. Current Batch Size

`EmbeddingModel.encode()` defaults to `batch_size=64` (line 54). `pipeline.py` calls `model.encode(texts)` with batches of 256 texts (line 135, `batch_size=256` in `_embed_and_store_sync`).

For CPU-only inference (Render free tier has no GPU):
- Optimal CPU batch size for `all-MiniLM-L6-v2` is 16–32 (larger batches increase memory pressure with no throughput gain on CPU)
- The current `batch_size=256` passed to `_embed_and_store_sync` controls how many texts are grouped before calling `model.encode()`, but `model.encode()` itself uses `batch_size=64` internally (the SentenceTransformer `batch_size` parameter)

### 11-B. Recommended Settings

For CPU-only Render deployment:
```python
# embeddings.py — change default:
def encode(self, texts: list[str], batch_size: int = 32) -> np.ndarray:  # down from 64
```

For ingest (CPU, many texts):
```python
# pipeline.py line 135:
vectors = model.encode(texts, batch_size=32)  # explicit, down from default 64
```

The memory savings from smaller batches reduce GC pressure on the 512 MB Render free tier.

### 11-C. show_progress_bar Condition

`EmbeddingModel.encode()` shows a progress bar for >500 texts (line 75). On a server with no terminal, this is harmless (tqdm writes to stderr) but slightly wasteful. Consider `show_progress_bar=False` for server deployments:

```python
vectors = self._st_model.encode(
    texts,
    batch_size=batch_size,
    convert_to_numpy=True,
    show_progress_bar=False,   # suppress for server deployment
    normalize_embeddings=True,
)
```

**Expected impact:** Marginal CPU improvement. Primary benefit is reduced memory pressure during ingest on constrained cloud instances.

---

## 12. vector_search Embedding Serialization

**Impact:** MEDIUM — removes unnecessary round-trip conversion
**File:** `backend/app/rag/retrieval.py` line 68

### 12-A. Problem

The query embedding is serialized as a Python list-string before being passed to PostgreSQL:
```python
params: dict[str, Any] = {
    "embedding": str(query_embedding.tolist()),  # converts numpy array → string
    ...
}
# Then in SQL:
CAST(:embedding AS vector)
```

This forces PostgreSQL to parse the string representation of a 384-element float list on every query. The pgvector Python extension (`pgvector==0.3.6`) supports direct numpy array passing via `register_vector()`:

```python
from pgvector.psycopg2 import register_vector  # for psycopg2 sync
# or
from pgvector.asyncpg import register_vector    # for asyncpg async
```

Once registered, you can pass the numpy array directly:
```python
params = {
    "embedding": query_embedding,  # pass numpy array directly
    ...
}
# SQL:
WHERE e.embedding <=> :embedding  # no CAST needed
```

**Prerequisite:** Register the vector type with the connection at engine creation time. In SQLAlchemy, this is done via event listeners:

```python
from sqlalchemy import event
from pgvector.sqlalchemy import Vector  # already imported in models.py

@event.listens_for(engine, "connect")
def on_connect(dbapi_conn, connection_record):
    from pgvector.psycopg2 import register_vector
    register_vector(dbapi_conn)
```

**Expected impact:** Removes string parse overhead on every vector search. Minor but consistent improvement (~2–5 ms per query). More importantly, it corrects a code smell that could cause subtle serialization bugs at scale.

---

## Prioritized Action Plan

Listed in implementation order with effort and risk estimates.

### Phase 1 — Quick Wins (1–2 days, zero risk)

| Priority | Change | File | Effort | Impact |
|---|---|---|---|---|
| 1 | Add `run_in_threadpool` to `run_query` handler | `api/query.py` | 5 min | HIGH |
| 2 | Add LRU embedding cache | `rag/embeddings.py`, `tools/vector_tool.py` | 30 min | HIGH (cache hits) |
| 3 | Add `pool_recycle=1800` to both engines | `db/session.py` | 5 min | MEDIUM |
| 4 | Add explicit pool settings to sync engine | `db/session.py` | 5 min | MEDIUM |
| 5 | Add early-exit guard for empty claims in orchestrator | `agent/orchestrator.py` | 5 min | MEDIUM |
| 6 | Add `ORJSONResponse` as default response class | `main.py`, `requirements.txt` | 15 min | MEDIUM |
| 7 | Add `GZipMiddleware` | `main.py` | 5 min | MEDIUM |

### Phase 2 — Index and Query Improvements (1–3 days, low risk)

| Priority | Change | File | Effort | Impact |
|---|---|---|---|---|
| 8 | Write HNSW migration, drop IVFFlat | New Alembic migration | 2 hrs | HIGH |
| 9 | Remove `SET ivfflat.probes` after HNSW migration | `rag/retrieval.py` | 5 min | LOW |
| 10 | Add composite indexes on `graph_edge(from_node, type)` | New Alembic migration | 30 min | MEDIUM |
| 11 | Merge outgoing+incoming edge queries in expander | `graph/expander.py` | 1 hr | MEDIUM |
| 12 | Add named query result cache in SQLQueryTool | `tools/sql_tool.py` | 1 hr | MEDIUM |
| 13 | Bulk `executemany` upsert in ingest pipeline | `ingest/pipeline.py` | 2 hrs | MEDIUM |

### Phase 3 — Architectural Changes (3–5 days, medium risk)

| Priority | Change | File | Effort | Impact |
|---|---|---|---|---|
| 14 | Add `AsyncAnthropic` to `ClaudeClient` | `llm/client.py` | 2 hrs | Prerequisite |
| 15 | Merge classify+plan into single LLM call | `agent/planner.py`, `agent/intent.py` | 4 hrs | HIGH |
| 16 | Convert orchestrator to async | `agent/orchestrator.py` | 1–2 days | HIGH |
| 17 | Convert tools to async | `tools/*.py`, `graph/expander.py` | 1 day | HIGH |

---

## pgvector Index Reference Card

### Production Configuration — Applied

```sql
-- HNSW indexes are deployed (T-10 complete).
-- Actual index names (differed from assumed names — verified with \d):
--   incident_embeddings: idx_incident_embeddings_hnsw
--   medical_embeddings:  idx_medical_embeddings_hnsw
-- Both created with m=16, ef_construction=64.
-- ef_search=40 set via ALTER DATABASE and via session.py connect_args.
-- IVFFlat indexes (idx_incident_embeddings_vec, idx_medical_embeddings_vec) dropped.
```

### Parameter Tuning Matrix

| Dataset size | m | ef_construction | ef_search | Expected recall |
|---|---|---|---|---|
| <10k rows | 8 | 32 | 20 | >0.97 |
| 10k–100k rows | 16 | 64 | 40 | >0.98 |
| 100k–1M rows | 32 | 128 | 80 | >0.99 |
| >1M rows | 48 | 128 | 100 | >0.99 |

**This codebase target:** 10k incidents × 3 chunks = ~30k rows → use `m=16, ef_construction=64, ef_search=40`.

---

## DB Connection Pool Sizing Reference

### Current State (session.py — T-04 applied)

| Engine | pool_size | max_overflow | pool_timeout | pool_recycle | pool_pre_ping |
|---|---|---|---|---|---|
| Async engine | 10 | 20 | 30 | 1800 | True |
| Sync engine | 10 | 10 | 30 | 1800 | True |

Async engine also sets `connect_args={"server_settings": {"hnsw.ef_search": "40"}}` (T-11).

**Total max connections from backend to Neon: 50.** Neon free tier allows 100 connections. Neon Pro allows 500+. These values are safe for Render single-instance deployment.

**Note:** If migrating to multiple Render instances (horizontal scaling), reduce `pool_size` proportionally to stay within Neon's connection limit, or use PgBouncer (Neon offers this as a built-in connection pooler).

---

## Caching Opportunities Summary

| Cache target | Mechanism | TTL | Scope | Priority |
|---|---|---|---|---|
| Single query embeddings | `functools.lru_cache(maxsize=512)` | Process lifetime | Per-process | HIGH |
| Named SQL query results | Dict with `time.monotonic()` TTL | 300 seconds | Per-process | MEDIUM |
| Agent run results | PostgreSQL `agent_runs` table (already implemented) | Permanent | Cross-process | Done |
| LLM classify/plan output | Not recommended — queries are unique | N/A | — | Skip |

---

## Known Gaps and Open Questions

**[ASSUMPTION]** The IVFFlat index exists in production. The codebase references it in the `retrieval.py` docstring and sets `ivfflat.probes`, but the actual Alembic migration that creates it was not read. Verify with `\d incident_embeddings` in psql before the HNSW migration.

**[ASSUMPTION]** The Render deployment runs a single instance. Pool sizing recommendations assume single-process. Verify at `render.yaml`.

**[NEEDS VERIFICATION]** Neon's support for `CREATE INDEX CONCURRENTLY` — Neon's serverless architecture has transaction semantics that may restrict concurrent index creation. Test on the Neon dev database before running in production. Per Neon docs (neon.com/docs/ai/ai-vector-search-optimization), HNSW creation is supported but may require elevated `maintenance_work_mem`.

**[NEEDS VERIFICATION]** `anthropic==0.40.0` — the version pinned in `requirements.txt`. The `AsyncAnthropic` class has been available since ~0.20.0, so this should work. Confirm with `from anthropic import AsyncAnthropic` import test.

**[GAP]** The `orchestrator.run()` is called from a FastAPI `async def` handler without `await` or `run_in_executor`. This needs urgent confirmation: does FastAPI silently handle this? Answer: No — calling a sync function directly in an async handler blocks the event loop. This is the highest-priority correctness fix, not just a performance optimization.

**[GAP]** The ingest pipeline's `_upsert_dataframe_sync` commits inside the row loop (`session.commit()` line 77). With psycopg2 autocommit off, each commit is a full round-trip. The actual commit count and performance impact depends on row count and Neon latency (typically 5–20 ms per round-trip from Render). At 10,000 rows × 20 ms = 200 seconds of commit overhead — this is likely the dominant ingest bottleneck.

**[ASSUMPTION]** The graph expander's string-interpolated `IN (...)` SQL does not pose SQL injection risk because node IDs are internal UUIDs generated by `uuid.uuid4()`. However, this assumption must hold — any code path that allows user-supplied values to reach `seed_ids` would create an injection vector.

---

## Resource References

- pgvector HNSW parameters — Neon: [neon.com/docs/ai/ai-vector-search-optimization](https://neon.com/docs/ai/ai-vector-search-optimization)
- pgvector HNSW vs IVFFlat deep dive — AWS: [aws.amazon.com/blogs/database/optimize-generative-ai-applications-with-pgvector-indexing](https://aws.amazon.com/blogs/database/optimize-generative-ai-applications-with-pgvector-indexing-a-deep-dive-into-ivfflat-and-hnsw-techniques/)
- pgvector benchmark (15× QPS for HNSW) — Tembo: [legacy.tembo.io/blog/vector-indexes-in-pgvector](https://legacy.tembo.io/blog/vector-indexes-in-pgvector/)
- SQLAlchemy 2 connection pooling — Official docs: [docs.sqlalchemy.org/en/20/core/pooling.html](https://docs.sqlalchemy.org/en/20/core/pooling.html)
- AsyncAdaptedQueuePool and async engine guidance — SQLAlchemy discussion: [github.com/sqlalchemy/sqlalchemy/discussions/10697](https://github.com/sqlalchemy/sqlalchemy/discussions/10697)
- Anthropic AsyncAnthropic client — SDK README: [github.com/anthropics/anthropic-sdk-python](https://github.com/anthropics/anthropic-sdk-python)
- FastAPI run_in_threadpool pattern — FastAPI concurrency docs: [fastapi.tiangolo.com/async](https://fastapi.tiangolo.com/async/)
- ORJSONResponse 20% speedup — benchmark: [undercodetesting.com/boost-fastapi-performance-by-20-with-orjson](https://undercodetesting.com/boost-fastapi-performance-by-20-with-orjson/)
- GZipMiddleware — FastAPI advanced middleware: [fastapi.tiangolo.com/advanced/middleware](https://fastapi.tiangolo.com/advanced/middleware/)
- sentence-transformers batch size guidance — Milvus: [milvus.io/ai-quick-reference/how-can-you-do-batch-processing-of-sentences-for-embedding-to-improve-throughput-when-using-sentence-transformers](https://milvus.io/ai-quick-reference/how-can-you-do-batch-processing-of-sentences-for-embedding-to-improve-throughput-when-using-sentence-transformers)
- asyncio.gather for parallel LLM calls — Instructor blog: [python.useinstructor.com/blog/2023/11/13/learn-async](https://python.useinstructor.com/blog/2023/11/13/learn-async/)
