"""Medical domain tables — medical_cases, disease_records, medical_embeddings

Revision ID: 0002_medical_domain
Revises: 0001_initial_schema
Create Date: 2026-03-05

Creates:
  - medical_cases        (narrative clinical case reports — MACCROBAT)
  - disease_records      (structured Disease Symptoms & Patient Profile CSV)
  - medical_embeddings   (vector(384) + IVFFlat cosine index)
"""
from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

revision = "0002_medical_domain"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------ medical_cases
    op.create_table(
        "medical_cases",
        sa.Column("case_id", sa.Text, primary_key=True),
        sa.Column("system", sa.Text, nullable=True),           # body system: Cardiac, Respiratory, etc.
        sa.Column("sub_system", sa.Text, nullable=True),
        sa.Column("event_date", sa.Date, nullable=True),
        sa.Column("severity", sa.Text, nullable=True),         # Critical | High | Medium | Low
        sa.Column("narrative", sa.Text, nullable=True),        # full clinical case text
        sa.Column("corrective_action", sa.Text, nullable=True),# extracted treatment sentences
        sa.Column("entities", sa.Text, nullable=True),         # JSON array of NER entity types
        sa.Column("source", sa.Text, nullable=False, server_default="maccrobat"),
    )
    op.create_index("idx_medical_cases_system", "medical_cases", ["system"])
    op.create_index("idx_medical_cases_severity", "medical_cases", ["severity"])
    op.create_index("idx_medical_cases_event_date", "medical_cases", ["event_date"])

    # ------------------------------------------------------------------ disease_records
    op.create_table(
        "disease_records",
        sa.Column("record_id", sa.Text, primary_key=True),
        sa.Column("disease", sa.Text, nullable=True),
        sa.Column("fever", sa.Boolean, nullable=True),
        sa.Column("cough", sa.Boolean, nullable=True),
        sa.Column("fatigue", sa.Boolean, nullable=True),
        sa.Column("difficulty_breathing", sa.Boolean, nullable=True),
        sa.Column("age", sa.Integer, nullable=True),
        sa.Column("gender", sa.Text, nullable=True),
        sa.Column("blood_pressure", sa.Text, nullable=True),
        sa.Column("cholesterol_level", sa.Text, nullable=True),
        sa.Column("outcome", sa.Text, nullable=True),          # Positive | Negative
        sa.Column("severity", sa.Text, nullable=True),
        sa.Column("specialty", sa.Text, nullable=True),        # Cardiology, Neurology, etc.
        sa.Column("inspection_date", sa.Date, nullable=True),
        sa.Column("source", sa.Text, nullable=False, server_default="kaggle"),
    )
    op.create_index("idx_disease_records_disease", "disease_records", ["disease"])
    op.create_index("idx_disease_records_severity", "disease_records", ["severity"])
    op.create_index("idx_disease_records_specialty", "disease_records", ["specialty"])

    # ------------------------------------------------------------------ medical_embeddings
    op.create_table(
        "medical_embeddings",
        sa.Column("embed_id", sa.Text, primary_key=True),
        sa.Column(
            "case_id",
            sa.Text,
            sa.ForeignKey("medical_cases.case_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("chunk_index", sa.Integer, nullable=False),
        sa.Column("chunk_text", sa.Text, nullable=False),
        sa.Column("embedding", Vector(384), nullable=True),
        sa.Column("char_start", sa.Integer, nullable=True),
        sa.Column("char_end", sa.Integer, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index("idx_medical_embeddings_case_id", "medical_embeddings", ["case_id"])
    # IVFFlat cosine index — lists=100 appropriate for up to ~100k vectors
    op.execute(
        """
        CREATE INDEX idx_medical_embeddings_vec
        ON medical_embeddings
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)
        """
    )


def downgrade() -> None:
    op.drop_table("medical_embeddings")
    op.drop_table("disease_records")
    op.drop_table("medical_cases")
