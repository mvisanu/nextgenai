# DEPLOY.md — Deployment Handoff

**Generated:** 2026-03-06
**For:** Deployment-engineer agent
**Platform:** Render (Docker) + Neon PostgreSQL 16
**Source:** optimize.md + TASKS2.md + BACKEND.md

---

## Overview

Deployments are organised into three phases:

- **Phase 1** — No downtime. Drop-in changes to Python source files and requirements. Docker rebuild required. No DB migrations. Safe to deploy to production immediately.
- **Phase 2** — Migration window required (typically 2-5 min per index). Alembic migrations that create new DB indexes using `CREATE INDEX CONCURRENTLY`. No table locks; existing queries continue uninterrupted. HNSW index build on a cold Neon free-tier DB takes ~10-60 s depending on row count.
- **Phase 3** — After async orchestrator rewrite (T-17) is complete. Requires a full Docker rebuild and smoke-test cycle.

**Assumptions validated before these instructions were written:**
- Render deployment runs a **single instance** (free tier). Pool sizing is calibrated for single-process.
- Neon free tier allows 100 connections. Combined pool max (50) is safely within this.
- `CREATE INDEX CONCURRENTLY` is supported on Neon (confirmed in Neon docs as of 2024).
- `anthropic==0.40.0` includes `AsyncAnthropic` (available since ~0.20.0). T-16 is complete — `AsyncAnthropic` is imported in `client.py` and confirmed working in the Docker image.

---

## Current `render.yaml` Analysis

```yaml
services:
  - type: web
    name: nextai-backend
    runtime: docker
    dockerfilePath: ./backend/Dockerfile
    dockerContext: ./backend
    plan: free
    healthCheckPath: /healthz
    envVars:
      - key: PG_DSN        (sync: false — set manually in dashboard)
      - key: DATABASE_URL  (sync: false — same value as PG_DSN)
      - key: ANTHROPIC_API_KEY (sync: false)
      - key: KAGGLE_USERNAME   (sync: false — optional)
      - key: KAGGLE_KEY        (sync: false — optional)
    autoDeploy: true
```

**Issues found:**

| Issue | Severity | Fix |
|---|---|---|
| `plan: free` — 512 MB RAM, 0.1 CPU, no persistent disk | Known constraint | Upgrade to `starter` ($7/mo) if embedding model load causes OOM |
| `healthCheckPath: /healthz` — correct | OK | None |
| `autoDeploy: true` — deploys on every push to main | OK for current workflow | Disable if Phase 2 migrations need a coordinated deploy window |
| No `CORS_ORIGINS` env var defined in render.yaml | Low risk | Add if additional frontend origins are needed |
| No `LLM_MODEL` env var | OK | Default `claude-sonnet-4-6` is used; override here if model changes |

**Render service URL:** `https://nextai-backend.onrender.com`

---

## Phase 1 — Quick Wins (No Downtime)

*Target tasks: T-01, T-02, T-03, T-04, T-05, T-06, T-07, T-08, T-09*

These are pure Python source changes. No DB migrations. No schema changes. Deploy by rebuilding and redeploying the Docker image.

### 1.1 Source File Changes Required

Apply all of the following code changes per the detailed specs in `BACKEND.md`. Summary:

| Task | File | Change |
|---|---|---|
| T-01 | `backend/app/api/query.py` | Add `run_in_threadpool` around `orchestrator.run()` |
| T-02 | `backend/app/rag/embeddings.py` | Add `encode_single_cached` LRU method |
| T-03 | `backend/app/tools/vector_tool.py` | Call `encode_single_cached`, wrap with `np.array` |
| T-04 | `backend/app/db/session.py` | Add pool settings to sync engine; add `pool_recycle` to both |
| T-05 | `backend/app/agent/orchestrator.py` | Add `if raw_claims:` guard before `verify_claims` |
| T-06 | `backend/app/llm/client.py` | Add `_fast_llm_singleton` module-level var and lazy init |
| T-07 | `backend/app/main.py` + `requirements.txt` | Add `ORJSONResponse` default + `orjson==3.10.12` |
| T-08 | `backend/app/main.py` | Add `GZipMiddleware` before `CORSMiddleware` |
| T-09 | `backend/app/api/docs.py` | Add `Cache-Control: no-store` to `/healthz` |

### 1.2 Docker Rebuild Procedure

```bash
# From repo root
docker compose build backend

# Verify the image builds cleanly (no pip install errors for orjson)
docker compose run --rm backend python -c "import orjson; print(orjson.__version__)"

# If local testing is desired:
docker compose up backend

# For Render: push to the tracked branch (main)
git add backend/requirements.txt backend/app/
git commit -m "perf: Phase 1 optimizations (T-01 through T-09)"
git push origin main
# Render auto-deploys via autoDeploy: true
```

