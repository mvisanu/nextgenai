# TASKS3.md — RAG & Agent Optimizations (Wave 3)

> Generated: 2026-03-06
> Based on code analysis of the post-TASKS2 codebase state (all T-01–T-17 applied, BUG-001–BUG-008 fixed).

---

## Summary

All 17 TASKS2 items have been implemented (T-17 full async orchestrator, HNSW index, embedding LRU cache,
GZip/ORJSON, graph edge parameterisation, etc.) and all eight findings.md bugs have been patched.
What remains are retrieval quality gaps (no hybrid BM25+vector search, single similarity metric only),
observability gaps (no token usage tracking, no per-stage latency histogram), structured-output gaps
(no Pydantic validation of LLM JSON before use, no retry on malformed response), and several smaller
but real correctness issues found in the current code.

---

## Tasks

---

### T3-01: Add Pydantic validation + one-shot retry for all LLM structured outputs [DONE]

**Priority**: High
**Effort**: M
**Dependencies**: none

**Rationale**:
Every LLM call that expects JSON (`classify_and_plan_async`, `verify_claims_async`, synthesis in
`orchestrator.py`) does a raw `json.loads(response)` and then accesses dict keys with `.get()`.
If the model returns structurally valid JSON but with wrong field names or wrong value types, the
error is silently swallowed and the caller falls back to defaults — the user gets a degraded answer
with no indication of why.

Specific locations:
- `backend/app/agent/orchestrator.py` line 473: `synthesis = json.loads(synthesis_response)` — no schema validation
- `backend/app/agent/verifier.py` lines 98–99: `data = json.loads(response)` then `data.get("verified_claims", [])` — no structural check
- `backend/app/agent/intent.py` lines 239: `data = json.loads(response)` — no validation that `steps` entries contain `tool`, `tool_inputs`, `step_number`
- `backend/app/llm/client.py` `_parse_response_text()`: logs a warning on invalid JSON but returns the raw string — caller then fails on `json.loads`

**Implementation**:
- Define three Pydantic models in `backend/app/schemas/models.py` (or a new `backend/app/schemas/llm_outputs.py`):
  - `ClassifyPlanOutput(BaseModel)` — `intent: Literal["vector_only","sql_only","hybrid","compute"]`, `plan_text: str`, `steps: list[StepSpec]`
  - `SynthesisOutput(BaseModel)` — `answer: str`, `claims: list[ClaimText]`, `assumptions: list[str]`, `next_steps: list[str]`
  - `VerifyOutput(BaseModel)` — `verified_claims: list[VerifiedClaimSpec]`
- In each caller, wrap the `json.loads` result in `Model.model_validate(data)`. On `ValidationError`, log the failure with the raw response excerpt, issue exactly one retry call to the LLM with an error-correction prefix appended to the original prompt ("Your previous response failed validation: {error}. Please return valid JSON matching the schema."), then validate again. If the retry also fails, fall through to the existing fallback.
- In `client.py._parse_response_text()`: when `json.loads` raises, log the first 300 characters of the raw response at WARNING level (currently only 200 chars are logged) and raise so the caller's try/except catches it cleanly — do not swallow the error inside the parser.
- Add a test in `backend/tests/` that injects a mock LLM returning structurally invalid JSON and asserts the retry fires exactly once and the fallback is invoked if the retry also returns invalid JSON.

---

### T3-02: Token usage tracking and per-stage latency histograms in structured logs [DONE]

**Priority**: High
**Effort**: M
**Dependencies**: none

**Rationale**:
The LLM logs in `client.py` record `prompt_chars` and `output_chars` but not token counts. The
Anthropic SDK response object at `response.usage` already contains `input_tokens` and `output_tokens`
— these are never logged or persisted. Without token counts, there is no visibility into per-query
cost or LLM call efficiency.

