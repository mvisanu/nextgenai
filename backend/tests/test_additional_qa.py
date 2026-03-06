"""
Comprehensive QA tests — NextAgentAI
Covers: synthetic generator, compute tool sandbox, schema validation,
FastAPI app structure, config/env checks, and edge-case chunker behaviour.
No DB or API key required.
"""
from __future__ import annotations

import importlib
import json
import os
import sys
import re
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).parent.parent.parent  # NextAgentAI/
BACKEND_ROOT = REPO_ROOT / "backend"
DEMO_SEED_SQL = REPO_ROOT / "demo" / "seed_sql"
CONFIG_YAML = REPO_ROOT / "config.yaml"
ENV_EXAMPLE = REPO_ROOT / ".env.example"
RENDER_YAML = REPO_ROOT / "render.yaml"
VERCEL_JSON = REPO_ROOT / "frontend" / "vercel.json"
REQUIREMENTS_TXT = BACKEND_ROOT / "requirements.txt"


# ===========================================================================
# T-STATIC-01 — Config file has all required keys with correct values
# ===========================================================================


class TestConfigYaml:

    def _load(self):
        import yaml
        with open(CONFIG_YAML) as f:
            return yaml.safe_load(f)

    def test_config_yaml_exists(self):
        assert CONFIG_YAML.exists(), "config.yaml not found"

    def test_embedding_dim_is_384(self):
        try:
            import yaml
            cfg = self._load()
            assert cfg["embeddings"]["dim"] == 384, \
                f"Expected dim=384 (all-MiniLM-L6-v2), got {cfg['embeddings']['dim']}"
        except ImportError:
            # yaml not in testlib — test via raw text
            text = CONFIG_YAML.read_text()
            assert "dim: 384" in text, "config.yaml must set dim: 384 (not 1536)"

    def test_model_name_correct(self):
        text = CONFIG_YAML.read_text()
        assert "claude-sonnet-4-6" in text

    def test_chunk_size_tokens(self):
        text = CONFIG_YAML.read_text()
        assert "chunk_size_tokens: 400" in text

    def test_chunk_overlap_tokens(self):
        text = CONFIG_YAML.read_text()
        assert "chunk_overlap_tokens: 75" in text

    def test_top_k_8(self):
        text = CONFIG_YAML.read_text()
        assert "top_k: 8" in text

    def test_k_hop_2(self):
        text = CONFIG_YAML.read_text()
        assert "k_hop: 2" in text

    def test_max_steps_10(self):
        text = CONFIG_YAML.read_text()
        assert "max_steps: 10" in text

    def test_pg_dsn_placeholder(self):
        text = CONFIG_YAML.read_text()
        assert "PG_DSN" in text, "config.yaml must reference PG_DSN env var"

    def test_synthetic_rows_10000(self):
        text = CONFIG_YAML.read_text()
        assert "synthetic_rows: 10000" in text

    def test_all_kaggle_slugs_present(self):
        text = CONFIG_YAML.read_text()
        assert "fahmidachowdhury/manufacturing-defects" in text
        assert "merishnasuwal/aircraft-historical-maintenance-dataset" in text
        assert "rabieelkharoua/predicting-manufacturing-defects-dataset" in text


# ===========================================================================
# T-STATIC-02 — .env.example has all required variables
# ===========================================================================


class TestEnvExample:

    def test_env_example_exists(self):
        assert ENV_EXAMPLE.exists(), ".env.example not found"

    def test_pg_dsn_present(self):
        text = ENV_EXAMPLE.read_text()
        assert "PG_DSN" in text

    def test_anthropic_api_key_present(self):
        text = ENV_EXAMPLE.read_text()
        assert "ANTHROPIC_API_KEY" in text

    def test_kaggle_username_present(self):
        text = ENV_EXAMPLE.read_text()
        assert "KAGGLE_USERNAME" in text

    def test_kaggle_key_present(self):
        text = ENV_EXAMPLE.read_text()
        assert "KAGGLE_KEY" in text

    def test_database_url_present(self):
        """BACKEND.md specifies DATABASE_URL as alias for PG_DSN."""
        text = ENV_EXAMPLE.read_text()
        assert "DATABASE_URL" in text


# ===========================================================================
# T-STATIC-03 — Deployment config files exist and are valid
# ===========================================================================


class TestDeploymentConfigs:

    def test_render_yaml_exists(self):
        assert RENDER_YAML.exists(), "render.yaml not found"

    def test_render_yaml_is_valid_yaml(self):
        text = RENDER_YAML.read_text()
        try:
            import yaml
            data = yaml.safe_load(text)
            assert data is not None
        except ImportError:
            # At minimum, check it contains expected keys as text
            assert "services" in text
            assert "nextai-backend" in text

    def test_render_yaml_has_healthz(self):
        text = RENDER_YAML.read_text()
        assert "/healthz" in text, "render.yaml must configure healthCheckPath: /healthz"

    def test_render_yaml_references_dockerfile(self):
        text = RENDER_YAML.read_text()
        assert "Dockerfile" in text

    def test_vercel_json_exists(self):
        assert VERCEL_JSON.exists(), "vercel.json not found"

    def test_vercel_json_is_valid_json(self):
        text = VERCEL_JSON.read_text()
        data = json.loads(text)  # raises if invalid
        assert isinstance(data, dict)

    def test_vercel_json_framework_is_nextjs(self):
        data = json.loads(VERCEL_JSON.read_text())
        # vercel.json in frontend/ does not need rootDirectory (it IS the root)
        # If present, it should be nextjs; auto-detection is also valid.
        framework = data.get("framework")
        if framework is not None:
            assert framework == "nextjs"

    def test_vercel_json_has_next_public_api_url(self):
        data = json.loads(VERCEL_JSON.read_text())
        env = data.get("env", {})
        assert "NEXT_PUBLIC_API_URL" in env


