# NextAgentAI — Project Status

**Date:** 2026-04-06 (updated)
**Branch:** `feature/lightrag-integration`
**Test suite:** 577 passed, 5 skipped, 0 failed

---

## Current State

| Layer | Status |
|-------|--------|
| Backend API | Redeploying on Render (triggered by cleanup commit `be8e19a`) |
| Frontend | Live — https://nextgenai-seven.vercel.app |
| LightRAG | NOT indexed on Render (ephemeral FS); auto-index disabled by default (`LIGHTRAG_AUTO_INDEX=false`) |
| Obsidian Graph | Loads PG preloaded data immediately; upgrades to LightRAG when manually triggered |
| Test suite | 577/577 (5 skipped are DB-dependent, expected) |

---

## Render Deploy Status

**OOM fix deployed** (`5fa1c06`, `be8e19a`):
- `LIGHTRAG_AUTO_INDEX` env var gates startup indexing — defaults to `false` (safe for 512 MB free tier)
- Sequential (not concurrent) domain indexing when enabled
- Three garbage files (`backend/0,+`, `backend/dict[str`, `backend/null),+`) removed from repo

**CORS errors seen in browser** — NOT a CORS config bug. Caused by Render returning 502 during:
1. OOM crash (pre-fix)
2. Active redeploy window (current — resolves in ~5 min)
3. Free-tier cold start after 15 min inactivity (permanent behavior)

**Verify backend is up:**
```bash
curl https://nextgenai-5bf8.onrender.com/healthz
# → {"status":"ok"}
```

---

## Completed This Session (2026-04-05/06)

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
| Merge `feature/lightrag-integration` → `main` | High | After Render deploy confirms stable |
| Wave 3 SQL migrations on Neon prod | Medium | GIN indexes + agent_runs composite — Neon already at head (0006) |
| `SUPABASE_JWT_SECRET` on Render | Medium | W4-028 operational task |
| Add `LIGHTRAG_AUTO_INDEX=false` to Render env vars | High | Prevents OOM crash on 512 MB Starter instance |
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
