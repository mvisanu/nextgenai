You are a senior full-stack AI engineer and data architect. Build a production-quality MVP that demonstrates an agentic workflow using THREE dataset types combined:

1) Incident Reports (narrative text) -> embeddings + vector search
2) Manufacturing Defects (structured metadata) -> schema + filters + joins
3) Maintenance Logs (time series events) -> SQL trend queries

CRITICAL: Before writing any code, output a clear PLAN with:
- Architecture diagram (text form)
- Data model (tables + fields)
- Ingestion steps
- Embedding + chunking strategy
- Tools the agent can call (vector search, SQL, metadata filters)
- Evaluation checklist (retrieval quality + correctness)
Then execute the plan step-by-step.

========================
MVP GOALS (WHAT IT MUST DO)
========================
A) Load / ingest 3 datasets (CSV or parquet) into:
   - A SQL database (SQLite is fine for MVP)
   - A vector index (FAISS or Chroma local)

B) Provide a single CLI or minimal API that supports these user queries:
   1. "Find similar incidents to: <free text>"
      - Use embeddings + vector search over incident narratives
      - Return top-k matches with scores and short excerpts
   2. "Show defect trends by product and defect_type for last 30/90 days"
      - Use SQL query against maintenance logs + defect metadata
      - Return aggregated results and basic insights
   3. "Given this incident text, explain likely defect category and next action"
      - Agent uses:
        - vector search to retrieve similar incidents
        - SQL tool to pull related structured defect stats
        - reasoning step to synthesize an answer + citations to rows/records

C) The agent workflow must be explicit:
   - Step 1: Understand query intent (vector vs SQL vs both)
   - Step 2: Call the appropriate tool(s)
   - Step 3: Combine results into a final response
   - Step 4: Provide “evidence” references (record ids + snippets)

========================
DATA REQUIREMENTS
========================
You MUST support either:
- User-provided CSVs (paths in a config file), OR
- Generate realistic synthetic datasets if files are not present.

Define these canonical schemas (you can map any dataset columns into these):

1) incident_reports
   - incident_id (string)
   - date (date)
   - system (string)
   - narrative_text (text)          # used for embeddings
   - severity (string/int)
   - root_cause (text nullable)
   - corrective_action (text nullable)

2) manufacturing_defects
   - defect_id (string)
   - date (date)
   - product (string)
   - part (string nullable)
   - defect_type (string)
   - defect_description (text)
   - severity (string/int)
   - disposition (string nullable)

3) maintenance_logs
   - log_id (string)
   - date (date)
   - asset_id (string)
   - product (string nullable)
   - event_type (string)            # e.g., inspection, repair, failure
   - measurement_json (text/json)   # optional
   - notes (text)

Also create a unified view/table “events” or “link table” that can connect:
- incidents <-> defects <-> maintenance
even if via fuzzy keys (date/product/system/part).

========================
EMBEDDINGS + VECTOR SEARCH
========================
- Chunk narrative_text (target ~300-600 tokens, overlap 50-100 tokens)
- Store chunk text + metadata (incident_id, date, system, severity)
- Use a common embedding model (for MVP pick a local-friendly option)
- Implement: embed(), upsert(), query(top_k), return scores

========================
SQL TOOLING
========================
- Use SQLite for MVP (single file)
- Provide a safe SQL tool:
  - Only allow SELECT queries
  - Add guardrails against DROP/DELETE/UPDATE/INSERT
  - Return results with column names and row counts

Provide at least these SQL queries:
1) Defect counts by product + defect_type, last N days
2) Severity distribution by product
3) Maintenance events trend by event_type over time
4) Join example: incidents by system with defect_type frequency

========================
AGENT DESIGN (MUST HAVE)
========================
Implement an “Agent” module with:
- Intent router: vector-only, sql-only, or hybrid
- Tools:
  - VectorSearchTool(query_text, filters) -> top_k chunks + metadata
  - SQLQueryTool(sql) -> result rows
  - (Optional) MetadataFilterTool(product/system/date range)