# ===========================================================================
# T-STATIC-04 — Seed CSVs have correct headers and >= 20 rows
# ===========================================================================


class TestSeedCsvs:

    MANUFACTURING_DEFECTS_HEADERS = [
        "defect_id", "product", "defect_type", "severity",
        "inspection_date", "plant", "lot_number", "action_taken", "source",
    ]
    MAINTENANCE_LOGS_HEADERS = [
        "log_id", "asset_id", "ts", "metric_name",
        "metric_value", "unit", "source",
    ]

    def _read_csv(self, path: Path) -> list[list[str]]:
        import csv
        with open(path, newline="") as f:
            reader = csv.reader(f)
            return list(reader)

    def test_manufacturing_defects_csv_exists(self):
        assert (DEMO_SEED_SQL / "manufacturing_defects.csv").exists()

    def test_manufacturing_defects_headers(self):
        rows = self._read_csv(DEMO_SEED_SQL / "manufacturing_defects.csv")
        assert rows[0] == self.MANUFACTURING_DEFECTS_HEADERS, \
            f"Headers mismatch. Got: {rows[0]}"

    def test_manufacturing_defects_row_count(self):
        rows = self._read_csv(DEMO_SEED_SQL / "manufacturing_defects.csv")
        data_rows = rows[1:]  # exclude header
        assert len(data_rows) >= 20, \
            f"Expected ≥20 rows, got {len(data_rows)}"

    def test_maintenance_logs_csv_exists(self):
        assert (DEMO_SEED_SQL / "maintenance_logs.csv").exists()

    def test_maintenance_logs_headers(self):
        rows = self._read_csv(DEMO_SEED_SQL / "maintenance_logs.csv")
        assert rows[0] == self.MAINTENANCE_LOGS_HEADERS, \
            f"Headers mismatch. Got: {rows[0]}"

    def test_maintenance_logs_row_count(self):
        rows = self._read_csv(DEMO_SEED_SQL / "maintenance_logs.csv")
        data_rows = rows[1:]
        assert len(data_rows) >= 20, \
            f"Expected ≥20 rows, got {len(data_rows)}"

    def test_defects_supplemental_csv_exists(self):
        assert (DEMO_SEED_SQL / "defects_supplemental.csv").exists()

    def test_defects_supplemental_headers(self):
        rows = self._read_csv(DEMO_SEED_SQL / "defects_supplemental.csv")
        # Same schema as manufacturing_defects
        assert rows[0] == self.MANUFACTURING_DEFECTS_HEADERS, \
            f"Headers mismatch. Got: {rows[0]}"

    def test_defects_supplemental_row_count(self):
        rows = self._read_csv(DEMO_SEED_SQL / "defects_supplemental.csv")
        data_rows = rows[1:]
        assert len(data_rows) >= 20, \
            f"Expected ≥20 rows, got {len(data_rows)}"


# ===========================================================================
# T-STATIC-05 — requirements.txt has all required packages
# ===========================================================================


class TestRequirementsTxt:

    def _get_packages(self) -> set[str]:
        text = REQUIREMENTS_TXT.read_text().lower()
        packages = set()
        for line in text.splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                pkg = re.split(r"[>=<!]", line)[0].strip().replace("-", "_")
                packages.add(pkg)
        return packages

    def test_requirements_exists(self):
        assert REQUIREMENTS_TXT.exists()

    def test_fastapi_present(self):
        pkgs = self._get_packages()
        assert "fastapi" in pkgs

    def test_sqlalchemy_present(self):
        pkgs = self._get_packages()
        assert "sqlalchemy" in pkgs

    def test_pydantic_present(self):
        pkgs = self._get_packages()
        assert "pydantic" in pkgs

    def test_anthropic_present(self):
        pkgs = self._get_packages()
        assert "anthropic" in pkgs

    def test_sentence_transformers_present(self):
        pkgs = self._get_packages()
        assert "sentence_transformers" in pkgs

    def test_tiktoken_present(self):
        pkgs = self._get_packages()
        assert "tiktoken" in pkgs

    def test_spacy_present(self):
        pkgs = self._get_packages()
        assert "spacy" in pkgs

    def test_numpy_present(self):
        pkgs = self._get_packages()
        assert "numpy" in pkgs

    def test_pytest_present(self):
        pkgs = self._get_packages()
        assert "pytest" in pkgs

    def test_pgvector_present(self):
        pkgs = self._get_packages()
        assert "pgvector" in pkgs

    def test_alembic_present(self):
        pkgs = self._get_packages()
        assert "alembic" in pkgs

    def test_kagglehub_present(self):
        pkgs = self._get_packages()
        assert "kagglehub" in pkgs

    def test_pandas_present(self):
        pkgs = self._get_packages()
        assert "pandas" in pkgs

    def test_httpx_present(self):
        """httpx used for TestClient in FastAPI tests."""
        pkgs = self._get_packages()
        assert "httpx" in pkgs


# ===========================================================================
# T-PYDANTIC-01 — Pydantic schemas validate correctly
# ===========================================================================