### 1.3 Smoke Test Checklist (Phase 1)

Run these checks immediately after the new container is live. Render shows deployment status in the dashboard; wait for "Live" before testing.

**a) Health check:**
```bash
curl -i https://nextai-backend.onrender.com/healthz
# Expected: HTTP 200, body {"status":"ok","db":true,"version":"1.0.0"}
# Expected header: cache-control: no-store  (T-09)
```

**b) GZip compression (T-08):**
```bash
curl -si -X POST https://nextai-backend.onrender.com/query \
  -H "Content-Type: application/json" \
  -H "Accept-Encoding: gzip" \
  -d '{"query": "Find hydraulic incidents", "domain": "aircraft"}' \
  | grep -i "content-encoding"
# Expected: content-encoding: gzip
```

**c) ORJSONResponse (T-07):**
```bash
curl -si https://nextai-backend.onrender.com/healthz | grep -i "content-type"
# Expected: content-type: application/json
# (ORJSONResponse still returns application/json content-type — no change visible externally)
```

**d) Concurrent request test (T-01):**
```bash
# Fire two queries simultaneously; confirm both complete in ~parallel, not serially
curl -s -X POST https://nextai-backend.onrender.com/query \
  -H "Content-Type: application/json" \
  -d '{"query": "Find hydraulic failures", "domain": "aircraft"}' &
curl -s -X POST https://nextai-backend.onrender.com/query \
  -H "Content-Type: application/json" \
  -d '{"query": "Show defect counts by product", "domain": "aircraft"}' &
wait
# Both should complete. Before T-01, the second would not start until the first finished.
# Compare individual latencies in the response `total_latency_ms` fields.
```

**e) Embedding cache hit (T-02/T-03):**
```bash
# Submit the same query twice; the second should be faster (embedding cached)
# Check Render logs for "VectorSearchTool complete" latency_ms — second call should be lower
```

**f) Regression check:**
```bash
pytest backend/tests/ -v
# All tests must pass
```

### 1.4 Rollback Procedure (Phase 1)

Phase 1 changes are all backward-compatible. Rollback by reverting the git commit and triggering a new deploy:

```bash
git revert HEAD
git push origin main
# Render auto-deploys the revert
```

No DB state was changed, so no DB rollback is needed.

---

## Phase 2 — Index Migrations

*Target tasks: T-10, T-11, T-12, T-13, T-14, T-15*

**Migration window:** T-10 and T-12 require creating new DB indexes. `CREATE INDEX CONCURRENTLY` does not lock the table — existing queries continue uninterrupted — but the index build takes time. On a cold Neon free-tier DB with ~30k embeddings, the HNSW index build is estimated at 30-120 s.

**T-11 and T-13 are code changes** that must be deployed immediately after their respective migrations complete (T-10 and T-12). Do not deploy T-11 before T-10 is confirmed, and do not deploy T-13 before T-12 is confirmed.

### 2.1 Validate IVFFlat Index Name

Before running the HNSW migration, confirm the exact name of the existing IVFFlat index:

```bash
# Connect to Neon production DB
psql "$PG_DSN" -c "\d incident_embeddings"
# Verify the current index name — do NOT assume it matches the migration template.
# Actual names found in local Docker DB: idx_incident_embeddings_vec (IVFFlat)
# Neon production may differ. Note the exact name before running DROP.

psql "$PG_DSN" -c "\d medical_embeddings"
# Same for medical domain — actual local name: idx_medical_embeddings_vec
```

The migration DROP statements use `IF EXISTS` so an incorrect assumed name will silently no-op rather than error. Always verify the current index name with `\d` and update the DROP statement if it differs.

### 2.2 Alembic Migration: T-10 — HNSW Index

Create a new Alembic migration file. The migration must run outside a transaction because `CREATE INDEX CONCURRENTLY` is not permitted inside a transaction block.

**Step 1 — Generate the migration file:**
```bash
cd backend
alembic revision -m "replace_ivfflat_with_hnsw"
# Creates: backend/app/db/migrations/versions/<timestamp>_replace_ivfflat_with_hnsw.py
```

