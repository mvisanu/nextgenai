# lightrag_prompt.md — NextAgentAI LightRAG Integration
# Knowledge Graph Explorer: Aircraft & Medical Domains

> **How to use this file:**
> Reference at the start of every Claude Code session: `@lightrag_prompt.md @CLAUDE.md`
> This is a self-contained implementation spec. Do not skip steps or reorder them.
> Complete each acceptance checklist before moving to the next phase.

---

## Non-Negotiables (Read Every Session)

1. **Never break existing functionality.** LightRAG runs alongside the existing agent pipeline — it does NOT replace it. Zero modifications to the existing GraphRAG, orchestrator, or vector retrieval.
2. **LightRAG uses its own file-based storage.** Do NOT store LightRAG data in `graph_node` / `graph_edge` tables. It gets its own working dirs at `backend/data/lightrag/{domain}/`.
3. **Reuse existing adapters.** Use `get_async_fast_llm_client()` (Haiku) for LightRAG's LLM, and the existing `EmbeddingModel` (all-MiniLM-L6-v2, 384 dims) for embeddings.
4. **Separate UI component.** Create `LightRAGGraphViewer.tsx` as a new file. Do NOT modify the existing `GraphViewer.tsx`.
5. **SCADA theme throughout.** Orbitron headers, Rajdhani body, JetBrains Mono for data. Dark background `#0a0e17`. CSS vars: `--col-cyan`, `--col-green`, `--col-amber`, `--col-red`, `--col-purple`.
6. **No `get_event_loop()`.** Always use `asyncio.get_running_loop()`. CI check: `grep -r "get_event_loop" backend/app/` must return zero results.
7. **Page height.** The `/lightrag` page outer div must use `style={{ height: "calc(100vh - 46px)" }}` — accounts for the 46px global AppHeader.
8. **Protected route.** Add `/lightrag` to `middleware.ts` protected routes list.
9. **Tests alongside every feature.** All 560 existing tests must still pass after implementation.
10. **`ExportModal` SSR constraint.** Always import via `dynamic(..., { ssr: false })` — never static import.

---

## Project Context (Quick Reference)

```
Stack:
  Frontend  → Next.js 16 App Router, TypeScript, Tailwind, SCADA theme
  Backend   → FastAPI, Python 3.11, SQLAlchemy 2 (async + sync), Alembic
  Database  → PostgreSQL 16 + pgvector (Neon prod / Docker local)
  Embeddings → all-MiniLM-L6-v2 (384 dims), HNSW cosine index
  LLM       → Sonnet 4.6 (synthesis), Haiku 4.5 (classify/plan/verify)
  Auth      → Supabase (@supabase/ssr)
  Deploy    → Vercel (frontend) + Render Docker (backend)

Live URLs:
  Frontend  → https://nextgenai-seven.vercel.app
  Backend   → https://nextgenai-5bf8.onrender.com

Key files to know:
  backend/app/rag/embeddings.py       → EmbeddingModel (reuse this)
  backend/app/llm/client.py           → get_async_fast_llm_client() (reuse this)
  backend/app/main.py                 → register new router here
  backend/app/schemas/models.py       → add Pydantic models here
  frontend/app/lib/api.ts             → add API functions here
  frontend/app/components/AppHeader.tsx → add LIGHTRAG nav item here
  frontend/middleware.ts              → add /lightrag to protected routes
```

---

## File Tree to Generate

```
backend/
  app/
    lightrag_service/
      __init__.py
      rag_instance.py        # singleton LightRAG instances per domain
      indexer.py             # DB rows → LightRAG text documents
      demo_indexer.py        # fallback: index demo markdown docs
      graph_exporter.py      # NetworkX graph → JSON for frontend
    api/
      lightrag.py            # NEW FastAPI router (6 endpoints)
  data/
    lightrag/
      aircraft/              # LightRAG working dir (gitignored)
      medical/               # LightRAG working dir (gitignored)
  tests/
    test_lightrag_service.py # new test file

demo/
  lightrag_docs/
    aircraft/
      ncr_001.md
      ncr_002.md
      ncr_003.md
      ncr_004.md
      ncr_005.md
    medical/
      case_001.md
      case_002.md
      case_003.md
      case_004.md
      case_005.md

frontend/
  app/
    lightrag/
      page.tsx               # new page
      loading.tsx            # loading skeleton
    components/
      LightRAGGraphViewer.tsx # standalone React Flow component
```

---

## Phase 1 — Backend: LightRAG Service Layer

### Step 1 — Install LightRAG

Add to `backend/requirements.txt`:
```
lightrag-hku>=1.3.9
networkx>=3.0
```

Add to `.gitignore` (repo root):
```
backend/data/lightrag/
```

Create directories (they must exist for Docker volume mount):
```bash
mkdir -p backend/data/lightrag/aircraft
mkdir -p backend/data/lightrag/medical
touch backend/data/lightrag/aircraft/.gitkeep
touch backend/data/lightrag/medical/.gitkeep
```

---

### Step 2 — `backend/app/lightrag_service/__init__.py`

Empty file. Just `# LightRAG service layer`.

---

### Step 3 — `backend/app/lightrag_service/rag_instance.py`

Singleton pattern with one LightRAG instance per domain. This is the most critical file — get it right before proceeding.

```python
"""
LightRAG singleton instances for aircraft and medical domains.
Uses existing EmbeddingModel (all-MiniLM-L6-v2, 384 dims) and
Anthropic Haiku client (cheap, fast enough for NER/entity extraction).
"""
from __future__ import annotations

import asyncio
import logging
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np

from lightrag import LightRAG, QueryParam
from lightrag.utils import EmbeddingFunc

from backend.app.rag.embeddings import EmbeddingModel
from backend.app.llm.client import get_async_fast_llm_client

logger = logging.getLogger(__name__)

# ── Working directories ────────────────────────────────────────────────────────
BASE_DIR = Path(os.getenv("LIGHTRAG_BASE_DIR", "backend/data/lightrag"))
DOMAIN_DIRS = {
    "aircraft": str(BASE_DIR / "aircraft"),
    "medical":  str(BASE_DIR / "medical"),
}

# ── Singleton registry ─────────────────────────────────────────────────────────
_instances: dict[str, LightRAG] = {}
_init_locks: dict[str, asyncio.Lock] = {
    "aircraft": asyncio.Lock(),
    "medical":  asyncio.Lock(),
}

# ── Embedding adapter (wraps existing SentenceTransformer) ─────────────────────
_embed_model: EmbeddingModel | None = None

def _get_embed_model() -> EmbeddingModel:
    global _embed_model
    if _embed_model is None:
        _embed_model = EmbeddingModel()
    return _embed_model

def _make_embedding_func() -> EmbeddingFunc:
    """Wraps existing EmbeddingModel in LightRAG's EmbeddingFunc interface."""
    embed_model = _get_embed_model()

    @EmbeddingFunc(
        embedding_dim=384,
        max_token_size=512,
        model_name="sentence-transformers/all-MiniLM-L6-v2",
    )
    async def lightrag_embed(texts: list[str]) -> np.ndarray:
        loop = asyncio.get_running_loop()
        # Run CPU-bound encode in executor to avoid blocking event loop
        result = await loop.run_in_executor(None, embed_model.encode, texts)
        return result

    return lightrag_embed

# ── LLM adapter (wraps Anthropic Haiku async client) ──────────────────────────
async def _lightrag_llm_func(
    prompt: str,
    system_prompt: str | None = None,
    history_messages: list[dict] | None = None,
    **kwargs: Any,
) -> str:
    """
    Adapter: LightRAG calls this for entity/relation extraction.
    Uses Haiku (fast, cheap) — NOT Sonnet (reserved for agent synthesis).
    """
    client = get_async_fast_llm_client()
    history_messages = history_messages or []

    messages: list[dict] = []
    if history_messages:
        messages.extend(history_messages)

    # LightRAG passes the full prompt; system_prompt is the extraction instruction
    if system_prompt:
        messages.append({"role": "user", "content": system_prompt})

    messages.append({"role": "user", "content": prompt})

    max_tokens = kwargs.get("max_tokens", 1024)

    try:
        response = await client._async_client.messages.create(
            model=client.model,
            max_tokens=max_tokens,
            messages=messages,
        )
        return response.content[0].text
    except Exception as exc:
        logger.error("LightRAG LLM call failed: %s", exc)
        raise

# ── Factory ────────────────────────────────────────────────────────────────────
async def get_lightrag(domain: str) -> LightRAG:
    """
    Returns the initialized LightRAG instance for the given domain.
    Initializes on first call; subsequent calls return the cached instance.
    Thread-safe via per-domain asyncio.Lock.
    """
    if domain not in DOMAIN_DIRS:
        raise ValueError(f"Unknown domain '{domain}'. Must be: {list(DOMAIN_DIRS)}")

    if domain in _instances:
        return _instances[domain]

    async with _init_locks[domain]:
        # Double-check after acquiring lock
        if domain in _instances:
            return _instances[domain]

        working_dir = DOMAIN_DIRS[domain]
        Path(working_dir).mkdir(parents=True, exist_ok=True)

        logger.info("Initializing LightRAG for domain '%s' at %s", domain, working_dir)

        rag = LightRAG(
            working_dir=working_dir,
            workspace=domain,
            llm_model_func=_lightrag_llm_func,
            embedding_func=_make_embedding_func(),
            # File-based storage — does NOT touch PostgreSQL tables
            kv_storage="JsonKVStorage",
            vector_storage="NanoVectorDBStorage",
            graph_storage="NetworkXStorage",
            doc_status_storage="JsonDocStatusStorage",
            # Chunking tuned for NCR/maintenance log length
            chunk_token_size=600,
            chunk_overlap_token_size=80,
            # Entity extraction: 1 gleaning pass (balance quality vs cost)
            entity_extract_max_gleaning=1,
            # Disable LLM cache for entity extraction in prod
            # (enable for debugging: enable_llm_cache_for_entity_extract=True)
            enable_llm_cache=False,
        )

        await rag.initialize_storages()
        _instances[domain] = rag
        logger.info("LightRAG '%s' initialized successfully.", domain)
        return rag

async def reset_instance(domain: str) -> None:
    """Tear down and remove a cached instance (used in tests and re-indexing)."""
    if domain in _instances:
        rag = _instances.pop(domain)
        try:
            await rag.finalize_storages()
        except Exception:
            pass
```

