#!/usr/bin/env bash
# =============================================================
# NextAgentAI Backend Entrypoint
# Runs on both local Docker and Render deployment.
# Steps:
#   1. Wait for PostgreSQL to be ready
#   2. Run Alembic migrations
#   3. Start FastAPI via uvicorn
# =============================================================

set -e

echo "[entrypoint] Starting NextAgentAI backend..."

# --- Wait for database ---
echo "[entrypoint] Waiting for database..."
MAX_RETRIES=30
RETRY_COUNT=0

# Extract host from PG_DSN or DATABASE_URL
DB_URL="${PG_DSN:-${DATABASE_URL:-}}"

until python -c "
import os, sys
try:
    import psycopg2
    url = os.environ.get('PG_DSN') or os.environ.get('DATABASE_URL', '')
    url = url.replace('postgresql+asyncpg://', 'postgresql://')
    url = url.replace('postgres://', 'postgresql://')
    conn = psycopg2.connect(url)
    conn.close()
    print('DB ready')
    sys.exit(0)
except Exception as e:
    print(f'DB not ready: {e}')
    sys.exit(1)
" 2>/dev/null; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ "$RETRY_COUNT" -ge "$MAX_RETRIES" ]; then
        echo "[entrypoint] ERROR: Database not ready after ${MAX_RETRIES} attempts. Exiting."
        exit 1
    fi
    echo "[entrypoint] DB not ready, retrying in 2s... (${RETRY_COUNT}/${MAX_RETRIES})"
    sleep 2
done

echo "[entrypoint] Database is ready."

# --- Run Alembic migrations ---
echo "[entrypoint] Running database migrations..."
cd /workspace/backend
alembic upgrade head
echo "[entrypoint] Migrations complete."

# --- Seed data (only on first run if tables are empty) ---
echo "[entrypoint] Checking if seed data is needed..."
python -c "
import os, sys
try:
    import psycopg2
    url = os.environ.get('PG_DSN') or os.environ.get('DATABASE_URL', '')
    url = url.replace('postgresql+asyncpg://', 'postgresql://')
    url = url.replace('postgres://', 'postgresql://')
    conn = psycopg2.connect(url)
    cur = conn.cursor()
    cur.execute('SELECT COUNT(*) FROM incident_reports')
    count = cur.fetchone()[0]
    conn.close()
    if count == 0:
        print('SEED_NEEDED')
    else:
        print(f'Data exists ({count} incidents). Skipping auto-seed.')
except Exception as e:
    print(f'Could not check row count: {e}')
" | grep -q "SEED_NEEDED" && {
    echo "[entrypoint] No data found — triggering ingest pipeline..."
    cd /workspace && python -m backend.src.cli ingest --config backend/config.yaml || echo "[entrypoint] Ingest warning (non-fatal): check logs"
} || echo "[entrypoint] Existing data found — skipping auto-ingest."

# --- Start FastAPI ---
echo "[entrypoint] Starting uvicorn on port 8000..."
cd /workspace
exec uvicorn backend.app.main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --log-level info \
    --no-access-log