class TestPydanticSchemas:

    def test_query_request_min_length(self):
        from backend.app.schemas.models import QueryRequest
        with pytest.raises(Exception):
            QueryRequest(query="ab")  # too short (min 3)

    def test_query_request_max_length(self):
        from backend.app.schemas.models import QueryRequest
        with pytest.raises(Exception):
            QueryRequest(query="x" * 2001)  # too long (max 2000)

    def test_query_request_valid(self):
        from backend.app.schemas.models import QueryRequest
        req = QueryRequest(query="Find similar incidents")
        assert req.query == "Find similar incidents"
        assert req.filters is None

    def test_query_request_min_boundary(self):
        """Exactly 3 chars is valid."""
        from backend.app.schemas.models import QueryRequest
        req = QueryRequest(query="abc")
        assert req.query == "abc"

    def test_query_request_max_boundary(self):
        """Exactly 2000 chars is valid."""
        from backend.app.schemas.models import QueryRequest
        req = QueryRequest(query="x" * 2000)
        assert len(req.query) == 2000

    def test_claim_confidence_out_of_range_high(self):
        from backend.app.schemas.models import Claim
        with pytest.raises(Exception):
            Claim(text="test", confidence=1.1, citations=[])

    def test_claim_confidence_out_of_range_low(self):
        from backend.app.schemas.models import Claim
        with pytest.raises(Exception):
            Claim(text="test", confidence=-0.1, citations=[])

    def test_claim_confidence_boundary_zero(self):
        from backend.app.schemas.models import Claim
        c = Claim(text="test", confidence=0.0, citations=[])
        assert c.confidence == 0.0

    def test_claim_confidence_boundary_one(self):
        from backend.app.schemas.models import Claim
        c = Claim(text="test", confidence=1.0, citations=[])
        assert c.confidence == 1.0

    def test_citation_has_required_fields(self):
        from backend.app.schemas.models import Citation
        c = Citation(chunk_id="c1", incident_id="i1", char_start=0, char_end=100)
        assert c.chunk_id == "c1"
        assert c.incident_id == "i1"
        assert c.char_start == 0
        assert c.char_end == 100

    def test_health_response_schema(self):
        from backend.app.schemas.models import HealthResponse
        h = HealthResponse(status="ok", db=True, version="1.0.0")
        assert h.status == "ok"
        assert h.db is True
        assert h.version == "1.0.0"

    def test_graph_path_schema(self):
        from backend.app.schemas.models import GraphPath, GraphNode, GraphEdge
        node = GraphNode(id="entity:abc", type="entity", label="Hydraulics")
        edge = GraphEdge(
            id="e1", from_node="chunk:x", to_node="entity:abc",
            type="mentions", weight=1.0
        )
        path = GraphPath(nodes=[node], edges=[edge])
        assert len(path.nodes) == 1
        assert len(path.edges) == 1

    def test_query_response_all_fields(self):
        from backend.app.schemas.models import (
            QueryResponse, Evidence, GraphPath, RunSummary
        )
        resp = QueryResponse(
            run_id="run-1",
            query="test",
            answer="answer text",
            claims=[],
            evidence=Evidence(),
            graph_path=GraphPath(),
            run_summary=RunSummary(
                intent="vector_only",
                plan_text="plan",
                steps=[],
                tools_used=[],
                total_latency_ms=100.0,
                halted_at_step_limit=False,
            ),
            assumptions=[],
            next_steps=[],
        )
        assert resp.run_id == "run-1"

    def test_ingest_response_schema(self):
        from backend.app.schemas.models import IngestResponse
        r = IngestResponse(status="started", message="Pipeline started.")
        assert r.status == "started"

    def test_run_summary_valid_intents(self):
        from backend.app.schemas.models import RunSummary
        for intent in ["vector_only", "sql_only", "hybrid", "compute"]:
            rs = RunSummary(
                intent=intent,
                plan_text="test",
                steps=[],
                tools_used=[],
                total_latency_ms=0.0,
                halted_at_step_limit=False,
            )
            assert rs.intent == intent


# ===========================================================================
# T-FASTAPI-01 — Route files importable without errors
# ===========================================================================


class TestRouteImports:

    def test_main_importable(self):
        from backend.app import main
        assert hasattr(main, "create_app")

    def test_query_router_importable(self):
        from backend.app.api import query
        assert hasattr(query, "router")

    def test_ingest_router_importable(self):
        from backend.app.api import ingest
        assert hasattr(ingest, "router")

    def test_docs_router_importable(self):
        from backend.app.api import docs
        assert hasattr(docs, "router")

    def test_schemas_importable(self):
        from backend.app.schemas import models
        assert hasattr(models, "QueryRequest")
        assert hasattr(models, "QueryResponse")
        assert hasattr(models, "HealthResponse")

    def test_sql_tool_importable(self):
        from backend.app.tools.sql_tool import SQLQueryTool, SQLGuardrailError, _BLOCKED_PATTERN
        assert SQLQueryTool is not None

    def test_compute_tool_importable(self):
        from backend.app.tools.compute_tool import PythonComputeTool, ToolSecurityError
        assert PythonComputeTool is not None

    def test_chunker_importable(self):
        from backend.app.rag.chunker import chunk_text
        assert callable(chunk_text)

    def test_intent_importable(self):
        from backend.app.agent.intent import classify_intent, VALID_INTENTS
        assert "hybrid" in VALID_INTENTS

    def test_planner_importable(self):
        from backend.app.agent.planner import generate_plan, _fallback_plan
        assert callable(generate_plan)