**Acceptance check — Step 3:**
- [ ] `from backend.app.lightrag_service.rag_instance import get_lightrag` imports without error
- [ ] `get_lightrag("aircraft")` returns a LightRAG instance (run in a pytest async test)
- [ ] `get_lightrag("badvalue")` raises `ValueError`
- [ ] No `get_event_loop` calls — only `asyncio.get_running_loop()`

---

### Step 4 — `backend/app/lightrag_service/indexer.py`

Reads from existing PostgreSQL tables and feeds text documents into LightRAG.

```python
"""
Indexer: reads from existing DB tables and inserts formatted text into LightRAG.
Falls back to demo docs if tables are empty (< 5 rows).
"""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import text

from backend.app.db.session import get_sync_session
from backend.app.lightrag_service.rag_instance import get_lightrag

logger = logging.getLogger(__name__)

# ── Document formatters ────────────────────────────────────────────────────────

def _fmt_incident(row: Any) -> str:
    return (
        f"NCR Report: {row.incident_id}\n"
        f"Date: {row.date} | System: {row.system} | Severity: {row.severity}\n"
        f"Narrative: {row.narrative_text}\n"
        f"Root Cause: {row.root_cause or 'Unknown'}\n"
        f"Corrective Action: {row.corrective_action or 'Pending'}"
    )

def _fmt_defect(row: Any) -> str:
    return (
        f"Manufacturing Defect: {row.defect_id}\n"
        f"Date: {row.date} | Product: {row.product} | Part: {getattr(row, 'part', 'N/A')}\n"
        f"Type: {row.defect_type} | Severity: {row.severity}\n"
        f"Description: {row.defect_description}\n"
        f"Disposition: {getattr(row, 'disposition', 'Pending') or 'Pending'}"
    )

def _fmt_maintenance(row: Any) -> str:
    return (
        f"Maintenance Event: {row.log_id}\n"
        f"Date: {row.date} | Asset: {row.asset_id} | Product: {getattr(row, 'product', 'N/A')}\n"
        f"Event Type: {row.event_type}\n"
        f"Notes: {row.notes or 'No notes recorded'}"
    )

# ── Main indexing functions ────────────────────────────────────────────────────

async def index_aircraft_data(batch_size: int = 10) -> dict:
    """
    Reads incident_reports + manufacturing_defects → inserts into aircraft LightRAG.
    Returns {indexed: int, domain: str, sources: list[str]}.
    """
    rag = await get_lightrag("aircraft")
    docs: list[str] = []
    sources: list[str] = []

    with get_sync_session() as session:
        # Incident reports
        incidents = session.execute(
            text("SELECT * FROM incident_reports ORDER BY date DESC LIMIT 500")
        ).fetchall()
        for row in incidents:
            docs.append(_fmt_incident(row))
            sources.append(f"incident:{row.incident_id}")

        # Manufacturing defects
        defects = session.execute(
            text("SELECT * FROM manufacturing_defects ORDER BY date DESC LIMIT 500")
        ).fetchall()
        for row in defects:
            docs.append(_fmt_defect(row))
            sources.append(f"defect:{row.defect_id}")

    if not docs:
        logger.warning("No aircraft data found in DB — falling back to demo docs.")
        from backend.app.lightrag_service.demo_indexer import index_demo_docs
        return await index_demo_docs("aircraft")

    # Insert in batches to respect LightRAG's max_parallel_insert
    indexed = 0
    for i in range(0, len(docs), batch_size):
        batch = docs[i : i + batch_size]
        await rag.ainsert(batch)
        indexed += len(batch)
        logger.info("Aircraft LightRAG: indexed %d / %d docs", indexed, len(docs))

    return {"indexed": indexed, "domain": "aircraft", "sources": sources[:10]}


async def index_medical_data(batch_size: int = 10) -> dict:
    """
    Reads maintenance_logs → inserts into medical LightRAG.
    Returns {indexed: int, domain: str, sources: list[str]}.
    """
    rag = await get_lightrag("medical")
    docs: list[str] = []
    sources: list[str] = []

    with get_sync_session() as session:
        logs = session.execute(
            text("SELECT * FROM maintenance_logs ORDER BY date DESC LIMIT 500")
        ).fetchall()
        for row in logs:
            docs.append(_fmt_maintenance(row))
            sources.append(f"log:{row.log_id}")

    if not docs:
        logger.warning("No medical data found in DB — falling back to demo docs.")
        from backend.app.lightrag_service.demo_indexer import index_demo_docs
        return await index_demo_docs("medical")

    indexed = 0
    for i in range(0, len(docs), batch_size):
        batch = docs[i : i + batch_size]
        await rag.ainsert(batch)
        indexed += len(batch)
        logger.info("Medical LightRAG: indexed %d / %d docs", indexed, len(docs))

    return {"indexed": indexed, "domain": "medical", "sources": sources[:10]}


async def index_domain(domain: str, batch_size: int = 10) -> dict:
    """Dispatcher — routes to the correct domain indexer."""
    if domain == "aircraft":
        return await index_aircraft_data(batch_size)
    elif domain == "medical":
        return await index_medical_data(batch_size)
    else:
        raise ValueError(f"Unknown domain: {domain}")


async def check_index_status(domain: str) -> dict:
    """
    Returns indexing status without triggering initialization.
    Reads working dir for presence of data files.
    """
    from pathlib import Path
    from backend.app.lightrag_service.rag_instance import DOMAIN_DIRS

    if domain not in DOMAIN_DIRS:
        raise ValueError(f"Unknown domain: {domain}")

    working_dir = Path(DOMAIN_DIRS[domain])
    kv_file = working_dir / "kv_store_full_docs.json"
    graph_file = working_dir / "graph_chunk_entity_relation.graphml"

    indexed = kv_file.exists() and kv_file.stat().st_size > 100

    doc_count = 0
    entity_count = 0
    relation_count = 0

    if indexed:
        try:
            import json
            with open(kv_file) as f:
                kv_data = json.load(f)
                doc_count = len(kv_data)
        except Exception:
            pass

        try:
            import networkx as nx
            G = nx.read_graphml(str(graph_file))
            entity_count = G.number_of_nodes()
            relation_count = G.number_of_edges()
        except Exception:
            pass

    return {
        "domain": domain,
        "indexed": indexed,
        "doc_count": doc_count,
        "entity_count": entity_count,
        "relation_count": relation_count,
    }
```

---

### Step 5 — `backend/app/lightrag_service/demo_indexer.py`

Fallback for empty databases — indexes the demo markdown docs.

```python
"""
Demo indexer: indexes pre-written markdown documents when DB is empty.
Used for local dev, CI, and first-time Render deployments with no data.
"""
from __future__ import annotations

import logging
from pathlib import Path

from backend.app.lightrag_service.rag_instance import get_lightrag

logger = logging.getLogger(__name__)

DEMO_DOCS_BASE = Path("demo/lightrag_docs")


async def index_demo_docs(domain: str) -> dict:
    """
    Reads all .md files from demo/lightrag_docs/{domain}/ and inserts into LightRAG.
    Returns {indexed: int, domain: str, source: "demo"}.
    """
    domain_dir = DEMO_DOCS_BASE / domain
    if not domain_dir.exists():
        raise FileNotFoundError(f"Demo docs directory not found: {domain_dir}")

    md_files = sorted(domain_dir.glob("*.md"))
    if not md_files:
        raise FileNotFoundError(f"No .md files found in {domain_dir}")

    rag = await get_lightrag(domain)
    docs: list[str] = []

    for md_file in md_files:
        content = md_file.read_text(encoding="utf-8").strip()
        if content:
            docs.append(content)
            logger.info("Demo indexer [%s]: loaded %s", domain, md_file.name)

    if docs:
        await rag.ainsert(docs)
        logger.info("Demo indexer [%s]: inserted %d documents.", domain, len(docs))

    return {"indexed": len(docs), "domain": domain, "source": "demo"}
```

---

### Step 6 — `backend/app/lightrag_service/graph_exporter.py`

Converts LightRAG's internal NetworkX graph to JSON for the frontend.