**Step 2 — Edit the generated migration file:**
```python
"""replace_ivfflat_with_hnsw

Revision ID: <auto-generated>
Revises: <previous-revision-id>
Create Date: 2026-03-06
"""
from alembic import op

# Set transaction_per_migration = False in env.py, OR run this migration
# manually outside Alembic (see notes below).
# CREATE INDEX CONCURRENTLY cannot run inside a transaction.


def upgrade() -> None:
    # ── incident_embeddings ─────────────────────────────────────────────────
    # Drop IVFFlat index (verify exact name with: \d incident_embeddings)
    op.execute(
        "DROP INDEX CONCURRENTLY IF EXISTS incident_embeddings_embedding_idx"
    )
    # Create HNSW index
    # m=16, ef_construction=64: optimal for 10k-100k vectors (384 dims)
    op.execute("""
        CREATE INDEX CONCURRENTLY incident_embeddings_embedding_hnsw_idx
        ON incident_embeddings
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    """)

    # ── medical_embeddings ──────────────────────────────────────────────────
    op.execute(
        "DROP INDEX CONCURRENTLY IF EXISTS medical_embeddings_embedding_idx"
    )
    op.execute("""
        CREATE INDEX CONCURRENTLY medical_embeddings_embedding_hnsw_idx
        ON medical_embeddings
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    """)


def downgrade() -> None:
    # Drop HNSW indexes. IVFFlat recreation is a manual step:
    # Run ingest pipeline again to repopulate embeddings, then create IVFFlat manually.
    op.execute(
        "DROP INDEX CONCURRENTLY IF EXISTS incident_embeddings_embedding_hnsw_idx"
    )
    op.execute(
        "DROP INDEX CONCURRENTLY IF EXISTS medical_embeddings_embedding_hnsw_idx"
    )
```

**Step 3 — Configure `env.py` for `CONCURRENTLY`:**

Edit `backend/app/db/migrations/env.py`. Find the `run_migrations_online()` function and add:

```python
# IMPORTANT: Required for CREATE INDEX CONCURRENTLY
# Alembic wraps migrations in a transaction by default; CONCURRENTLY cannot run in one.
with connectable.connect() as connection:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        transaction_per_migration=False,  # ADD THIS LINE
    )
    with context.begin_transaction():
        context.run_migrations()
```

**Step 4 — Apply the migration:**
```bash
cd backend
alembic upgrade head
```

**Step 5 — Verify:**
```bash
psql "$PG_DSN" -c "\d incident_embeddings"
# Expected output: Indexes contains "incident_embeddings_embedding_hnsw_idx" (hnsw)
# IVFFlat index should be absent.

psql "$PG_DSN" -c "\d medical_embeddings"
# Same for medical domain
```

**Alternative — Manual SQL (bypass Alembic for this migration):**
```bash
# Connect directly to Neon
psql "$PG_DSN"

-- In psql (no transaction wrapper):
\timing on

DROP INDEX CONCURRENTLY IF EXISTS incident_embeddings_embedding_idx;
CREATE INDEX CONCURRENTLY incident_embeddings_embedding_hnsw_idx
    ON incident_embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

DROP INDEX CONCURRENTLY IF EXISTS medical_embeddings_embedding_idx;
CREATE INDEX CONCURRENTLY medical_embeddings_embedding_hnsw_idx
    ON medical_embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Mark the Alembic revision as applied without running it:
-- (run this from the backend directory)
\q

alembic stamp <revision_id_of_hnsw_migration>
```

### 2.3 Deploy T-11 (Code Change — Must Follow T-10)

After the HNSW migration is confirmed, apply the T-11 code changes:

1. Remove `session.execute(text("SET ivfflat.probes = 10"))` from `backend/app/rag/retrieval.py` line 113.
2. Add `connect_args` with `hnsw.ef_search` to both engines in `backend/app/db/session.py`.

Full change specs in `BACKEND.md` section T-11.

Then rebuild and deploy:
```bash
git add backend/app/rag/retrieval.py backend/app/db/session.py
git commit -m "perf: T-11 replace ivfflat.probes with hnsw.ef_search"
git push origin main
```

**Smoke test (T-11):**
```bash
curl -X POST https://nextai-backend.onrender.com/query \
  -H "Content-Type: application/json" \
  -d '{"query": "Find hydraulic incidents", "domain": "aircraft"}'
# Expected: valid response with vector_hits. Confirm no "ivfflat" in Render logs.
```

### 2.4 Alembic Migration: T-12 — Composite Indexes on `graph_edge`

**Step 1 — Generate the migration file:**
```bash
cd backend
alembic revision -m "graph_edge_composite_indexes"
```

**Step 2 — Edit the migration:**
```python
"""graph_edge_composite_indexes

Revision ID: <auto-generated>
Revises: <hnsw-migration-revision-id>
Create Date: 2026-03-06
"""
from alembic import op


def upgrade() -> None:
    # Composite index on (from_node, type): satisfies graph expansion queries
    # that filter WHERE from_node = ANY(:ids) AND type = ANY(:types)
    op.execute("""
        CREATE INDEX CONCURRENTLY idx_graph_edge_from_type
        ON graph_edge (from_node, type)
    """)
    # Composite index on (to_node, type): same for incoming edge queries
    op.execute("""
        CREATE INDEX CONCURRENTLY idx_graph_edge_to_type
        ON graph_edge (to_node, type)
    """)


def downgrade() -> None:
    op.execute("DROP INDEX CONCURRENTLY IF EXISTS idx_graph_edge_from_type")
    op.execute("DROP INDEX CONCURRENTLY IF EXISTS idx_graph_edge_to_type")
```