Likewise, the orchestrator logs total `total_latency_ms` in `run_summary`, and each step logs
`latency_ms`, but there is no breakdown of time spent in each state (CLASSIFY+PLAN vs EXECUTE_TOOLS
vs EXPAND_GRAPH vs SYNTHESISE vs VERIFY vs SAVE). The only way to diagnose a slow query today is to
read raw log lines.

Specific locations:
- `backend/app/llm/client.py` `complete()` lines 186–193: logs `stop_reason` but not `response.usage.input_tokens` / `response.usage.output_tokens`
- `backend/app/llm/client.py` `complete_async()` lines 226–232: same omission
- `backend/app/agent/orchestrator.py` `run()`: no per-state timing tracked; only `t_run_start` to total

**Implementation**:
- In `client.py` `complete()` and `complete_async()`: add `input_tokens` and `output_tokens` to the LLM response log entry. Access via `response.usage.input_tokens` and `response.usage.output_tokens` (both are ints on the Anthropic SDK `Message` object). Also log a derived `estimated_cost_usd` using hardcoded per-million-token rates for Haiku and Sonnet (constants defined at module top).
- In `orchestrator.py` `run()`: add a `_state_timings: dict[str, float]` dict. Record `time.perf_counter()` at the start and end of each named state block (CLASSIFY+PLAN, EXECUTE_TOOLS, EXPAND_GRAPH, SYNTHESISE, VERIFY, SAVE). Include `state_timings_ms` in the final `run_summary` that is persisted to `agent_runs` and returned in the API response.
- Extend `RunSummary` Pydantic schema in `backend/app/schemas/models.py` to include `state_timings_ms: dict[str, float] = Field(default_factory=dict)` so it is visible in the API response.
- Update `_normalise_result()` in `query.py` to pass `state_timings_ms` through to `run_summary`.

---

### T3-03: Hybrid BM25 + vector search (sparse-dense fusion) [DONE]

**Priority**: High
**Effort**: L
**Dependencies**: none

**Rationale**:
`retrieval.py` uses pure cosine similarity over dense embeddings. BM25 (term frequency-inverse
document frequency) excels on exact-keyword queries where the dense model under-performs — for
example, "find defect_id BOLT-2847" or "show incidents mentioning hydraulic pump part number 4792".
The current system returns cosine-similar chunks even when the query contains specific identifiers
that BM25 would rank directly.

The PostgreSQL full-text search (`tsvector`/`tsquery`) is the natural BM25 implementation without
adding a new service. `incident_reports` and `medical_cases` already have `narrative` / `description`
text columns that can be indexed with `GIN(to_tsvector('english', narrative))`.

**Implementation**:
- Write a new Alembic migration that adds GIN full-text indexes:
  ```sql
  CREATE INDEX CONCURRENTLY idx_incident_reports_fts ON incident_reports
    USING GIN(to_tsvector('english', narrative));
  CREATE INDEX CONCURRENTLY idx_medical_cases_fts ON medical_cases
    USING GIN(to_tsvector('english', narrative));
  ```
- Add a `bm25_search(session, query_text, top_k, domain)` function in `backend/app/rag/retrieval.py` that executes `WHERE to_tsvector('english', narrative) @@ plainto_tsquery('english', :query)` ordered by `ts_rank_cd`. Return the same dict shape as `vector_search()` results but with a `bm25_score` field instead of `score`.
- Add `hybrid_search(session, query_embedding, query_text, top_k, alpha, domain)` in `retrieval.py` that runs both searches concurrently (both are I/O-bound sync calls inside `session.run_sync`), then fuses results using Reciprocal Rank Fusion (RRF): `score = 1/(k + rank_vector) + 1/(k + rank_bm25)` where `k=60` is the standard RRF constant. Deduplicate by `chunk_id` and return top_k by fused score.
- Update `VectorSearchTool.run_async()` in `backend/app/tools/vector_tool.py` to accept a `search_mode: Literal["vector", "hybrid"] = "vector"` parameter. When `search_mode="hybrid"`, call `hybrid_search` instead of `vector_search`.
- Update `orchestrator.py` to pass `search_mode="hybrid"` for `hybrid` and `compute` intents, and `search_mode="vector"` for `vector_only`.
- `alpha` parameter (weight of vector vs BM25) should come from `config.yaml` with default `0.7` (70% vector, 30% BM25).
- No Pydantic schema changes needed: `VectorHit` already has `metadata: dict` which can carry `search_mode` and `bm25_score`.