```python
"""
Graph exporter: converts LightRAG's NetworkX graph to React Flow-compatible JSON.
Also provides the LightRAG query wrapper.
"""
from __future__ import annotations

import logging
from typing import Any

from lightrag import QueryParam

from backend.app.lightrag_service.rag_instance import get_lightrag

logger = logging.getLogger(__name__)

VALID_MODES = {"local", "global", "hybrid", "naive", "mix"}


async def export_graph(domain: str, max_nodes: int = 200) -> dict:
    """
    Exports the LightRAG knowledge graph for the given domain as JSON.

    Returns:
        {
          nodes: [{id, label, type, description, weight}],
          edges: [{id, source, target, label, weight, description}],
          status: "ok" | "not_indexed",
          domain: str,
          node_count: int,
          edge_count: int,
        }
    """
    rag = await get_lightrag(domain)

    # Access the underlying NetworkX graph
    # LightRAG stores it in chunk_entity_relation_graph which is a NetworkXStorage
    try:
        G = rag.chunk_entity_relation_graph._graph  # type: ignore[attr-defined]
    except AttributeError:
        G = None

    if G is None or G.number_of_nodes() == 0:
        return {
            "nodes": [],
            "edges": [],
            "status": "not_indexed",
            "domain": domain,
            "node_count": 0,
            "edge_count": 0,
        }

    # Sample nodes if graph is large — prioritise high-degree nodes
    all_nodes = list(G.nodes(data=True))
    if len(all_nodes) > max_nodes:
        # Sort by degree descending, take top max_nodes
        degrees = dict(G.degree())
        all_nodes = sorted(all_nodes, key=lambda n: degrees.get(n[0], 0), reverse=True)
        all_nodes = all_nodes[:max_nodes]

    node_ids = {n[0] for n in all_nodes}

    nodes = []
    for node_id, data in all_nodes:
        nodes.append({
            "id": str(node_id),
            "label": str(node_id),
            "type": str(data.get("entity_type", data.get("type", "entity"))).lower(),
            "description": str(data.get("description", "")),
            "weight": float(data.get("weight", 1.0)),
        })

    edges = []
    seen_edges: set[str] = set()
    for u, v, data in G.edges(data=True):
        if u not in node_ids or v not in node_ids:
            continue
        edge_id = f"{u}||{v}"
        if edge_id in seen_edges:
            continue
        seen_edges.add(edge_id)
        edges.append({
            "id": edge_id,
            "source": str(u),
            "target": str(v),
            "label": str(data.get("keywords", data.get("relation", ""))),
            "weight": float(data.get("weight", 1.0)),
            "description": str(data.get("description", "")),
        })

    return {
        "nodes": nodes,
        "edges": edges,
        "status": "ok",
        "domain": domain,
        "node_count": len(nodes),
        "edge_count": len(edges),
    }


async def search_graph(domain: str, query: str, mode: str = "hybrid") -> dict:
    """
    Runs a LightRAG query against the domain knowledge graph.

    Args:
        domain: "aircraft" or "medical"
        query: natural language question
        mode: one of local | global | hybrid | naive | mix

    Returns:
        {answer: str, mode: str, domain: str}
    """
    if mode not in VALID_MODES:
        raise ValueError(f"Invalid mode '{mode}'. Must be one of: {sorted(VALID_MODES)}")

    rag = await get_lightrag(domain)

    answer = await rag.aquery(
        query,
        param=QueryParam(mode=mode),  # type: ignore[call-arg]
    )

    return {
        "answer": str(answer),
        "mode": mode,
        "domain": domain,
    }
```

---

### Step 7 — `backend/app/api/lightrag.py`

New FastAPI router with 6 endpoints.

```python
"""
LightRAG API router.
All endpoints are public (no auth required for GET).
Index endpoints use BackgroundTasks to return immediately.
"""
from __future__ import annotations

import logging
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from fastapi.responses import ORJSONResponse
from pydantic import BaseModel, field_validator

from backend.app.lightrag_service.graph_exporter import (
    VALID_MODES,
    export_graph,
    search_graph,
)
from backend.app.lightrag_service.indexer import check_index_status, index_domain

logger = logging.getLogger(__name__)
router = APIRouter()

# ── In-memory index status tracker ────────────────────────────────────────────
_index_status: dict[str, str] = {
    "aircraft": "idle",
    "medical": "idle",
}

VALID_DOMAINS = {"aircraft", "medical"}

# ── Request / Response schemas ─────────────────────────────────────────────────

class LightRAGQueryRequest(BaseModel):
    domain: str
    query: str
    mode: str = "hybrid"

    @field_validator("domain")
    @classmethod
    def validate_domain(cls, v: str) -> str:
        if v not in VALID_DOMAINS:
            raise ValueError(f"domain must be one of {sorted(VALID_DOMAINS)}")
        return v

    @field_validator("mode")
    @classmethod
    def validate_mode(cls, v: str) -> str:
        if v not in VALID_MODES:
            raise ValueError(f"mode must be one of {sorted(VALID_MODES)}")
        return v

# ── Background indexing task ───────────────────────────────────────────────────

async def _run_indexing(domain: str) -> None:
    _index_status[domain] = "indexing"
    try:
        result = await index_domain(domain)
        logger.info("LightRAG indexing complete for '%s': %s", domain, result)
        _index_status[domain] = "done"
    except Exception as exc:
        logger.error("LightRAG indexing failed for '%s': %s", domain, exc)
        _index_status[domain] = "error"

# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/status/{domain}", response_class=ORJSONResponse)
async def get_status(domain: str) -> dict:
    """Returns indexing status and graph stats for the domain."""
    if domain not in VALID_DOMAINS:
        raise HTTPException(status_code=422, detail=f"domain must be one of {sorted(VALID_DOMAINS)}")
    status = await check_index_status(domain)
    status["index_job_status"] = _index_status.get(domain, "idle")
    return status


@router.post("/index/{domain}", response_class=ORJSONResponse)
async def trigger_index(domain: str, background_tasks: BackgroundTasks) -> dict:
    """
    Triggers background indexing for the domain.
    Returns immediately — poll /status/{domain} for progress.
    """
    if domain not in VALID_DOMAINS:
        raise HTTPException(status_code=422, detail=f"domain must be one of {sorted(VALID_DOMAINS)}")

    if _index_status.get(domain) == "indexing":
        return {
            "message": f"Indexing already in progress for '{domain}'.",
            "domain": domain,
            "status": "indexing",
        }

    background_tasks.add_task(_run_indexing, domain)
    return {
        "message": f"Indexing started for '{domain}'. Poll /lightrag/status/{domain} for progress.",
        "domain": domain,
        "status": "indexing",
    }


@router.get("/graph/{domain}", response_class=ORJSONResponse)
async def get_graph(
    domain: str,
    max_nodes: int = Query(default=200, ge=10, le=1000),
) -> dict:
    """Returns the knowledge graph nodes and edges for visualization."""
    if domain not in VALID_DOMAINS:
        raise HTTPException(status_code=422, detail=f"domain must be one of {sorted(VALID_DOMAINS)}")
    try:
        return await export_graph(domain, max_nodes=max_nodes)
    except Exception as exc:
        logger.error("Graph export failed for '%s': %s", domain, exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/query", response_class=ORJSONResponse)
async def query_graph(body: LightRAGQueryRequest) -> dict:
    """Runs a LightRAG query against the domain knowledge graph."""
    try:
        return await search_graph(body.domain, body.query, body.mode)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger.error("LightRAG query failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/modes", response_class=ORJSONResponse)
async def get_modes() -> dict:
    """Returns the list of supported LightRAG query modes."""
    return {
        "modes": sorted(VALID_MODES),
        "default": "hybrid",
        "descriptions": {
            "local":  "Context-dependent, entity-focused retrieval",
            "global": "Global knowledge, relationship-focused retrieval",
            "hybrid": "Combines local + global (recommended)",
            "naive":  "Basic vector search without graph expansion",
            "mix":    "Integrates knowledge graph and vector retrieval",
        },
    }


@router.get("/index-status", response_class=ORJSONResponse)
async def get_all_index_status() -> dict:
    """Returns current indexing job status for all domains."""
    return {"status": _index_status}
```

---

### Step 8 — Register Router in `backend/app/main.py`

Add after the existing router registrations:

```python
from backend.app.api.lightrag import router as lightrag_router
app.include_router(lightrag_router, prefix="/lightrag", tags=["lightrag"])
```

---

### Step 9 — Add Pydantic Schemas to `backend/app/schemas/models.py`

Add these models (do not modify existing models):

```python
# ── LightRAG schemas ────────────────────────────────────────────────────────

class LightRAGQueryRequest(BaseModel):
    domain: str
    query: str
    mode: str = "hybrid"

class LightRAGGraphNode(BaseModel):
    id: str
    label: str
    type: str = "entity"
    description: str = ""
    weight: float = 1.0

class LightRAGGraphEdge(BaseModel):
    id: str
    source: str
    target: str
    label: str = ""
    weight: float = 1.0
    description: str = ""

class LightRAGGraphResponse(BaseModel):
    nodes: list[LightRAGGraphNode]
    edges: list[LightRAGGraphEdge]
    status: str = "ok"
    domain: str
    node_count: int
    edge_count: int

class LightRAGStatusResponse(BaseModel):
    domain: str
    indexed: bool
    doc_count: int
    entity_count: int
    relation_count: int
    index_job_status: str = "idle"

class LightRAGQueryResponse(BaseModel):
    answer: str
    mode: str
    domain: str
```