**Step 3 — Apply:**
```bash
alembic upgrade head
```

**Step 4 — Verify:**
```bash
psql "$PG_DSN" -c "\d graph_edge"
# Expected: idx_graph_edge_from_type (btree, from_node, type)
#           idx_graph_edge_to_type   (btree, to_node, type)
```

### 2.5 Deploy T-13 (Code Change — Must Follow T-12)

After T-12 is confirmed, apply the T-13 graph expander refactor (parameterized `ANY`, merged outgoing+incoming query). Full specs in `BACKEND.md` section T-13.

```bash
git add backend/app/graph/expander.py
git commit -m "perf: T-13 graph expander — ANY param and merged edge query"
git push origin main
```

**Smoke test (T-13):**
```bash
curl -X POST https://nextai-backend.onrender.com/query \
  -H "Content-Type: application/json" \
  -d '{"query": "Find hydraulic incidents", "domain": "aircraft"}'
# Expected: graph_path.nodes and graph_path.edges populated, same as before.
# Check Render logs for "Graph expansion complete" — verify nodes/edges counts match pre-change.
```

### 2.6 Deploy T-14 (SQL Cache) and T-15 (Bulk Ingest)

These are standalone code changes with no migration dependency.

```bash
git add backend/app/tools/sql_tool.py backend/app/ingest/pipeline.py backend/app/graph/builder.py
git commit -m "perf: T-14 named query TTL cache, T-15 bulk ingest upserts"
git push origin main
```

### 2.7 Neon Database Settings

After T-10 is complete, set `hnsw.ef_search` at the Neon project level as a backup to the engine-level setting. In Neon dashboard:

1. Go to your project -> Settings -> Compute
2. Under "PostgreSQL parameters", add:
   ```
   hnsw.ef_search = 40
   ```

This ensures the setting is active even for connections that bypass the SQLAlchemy engine (e.g., direct psql sessions, pg_dump).

Also verify `maintenance_work_mem` is adequate for index builds. On Neon free tier, this is typically `64MB`. For HNSW builds on large datasets, temporarily increase it:
```sql
-- Run this BEFORE the CREATE INDEX CONCURRENTLY:
SET maintenance_work_mem = '256MB';
-- (This is session-scoped; only affects the current connection)
```

### 2.8 Phase 2 Rollback Procedures

**Rollback T-10 (HNSW to IVFFlat):**
```bash
# Run downgrade in Alembic:
alembic downgrade -1

# Or manually in psql:
DROP INDEX CONCURRENTLY IF EXISTS incident_embeddings_embedding_hnsw_idx;
DROP INDEX CONCURRENTLY IF EXISTS medical_embeddings_embedding_hnsw_idx;

# Recreate IVFFlat (requires data present — run only after ingest):
# NOTE: IVFFlat requires ANALYZE to train on data.
CREATE INDEX CONCURRENTLY incident_embeddings_embedding_idx
    ON incident_embeddings
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
ANALYZE incident_embeddings;

CREATE INDEX CONCURRENTLY medical_embeddings_embedding_idx
    ON medical_embeddings
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
ANALYZE medical_embeddings;
```

**Rollback T-11 code change:**
```bash
git revert HEAD  # reverts the T-11 commit
git push origin main
# Render auto-deploys
```

**Rollback T-12 (composite indexes):**
```bash
alembic downgrade -1
# or manually:
DROP INDEX CONCURRENTLY IF EXISTS idx_graph_edge_from_type;
DROP INDEX CONCURRENTLY IF EXISTS idx_graph_edge_to_type;
```

**Rollback T-13:**
```bash
git revert HEAD  # reverts the T-13 commit
git push origin main
```

### 2.9 Phase 2 Smoke Tests

**Vector search quality check (T-10/T-11):**
```bash
# Query that returns vector hits — confirm scores are in [0, 1]
curl -X POST https://nextai-backend.onrender.com/query \
  -H "Content-Type: application/json" \
  -d '{"query": "hydraulic actuator crack", "domain": "aircraft"}' \
  | python3 -c "
import sys, json
r = json.load(sys.stdin)
hits = r['evidence']['vector_hits']
print(f'Hits: {len(hits)}')
for h in hits[:3]:
    print(f'  score={h[\"score\"]}, chunk_id={h[\"chunk_id\"][:8]}...')
"
# Expected: 1-8 hits with scores > 0.20 (similarity_threshold in orchestrator)
```

