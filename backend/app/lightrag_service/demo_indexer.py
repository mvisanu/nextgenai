"""
Demo indexer: indexes pre-written markdown documents when DB is empty.
Used for local dev, CI, and first-time Render deployments with no data.
"""
from __future__ import annotations

import logging
from pathlib import Path

from app.lightrag_service.rag_instance import get_lightrag

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