---

### Phase 1 Acceptance Checklist

Run before proceeding to Phase 2:

```bash
cd backend
.venv/Scripts/python -m pytest tests/test_lightrag_service.py -v
# Verify all existing tests still pass:
.venv/Scripts/python -m pytest tests/ -v --ignore=tests/test_lightrag_service.py
# Verify no get_event_loop:
grep -r "get_event_loop" app/ && echo "FAIL" || echo "PASS"
```

- [ ] `pip install lightrag-hku` succeeds
- [ ] `GET /lightrag/status/aircraft` → 200 with `{domain, indexed, doc_count, ...}`
- [ ] `GET /lightrag/status/medical` → 200
- [ ] `GET /lightrag/status/badvalue` → 422
- [ ] `POST /lightrag/index/aircraft` → 200 immediately, triggers background task
- [ ] `GET /lightrag/graph/aircraft` → 200 with `{nodes, edges, status, ...}`
- [ ] `POST /lightrag/query` with `{domain: "aircraft", query: "hydraulic", mode: "hybrid"}` → 200 with `{answer, mode, domain}`
- [ ] `GET /lightrag/modes` → 200 with 5 modes
- [ ] All 560 existing tests still pass
- [ ] `grep -r "get_event_loop" backend/app/` returns zero results

---

## Phase 2 — Demo Documents

Create these files before building the frontend (the page needs real data to test with).

### `demo/lightrag_docs/aircraft/ncr_001.md`
```markdown
# NCR-2024-0147: Hydraulic System Failure — Landing Gear Strut

**Report ID:** NCR-2024-0147  
**Date:** 2024-03-12  
**System:** Landing Gear  
**Severity:** Critical  
**Supplier:** AeroCo Industries  
**Part Number:** P/N 737-HYD-4421  
**Aircraft:** Boeing 737-800, Tail N2247W  
**Engineer:** James Kowalski  

## Defect Description
Hydraulic fluid leak detected at the port main landing gear strut during pre-flight 
inspection. Approximately 200ml of MIL-PRF-5606 hydraulic fluid observed pooling beneath 
the aircraft. The leak originated from a failed O-ring seal at the strut-cylinder junction.

## Root Cause
O-ring seal (P/N AE-4421-OR) manufactured by AeroCo Industries exhibited premature 
hardening due to incorrect material specification. Material certification revealed 
Buna-N compound used instead of specified Viton compound. The Buna-N material degrades 
rapidly when exposed to Skydrol hydraulic fluid used in the 737 fleet.

## Corrective Action
1. Replace all O-ring seals on port and starboard landing gear struts (fleet-wide)
2. Return all AeroCo P/N AE-4421-OR seals — lot numbers L2024-012 through L2024-018
3. Issue supplier corrective action request (SCAR-2024-0147) to AeroCo Industries
4. Update approved vendor list: remove AeroCo Industries for hydraulic sealing components

## Related Components
- Hydraulic Actuator Assembly HAA-7721
- Main Landing Gear Retraction System MLGRS-004
- Hydraulic Power Unit HPU-2A
```

### `demo/lightrag_docs/aircraft/ncr_002.md`
```markdown
# NCR-2024-0203: Composite Panel Delamination — Wing Leading Edge

**Report ID:** NCR-2024-0203  
**Date:** 2024-04-05  
**System:** Wing Structure  
**Severity:** Major  
**Supplier:** CompositeWorks Ltd  
**Part Number:** P/N A320-WP-442  
**Aircraft:** Airbus A320-214, Tail F-GKXZ  
**Engineer:** Maria Santos  

## Defect Description
Delamination bubble detected on starboard wing leading edge panel (station 12-14) 
during scheduled C-check inspection. The defect measures 180mm x 60mm and extends 
through the first two plies of the carbon fiber laminate. NDT ultrasonics confirmed 
void area with no fiber-to-matrix bond.

## Root Cause
Investigation revealed inadequate autoclave cure cycle during manufacturing at 
CompositeWorks Ltd. Temperature log data from batch B2024-WP-003 shows a 12-minute 
deviation below minimum cure temperature (115°C vs specified 127°C minimum). 
This resulted in incomplete resin polymerization and poor inter-ply adhesion.

## Corrective Action
1. Remove and replace affected panel A320-WP-442 (unit serial CF-20240203)
2. Quarantine all panels from batch B2024-WP-003 pending inspection
3. Issue SCAR to CompositeWorks Ltd — temperature control system audit required
4. Update incoming inspection criteria: add ply bond pull-off test for wing panels

## Related Components
- Wing Leading Edge Assembly WLEA-320-12
- Krueger Flap Mechanism KFM-S14
- Wing Skin Panel WSP-320-PORT
```

### `demo/lightrag_docs/aircraft/ncr_003.md`
```markdown
# NCR-2024-0289: Fuel Pump Motor Winding Failure

**Report ID:** NCR-2024-0289  
**Date:** 2024-05-19  
**System:** Fuel System  
**Severity:** Critical  
**Supplier:** AeroCo Industries  
**Part Number:** P/N FP-737-8800  
**Aircraft:** Boeing 737-900, Tail N8812K  
**Engineer:** David Park  

## Defect Description
Boost pump pressure warning illuminated during climb phase at FL180. 
Post-flight inspection revealed fuel boost pump motor failure in center tank. 
Winding resistance measured at 0.3 ohms vs nominal 2.1 ohms, indicating 
inter-winding short circuit. Motor serial M-FP-20231142, manufactured by AeroCo Industries.

## Root Cause
Motor winding insulation failure attributed to contaminated varnish compound 
used during manufacturing (lot V2023-009 at AeroCo Industries). The insulation 
compound did not meet dielectric strength specification (actual 14kV/mm vs 
required 18kV/mm). This is the second AeroCo Industries failure in 2024 
(see also NCR-2024-0147 for hydraulic seal failure from same supplier).

## Corrective Action
1. Replace center tank boost pump (MOD-FP-737-08 embodied)
2. Remove all AeroCo FP-737-8800 motors from service — lot M-FP-2023xxxx
3. Escalate AeroCo Industries to supplier watch list — two critical NCRs in 90 days
4. Initiate fleet survey: all 737 fuel pump installations from AeroCo 2023 production

## Related Components
- Center Tank Fuel Boost Pump CTBP-1
- Fuel Quantity Indication System FQIS-737
- Fuel Control Unit FCU-8B
```

### `demo/lightrag_docs/aircraft/ncr_004.md`
```markdown
# NCR-2024-0334: Avionics Display Software Fault — Navigation Data Corruption

**Report ID:** NCR-2024-0334  
**Date:** 2024-06-08  
**System:** Avionics  
**Severity:** Major  
**Supplier:** FlightSystems Corp  
**Part Number:** P/N AV-7721-ND  
**Aircraft:** Boeing 787-9, Tail N2289B  
**Engineer:** John Martinez  

## Defect Description
Flight crew reported navigation display showing incorrect magnetic variation data 
during cruise at FL350 over North Atlantic. ACARS data confirms display unit 
AV-7721-ND (serial AV20240891) presented heading error of 4.2 degrees for 
approximately 18 minutes before self-correcting. Incident occurred at position 
53°N 030°W.

## Root Cause
Software investigation by FlightSystems Corp identified a race condition in 
navigation data refresh routine (module NAV_REFRESH v2.4.1). When the Inertial 
Reference System switches from primary to secondary alignment mode during 
turbulence events, a timing window allows stale magnetic variation data to 
persist in the display buffer. Bug present in software versions 2.4.0 through 2.4.3.

## Corrective Action
1. Load software version 2.4.4 (released FlightSystems Corp SB AV-7721-008)
2. Update all AV-7721-ND units fleet-wide — mandatory within 30 days (AOG priority)
3. Amend flight crew procedures: cross-check navigation data against backup GPS
4. FlightSystems Corp to implement independent software verification for all 
   safety-critical display modules

## Related Components
- Inertial Reference System IRS-3
- Flight Management Computer FMC-787-2
- Navigation Display ND-B787-L
- Air Data Computer ADC-787
```

### `demo/lightrag_docs/aircraft/ncr_005.md`
```markdown
# NCR-2024-0412: Main Landing Gear Brake Assembly Excessive Wear

**Report ID:** NCR-2024-0412  
**Date:** 2024-07-22  
**System:** Brakes  
**Severity:** Minor  
**Asset ID:** ASSET-221  
**Supplier:** BrakeTech Manufacturing  
**Part Number:** P/N BA-737-MLG-04  
**Aircraft:** Boeing 737-700, Tail N3341E  
**Engineer:** Sarah Chen  

## Defect Description
Brake wear indicator pins on main landing gear brake assembly (asset ASSET-221) 
found at minimum limits during scheduled 150-cycle check — 12 cycles ahead of 
planned replacement interval. Brake stack heat sink temperature logs show three 
high-energy rejected takeoff events in previous 40 cycles exceeding 450°C threshold.

## Root Cause
High-energy rejected takeoffs (RTO) from asset ASSET-221 during hot-weather 
operations at Phoenix (KPHX) exceeded design thermal loads. BrakeTech Manufacturing 
brake assembly P/N BA-737-MLG-04 uses carbon-carbon composite rated to 420°C 
continuous with 480°C transient limit. Three RTOs recorded peak temperatures 
between 461°C and 473°C, accelerating carbon oxidation and reducing stack life.

## Corrective Action
1. Replace brake assembly ASSET-221 port and starboard (both at minimum limits)
2. Install higher-thermal-capacity brake: BrakeTech P/N BA-737-MLG-04HT (480°C rated)
3. Flag aircraft for warm-weather operations monitoring — notify dispatch
4. Update brake replacement interval for hot-weather RTO exposure aircraft to 130 cycles

## Related Components
- Anti-Skid Control Unit ASCU-737
- Brake Temperature Monitor BTM-3
- Wheel Assembly WA-737-MLG-PS
```

