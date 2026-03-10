"""
test_wave4_user_id.py — Wave 4 user_id threading tests.

Covers:
1. orchestrator.run() signature accepts user_id keyword parameter
2. orchestrator.run(user_id="some-uuid") stores user_id in the save block
3. orchestrator.run() with no user_id stores None without error
4. AgentRun ORM model has user_id column
5. Alembic migration 0006 references correct revision chain
6. orchestrator.py references user_id in the INSERT statement

All tests run without a live database or real API key.
Uses source-level inspection and mock patching following the same patterns
as test_wave3_conversational_memory.py.
"""
from __future__ import annotations

import inspect
import os
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


ORCHESTRATOR_PATH = (
    Path(__file__).parent.parent / "app" / "agent" / "orchestrator.py"
)
MIGRATION_0006_PATH = (
    Path(__file__).parent.parent / "app" / "db" / "migrations" / "versions"
    / "0006_add_user_id_to_agent_runs.py"
)


# ===========================================================================
# Structural / source-level checks
# ===========================================================================


class TestOrchestratorUserIdSignature:
    """AC: orchestrator.run() must accept user_id as optional kwarg."""

    def test_run_signature_has_user_id_param(self):
        """orchestrator.run() must have user_id parameter."""
        from backend.app.agent.orchestrator import AgentOrchestrator
        sig = inspect.signature(AgentOrchestrator.run)
        assert "user_id" in sig.parameters, (
            "W4-006: AgentOrchestrator.run() missing 'user_id' parameter. "
            "W4-006 not implemented."
        )

    def test_user_id_defaults_to_none(self):
        """user_id parameter must default to None for backward compatibility."""
        from backend.app.agent.orchestrator import AgentOrchestrator
        sig = inspect.signature(AgentOrchestrator.run)
        param = sig.parameters["user_id"]
        assert param.default is None, (
            "W4-006: user_id default must be None. Got: " + repr(param.default)
        )

    def test_orchestrator_source_references_user_id_in_insert(self):
        """orchestrator.py must include user_id in the agent_runs INSERT."""
        content = ORCHESTRATOR_PATH.read_text()
        assert "user_id" in content, (
            "W4-006: orchestrator.py does not reference user_id. "
            "user_id threading not implemented."
        )
        # Must be in the INSERT statement
        assert "INSERT INTO agent_runs" in content, (
            "W4-006: orchestrator.py does not contain an INSERT INTO agent_runs statement."
        )
        # Both user_id column and value placeholder must appear near the INSERT
        assert ":user_id" in content, (
            "W4-006: orchestrator.py INSERT does not bind :user_id parameter."
        )

    def test_no_get_event_loop_in_app(self):
        """CR-007: No asyncio.get_event_loop() must appear anywhere in backend/app/."""
        app_root = Path(__file__).parent.parent / "app"
        violations = []
        for py_file in app_root.rglob("*.py"):
            text = py_file.read_text()
            if "get_event_loop" in text:
                violations.append(str(py_file))
        assert not violations, (
            "CR-007: get_event_loop() found in: " + ", ".join(violations) +
            " — use get_running_loop() instead."
        )


# ===========================================================================
# ORM model check
# ===========================================================================


class TestAgentRunOrmModel:
    """AC: AgentRun ORM model must have user_id column."""

    def test_agent_run_has_user_id_column(self):
        """AgentRun ORM class must define user_id attribute."""
        from backend.app.db.models import AgentRun
        # Check the class has user_id defined (as a mapped column)
        assert hasattr(AgentRun, "user_id"), (
            "W4-004: AgentRun ORM model does not have 'user_id' attribute. "
            "Add: user_id = Column(PGUUID(as_uuid=True), nullable=True, index=True)"
        )

    def test_agent_run_user_id_is_nullable(self):
        """AgentRun.user_id must be nullable so existing rows are unaffected."""
        from backend.app.db.models import AgentRun
        from sqlalchemy import inspect as sa_inspect
        mapper = sa_inspect(AgentRun)
        col = mapper.columns.get("user_id")
        assert col is not None, "W4-004: user_id column not found in AgentRun mapper."
        assert col.nullable is True, (
            "W4-004: AgentRun.user_id must be nullable=True. "
            "Existing rows would break if NOT NULL."
        )