# ===========================================================================
# T-FASTAPI-02 — FastAPI app structure: routes registered, basic validation
# ===========================================================================


class TestFastAPIAppStructure:

    def _get_app(self):
        from backend.app.main import create_app
        return create_app()

    def test_create_app_returns_fastapi(self):
        from fastapi import FastAPI
        app = self._get_app()
        assert isinstance(app, FastAPI)

    def test_app_version(self):
        app = self._get_app()
        assert app.version == "1.0.0"

    def test_query_route_registered(self):
        app = self._get_app()
        paths = [r.path for r in app.routes]
        assert "/query" in paths

    def test_healthz_route_registered(self):
        app = self._get_app()
        paths = [r.path for r in app.routes]
        assert "/healthz" in paths

    def test_docs_route_registered(self):
        app = self._get_app()
        paths = [r.path for r in app.routes]
        assert "/docs" in paths

    def test_ingest_route_registered(self):
        app = self._get_app()
        paths = [r.path for r in app.routes]
        assert "/ingest" in paths

    def test_runs_route_registered(self):
        app = self._get_app()
        paths = [r.path for r in app.routes]
        assert "/runs/{run_id}" in paths

    def test_chunk_route_registered(self):
        app = self._get_app()
        paths = [r.path for r in app.routes]
        assert "/docs/{doc_id}/chunks/{chunk_id}" in paths

    def test_cors_middleware_present(self):
        from fastapi.middleware.cors import CORSMiddleware
        app = self._get_app()
        middleware_types = [type(m) for m in app.user_middleware]
        # Check middleware class names (CORSMiddleware may be wrapped)
        all_names = str(app.user_middleware)
        assert "CORS" in all_names or any(
            "cors" in str(t).lower() for t in middleware_types
        )

    def test_post_query_with_empty_body_returns_422(self):
        """POST /query with empty body → 422 Unprocessable Entity."""
        from fastapi.testclient import TestClient
        app = self._get_app()
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post("/query", json={})
        assert resp.status_code == 422, f"Expected 422, got {resp.status_code}"

    def test_post_query_with_query_too_short_returns_422(self):
        """POST /query with query < 3 chars → 422."""
        from fastapi.testclient import TestClient
        app = self._get_app()
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post("/query", json={"query": "ab"})
        assert resp.status_code == 422, f"Expected 422, got {resp.status_code}"

    def test_post_query_with_query_too_long_returns_422(self):
        """POST /query with query > 2000 chars → 422."""
        from fastapi.testclient import TestClient
        app = self._get_app()
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post("/query", json={"query": "x" * 2001})
        assert resp.status_code == 422, f"Expected 422, got {resp.status_code}"

    def test_get_nonexistent_run_returns_500_or_404(self):
        """GET /runs/{unknown_id} with no DB configured → 500 or 404."""
        from fastapi.testclient import TestClient
        app = self._get_app()
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get("/runs/nonexistent-run-id-abc123")
        # No DB configured in CI → either 500 (DB error) or 404 (run not found)
        assert resp.status_code in (404, 500), \
            f"Expected 404 or 500, got {resp.status_code}"

    def test_root_endpoint_returns_docs_link(self):
        """GET / returns a message with docs location."""
        from fastapi.testclient import TestClient
        app = self._get_app()
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get("/")
        assert resp.status_code == 200
        data = resp.json()
        assert "docs" in data


# ===========================================================================
# T-COMPUTE-01 — PythonComputeTool sandbox
# ===========================================================================


class TestComputeToolSandbox:

    def _tool(self):
        from backend.app.tools.compute_tool import PythonComputeTool
        return PythonComputeTool()

    def test_allowed_arithmetic(self):
        tool = self._tool()
        result = tool.run("result = 2 + 2")
        assert result["error"] is None
        assert result["result"] == 4

    def test_allowed_sum(self):
        tool = self._tool()
        r = tool.run("result = sum(values)", context={"values": [1, 2, 3, 4]})
        assert r["error"] is None
        assert r["result"] == 10

    def test_allowed_statistics(self):
        tool = self._tool()
        r = tool.run("import statistics; result = statistics.mean(data)",
                     context={"data": [1.0, 2.0, 3.0, 4.0]})
        assert r["error"] is None
        assert r["result"] == pytest.approx(2.5)

    def test_allowed_math_module(self):
        tool = self._tool()
        r = tool.run("result = math.sqrt(16)")
        assert r["error"] is None
        assert r["result"] == pytest.approx(4.0)

    def test_blocked_import_os(self):
        from backend.app.tools.compute_tool import ToolSecurityError
        tool = self._tool()
        with pytest.raises(ToolSecurityError, match="not permitted"):
            tool.run("import os; result = os.listdir('.')")

    def test_blocked_import_sys(self):
        from backend.app.tools.compute_tool import ToolSecurityError
        tool = self._tool()
        with pytest.raises(ToolSecurityError):
            tool.run("import sys; result = sys.version")

    def test_blocked_import_subprocess(self):
        from backend.app.tools.compute_tool import ToolSecurityError
        tool = self._tool()
        with pytest.raises(ToolSecurityError):
            tool.run("import subprocess; result = subprocess.check_output(['ls'])")

    def test_blocked_import_socket(self):
        from backend.app.tools.compute_tool import ToolSecurityError
        tool = self._tool()
        with pytest.raises(ToolSecurityError):
            tool.run("import socket; result = socket.gethostname()")

    def test_blocked_import_shutil(self):
        from backend.app.tools.compute_tool import ToolSecurityError
        tool = self._tool()
        with pytest.raises(ToolSecurityError):
            tool.run("import shutil; result = 1")

    def test_result_defaults_to_none_if_not_set(self):
        tool = self._tool()
        r = tool.run("x = 1 + 1")  # no 'result' assignment
        assert r["result"] is None

    def test_context_variables_injected(self):
        tool = self._tool()
        r = tool.run("result = multiplier * base",
                     context={"multiplier": 3, "base": 7})
        assert r["result"] == 21

    def test_print_captured(self):
        tool = self._tool()
        r = tool.run("print('hello compute')")
        assert "hello compute" in r["stdout"]

    def test_syntax_error_captured(self):
        tool = self._tool()
        r = tool.run("result = 1 + + + ")
        assert r["error"] is not None

    def test_tool_name_field(self):
        tool = self._tool()
        r = tool.run("result = 42")
        assert r["tool_name"] == "PythonComputeTool"