### `demo/lightrag_docs/medical/case_001.md`
```markdown
# Clinical Equipment NCR: Cardiac Monitor Display Failure — ICU Unit 3

**Case ID:** MED-NCR-2024-0089  
**Date:** 2024-02-14  
**Unit:** ICU-3 (Cardiac Intensive Care)  
**Device:** Patient Monitor PM-4400  
**Manufacturer:** MedTech Corp  
**Serial Number:** PM-4400-SN-20231087  
**Severity:** Critical  
**Reported By:** Dr. Anita Patel, Biomedical Engineering  

## Defect Description
Cardiac monitor PM-4400 (ICU-3, Bed 7) displayed intermittent ECG waveform freezing 
during patient monitoring. Waveform halted for 3-8 seconds before resuming. Event 
occurred 4 times over 6-hour period. Patient alarm system remained active but 
clinical staff could not confirm waveform accuracy during freeze events.

## Root Cause
Firmware analysis by MedTech Corp identified buffer overflow in ECG signal 
processing module (firmware v3.2.1). When RR interval falls below 320ms 
(rate >187 bpm — ventricular tachycardia range), buffer allocation calculation 
fails to account for additional data points, causing processor interrupt and 
display freeze. Bug present in all PM-4400 units with firmware v3.1.x and v3.2.x.

## Corrective Action
1. Emergency firmware update to v3.3.0 applied to all ICU-3 PM-4400 units
2. Fleet-wide firmware update scheduled — all 47 PM-4400 units within 14 days
3. Interim measure: dedicated nurse monitoring for any patient with HR >150 bpm
4. MedTech Corp to implement high-rate cardiac simulation in regression test suite
```

### `demo/lightrag_docs/medical/case_002.md`
```markdown
# Clinical Equipment NCR: Ventilator Pressure Sensor Defect

**Case ID:** MED-NCR-2024-0134  
**Date:** 2024-03-28  
**Unit:** Respiratory ICU (RICU)  
**Device:** Mechanical Ventilator MV-2200  
**Manufacturer:** MedTech Corp  
**Serial Number:** MV-2200-SN-20220344  
**Severity:** Critical  
**Reported By:** Dr. Robert Kim, Respiratory Medicine  

## Defect Description
Ventilator MV-2200 reported incorrect peak inspiratory pressure (PIP) readings 
during routine calibration check. Device displayed PIP of 18 cmH₂O against 
test lung calibrated to 24 cmH₂O — 25% under-read. Patient alarm thresholds 
set based on displayed pressure may have been inappropriate for 3 patients 
treated with this unit over the preceding 2 weeks.

## Root Cause
Differential pressure sensor (component DPS-MV-440, lot P2022-11) manufactured 
by SensorCo exhibited drift exceeding specification after 14 months of continuous 
operation. Sensor datasheet specifies ±2% accuracy over 18-month service life; 
actual drift measured at -25% at 14 months. SensorCo lot P2022-11 identified 
as containing non-conforming piezoelectric elements from a secondary supplier.

## Corrective Action
1. Remove MV-2200-SN-20220344 from service — replace pressure sensor
2. Recall and inspect all MV-2200 units with sensor lot P2022-11
3. Issue patient safety advisory — review ventilator settings for 3 prior patients
4. Mandatory annual pressure calibration verification added to PM schedule
5. SensorCo removed from approved vendor list pending quality audit
```

### `demo/lightrag_docs/medical/case_003.md`
```markdown
# Clinical Equipment NCR: Infusion Pump Occlusion Alarm Failure

**Case ID:** MED-NCR-2024-0198  
**Date:** 2024-04-15  
**Unit:** Oncology Ward, Floor 4  
**Device:** Infusion Pump IP-900  
**Manufacturer:** InfuTech Systems  
**Serial Number:** IP-900-SN-20231562  
**Severity:** Major  
**Reported By:** Nursing Supervisor Claire Adams  

## Defect Description
Infusion pump IP-900 failed to alarm on downstream occlusion during vasopressor 
infusion. IV line became kinked for approximately 22 minutes before nursing staff 
noticed cessation of drip. Occlusion detection pressure threshold set correctly 
at 200 mmHg; pump log shows pressure reached 310 mmHg without triggering alarm.

## Root Cause
Occlusion detection circuit utilises pressure transducer shared with the same 
SensorCo component family as the MedTech Corp ventilator incident (see MED-NCR-2024-0134). 
Transducer lot P2022-09 in the InfuTech IP-900 exhibits voltage offset drift 
causing the ADC reading to report false-low pressure values. The alarm comparator 
never receives a signal exceeding threshold despite actual over-pressure conditions.

## Corrective Action
1. Remove all IP-900 units with SensorCo transducer lot P2022-09 from service
2. Cross-reference SensorCo lot P2022-09 against all device types in biomedical inventory
3. Notify clinical risk management — document near-miss event MED-NCR-2024-0198
4. Expedite SensorCo vendor quality audit (combined with MED-NCR-2024-0134 findings)
```

### `demo/lightrag_docs/medical/case_004.md`
```markdown
# Clinical Equipment NCR: Surgical Instrument Sterilization Cycle Failure

**Case ID:** MED-NCR-2024-0251  
**Date:** 2024-05-30  
**Unit:** Operating Room 7 (OR-7)  
**Device:** Autoclave Sterilizer STE-5500  
**Manufacturer:** SterileTech AG  
**Serial Number:** STE-5500-SN-20190887  
**Severity:** Critical  
**Reported By:** Infection Control Officer Dr. Yuki Tanaka  

## Defect Description
Biological indicator (BI) test following routine sterilization cycle in OR-7 
autoclave STE-5500 returned positive growth at 48-hour reading. BI spore strip 
(Geobacillus stearothermophilus) placed in the centre load position survived 
the 134°C / 18-minute porous load cycle. Seven surgical instrument sets were 
processed in the failed cycle — all sets quarantined.

## Root Cause
Steam penetration failure caused by failed door gasket seal (component DG-5500-V, 
age 6.2 years — replacement interval is 5 years per SterileTech AG service manual). 
Overdue preventive maintenance identified: the OR-7 autoclave was removed from the 
PM schedule during COVID-19 service reduction in 2021 and not reinstated. 
Chamber internal thermocouples confirmed temperature achieved 134°C, but steam 
quality (superheat) was inadequate due to air-steam mixing through the degraded seal.

## Corrective Action
1. Remove STE-5500 from service — full service by SterileTech AG engineer
2. Replace door gasket DG-5500-V and associated steam trap components
3. Reinstate all biomedical equipment on PM schedule — full audit of OR department
4. Quarantined instrument sets re-sterilized in OR-5 autoclave following BI confirmation
5. Notify OR scheduling — 6 elective procedures rescheduled from OR-7
```

### `demo/lightrag_docs/medical/case_005.md`
```markdown
# Clinical Equipment NCR: Patient Monitoring System Network Alert Storm

**Case ID:** MED-NCR-2024-0318  
**Date:** 2024-07-08  
**Unit:** General Medical Ward, Floor 6  
**Device:** Patient Monitor PM-4400  
**Manufacturer:** MedTech Corp  
**Serial Number:** PM-4400-SN-20231109  
**Severity:** Major  
**Reported By:** IT Clinical Systems Manager Ben Walsh  

## Defect Description
Central monitoring station (Floor 6, Nurses Station A) received 847 false alarm 
events over a 4-hour window from PM-4400 units. Alarms indicated SpO₂ low (<90%) 
and HR critical (>150 bpm) simultaneously across 12 bedside monitors. Clinical 
verification confirmed all patients stable with normal vital signs. Alert storm 
caused significant alarm fatigue and nursing staff distracted from genuine care needs.

## Root Cause
Network configuration change by hospital IT (VLAN segmentation update at 02:00 on 
the date of incident) caused brief packet loss on the patient monitoring subnet. 
PM-4400 firmware v3.2.1 interprets loss of network heartbeat signal as a patient 
data loss condition and generates SpO₂ and HR alarms. This is a known issue in 
firmware v3.2.x (see also MED-NCR-2024-0089 for related PM-4400 firmware defects). 
Firmware v3.3.0 includes a fix that differentiates network loss from sensor loss.

## Corrective Action
1. Expedite PM-4400 firmware update to v3.3.0 (all 47 units — NOW urgent given two NCRs)
2. Hospital IT to implement change freeze on patient monitoring VLAN during business hours
3. Add PM-4400 monitoring subnet to IT change management critical path checklist
4. MedTech Corp escalated — two critical NCRs for PM-4400 within 5 months triggers 
   quarterly quality review meeting requirement per vendor contract clause 8.3

## Related Devices
- Central Station Monitor CSM-F6-A
- Patient Monitor PM-4400 (fleet-wide — all 47 units)
- Network Switch SW-MED-F6-01
```

