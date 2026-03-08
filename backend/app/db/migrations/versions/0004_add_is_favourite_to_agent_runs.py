"""Add is_favourite BOOLEAN NOT NULL DEFAULT FALSE column to agent_runs.

Revision ID: 0004_add_is_favourite
Revises: 0003_add_session_id
Create Date: 2026-03-07

W3-002 — Epic 2: Query History & Favourites
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0004_add_is_favourite"
down_revision = "0003_add_session_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    Add is_favourite BOOLEAN NOT NULL DEFAULT FALSE to agent_runs.

    NOT NULL is safe here because FALSE is a valid default for all existing rows.
    server_default ensures PostgreSQL fills the column at the DB level during ALTER TABLE.
    No data migration is needed.
    """
    op.add_column(
        "agent_runs",
        sa.Column(
            "is_favourite",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    """Drop is_favourite column — restores pre-W3-002 schema."""
    op.drop_column("agent_runs", "is_favourite")