- Reasoning step that synthesizes:
  - Similar incidents evidence (ids + excerpts)
  - SQL evidence (aggregations)
  - A final recommended action (simple, not medical/legal)
- Output format:
  - Answer
  - Evidence (vector hits + SQL rows)
  - Assumptions
  - Next steps

========================
DELIVERABLES
========================
Create a repo-like structure in the response with:
- README.md (how to run, examples)
- config.yaml (paths + params)
- requirements.txt
- src/
  - ingest.py
  - db.py
  - embeddings.py
  - vector_index.py
  - tools_sql.py
  - tools_vector.py
  - agent.py
  - cli.py (or api.py with FastAPI)

CLI Examples required:
- python -m src.cli ingest --config config.yaml
- python -m src.cli ask "Find similar incidents to: …"
- python -m src.cli ask "Show defect trends by product for last 90 days"
- python -m src.cli ask "Given this incident text, classify defect and recommend action: …"

========================
QUALITY BAR
========================
- Code must be clean, typed, and runnable
- Add logging
- Add basic tests for:
  - SQL guardrails
  - vector retrieval returns results
  - agent router chooses correct tool path
- Include sample outputs in README

========================
NOW START
========================
1) Produce the PLAN first (do not write code yet)
2) Then implement the code module-by-module
3) End with exact run commands and 3 demo queries showing output

Agentic AI MVP

# Claude Code Prompt — Agentic AI MVP (Workflows + GraphRAG w/ Citations)

You are **Claude Code** acting as a **principal full-stack engineer + AI agent systems architect**. Build a **production-ready MVP** that behaves like a real **AI agent** (plans + executes tools) and produces **verifiable outputs** via **GraphRAG with clickable citations and confidence scores**.

---

## 0) Non-Negotiables (Read First)

1. **Agent > Chatbot**
   - The system must: **plan → select tools → execute → verify → answer**.
   - No “single-pass chat completion” behavior.

2. **Trust + Traceability**
   - Every non-trivial claim must be backed by **exact citations** (clickable to the source chunk).
   - Show **reasoning path** as a **graph** (nodes/edges) the user can inspect.
   - Provide a **confidence score per claim**.

3. **No hidden chain-of-thought**
   - Do NOT output private internal reasoning.
   - Provide *transparent trace* via: steps taken, tools executed, citations, graph path, and verification checks.

4. **MVP-first, competitive**
   - Keep scope tight, but the result must feel like an autonomous research team with verification.

---

## 1) Output Format You Must Follow

Before writing any code, produce:

### A) Plan
- Architecture diagram (ASCII ok)
- Data flow
- Component list
- Milestones (M1–M4)
- Risks + mitigations
- Exact file tree you will generate

### B) Implementation
Then implement the repo exactly as planned.

### C) Validation
Provide:
- How to run locally (commands)
- Seed/demo data
- 5 realistic test prompts and expected behaviors
- Checklist proving the MVP meets acceptance criteria

---

## 2) MVP Feature Set (Core)

### Feature 1 — Agentic Workflows + Tool Execution
Implement an **Agent Orchestrator** that:
- Decomposes complex questions into sub-tasks (multi-hop).
- Chooses tools intentionally (not just “search docs”).
- Iterates: gather → compute → verify → revise.
- Supports **at least these tools**:
  1) **Doc retrieval** (vector search + graph expansion)
  2) **SQL execution** (for numeric/statistical questions)
  3) **Web fetch** (optional toggle; can be disabled)
  4) **Python compute** (safe sandbox execution for math/stats)

Tool selection must be explicit and logged (tool name, inputs, outputs, timing, errors).

### Feature 2 — GraphRAG with Clickable Citations + Confidence
Implement GraphRAG that:
- Builds/maintains a **knowledge graph** from ingested documents:
  - Nodes: entities, concepts, document chunks
  - Edges: mentions, relationships, similarity, citations