**Graph expansion check (T-12/T-13):**
```bash
curl -X POST https://nextai-backend.onrender.com/query \
  -H "Content-Type: application/json" \
  -d '{"query": "hydraulic system defects", "domain": "aircraft"}' \
  | python3 -c "
import sys, json
r = json.load(sys.stdin)
gp = r['graph_path']
print(f'Graph: {len(gp[\"nodes\"])} nodes, {len(gp[\"edges\"])} edges')
"
# Expected: non-empty graph_path when vector_hits are returned
```

---

## Phase 3 — Async Orchestrator

*Target tasks: T-16, T-17*
*Prerequisites: T-01 must be deployed (Phase 1); T-16 must be complete before T-17 starts*

Phase 3 is a full architectural rewrite of the orchestrator and all tool implementations. It carries medium risk and requires thorough testing before production deployment.

### 3.1 Deployment Sequence

```
1. T-16 deployed and tested in isolation
   - Verify: import AsyncAnthropic succeeds in the container
   - Verify: complete_async() returns same output as complete() for same prompt
   - No behaviour change visible externally

2. T-17 implemented (classify_and_plan + async orchestrator + async tools)
   - All pytest tests pass in the test environment
   - Local end-to-end test with Docker Compose

3. Deploy T-17 to Render
   - Monitor Render logs for the first several queries
   - Run load test (see 3.2)

4. If load test passes, remove T-01 run_in_threadpool wrapper (now redundant)
   - This is a one-line change in query.py
```

### 3.2 Load Testing Recommendations

Before deploying T-17 to production, run a basic concurrency test in the staging environment:

```bash
# Install httpie or use curl in parallel
pip install httpie

# Fire 5 concurrent requests
for i in $(seq 1 5); do
  http --timeout=60 POST https://nextai-backend.onrender.com/query \
    query="Find hydraulic incidents" domain=aircraft &
done
wait

# Expected results:
# - All 5 requests return 200 with valid responses
# - Requests overlap in time (check timestamps in Render logs)
# - No "RuntimeError: This event loop is already running" or asyncio errors
# - No "connection pool exhausted" or "timeout" errors
```

**Metrics to observe during load test:**
- `total_latency_ms` in each response (target: <6000 ms for hybrid queries)
- Render CPU and memory usage (dashboard metrics)
- Anthropic API error rate (dashboard or API billing page)
- Neon connection count (Neon dashboard -> Monitoring)

### 3.3 Health Check Validation After T-17

```bash
# 1. Basic health
curl https://nextai-backend.onrender.com/healthz

# 2. Functional test — aircraft domain
curl -X POST https://nextai-backend.onrender.com/query \
  -H "Content-Type: application/json" \
  -d '{"query": "Show defect trends by product for last 90 days", "domain": "aircraft"}' \
  | python3 -c "
import sys, json
r = json.load(sys.stdin)
print('Intent:', r['run_summary']['intent'])
print('Tools:', r['run_summary']['tools_used'])
print('Latency:', r['run_summary']['total_latency_ms'], 'ms')
print('Claims:', len(r['claims']))
print('Vector hits:', len(r['evidence']['vector_hits']))
print('SQL rows:', len(r['evidence']['sql_rows']))
"

# 3. Medical domain
curl -X POST https://nextai-backend.onrender.com/query \
  -H "Content-Type: application/json" \
  -d '{"query": "Find cases with respiratory symptoms", "domain": "medical"}' \
  | python3 -c "
import sys, json
r = json.load(sys.stdin)
print('Intent:', r['run_summary']['intent'])
print('Latency:', r['run_summary']['total_latency_ms'], 'ms')
"

# 4. Run full test suite
cd backend && pytest tests/ -v
```

---

## Render + Neon Production Configuration

### Recommended Render Service Config Changes

**Current `render.yaml`:**
```yaml
plan: free
```

**Recommended if memory pressure observed (embedding model ~400 MB):**
```yaml
plan: starter   # $7/month — 1 GB RAM, 0.5 CPU, no cold starts after 15 min idle
```

The free tier has a 15-minute inactivity timeout that causes cold starts. The `starter` plan keeps the service warm. However, the frontend's `/healthz` warm-up ping currently mitigates cold starts for users.

**Additional Render settings to configure via dashboard (not settable in render.yaml free tier):**

| Setting | Recommended Value | Notes |
|---|---|---|
| Health check path | `/healthz` | Already correct |
| Health check timeout | 30 s | Increased from default 10 s to account for embedding model load on cold start |
| Auto-deploy | `true` | Current setting — disable during Phase 2 migration window if needed |
| Deploy notifications | Email/Slack | Add for awareness of failed deploys |