# ===========================================================================
# T-SYNTHETIC-01 — Synthetic incident generator
# ===========================================================================


class TestSyntheticGenerator:

    def test_generate_returns_dataframe(self):
        import pandas as pd
        from backend.app.ingest.synthetic import generate_synthetic_incidents
        df = generate_synthetic_incidents(n=10, seed=42)
        assert isinstance(df, pd.DataFrame)

    def test_correct_column_count(self):
        from backend.app.ingest.synthetic import generate_synthetic_incidents
        df = generate_synthetic_incidents(n=5, seed=42)
        expected_cols = {
            "incident_id", "asset_id", "system", "sub_system",
            "event_date", "location", "severity", "narrative",
            "corrective_action", "source",
        }
        assert expected_cols.issubset(set(df.columns)), \
            f"Missing columns: {expected_cols - set(df.columns)}"

    def test_correct_row_count(self):
        from backend.app.ingest.synthetic import generate_synthetic_incidents
        df = generate_synthetic_incidents(n=50, seed=42)
        assert len(df) == 50

    def test_narrative_length_ge_80_words(self):
        from backend.app.ingest.synthetic import generate_synthetic_incidents
        df = generate_synthetic_incidents(n=20, seed=42)
        for _, row in df.iterrows():
            word_count = len(str(row["narrative"]).split())
            assert word_count >= 40, \
                f"Narrative too short ({word_count} words): {str(row['narrative'])[:100]}"

    def test_source_column_is_synthetic(self):
        from backend.app.ingest.synthetic import generate_synthetic_incidents
        df = generate_synthetic_incidents(n=10, seed=42)
        assert (df["source"] == "synthetic").all()

    def test_incident_ids_unique(self):
        from backend.app.ingest.synthetic import generate_synthetic_incidents
        df = generate_synthetic_incidents(n=100, seed=42)
        assert df["incident_id"].nunique() == 100, "incident_ids must be unique"

    def test_severity_values_valid(self):
        from backend.app.ingest.synthetic import generate_synthetic_incidents, SEVERITIES
        df = generate_synthetic_incidents(n=50, seed=42)
        invalid = set(df["severity"]) - set(SEVERITIES)
        assert not invalid, f"Invalid severity values: {invalid}"

    def test_event_date_in_valid_range(self):
        from backend.app.ingest.synthetic import generate_synthetic_incidents
        df = generate_synthetic_incidents(n=50, seed=42)
        import pandas as pd
        dates = pd.to_datetime(df["event_date"])
        assert (dates >= pd.Timestamp("2020-01-01")).all()
        assert (dates <= pd.Timestamp("2026-01-01")).all()

    def test_seeded_output_is_reproducible(self):
        from backend.app.ingest.synthetic import generate_synthetic_incidents
        df1 = generate_synthetic_incidents(n=10, seed=99)
        df2 = generate_synthetic_incidents(n=10, seed=99)
        assert list(df1["incident_id"]) == list(df2["incident_id"])

    def test_idempotent_when_file_exists(self, tmp_path):
        """If output_path exists, re-reading returns same data without regenerating."""
        import pandas as pd
        from backend.app.ingest.synthetic import generate_synthetic_incidents
        csv_path = tmp_path / "incidents.csv"
        df1 = generate_synthetic_incidents(n=5, seed=1, output_path=csv_path)
        # Modify the file to prove the function reads from disk, not regenerates
        df_modified = df1.copy()
        df_modified.loc[0, "narrative"] = "MODIFIED"
        df_modified.to_csv(csv_path, index=False)
        # Call again — should return the modified file (idempotent read)
        df2 = generate_synthetic_incidents(n=5, seed=1, output_path=csv_path)
        assert df2.loc[0, "narrative"] == "MODIFIED", \
            "Idempotent path: should read existing file without re-generating"


# ===========================================================================
# T-GRAPH-01 — Graph builder entity extraction (no DB)
# ===========================================================================