---

### T3-04: Semantic query cache (skip full agent loop for near-duplicate queries) [DONE]

**Priority**: High
**Effort**: M
**Dependencies**: T3-01 (Pydantic validation on cached output deserialization)

**Rationale**:
The `agent_runs` table persists every query result. However, the orchestrator never checks it before
running. The frontend example queries fire the same ~14 fixed queries repeatedly. Each re-run costs
one Haiku call + one vector search + one graph expansion + one Sonnet synthesis + one Haiku verify
— roughly 3-8 seconds and ~$0.003 per query.

A two-tier cache is appropriate:
1. **Exact match**: check `agent_runs` for the same `(query, domain)` pair within a TTL (e.g. 5 minutes). Return the stored result immediately.
2. **Semantic match** (optional, same tier): embed the incoming query, find the nearest stored query embedding from a small in-memory index, and return the cached result if cosine similarity > 0.97.

The `agent_runs` table already stores `query` as plain text and `result` as JSON — the infrastructure exists.

**Implementation**:
- Add an `async def _check_cache(query, domain, ttl_seconds=300)` helper in `query.py` or a new `backend/app/cache/query_cache.py` module. It queries `agent_runs` via async session: `SELECT result FROM agent_runs WHERE query = :query AND domain = :domain AND created_at > NOW() - INTERVAL '5 minutes' ORDER BY created_at DESC LIMIT 1`. Return the parsed result dict or `None` on miss.
- In `run_query()` in `query.py`: call `_check_cache()` before `orchestrator.run()`. On a hit, skip the agent loop entirely, deserialise the stored result with `QueryResponse.model_validate(result)`, and add a `"cached": true` field to `run_summary` so the frontend can display a cache indicator.
- Add `created_at` indexing: verify that `agent_runs.created_at` has an index. Add a new Alembic migration with `CREATE INDEX CONCURRENTLY idx_agent_runs_query_domain_ts ON agent_runs (query, domain, created_at DESC)` if not present.
- Cache invalidation: the cache TTL of 300 seconds is sufficient for the example query use case. No active invalidation needed.
- Note: `domain` is not a column in `agent_runs` currently — the table stores `run_id, query, result, created_at`. Either add a `domain` column via migration, or encode it in the `query` string key as `f"{domain}::{query}"` in the cache lookup (simpler, no migration).

---

### T3-05: Fix embedding serialisation anti-pattern in retrieval.py (pass numpy array directly) [SKIPPED]

**Priority**: Medium
**Effort**: S
**Dependencies**: none

**Rationale**:
`retrieval.py` line 70 converts the 384-dim numpy array to a Python list string before binding it
to the SQL query:
```python
"embedding": str(query_embedding.tolist()),
```
PostgreSQL then parses this string into a vector on every query. The `pgvector` Python package
(`pgvector==0.3.6` is in `requirements.txt`) provides native numpy array binding via
`register_vector()`. This removes the string conversion overhead (~2-5 ms per query) and eliminates
a latent serialisation correctness risk (float precision loss through str→float→vector parse).

The `CAST(:embedding AS vector)` in the SQL query (line 99 of `retrieval.py`) is also necessary
only because the embedding is passed as a string — with native binding the cast is not needed.

This was identified in `optimize.md` section 12-A but was never included in TASKS2.