---

## Phase 3 — Frontend

### Step 10 — API Functions in `frontend/app/lib/api.ts`

Add after the existing `getAnalyticsDiseases` function:

```typescript
// ── LightRAG API functions ─────────────────────────────────────────────────

export interface LightRAGStatus {
  domain: string;
  indexed: boolean;
  doc_count: number;
  entity_count: number;
  relation_count: number;
  index_job_status: "idle" | "indexing" | "done" | "error";
}

export interface LightRAGGraphNode {
  id: string;
  label: string;
  type: string;
  description: string;
  weight: number;
}

export interface LightRAGGraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  weight: number;
  description: string;
}

export interface LightRAGGraphData {
  nodes: LightRAGGraphNode[];
  edges: LightRAGGraphEdge[];
  status: "ok" | "not_indexed";
  domain: string;
  node_count: number;
  edge_count: number;
}

export interface LightRAGQueryResponse {
  answer: string;
  mode: string;
  domain: string;
}

export async function getLightRAGStatus(domain: string): Promise<LightRAGStatus> {
  const res = await apiFetch(`/lightrag/status/${domain}`);
  if (!res.ok) throw new Error(`LightRAG status failed: ${res.status}`);
  return res.json();
}

export async function triggerLightRAGIndex(domain: string): Promise<{
  message: string; domain: string; status: string;
}> {
  const res = await apiFetch(`/lightrag/index/${domain}`, { method: "POST" });
  if (!res.ok) throw new Error(`LightRAG index trigger failed: ${res.status}`);
  return res.json();
}

export async function getLightRAGGraph(
  domain: string,
  maxNodes: number = 200
): Promise<LightRAGGraphData> {
  const res = await apiFetch(`/lightrag/graph/${domain}?max_nodes=${maxNodes}`);
  if (!res.ok) throw new Error(`LightRAG graph export failed: ${res.status}`);
  return res.json();
}

export async function queryLightRAG(body: {
  domain: string;
  query: string;
  mode: string;
}): Promise<LightRAGQueryResponse> {
  const res = await apiFetch("/lightrag/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`LightRAG query failed: ${res.status}`);
  return res.json();
}

export async function getLightRAGModes(): Promise<{
  modes: string[];
  default: string;
  descriptions: Record<string, string>;
}> {
  const res = await apiFetch("/lightrag/modes");
  if (!res.ok) throw new Error(`LightRAG modes failed: ${res.status}`);
  return res.json();
}
```

---

### Step 11 — `frontend/app/components/LightRAGGraphViewer.tsx`

Standalone React Flow component. Do NOT modify existing `GraphViewer.tsx`.

Key implementation requirements:

**Node type → color + shape mapping:**
```typescript
const NODE_TYPE_CONFIG: Record<string, { color: string; shape: string }> = {
  // Aircraft entities
  component: { color: "#6b7280", shape: "rectangle" },     // gray
  supplier:  { color: "#a855f7", shape: "hexagon" },        // purple --col-purple
  engineer:  { color: "#3b82f6", shape: "circle" },         // blue
  aircraft:  { color: "#0891b2", shape: "rounded" },        // teal --col-cyan
  product:   { color: "#0891b2", shape: "rounded" },        // teal
  part:      { color: "#6b7280", shape: "rectangle" },      // gray
  defect:    { color: "#ef4444", shape: "diamond" },        // red --col-red
  failure:   { color: "#ef4444", shape: "diamond" },        // red
  // Medical entities
  device:    { color: "#0891b2", shape: "rounded" },        // teal
  hospital:  { color: "#a855f7", shape: "hexagon" },        // purple
  doctor:    { color: "#3b82f6", shape: "circle" },         // blue
  person:    { color: "#3b82f6", shape: "circle" },         // blue
  // Default
  entity:    { color: "#06b6d4", shape: "circle" },         // cyan --col-cyan
  default:   { color: "#06b6d4", shape: "circle" },         // cyan
};
```

**Node size:** `Math.max(40, Math.min(80, 40 + node.weight * 10))` pixels

**Edge stroke width:** `Math.max(1, Math.min(4, edge.weight))` 

**React Flow config:**
```typescript
<ReactFlow
  nodes={rfNodes}
  edges={rfEdges}
  nodeTypes={nodeTypes}
  fitView
  fitViewOptions={{ padding: 0.2 }}
  minZoom={0.1}
  maxZoom={2.5}
  onNodeClick={(_, node) => onNodeClick(node)}
  proOptions={{ hideAttribution: true }}
>
  <MiniMap
    nodeColor={(n) => NODE_TYPE_CONFIG[n.data?.type || "default"]?.color || "#06b6d4"}
    maskColor="rgba(0,0,0,0.7)"
    style={{ background: "#0f1623", border: "1px solid rgba(6,182,212,0.2)" }}
  />
  <Controls style={{ background: "#0f1623", border: "1px solid rgba(6,182,212,0.2)" }} />
  <Background variant={BackgroundVariant.Dots} color="#1e293b" gap={20} size={1} />
</ReactFlow>
```

**Layout algorithm:** Use `dagre` for automatic layout (install if not present: `npm install dagre @types/dagre`). Apply before rendering:
```typescript
import dagre from "dagre";

function applyDagreLayout(nodes: Node[], edges: Edge[], direction: "LR" | "TB" = "TB") {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction, nodesep: 60, ranksep: 80 });
  nodes.forEach((n) => dagreGraph.setNode(n.id, { width: 80, height: 40 }));
  edges.forEach((e) => dagreGraph.setEdge(e.source, e.target));
  dagre.layout(dagreGraph);
  return nodes.map((n) => {
    const pos = dagreGraph.node(n.id);
    return { ...n, position: { x: pos.x - 40, y: pos.y - 20 } };
  });
}
```

**Props interface:**
```typescript
interface LightRAGGraphViewerProps {
  nodes: LightRAGGraphNode[];
  edges: LightRAGGraphEdge[];
  onNodeClick: (node: { id: string; data: LightRAGGraphNode }) => void;
  loading?: boolean;
  domain: string;
}
```

---

### Step 12 — `frontend/app/lightrag/page.tsx`

Full page. Critical layout and UX requirements:

**Page outer div:**
```tsx
<div style={{ height: "calc(100vh - 46px)", width: "100%" }} className="flex flex-col bg-[#0a0e17]">
```

**Header bar:**
```tsx
<div className="flex items-center justify-between px-4 py-2 border-b border-cyan-900/30">
  <h1 className="font-[Orbitron] text-cyan-400 tracking-widest text-sm uppercase">
    LIGHTRAG // KNOWLEDGE GRAPH EXPLORER
  </h1>
  {/* Domain tabs */}
  <div className="flex gap-2">
    {(["aircraft", "medical"] as const).map((d) => (
      <button
        key={d}
        onClick={() => setDomain(d)}
        className={`font-[Orbitron] text-xs px-3 py-1 tracking-wider uppercase border transition-all
          ${domain === d
            ? "bg-cyan-900/40 border-cyan-400 text-cyan-300"
            : "border-cyan-900/30 text-cyan-700 hover:border-cyan-600 hover:text-cyan-500"
          }`}
      >
        {d.toUpperCase()}
      </button>
    ))}
  </div>
</div>
```

**Main content: 2-column grid:**
```tsx
<div className="flex flex-1 overflow-hidden">
  {/* Left control panel - 300px fixed */}
  <div className="w-[300px] flex-shrink-0 flex flex-col gap-3 p-3 border-r border-cyan-900/30 overflow-y-auto">
    {/* Status card */}
    {/* Max nodes slider */}
    {/* Query section */}
  </div>
  {/* Right graph + detail */}
  <div className="flex-1 flex flex-col overflow-hidden">
    {/* Graph stats bar */}
    {/* React Flow graph */}
    {/* Node detail panel (conditional) */}
  </div>
</div>
```

**Status card:**
- Green dot (`bg-green-400`) if `status.indexed`, amber dot (`bg-amber-400`) if not
- Show `entity_count` entities, `relation_count` relations, `doc_count` documents
- INDEX DATA button: `POST /lightrag/index/{domain}`, then poll `GET /lightrag/status/{domain}` every 3 seconds until `index_job_status` is `"done"` or `"error"`
- While `index_job_status === "indexing"`: spinner + "INDEXING... (1-3 min)"
- After done: call `loadGraph()`

**Query section:**
- Textarea input placeholder: "Query the knowledge graph..."
- Mode select with all 5 modes (descriptions as option tooltips)
- Submit button
- Results card: display `answer` in a scrollable `<pre>` or `<p>` with `font-[Rajdhani]`

**Empty state** (when `nodes.length === 0`):
```tsx
<div className="flex flex-col items-center justify-center h-full gap-4 text-cyan-700">
  <Network size={48} className="opacity-30" />
  <p className="font-[Orbitron] text-xs tracking-widest uppercase">
    Knowledge graph is empty
  </p>
  <p className="font-[Rajdhani] text-sm">
    Click INDEX DATA to extract entities and build the graph
  </p>
  <a href="https://github.com/HKUDS/LightRAG" target="_blank"
    className="text-xs text-cyan-600 hover:text-cyan-400 underline font-[JetBrains_Mono]">
    Learn about LightRAG →
  </a>
</div>
```

