# NextAgentAI — Project Status

**Date:** 2026-04-05
**Branch:** `feature/lightrag-integration`
**Test suite:** 577 passed, 5 skipped, 0 failed

---

## Current State

| Layer | Status |
|-------|--------|
| Backend API | Stable — all endpoints public, no auth required |
| Frontend | Next.js 16 App Router, SCADA theme |
| LightRAG | Indexed locally (aircraft: 590KB, medical: 184KB); auto-indexes from DB on Render cold start |
| Obsidian Graph | Live — preloads from PG graph_node/graph_edge tables immediately; upgrades to LightRAG once indexed |
| Test suite | 577/577 (5 skipped are DB-dependent, expected) |

---

## Recently Completed (2026-04-05 session)

### Performance fixes
- **B1** — `SELECT *` → explicit column projections in `lightrag_service/indexer.py` (aircraft + medical + manufacturing)
- **B4** — `Cache-Control: public, max-age=60, stale-while-revalidate=30` on all 3 analytics endpoints
- **B5** — LightRAG status poll interval 3 s → 5 s
- **B8** — `compiler.removeConsole` in `next.config.ts` strips console.log/warn in production builds

### Obsidian Graph preload from DB
- New endpoint `GET /graph/preloaded/{domain}` — queries PostgreSQL `graph_node`/`graph_edge` tables with domain inference via embedding table join
- Registered as `graph_data.router` in `main.py`
- `getPreloadedGraph(domain)` added to `frontend/app/lib/api.ts`
- `useGraphData.ts` falls back to PG preloaded data when LightRAG is empty

### LightRAG auto-index on empty
- `useGraphData.ts`: auto-triggers `triggerLightRAGIndex` for any domain where LightRAG is `not_indexed` + `idle`
- Polls `/lightrag/status/{domain}` every 5 s while indexing; calls `fetchAll()` on completion to upgrade PG → LightRAG graph
- `indexingDomains: Set<string>` exposed from hook; amber pulsing indicator shown in `ObsidianGraph.tsx` stats overlay
- BUILD INDEX buttons no longer need manual `refetch()` — polling handles upgrade

### Infra
- `main.py` updated to auto-load `.env` from repo root via `python-dotenv`

---

## Pending / Deferred

| Item | Priority | Notes |
|------|----------|-------|
| Merge `feature/lightrag-integration` → `main` | High | Deploy to Render + Vercel |
| Wave 3 SQL migrations on Neon prod | High | GIN indexes + agent_runs composite index |
| `SUPABASE_JWT_SECRET` on Render | Medium | W4-028 operational |
| B2 — Async graph BFS (sync executor) | Low | Architectural; deferred |
| B3 — Parallel BM25 + vector inside hybrid_search | Low | Moderate effort |

---

## Architecture Quick Reference

- **Live frontend:** https://nextgenai-seven.vercel.app
- **Live API:** https://nextgenai-5bf8.onrender.com
- **Local frontend:** http://localhost:3005 (`npm run dev -- --webpack`)
- **Local API:** http://localhost:8000 (Docker or uvicorn)
- **Tests:** `cd backend && .venv/Scripts/python -m pytest tests/`
