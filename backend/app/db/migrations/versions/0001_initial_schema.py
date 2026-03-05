"""Initial schema — all 7 tables + indexes

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-03-04

Creates:
  - incident_reports
  - manufacturing_defects
  - maintenance_logs
  - incident_embeddings  (vector(384) + IVFFlat index)
  - graph_node
  - graph_edge
  - agent_runs
"""
from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------ pgvector
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # ------------------------------------------------------------------ incident_reports
    op.create_table(
        "incident_reports",
        sa.Column("incident_id", sa.Text, primary_key=True),
        sa.Column("asset_id", sa.Text, nullable=True),
        sa.Column("system", sa.Text, nullable=True),
        sa.Column("sub_system", sa.Text, nullable=True),
        sa.Column("event_date", sa.Date, nullable=True),
        sa.Column("location", sa.Text, nullable=True),
        sa.Column("severity", sa.Text, nullable=True),
        sa.Column("narrative", sa.Text, nullable=True),
        sa.Column("corrective_action", sa.Text, nullable=True),
        sa.Column("source", sa.Text, nullable=False, server_default="synthetic"),
    )
    op.create_index("idx_incidents_asset_id", "incident_reports", ["asset_id"])
    op.create_index("idx_incidents_event_date", "incident_reports", ["event_date"])

    # ------------------------------------------------------------------ manufacturing_defects
    op.create_table(
        "manufacturing_defects",
        sa.Column("defect_id", sa.Text, primary_key=True),
        sa.Column("product", sa.Text, nullable=True),
        sa.Column("defect_type", sa.Text, nullable=True),
        sa.Column("severity", sa.Text, nullable=True),
        sa.Column("inspection_date", sa.Date, nullable=True),
        sa.Column("plant", sa.Text, nullable=True),
        sa.Column("lot_number", sa.Text, nullable=True),
        sa.Column("action_taken", sa.Text, nullable=True),
        sa.Column("source", sa.Text, nullable=False, server_default="kaggle"),
    )
    op.create_index("idx_defects_product", "manufacturing_defects", ["product"])

    # ------------------------------------------------------------------ maintenance_logs
    op.create_table(
        "maintenance_logs",
        sa.Column("log_id", sa.Text, primary_key=True),
        sa.Column("asset_id", sa.Text, nullable=True),
        sa.Column("ts", sa.DateTime, nullable=True),
        sa.Column("metric_name", sa.Text, nullable=True),
        sa.Column("metric_value", sa.Float, nullable=True),
        sa.Column("unit", sa.Text, nullable=True),
        sa.Column("source", sa.Text, nullable=False, server_default="kaggle"),
    )
    op.create_index("idx_logs_asset_ts", "maintenance_logs", ["asset_id", "ts"])

    # ------------------------------------------------------------------ incident_embeddings
    op.create_table(
        "incident_embeddings",
        sa.Column("embed_id", sa.Text, primary_key=True),
        sa.Column(
            "incident_id",
            sa.Text,
            sa.ForeignKey("incident_reports.incident_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("chunk_index", sa.Integer, nullable=False),
        sa.Column("chunk_text", sa.Text, nullable=False),
        sa.Column("embedding", Vector(384), nullable=True),
        sa.Column("char_start", sa.Integer, nullable=True),
        sa.Column("char_end", sa.Integer, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index(
        "idx_embeddings_incident_id", "incident_embeddings", ["incident_id"]
    )
    # IVFFlat cosine index for vector similarity search
    # NOTE: lists=100 is appropriate for ~10k vectors; increase if dataset grows > 100k
    op.execute(
        """
        CREATE INDEX idx_incident_embeddings_vec
        ON incident_embeddings
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)
        """
    )

    # ------------------------------------------------------------------ graph_node
    op.create_table(
        "graph_node",
        sa.Column("id", sa.Text, primary_key=True),
        sa.Column("type", sa.Text, nullable=False),    # 'entity' | 'chunk'
        sa.Column("label", sa.Text, nullable=True),
        sa.Column("properties", sa.dialects.postgresql.JSONB, nullable=True),
    )

    # ------------------------------------------------------------------ graph_edge
    op.create_table(
        "graph_edge",
        sa.Column("id", sa.Text, primary_key=True),
        sa.Column(
            "from_node",
            sa.Text,
            sa.ForeignKey("graph_node.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "to_node",
            sa.Text,
            sa.ForeignKey("graph_node.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("type", sa.Text, nullable=False),    # 'mentions' | 'similarity' | 'co_occurrence'
        sa.Column("weight", sa.Float, nullable=True),
        sa.Column("properties", sa.dialects.postgresql.JSONB, nullable=True),
    )
    op.create_index("idx_graph_edge_from", "graph_edge", ["from_node"])
    op.create_index("idx_graph_edge_to", "graph_edge", ["to_node"])

    # ------------------------------------------------------------------ agent_runs
    op.create_table(
        "agent_runs",
        sa.Column("run_id", sa.Text, primary_key=True),
        sa.Column("query", sa.Text, nullable=True),
        sa.Column("result", sa.dialects.postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("agent_runs")
    op.drop_table("graph_edge")
    op.drop_table("graph_node")
    op.drop_table("incident_embeddings")
    op.drop_table("maintenance_logs")
    op.drop_table("manufacturing_defects")
    op.drop_table("incident_reports")
    op.execute("DROP EXTENSION IF EXISTS vector")
