"""
Alembic environment — runs migrations against the configured PostgreSQL database.
Reads PG_DSN or DATABASE_URL from environment (overrides alembic.ini).
"""
from __future__ import annotations

import os
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool

# Ensure repo root is on sys.path so "from backend.app.*" imports resolve.
# In Docker: WORKDIR=/workspace (repo root). Locally: repo root is parents[4].
_repo_root = str(Path(__file__).resolve().parents[4])
if _repo_root not in sys.path:
    sys.path.insert(0, _repo_root)

# Auto-load .env from the repo root so PG_DSN / DATABASE_URL are available
# when running `alembic upgrade head` directly (without pre-exporting env vars).
try:
    from dotenv import load_dotenv
    load_dotenv(Path(_repo_root) / ".env", encoding="utf-8")
except ImportError:
    pass  # python-dotenv not installed — rely on env vars being pre-set

from backend.app.db.models import Base  # noqa: E402

# Alembic Config object
config = context.config

# Set up Python logging from alembic.ini
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def get_url() -> str:
    """
    Prefer PG_DSN / DATABASE_URL from environment; fall back to alembic.ini.
    Ensures 'postgresql://' driver prefix (psycopg2) for migrations.
    """
    url = os.environ.get("PG_DSN") or os.environ.get("DATABASE_URL")
    if url:
        # Normalise: postgres:// → postgresql://
        url = url.replace("postgres://", "postgresql://", 1)
        # Strip asyncpg driver if present
        url = url.replace("postgresql+asyncpg://", "postgresql://")
        return url
    return config.get_main_option("sqlalchemy.url", "")


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (emit SQL script, no live DB connection)."""
    context.configure(
        url=get_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode (live DB connection)."""
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = get_url()

    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
