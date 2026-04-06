# NextAgentAI — Session Log

---

## 2026-04-05 (evening) — Local Dev Setup & Bug Fixes

### Context
Setting up local non-Docker backend on `feature/lightrag-integration`. Port 5432 occupied by `nextgenstock-db` (another project).

### Issues resolved

| # | Error | Fix |
|---|-------|-----|
| 1 | `NoSuchModuleError: sqlalchemy.dialects:driver` in alembic | Added `load_dotenv` to `migrations/env.py`; cleared stale `.pyc` cache |
| 2 | Port 5432 conflict with `nextgenstock-db` | Started `nextai-db` container on port **5433**; created `docker-compose.override.yml` |
| 3 | Migration 0005 `InvalidRequestError: isolation_level may not be altered` | Replaced broken `connection.execution_options(AUTOCOMMIT)` with `op.execute("COMMIT")` before each `CREATE INDEX CONCURRENTLY` |
| 4 | `ModuleNotFoundError: No module named 'backend.app'` from uvicorn | Added `sys.path` bootstrap to `main.py`; both `app.main:app` (from `backend/`) and `backend.app.main:app` (from repo root) now work |
| 5 | `ANTHROPIC_API_KEY` not found at runtime | Added `load_dotenv(repo_root / ".env")` to `main.py` — all vars auto-loaded on startup |
| 6 | Obsidian graph blank — LightRAG reads wrong dir | Fixed `BASE_DIR` default in `rag_instance.py` to derive path from `__file__` location (`<repo_root>/data/lightrag/`) |

### Files modified
- `README.md` — Option B venv startup guide
- `backend/app/main.py` — sys.path + dotenv bootstrap
- `backend/app/db/migrations/env.py` — dotenv auto-load
- `backend/app/db/migrations/versions/0005_wave3_indexes.py` — COMMIT-before-CONCURRENTLY fix
- `backend/app/lightrag_service/rag_instance.py` — file-relative BASE_DIR default
- `docker-compose.override.yml` — port 5433 remap (new file)

### End state
- Migrations at head (`0006_add_user_id`) ✓
- LightRAG: 1000 aircraft docs accessible at `data/lightrag/aircraft/` ✓
- Backend auto-loads `.env` on startup — no manual exports needed ✓
- `.env` still has port 5432 — user must update to 5433 manually

---

## 2026-04-05 — Performance + Obsidian Graph Preload

### Performance Analysis
Ran `/analysis:performance-bottlenecks` against the full codebase. Found 8 bottlenecks:

| ID | Area | Severity |
|----|------|----------|
| B1 | `SELECT *` in LightRAG indexer (loads embedding bytea + all columns) | Medium |
| B2 | Graph BFS runs in sync executor | Low-Medium |
| B3 | BM25 + vector sequential inside hybrid_search executor | Medium |
| B4 | No HTTP cache on analytics endpoints | Low |
| B5 | LightRAG status polling at 3 s | Low |
| B6 | LRU cache only on single-string embedding (not batch) | Low |
| B7 | `reactStrictMode: true` causes double-invoke in dev profiling | Dev-only |
| B8 | 24 console statements in production frontend | Minor |

**Fixed:** B1, B4, B5, B8. B2 + B3 deferred (architectural changes).

### Files Changed

**Backend:**
- `backend/app/lightrag_service/indexer.py` — explicit SELECT columns (B1)
- `backend/app/api/analytics.py` — Cache-Control headers on 3 endpoints (B4); import `Response`
- `backend/app/api/graph_data.py` — NEW: `GET /graph/preloaded/{domain}` endpoint
- `backend/app/main.py` — registered `graph_data.router`; auto-load `.env` via python-dotenv

**Frontend:**
- `frontend/next.config.ts` — `compiler.removeConsole` for prod builds (B8)
- `frontend/app/lightrag/page.tsx` — poll interval 3 s → 5 s (B5)
- `frontend/app/lib/api.ts` — added `getPreloadedGraph(domain)`
- `frontend/app/obsidian-graph/useGraphData.ts` — PG preload fallback + auto-index trigger + polling upgrade
- `frontend/app/obsidian-graph/ObsidianGraph.tsx` — `indexingDomains` indicator; simplified BUILD INDEX buttons

### Test Results
```
577 passed, 5 skipped, 0 failed  (713 s)
```
All waves (1–5) green. New `graph_data` endpoint covered by import/route smoke tests.

### Key Decisions
- Obsidian graph uses PG `graph_node`/`graph_edge` as immediate fallback — no blank screen on Render cold start
- Domain inference for PG nodes: chunk nodes join to `incident_embeddings` or `medical_embeddings` via `properties->>'embed_id'`
- Auto-index trigger: fire-and-forget via existing `POST /lightrag/index/{domain}`; polling in `useGraphData` handles upgrade
- Polling uses `setTimeout` (not `setInterval`) to avoid overlapping ticks

---

## 2026-04-02 — Wave 5 LightRAG Integration (prior session)

- Built `backend/app/lightrag_service/` (rag_instance, indexer, demo_indexer, graph_exporter)
- 6 LightRAG API endpoints at `/lightrag/*`
- Frontend: `/lightrag` page + `LightRAGGraphViewer.tsx` (dynamic ssr:false)
- LIGHTRAG nav item in AppHeader
- 22 new tests in `test_lightrag_service.py`
- Auto-indexing on startup via `_auto_index_lightrag()` in lifespan
- Branch: `feature/lightrag-integration` (pending merge)
