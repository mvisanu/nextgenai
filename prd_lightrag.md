# LightRAG Knowledge Graph Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate LightRAG as a standalone knowledge graph explorer alongside the existing agent pipeline, exposing aircraft and medical domain graphs via 6 new FastAPI endpoints and a new `/lightrag` frontend page with React Flow visualization.

**Architecture:** LightRAG runs as an independent service layer (`backend/app/lightrag_service/`) using file-based storage at `backend/data/lightrag/{domain}/` — it does NOT touch the existing `graph_node`/`graph_edge` tables or any part of the orchestrator pipeline. The frontend adds a new `LightRAGGraphViewer.tsx` component and `/lightrag` page without modifying `GraphViewer.tsx` or any existing page.

**Tech Stack:** Python `lightrag-hku>=1.3.9`, `networkx>=3.0`, FastAPI `BackgroundTasks`, existing `EmbeddingModel` (all-MiniLM-L6-v2, 384 dims), Haiku via `get_async_fast_llm_client()`; Frontend: `@xyflow/react` (already installed), `dagre` + `@types/dagre` (new install), Next.js 16 App Router, Tailwind, SCADA theme.

---

## File Structure

### New files to create
```
backend/app/lightrag_service/__init__.py
backend/app/lightrag_service/rag_instance.py
backend/app/lightrag_service/indexer.py
backend/app/lightrag_service/demo_indexer.py
backend/app/lightrag_service/graph_exporter.py
backend/app/api/lightrag.py
backend/tests/test_lightrag_service.py
backend/data/lightrag/aircraft/.gitkeep
backend/data/lightrag/medical/.gitkeep
demo/lightrag_docs/aircraft/ncr_001.md
demo/lightrag_docs/aircraft/ncr_002.md
demo/lightrag_docs/aircraft/ncr_003.md
demo/lightrag_docs/aircraft/ncr_004.md
demo/lightrag_docs/aircraft/ncr_005.md
demo/lightrag_docs/medical/case_001.md
demo/lightrag_docs/medical/case_002.md
demo/lightrag_docs/medical/case_003.md
demo/lightrag_docs/medical/case_004.md
demo/lightrag_docs/medical/case_005.md
frontend/app/lightrag/page.tsx
frontend/app/lightrag/loading.tsx
frontend/app/components/LightRAGGraphViewer.tsx
```

### Existing files to modify
```
backend/requirements.txt                           — add lightrag-hku, networkx
backend/app/main.py                                — register lightrag router
backend/app/schemas/models.py                      — add 6 LightRAG Pydantic schemas
.gitignore                                         — add backend/data/lightrag/
docker-compose.yml                                 — add lightrag volume mount
backend/config.yaml                                — add lightrag config block
frontend/app/lib/api.ts                            — add 5 LightRAG API functions + interfaces
frontend/app/components/AppHeader.tsx              — add LIGHTRAG nav item
frontend/middleware.ts                             — add /lightrag to PROTECTED_PATHS
```

---

## Task 1: Install LightRAG — Dependencies and Data Directories

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `.gitignore` (repo root)
- Create: `backend/data/lightrag/aircraft/.gitkeep`
- Create: `backend/data/lightrag/medical/.gitkeep`

- [ ] **Step 1: Add lightrag-hku and networkx to requirements.txt**

Open `backend/requirements.txt` and add after the `# Observability` block at the end:
```
# ── LightRAG ────────────────────────────────────────────────────────────────────
lightrag-hku>=1.3.9
networkx>=3.0
```

- [ ] **Step 2: Add lightrag data directory to .gitignore**

Open `.gitignore` at the repo root and add:
```
backend/data/lightrag/
```
Keep the `.gitkeep` files tracked (they allow the directory structure to exist in git without content).

- [ ] **Step 3: Create the working directories and gitkeep files**

Run in the repo root (bash):
```bash
mkdir -p backend/data/lightrag/aircraft
mkdir -p backend/data/lightrag/medical
touch backend/data/lightrag/aircraft/.gitkeep
touch backend/data/lightrag/medical/.gitkeep
```

- [ ] **Step 4: Install the new packages in the venv**

```bash
cd backend
.venv/Scripts/python -m pip install "lightrag-hku>=1.3.9" "networkx>=3.0"
```

- [ ] **Step 5: Verify install**

```bash
cd backend
.venv/Scripts/python -c "import lightrag; import networkx; print('OK')"
```
Expected: `OK`

- [ ] **Step 6: Run existing test suite to confirm nothing broke**

```bash
cd backend
.venv/Scripts/python -m pytest tests/ -q --tb=short
```
Expected: 560 passed (or same count as before), 0 new failures.

- [ ] **Step 7: Commit**

```bash
git add backend/requirements.txt .gitignore backend/data/lightrag/
git commit -m "chore: add lightrag-hku + networkx dependencies and data dirs"
```

---

## Task 2: LightRAG Service Package Init

**Files:**
- Create: `backend/app/lightrag_service/__init__.py`

- [ ] **Step 1: Create the package init file**

```python
# LightRAG service layer
```

- [ ] **Step 2: Verify import**

```bash
cd backend
.venv/Scripts/python -c "import backend.app.lightrag_service; print('OK')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/lightrag_service/__init__.py
git commit -m "feat: add lightrag_service package skeleton"
```

---

## Task 3: LightRAG Singleton Instance Manager (`rag_instance.py`)

**Files:**
- Create: `backend/app/lightrag_service/rag_instance.py`

- [ ] **Step 1: Create `rag_instance.py`**

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