**Implementation**:
- In `backend/app/db/session.py`, add an `on_connect` SQLAlchemy event listener on both the sync and async engine that calls `register_vector(dbapi_conn)`:
  ```python
  from sqlalchemy import event
  from pgvector.psycopg2 import register_vector as register_vector_sync

  @event.listens_for(get_sync_engine(), "connect")
  def _on_sync_connect(dbapi_conn, connection_record):
      register_vector_sync(dbapi_conn)
  ```
  For asyncpg, use `pgvector.asyncpg.register_vector` in the `on_connect` event of the async engine.
- In `retrieval.py`, change the `params` dict to pass the numpy array directly: `"embedding": query_embedding` (not `str(...)`).
- Remove the `CAST(:embedding AS vector)` in the SQL — change to `e.embedding <=> :embedding` directly.
- Verify with an end-to-end query that results are identical before/after (same top-k ranking).
- If asyncpg's `register_vector` requires an `asyncpg.Connection` (not a DBAPI connection), use the asyncpg connection initialization hook via `create_async_engine(..., connect_args={"init": _register_asyncpg_vector})`.

---

### T3-06: MMR (Maximal Marginal Relevance) deduplication of vector hits before synthesis [DONE]

**Priority**: Medium
**Effort**: S
**Dependencies**: none

**Rationale**:
The current `vector_search()` returns the top-k chunks by cosine similarity. When multiple chunks
from the same incident are retrieved, the synthesis prompt contains near-duplicate text — wasting
context tokens and making the answer narrower than it could be.

Example: a query about "hydraulic actuator failures" may return chunks 1, 2, and 3 from incident
IR-0042 (all scoring >0.85), while a highly relevant incident IR-0891 is ranked 9th and excluded.
MMR balances relevance against diversity by iteratively selecting the next chunk that maximises
`lambda * similarity_to_query - (1 - lambda) * max_similarity_to_already_selected`.

This is a pure Python post-processing step on the hit list — no DB changes needed.

**Implementation**:
- Add `mmr_rerank(hits: list[dict], query_embedding: np.ndarray, lambda_: float = 0.7, top_k: int = 8) -> list[dict]` in `backend/app/rag/retrieval.py`.
  - Extract the stored embedding vectors from the hit `metadata` (currently only `char_start`, `char_end`, `system`, `severity` are stored — embeddings are not returned from the DB query).
  - Alternative approach (no stored embeddings needed): compute similarity between excerpts by re-encoding them using the already-loaded `EmbeddingModel`. Since excerpts are short (~180 chars), batch encoding of 8 hits takes <5 ms on CPU.
  - The greedy MMR loop: start with the hit most similar to the query; at each step, add the hit that maximises `lambda * sim_to_query - (1-lambda) * max_sim_to_selected`.
- Call `mmr_rerank()` in `VectorSearchTool.run_async()` after `vector_search()` returns, using the already-computed `query_vec` as the reference vector. Fetch `top_k * 2` from DB, then MMR-select `top_k`.
- `lambda_` should be configurable via `config.yaml` (default `0.7` = 70% relevance, 30% diversity).
- No schema changes needed; the returned hit list is the same shape.

---

### T3-07: Verifier: expose conflict_note in API response and reduce fallback confidence correctly [DONE]

**Priority**: Medium
**Effort**: S
**Dependencies**: none

**Rationale**:
Two concrete gaps exist in `verifier.py` that reduce answer quality:

1. **Conflict detection is partial**: `scorer.py`'s `rank_evidence()` sets `conflict=True` on graph
   evidence items (line 147), but this information never reaches `verifier.py`. The verifier's
   `_SYSTEM_PROMPT` tells the LLM to reduce confidence by 0.2 and set `conflict_note` when it
   detects conflicts — but the verifier only passes the top-5 evidence items (line 77: `evidence[:5]`)
   without their `conflict` flag. The LLM cannot see which evidence items are pre-flagged as
   conflicting.