- At query time:
  - Retrieves relevant nodes/chunks
  - Expands via graph neighborhood (k-hop)
  - Produces an answer grounded in **specific chunk IDs**
- UI shows:
  - Graph visualization of the reasoning path (selected nodes/edges)
  - Clickable citations (open source chunk + highlight span)
  - Confidence per claim (0.0–1.0) with explanation of what influenced it (coverage, agreement, recency, tool verification)

---

## 3) Suggested Tech Stack (Use This Unless You Have a Better MVP Justification)

**Backend**
- Python 3.11+
- FastAPI
- PostgreSQL (with `pgvector`) for embeddings + chunk store
- A separate table for graph nodes/edges OR use Neo4j (only if you can justify MVP simplicity)
- SQLAlchemy + Alembic migrations
- Redis (optional) for job queue/caching

**Agent Framework**
- Keep it minimal: implement your own orchestrator state machine
- LLM provider: configurable via environment variables (do not hardcode keys)
- Provide an adapter layer: `LLMClient` interface

**Frontend**
- Next.js (App Router) + TypeScript
- Simple clean UI:
  - Chat panel
  - “Agent Run” timeline panel (steps/tools)
  - Graph panel (use a library like React Flow or Vis.js)
  - Citations panel (source chunk viewer)

**Observability**
- Structured logs (JSON)
- Store each agent run: steps, tool calls, citations used, graph path

---

## 4) Data Model Requirements

### Documents & Chunks
- Ingest PDFs/TXT/MD (MVP: TXT/MD required; PDF optional if time allows)
- Chunking with overlap
- Store:
  - `doc_id`, title, metadata
  - `chunk_id`, text, embedding, offset info
  - `source_uri` (local path or URL)
  - `hash` for dedupe

### Graph
- `graph_node`: `id`, `type`, `label`, `properties (json)`
- `graph_edge`: `id`, `from_node`, `to_node`, `type`, `weight`, `properties (json)`
- Keep it queryable and easy to visualize.

### Agent Runs
- `run_id`, user query, created_at
- `steps[]`: tool, inputs, outputs summary, errors
- `claims[]`: text, confidence, citations[], supporting_nodes[]

---

## 5) Agent Orchestrator: Behavior Rules

Implement a deterministic state machine:

1) **Intent detection**
   - classify query: (a) factual grounded (b) multi-hop research (c) numeric/statistical (d) requires SQL (e) needs computation

2) **Plan generation**
   - produce a short plan (user-visible) and a structured plan (system)
   - plan includes required tools and stopping criteria

3) **Execute**
   - run tool calls sequentially with retries and guardrails

4) **Verify**
   - validate claims:
     - must have citations OR tool-verified outputs (SQL results)
     - if conflicting sources, surface conflict and reduce confidence

5) **Synthesize answer**
   - produce:
     - final answer
     - claim-by-claim citations + confidence
     - graph path used
     - run summary (steps/tools)

### Guardrails
- Tool timeouts + max steps (e.g., 10 steps)
- SQL must be read-only; enforce query allowlist (SELECT only)
- If insufficient evidence: say so, show what was searched, and propose next steps

---

## 6) GraphRAG Query Algorithm (MVP)

At query time:
1) Vector search topK chunks (e.g., 8–15)
2) Map chunks → entities/concepts nodes (precomputed during ingestion)
3) Expand k-hop neighborhood (k=1..2)
4) Re-rank nodes/chunks by:
   - similarity score
   - edge weights
   - node centrality (optional)
   - recency (optional)
5) Construct “evidence set”
6) Generate answer constrained to evidence set
7) Output:
   - `selected_chunks[]`
   - `selected_nodes[]`
   - `selected_edges[]`
   - `claims[]` with citations/confidence

Citations must refer to `doc_id + chunk_id + character spans`.

---

## 7) API Requirements