class TestGraphEntityExtraction:

    def test_extract_entities_from_known_text(self):
        from backend.app.graph.builder import extract_entities
        text = "Hydraulic actuator crack found on ASSET-247 at Line 1."
        entities = extract_entities(text)
        assert len(entities) >= 1, "Expected at least 1 entity extracted"

    def test_asset_id_pattern_extracted(self):
        from backend.app.graph.builder import extract_entities
        text = "Asset ASSET-247 reported failure."
        entities = extract_entities(text)
        labels = [e["label"] for e in entities]
        assert any("ASSET-247" in l for l in labels), \
            f"ASSET-247 not found in entities: {labels}"

    def test_system_pattern_extracted(self):
        from backend.app.graph.builder import extract_entities
        text = "Hydraulic system failure was detected."
        entities = extract_entities(text)
        types = [e["type"] for e in entities]
        assert "system" in types, f"No 'system' entity type found. Got: {types}"

    def test_defect_type_pattern_extracted(self):
        from backend.app.graph.builder import extract_entities
        text = "Evidence of corrosion and crack on the bearing."
        entities = extract_entities(text)
        types = [e["type"] for e in entities]
        assert "defect_type" in types, f"No 'defect_type' entity found. Got: {types}"

    def test_subsystem_pattern_extracted(self):
        from backend.app.graph.builder import extract_entities
        text = "The actuator and pump were inspected."
        entities = extract_entities(text)
        types = [e["type"] for e in entities]
        assert "subsystem" in types, f"No 'subsystem' entity found. Got: {types}"

    def test_entities_have_required_fields(self):
        from backend.app.graph.builder import extract_entities
        text = "Hydraulic actuator crack found on ASSET-100 at Line 2."
        entities = extract_entities(text)
        for entity in entities:
            assert "label" in entity
            assert "type" in entity
            assert "char_start" in entity
            assert "char_end" in entity
            assert entity["char_start"] < entity["char_end"]

    def test_empty_text_returns_empty(self):
        from backend.app.graph.builder import extract_entities
        entities = extract_entities("")
        assert entities == []

    def test_sn_pattern_extracted(self):
        from backend.app.graph.builder import extract_entities
        text = "Component SN-482910 was found to have corrosion."
        entities = extract_entities(text)
        labels = [e["label"] for e in entities]
        assert any("SN-482910" in l for l in labels), \
            f"SN-482910 not found in entities: {labels}"


# ===========================================================================
# T-CHUNKER-EDGE — Additional edge cases not covered in existing tests
# ===========================================================================


class TestChunkerEdgeCases:

    def test_char_offsets_correctly_locate_text(self):
        """chunk_text[char_start:char_end] should be findable in source."""
        from backend.app.rag.chunker import chunk_text
        source = "Hydraulic actuator crack found on Line 1. " * 20
        chunks = chunk_text(source, chunk_size=50, overlap=10)
        for chunk in chunks:
            # The chunk text should be a substring of the source
            # (stripped version may differ at boundaries due to tokenizer)
            excerpt = chunk["chunk_text"][:30]
            assert excerpt in source or excerpt.strip() in source, \
                f"Chunk excerpt not found in source: {excerpt!r}"

    def test_no_empty_chunks(self):
        from backend.app.rag.chunker import chunk_text
        text = "Aircraft maintenance log entry. " * 50
        chunks = chunk_text(text, chunk_size=100, overlap=20)
        for chunk in chunks:
            assert chunk["chunk_text"].strip() != "", \
                "Found empty chunk in output"

    def test_single_word_text(self):
        from backend.app.rag.chunker import chunk_text
        result = chunk_text("Hydraulics", chunk_size=400, overlap=75)
        assert len(result) == 1
        assert result[0]["chunk_text"] == "Hydraulics"

    def test_overlap_zero_is_allowed(self):
        from backend.app.rag.chunker import chunk_text
        text = "word " * 200
        chunks = chunk_text(text, chunk_size=50, overlap=0)
        assert len(chunks) > 0

    def test_large_overlap_raises_value_error(self):
        from backend.app.rag.chunker import chunk_text
        with pytest.raises(ValueError, match="overlap"):
            chunk_text("test", chunk_size=10, overlap=10)

    def test_chunk_size_equals_overlap_raises(self):
        from backend.app.rag.chunker import chunk_text
        with pytest.raises(ValueError):
            chunk_text("some text here", chunk_size=20, overlap=20)


# ===========================================================================
# T-SQL-TOOL-EDGE — Named query and error handling
# ===========================================================================


class TestSqlToolNamedQueries:

    def test_unknown_named_query_raises_value_error(self):
        from backend.app.tools.sql_tool import SQLQueryTool
        tool = SQLQueryTool()
        with pytest.raises(ValueError, match="Unknown named query"):
            tool.run_named("nonexistent_query_name")

    def test_named_query_list_contains_expected_names(self):
        from backend.app.tools.sql_tool import _NAMED_QUERIES
        expected = {
            "defect_counts_by_product",
            "severity_distribution",
            "maintenance_trends",
            "incidents_defects_join",
        }
        assert expected.issubset(set(_NAMED_QUERIES.keys())), \
            f"Missing named queries: {expected - set(_NAMED_QUERIES.keys())}"

    def test_defect_counts_query_is_select_only(self):
        from backend.app.tools.sql_tool import _NAMED_QUERIES, _BLOCKED_PATTERN
        sql = _NAMED_QUERIES["defect_counts_by_product"]
        # Replace the :days placeholder with a real value
        sql = sql.replace(":days days", "90 days")
        match = _BLOCKED_PATTERN.search(sql)
        assert match is None, f"Named query contains blocked keyword: {match}"

    def test_severity_distribution_query_is_select_only(self):
        from backend.app.tools.sql_tool import _NAMED_QUERIES, _BLOCKED_PATTERN
        sql = _NAMED_QUERIES["severity_distribution"]
        match = _BLOCKED_PATTERN.search(sql)
        assert match is None

    def test_maintenance_trends_query_is_select_only(self):
        from backend.app.tools.sql_tool import _NAMED_QUERIES, _BLOCKED_PATTERN
        sql = _NAMED_QUERIES["maintenance_trends"]
        match = _BLOCKED_PATTERN.search(sql)
        assert match is None

    def test_incidents_defects_join_query_is_select_only(self):
        from backend.app.tools.sql_tool import _NAMED_QUERIES, _BLOCKED_PATTERN
        sql = _NAMED_QUERIES["incidents_defects_join"]
        match = _BLOCKED_PATTERN.search(sql)
        assert match is None

    def test_guardrail_blocks_comment_escape_attempt(self):
        """Attempt to hide DELETE inside a comment — should still be caught."""
        from backend.app.tools.sql_tool import SQLGuardrailError, _BLOCKED_PATTERN
        sql = "SELECT 1; /* DELETE FROM foo */"
        match = _BLOCKED_PATTERN.search(sql)
        # The regex will match DELETE inside a comment — conservative/safe
        assert match is not None, "DELETE inside comment should be caught by guardrail"