**Node detail panel** (shown when a node is clicked — 120px tall at bottom of graph panel):
```tsx
<div className="border-t border-cyan-900/30 bg-[#0f1623] p-3 font-[JetBrains_Mono] text-xs">
  <div className="flex justify-between items-start">
    <div>
      <span className="text-cyan-400 font-bold uppercase">{selectedNode.label}</span>
      <span className="ml-2 text-cyan-700">TYPE: {selectedNode.type.toUpperCase()}</span>
    </div>
    <button onClick={() => setSelectedNode(null)} className="text-cyan-800 hover:text-cyan-400">✕</button>
  </div>
  <p className="text-cyan-600 mt-1 line-clamp-2">{selectedNode.description || "No description."}</p>
  <div className="flex gap-4 mt-1 text-cyan-800">
    <span>CONNECTIONS: {connectionCount}</span>
    <span>WEIGHT: {selectedNode.weight.toFixed(2)}</span>
  </div>
</div>
```

**Graph stats bar** (between graph and node detail):
```tsx
<div className="flex gap-4 px-3 py-1 border-b border-cyan-900/20 font-[JetBrains_Mono] text-xs text-cyan-700">
  <span>{graphData.node_count} ENTITIES</span>
  <span>|</span>
  <span>{graphData.edge_count} RELATIONS</span>
  <span>|</span>
  <span>{domain.toUpperCase()} DOMAIN</span>
  <span>|</span>
  <span>LIGHTRAG v1.3+</span>
</div>
```

**State hooks needed:**
```typescript
const [domain, setDomain] = useState<"aircraft" | "medical">("aircraft");
const [status, setStatus] = useState<LightRAGStatus | null>(null);
const [graphData, setGraphData] = useState<LightRAGGraphData | null>(null);
const [selectedNode, setSelectedNode] = useState<LightRAGGraphNode | null>(null);
const [query, setQuery] = useState("");
const [mode, setMode] = useState("hybrid");
const [queryResult, setQueryResult] = useState<string | null>(null);
const [maxNodes, setMaxNodes] = useState(200);
const [loading, setLoading] = useState(false);
const [indexing, setIndexing] = useState(false);
const [queryLoading, setQueryLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
const pollRef = useRef<NodeJS.Timeout | null>(null);
```

On `domain` change: clear `selectedNode`, clear `queryResult`, reload `status` and `graphData`.

On unmount: clear `pollRef` interval.

---

### Step 13 — `frontend/app/lightrag/loading.tsx`

```tsx
export default function LightRAGLoading() {
  return (
    <div
      style={{ height: "calc(100vh - 46px)" }}
      className="flex items-center justify-center bg-[#0a0e17]"
    >
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        <p className="font-[Orbitron] text-cyan-600 text-xs tracking-widest uppercase">
          Loading LightRAG Explorer...
        </p>
      </div>
    </div>
  );
}
```

---

### Step 14 — AppHeader Nav Item

In `frontend/app/components/AppHeader.tsx`, add to `NAV_ITEMS`:
```typescript
import { Network } from "lucide-react"; // add to existing lucide-react import

// Add to NAV_ITEMS array (after the EXAMPLES entry):
{ href: "/lightrag", label: "LIGHTRAG", icon: Network, accent: "--col-cyan" },
```

---

### Step 15 — Middleware Protection

In `frontend/middleware.ts`, add `/lightrag` to the protected routes list alongside `/dashboard`, `/data`, `/examples`, etc.

---

## Phase 4 — Tests

### `backend/tests/test_lightrag_service.py`

```python
"""
Tests for LightRAG service layer.
Uses mocks to avoid actual LLM/embedding calls.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from pathlib import Path


# ── Status endpoint ────────────────────────────────────────────────────────────

def test_lightrag_status_aircraft(client):
    """GET /lightrag/status/aircraft returns 200 with correct shape."""
    response = client.get("/lightrag/status/aircraft")
    assert response.status_code == 200
    data = response.json()
    assert "domain" in data
    assert "indexed" in data
    assert "entity_count" in data
    assert "relation_count" in data
    assert data["domain"] == "aircraft"


def test_lightrag_status_medical(client):
    """GET /lightrag/status/medical returns 200 with correct shape."""
    response = client.get("/lightrag/status/medical")
    assert response.status_code == 200
    assert response.json()["domain"] == "medical"


def test_lightrag_status_invalid_domain(client):
    """GET /lightrag/status/badvalue returns 422."""
    response = client.get("/lightrag/status/badvalue")
    assert response.status_code == 422


# ── Index endpoint ─────────────────────────────────────────────────────────────

def test_lightrag_index_returns_immediately(client):
    """POST /lightrag/index/aircraft returns 200 immediately (background task)."""
    response = client.post("/lightrag/index/aircraft")
    assert response.status_code == 200
    data = response.json()
    assert data["domain"] == "aircraft"
    assert "status" in data


def test_lightrag_index_invalid_domain(client):
    """POST /lightrag/index/badvalue returns 422."""
    response = client.post("/lightrag/index/badvalue")
    assert response.status_code == 422


# ── Graph endpoint ─────────────────────────────────────────────────────────────

def test_lightrag_graph_shape(client):
    """GET /lightrag/graph/aircraft returns correct JSON shape."""
    response = client.get("/lightrag/graph/aircraft")
    assert response.status_code == 200
    data = response.json()
    assert "nodes" in data
    assert "edges" in data
    assert "status" in data
    assert "node_count" in data
    assert "edge_count" in data
    assert isinstance(data["nodes"], list)
    assert isinstance(data["edges"], list)


def test_lightrag_graph_empty_before_index(client):
    """GET /lightrag/graph/aircraft on unindexed domain returns empty nodes."""
    # Before indexing, nodes should be [] or minimal
    response = client.get("/lightrag/graph/aircraft")
    assert response.status_code == 200
    # status is either "ok" or "not_indexed"
    assert response.json()["status"] in ("ok", "not_indexed")


def test_lightrag_graph_max_nodes_param(client):
    """GET /lightrag/graph/aircraft?max_nodes=50 is accepted."""
    response = client.get("/lightrag/graph/aircraft?max_nodes=50")
    assert response.status_code == 200


def test_lightrag_graph_max_nodes_too_small(client):
    """GET /lightrag/graph/aircraft?max_nodes=5 returns 422 (min is 10)."""
    response = client.get("/lightrag/graph/aircraft?max_nodes=5")
    assert response.status_code == 422


# ── Query endpoint ─────────────────────────────────────────────────────────────

@patch("backend.app.lightrag_service.graph_exporter.get_lightrag")
def test_lightrag_query_shape(mock_get_rag, client):
    """POST /lightrag/query returns {answer, mode, domain}."""
    mock_rag = AsyncMock()
    mock_rag.aquery = AsyncMock(return_value="Test answer about hydraulic systems.")
    mock_get_rag.return_value = mock_rag

    response = client.post("/lightrag/query", json={
        "domain": "aircraft",
        "query": "What are the hydraulic failures?",
        "mode": "hybrid",
    })
    assert response.status_code == 200
    data = response.json()
    assert "answer" in data
    assert "mode" in data
    assert "domain" in data
    assert data["mode"] == "hybrid"
    assert data["domain"] == "aircraft"


def test_lightrag_query_invalid_domain(client):
    """POST /lightrag/query with bad domain returns 422."""
    response = client.post("/lightrag/query", json={
        "domain": "mars",
        "query": "test",
        "mode": "hybrid",
    })
    assert response.status_code == 422


def test_lightrag_query_invalid_mode(client):
    """POST /lightrag/query with bad mode returns 422."""
    response = client.post("/lightrag/query", json={
        "domain": "aircraft",
        "query": "test",
        "mode": "ultrafast_mode",
    })
    assert response.status_code == 422


# ── Modes endpoint ─────────────────────────────────────────────────────────────

def test_lightrag_modes(client):
    """GET /lightrag/modes returns list including 'hybrid'."""
    response = client.get("/lightrag/modes")
    assert response.status_code == 200
    data = response.json()
    assert "modes" in data
    assert "hybrid" in data["modes"]
    assert len(data["modes"]) == 5


# ── Domain validation ──────────────────────────────────────────────────────────

def test_valid_domains_accepted(client):
    """Both 'aircraft' and 'medical' are accepted domains."""
    for domain in ("aircraft", "medical"):
        r = client.get(f"/lightrag/status/{domain}")
        assert r.status_code == 200, f"Expected 200 for domain '{domain}'"


# ── Graph exporter unit tests ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_export_graph_empty_returns_not_indexed():
    """export_graph returns not_indexed when LightRAG graph is empty."""
    import networkx as nx
    from backend.app.lightrag_service.graph_exporter import export_graph

    with patch("backend.app.lightrag_service.graph_exporter.get_lightrag") as mock_get:
        mock_rag = MagicMock()
        mock_rag.chunk_entity_relation_graph._graph = nx.Graph()
        mock_get.return_value = mock_rag

        result = await export_graph("aircraft", max_nodes=200)
        assert result["status"] == "not_indexed"
        assert result["nodes"] == []
        assert result["edges"] == []


@pytest.mark.asyncio
async def test_export_graph_with_nodes():
    """export_graph converts NetworkX graph to correct JSON structure."""
    import networkx as nx
    from backend.app.lightrag_service.graph_exporter import export_graph

    G = nx.Graph()
    G.add_node("AeroCo Industries", entity_type="supplier", description="Aerospace supplier", weight=2.0)
    G.add_node("Hydraulic Seal", entity_type="component", description="O-ring seal", weight=1.0)
    G.add_edge("AeroCo Industries", "Hydraulic Seal", keywords="manufactures", weight=1.5, description="")

    with patch("backend.app.lightrag_service.graph_exporter.get_lightrag") as mock_get:
        mock_rag = MagicMock()
        mock_rag.chunk_entity_relation_graph._graph = G
        mock_get.return_value = mock_rag

        result = await export_graph("aircraft", max_nodes=200)
        assert result["status"] == "ok"
        assert result["node_count"] == 2
        assert result["edge_count"] == 1
        node_labels = {n["label"] for n in result["nodes"]}
        assert "AeroCo Industries" in node_labels


# ── Frontend file existence checks ─────────────────────────────────────────────

def test_lightrag_page_exists():
    """frontend/app/lightrag/page.tsx must exist."""
    page = Path("frontend/app/lightrag/page.tsx")
    assert page.exists(), "frontend/app/lightrag/page.tsx not found"


def test_lightrag_graph_viewer_exists():
    """frontend/app/components/LightRAGGraphViewer.tsx must exist."""
    component = Path("frontend/app/components/LightRAGGraphViewer.tsx")
    assert component.exists(), "LightRAGGraphViewer.tsx not found"


def test_lightrag_nav_item_in_appheader():
    """AppHeader.tsx must contain LIGHTRAG nav item."""
    header = Path("frontend/app/components/AppHeader.tsx")
    assert header.exists()
    content = header.read_text()
    assert "LIGHTRAG" in content, "LIGHTRAG nav item not found in AppHeader.tsx"


def test_lightrag_in_middleware():
    """middleware.ts must include /lightrag in protected routes."""
    middleware = Path("frontend/middleware.ts")
    assert middleware.exists()
    content = middleware.read_text()
    assert "/lightrag" in content, "/lightrag not found in middleware.ts protected routes"


def test_lightrag_demo_docs_exist():
    """Demo docs must exist for both domains."""
    for domain in ("aircraft", "medical"):
        domain_dir = Path(f"demo/lightrag_docs/{domain}")
        assert domain_dir.exists(), f"Demo docs dir not found: {domain_dir}"
        md_files = list(domain_dir.glob("*.md"))
        assert len(md_files) >= 5, f"Expected >=5 demo docs for {domain}, found {len(md_files)}"
```