### Backend endpoints (minimum)
- `POST /ingest` — upload docs
- `GET /docs` — list docs
- `GET /docs/{doc_id}/chunks/{chunk_id}` — fetch chunk text + metadata
- `POST /query` — run agent with GraphRAG
- `GET /runs/{run_id}` — fetch full run trace (steps, claims, graph path)
- `POST /sql/run` — (internal) execute read-only SQL safely

---

## 8) UI Requirements

Must include:
1) **Chat + Answer**
2) **Agent Timeline**
   - show each step: plan, tool calls, verification
3) **Graph Viewer**
   - show reasoning path nodes/edges; clicking a node shows related chunks
4) **Citations Drawer**
   - clickable citations open source chunk with highlight

---

## 9) Demo Scenario (You Must Ship With This)

Provide a `demo/` folder with:
- A small set of markdown docs (5–10) containing entities and relationships
- A sample Postgres schema + seed data for SQL tool:
  - e.g., `sales`, `orders`, `customers` with enough rows for aggregate queries

Include “one-command” startup:
- `docker compose up` runs Postgres + backend + frontend
- Include `.env.example`

---

## 10) Acceptance Criteria (Must Pass)

1) **Agentic**
   - For a multi-hop question, it produces a plan and executes >1 tool call.
2) **SQL correctness**
   - For a statistical question, it generates and executes SQL and returns the numeric answer from DB.
3) **Traceability**
   - Every claim has citations OR tool-verified evidence, and confidence shown.
4) **GraphRAG visualization**
   - UI displays a graph path for each run.
5) **Reproducible**
   - Fresh clone → one command → demo works.

---

## 11) Security & Compliance (MVP Level)

- Secrets only via env vars
- SQL tool: SELECT-only enforcement
- Request/response size limits
- Basic auth or API key for `/ingest` (simple is fine)
- Sanitize logs (no secrets)

---

## 12) Repo Structure (Generate This)

- `backend/`
  - `app/`
    - `main.py`
    - `api/` (routes)
    - `agent/` (planner, orchestrator, verifier)
    - `rag/` (chunking, embeddings, retrieval)
    - `graph/` (graph build, expansion, scoring)
    - `tools/` (sql_tool, python_tool, doc_tool, optional web_tool)
    - `db/` (models, session, migrations)
    - `schemas/` (pydantic)
    - `observability/` (logging, run storage)
  - `Dockerfile`
- `frontend/`
  - Next.js app (chat, timeline, graph, citations)
  - `Dockerfile`
- `demo/`
  - `docs/`
  - `seed_sql/`
- `docker-compose.yml`
- `.env.example`
- `README.md`

---

## 13) Notes on LLM Integration

- Use an interface like:
  - `LLMClient.generate(prompt, json_schema=None)`
- Support structured outputs (JSON) for:
  - plan
  - tool selection
  - SQL generation
  - claim extraction

If structured output fails, retry with stricter instructions.

---

## 14) Start Now

Follow the required output format:
1) Plan
2) Implementation
3) Validation

Do not skip any acceptance criteria.

Data for MVP project
Manufacturing Defects
https://www.kaggle.com/datasets/fahmidachowdhury/manufacturing-defects?utm_source=chatgpt.com

import kagglehub

# Download latest version
path = kagglehub.dataset_download("fahmidachowdhury/manufacturing-defects")

print("Path to dataset files:", path)



Aircraft Historical Maintenance Dataset(2012-2017)
https://www.kaggle.com/datasets/merishnasuwal/aircraft-historical-maintenance-dataset?utm_source=chatgpt.com

import kagglehub

# Download latest version
path = kagglehub.dataset_download("merishnasuwal/aircraft-historical-maintenance-dataset")

print("Path to dataset files:", path)



Predicting Manufacturing Defects Dataset
https://www.kaggle.com/datasets/rabieelkharoua/predicting-manufacturing-defects-dataset?utm_source=chatgpt.com

import kagglehub

# Download latest version
path = kagglehub.dataset_download("rabieelkharoua/predicting-manufacturing-defects-dataset")

print("Path to dataset files:", path)