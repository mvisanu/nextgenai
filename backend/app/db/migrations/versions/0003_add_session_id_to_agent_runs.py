"""Add session_id nullable UUID column to agent_runs.

Revision ID: 0003_add_session_id
Revises: 0002_medical_domain
Create Date: 2026-03-07

W3-001 — Epic 1: Conversational Memory
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = "0003_add_session_id"
down_revision = "0002_medical_domain"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    Add session_id UUID nullable column to agent_runs.

    Nullable with no default — existing rows get NULL automatically.
    This is a zero-breaking-change schema addition; no API callers are affected.
    """
    op.add_column(
        "agent_runs",
        sa.Column(
            "session_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    """Drop session_id column — restores pre-W3-001 schema."""
    op.drop_column("agent_runs", "session_id")