# ===========================================================================
# Alembic migration check
# ===========================================================================


class TestMigration0006:
    """AC: Migration 0006 must have correct revision chain and CONCURRENTLY pattern."""

    def test_migration_file_exists(self):
        """0006_add_user_id_to_agent_runs.py must exist."""
        assert MIGRATION_0006_PATH.exists(), (
            "W4-005: Migration file 0006_add_user_id_to_agent_runs.py not found at: "
            + str(MIGRATION_0006_PATH)
        )

    def test_migration_revision_id(self):
        """Migration must declare revision = '0006_add_user_id'."""
        content = MIGRATION_0006_PATH.read_text()
        assert 'revision = "0006_add_user_id"' in content, (
            "W4-005: migration revision ID must be '0006_add_user_id'."
        )

    def test_migration_down_revision(self):
        """Migration must chain to 0005_wave3_indexes."""
        content = MIGRATION_0006_PATH.read_text()
        assert 'down_revision = "0005_wave3_indexes"' in content, (
            "W4-005: down_revision must be '0005_wave3_indexes'."
        )

    def test_migration_has_commit_before_concurrently(self):
        """CONCURRENTLY index requires op.execute('COMMIT') immediately before."""
        content = MIGRATION_0006_PATH.read_text()
        assert 'op.execute("COMMIT")' in content, (
            "W4-005: migration is missing op.execute('COMMIT') before CREATE INDEX CONCURRENTLY. "
            "This will fail on Neon/PostgreSQL."
        )
        assert "CONCURRENTLY" in content, (
            "W4-005: migration does not use CREATE INDEX CONCURRENTLY."
        )

    def test_migration_has_downgrade(self):
        """Migration must have a working downgrade() that drops column and index."""
        content = MIGRATION_0006_PATH.read_text()
        assert "def downgrade" in content, "W4-005: migration missing downgrade() function."
        assert "drop_column" in content, "W4-005: downgrade() must drop the user_id column."
        assert "DROP INDEX" in content, "W4-005: downgrade() must drop the index."


# ===========================================================================
# user_id flow through run() — using mocks
# ===========================================================================


class TestOrchestratorUserIdFlow:
    """AC: user_id value is stored in agent_runs INSERT when provided."""

    def test_user_id_accepted_as_kwarg(self):
        """orchestrator.run() must not raise TypeError when user_id is passed."""
        from backend.app.agent.orchestrator import AgentOrchestrator
        orch = AgentOrchestrator.__new__(AgentOrchestrator)
        sig = inspect.signature(AgentOrchestrator.run)
        # Verify keyword is valid — calling with user_id in bound args
        bound = sig.bind(orch, "test query", user_id="some-uuid-1234")
        assert bound.arguments["user_id"] == "some-uuid-1234"

    def test_user_id_none_accepted_as_kwarg(self):
        """orchestrator.run() must accept user_id=None without error."""
        from backend.app.agent.orchestrator import AgentOrchestrator
        orch = AgentOrchestrator.__new__(AgentOrchestrator)
        sig = inspect.signature(AgentOrchestrator.run)
        bound = sig.bind(orch, "test query", user_id=None)
        assert bound.arguments["user_id"] is None

    def test_user_id_stored_in_insert_params(self):
        """
        Verify that _user_uuid ends up in the execute() params dict when user_id is given.
        Uses source inspection to confirm the pattern rather than running the full pipeline.
        """
        content = ORCHESTRATOR_PATH.read_text()
        # The INSERT VALUES clause must bind :user_id
        assert '"user_id": _user_uuid' in content, (
            "W4-006: orchestrator.py must include '\"user_id\": _user_uuid' in the "
            "execute params dict passed to agent_runs INSERT."
        )

    def test_user_id_uuid_conversion_in_source(self):
        """
        Verify orchestrator converts string user_id to UUID object before INSERT.
        This matches the session_id pattern and ensures correct PostgreSQL type.
        """
        content = ORCHESTRATOR_PATH.read_text()
        assert "_user_uuid" in content, (
            "W4-006: orchestrator.py must use _user_uuid variable for UUID conversion."
        )
        assert "_uuid.UUID(user_id)" in content, (
            "W4-006: orchestrator.py must call _uuid.UUID(user_id) for type conversion."
        )

    def test_user_id_null_when_not_provided_in_source(self):
        """
        Verify that _user_uuid defaults to None, so omitting user_id stores NULL.
        """
        content = ORCHESTRATOR_PATH.read_text()
        assert "_user_uuid = None" in content, (
            "W4-006: orchestrator.py must initialise _user_uuid = None before "
            "conditionally parsing user_id. Omitting user_id must store NULL."
        )