---

## Phase 4 Configuration Files

### Add to `.env.example`

```bash
# ── LightRAG ────────────────────────────────────────────────────────────────────
# Working directories for LightRAG file-based storage (auto-created on first run)
LIGHTRAG_BASE_DIR=backend/data/lightrag
# Max nodes to return from graph export endpoint (default 200, max 1000)
LIGHTRAG_MAX_NODES=200
# Number of documents to insert per LightRAG batch (default 10)
LIGHTRAG_BATCH_SIZE=10
```

### Add to `docker-compose.yml`

Under the `backend` service volumes:
```yaml
volumes:
  - ./backend/data/lightrag:/app/data/lightrag
```

### Add to `backend/config.yaml`

```yaml
lightrag:
  base_dir: ./data/lightrag
  max_nodes: 200
  batch_size: 10
  # LightRAG uses Haiku for entity extraction (cost-efficient)
  # Sonnet is reserved for agent synthesis only
  llm_model: claude-haiku-4-5-20251001
  embedding_model: sentence-transformers/all-MiniLM-L6-v2
  embedding_dim: 384
  chunk_token_size: 600
  chunk_overlap_token_size: 80
```

---

## Implementation Order

Follow exactly — each step builds on the previous:

```
Phase 1 — Backend Service
  1.  Add lightrag-hku to requirements.txt, create data dirs, update .gitignore
  2.  Create backend/app/lightrag_service/__init__.py
  3.  Create rag_instance.py (singleton + LLM/embedding adapters)
  4.  Create indexer.py (DB → LightRAG text documents)
  5.  Create demo_indexer.py (fallback to demo docs)
  6.  Create graph_exporter.py (NetworkX → JSON)
  7.  Create backend/app/api/lightrag.py (6 FastAPI endpoints)
  8.  Register router in main.py
  9.  Add Pydantic schemas to schemas/models.py

Phase 2 — Demo Documents
  10. Write all 10 demo markdown files in demo/lightrag_docs/

Phase 3 — Frontend
  11. Add API functions to frontend/app/lib/api.ts
  12. Create LightRAGGraphViewer.tsx
  13. Create frontend/app/lightrag/page.tsx
  14. Create frontend/app/lightrag/loading.tsx
  15. Add LIGHTRAG nav item to AppHeader.tsx
  16. Add /lightrag to middleware.ts protected routes

Phase 4 — Config + Tests
  17. Add env vars to .env.example and config.yaml
  18. Add lightrag volume to docker-compose.yml
  19. Write backend/tests/test_lightrag_service.py
  20. Run tests and verify
```

---

## Final Acceptance Checklist

Run all 20 checks before marking this implementation complete:

```bash
# Backend
cd backend
.venv/Scripts/python -m pytest tests/test_lightrag_service.py -v
.venv/Scripts/python -m pytest tests/ --ignore=tests/test_lightrag_service.py
grep -r "get_event_loop" app/ && echo "FAIL: found get_event_loop" || echo "PASS: no get_event_loop"

# Frontend
cd frontend && npm run build  # must succeed with no errors
```

- [ ] `pip install lightrag-hku` succeeds in backend venv
- [ ] `GET /lightrag/status/aircraft` → 200 `{domain, indexed, entity_count, ...}`
- [ ] `GET /lightrag/status/medical` → 200
- [ ] `GET /lightrag/status/badvalue` → 422
- [ ] `POST /lightrag/index/aircraft` → 200 immediately, background indexing starts
- [ ] Poll `GET /lightrag/status/aircraft` — `index_job_status` transitions to `"done"`
- [ ] `GET /lightrag/graph/aircraft` after indexing → `nodes.length > 0`
- [ ] `GET /lightrag/graph/aircraft?max_nodes=5` → 422
- [ ] `POST /lightrag/query {domain:"aircraft", query:"hydraulic failures", mode:"hybrid"}` → 200 with `answer` string
- [ ] `POST /lightrag/query` with bad mode → 422
- [ ] `GET /lightrag/modes` → 5 modes including "hybrid"
- [ ] `/lightrag` page loads without JS console errors
- [ ] Domain tabs AIRCRAFT / MEDICAL switch domains correctly
- [ ] INDEX DATA button triggers indexing and shows progress state
- [ ] Graph renders with color-coded nodes after indexing
- [ ] Clicking a node shows the detail panel
- [ ] Query input + submit returns LightRAG answer text
- [ ] LIGHTRAG appears in AppHeader nav dropdown
- [ ] All 560 existing tests pass
- [ ] `grep -r "get_event_loop" backend/app/` → zero results
- [ ] `npm run build` → success (no TypeScript errors)
- [ ] Demo docs exist: `ls demo/lightrag_docs/aircraft/*.md` shows 5 files
- [ ] Demo docs exist: `ls demo/lightrag_docs/medical/*.md` shows 5 files

---

## Architecture Summary

```
User opens /lightrag
       │
       ▼
LightRAGPage (Next.js)
  ├── Domain tab: [AIRCRAFT] [MEDICAL]
  ├── Left Panel (Controls)
  │     ├── Status card → GET /lightrag/status/{domain}
  │     ├── INDEX DATA button → POST /lightrag/index/{domain}
  │     │                       polls GET /lightrag/status/{domain} every 3s
  │     ├── Max nodes slider
  │     └── Query input → POST /lightrag/query
  │
  └── Right Panel
        ├── Graph stats bar
        ├── LightRAGGraphViewer (React Flow)
        │     ← GET /lightrag/graph/{domain}?max_nodes=N
        │     ← dagre auto-layout
        │     ← color-coded by entity_type
        │     ← minimap + controls
        └── Node detail panel (on click)

Backend LightRAG Stack:
  rag_instance.py     → singleton LightRAG per domain
                         LLM: Haiku via existing get_async_fast_llm_client()
                         Embed: all-MiniLM-L6-v2 via existing EmbeddingModel
                         Storage: NetworkX (graph) + NanoVectorDB + JsonKV
  indexer.py          → PostgreSQL tables → LightRAG ainsert()
  demo_indexer.py     → demo/*.md → LightRAG ainsert() (fallback)
  graph_exporter.py   → rag.chunk_entity_relation_graph._graph → JSON
  api/lightrag.py     → 6 FastAPI endpoints

LightRAG Storage (file-based, separate from PostgreSQL):
  backend/data/lightrag/aircraft/   ← NetworkX .graphml, NanoVector files, Json KV
  backend/data/lightrag/medical/    ← same structure
```

---

*End of lightrag_prompt.md — Reference this file at the start of every Claude Code session with: `@lightrag_prompt.md @CLAUDE.md`*