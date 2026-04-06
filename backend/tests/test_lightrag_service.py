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
    from backend.app.lightrag_service.graph_exporter import export_graph

    with patch("backend.app.lightrag_service.graph_exporter.get_lightrag") as mock_get:
        mock_rag = AsyncMock()
        mock_rag.chunk_entity_relation_graph.get_all_nodes = AsyncMock(return_value=[])
        mock_rag.chunk_entity_relation_graph.get_all_edges = AsyncMock(return_value=[])
        mock_get.return_value = mock_rag

        result = await export_graph("aircraft", max_nodes=200)
        assert result["status"] == "not_indexed"
        assert result["nodes"] == []
        assert result["edges"] == []


@pytest.mark.asyncio
async def test_export_graph_with_nodes():
    """export_graph converts node/edge dicts to correct JSON structure."""
    from backend.app.lightrag_service.graph_exporter import export_graph

    mock_nodes = [
        {"id": "AeroCo Industries", "entity_type": "supplier", "description": "Aerospace supplier", "weight": 2.0},
        {"id": "Hydraulic Seal", "entity_type": "component", "description": "O-ring seal", "weight": 1.0},
    ]
    mock_edges = [
        {"source": "AeroCo Industries", "target": "Hydraulic Seal", "keywords": "manufactures", "weight": 1.5, "description": ""},
    ]

    with patch("backend.app.lightrag_service.graph_exporter.get_lightrag") as mock_get:
        mock_rag = AsyncMock()
        mock_rag.chunk_entity_relation_graph.get_all_nodes = AsyncMock(return_value=mock_nodes)
        mock_rag.chunk_entity_relation_graph.get_all_edges = AsyncMock(return_value=mock_edges)
        mock_get.return_value = mock_rag

        result = await export_graph("aircraft", max_nodes=200)
        assert result["status"] == "ok"
        assert result["node_count"] == 2
        assert result["edge_count"] == 1
        node_labels = {n["label"] for n in result["nodes"]}
        assert "AeroCo Industries" in node_labels


# ── Frontend file existence checks ─────────────────────────────────────────────

# Resolve repo root regardless of test runner cwd
# test file is at backend/tests/test_lightrag_service.py → go up 3 levels
REPO_ROOT = Path(__file__).resolve().parent.parent.parent


def test_lightrag_page_exists():
    """frontend/app/lightrag/page.tsx must exist."""
    page = REPO_ROOT / "frontend/app/lightrag/page.tsx"
    assert page.exists(), "frontend/app/lightrag/page.tsx not found"


def test_lightrag_graph_viewer_exists():
    """frontend/app/components/LightRAGGraphViewer.tsx must exist."""
    component = REPO_ROOT / "frontend/app/components/LightRAGGraphViewer.tsx"
    assert component.exists(), "LightRAGGraphViewer.tsx not found"


def test_lightrag_nav_item_in_appheader():
    """AppHeader.tsx must contain LIGHTRAG nav item."""
    header = REPO_ROOT / "frontend/app/components/AppHeader.tsx"
    assert header.exists()
    content = header.read_text()
    assert "LIGHTRAG" in content, "LIGHTRAG nav item not found in AppHeader.tsx"


def test_lightrag_in_middleware():
    """middleware.ts must include /lightrag in protected routes."""
    middleware = REPO_ROOT / "frontend/middleware.ts"
    assert middleware.exists()
    content = middleware.read_text()
    assert "/lightrag" in content, "/lightrag not found in middleware.ts protected routes"


def test_lightrag_demo_docs_exist():
    """Demo docs must exist for both domains."""
    for domain in ("aircraft", "medical"):
        domain_dir = REPO_ROOT / f"demo/lightrag_docs/{domain}"
        assert domain_dir.exists(), f"Demo docs dir not found: {domain_dir}"
        md_files = list(domain_dir.glob("*.md"))
        assert len(md_files) >= 5, f"Expected >=5 demo docs for {domain}, found {len(md_files)}"


def test_no_get_event_loop_in_lightrag_service():
    """rag_instance.py must not use get_event_loop()."""
    rag_file = REPO_ROOT / "backend/app/lightrag_service/rag_instance.py"
    assert rag_file.exists()
    content = rag_file.read_text()
    assert "get_event_loop" not in content, "get_event_loop() found in rag_instance.py — use get_running_loop()"