- [ ] **Step 2: Verify no get_event_loop usage**

```bash
grep -r "get_event_loop" backend/app/ && echo "FAIL" || echo "PASS"
```
Expected: `PASS`

- [ ] **Step 3: Verify import**

```bash
cd backend
.venv/Scripts/python -c "from backend.app.lightrag_service.rag_instance import get_lightrag, DOMAIN_DIRS; print(DOMAIN_DIRS)"
```
Expected: prints the two domain path dict.

- [ ] **Step 4: Verify ValueError on bad domain (async test)**

```bash
cd backend
.venv/Scripts/python -c "
import asyncio
from backend.app.lightrag_service.rag_instance import get_lightrag
async def t():
    try:
        await get_lightrag('badvalue')
        print('FAIL: no exception')
    except ValueError as e:
        print('PASS:', e)
asyncio.run(t())
"
```
Expected: `PASS: Unknown domain 'badvalue'...`

- [ ] **Step 5: Commit**

```bash
git add backend/app/lightrag_service/rag_instance.py
git commit -m "feat: add LightRAG singleton factory with Haiku LLM + MiniLM embedding adapters"
```

---

## Task 4: DB-to-LightRAG Indexer (`indexer.py`)

**Files:**
- Create: `backend/app/lightrag_service/indexer.py`

- [ ] **Step 1: Create `indexer.py`**

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

- [ ] **Step 2: Verify import**

```bash
cd backend
.venv/Scripts/python -c "from backend.app.lightrag_service.indexer import index_domain, check_index_status; print('OK')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/lightrag_service/indexer.py
git commit -m "feat: add LightRAG DB indexer with aircraft/medical domain support"
```

---

## Task 5: Demo Document Indexer (`demo_indexer.py`)

**Files:**
- Create: `backend/app/lightrag_service/demo_indexer.py`

- [ ] **Step 1: Create `demo_indexer.py`**

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

- [ ] **Step 2: Verify import**

```bash
cd backend
.venv/Scripts/python -c "from backend.app.lightrag_service.demo_indexer import index_demo_docs; print('OK')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/lightrag_service/demo_indexer.py
git commit -m "feat: add LightRAG demo document indexer fallback"
```

---

## Task 6: Graph Exporter (`graph_exporter.py`)

**Files:**
- Create: `backend/app/lightrag_service/graph_exporter.py`

- [ ] **Step 1: Create `graph_exporter.py`**

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

- [ ] **Step 2: Verify import**

```bash
cd backend
.venv/Scripts/python -c "from backend.app.lightrag_service.graph_exporter import export_graph, search_graph, VALID_MODES; print(VALID_MODES)"
```
Expected: prints the set of 5 modes.

- [ ] **Step 3: Commit**

```bash
git add backend/app/lightrag_service/graph_exporter.py
git commit -m "feat: add LightRAG graph exporter and query wrapper"
```

---

## Task 7: FastAPI Router (`backend/app/api/lightrag.py`)

**Files:**
- Create: `backend/app/api/lightrag.py`

- [ ] **Step 1: Create `lightrag.py` router with 6 endpoints**

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

- [ ] **Step 2: Verify import**

```bash
cd backend
.venv/Scripts/python -c "from backend.app.api.lightrag import router; print(len(router.routes), 'routes')"
```
Expected: `6 routes`

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/lightrag.py
git commit -m "feat: add LightRAG FastAPI router with 6 endpoints"
```

---

## Task 8: Register Router in `main.py`

**Files:**
- Modify: `backend/app/main.py`

- [ ] **Step 1: Add the import and router registration**

In `backend/app/main.py`, modify the import line at the top:
```python
from backend.app.api import analytics, docs, ingest, query, runs
```
Change to:
```python
from backend.app.api import analytics, docs, ingest, query, runs
from backend.app.api.lightrag import router as lightrag_router
```

Then add after the existing `app.include_router(analytics.router, ...)` line inside `create_app()`:
```python
    app.include_router(lightrag_router, prefix="/lightrag", tags=["lightrag"])
```

The full routers block should read:
```python
    # ------------------------------------------------------------------ Routers
    app.include_router(ingest.router, tags=["Ingestion"])
    app.include_router(query.router, tags=["Query"])
    app.include_router(docs.router, tags=["Documents"])
    app.include_router(runs.router, tags=["Runs"])
    app.include_router(analytics.router, tags=["Analytics"])
    app.include_router(lightrag_router, prefix="/lightrag", tags=["lightrag"])
```

- [ ] **Step 2: Verify router is registered (no 404)**

```bash
cd backend
.venv/Scripts/python -c "
from fastapi.testclient import TestClient
from backend.app.main import app
client = TestClient(app, raise_server_exceptions=False)
r = client.get('/lightrag/modes')
print(r.status_code, r.json())
"
```
Expected: `200` with modes dict.

- [ ] **Step 3: Run existing tests to confirm no regressions**

```bash
cd backend
.venv/Scripts/python -m pytest tests/ -q --tb=short --ignore=tests/test_lightrag_service.py
```
Expected: all previously passing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add backend/app/main.py
git commit -m "feat: register LightRAG router at /lightrag prefix in main.py"
```

---

## Task 9: Add Pydantic Schemas to `schemas/models.py`

**Files:**
- Modify: `backend/app/schemas/models.py`

- [ ] **Step 1: Append LightRAG schemas at the end of `schemas/models.py`**

Add after the last existing model (`HealthResponse` or `RunRecord`):
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

- [ ] **Step 2: Verify schemas import**