2. **Fallback confidence is undifferentiated**: `_fallback_verification()` in `verifier.py` line 233
   assigns `base_confidence = 0.6 if len(evidence) >= 2 else 0.3` to every claim identically.
   Two claims — one well-supported and one speculative — both get `0.6`. The `confidence` field
   in the API response becomes meaningless when the LLM call fails.

**Implementation**:
- In `verify_claims_async()` and `verify_claims()`: include the `conflict` flag when building `evidence_summary`. Change line 77–83 to:
  ```python
  for item in evidence[:5]:
      evidence_summary.append({
          "chunk_id": ...,
          "incident_id": ...,
          "excerpt": ...,
          "score": ...,
          "conflict_flagged": item.get("conflict", False),  # ADD THIS
      })
  ```
  Update the `_SYSTEM_PROMPT` to reference `conflict_flagged: true` items explicitly: "If an evidence item has conflict_flagged: true, treat it as a known conflict — reduce confidence by 0.2 and populate conflict_note."
- In `_fallback_verification()`: instead of a flat `base_confidence`, assign confidence proportional to claim position (first claim = `base_confidence`, each subsequent = `base_confidence - 0.05 * idx`, floored at 0.2). This gives at least a ranked signal even in fallback mode.
- No schema changes needed: `conflict_note` is already in the `Claim` schema and the API response.

---

### T3-08: GET /runs/{run_id} uses sync session inside async handler — convert to async [DONE]

**Priority**: Medium
**Effort**: S
**Dependencies**: none

**Rationale**:
`query.py` line 72: `get_run()` is declared `async def` but calls `get_sync_session()` directly
inside the handler body:
```python
async def get_run(run_id: str) -> RunRecord:
    try:
        with get_sync_session() as session:   # ← blocks the event loop
            result = session.execute(...)
```
This is the same blocking-sync-in-async-handler anti-pattern that T-01 fixed for `run_query`.
Since T-17 removed the threadpool wrapper, this route now silently blocks the event loop on every
`GET /runs/{run_id}` call for the duration of the DB round-trip (~5-20 ms per Neon connection).

**Implementation**:
- Change `get_run()` to use `get_session()` (async session):
  ```python
  async def get_run(run_id: str) -> RunRecord:
      async with get_session() as session:
          result = await session.execute(
              text("SELECT run_id, query, result, created_at FROM agent_runs WHERE run_id = :run_id"),
              {"run_id": run_id},
          )
          row = result.fetchone()
  ```
- Remove the `get_sync_session` import from `query.py` if it is no longer used elsewhere in that file.
- Add a test in `backend/tests/` that mocks the async session and asserts `GET /runs/{run_id}` returns 200 for a known run_id and 404 for an unknown one.

---

### T3-09: graph/expander.py expand_graph_async uses run_sync — replace with native async SQL

**Priority**: Medium
**Effort**: M
**Dependencies**: none

**Rationale**:
`expand_graph_async()` in `expander.py` lines 186–190:
```python
async with get_session() as session:
    result = await session.run_sync(
        lambda sync_session: expand_graph(sync_session, seed_ids, k=k)
    )
```
`session.run_sync()` delegates to the SQLAlchemy sync execution path, which internally uses a thread.
This means every graph expansion — fired for every query with vector hits — occupies a thread for its
full duration (typically 50-200 ms for a 1-hop expansion on a 1000-node graph). The async session's
native `await session.execute()` would release the event loop during the DB round-trips instead.

The sync `expand_graph()` is kept for the sync `run_sync()` fallback path and should remain.

**Implementation**:
- Write a new `_expand_graph_async_native(session: AsyncSession, seed_ids, k)` function inside `expander.py` that replicates the BFS loop of `expand_graph()` but uses `await session.execute()` for each SQL query instead of `session.execute()`.
- The BFS structure is identical; only the DB calls become `await`-ed.
- Update `expand_graph_async()` to use `_expand_graph_async_native()` directly without `run_sync`.
- The sync `expand_graph()` is unchanged.
- Validate: end-to-end query produces the same graph node/edge set as before.