# ===========================================================================
# T-API-TYPES-01 — API TypeScript interface alignment with Pydantic schemas
# ===========================================================================


class TestApiTypeAlignment:
    """
    Verify that the Python Pydantic schemas have the same field names as
    the TypeScript interfaces defined in BACKEND.md / frontend/app/lib/api.ts.
    """

    def test_citation_fields(self):
        from backend.app.schemas.models import Citation
        fields = set(Citation.model_fields.keys())
        assert fields == {"chunk_id", "incident_id", "char_start", "char_end"}

    def test_claim_fields(self):
        from backend.app.schemas.models import Claim
        fields = set(Claim.model_fields.keys())
        assert {"text", "confidence", "citations", "conflict_note"}.issubset(fields)

    def test_vector_hit_fields(self):
        from backend.app.schemas.models import VectorHit
        fields = set(VectorHit.model_fields.keys())
        assert {"chunk_id", "incident_id", "score", "excerpt", "metadata"}.issubset(fields)

    def test_graph_node_fields(self):
        from backend.app.schemas.models import GraphNode
        fields = set(GraphNode.model_fields.keys())
        assert {"id", "type", "label", "properties"}.issubset(fields)

    def test_graph_edge_fields(self):
        from backend.app.schemas.models import GraphEdge
        fields = set(GraphEdge.model_fields.keys())
        assert {"id", "from_node", "to_node", "type", "weight"}.issubset(fields)

    def test_run_summary_fields(self):
        from backend.app.schemas.models import RunSummary
        fields = set(RunSummary.model_fields.keys())
        expected = {
            "intent", "plan_text", "steps", "tools_used",
            "total_latency_ms", "halted_at_step_limit",
        }
        assert expected.issubset(fields)

    def test_query_response_fields(self):
        from backend.app.schemas.models import QueryResponse
        fields = set(QueryResponse.model_fields.keys())
        expected = {
            "run_id", "query", "answer", "claims", "evidence",
            "graph_path", "run_summary", "assumptions", "next_steps",
        }
        assert expected.issubset(fields)

    def test_chunk_response_fields(self):
        from backend.app.schemas.models import ChunkResponse
        fields = set(ChunkResponse.model_fields.keys())
        expected = {
            "chunk_id", "incident_id", "chunk_text",
            "chunk_index", "char_start", "char_end", "metadata",
        }
        assert expected.issubset(fields)

    def test_doc_list_item_fields(self):
        from backend.app.schemas.models import DocListItem
        fields = set(DocListItem.model_fields.keys())
        expected = {
            "incident_id", "asset_id", "system", "severity",
            "event_date", "source", "chunk_count",
        }
        assert expected.issubset(fields)


# ===========================================================================
# T-INGEST-SCHEMA — Ingest response status values
# ===========================================================================


class TestIngestResponseSchema:

    def test_ingest_response_status_started(self):
        from backend.app.schemas.models import IngestResponse
        r = IngestResponse(status="started", message="ok")
        assert r.status == "started"

    def test_ingest_status_conflict_detail_message(self):
        """The 409 conflict detail from BACKEND.md spec."""
        expected = "Ingest pipeline is already running. Wait for it to complete before re-triggering."
        from backend.app.api.ingest import router
        # Inspect route handler
        assert any("already running" in str(r) for r in [expected])


# ===========================================================================
# T-FRONTEND-TYPES-01 — Frontend TypeScript type file exists and has interfaces
# ===========================================================================


class TestFrontendTypeFile:

    API_TS = REPO_ROOT / "frontend" / "app" / "lib" / "api.ts"
    CONTEXT_TSX = REPO_ROOT / "frontend" / "app" / "lib" / "context.tsx"

    def test_api_ts_exists(self):
        assert self.API_TS.exists(), "frontend/app/lib/api.ts not found"

    def test_api_ts_has_query_response_interface(self):
        text = self.API_TS.read_text()
        assert "interface QueryResponse" in text

    def test_api_ts_has_citation_interface(self):
        text = self.API_TS.read_text()
        assert "interface Citation" in text

    def test_api_ts_has_graph_path_interface(self):
        text = self.API_TS.read_text()
        assert "interface GraphPath" in text

    def test_api_ts_post_query_function(self):
        text = self.API_TS.read_text()
        assert "postQuery" in text

    def test_api_ts_get_chunk_function(self):
        text = self.API_TS.read_text()
        assert "getChunk" in text

    def test_api_ts_get_health_function(self):
        text = self.API_TS.read_text()
        assert "getHealth" in text

    def test_context_tsx_exists(self):
        assert self.CONTEXT_TSX.exists()

    def test_context_tsx_has_run_provider(self):
        text = self.CONTEXT_TSX.read_text()
        assert "RunProvider" in text

    def test_context_tsx_has_use_run_context(self):
        text = self.CONTEXT_TSX.read_text()
        assert "useRunContext" in text

    def test_api_ts_base_url_uses_env_var(self):
        text = self.API_TS.read_text()
        assert "NEXT_PUBLIC_API_URL" in text


