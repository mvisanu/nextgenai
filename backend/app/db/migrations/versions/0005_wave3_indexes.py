"""Wave 3 performance indexes:
- HNSW cosine index on medical_embeddings (replaces IVFFlat, matches aircraft)
- GIN FTS indexes on incident_reports.narrative and medical_cases.narrative
- Composite index on agent_runs(LOWER(query), created_at DESC) for cache lookup

Revision ID: 0005_wave3_indexes
Revises: 0004_add_is_favourite
Create Date: 2026-03-07

W3-025 — Epic 9: Medical Domain Parity + performance

WARNING: Each CREATE INDEX CONCURRENTLY must be preceded by op.execute("COMMIT")
because CONCURRENTLY cannot run inside a PostgreSQL transaction block.
Alembic wraps migrations in transactions by default — the explicit COMMIT ends
the implicit transaction so CONCURRENTLY can proceed. Without this the index
creation silently fails or raises an error.
"""
from __future__ import annotations

from alembic import op

revision = "0005_wave3_indexes"
down_revision = "0004_add_is_favourite"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------ IMPORTANT
    # Each CONCURRENTLY index requires the transaction block to be ended first.
    # op.execute("COMMIT") ends Alembic's implicit transaction for this statement.
    # ------------------------------------------------------------------ IMPORTANT

    # 1. HNSW index on medical_embeddings — parity with incident_embeddings
    op.execute("COMMIT")
    op.execute("""
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_medical_embeddings_hnsw
        ON medical_embeddings USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    """)

    # 2. GIN full-text index on incident_reports.narrative (aircraft domain BM25)
    op.execute("COMMIT")
    op.execute("""
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_incident_reports_fts
        ON incident_reports USING GIN(to_tsvector('english', narrative))
    """)

    # 3. GIN full-text index on medical_cases.narrative (medical domain BM25)
    op.execute("COMMIT")
    op.execute("""
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_medical_cases_fts
        ON medical_cases USING GIN(to_tsvector('english', narrative))
    """)

    # 4. Composite index on agent_runs for query-cache LOWER(query) lookups
    op.execute("COMMIT")
    op.execute("""
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_runs_query_ts
        ON agent_runs (LOWER(query), created_at DESC)
    """)


def downgrade() -> None:
    # Standard DROP INDEX — does not require COMMIT wrapper
    op.execute("DROP INDEX IF EXISTS idx_medical_embeddings_hnsw")
    op.execute("DROP INDEX IF EXISTS idx_incident_reports_fts")
    op.execute("DROP INDEX IF EXISTS idx_medical_cases_fts")
    op.execute("DROP INDEX IF EXISTS idx_agent_runs_query_ts")
