"""
FastAPI application factory for NextAgentAI backend.
Configures CORS, lifespan (DB pool init/dispose), size limits, and routers.
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.app.api import docs, ingest, query
from backend.app.db.session import dispose_async_engine, get_async_engine
from backend.app.observability.logging import get_logger

logger = get_logger(__name__)

# Frontend origins allowed to call the API
CORS_ORIGINS = [
    "http://localhost:3005",    # Next.js dev server
    "http://127.0.0.1:3005",
    "https://next-agent-ai.vercel.app",  # Vercel production (update with actual URL)
    "*",  # Temporarily open for demo; remove in any production deployment
]

# Request body size limits
QUERY_MAX_BYTES = 1 * 1024 * 1024    # 1 MB
INGEST_MAX_BYTES = 10 * 1024 * 1024  # 10 MB


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    FastAPI lifespan context manager.
    Initialises the DB engine pool on startup; disposes on shutdown.
    """
    logger.info("Starting NextAgentAI backend")
    # Pre-warm the async engine so first request doesn't bear the connection cost
    try:
        get_async_engine()
        logger.info("Database pool initialised")
    except Exception as exc:
        logger.warning(
            "DB pool init failed (DB may not be ready yet)",
            extra={"error": str(exc)},
        )

    yield

    logger.info("Shutting down NextAgentAI backend")
    await dispose_async_engine()


def create_app() -> FastAPI:
    """
    Application factory — returns a configured FastAPI application.
    Call this function to create the ASGI app instance.
    """
    app = FastAPI(
        title="NextAgentAI API",
        description=(
            "Agentic manufacturing intelligence: vector search, GraphRAG, SQL, and Claude "
            "orchestrated in a single agent loop."
        ),
        version="1.0.0",
        docs_url="/api/docs",       # Swagger UI
        redoc_url="/api/redoc",     # ReDoc
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )

    # ------------------------------------------------------------------ CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ------------------------------------------------------------------ Request size limit middleware
    @app.middleware("http")
    async def limit_request_size(request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length:
            size = int(content_length)
            if request.url.path == "/ingest" and size > INGEST_MAX_BYTES:
                return JSONResponse(
                    status_code=413,
                    content={"detail": f"Request body too large for /ingest (max {INGEST_MAX_BYTES // 1024 // 1024}MB)"},
                )
            if request.url.path == "/query" and size > QUERY_MAX_BYTES:
                return JSONResponse(
                    status_code=413,
                    content={"detail": f"Request body too large for /query (max {QUERY_MAX_BYTES // 1024}KB)"},
                )
        return await call_next(request)

    # ------------------------------------------------------------------ Routers
    app.include_router(ingest.router, tags=["Ingestion"])
    app.include_router(query.router, tags=["Query"])
    app.include_router(docs.router, tags=["Documents"])

    # Root redirect to docs
    @app.get("/", include_in_schema=False)
    async def root():
        return {"message": "NextAgentAI API", "docs": "/api/docs", "health": "/healthz"}

    return app


# ASGI entry point for uvicorn
app = create_app()
