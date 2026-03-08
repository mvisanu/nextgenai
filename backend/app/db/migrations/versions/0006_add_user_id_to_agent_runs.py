"""Add user_id to agent_runs

Adds a nullable UUID column user_id to agent_runs, linking each run to the
authenticated Supabase user who submitted the query. Nullable so all existing
rows are preserved unchanged (they receive NULL).

A composite index on (user_id, created_at DESC) supports the GET /runs query
which filters by user_id and orders by recency.

Revision ID: 0006_add_user_id
Revises: 0005_wave3_indexes
Create Date: 2026-03-08

W4-004 / W4-005 — Wave 4: Supabase Auth

WARNING: CREATE INDEX CONCURRENTLY must be preceded by op.execute("COMMIT")
because CONCURRENTLY cannot run inside a PostgreSQL transaction block.
Alembic wraps migrations in transactions by default — the explicit COMMIT ends
the implicit transaction so CONCURRENTLY can proceed. Without this the index
creation silently fails or raises an error.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0006_add_user_id"
down_revision = "0005_wave3_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------ IMPORTANT
    # The CONCURRENTLY index requires the transaction block to be ended first.
    # op.execute("COMMIT") ends Alembic's implicit transaction for this statement.
    # ------------------------------------------------------------------ IMPORTANT

    # 1. Add user_id UUID NULLABLE column to agent_runs
    op.add_column(
        "agent_runs",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )

    # 2. Composite index on (user_id, created_at DESC) for per-user history queries
    op.execute("COMMIT")
    op.execute("""
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_runs_user_id
        ON agent_runs (user_id, created_at DESC)
    """)


def downgrade() -> None:
    # Standard DROP INDEX — does not require COMMIT wrapper
    op.execute("DROP INDEX IF EXISTS idx_agent_runs_user_id")
    op.drop_column("agent_runs", "user_id")