```bash
cd backend
.venv/Scripts/python -c "from backend.app.schemas.models import LightRAGGraphResponse, LightRAGStatusResponse, LightRAGQueryResponse; print('OK')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/models.py
git commit -m "feat: add LightRAG Pydantic response schemas to models.py"
```

---

## Task 10: Phase 1 Acceptance Check

- [ ] **Step 1: Verify no get_event_loop in app/**

```bash
grep -r "get_event_loop" backend/app/ && echo "FAIL: found get_event_loop" || echo "PASS: no get_event_loop"
```
Expected: `PASS: no get_event_loop`

- [ ] **Step 2: Smoke test all 6 endpoints with TestClient**

```bash
cd backend
.venv/Scripts/python -c "
from fastapi.testclient import TestClient
from backend.app.main import app
client = TestClient(app, raise_server_exceptions=False)

tests = [
    ('GET',  '/lightrag/status/aircraft',  200),
    ('GET',  '/lightrag/status/medical',   200),
    ('GET',  '/lightrag/status/badvalue',  422),
    ('POST', '/lightrag/index/aircraft',   200),
    ('GET',  '/lightrag/graph/aircraft',   200),
    ('GET',  '/lightrag/graph/aircraft?max_nodes=5', 422),
    ('GET',  '/lightrag/modes',            200),
    ('GET',  '/lightrag/index-status',     200),
]
for method, path, expected in tests:
    r = client.request(method, path)
    status = 'PASS' if r.status_code == expected else f'FAIL (got {r.status_code})'
    print(f'{status}: {method} {path}')
"
```
Expected: all lines show `PASS`.

- [ ] **Step 3: Run full existing test suite**

```bash
cd backend
.venv/Scripts/python -m pytest tests/ -q --ignore=tests/test_lightrag_service.py
```
Expected: same pass count as before, 0 new failures.

---

## Task 11: Demo Documents — Aircraft (5 NCR Markdown Files)

**Files:**
- Create: `demo/lightrag_docs/aircraft/ncr_001.md` through `ncr_005.md`

- [ ] **Step 1: Create demo/lightrag_docs/aircraft/ directory**

```bash
mkdir -p demo/lightrag_docs/aircraft
mkdir -p demo/lightrag_docs/medical
```

- [ ] **Step 2: Create `demo/lightrag_docs/aircraft/ncr_001.md`**

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

- [ ] **Step 3: Create `demo/lightrag_docs/aircraft/ncr_002.md`**

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

- [ ] **Step 4: Create `demo/lightrag_docs/aircraft/ncr_003.md`**

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

- [ ] **Step 5: Create `demo/lightrag_docs/aircraft/ncr_004.md`**

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

- [ ] **Step 6: Create `demo/lightrag_docs/aircraft/ncr_005.md`**

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

- [ ] **Step 7: Verify 5 aircraft demo docs exist**

```bash
ls demo/lightrag_docs/aircraft/*.md | wc -l
```
Expected: `5`

- [ ] **Step 8: Commit**

```bash
git add demo/lightrag_docs/aircraft/
git commit -m "feat: add 5 aircraft NCR demo documents for LightRAG indexing"
```

---

## Task 12: Demo Documents — Medical (5 Case Markdown Files)

**Files:**
- Create: `demo/lightrag_docs/medical/case_001.md` through `case_005.md`

- [ ] **Step 1: Create `demo/lightrag_docs/medical/case_001.md`**

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

- [ ] **Step 2: Create `demo/lightrag_docs/medical/case_002.md`**

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

- [ ] **Step 3: Create `demo/lightrag_docs/medical/case_003.md`**

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

- [ ] **Step 4: Create `demo/lightrag_docs/medical/case_004.md`**

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

- [ ] **Step 5: Create `demo/lightrag_docs/medical/case_005.md`**

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

- [ ] **Step 6: Verify 5 medical demo docs exist**

```bash
ls demo/lightrag_docs/medical/*.md | wc -l
```
Expected: `5`

- [ ] **Step 7: Commit**

```bash
git add demo/lightrag_docs/medical/
git commit -m "feat: add 5 medical NCR demo documents for LightRAG indexing"
```

---

## Task 13: Frontend — Install dagre and Add API Functions to `api.ts`

**Files:**
- Modify: `frontend/app/lib/api.ts`
- Modify: `frontend/package.json` (via npm install)

- [ ] **Step 1: Install dagre**

```bash
cd frontend
npm install dagre @types/dagre
```

- [ ] **Step 2: Verify dagre is in package.json**

```bash
grep dagre frontend/package.json
```
Expected: lines for `dagre` and `@types/dagre`.

- [ ] **Step 3: Append LightRAG interfaces and API functions to `frontend/app/lib/api.ts`**

Add after the last line of `frontend/app/lib/api.ts` (currently after `getAnalyticsDiseases`):

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
  return apiFetch<LightRAGStatus>(`/lightrag/status/${domain}`);
}

export async function triggerLightRAGIndex(domain: string): Promise<{
  message: string; domain: string; status: string;
}> {
  return apiFetch<{ message: string; domain: string; status: string }>(
    `/lightrag/index/${domain}`,
    { method: "POST" }
  );
}

export async function getLightRAGGraph(
  domain: string,
  maxNodes: number = 200
): Promise<LightRAGGraphData> {
  return apiFetch<LightRAGGraphData>(`/lightrag/graph/${domain}?max_nodes=${maxNodes}`);
}

export async function queryLightRAG(body: {
  domain: string;
  query: string;
  mode: string;
}): Promise<LightRAGQueryResponse> {
  return apiFetch<LightRAGQueryResponse>("/lightrag/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function getLightRAGModes(): Promise<{
  modes: string[];
  default: string;
  descriptions: Record<string, string>;
}> {
  return apiFetch<{ modes: string[]; default: string; descriptions: Record<string, string> }>(
    "/lightrag/modes"
  );
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd frontend
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/app/lib/api.ts
git commit -m "feat: add dagre dependency and LightRAG API client functions"
```

---

## Task 14: `LightRAGGraphViewer.tsx` Component

**Files:**
- Create: `frontend/app/components/LightRAGGraphViewer.tsx`

- [ ] **Step 1: Create `LightRAGGraphViewer.tsx`**

```tsx
"use client";

/**
 * LightRAGGraphViewer — Standalone React Flow graph for LightRAG knowledge graphs.
 * Do NOT modify GraphViewer.tsx — this is a completely separate component.
 * Uses dagre for automatic layout, SCADA theme colors, and minimap/controls.
 */

