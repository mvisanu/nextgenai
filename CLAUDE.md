# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

An agentic AI MVP that answers queries over three dataset types — incident reports (narrative text), manufacturing defects (structured metadata), and maintenance logs (time-series events) — by routing to vector search, SQL, or hybrid tool chains and synthesizing a cited response.

## Commands

```bash
# Install dependencies
pip install -r requirements.txt

# Ingest all datasets (generates synthetic data if CSVs are absent)
python -m src.cli ingest --config config.yaml

# Query the agent
python -m src.cli ask "Find similar incidents to: <free text>"
python -m src.cli ask "Show defect trends by product for last 90 days"
python -m src.cli ask "Given this incident text, classify defect and recommend action: <text>"

# Run tests
pytest tests/
pytest tests/test_sql_guardrails.py   # single test file
pytest -k "test_router"               # single test by name
```

## Architecture

### Data Layer (`src/db.py`, `src/ingest.py`)
- **SQLite** single-file database with three canonical tables: `incident_reports`, `manufacturing_defects`, `maintenance_logs`
- A unified `events` link table connects records across tables via fuzzy keys (date / product / system / part)
- `ingest.py` reads CSVs from paths in `config.yaml`, maps columns to canonical schemas, or generates synthetic data if files are absent

### Vector Layer (`src/embeddings.py`, `src/vector_index.py`)
- `incident_reports.narrative_text` is chunked (~300–600 tokens, 50–100 token overlap) and embedded using a local-friendly model
- Chunks stored in a **FAISS or Chroma** local index with metadata (incident_id, date, system, severity)
- Interface: `embed()`, `upsert()`, `query(top_k)` returning scores + metadata

### Tools (`src/tools_sql.py`, `src/tools_vector.py`)
- `SQLQueryTool`: executes SELECT-only queries; guardrails reject DROP/DELETE/UPDATE/INSERT
- `VectorSearchTool`: takes `query_text` + optional filters, returns top-k chunks with scores/excerpts
- Pre-built SQL queries: defect counts by product+type (last N days), severity distribution, maintenance event trends, incident↔defect join

### Agent (`src/agent.py`)
- **Intent router** classifies each query as `vector-only`, `sql-only`, or `hybrid`
- Calls the appropriate tool(s), then runs a reasoning/synthesis step
- Output schema: `answer`, `evidence` (vector hits + SQL rows), `assumptions`, `next_steps`

### CLI / API (`src/cli.py`)
- Entry point: `python -m src.cli <subcommand>`
- Subcommands: `ingest`, `ask`

## Configuration

`config.yaml` controls dataset CSV paths and key parameters (embedding model, chunk size/overlap, top-k, SQLite path, vector index path).

## Key Constraints
- SQL tool must only allow SELECT; all other statement types must be rejected
- Vector embeddings must store chunk metadata alongside vectors (not just IDs)
- Agent output must always include evidence references (record IDs + snippets)
- Synthetic data generation must produce realistic distributions across all three schemas