---

### T3-10: Add LLM call retry with exponential backoff for transient API errors [DONE]

**Priority**: Medium
**Effort**: S
**Dependencies**: none

**Rationale**:
`ClaudeClient.complete()` and `complete_async()` in `client.py` have no retry logic. Anthropic's
API returns HTTP 529 ("overloaded") and HTTP 500 errors during peak load — observed on Render free
tier deployments. When this happens, the orchestrator catches the exception in the synthesis `try/except`
block and falls back to `_fallback_answer()`, giving the user a degraded response with no retry attempt.

The Anthropic SDK does include automatic retry logic (via `max_retries` in the client constructor),
but the current code does not set `max_retries` explicitly — it defaults to 2, which may not be
enough, and it does not have visibility into whether retries are happening.

**Implementation**:
- In `ClaudeClient.__init__()`, set `max_retries=3` explicitly on both `self._client = anthropic.Anthropic(..., max_retries=3)` and `self._async_client = AsyncAnthropic(..., max_retries=3)`. The SDK's built-in retry handles 529, 500, and connection errors with exponential backoff.
- Add logging before the API call that includes a `call_attempt` counter so log analysis can distinguish first-attempt successes from retried successes.
- For the `complete_async()` path specifically: wrap the `await self._async_client.messages.create(**kwargs)` in a `try/except anthropic.APIStatusError` block. Log the status code and retry count when a non-fatal error is caught and retried by the SDK. This gives visibility into transient API degradation.
- No changes needed to callers — the retry is transparent.

---

### T3-11: Chunker — fix char_start=-1 silent fallback and add sentence-boundary awareness

**Priority**: Medium
**Effort**: M
**Dependencies**: none

**Rationale**:
`chunker.py` `_find_char_offset()` at line 105 uses `source.find(target)` which returns `-1` when
the target string is not found in the source. This can happen due to tokenizer decode edge cases
(e.g., BOM characters, surrogate pairs, or whitespace normalisation differences). The caller handles
`char_start = -1` by clamping to `max(char_start, 0)` and `max(char_end, 0)` — so both offsets
become 0, meaning the citation points to the very beginning of the document regardless of where the
chunk actually is.

A citation with `char_start=0, char_end=0` for a chunk from the middle of a document is wrong and
will confuse any future citation highlighting feature in the frontend.

Additionally, the current chunker splits on a fixed token count with no awareness of sentence
boundaries. A 400-token chunk may split mid-sentence, degrading embedding quality for the partial
sentence at the boundary.

**Implementation**:
- Fix `_find_char_offset()`: when `source.find(target)` returns `-1`, try with the first 100 characters of `target` (stripping leading/trailing whitespace), since the tokenizer decode may produce slightly different whitespace at boundaries. Log a warning with the first 50 chars of target if even the fallback fails.
- If the fallback also fails, return `(-1, -1)` explicitly and let the caller store `char_start=None, char_end=None` rather than `0, 0`. Update the DB schema to allow `NULL` on these columns (already `INTEGER` — change to allow NULL, since they were always nullable by SQL convention).
- Add sentence-boundary snapping to `chunk_text()`: after computing the token window, decode the chunk and check if it starts in the middle of a sentence (heuristic: does not start with a capital letter or begins with a lowercase continuation). If so, trim back to the nearest period/newline before the window start. This is a soft heuristic — skip it if the adjusted chunk would be fewer than 50 tokens.
- No changes to `chunk_size=400` or `overlap=75` defaults — these are confirmed appropriate in `config.yaml`.

---

### T3-12: Add structured test infrastructure for async orchestrator and LLM mock

**Priority**: Medium
**Effort**: M
**Dependencies**: none

**Rationale**:
`backend/tests/` currently has no tests that exercise the async `orchestrator.run()` path end-to-end.
`findings.md` shows that all 62 tests blocked by `BUG-001` were in the synchronous test infrastructure.
The T-17 async orchestrator, the `classify_and_plan_async()` function, and `verify_claims_async()` are
all untested at the integration level.