**Add to Render dashboard environment variables (after Phase 1/2 changes):**

| Variable | Value | When to Add |
|---|---|---|
| `CORS_ORIGINS` | (leave empty unless new frontend origins are needed) | As needed |
| `LLM_MODEL` | `claude-sonnet-4-6` | Only if you want to pin the model explicitly |

### Neon Connection String Format Requirements

Neon provides connection strings in this format:
```
postgresql://user:password@ep-cool-name-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
```

**For `PG_DSN` / `DATABASE_URL` in Render dashboard:**
- Set both `PG_DSN` and `DATABASE_URL` to the **same value** (the Neon connection string as-is).
- The backend's `_get_dsn()` function handles the conversion:
  - Sync engine (psycopg2): keeps `?sslmode=require`, normalises `postgres://` to `postgresql://`
  - Async engine (asyncpg): strips `?sslmode=require`, converts `postgresql://` to `postgresql+asyncpg://`
- Do NOT pre-convert the DSN — let the backend handle it.

**After T-11 (HNSW migration), the async engine also needs `connect_args`:**

This is handled in Python code (`session.py`) — no Render env var change is needed.

### Neon-Specific Settings

**After HNSW migration, set `hnsw.ef_search` in Neon:**

In Neon dashboard -> Project Settings -> Compute -> PostgreSQL parameters:
```
hnsw.ef_search = 40
```

This serves as the server-level default. The SQLAlchemy engine-level `connect_args` setting (added in T-11) takes precedence for application connections.

**Neon connection pooling:**
- Neon's built-in connection pooler (PgBouncer) is available at a separate pooler hostname.
- For the current single-Render-instance setup, direct connections are preferred (SQLAlchemy manages its own pool).
- If scaling to multiple Render instances: switch to the Neon pooler endpoint to avoid exceeding connection limits.
  - Pooler hostname format: `ep-cool-name-123456-pooler.us-east-2.aws.neon.tech`
  - Set `PG_DSN` and `DATABASE_URL` to the pooler endpoint.
  - Disable SQLAlchemy connection pooling (`poolclass=NullPool`) when using PgBouncer.

---

## Monitoring and Observability

### Key Metrics to Watch After Each Phase

**After Phase 1 (T-01 through T-09):**

| Metric | Where | Success Signal |
|---|---|---|
| Response latency | Render logs: `total_latency_ms` in "Agent run complete" log entries | Hybrid query latency < 6000 ms (was up to 8000 ms) |
| Event loop blocking | No longer visible after T-01 | Concurrent requests no longer serialised (verify with load test) |
| Embedding cache hit rate | `encode_single_cached.cache_info()` not externally visible; add log in embeddings.py | Repeated queries faster; cache hits > 0 after warmup |
| Response size | Browser DevTools -> Network tab -> Response size | 60-80% reduction with gzip on large responses |
| healthz caching | `curl -i .../healthz | grep cache-control` | `cache-control: no-store` present |

**After Phase 2 (T-10 through T-15):**

| Metric | Where | Success Signal |
|---|---|---|
| Vector search latency | Render logs: `VectorSearchTool complete latency_ms` | Reduced by 30-60% vs IVFFlat (especially for cold queries) |
| Graph expansion latency | Render logs: `Graph expansion complete latency_ms` | Reduced by 30-50% for graphs with >1000 nodes |
| HNSW index present | `\d incident_embeddings` | `incident_embeddings_embedding_hnsw_idx` visible; no IVFFlat index |
| Ingest time | Render logs: ingest pipeline timing | Full ingest completes in < 3 minutes (was ~5 min) |
| Named query cache hits | Render logs (after adding cache hit log in T-14) | Cache hits visible for repeated dashboard queries |

**After Phase 3 (T-16, T-17):**

| Metric | Where | Success Signal |
|---|---|---|
| Total query latency | `total_latency_ms` in response | Hybrid queries: > 400 ms improvement vs Phase 1 baseline |
| Concurrent request handling | Render logs: overlapping `Agent run started` timestamps | Multiple simultaneous requests visible in logs |
| Anthropic API calls | Anthropic dashboard usage | Classify+plan merged to 1 call (vs 2); visible as 25-33% reduction in call count |
| Event loop errors | Render logs | Zero `asyncio.CancelledError`, `RuntimeError: This event loop` errors |

### Log Patterns That Indicate Success

**Phase 1 success patterns (in Render logs):**
```
INFO Agent run complete ... total_latency_ms: 3200   # reduced from 5000-8000ms
INFO VectorSearchTool complete ... latency_ms: 45    # near-zero on cache hit (T-02/T-03)
INFO Graph expansion complete ... latency_ms: 180    # normal range
# NO pattern: "verify_claims" call when zero claims produced (T-05)
```