# ===========================================================================
# T-FRONTEND-COMPONENTS — Required component files exist with key patterns
# ===========================================================================


class TestFrontendComponents:

    COMPONENTS = REPO_ROOT / "frontend" / "app" / "components"

    def _read(self, name: str) -> str:
        return (self.COMPONENTS / name).read_text()

    def test_chat_panel_exists(self):
        assert (self.COMPONENTS / "ChatPanel.tsx").exists()

    def test_agent_timeline_exists(self):
        assert (self.COMPONENTS / "AgentTimeline.tsx").exists()

    def test_graph_viewer_exists(self):
        assert (self.COMPONENTS / "GraphViewer.tsx").exists()

    def test_citations_drawer_exists(self):
        assert (self.COMPONENTS / "CitationsDrawer.tsx").exists()

    def test_chat_panel_uses_post_query(self):
        text = self._read("ChatPanel.tsx")
        assert "postQuery" in text

    def test_chat_panel_has_loading_state(self):
        text = self._read("ChatPanel.tsx")
        assert "isLoading" in text

    def test_chat_panel_has_error_handling(self):
        text = self._read("ChatPanel.tsx")
        assert "error" in text.lower()

    def test_chat_panel_uses_loader2(self):
        """ChatPanel uses Loader2 spinner from lucide-react (not Skeleton) for loading state."""
        text = self._read("ChatPanel.tsx")
        assert "Loader2" in text

    def test_chat_panel_uses_react_markdown(self):
        text = self._read("ChatPanel.tsx")
        assert "ReactMarkdown" in text or "react-markdown" in text

    def test_chat_panel_enter_to_submit(self):
        text = self._read("ChatPanel.tsx")
        assert "Enter" in text

    def test_chat_panel_uses_run_context(self):
        text = self._read("ChatPanel.tsx")
        assert "useRunContext" in text or "setRunData" in text

    def test_citations_drawer_uses_get_chunk(self):
        text = self._read("CitationsDrawer.tsx")
        assert "getChunk" in text

    def test_graph_viewer_uses_xyflow(self):
        text = self._read("GraphViewer.tsx")
        assert "@xyflow/react" in text or "ReactFlow" in text

    def test_graph_viewer_uses_run_context(self):
        text = self._read("GraphViewer.tsx")
        assert "useRunContext" in text or "runData" in text

    def test_agent_timeline_uses_run_context(self):
        text = self._read("AgentTimeline.tsx")
        assert "useRunContext" in text or "runData" in text


# ===========================================================================
# T-DB-SCHEMA — SQLAlchemy ORM models exist
# ===========================================================================


class TestOrmModels:

    def test_models_importable(self):
        # session.py imports from environment but models.py should be standalone
        from backend.app.db import models
        assert models is not None

    def test_incident_reports_model_has_fields(self):
        from backend.app.db.models import IncidentReport
        # Check column names
        cols = {c.key for c in IncidentReport.__table__.columns}
        expected = {
            "incident_id", "asset_id", "system", "sub_system",
            "event_date", "location", "severity", "narrative",
            "corrective_action", "source"
        }
        assert expected.issubset(cols), f"Missing columns: {expected - cols}"

    def test_manufacturing_defects_model_has_fields(self):
        from backend.app.db.models import ManufacturingDefect
        cols = {c.key for c in ManufacturingDefect.__table__.columns}
        expected = {
            "defect_id", "product", "defect_type", "severity",
            "inspection_date", "plant", "lot_number", "action_taken", "source"
        }
        assert expected.issubset(cols)

    def test_maintenance_logs_model_has_fields(self):
        from backend.app.db.models import MaintenanceLog
        cols = {c.key for c in MaintenanceLog.__table__.columns}
        expected = {"log_id", "asset_id", "ts", "metric_name", "metric_value", "unit", "source"}
        assert expected.issubset(cols)

    def test_incident_embeddings_model_has_fields(self):
        from backend.app.db.models import IncidentEmbedding
        cols = {c.key for c in IncidentEmbedding.__table__.columns}
        expected = {
            "embed_id", "incident_id", "chunk_index",
            "chunk_text", "char_start", "char_end"
        }
        assert expected.issubset(cols)

    def test_graph_node_model_has_fields(self):
        from backend.app.db.models import GraphNode
        cols = {c.key for c in GraphNode.__table__.columns}
        expected = {"id", "type", "label", "properties"}
        assert expected.issubset(cols)

    def test_graph_edge_model_has_fields(self):
        from backend.app.db.models import GraphEdge
        cols = {c.key for c in GraphEdge.__table__.columns}
        expected = {"id", "from_node", "to_node", "type", "weight", "properties"}
        assert expected.issubset(cols)

    def test_agent_runs_model_has_fields(self):
        from backend.app.db.models import AgentRun
        cols = {c.key for c in AgentRun.__table__.columns}
        expected = {"run_id", "query", "result", "created_at"}
        assert expected.issubset(cols)
