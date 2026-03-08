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
# Non-fatal: if the DB is already ahead of local migration files (e.g. after a
# partial deploy where migrations ran but the image didn't include the file),
# alembic will fail with "Can't locate revision". Log the error and continue —
# the schema is already correct in that scenario and the backend can still serve.
if ! alembic upgrade head 2>&1; then
    echo "[entrypoint] WARNING: Alembic migration failed — DB schema may already be at target. Continuing."
fi
echo "[entrypoint] Migration step complete."

# --- Seed aircraft data (only on first run if tables are empty) ---
# Check BOTH incident_reports AND incident_embeddings: if embeddings are missing
# (e.g. after a schema migration that recreated tables) we must re-run ingest
# even when incident_reports already has rows.
echo "[entrypoint] Checking if aircraft seed data is needed..."
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
    inc_count = cur.fetchone()[0]
    cur.execute('SELECT COUNT(*) FROM incident_embeddings')
    emb_count = cur.fetchone()[0]
    conn.close()
    if inc_count == 0 or emb_count == 0:
        print('SEED_NEEDED')
    else:
        print(f'Data exists ({inc_count} incidents, {emb_count} embeddings). Skipping auto-seed.')
except Exception as e:
    print(f'Could not check row count: {e}')
" | grep -q "SEED_NEEDED" && {
    echo "[entrypoint] No aircraft data or embeddings found — triggering ingest pipeline..."
    cd /workspace && python -m backend.src.cli ingest --config backend/config.yaml || echo "[entrypoint] Ingest warning (non-fatal): check logs"
} || echo "[entrypoint] Existing aircraft data found — skipping auto-ingest."

# --- Seed medical data (only on first run if medical_cases or medical_embeddings is empty) ---
echo "[entrypoint] Checking if medical seed data is needed..."
python -c "
import os, sys
try:
    import psycopg2
    url = os.environ.get('PG_DSN') or os.environ.get('DATABASE_URL', '')
    url = url.replace('postgresql+asyncpg://', 'postgresql://')
    url = url.replace('postgres://', 'postgresql://')
    conn = psycopg2.connect(url)
    cur = conn.cursor()
    cur.execute('SELECT COUNT(*) FROM medical_cases')
    case_count = cur.fetchone()[0]
    cur.execute('SELECT COUNT(*) FROM medical_embeddings')
    emb_count = cur.fetchone()[0]
    conn.close()
    if case_count == 0 or emb_count == 0:
        print('MEDICAL_SEED_NEEDED')
    else:
        print(f'Medical data exists ({case_count} cases, {emb_count} embeddings). Skipping auto-seed.')
except Exception as e:
    print(f'Could not check medical row count: {e}')
" | grep -q "MEDICAL_SEED_NEEDED" && {
    echo "[entrypoint] No medical data found — triggering medical ingest pipeline..."
    cd /workspace && python -c "
from backend.app.ingest.medical_pipeline import run_medical_ingest_pipeline
result = run_medical_ingest_pipeline()
print(f'Medical ingest complete: {result}')
" || echo "[entrypoint] Medical ingest warning (non-fatal): check logs"
} || echo "[entrypoint] Existing medical data found — skipping medical auto-ingest."

# --- Start FastAPI ---
echo "[entrypoint] Starting uvicorn on port 8000..."
cd /workspace
exec uvicorn backend.app.main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --log-level info \
    --no-access-log
