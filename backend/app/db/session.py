"""
Database session factory for NextAgentAI.
Provides both sync (for Alembic/CLI) and async (for FastAPI) session access.
"""
from __future__ import annotations

import os
from contextlib import asynccontextmanager, contextmanager
from typing import AsyncGenerator, Generator

from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import Session, sessionmaker

from backend.app.observability.logging import get_logger

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Settings / DSN resolution
# ---------------------------------------------------------------------------


def _get_dsn(async_driver: bool = False) -> str:
    """
    Read PG_DSN or DATABASE_URL from environment.
    Converts postgresql:// → postgresql+asyncpg:// for async usage.
    """
    dsn = os.environ.get("PG_DSN") or os.environ.get("DATABASE_URL")
    if not dsn:
        raise EnvironmentError(
            "PG_DSN or DATABASE_URL environment variable is required. "
            "Copy .env.example → .env and fill in your database connection string."
        )
    # Strip Neon's sslmode for asyncpg (asyncpg handles SSL differently)
    if async_driver:
        dsn = dsn.replace("?sslmode=require", "").replace("&sslmode=require", "")
        if dsn.startswith("postgresql://"):
            dsn = dsn.replace("postgresql://", "postgresql+asyncpg://", 1)
        elif dsn.startswith("postgres://"):
            dsn = dsn.replace("postgres://", "postgresql+asyncpg://", 1)
    else:
        # Sync driver: keep sslmode but normalise postgres:// → postgresql://
        if dsn.startswith("postgres://"):
            dsn = dsn.replace("postgres://", "postgresql://", 1)
    return dsn


# ---------------------------------------------------------------------------
# Sync engine (Alembic, CLI, tests)
# ---------------------------------------------------------------------------

_sync_engine = None


def get_sync_engine():
    global _sync_engine
    if _sync_engine is None:
        dsn = _get_dsn(async_driver=False)
        _sync_engine = create_engine(
            dsn,
            pool_pre_ping=True,
            pool_size=10,
            max_overflow=10,
            pool_timeout=30,
            pool_recycle=1800,
        )
        logger.info("Sync DB engine created")
    return _sync_engine


SyncSessionLocal = None


def _make_sync_session_factory():
    global SyncSessionLocal
    if SyncSessionLocal is None:
        SyncSessionLocal = sessionmaker(
            bind=get_sync_engine(), autocommit=False, autoflush=False
        )
    return SyncSessionLocal


@contextmanager
def get_sync_session() -> Generator[Session, None, None]:
    """Yield a synchronous SQLAlchemy session. Rolls back on exception."""
    factory = _make_sync_session_factory()
    session: Session = factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


# ---------------------------------------------------------------------------
# Async engine (FastAPI request handlers)
# ---------------------------------------------------------------------------

_async_engine = None
_async_session_factory = None


def get_async_engine():
    global _async_engine
    if _async_engine is None:
        dsn = _get_dsn(async_driver=True)
        _async_engine = create_async_engine(
            dsn,
            pool_pre_ping=True,
            pool_size=10,
            max_overflow=20,
            pool_timeout=30,
            pool_recycle=1800,
            connect_args={"server_settings": {"hnsw.ef_search": "40"}},
        )
        logger.info("Async DB engine created")
    return _async_engine


def get_async_session_factory() -> async_sessionmaker[AsyncSession]:
    global _async_session_factory
    if _async_session_factory is None:
        _async_session_factory = async_sessionmaker(
            bind=get_async_engine(),
            autocommit=False,
            autoflush=False,
            expire_on_commit=False,
        )
    return _async_session_factory


@asynccontextmanager
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Async context manager for a single request session.
    Usage:
        async with get_session() as session:
            result = await session.execute(...)
    """
    factory = get_async_session_factory()
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def dispose_async_engine() -> None:
    """Called during FastAPI shutdown to cleanly close pool connections."""
    global _async_engine
    if _async_engine is not None:
        await _async_engine.dispose()
        logger.info("Async DB engine disposed")


async def check_db_health() -> bool:
    """Quick liveness check — returns True if DB is reachable."""
    try:
        async with get_session() as session:
            await session.execute(text("SELECT 1"))
        return True
    except Exception as exc:
        logger.error("DB health check failed", extra={"error": str(exc)})
        return False