# ===========================================================================
# Auth module registration in API layer
# ===========================================================================


class TestAuthDependencyRegistration:
    """AC: Protected routers must import and use get_current_user."""

    def _read_api_file(self, filename: str) -> str:
        path = Path(__file__).parent.parent / "app" / "api" / filename
        return path.read_text()

    def test_query_router_imports_get_current_user(self):
        content = self._read_api_file("query.py")
        # get_optional_user is the correct dependency for /query — it validates
        # tokens when present but allows anonymous requests through (no 401 for
        # missing token). get_current_user (hard-required) is also accepted for
        # backwards compatibility.
        assert "get_optional_user" in content or "get_current_user" in content, (
            "W4-007: query.py does not import or use get_optional_user/get_current_user."
        )

    def test_query_router_passes_user_id_to_orchestrator(self):
        content = self._read_api_file("query.py")
        assert "user_id" in content, (
            "W4-007: query.py does not pass user_id to orchestrator.run()."
        )

    def test_runs_router_imports_get_current_user(self):
        content = self._read_api_file("runs.py")
        # get_optional_user is the correct dependency for read endpoints — it
        # validates tokens when present but returns an empty list for anonymous
        # requests rather than 401. Write endpoints (PATCH favourite) still
        # require authentication via the explicit None check inside the handler.
        assert "get_optional_user" in content or "get_current_user" in content, (
            "W4-007: runs.py does not import or use get_optional_user/get_current_user."
        )

    def test_runs_router_filters_by_user_id(self):
        content = self._read_api_file("runs.py")
        assert "user_id" in content, (
            "W4-007: runs.py does not filter runs by user_id."
        )

    def test_analytics_router_imports_get_optional_user(self):
        # Analytics endpoints use soft auth (get_optional_user) so anonymous
        # users can still view the dashboard. Hard auth (get_current_user)
        # would break the dashboard for unauthenticated users — BUG-AUTH-003.
        content = self._read_api_file("analytics.py")
        assert "get_optional_user" in content, (
            "BUG-AUTH-003 fix: analytics.py must use get_optional_user (not get_current_user) "
            "so anonymous users are not returned 401 when viewing the dashboard."
        )

    def test_auth_jwt_module_exists(self):
        """backend/app/auth/jwt.py must exist."""
        jwt_path = Path(__file__).parent.parent / "app" / "auth" / "jwt.py"
        assert jwt_path.exists(), "W4-003: backend/app/auth/jwt.py does not exist."

    def test_auth_init_exists(self):
        """backend/app/auth/__init__.py must exist."""
        init_path = Path(__file__).parent.parent / "app" / "auth" / "__init__.py"
        assert init_path.exists(), "W4-002: backend/app/auth/__init__.py does not exist."