Concretely: there is a `backend/tests/stubs/` directory (visible in git status) but it is empty or
contains only the anthropic stub. A proper `conftest.py`-based mock is needed so tests can exercise
the full async agent loop with a deterministic LLM mock (avoiding live API calls in CI).

**Implementation**:
- Create `backend/tests/stubs/llm_mock.py`: a `MockLLMClient(LLMClient)` that accepts a list of pre-programmed JSON responses and returns them in order from `complete()` / `complete_async()`. Raises `AssertionError` if more calls are made than pre-programmed responses.
- Update `backend/tests/conftest.py` to provide a `mock_llm` fixture that returns a `MockLLMClient` pre-loaded with valid `ClassifyPlanOutput`, `SynthesisOutput`, and `VerifyOutput` JSON responses.
- Write `backend/tests/test_orchestrator_async.py` with at least four test cases:
  1. `test_vector_only_query` — mock LLM returns `vector_only` intent; assert no SQL tool called.
  2. `test_hybrid_query_parallel_tools` — mock LLM returns `hybrid` intent; assert both vector and SQL coroutines are launched (instrument with `asyncio.gather` spy).
  3. `test_synthesis_json_invalid_triggers_retry` — mock LLM returns invalid JSON on first synthesis call, valid JSON on second; assert the retry fires and `verified_claims` is non-empty.
  4. `test_max_steps_fallback` — provide a plan with 11 steps; assert `halted_at_step_limit=True` in result.
- These tests use `pytest-asyncio` and the mock DB session (already in `conftest.py`) — no live DB or API calls.

---

### T3-13: Ingest pipeline — medical domain embed_and_store not implemented [DONE]

**Priority**: Medium
**Effort**: M
**Dependencies**: none

**Rationale**:
`pipeline.py` `_embed_and_store_sync()` (lines 106–175) only processes `incident_reports` →
`incident_embeddings`. There is no equivalent function for the medical domain
(`medical_cases` → `medical_embeddings`). The `vector_search()` function in `retrieval.py` supports
`domain="medical"` and queries `medical_embeddings`, but if `medical_embeddings` is empty, every
medical-domain query returns zero hits.

The `backend/app/db/models.py` (not read but referenced in BACKEND.md) defines `medical_embeddings`
with `embed_id`, `case_id`, `chunk_text`, `embedding`, `char_start`, `char_end`. The table exists
but is never populated by the ingest pipeline.

**Implementation**:
- Add `_embed_and_store_medical_sync(session, chunk_size=400, overlap=75, batch_size=256)` in `pipeline.py` following the same pattern as `_embed_and_store_sync()` but:
  - Queries `medical_cases LEFT JOIN medical_embeddings` instead of `incident_reports LEFT JOIN incident_embeddings`
  - Uses `case_id` as the foreign key
  - Inserts into `medical_embeddings` with `case_id` instead of `incident_id`
- Call `_embed_and_store_medical_sync()` in `run_ingest_pipeline()` after the existing `_embed_and_store_sync()` call.
- Add a `medical_chunks_embedded` key to the `summary` dict returned by `run_ingest_pipeline()`.
- Verify with a `GET /docs` or direct DB query that `medical_embeddings` is populated after a full ingest.

---

### T3-14: Add per-tool asyncio timeout using asyncio.wait_for in orchestrator [DONE]

**Priority**: Low
**Effort**: S
**Dependencies**: none

**Rationale**:
`orchestrator.py` defines `TOOL_TIMEOUT_SECONDS = 30` and passes it to `VectorSearchTool.__init__()`.
The signal-based `_timeout()` context manager in `vector_tool.py` enforces this timeout on Unix but
is a no-op on Windows (line 43: `if platform.system() != "Windows": ... else: yield`).