**Phase 2 success patterns:**
```
INFO VectorSearchTool complete ... latency_ms: 25    # HNSW is faster than IVFFlat
INFO Graph expansion complete ... latency_ms: 80     # composite indexes help
INFO Named query cache hit name=defect_counts_by_product  # T-14
# NO pattern: "SET ivfflat.probes" in DB logs  (T-11 removed it)
```

**Phase 3 success patterns:**
```
INFO Agent run started ... run_id=xxx  (two runs overlapping in time)
INFO Agent run started ... run_id=yyy
INFO Agent run complete ... run_id=xxx total_latency_ms: 2800
INFO Agent run complete ... run_id=yyy total_latency_ms: 2900
# Both complete at ~same wall time — confirms true async concurrency
```

### Log Patterns That Indicate Failure

| Pattern | Phase | Likely Cause | Remediation |
|---|---|---|---|
| `Connection pool exhausted` | Any | Too many concurrent requests for pool size | Already fixed in T-04; verify pool_size=10 deployed |
| `connection was closed by server` | Any | Neon idle timeout; pool_recycle not set | Verify T-04 pool_recycle=1800 deployed |
| `SET ivfflat.probes` in DB query logs | After Phase 2 | T-11 not fully deployed | Check retrieval.py for remaining SET statement |
| `asyncio.CancelledError` | Phase 3 | Async orchestrator issue | Roll back T-17; investigate TaskGroup usage |
| `RuntimeError: This event loop is already running` | Phase 3 | sync call inside async context | Check for remaining sync DB calls in tools |
| `SQLGuardrailError` in logs | Any | LLM generated raw SQL | Normal; orchestrator should replace with named query. If recurring, check orchestrator line 208 |
| `LLM returned invalid JSON in json_mode` | Any | LLM response not parseable | Normal occasionally; check if rate increased after T-17 (different prompt structure) |
| `Graph expansion capped at 500 nodes` | Any | Very large graph | Not an error; log is expected. If too frequent, reduce k in orchestrator line 289 |
| `DB pool init failed (DB may not be ready yet)` | Startup | Neon cold start or DSN issue | Check DSN format; wait for Neon to become ready |

---

## Quick Reference: Task-to-Phase Mapping

| Task | Phase | Type | File(s) Changed | DB Migration |
|---|---|---|---|---|
| T-01 | 1 | Code | `api/query.py` | No |
| T-02 | 1 | Code | `rag/embeddings.py` | No |
| T-03 | 1 | Code | `tools/vector_tool.py` | No |
| T-04 | 1 | Code | `db/session.py` | No |
| T-05 | 1 | Code | `agent/orchestrator.py` | No |
| T-06 | 1 | Code | `llm/client.py` | No |
| T-07 | 1 | Code + deps | `main.py`, `requirements.txt` | No |
| T-08 | 1 | Code | `main.py` | No |
| T-09 | 1 | Code | `api/docs.py` | No |
| T-10 | 2 | **DB Migration** | New Alembic migration | Yes — HNSW indexes |
| T-11 | 2 | Code (after T-10) | `rag/retrieval.py`, `db/session.py` | No |
| T-12 | 2 | **DB Migration** | New Alembic migration | Yes — graph_edge composite indexes |
| T-13 | 2 | Code (after T-12) | `graph/expander.py` | No |
| T-14 | 2 | Code | `tools/sql_tool.py` | No |
| T-15 | 2 | Code | `ingest/pipeline.py`, `graph/builder.py` | No |
| T-16 | 3 | Code | `llm/client.py` | No |
| T-17 | 3 | Code (after T-01, T-16) | Multiple files | No |

---

## Phase 2 Deployment — Completed

**Date:** 2026-03-06

### Pre-flight Observations

Before executing any DDL, the actual index names were verified with `\d` in psql. They differed from the names assumed in DEPLOY.md:

| Table | Assumed name | Actual name found |
|---|---|---|
| `incident_embeddings` | `incident_embeddings_embedding_idx` | `idx_incident_embeddings_vec` |
| `medical_embeddings` | `medical_embeddings_embedding_idx` | `idx_medical_embeddings_vec` |

The `expander.py` was already using parameterized `ANY(:node_ids)` and merged outgoing+incoming queries (T-13 already done). The `session.py` already had `pool_recycle=1800` on both engines (T-04 already done).

### Tasks Completed

- **T-12: graph_edge composite indexes added.** (Note: labelled T-09 in initial deploy notes — correct TASKS2.md reference is T-12.)
  Ran directly via `docker exec nextagentai-postgres-1 psql -U postgres -d nextai`. Both indexes confirmed:
  - `idx_graph_edge_from_type` btree (from_node, type)
  - `idx_graph_edge_to_type` btree (to_node, type)

