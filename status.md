# NextAgentAI — Project Status

**Date:** 2026-04-25 (updated)
**Branch:** `feature/lightrag-integration`
**Test suite:** 577 passed, 5 skipped, 0 failed

---

## Current State

| Layer | Status |
|-------|--------|
| Backend API | Live — https://nextgenai-5bf8.onrender.com (`/healthz` → `db:true` after Neon upgrade) |
| Frontend | Live — https://nextgenai-seven.vercel.app |
| Neon Postgres | **Upgraded from free → paid plan** (free-tier compute quota was exhausted, blocking all DB calls) |
| LightRAG entity extraction | Switched Anthropic Haiku → **OpenAI `gpt-4o-mini`** (`LIGHTRAG_OPENAI_MODEL`); requires `OPENAI_API_KEY` on Render |
| LightRAG indexes | `aircraft` and `medical` previously had `entity_count=0, relation_count=0` (extraction failed under invalid Anthropic key); awaiting reindex with new OpenAI provider |
| Obsidian Graph | Aircraft renders from PG `graph_node`/`graph_edge` (600 nodes, 1320 edges); medical PG side empty until `build-graph` is run |
| Test suite | 577/577 (5 skipped are DB-dependent, expected) |

---

## Recent Outage and Recovery (2026-04-24/25)

**Symptoms reported**
- Vercel: `504: GATEWAY_TIMEOUT` `MIDDLEWARE_INVOCATION_TIMEOUT` on protected pages
- Render: `/healthz` → `{"status":"degraded","db":false}`; `GET /runs` → 500
- `/lightrag` page: empty graph
- `/obsidian-graph`: "medical index not built" banner

**Root causes**
1. **Neon free tier compute-hours quota exhausted** → Postgres refused all connections → Render entrypoint crash-looped at the DB-wait gate → `[entrypoint] ERROR: Database not ready after 30 attempts. Exiting.` → no port bound → frontend middleware that ultimately depends on backend timed out
2. **`ANTHROPIC_API_KEY` invalid on Render** → LightRAG entity-extraction silently failed during indexing for both domains (`entity_count: 0, relation_count: 0` with `index_job_status: "done"` — misleading because it tracks doc-insert only)
3. **Medical `graph_node` / `graph_edge` PG tables empty** — `build_graph(domain="medical")` had never been run on prod

**Fixes applied**
1. **Neon plan upgraded** (paid Launch tier) → DB resumed → Render entrypoint passed → backend live
2. **LightRAG LLM provider swapped to OpenAI** (`baa5537`) — `OPENAI_API_KEY` + `LIGHTRAG_OPENAI_MODEL` env vars, default `gpt-4o-mini`
3. **Graph builder rewritten for speed** (`4e50c34`) — batched executemany INSERTs, spaCy `nlp.pipe`, optional `--limit` for partial builds, plus `python -m src.cli build-graph` subcommand

**Verify backend is up:**
```bash
curl https://nextgenai-5bf8.onrender.com/healthz
# → {"status":"ok","db":true,"version":"1.0.0"}
```

---

## Completed This Session (2026-04-24/25)

### Outage recovery
- Diagnosed Vercel 504 + Render `db:false` as Neon free-tier compute-quota exhaustion
- Neon project upgraded → backend recovered

### LightRAG provider swap (`baa5537`)
- `_lightrag_llm_func` now uses OpenAI `AsyncOpenAI`; default model `gpt-4o-mini`
- New env vars: `OPENAI_API_KEY` (required), `LIGHTRAG_OPENAI_MODEL` (optional)
- `openai>=1.50.0` added to `backend/requirements.txt`
- Anthropic still drives synthesis (Sonnet) and classify/plan/verify (Haiku) — only LightRAG moved
- 22/22 LightRAG tests pass

### Graph builder perf overhaul (`4e50c34`)
- `build_graph()` accepts `limit: int | None` for partial builds
- All node/edge INSERTs now batched via SQLAlchemy `executemany` (500/flush)
- spaCy NER batched via `nlp.pipe(batch_size=64)`
- Single commit per phase; redundant `COUNT(*)` reads dropped
- New CLI: `python -m src.cli build-graph --domain {aircraft,medical} [--limit N]`
- Net: ~10–20× faster on remote Neon; full 1240-chunk medical build expected ~5–15 min

---

## Completed Previous Session (2026-04-05/06)

### Performance fixes
- **B1** — `SELECT *` → explicit columns in `lightrag_service/indexer.py`
- **B4** — `Cache-Control: public, max-age=60, stale-while-revalidate=30` on analytics endpoints
- **B5** — LightRAG status poll interval 3 s → 5 s
- **B8** — `compiler.removeConsole` in `next.config.ts` (prod builds only)

### Obsidian Graph preload from DB
- `GET /graph/preloaded/{domain}` — queries PG `graph_node`/`graph_edge` with embedding-table domain inference
- Frontend fallback: LightRAG empty → PG preloaded data → no blank screen

### LightRAG auto-index + polling
- `useGraphData.ts`: auto-triggers indexing when LightRAG is `not_indexed` + `idle`
- Polls every 5 s; upgrades graph from PG → LightRAG on completion
- Amber pulsing badge in `ObsidianGraph.tsx` during indexing

### Render OOM fix
- `LIGHTRAG_AUTO_INDEX=false` default — startup indexing disabled on free tier
- Sequential domain init when enabled (halves peak RAM)

---

## Pending / Deferred

| Item | Priority | Notes |
|------|----------|-------|
| Set `OPENAI_API_KEY` + `LIGHTRAG_OPENAI_MODEL` on Render | **High** | Required by new `_lightrag_llm_func`; without it indexing will raise `RuntimeError: requires OPENAI_API_KEY` |
| Wipe + reindex LightRAG (`aircraft`, `medical`) on Render | **High** | `rm -rf backend/data/lightrag/{aircraft,medical}/*` then `POST /lightrag/index/{domain}` — needed to populate `entity_count` / `relation_count` |
| Run `build-graph --domain medical` on Render shell | **High** | Populates PG `graph_node`/`graph_edge` for medical so `/obsidian-graph` draws medical half |
| Merge `feature/lightrag-integration` → `main` | High | After OpenAI reindex + medical graph build verified |
| Wave 3 SQL migrations on Neon prod | Medium | GIN indexes + agent_runs composite — Neon already at head (0006) |
| `SUPABASE_JWT_SECRET` on Render | Medium | W4-028 operational task |
| Vercel middleware timeout guard | Medium | Wrap `supabase.auth.getUser()` in `Promise.race` with ~3s timeout to prevent middleware-invocation 504s when Supabase is cold |
| B2 — Async graph BFS (sync executor) | Low | Architectural; deferred |
| B3 — Parallel BM25 + vector inside hybrid_search | Low | Moderate effort |

---

## Architecture Quick Reference

- **Live frontend:** https://nextgenai-seven.vercel.app
- **Live API:** https://nextgenai-5bf8.onrender.com
- **Local frontend:** http://localhost:3005 (`npm run dev -- --webpack`)
- **Local API:** http://localhost:8000 (Docker or uvicorn)
- **Tests:** `cd backend && .venv/Scripts/python -m pytest tests/`
- **Render branch:** `feature/lightrag-integration` (configured in Render dashboard)