More critically, the async `run_async()` methods on all tools have **no timeout enforcement at all**.
`_run_vector_step_async()` in `orchestrator.py` simply awaits `self._vector_tool.run_async(...)` with
no `asyncio.wait_for()` wrapper. If pgvector or the embedding model hangs, the async path has no
timeout — the request will hang indefinitely until the Render 30-second HTTP timeout kills it.

**Implementation**:
- In `orchestrator.py`, wrap each tool `await` call with `asyncio.wait_for(..., timeout=self.tool_timeout_seconds)`:
  ```python
  vec_result = await asyncio.wait_for(
      self._vector_tool.run_async(...),
      timeout=self.tool_timeout_seconds,
  )
  ```
- Do this for both the parallel `asyncio.gather(...)` path (wrap each coroutine before passing to gather) and the sequential per-step loop.
- Handle `asyncio.TimeoutError` specifically — log it at WARNING level with `tool_name` and `timeout_seconds`, then treat the step as an error (same path as the existing `except Exception` handler). Do not re-raise — the agent should continue with remaining steps and produce a partial answer.
- Remove the signal-based `_timeout()` context manager from `vector_tool.py` `run()` (sync path) once the async path has proper timeout — the sync path is only used in `run_sync()` which is a fallback.

---

### T3-15: Show_progress_bar=True suppressed — add to ingest pipeline and server embedding calls [DONE]

**Priority**: Low
**Effort**: XS
**Dependencies**: none

**Rationale**:
`embeddings.py` line 77: `show_progress_bar=len(texts) > 500`. On the Render server, this emits tqdm
progress bars to stderr for batches >500 texts. tqdm writes ANSI escape codes to stderr even when
stderr is not a TTY, adding noise to the Render log stream and making log parsing harder.

**Implementation**:
- Change `embeddings.py` line 77 to: `show_progress_bar=len(texts) > 500 and sys.stderr.isatty()`. This suppresses the progress bar in server contexts (where stderr is a pipe, not a TTY) while preserving it for local CLI/dev use.
- Add `import sys` to `embeddings.py` if not already present (it is not).
- This is a one-line change with zero functional impact.

---

## Parallel Work Waves

**Wave 1 (no blockers — start immediately):**
T3-01, T3-02, T3-03, T3-05, T3-06, T3-07, T3-08, T3-09, T3-10, T3-11, T3-13, T3-14, T3-15

**Wave 2 (blocked by Wave 1):**
T3-04 (blocked by T3-01 for safe cache deserialization), T3-12 (benefits from T3-01 for retry test)

---

## Priority Summary

| Task | Priority | Effort | Impact |
|---|---|---|---|
| T3-01 | High | M | Prevents silent claim degradation on malformed LLM output |
| T3-02 | High | M | Token cost visibility + per-stage latency for diagnosis |
| T3-03 | High | L | BM25+vector hybrid — improves keyword query recall significantly |
| T3-04 | High | M | Eliminates redundant agent loops for repeated example queries |
| T3-05 | Medium | S | Removes string serialization overhead on every vector search |
| T3-06 | Medium | S | Reduces duplicate evidence in synthesis, improves answer breadth |
| T3-07 | Medium | S | Conflict signal now reaches verifier; fallback confidence ranked |
| T3-08 | Medium | S | Fixes blocking sync call in async GET /runs/{run_id} handler |
| T3-09 | Medium | M | Graph expansion no longer occupies thread via run_sync |
| T3-10 | Medium | S | Transient API errors retry before falling back to degraded answer |
| T3-11 | Medium | M | Citation char offsets are correct; sentence-boundary chunking |
| T3-12 | Medium | M | Async orchestrator path has integration test coverage |
| T3-13 | Medium | M | Medical domain queries return results (currently zero hits) |
| T3-14 | Low | S | Async tool hangs are time-bounded on all platforms |
| T3-15 | Low | XS | Removes tqdm ANSI noise from Render server logs |