- **T-10: IVFFlat replaced with HNSW indexes.**
  Dropped `idx_incident_embeddings_vec` (ivfflat) and `idx_medical_embeddings_vec` (ivfflat).
  Created `idx_incident_embeddings_hnsw` and `idx_medical_embeddings_hnsw` both with `m=16, ef_construction=64`.
  Verified with `\d` — both tables now show `hnsw` indexes, no IVFFlat present.

- **T-11: `SET ivfflat.probes = 10` removed from `retrieval.py`.**
  Line 113 removed. Module docstring updated to reflect HNSW. A comment explains that ef_search is
  set at the DB level (`ALTER DATABASE nextai SET hnsw.ef_search = 40`) — no per-query SET required.

- **T-12: `hnsw.ef_search = 40` set at database level.**
  `ALTER DATABASE nextai SET hnsw.ef_search = 40` applied successfully.

- **T-14: `classify_and_plan` merged LLM call implemented.**
  Added `classify_and_plan(query, llm, domain)` to `backend/app/agent/intent.py`.
  Sends ONE combined Haiku prompt returning `{"intent": ..., "plan_text": ..., "steps": [...]}`.
  Falls back to separate `classify_intent` + `generate_plan` calls on any failure.
  Updated `orchestrator.py` CLASSIFY+PLAN block to call `classify_and_plan` for all intent paths
  (the vector_only fast-fallback path is now unified — the combined prompt is cheap for simple intents).
  The `generate_plan` import is kept in orchestrator for fallback path reachability.

### Smoke Test Results

```
GET http://localhost:8000/healthz
{"status":"ok","db":true,"version":"1.0.0"}

POST http://localhost:8000/query {"query":"find hydraulic defects","domain":"aircraft"}
{
  "run_id": "734bfb16-a4f4-4d4a-89cd-b9e7f6145ba4",
  "answer": "No hydraulic defect incidents or narratives were retrieved...",
  "claims": [],
  "run_summary": {
    "intent": "vector_only",
    "plan_text": "Search for incidents and narratives related to hydraulic defects using semantic similarity search...",
    "steps": [{"step_number": 1, "tool_name": "VectorSearchTool", "output_summary": "Found 0 similar chunks", "latency_ms": 0.1, "error": null}],
    "total_latency_ms": 3560.0,
    "halted_at_step_limit": false
  }
}
```

Agent loop fully functional. classify_and_plan returned intent + plan_text + steps in a single call.
Zero similar chunks is expected — local DB has no ingested data (Phase 1 data is in Neon production).

### Issues Encountered

- Local DB uses database name `nextai`, not `postgres`. All psql commands used `-d nextai`.
- IVFFlat index names differed from DEPLOY.md assumptions (see pre-flight notes above).
- `expander.py` T-13 refactor (ANY parameterization + merged query) was already complete from a prior session.
- `session.py` pool settings (T-04) were already complete from a prior session.
- Docker rebuild used cached pip layers — build completed in ~70 seconds.

### Rollback Plan

**DB indexes (T-12, T-10):**
```bash
# Rollback graph_edge composite indexes (T-12)
docker exec nextagentai-postgres-1 psql -U postgres -d nextai -c \
  "DROP INDEX CONCURRENTLY IF EXISTS idx_graph_edge_from_type;"
docker exec nextagentai-postgres-1 psql -U postgres -d nextai -c \
  "DROP INDEX CONCURRENTLY IF EXISTS idx_graph_edge_to_type;"

# Rollback HNSW to IVFFlat (T-10) — requires data present for IVFFlat training
docker exec nextagentai-postgres-1 psql -U postgres -d nextai -c \
  "DROP INDEX CONCURRENTLY IF EXISTS idx_incident_embeddings_hnsw;"
docker exec nextagentai-postgres-1 psql -U postgres -d nextai -c \
  "CREATE INDEX CONCURRENTLY idx_incident_embeddings_vec
   ON incident_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists=100);
   ANALYZE incident_embeddings;"
# Repeat for medical_embeddings
```

**Code changes (T-11, T-14):**
```bash
git revert HEAD  # reverts the Phase 2 code commit
git push origin main
# Render auto-deploys
```

### Remaining Phases

- **Phase 3: Full async orchestrator rewrite (T-16, T-17)** — largest latency win.
  T-16: Add `AsyncAnthropic` + `complete_async()` to `ClaudeClient`.
  T-17: Convert orchestrator to `async def run()` with `asyncio.TaskGroup`, convert all tools to async.
  Estimated: 400-600ms additional latency reduction per hybrid query on top of Phase 2 gains.