import React, { useCallback, useMemo } from "react";
import {
  ReactFlow,
  Node,
  Edge,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import type { LightRAGGraphNode, LightRAGGraphEdge } from "../lib/api";
import { Network } from "lucide-react";

// ── Node type → color mapping ──────────────────────────────────────────────────
const NODE_TYPE_CONFIG: Record<string, { color: string }> = {
  component: { color: "#6b7280" },
  supplier:  { color: "#a855f7" },
  engineer:  { color: "#3b82f6" },
  aircraft:  { color: "#0891b2" },
  product:   { color: "#0891b2" },
  part:      { color: "#6b7280" },
  defect:    { color: "#ef4444" },
  failure:   { color: "#ef4444" },
  device:    { color: "#0891b2" },
  hospital:  { color: "#a855f7" },
  doctor:    { color: "#3b82f6" },
  person:    { color: "#3b82f6" },
  entity:    { color: "#06b6d4" },
  default:   { color: "#06b6d4" },
};

function getNodeColor(type: string): string {
  return (NODE_TYPE_CONFIG[type] ?? NODE_TYPE_CONFIG.default).color;
}

// ── Dagre auto-layout ──────────────────────────────────────────────────────────
function applyDagreLayout(
  nodes: Node[],
  edges: Edge[],
  direction: "LR" | "TB" = "TB"
): Node[] {
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

// ── Props ──────────────────────────────────────────────────────────────────────
interface LightRAGGraphViewerProps {
  nodes: LightRAGGraphNode[];
  edges: LightRAGGraphEdge[];
  onNodeClick: (node: { id: string; data: LightRAGGraphNode }) => void;
  loading?: boolean;
  domain: string;
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function LightRAGGraphViewer({
  nodes: rawNodes,
  edges: rawEdges,
  onNodeClick,
  loading = false,
  domain,
}: LightRAGGraphViewerProps) {
  // Convert API nodes to React Flow nodes
  const rfNodesRaw: Node[] = useMemo(
    () =>
      rawNodes.map((n) => {
        const size = Math.max(40, Math.min(80, 40 + n.weight * 10));
        const color = getNodeColor(n.type);
        return {
          id: n.id,
          position: { x: 0, y: 0 }, // overwritten by dagre
          data: { ...n, label: n.label },
          style: {
            background: color + "22",
            border: `1px solid ${color}`,
            color: color,
            borderRadius: 4,
            fontSize: 10,
            fontFamily: "JetBrains Mono, monospace",
            padding: "4px 8px",
            width: size,
            textAlign: "center" as const,
            whiteSpace: "nowrap" as const,
            overflow: "hidden" as const,
            textOverflow: "ellipsis" as const,
          },
        };
      }),
    [rawNodes]
  );

  // Convert API edges to React Flow edges
  const rfEdgesRaw: Edge[] = useMemo(
    () =>
      rawEdges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label || undefined,
        style: {
          stroke: "#0e7490",
          strokeWidth: Math.max(1, Math.min(4, e.weight)),
        },
        labelStyle: {
          fontSize: 9,
          fontFamily: "JetBrains Mono, monospace",
          fill: "#0e7490",
        },
      })),
    [rawEdges]
  );

  // Apply dagre layout
  const rfNodesLaid = useMemo(
    () => applyDagreLayout(rfNodesRaw, rfEdgesRaw, "TB"),
    [rfNodesRaw, rfEdgesRaw]
  );

  const [nodes, , onNodesChange] = useNodesState(rfNodesLaid);
  const [edges, , onEdgesChange] = useEdgesState(rfEdgesRaw);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onNodeClick({ id: node.id, data: node.data as LightRAGGraphNode });
    },
    [onNodeClick]
  );

  // Empty state
  if (!loading && rawNodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-cyan-700">
        <Network size={48} className="opacity-30" />
        <p className="font-[Orbitron] text-xs tracking-widest uppercase">
          Knowledge graph is empty
        </p>
        <p className="font-[Rajdhani] text-sm">
          Click INDEX DATA to extract entities and build the graph
        </p>
        <a
          href="https://github.com/HKUDS/LightRAG"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-cyan-600 hover:text-cyan-400 underline font-[JetBrains_Mono]"
        >
          Learn about LightRAG →
        </a>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          <p className="font-[Orbitron] text-cyan-600 text-xs tracking-widest uppercase">
            Loading graph...
          </p>
        </div>
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={handleNodeClick}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.1}
      maxZoom={2.5}
      proOptions={{ hideAttribution: true }}
    >
      <MiniMap
        nodeColor={(n) => getNodeColor((n.data as LightRAGGraphNode)?.type ?? "default")}
        maskColor="rgba(0,0,0,0.7)"
        style={{
          background: "#0f1623",
          border: "1px solid rgba(6,182,212,0.2)",
        }}
      />
      <Controls
        style={{
          background: "#0f1623",
          border: "1px solid rgba(6,182,212,0.2)",
        }}
      />
      <Background
        variant={BackgroundVariant.Dots}
        color="#1e293b"
        gap={20}
        size={1}
      />
    </ReactFlow>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend
