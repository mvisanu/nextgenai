"""Wave 3 performance indexes:
- HNSW cosine index on medical_embeddings (replaces IVFFlat, matches aircraft)
- GIN FTS indexes on incident_reports.narrative and medical_cases.narrative
- Composite index on agent_runs(LOWER(query), created_at DESC) for cache lookup

Revision ID: 0005_wave3_indexes
Revises: 0004_add_is_favourite
Create Date: 2026-03-07

W3-025 — Epic 9: Medical Domain Parity + performance

NOTE: Each CREATE INDEX CONCURRENTLY must run outside a transaction block.
We use connection.execution_options(isolation_level="AUTOCOMMIT") so that
Alembic's transaction context is bypassed for the index statements while the
migration version stamp is still written correctly by Alembic after upgrade()
returns.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0005_wave3_indexes"
down_revision = "0004_add_is_favourite"
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    connection.execution_options(isolation_level="AUTOCOMMIT")

    # 1. HNSW index on medical_embeddings — parity with incident_embeddings
    connection.execute(sa.text("""
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_medical_embeddings_hnsw
        ON medical_embeddings USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    """))

    # 2. GIN full-text index on incident_reports.narrative (aircraft domain BM25)
    connection.execute(sa.text("""
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_incident_reports_fts
        ON incident_reports USING GIN(to_tsvector('english', narrative))
    """))

    # 3. GIN full-text index on medical_cases.narrative (medical domain BM25)
    connection.execute(sa.text("""
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_medical_cases_fts
        ON medical_cases USING GIN(to_tsvector('english', narrative))
    """))

    # 4. Composite index on agent_runs for query-cache LOWER(query) lookups
    connection.execute(sa.text("""
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_runs_query_ts
        ON agent_runs (LOWER(query), created_at DESC)
    """))


def downgrade() -> None:
    # Standard DROP INDEX — does not require autocommit
    op.execute("DROP INDEX IF EXISTS idx_medical_embeddings_hnsw")
    op.execute("DROP INDEX IF EXISTS idx_incident_reports_fts")
    op.execute("DROP INDEX IF EXISTS idx_medical_cases_fts")
    op.execute("DROP INDEX IF EXISTS idx_agent_runs_query_ts")