npx tsc --noEmit
```
Expected: no errors related to `LightRAGGraphViewer.tsx`.

- [ ] **Step 3: Confirm GraphViewer.tsx is unmodified**

```bash
git diff frontend/app/components/GraphViewer.tsx
```
Expected: no changes (empty diff).

- [ ] **Step 4: Commit**

```bash
git add frontend/app/components/LightRAGGraphViewer.tsx
git commit -m "feat: add LightRAGGraphViewer component with dagre layout and SCADA theme"
```

---

## Task 15: `/lightrag` Page and Loading Skeleton

**Files:**
- Create: `frontend/app/lightrag/page.tsx`
- Create: `frontend/app/lightrag/loading.tsx`

- [ ] **Step 1: Create `frontend/app/lightrag/loading.tsx`**

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

- [ ] **Step 2: Create `frontend/app/lightrag/page.tsx`**

```tsx
"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  getLightRAGStatus,
  getLightRAGGraph,
  triggerLightRAGIndex,
  queryLightRAG,
  type LightRAGStatus,
  type LightRAGGraphData,
  type LightRAGGraphNode,
} from "../lib/api";

// Import LightRAGGraphViewer with SSR disabled (React Flow requires browser APIs)
const LightRAGGraphViewer = dynamic(
  () => import("../components/LightRAGGraphViewer"),
  { ssr: false }
);

const QUERY_MODES = [
  { value: "hybrid", label: "Hybrid (recommended)" },
  { value: "local",  label: "Local — entity-focused" },
  { value: "global", label: "Global — relationship-focused" },
  { value: "naive",  label: "Naive — basic vector search" },
  { value: "mix",    label: "Mix — KG + vector" },
];

export default function LightRAGPage() {
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

  // Count connections for selected node
  const connectionCount = selectedNode && graphData
    ? graphData.edges.filter(
        (e) => e.source === selectedNode.id || e.target === selectedNode.id
      ).length
    : 0;

  const loadStatus = useCallback(async () => {
    try {
      const s = await getLightRAGStatus(domain);
      setStatus(s);
      return s;
    } catch (err) {
      console.error("Status load failed:", err);
      return null;
    }
  }, [domain]);

  const loadGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const g = await getLightRAGGraph(domain, maxNodes);
      setGraphData(g);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [domain, maxNodes]);

  // Load status + graph on domain change
  useEffect(() => {
    setSelectedNode(null);
    setQueryResult(null);
    loadStatus();
    loadGraph();

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [domain]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleIndex = async () => {
    setError(null);
    setIndexing(true);
    try {
      await triggerLightRAGIndex(domain);
    } catch (err) {
      setError(String(err));
      setIndexing(false);
      return;
    }

    // Poll every 3 seconds until done or error
    pollRef.current = setInterval(async () => {
      const s = await loadStatus();
      if (!s) return;
      if (s.index_job_status === "done") {
        if (pollRef.current) clearInterval(pollRef.current);
        setIndexing(false);
        await loadGraph();
      } else if (s.index_job_status === "error") {
        if (pollRef.current) clearInterval(pollRef.current);
        setIndexing(false);
        setError("Indexing failed. Check backend logs.");
      }
    }, 3000);
  };

  const handleQuery = async () => {
    if (!query.trim()) return;
    setQueryLoading(true);
    setError(null);
    try {
      const result = await queryLightRAG({ domain, query: query.trim(), mode });
      setQueryResult(result.answer);
    } catch (err) {
      setError(String(err));
    } finally {
      setQueryLoading(false);
    }
  };

  const handleNodeClick = useCallback(
    (node: { id: string; data: LightRAGGraphNode }) => {
      setSelectedNode(node.data);
    },
    []
  );

  return (
    <div
      style={{ height: "calc(100vh - 46px)", width: "100%" }}
      className="flex flex-col bg-[#0a0e17]"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-cyan-900/30 flex-shrink-0">
        <h1 className="font-[Orbitron] text-cyan-400 tracking-widest text-sm uppercase">
          LIGHTRAG // KNOWLEDGE GRAPH EXPLORER
        </h1>
        <div className="flex gap-2">
          {(["aircraft", "medical"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDomain(d)}
              className={`font-[Orbitron] text-xs px-3 py-1 tracking-wider uppercase border transition-all
                ${
                  domain === d
                    ? "bg-cyan-900/40 border-cyan-400 text-cyan-300"
                    : "border-cyan-900/30 text-cyan-700 hover:border-cyan-600 hover:text-cyan-500"
                }`}
            >
              {d.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left control panel */}
        <div className="w-[300px] flex-shrink-0 flex flex-col gap-3 p-3 border-r border-cyan-900/30 overflow-y-auto">

          {/* Status card */}
          <div className="border border-cyan-900/30 bg-[#0f1623] p-3 rounded">
            <div className="flex items-center gap-2 mb-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  status?.indexed ? "bg-green-400" : "bg-amber-400"
                }`}
              />
              <span className="font-[Orbitron] text-xs text-cyan-400 tracking-wider uppercase">
                INDEX STATUS
              </span>
            </div>
            {status ? (
              <div className="font-[JetBrains_Mono] text-xs text-cyan-600 space-y-1">
                <div>{status.entity_count} ENTITIES</div>
                <div>{status.relation_count} RELATIONS</div>
                <div>{status.doc_count} DOCUMENTS</div>
                <div className="text-cyan-800 uppercase">{status.index_job_status}</div>
              </div>
            ) : (
              <div className="font-[JetBrains_Mono] text-xs text-cyan-800">Loading...</div>
            )}
            <button
              onClick={handleIndex}
              disabled={indexing}
              className="mt-2 w-full font-[Orbitron] text-xs px-3 py-1.5 tracking-wider uppercase border border-cyan-700 text-cyan-400 hover:bg-cyan-900/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {indexing ? "INDEXING... (1-3 min)" : "INDEX DATA"}
            </button>
            {indexing && (
              <div className="mt-1 flex items-center gap-2">
                <div className="w-3 h-3 border border-cyan-400 border-t-transparent rounded-full animate-spin" />
                <span className="font-[JetBrains_Mono] text-xs text-cyan-700">Processing...</span>
              </div>
            )}
          </div>

          {/* Max nodes slider */}
          <div className="border border-cyan-900/30 bg-[#0f1623] p-3 rounded">
            <label className="font-[Orbitron] text-xs text-cyan-400 tracking-wider uppercase block mb-2">
              MAX NODES: {maxNodes}
            </label>
            <input
              type="range"
              min={10}
              max={500}
              step={10}
              value={maxNodes}
              onChange={(e) => setMaxNodes(Number(e.target.value))}
              className="w-full accent-cyan-400"
            />
            <button
              onClick={loadGraph}
              disabled={loading}
              className="mt-2 w-full font-[Orbitron] text-xs px-3 py-1 tracking-wider uppercase border border-cyan-900/50 text-cyan-600 hover:border-cyan-700 hover:text-cyan-500 disabled:opacity-40 transition-all"
            >
              {loading ? "LOADING..." : "RELOAD GRAPH"}
            </button>
          </div>

          {/* Query section */}
          <div className="border border-cyan-900/30 bg-[#0f1623] p-3 rounded flex flex-col gap-2">
            <label className="font-[Orbitron] text-xs text-cyan-400 tracking-wider uppercase">
              QUERY GRAPH
            </label>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Query the knowledge graph..."
              rows={3}
              className="w-full bg-[#0a0e17] border border-cyan-900/40 text-cyan-300 font-[Rajdhani] text-sm p-2 rounded resize-none focus:outline-none focus:border-cyan-600 placeholder:text-cyan-900"
            />
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="w-full bg-[#0a0e17] border border-cyan-900/40 text-cyan-400 font-[JetBrains_Mono] text-xs p-1.5 rounded focus:outline-none focus:border-cyan-600"
            >
              {QUERY_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <button
              onClick={handleQuery}
              disabled={queryLoading || !query.trim()}
              className="w-full font-[Orbitron] text-xs px-3 py-1.5 tracking-wider uppercase bg-cyan-900/30 border border-cyan-700 text-cyan-300 hover:bg-cyan-900/50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {queryLoading ? "QUERYING..." : "SUBMIT QUERY"}
            </button>
            {queryResult && (
              <div className="border border-cyan-900/30 bg-[#0a0e17] p-2 rounded max-h-40 overflow-y-auto">
                <p className="font-[Rajdhani] text-xs text-cyan-400 whitespace-pre-wrap">
                  {queryResult}
                </p>
              </div>
            )}
          </div>

          {/* Error display */}
          {error && (
            <div className="border border-red-900/50 bg-red-950/20 p-2 rounded">
              <p className="font-[JetBrains_Mono] text-xs text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Right panel: graph + node detail */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Graph stats bar */}
          <div className="flex gap-4 px-3 py-1 border-b border-cyan-900/20 font-[JetBrains_Mono] text-xs text-cyan-700 flex-shrink-0">
            <span>{graphData?.node_count ?? 0} ENTITIES</span>
            <span>|</span>
            <span>{graphData?.edge_count ?? 0} RELATIONS</span>
            <span>|</span>
            <span>{domain.toUpperCase()} DOMAIN</span>
            <span>|</span>
            <span>LIGHTRAG v1.3+</span>
          </div>

          {/* React Flow graph */}
          <div className="flex-1 overflow-hidden">
            <LightRAGGraphViewer
              nodes={graphData?.nodes ?? []}
              edges={graphData?.edges ?? []}
              onNodeClick={handleNodeClick}
              loading={loading}
              domain={domain}
            />
          </div>

          {/* Node detail panel */}
          {selectedNode && (
            <div className="border-t border-cyan-900/30 bg-[#0f1623] p-3 font-[JetBrains_Mono] text-xs flex-shrink-0">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-cyan-400 font-bold uppercase">
                    {selectedNode.label}
                  </span>
                  <span className="ml-2 text-cyan-700">
                    TYPE: {selectedNode.type.toUpperCase()}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="text-cyan-800 hover:text-cyan-400"
                >
                  ✕
                </button>
              </div>
              <p className="text-cyan-600 mt-1 line-clamp-2">
                {selectedNode.description || "No description."}
              </p>
              <div className="flex gap-4 mt-1 text-cyan-800">
                <span>CONNECTIONS: {connectionCount}</span>
                <span>WEIGHT: {selectedNode.weight.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/lightrag/page.tsx frontend/app/lightrag/loading.tsx
git commit -m "feat: add /lightrag page with two-panel layout and LightRAGGraphViewer"
```

---

## Task 16: AppHeader Nav Item

**Files:**
- Modify: `frontend/app/components/AppHeader.tsx`

- [ ] **Step 1: Add Network to the lucide-react import**

In `frontend/app/components/AppHeader.tsx`, the current import line is:
```typescript
import { LayoutDashboard, HelpCircle, Database, GraduationCap, FlaskConical, GitBranch, Stethoscope, ChevronDown, Bot, Home, Building2, LogOut } from "lucide-react";
```

Change to:
```typescript
import { LayoutDashboard, HelpCircle, Database, GraduationCap, FlaskConical, GitBranch, Stethoscope, ChevronDown, Bot, Home, Building2, LogOut, Network } from "lucide-react";
```

- [ ] **Step 2: Add LIGHTRAG to NAV_ITEMS array**

In `AppHeader.tsx`, the current last item in `NAV_ITEMS` is:
```typescript
  { href: "/faq",              label: "FAQ",       icon: HelpCircle,     accent: "--col-cyan"   },
```

Add after it (before the `] as const;`):
```typescript
  { href: "/lightrag",         label: "LIGHTRAG",  icon: Network,        accent: "--col-cyan"   },
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Verify LIGHTRAG appears in the header**

```bash
grep "LIGHTRAG" frontend/app/components/AppHeader.tsx
```
Expected: at least one match showing the nav item.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/components/AppHeader.tsx
git commit -m "feat: add LIGHTRAG nav item to AppHeader"
```

---

## Task 17: Middleware Protection for `/lightrag`

**Files:**
- Modify: `frontend/middleware.ts`

- [ ] **Step 1: Add /lightrag to PROTECTED_PATHS**

In `frontend/middleware.ts`, the current `PROTECTED_PATHS` array is:
```typescript
const PROTECTED_PATHS = [
  '/',
  '/dashboard',
  '/data',
  '/review',
  '/examples',
  '/medical-examples',
  '/agent',
  '/diagram',
  '/faq',
]
```

Change to:
```typescript
const PROTECTED_PATHS = [
  '/',
  '/dashboard',
  '/data',
  '/review',
  '/examples',
  '/medical-examples',
  '/agent',
  '/diagram',
  '/faq',
  '/lightrag',
]
```

- [ ] **Step 2: Verify /lightrag is in the file**

```bash
grep "/lightrag" frontend/middleware.ts
```
Expected: one match in `PROTECTED_PATHS`.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/middleware.ts
git commit -m "feat: add /lightrag to middleware protected routes"
```

---

## Task 18: Configuration Files — `.env.example`, `docker-compose.yml`, `backend/config.yaml`

**Files:**
- Modify: `.env.example` (or `.env` at repo root if no example file exists — create `.env.example`)
- Modify: `docker-compose.yml`
- Modify: `backend/config.yaml`

- [ ] **Step 1: Add LightRAG env vars to `.env.example`**

If `.env.example` does not exist, create it. Add:
```bash
# ── LightRAG ────────────────────────────────────────────────────────────────────
# Working directories for LightRAG file-based storage (auto-created on first run)
LIGHTRAG_BASE_DIR=backend/data/lightrag
# Max nodes to return from graph export endpoint (default 200, max 1000)
LIGHTRAG_MAX_NODES=200
# Number of documents to insert per LightRAG batch (default 10)
LIGHTRAG_BATCH_SIZE=10
```

- [ ] **Step 2: Add lightrag volume mount to `docker-compose.yml`**

In `docker-compose.yml`, the backend service `volumes` block currently reads:
```yaml
    volumes:
      - ./data:/workspace/backend/data
      - ./demo:/workspace/backend/demo
      - ./config.yaml:/workspace/backend/config.yaml
```

Change to:
```yaml
    volumes:
      - ./data:/workspace/backend/data
      - ./backend/data/lightrag:/app/data/lightrag
      - ./demo:/workspace/backend/demo
      - ./config.yaml:/workspace/backend/config.yaml
```

- [ ] **Step 3: Add lightrag config block to `backend/config.yaml`**

Append to `backend/config.yaml`:
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

- [ ] **Step 4: Commit**

```bash
git add .env.example docker-compose.yml backend/config.yaml
git commit -m "chore: add LightRAG env vars, docker volume mount, and config.yaml block"
```

---

## Task 19: Backend Tests (`test_lightrag_service.py`)

**Files:**
- Create: `backend/tests/test_lightrag_service.py`

- [ ] **Step 1: Create `backend/tests/test_lightrag_service.py`**

```python
"""
Tests for LightRAG service layer.
Uses mocks to avoid actual LLM/embedding calls.
All tests use FastAPI TestClient against the real app (no DB required for routing).
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from pathlib import Path
from fastapi.testclient import TestClient
from backend.app.main import app

# Shared test client fixture
@pytest.fixture
def client():
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


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


def test_no_get_event_loop_in_lightrag_service():
    """rag_instance.py must not use get_event_loop()."""
    rag_file = Path("backend/app/lightrag_service/rag_instance.py")
    assert rag_file.exists()
    content = rag_file.read_text()
    assert "get_event_loop" not in content, "get_event_loop() found in rag_instance.py — use get_running_loop()"
```

- [ ] **Step 2: Run only the new test file**

```bash
cd backend
.venv/Scripts/python -m pytest tests/test_lightrag_service.py -v
```
Expected: all tests pass (the async graph exporter unit tests will pass via mock; the frontend file tests will pass if Tasks 14–17 are complete).

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_lightrag_service.py
git commit -m "test: add test_lightrag_service.py — 20 tests for LightRAG endpoints and service"
```

---

## Task 20: Final Acceptance Check

- [ ] **Step 1: Run the full LightRAG test suite**

```bash
cd backend
.venv/Scripts/python -m pytest tests/test_lightrag_service.py -v
```
Expected: all 20 tests pass.

- [ ] **Step 2: Run all 560 existing tests**

```bash
cd backend
.venv/Scripts/python -m pytest tests/ -q --tb=short
```
Expected: 560+ tests pass, 0 new failures.

- [ ] **Step 3: Verify no get_event_loop anywhere in app/**

```bash
grep -r "get_event_loop" backend/app/ && echo "FAIL: found get_event_loop" || echo "PASS: no get_event_loop"
```
Expected: `PASS: no get_event_loop`

- [ ] **Step 4: Build frontend**

```bash
cd frontend
npm run build
```
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 5: Verify demo docs**

```bash
ls demo/lightrag_docs/aircraft/*.md | wc -l
ls demo/lightrag_docs/medical/*.md | wc -l
```
Expected: `5` and `5`.

- [ ] **Step 6: Smoke test all endpoints**

```bash
cd backend
.venv/Scripts/python -c "
from fastapi.testclient import TestClient
from backend.app.main import app
client = TestClient(app, raise_server_exceptions=False)

checks = [
    ('GET',  '/lightrag/status/aircraft',           200),
    ('GET',  '/lightrag/status/medical',            200),
    ('GET',  '/lightrag/status/badvalue',           422),
    ('POST', '/lightrag/index/aircraft',            200),
    ('POST', '/lightrag/index/badvalue',            422),
    ('GET',  '/lightrag/graph/aircraft',            200),
    ('GET',  '/lightrag/graph/aircraft?max_nodes=5',422),
    ('GET',  '/lightrag/modes',                     200),
    ('GET',  '/lightrag/index-status',              200),
]
all_pass = True
for method, path, expected in checks:
    r = client.request(method, path)
    ok = r.status_code == expected
    print(f\"{'PASS' if ok else 'FAIL'}: {method} {path} -> {r.status_code} (expected {expected})\")
    if not ok:
        all_pass = False
print()
print('ALL PASS' if all_pass else 'SOME TESTS FAILED')
"
```
Expected: all lines show `PASS`, final line `ALL PASS`.

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat: LightRAG Knowledge Graph Explorer — complete implementation

- Backend: lightrag_service/ package with rag_instance, indexer, demo_indexer, graph_exporter
- API: 6 FastAPI endpoints at /lightrag prefix (status, index, graph, query, modes, index-status)
- Demo: 10 markdown documents (5 aircraft NCRs + 5 medical NCRs) in demo/lightrag_docs/
- Frontend: LightRAGGraphViewer.tsx + /lightrag page + AppHeader nav item + middleware protection
- Tests: 20 tests in test_lightrag_service.py, all 560 existing tests still pass
- Config: .env.example, docker-compose.yml volume, config.yaml lightrag block"
```

---

## Implementation Order Summary

```
Task 1  — Install lightrag-hku + networkx, create data dirs, update .gitignore
Task 2  — Create lightrag_service/__init__.py
Task 3  — Create rag_instance.py (singleton + LLM/embed adapters)
Task 4  — Create indexer.py (DB → LightRAG)
Task 5  — Create demo_indexer.py (fallback markdown docs)
Task 6  — Create graph_exporter.py (NetworkX → JSON + query wrapper)
Task 7  — Create api/lightrag.py (6 FastAPI endpoints)
Task 8  — Register router in main.py
Task 9  — Add Pydantic schemas to schemas/models.py
Task 10 — Phase 1 acceptance check
Task 11 — Create 5 aircraft demo docs
Task 12 — Create 5 medical demo docs
Task 13 — Install dagre + add api.ts LightRAG functions
Task 14 — Create LightRAGGraphViewer.tsx
Task 15 — Create /lightrag page.tsx + loading.tsx
Task 16 — Add LIGHTRAG nav item to AppHeader.tsx
Task 17 — Add /lightrag to middleware.ts PROTECTED_PATHS
Task 18 — Update .env.example, docker-compose.yml, config.yaml
Task 19 — Create test_lightrag_service.py
Task 20 — Final acceptance check
```

---

## Non-Negotiables Checklist (verify before final commit)

- [ ] No modifications to `GraphViewer.tsx`, orchestrator, or any existing agent pipeline file
- [ ] No LightRAG data in `graph_node`/`graph_edge` tables
- [ ] `asyncio.get_running_loop()` only — zero `get_event_loop()` calls
- [ ] `/lightrag` page outer div uses `style={{ height: "calc(100vh - 46px)" }}`
- [ ] `/lightrag` is in `middleware.ts` PROTECTED_PATHS
- [ ] `LightRAGGraphViewer.tsx` is a new file, `GraphViewer.tsx` is unmodified
- [ ] All 560 existing tests still pass
- [ ] `npm run build` succeeds with no TypeScript errors
- [ ] Demo docs: 5 aircraft + 5 medical markdown files in `demo/lightrag_docs/`
- [ ] `ExportModal` still uses `dynamic(..., { ssr: false })` — not affected by this change
