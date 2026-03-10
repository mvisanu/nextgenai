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

---

## Phase 4 Supplement: Auth Implementation Prompt

> Source: auth_prompt.md (2026-03-08)

Implement user authentication in this existing application using Supabase Auth with email/password.

## Requirements
- Sign up flow (email + password, with email confirmation if enabled in Supabase project)
- Sign in flow
- Password reset flow (send reset email → reset form)
- Protect authenticated routes/screens — redirect unauthenticated users to sign in
- Persist session across page refreshes
- Sign out
## Instructions
1. First read the codebase to understand the existing stack, folder structure, routing setup, and any UI component library in use
2. Check if `@supabase/supabase-js` is already installed — if not, install it
3. Check for an existing Supabase client — reuse it if present, otherwise create `lib/supabase.ts` (or equivalent)
4. Follow the existing code style, naming conventions, and folder structure exactly
5. Use the existing UI component library (if any) for forms and buttons — do not introduce new UI dependencies
6. Store Supabase URL and anon key in environment variables — do not hardcode them
7. Handle and display errors clearly (invalid credentials, unconfirmed email, rate limits, etc.)
8. Do not modify any existing functionality unrelated to auth

## Deliverables
- Auth pages/screens: Sign Up, Sign In, Forgot Password, Reset Password
- A Supabase auth client (reused or new)
- Session/auth state management (context, store, or hook — match what the app already uses)
- Route protection for authenticated areas
- Environment variable documentation (add to .env.example)

---

## Phase 4 Supplement: Login Fix & Auth Hardening Prompt

> Source: loginfix.md (2026-03-10)

You are a senior full-stack engineer debugging an existing application that already has Supabase Auth implemented, but the login/auth flow still has issues on the live site.

Your main objective is to fix, stabilize, and fully test the existing Supabase authentication flow, especially production issues affecting Render and Vercel deployments. Treat this as a production bug-fix and hardening task, not a greenfield auth implementation.

Before making changes:
- Inspect the codebase first
- Identify likely root causes
- Create a short step-by-step plan
- Then implement fixes carefully

Focus especially on:
- login failing or behaving differently on the live site
- session not persisting correctly in production
- redirect/callback issues
- environment variable issues
- Render/Vercel deployment mismatches
- SSR/client auth inconsistencies
- protected route issues
- password reset flow issues in production

Implement user authentication in this existing application using Supabase Auth with email/password.

## Requirements
- Sign up flow (email + password, with email confirmation if enabled in Supabase project)
- Sign in flow
- Password reset flow (send reset email → reset form)
- Protect authenticated routes/screens — redirect unauthenticated users to sign in
- Persist session across page refreshes
- Sign out

## Instructions
1. First read the codebase to understand the existing stack, folder structure, routing setup, and any UI component library in use
2. Audit the current authentication implementation before changing it
3. Check if `@supabase/supabase-js` is already installed — if not, install it
4. Check for an existing Supabase client — reuse it if present, otherwise create `lib/supabase.ts` (or equivalent)
5. Follow the existing code style, naming conventions, and folder structure exactly
6. Use the existing UI component library (if any) for forms and buttons — do not introduce new UI dependencies
7. Store Supabase URL and anon key in environment variables — do not hardcode them
8. Verify all required environment variables for local, Render, and Vercel environments
9. Check for incorrect redirect URLs, callback URLs, domain mismatches, cookie/session problems, and client/server auth issues
10. Handle and display errors clearly (invalid credentials, unconfirmed email, rate limits, expired reset links, etc.)
11. Do not modify any existing functionality unrelated to auth
12. Prefer fixing the root cause over applying temporary workarounds

## Deliverables
- Auth pages/screens: Sign Up, Sign In, Forgot Password, Reset Password
- A Supabase auth client (reused or new)
- Session/auth state management (context, store, or hook — match what the app already uses)
- Route protection for authenticated areas
- Environment variable documentation (add to `.env.example`)
- Fixes for production/live-site auth issues affecting Render and Vercel
- A short summary of:
  - root causes found
  - files changed
  - tests performed
  - any remaining manual deployment settings to verify

## Testing Requirements
Test and verify all of the following:
- Sign up
- Sign in
- Invalid login handling
- Sign out
- Session persistence after refresh
- Access to protected routes when logged out
- Access to protected routes when logged in
- Password reset request
- Password reset completion
- Local development behavior
- Production build behavior
- Live-site behavior on deployed environment

## Output Format
Respond in this order:
1. Plan
2. Findings / root causes
3. Changes made
4. Tests performed
5. Deployment/env checks for Render and Vercel
6. Final status

---

## Master Implementation Prompt (Phase 2 → Phase 4)

> Source: upgrade.md (2026-03-07)

# NextAgentAI — Master Claude Code Prompt
# Agentic RAG Platform for Aerospace NCR Intelligence

> **How to use this file:**
> This is your single source of truth for all Claude Code sessions.
> The project has FOUR phases:
> - **Phase 1 (Foundation)** — Build the core agentic MVP from scratch (if not yet done).
> - **Phase 2 (Upgrades)** — Layer in four production-grade RAG improvements.
> - **Phase 3 (Advanced)** — Six 2026-standard enhancements for enterprise production quality.
> - **Phase 4 (UX & Intelligence)** — Ten epics closing the gap between impressive demo and daily-use tool.
>
> If the MVP is already running, skip to Phase 2. If Phase 2 is complete, go to Phase 3. If Phase 3 is complete, go to Phase 4.
> Reference this file at the start of every session: `@PROMPT.md`

---

## Non-Negotiables (Read Every Session)

1. **Agent > Chatbot.** The system must: plan → select tools → execute → verify → answer.
   No single-pass chat completions.
2. **Trust + Traceability.** Every non-trivial claim must be backed by exact citations
   (clickable to the source chunk), a reasoning graph path, and a confidence score.
3. **Never break existing functionality.** Wrap new logic in feature flags or new modules.
4. **Prefer incremental, reviewable changes.** Each priority is a self-contained PR.
5. **Tests alongside every feature.** `pytest` for Python, `jest`/`vitest` for Next.js.
6. **Surface errors clearly.** Engineers must never see a hallucinated answer presented as
   fact. When in doubt, return: "I don't have enough information."
7. **Secrets only via env vars.** Never hardcode keys, connection strings, or thresholds.
8. **Async throughout.** All Python retrieval and DB calls must be `async/await` compatible.

---

## Project Context

**NextAgentAI** is an enterprise AI agent for aerospace engineers to troubleshoot
manufacturing defects via Non-Conformance Reports (NCRs). Engineers ask natural-language
questions; the agent plans a multi-step approach, calls the right tools, synthesizes
evidence, and returns a cited, traceable answer.

**Stack:** Next.js (App Router) + TypeScript frontend | Python 3.11+ / FastAPI backend |
PostgreSQL + pgvector | SQLite (legacy/MVP datasets) | FAISS or Chroma (vector index)

**Real Datasets (download via kagglehub):**
- Manufacturing Defects: `kagglehub.dataset_download("fahmidachowdhury/manufacturing-defects")`
- Aircraft Maintenance (2012-2017): `kagglehub.dataset_download("merishnasuwal/aircraft-historical-maintenance-dataset")`
- Predicting Manufacturing Defects: `kagglehub.dataset_download("rabieelkharoua/predicting-manufacturing-defects-dataset")`

If Kaggle files are unavailable, generate realistic synthetic data matching the canonical
schemas below. The system must work either way.

---

## Canonical Data Schemas

These are the normalized schemas everything maps into. Ingest scripts must translate raw
Kaggle CSVs into these shapes.

```sql
-- 1. Incident / NCR Reports  (narrative -> embeddings)
incident_reports (
  incident_id        TEXT PRIMARY KEY,
  date               DATE,
  system             TEXT,          -- e.g., "Landing Gear", "Hydraulics"
  narrative_text     TEXT,          -- used for chunking + embeddings
  severity           TEXT,          -- "Critical" | "Major" | "Minor"
  root_cause         TEXT,
  corrective_action  TEXT
)

-- 2. Manufacturing Defects  (structured metadata -> SQL)
manufacturing_defects (
  defect_id          TEXT PRIMARY KEY,
  date               DATE,
  product            TEXT,
  part               TEXT,
  defect_type        TEXT,
  defect_description TEXT,
  severity           TEXT,
  disposition        TEXT
)

-- 3. Maintenance Logs  (time-series events -> SQL trend queries)
maintenance_logs (
  log_id             TEXT PRIMARY KEY,
  date               DATE,
  asset_id           TEXT,
  product            TEXT,
  event_type         TEXT,          -- "inspection" | "repair" | "failure"
  measurement_json   JSONB,
  notes              TEXT
)

-- 4. Unified events link table  (fuzzy join across all three)
events_unified (
  event_id           TEXT PRIMARY KEY,
  source_table       TEXT,          -- "incident_reports" | "manufacturing_defects" | "maintenance_logs"
  source_id          TEXT,
  date               DATE,
  product            TEXT,
  system             TEXT,
  severity           TEXT,
  summary_text       TEXT
)
```

---

## Repo Structure

Generate and maintain this exact file tree:

```
nextaiapp/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── api/
│   │   │   ├── ingest.py
│   │   │   ├── query.py
│   │   │   ├── docs.py
│   │   │   └── runs.py
│   │   ├── agent/
│   │   │   ├── orchestrator.py       # state machine: plan->execute->verify->answer
│   │   │   ├── intent_classifier.py  # SEMANTIC | AGGREGATION | HYBRID | MULTI_HOP
│   │   │   ├── planner.py
│   │   │   └── verifier.py
│   │   ├── rag/
│   │   │   ├── chunking_router.py    # routes doc type to chunking strategy
│   │   │   ├── classifier.py         # doc type classifier
│   │   │   ├── embeddings.py
│   │   │   ├── vector_index.py       # FAISS or Chroma wrapper
│   │   │   ├── retriever.py          # standard vector retrieval
│   │   │   ├── hybrid_retriever.py   # parallel vector + BM25 + reciprocal rank fusion
│   │   │   ├── reranker.py           # cross-encoder re-ranking (top-100 -> top-5)
│   │   │   ├── evaluator.py          # CRAG relevance scorer
│   │   │   ├── corrective_rag.py     # fallback + query rewrite logic
│   │   │   ├── graph_retriever.py    # graph-augmented retrieval
│   │   │   ├── multimodal.py         # image embedding + multimodal ingest
│   │   │   └── validator.py          # chunk quality validator
│   │   ├── graph/
│   │   │   ├── builder.py            # entity extraction + graph population
│   │   │   ├── expander.py           # k-hop neighborhood expansion
│   │   │   └── scorer.py             # node re-ranking
│   │   ├── tools/
│   │   │   ├── sql_tool.py           # NL-to-SQL + safe execution
│   │   │   ├── vector_tool.py        # vector search tool (agent-callable)
│   │   │   ├── python_tool.py        # safe sandbox for math/stats
│   │   │   └── web_tool.py           # optional; disabled by default
│   │   ├── ingestion/
│   │   │   ├── ingest.py             # orchestrates full ingest pipeline
│   │   │   ├── kaggle_loader.py      # downloads + maps Kaggle datasets
│   │   │   └── reingest.py           # CLI: re-chunk a single doc
│   │   ├── db/
│   │   │   ├── models.py
│   │   │   ├── session.py
│   │   │   └── migrations/
│   │   ├── schemas/                  # Pydantic models
│   │   ├── observability/
│   │   │   ├── logger.py             # structured JSON logs, no PII
│   │   │   ├── run_store.py          # persist agent run traces
│   │   │   ├── telemetry.py          # OpenTelemetry spans + metrics
│   │   │   └── drift_monitor.py      # embedding drift + chunk quality alerts
│   │   └── utils/
│   │       └── llm_client.py         # LLMClient interface + retry/backoff
│   ├── tests/
│   │   ├── test_sql_guardrails.py
│   │   ├── test_vector_retrieval.py
│   │   ├── test_agent_router.py
│   │   ├── test_crag_evaluator.py
│   │   ├── test_chunking.py
│   │   ├── test_hybrid_retrieval.py
│   │   ├── test_reranker.py
│   │   └── test_self_rag.py
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── app/
│   │   └── (Next.js App Router pages)
│   ├── components/
│   │   ├── ChatPanel.tsx
│   │   ├── AgentTimeline.tsx         # step-by-step tool execution trace
│   │   ├── ReasoningGraph.tsx        # react-flow graph visualization
│   │   ├── CitationCard.tsx          # clickable citation chips + drawer
│   │   └── ConfidenceBadge.tsx
│   └── Dockerfile
├── demo/
│   ├── docs/                         # 8-10 markdown docs with entities
│   └── seed_sql/                     # seed data for SQL demo queries
├── config.yaml
├── docker-compose.yml
├── .env.example
└── README.md
```

---

# PHASE 1 — Core MVP Build

> **Skip this phase if the MVP is already running.** Use it as the reference spec if
> rebuilding from scratch or onboarding a new engineer.

## P1 Step 1 — Produce the Plan First

Before writing any code, output:
- ASCII architecture diagram
- Data flow (ingest -> chunk -> embed -> store -> query -> agent -> answer)
- Milestones M1-M4 with acceptance criteria per milestone
- Risks + mitigations

## P1 Step 2 — Ingestion Pipeline

1. **Kaggle loader** (`backend/app/ingestion/kaggle_loader.py`)
   - Download each dataset via `kagglehub`; fall back to synthetic data generation if
     `KAGGLE_OFFLINE=true`.
   - Normalize all three CSVs into the canonical schemas above.
   - Populate `events_unified` as a materialized join on `date + product + system`.

2. **Chunking** (target 300-600 tokens, overlap 50-100 tokens)
   - `narrative_text` from `incident_reports` -> vector index.
   - `defect_description` from `manufacturing_defects` -> vector index.
   - `notes` from `maintenance_logs` -> vector index.
   - Structured numeric columns -> SQL only; do not embed raw numbers.

3. **Embeddings** (`backend/app/rag/embeddings.py`)
   - Use `sentence-transformers/all-MiniLM-L6-v2` as the default (local-friendly).
   - Interface: `embed(text: str) -> List[float]`
   - Store chunks with metadata: `{source_table, source_id, date, system, severity,
     chunk_index, ingestion_timestamp}`.

4. **CLI**
   ```bash
   python -m src.cli ingest --config config.yaml
   python -m backend.ingestion.reingest --doc-id <id>
   ```

## P1 Step 3 — SQL Tooling

Pre-wire these four queries as named templates in `tools/sql_tool.py`:

```sql
-- Q1: Defect counts by product + defect_type, last N days
SELECT product, defect_type, COUNT(*) AS count
FROM manufacturing_defects
WHERE date >= CURRENT_DATE - INTERVAL ':days days'
GROUP BY product, defect_type ORDER BY count DESC;

-- Q2: Severity distribution by product
SELECT product, severity, COUNT(*) AS count
FROM manufacturing_defects GROUP BY product, severity;

-- Q3: Maintenance event trend by event_type over time
SELECT DATE_TRUNC('month', date) AS month, event_type, COUNT(*) AS count
FROM maintenance_logs GROUP BY month, event_type ORDER BY month;

-- Q4: Incidents by system with defect_type frequency (join)
SELECT ir.system, md.defect_type, COUNT(*) AS co_occurrences
FROM incident_reports ir
JOIN events_unified eu_i ON eu_i.source_id = ir.incident_id
JOIN events_unified eu_d ON eu_d.date = eu_i.date AND eu_d.product = eu_i.product
JOIN manufacturing_defects md ON md.defect_id = eu_d.source_id
GROUP BY ir.system, md.defect_type ORDER BY co_occurrences DESC;
```

Guardrail: block any query containing `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`,
`TRUNCATE`, `GRANT`, `REVOKE`. Enforce on normalized uppercase string before execution.

## P1 Step 4 — Agent Orchestrator (State Machine)

```
States: IDLE -> INTENT -> PLAN -> EXECUTE -> VERIFY -> SYNTHESIZE -> DONE
```

Intent types:
- `SEMANTIC_SEARCH`  -> VectorSearchTool only
- `AGGREGATION`      -> SQLQueryTool only
- `HYBRID`           -> both tools, merge results
- `MULTI_HOP`        -> GraphRAG retrieval + optional SQL

Each tool call logs: `{tool_name, inputs, outputs_summary, duration_ms, error}`.
Max steps: 10. Timeout per tool: 30s.

## P1 Step 5 — CLI Demo Queries

```bash
python -m src.cli ask "Find similar incidents to: hydraulic fluid leak in landing gear"
python -m src.cli ask "Show defect trends by product for last 90 days"
python -m src.cli ask "Given this incident text, classify defect and recommend action: ..."
```

---

# PHASE 2 — Production Upgrades

Work through these four priorities **in order**. Each one builds on the previous.

---

## Priority 1 — CRAG + Citations / Trust Layer

**Why first:** Stops hallucinations at the source before any other improvement amplifies
the problem. Every answer must be grounded before we make the graph richer.

### 1a — Retrieval Evaluator (`backend/app/rag/evaluator.py`)

- After standard vector retrieval, score each retrieved chunk for relevance to the query.
- Use a lightweight cross-encoder (`cross-encoder/ms-marco-MiniLM-L-6-v2`) or a fast
  LLM call with a structured rubric returning a float 0.0-1.0.
- Discard chunks scoring below `CRAG_THRESHOLD` (env var, default `0.4`).
- Return scored chunks sorted descending.

### 1b — Corrective Fallback Logic (`backend/app/rag/corrective_rag.py`)

- If fewer than `CRAG_MIN_CHUNKS` (default `2`) chunks pass the threshold:
  1. Rewrite the query with the LLM (expand acronyms, rephrase technically).
  2. Re-run vector retrieval with the rewritten query.
  3. If still insufficient: return a structured `NO_CONTEXT` sentinel — do NOT let
     the LLM free-generate without grounding.
- Log every corrective trigger: `{original_query, rewritten_query, trigger_reason,
  timestamp}` to DB for quality monitoring.

### 1c — Citation Metadata Pipeline

Every chunk stored in the vector DB must carry:
```json
{
  "source_doc_id": "...",
  "source_table": "incident_reports | manufacturing_defects | maintenance_logs",
  "source_id": "...",
  "ncr_id": "...",
  "page_number": 0,
  "section_heading": "...",
  "chunk_index": 0,
  "ingestion_timestamp": "ISO8601"
}
```
The LLM synthesis prompt must instruct: "Cite [source_doc_id:chunk_id] inline after
every factual claim. Do not make claims without a citation."

Parse citations from the LLM response and resolve them to full document references
before returning to the frontend.

### 1d — Frontend Citation UI

**`frontend/components/CitationCard.tsx`**
- Render each citation as a clickable chip beneath the answer text.
- Clicking opens a side-drawer showing the exact source chunk (highlighted span) and a
  link to the original document.

**`frontend/components/ConfidenceBadge.tsx`**
- Display `High / Medium / Low` badge: High >= 0.75, Medium >= 0.5, Low < 0.5.
- Tooltip explains what drove the score (coverage, agreement, recency).

### Acceptance Criteria — Priority 1
- [ ] Zero answers returned without at least one grounded citation.
- [ ] `NO_CONTEXT` renders a clear, graceful UI message (not an error stack).
- [ ] `CRAG_THRESHOLD` and `CRAG_MIN_CHUNKS` are configurable via environment variables.
- [ ] Corrective trigger events are queryable in the admin panel.

---

## Priority 2 — Smarter Chunking Pipeline

**Why second:** Better chunks amplify everything downstream — better citations, better
graph node quality, better SQL routing.

### 2a — Document-Type Classifier (`backend/app/rag/classifier.py`)

Classify each incoming document into one of:
`NCR_PDF | SUPPLIER_LOG | TECHNICAL_MANUAL | JSON_BLOB | SQL_TABLE_EXPORT`

Detection logic (in priority order):
1. Explicit `doc_type` field in ingest payload (user override).
2. MIME type + file extension.
3. Structural heuristic: table density, JSON key presence, section header patterns.

### 2b — Strategy Router (`backend/app/rag/chunking_router.py`)

| Doc Type | Strategy | Details |
|---|---|---|
| `NCR_PDF` | Structure-aware | Split on section headings. Preserve tables as single atomic chunks tagged `type: table`. |
| `TECHNICAL_MANUAL` | Hierarchical | Parent = full section, children = paragraphs. Store parent-child in metadata. |
| `SUPPLIER_LOG` / `JSON_BLOB` | Semantic | Sentence-embedding breakpoints. Target 200-400 token chunks. |
| `SQL_TABLE_EXPORT` | Skip vector | Route directly to SQL ingestion only. |

### 2c — Chunk Quality Validator (`backend/app/rag/validator.py`)

Flag `quality: low` if any of:
- Length < 50 tokens.
- Length > 800 tokens.
- > 60% numeric/special characters.

Low-quality chunks are stored but retrieval scoring penalizes them by `CHUNK_QUALITY_PENALTY`
(env var, default `0.5x`).

### 2d — Re-ingestion CLI

```bash
python -m backend.ingestion.reingest --doc-id <id>
# Re-chunks and re-embeds a single document. Preserves unchanged chunk IDs (hash-based dedupe).
```

### Acceptance Criteria — Priority 2
- [ ] NCR PDF tables stored as single atomic chunks; no mid-row splits.
- [ ] Chunk `type`, `quality`, and `doc_type` metadata visible in admin debug panel.
- [ ] Re-ingestion CLI runs end-to-end and logs chunk counts before/after.
- [ ] `SQL_TABLE_EXPORT` docs never appear in vector index.

---

## Priority 3 — SQL Tool Execution for Aggregation

**Why third:** Chunking router (Priority 2) already cleanly separates structured data.
SQL can now coexist without polluting the vector index.

### 3a — Query Intent Classifier (`backend/app/agent/intent_classifier.py`)

| Intent | Trigger Patterns |
|---|---|
| `AGGREGATION` | "how many", "total", "count", "average", "last quarter", "percentage", "trend over time", "rate of" |
| `SEMANTIC_SEARCH` | "find similar", "what happened", "describe", "explain" |
| `HYBRID` | "which suppliers had the most defects" (aggregation + entity) |
| `MULTI_HOP` | "root cause of recurring", "history of", "related defects across" |

`HYBRID` queries require both SQL and RAG results — handle each independently then merge.

### 3b — NL-to-SQL Generator (`backend/app/tools/sql_tool.py`)

For `AGGREGATION` and `HYBRID` queries:
1. Pass `user_question + db_schema_summary` to LLM with strict prompt:
   "Return only a valid SQL SELECT statement targeting the aerospace defects database.
   No explanation, no markdown, no preamble."
2. Validate generated SQL (block forbidden keywords).
3. Execute against PostgreSQL via read-only connection `DATABASE_RO_URL`.
4. Return `{columns, rows, row_count, generated_sql, execution_ms}`.

If SQL fails: fall back to vector search, note limitation to user.

### 3c — Result Formatter

- Numeric scalar -> natural language sentence + prominent value display.
- Tabular result (<= 20 rows) -> clean HTML table.
- Large result (> 20 rows) -> LLM summary + "Show full table" toggle.
- Always render generated SQL in a collapsible `<details>` block for engineer audit.

### 3d — Audit Logging

Log every execution: `{user_query, generated_sql, row_count, execution_ms,
fallback_triggered, timestamp}`. Accessible at `GET /admin/sql-audit`.

### Acceptance Criteria — Priority 3
- [ ] "How many critical NCRs were filed last quarter?" returns correct numeric answer
      with SQL displayed.
- [ ] No `INSERT` / `UPDATE` / `DELETE` / `DROP` ever reaches the database.
- [ ] `HYBRID` queries return a combined answer citing both SQL rows and vector chunks.
- [ ] SQL audit log is queryable by admin.

---

## Priority 4 — GraphRAG / Multi-Hop Reasoning

**Why last:** Builds on all prior work. Good chunks become good graph nodes. SQL data
becomes node attributes. CRAG logic validates graph-traversal answers.

### 4a — Knowledge Graph Schema (PostgreSQL adjacency tables)

```sql
graph_node (
  node_id      TEXT PRIMARY KEY,
  node_type    TEXT,     -- NCR | Supplier | Component | Defect | Engineer | Document
  label        TEXT,
  properties   JSONB,
  chunk_id     TEXT      -- FK back to source vector chunk
)

graph_edge (
  edge_id      TEXT PRIMARY KEY,
  from_node    TEXT REFERENCES graph_node(node_id),
  to_node      TEXT REFERENCES graph_node(node_id),
  edge_type    TEXT,     -- SUPPLIES | HAS_DEFECT | APPEARS_IN | FILED_BY | REFERENCES | SIMILAR_TO
  weight       FLOAT,
  properties   JSONB
)
```

Domain relationships:
```
(Supplier)  -[:SUPPLIES]->    (Component)
(Component) -[:HAS_DEFECT]->  (Defect)
(Defect)    -[:APPEARS_IN]->  (NCR)
(NCR)       -[:FILED_BY]->    (Engineer)
(NCR)       -[:REFERENCES]->  (Document)
(Defect)    -[:SIMILAR_TO]->  (Defect)   # cosine similarity > 0.85
```

### 4b — Graph Population Pipeline (`backend/app/graph/builder.py`)

Run automatically during ingestion (not as a separate manual step):
1. Extract entities from each chunk via LLM-based NER:
   "Extract all named entities: suppliers, component IDs, defect codes, engineer names,
   product names. Return JSON: [{text, type, span_start, span_end}]."
2. Upsert entity nodes; create edges based on co-occurrence within the same NCR/document.
3. Populate `SIMILAR_TO` edges via nightly batch cosine similarity job
   (`backend/app/graph/similarity_job.py`).

### 4c — Graph-Augmented Retrieval (`backend/app/rag/graph_retriever.py`)

For `MULTI_HOP` intent:
1. Vector search -> top-k chunks -> map to graph nodes via `chunk_id` FK.
2. Expand `GRAPH_HOP_DEPTH`-hop neighborhood (env var, default `2`).
3. Re-rank: similarity_score x edge_weight x node_centrality x recency_decay.
4. Merge graph-retrieved node summaries with original vector chunks as LLM context.
5. Return `{selected_chunks, selected_nodes, selected_edges, traversal_path}`.

### 4d — Reasoning Graph UI (`frontend/components/ReasoningGraph.tsx`)

Use `react-flow`:
- Render nodes/edges used in the traversal for this specific query.
- Color-code by node type (NCR = red, Supplier = blue, Component = gray, Defect = orange).
- Clicking a node opens CitationCard drawer with the underlying source chunk.
- Highlight the specific traversal path that produced the answer.

### GraphRAG Query Algorithm

```
1. Vector search -> topK chunks (8-15)
2. Map chunks -> graph nodes (via chunk_id FK)
3. Expand k-hop neighborhood (k = GRAPH_HOP_DEPTH)
4. Re-rank: similarity_score x edge_weight x centrality x recency_decay
5. Construct evidence set: {selected_chunks[], selected_nodes[], selected_edges[]}
6. Generate answer constrained strictly to evidence set
7. Output claims[] each with: citation (doc_id + chunk_id + char spans) + confidence (0.0-1.0)
```

### Acceptance Criteria — Priority 4
- [ ] "Which supplier is responsible for recurring valve defects in the landing gear?"
      traverses Supplier -> Component -> Defect -> NCR and returns a cited answer.
- [ ] Reasoning graph renders with correct node labels and color coding.
- [ ] Graph population runs automatically during ingestion (no separate manual step).
- [ ] `GRAPH_HOP_DEPTH` is configurable via environment variable.

---

## API Reference (All Endpoints)

```
POST /ingest                              # upload docs or trigger Kaggle load
GET  /docs                                # list all ingested documents
GET  /docs/{doc_id}/chunks/{chunk_id}     # fetch chunk text + metadata + graph nodes
POST /query                               # run full agent query (returns answer + trace)
GET  /runs/{run_id}                       # full agent run trace: steps, claims, graph path
POST /sql/run                             # (internal) safe read-only SQL execution
GET  /admin/chunks                        # debug: chunk quality + metadata browser
GET  /admin/crag-log                      # CRAG trigger history
GET  /admin/sql-audit                     # SQL execution audit log
GET  /admin/telemetry                     # pipeline latency, cache hit rates, confidence distribution
GET  /admin/drift                         # embedding drift alerts + chunk quality trends
POST /ingest/image                        # upload defect image for multimodal ingest
```

---

## Agent Run Output Format

Every `/query` response must include:

```json
{
  "answer": "...",
  "claims": [
    {
      "text": "...",
      "confidence": 0.87,
      "citations": [
        {
          "doc_id": "...",
          "chunk_id": "...",
          "span_start": 0,
          "span_end": 120,
          "excerpt": "..."
        }
      ],
      "supporting_nodes": ["node_id_1", "node_id_2"]
    }
  ],
  "graph_path": {
    "nodes": [...],
    "edges": [...],
    "traversal_order": [...]
  },
  "agent_trace": {
    "intent": "MULTI_HOP",
    "steps": [
      {
        "step": 1,
        "tool": "VectorSearchTool",
        "inputs": {},
        "outputs_summary": "...",
        "duration_ms": 120
      },
      {
        "step": 2,
        "tool": "SQLQueryTool",
        "inputs": {},
        "outputs_summary": "...",
        "duration_ms": 45
      }
    ],
    "assumptions": ["..."],
    "next_steps": ["..."]
  }
}
```

---

## Demo Scenario (Ship With This)

`demo/docs/` — 8 markdown files with aerospace entities, NCR narratives, supplier names,
component IDs, and defect descriptions.

`demo/seed_sql/` — seed data: minimum 500 rows manufacturing_defects, 300 maintenance_logs,
200 incidents. Enough for aggregate queries to return meaningful results.

One-command startup:
```bash
docker compose up
```

Include `.env.example` with every required variable and a comment explaining each one.

### 5 Required Demo Queries

| # | Query | Expected Behavior |
|---|---|---|
| 1 | `"Find similar incidents to: hydraulic fluid leak in landing gear strut"` | SEMANTIC path, top-5 vector hits with scores + excerpts |
| 2 | `"Show defect trends by product for last 90 days"` | AGGREGATION path, SQL executed, table + NL summary |
| 3 | `"Which supplier is linked to the most critical defects on the main rotor assembly?"` | MULTI_HOP path, graph traversal, cited answer with reasoning graph |
| 4 | `"Given this incident: [NCR text], classify the defect and recommend corrective action"` | HYBRID path, vector + SQL, answer with citations + confidence badges |
| 5 | `"How many inspection events occurred on asset A-221 in the last 6 months and were any linked to defects?"` | HYBRID path, SQL for count + vector for defect linkage |

---

---

# PHASE 3 — Advanced 2026 Enhancements

Work through these six priorities after Phase 2 is complete and all checkboxes are green.
Each one is independent of the others within Phase 3, but all depend on Phase 2 being solid.

---

## Priority 5 — Hybrid Search for Exact Part Numbers

**Why:** Pure vector search fails silently on exact aerospace identifiers — part numbers
like `P/N 737-80-4421`, contract codes, and policy identifiers. An engineer querying
"NCRs referencing part 737-80-4421" will get semantically similar but factually wrong
results. Hybrid search eliminates this class of false negatives.

### 5a — BM25 Lexical Index (`backend/app/rag/hybrid_retriever.py`)

- Stand up a BM25 index alongside the existing pgvector index.
- Options (in preference order for MVP): `rank_bm25` Python library over PostgreSQL
  full-text search (`tsvector` / `tsquery`), or Elasticsearch if already in the stack.
- Index the same chunks that are stored in pgvector (same `chunk_id` as the shared key).
- Expose: `bm25_search(query: str, top_k: int) -> List[ScoredChunk]`

### 5b — Parallel Retrieval + Reciprocal Rank Fusion

At query time, run both retrievers in parallel:
```python
vector_results = await vector_search(query, top_k=50)
keyword_results = await bm25_search(query, top_k=50)
merged = reciprocal_rank_fusion(vector_results, keyword_results, k=60)
# RRF score = sum(1 / (k + rank_i)) for each result across both lists
final = merged[:top_k]  # top_k configurable, default 15
```

Default fusion weights: 70% vector / 30% BM25. Configurable via `HYBRID_VECTOR_WEIGHT`
and `HYBRID_BM25_WEIGHT` env vars. Both must sum to 1.0.

### 5c — Intent-Aware Routing

Adjust weights dynamically based on query intent:
- Query contains part numbers, contract codes, or policy IDs (regex pattern match) ->
  increase BM25 weight to `0.6`.
- Pure semantic query ("explain the root cause of...") -> keep vector weight at `0.7`.
- Log the weights used per query for observability.

### Acceptance Criteria — Priority 5
- [ ] Query for an exact part number (`P/N 737-80-4421`) returns the correct NCR even
      when the semantic meaning of the surrounding text is unrelated.
- [ ] `HYBRID_VECTOR_WEIGHT` and `HYBRID_BM25_WEIGHT` are configurable via env vars.
- [ ] Retrieval latency does not increase by more than 2x vs. vector-only (parallel calls).
- [ ] Fusion weights used per query are logged in the agent trace.

---

## Priority 6 — Cross-Encoder Re-Ranking Layer

**Why:** In aerospace, sending the wrong document to the LLM is a safety risk. A single
retrieval pass cannot distinguish "semantically similar but factually irrelevant" from
"directly relevant." A cross-encoder reads the query and each candidate together, giving
a much more accurate relevance signal.

### 6a — Two-Stage Retrieval Pipeline (`backend/app/rag/reranker.py`)

Stage 1 — Fast retrieval (existing):
- Hybrid search (Priority 5) returns top 100 candidates.
- This stage must complete in < 200ms.

Stage 2 — Cross-encoder re-ranking:
- Load `cross-encoder/ms-marco-MiniLM-L-6-v2` (local, no API call).
- Score the top 20 candidates from Stage 1 against the original query.
- Return the top 5 to the LLM context window.
- Interface: `rerank(query: str, candidates: List[Chunk], top_n: int) -> List[ScoredChunk]`

### 6b — Score Thresholding

- If the top-5 after re-ranking all score below `RERANK_MIN_SCORE` (env var, default `0.3`),
  trigger CRAG corrective fallback (Priority 1) rather than proceeding with low-confidence
  context.
- Log re-ranking scores alongside vector scores for quality monitoring.

### 6c — Retrieval Pipeline Summary

The full retrieval chain is now:
```
Query
  -> Hybrid Search (vector + BM25, top-100)     [< 200ms]
  -> Cross-Encoder Re-Rank (top-100 -> top-20)  [< 500ms]
  -> CRAG Evaluator (filter by threshold)        [< 100ms]
  -> Top-5 chunks to LLM context                 [total < 1s target]
```

### Acceptance Criteria — Priority 6
- [ ] Retrieval quality benchmark: re-ranked results score 20%+ higher on a labeled
      test set of 50 aerospace NCR queries than vector-only retrieval.
- [ ] Pipeline end-to-end latency stays under 1s for the retrieval stages (no LLM call).
- [ ] `RERANK_MIN_SCORE` is configurable and triggers CRAG fallback correctly.
- [ ] Re-ranking scores are visible in the admin chunk debug panel.

---

## Priority 7 — Multimodal RAG for Visual Defect Analysis

**Why:** NCRs routinely contain photos of defects — wing panel cracks, surface
discontinuities, weld failures. Text-only RAG is blind to this evidence. Engineers need
to be able to upload a defect photo and retrieve visually similar past NCRs.

### 7a — Image Ingestion Pipeline (`backend/app/rag/multimodal.py`)

- Accept image uploads at `POST /ingest/image` (JPEG, PNG, TIFF).
- Extract embedded images from PDF NCRs during ingest (use `pdfplumber` or `pymupdf`).
- Generate image embeddings using `clip-ViT-B-32` (local, via `sentence-transformers`).
- Store image embeddings in a separate pgvector column or table:
  ```sql
  chunk_images (
    image_id       TEXT PRIMARY KEY,
    chunk_id       TEXT REFERENCES chunks(chunk_id),
    doc_id         TEXT,
    image_data_uri TEXT,        -- base64 thumbnail for UI preview
    embedding      VECTOR(512), -- CLIP embedding
    caption        TEXT,        -- LLM-generated caption
    ingestion_ts   TIMESTAMP
  )
  ```

### 7b — Cross-Modal Retrieval

Support three query modes:
- **Text -> Images**: semantic query retrieves visually relevant NCR images alongside
  text chunks. Use CLIP text encoder to embed the query, then cosine search on
  `chunk_images.embedding`.
- **Image -> NCRs**: engineer uploads a defect photo; system retrieves past NCRs with
  visually similar images + the associated text.
- **Hybrid text+image**: weight and merge both modality results before re-ranking.

### 7c — Image Caption Generation

During ingest, generate a text caption for each extracted image using a vision LLM
(e.g., `gpt-4o` vision or local `llava`). Store caption in `chunk_images.caption`.
Captions are also indexed in BM25 for keyword search on image content.

### 7d — UI: Image Results Panel

In `frontend/components/CitationCard.tsx`, add an image tab:
- Show thumbnail previews of image results alongside text chunks.
- Clicking a thumbnail opens full-size view with the generated caption and a link to
  the source NCR document.

### Acceptance Criteria — Priority 7
- [ ] Uploading a photo of a hydraulic seal failure returns past NCRs containing
      visually similar defect images.
- [ ] PDF ingestion automatically extracts and indexes embedded images.
- [ ] Image results appear in the citation drawer with thumbnails + captions.
- [ ] `MULTIMODAL_ENABLED` env var gates the feature (default `false` for MVP).

---

## Priority 8 — Self-RAG for Zero-Hallucination Guardrails

**Why:** CRAG (Priority 1) catches bad retrieval before generation. Self-RAG goes further:
it reflects on the generated answer itself, catching cases where even good retrieved
context was misapplied or misinterpreted by the LLM.

### 8a — Self-RAG Reflection Loop (`backend/app/agent/verifier.py`)

After the LLM generates a candidate answer, run a reflection pass:

```
Step 1 — Retrieval relevance check
  LLM scores each retrieved chunk: "Is this chunk directly relevant to the query? (yes/partial/no)"
  Discard "no" chunks and flag "partial" for reduced citation confidence.

Step 2 — Answer groundedness check
  LLM evaluates the draft answer: "Is every claim in this answer directly supported by
  the retrieved context? (fully/partially/not supported)"
  Output: {claim, support_level, supporting_chunk_id} for each claim.

Step 3 — Corrective iteration
  If any claim is "not supported":
    - Remove the unsupported claim from the answer.
    - OR trigger an additional retrieval pass targeting that specific claim.
    - Cap at 2 reflection iterations (SELF_RAG_MAX_ITERATIONS env var).
  If all claims are "fully supported": proceed to synthesis.

Step 4 — Explicit refusal
  If after max iterations any claim remains unsupported: return the answer with that
  claim explicitly marked as "unverified" in the UI, with a clear engineer-facing note.
```

### 8b — Confidence Signal Integration

Self-RAG reflection scores feed directly into the claim-level confidence shown in
`ConfidenceBadge.tsx`:
- `fully supported` -> confidence contribution +0.2
- `partially supported` -> no adjustment
- `not supported` (retained after iteration cap) -> confidence contribution -0.3, badge
  shows "Unverified" in amber

### 8c — Reflection Audit Log

Store every reflection pass: `{run_id, claim_text, support_level, iterations,
final_action, timestamp}`. Accessible at `GET /admin/self-rag-log`.

### Acceptance Criteria — Priority 8
- [ ] No answer contains a claim marked "not supported" without explicit UI flagging.
- [ ] Reflection loop triggers correctly when retrieved context does not support a claim.
- [ ] `SELF_RAG_MAX_ITERATIONS` is configurable via env var.
- [ ] Self-RAG audit log is queryable by admin.

---

## Priority 9 — Contextual and Structure-Aware Chunking (NCR-Specific)

**Why:** This extends Priority 2's chunking pipeline with aerospace-specific intelligence.
Standard chunking treats an NCR like any other PDF. NCRs have a rigid structure
(Defect Description → Root Cause → Corrective Action → Disposition) that should be
preserved and exploited, not destroyed.

### 9a — NCR Section Parser (`backend/app/ingestion/ncr_parser.py`)

For documents classified as `NCR_PDF`, parse into canonical sections:
```python
NCR_SECTIONS = [
  "defect_description",
  "root_cause",
  "corrective_action",
  "disposition",
  "affected_parts",
  "engineering_approval"
]
```
Each section becomes its own chunk with `section_type` metadata. If a section is
missing, log a `quality: incomplete` tag.

### 9b — Contextual Metadata Injection

For every chunk, prepend a context header before embedding (not stored, only used for
embedding generation):
```
[Document: NCR-2024-1847 | Section: Root Cause | System: Landing Gear | Severity: Critical]
<chunk text here>
```
This "contextual RAG" technique anchors embeddings in their structural context, reducing
retrieval of chunks that are semantically similar but come from the wrong section type.

### 9c — Section-Filtered Retrieval

Add an optional `section_filter` parameter to `VectorSearchTool`:
```python
VectorSearchTool(query="hydraulic seal failure", filters={"section_type": "root_cause"})
```
When an engineer asks "What was the root cause of...", the intent classifier should
automatically apply `section_type: root_cause` as a metadata filter.

### Acceptance Criteria — Priority 9
- [ ] NCR PDFs are chunked into labeled sections; section labels visible in admin panel.
- [ ] Retrieval for "root cause of X" returns only `root_cause` section chunks by default.
- [ ] Contextual header injection does not appear in stored chunk text, only in embeddings.
- [ ] `NCR_SECTION_FILTER_AUTO` env var enables/disables automatic section filtering.

---

## Priority 10 — Advanced Observability and Telemetry

**Why:** Silent embedding drift and degrading retrieval quality are the #1 production
failure mode in enterprise RAG. Engineers need a live dashboard to catch issues before
they affect answers.

### 10a — Distributed Tracing (`backend/app/observability/telemetry.py`)

Instrument every pipeline stage with OpenTelemetry spans:
```
Span: agent_run
  -> Span: intent_classification       (duration_ms, intent_result)
  -> Span: hybrid_retrieval            (duration_ms, vector_score_p50, bm25_score_p50)
  -> Span: reranking                   (duration_ms, top_score, bottom_score)
  -> Span: crag_evaluation             (duration_ms, chunks_passed, chunks_rejected)
  -> Span: self_rag_reflection         (duration_ms, iterations, claims_verified)
  -> Span: llm_synthesis               (duration_ms, input_tokens, output_tokens)
```

Export to: OpenTelemetry Collector -> Jaeger (local dev) or any OTLP-compatible backend.
Configure via `OTEL_EXPORTER_OTLP_ENDPOINT` env var.

### 10b — Continuous Metrics (`backend/app/observability/drift_monitor.py`)

Log and monitor these metrics on every query:
| Metric | Alert Threshold |
|---|---|
| `retrieval_score_p50` | Alert if drops > 15% vs. 7-day baseline |
| `chunk_length_distribution` | Alert if mean drifts > 20% (chunking pipeline change) |
| `crag_fallback_rate` | Alert if > 10% of queries trigger corrective retrieval |
| `self_rag_unverified_rate` | Alert if > 5% of claims marked unverified |
| `llm_latency_p95` | Alert if > 5s |
| `cache_hit_rate` | Track; low rate may indicate query diversity shift |

### 10c — User Feedback Loop

Add thumbs up / thumbs down to every answer in the UI (`frontend/components/ChatPanel.tsx`).
Store feedback: `{run_id, rating, comment, timestamp}`.
Surface in admin dashboard as a weekly "answer quality score" trend.

### 10d — Admin Telemetry Dashboard

Add a `/admin/telemetry` page in the frontend showing:
- Live pipeline latency breakdown (per stage, last 100 queries).
- Retrieval score distribution (histogram, 7-day window).
- CRAG fallback rate trend.
- Self-RAG unverified claim rate trend.
- User feedback score trend.
- Embedding drift alert history.

### Acceptance Criteria — Priority 10
- [ ] OpenTelemetry traces visible in Jaeger for a full agent run end-to-end.
- [ ] `crag_fallback_rate` alert fires correctly in a local test when threshold is exceeded.
- [ ] Thumbs up/down feedback stored and queryable in the admin dashboard.
- [ ] All 6 metrics from the table above are logged on every query.
- [ ] `OTEL_EXPORTER_OTLP_ENDPOINT` is configurable; telemetry is disabled gracefully
      if endpoint is not set.

---

# PHASE 4 — UX & Intelligence Expansion (Wave 3)

Work through these ten epics after Phase 3 is complete. They are organized into three
sprints by priority. Zero breaking changes to the existing agent pipeline — all new
fields are optional, all new features hook in via prompt injection or post-processing.

**⚠ Three pre-implementation warnings (read before starting):**
1. **Epic 1 — Pronoun resolution scope:** "resolve 'it'/'them' via context" is a hard
   NLP problem. Implement as "pass last query's explicit filters forward" only — not
   open-ended pronoun resolution. That scope is 3–4 days. Full coreference resolution is not.
2. **Epic 3 — Streaming cold start:** SSE fixes perceived latency but NOT the 60s cold
   start on Render free tier. Make `EAGER_MODEL_LOAD=true` a hard requirement, not optional.
3. **Epic 9 — Alembic HNSW migration:** `CREATE INDEX CONCURRENTLY` cannot run inside a
   transaction. Add `op.execute("COMMIT")` before the index creation in the migration
   script or it will silently fail.

**Rollback rule:** Every Alembic migration must have a `downgrade()` function. Every epic
that touches the orchestrator must be feature-flagged via env var so it can be disabled
without a redeploy if it causes regressions.

---

## Sprint 1 (P0) — ~6 days

---

### Epic 1 — Conversational Memory & Multi-Turn Queries

**Why:** Without memory, every query is an island. Field engineers naturally refine in
2–4 follow-up messages. Session context enables this without changing the agent's core
8-stage state machine.

#### Backend changes

**`backend/app/schemas/models.py`**
- Add to `QueryRequest`:
  ```python
  session_id: str | None = None
  conversation_history: list[dict] | None = None  # max 5 prior turns
  ```
- All new fields optional — zero breaking change for existing callers.

**`backend/app/agent/orchestrator.py`**
- If `conversation_history` is present, prepend last N (max 5) query/answer pairs to
  the synthesis prompt only. Do NOT re-run vector or SQL tools against history.
- Format: `"Prior turn {i}: Q: {query} | A: {answer_summary}"`
- Pass `session_id` to `run_store.save()` for persistence.

**`backend/app/db/models.py`**
- Add nullable columns to `agent_runs`: `session_id UUID`, `is_favourite BOOLEAN DEFAULT FALSE`
- Alembic migration required (include `downgrade()` that drops both columns).

#### Frontend changes

**`frontend/app/components/ChatPanel.tsx`**
- Generate `session_id` (UUID) on first query; store in component state (not localStorage).
- Pass `session_id` and last 5 turns as `conversation_history` on every subsequent request.
- "Clear" (Trash) button resets `session_id` and `conversation_history` to null.
- Show active session indicator (small pill: "Session active • N turns").

#### Acceptance Criteria — Epic 1
- [ ] Submit "hydraulic leak last 30 days" then "show only critical severity" — second
      query returns filtered results without repeating original terms.
- [ ] All new `QueryRequest` fields are optional; existing API callers unaffected.
- [ ] `session_id` stored in `agent_runs.session_id` after every query.
- [ ] Clear button resets session; next query starts fresh with no history.
- [ ] Alembic migration has a working `downgrade()`.

---

### Epic 2 — Query History & Favourites

**Why:** `agent_runs` already stores every query with full results. Surfacing this in a
sidebar costs almost nothing on the backend but dramatically increases platform stickiness.

#### Backend changes

**`backend/app/api/runs.py`**
- `GET /runs?limit=20&offset=0` — paginated run summaries:
  ```json
  { "id": "...", "query": "...", "intent": "HYBRID", "created_at": "...",
    "cached": false, "latency_ms": 1240, "is_favourite": false }
  ```
- `PATCH /runs/{run_id}/favourite` — toggles `is_favourite` boolean. Returns updated summary.

#### Frontend changes

**`frontend/app/components/HistorySidebar.tsx`** (new component)
- Collapsible left sidebar, 240px wide, toggled by clock icon in ChatPanel header.
- Each item shows: query text (truncated to 60 chars), intent badge, relative timestamp,
  star icon to toggle favourite. Favourites pinned to top of list.
- Clicking an item loads `runData` into `AgentTimeline` + `GraphViewer` without re-executing
  the query (use existing `GET /runs/{run_id}` to fetch full run).
- "Share" icon copies `?run=<run_id>` to clipboard. Visiting that URL loads the cached run
  via `useSearchParams` in `ChatPanel`.

#### Acceptance Criteria — Epic 2
- [ ] Last 20 queries appear in history sidebar in reverse chronological order.
- [ ] Starring a query persists on page refresh (stored in DB via PATCH endpoint).
- [ ] Clicking a history item reloads the result with zero additional API calls to `/query`.
- [ ] `?run=<run_id>` URL loads and displays the full cached run correctly.

---

## Sprint 2 (P1) — ~13 days

---

### Epic 3 — Streaming Synthesis Output

**Why:** 5–7s synthesis with a spinner destroys perceived performance. Streaming tokens
makes the agent feel 3x faster even if wall-clock time is identical.

#### Backend changes

**`backend/app/api/query.py`**
- Add SSE variant: `POST /query` with `Accept: text/event-stream` header triggers streaming.
- SSE event types:
  ```
  data: {"type": "token", "text": "..."}        # one per LLM token
  data: {"type": "done", "run": {...}}           # full QueryResponse at end
  data: {"type": "error", "message": "..."}      # on failure
  ```
- Only the synthesis LLM call uses `stream=True`. Intent classification, tool execution,
  and verification remain non-streaming (no change to orchestrator state machine).
- Wrap Anthropic SDK streaming: `async for chunk in await client.stream(...):`

**`backend/app/utils/llm_client.py`**
- Add `LLMClient.stream(prompt) -> AsyncIterator[str]` method.

#### Frontend changes

**`frontend/app/components/ChatPanel.tsx`**
- Switch to `fetch` with `ReadableStream` for query submission.
- Render tokens progressively into the message bubble as they arrive.
- Claims, evidence table, and graph rendered only after `type:done` event.
- Fallback: if SSE connection fails, retry once with existing non-streaming `POST /query`.
- First token must appear within 1.5s of submission (requires `EAGER_MODEL_LOAD=true`).

#### Acceptance Criteria — Epic 3
- [ ] First token appears in UI within 1.5s of submitting a hybrid query (warm instance).
- [ ] Claims and graph panel render only after `type:done` event, not mid-stream.
- [ ] Fallback to non-streaming triggers correctly when SSE fails.
- [ ] `STREAMING_ENABLED` env var gates the feature (default `true`).

---

### Epic 4 — Real Dashboard Analytics

**Why:** Dashboard Tabs 3–5 show mock Recharts data. The DB has the real aggregations.
Wiring them takes ~3 days and replaces demo content with operational value.

#### Backend changes

**`backend/app/api/analytics.py`** (new file)

Three new endpoints, all using existing named SQL queries (no new SQL written):

```
GET /analytics/defects?from=&to=&domain=
  -> reuses: defect_counts_by_product named query
  -> returns: [{product, defect_type, count}]

GET /analytics/maintenance?from=&to=
  -> reuses: maintenance_trends named query
  -> returns: [{month, event_type, count}]

GET /analytics/diseases?from=&to=&specialty=
  -> reuses: disease_counts_by_specialty named query
  -> returns: [{specialty, disease, count}]
```

All endpoints enforce SELECT-only via existing SQL guardrail. Add to CORS origin list.

#### Frontend changes

**`frontend/app/dashboard/page.tsx`**
- Replace mock data arrays in Tabs 3, 4, 5 with `useEffect` API calls to the three
  new endpoints above.
- Wire existing date-range pickers to pass `from`/`to` query params.
- Charts re-render on domain switch (AIRCRAFT <-> MEDICAL).
- Show loading skeleton while fetching; show error state if endpoint fails.

#### Acceptance Criteria — Epic 4
- [ ] Tab 3 defect chart matches `SELECT defect_type, COUNT(*) FROM manufacturing_defects GROUP BY defect_type`.
- [ ] Changing the date range re-fetches and re-renders the chart.
- [ ] Switching domain from AIRCRAFT to MEDICAL updates Tab 3 to disease data.
- [ ] Loading skeleton renders during fetch; no flash of stale mock data.

---

### Epic 5 — Export & Reporting

**Why:** Results are ephemeral. Engineers need to paste findings into maintenance tickets.
Export is table-stakes for a professional tool.

#### Frontend changes (no backend required)

**`frontend/app/components/ChatPanel.tsx`**
- Add "Export" button (Download icon) to assistant message actions.
- Export options: PDF and JSON (raw `QueryResponse`).

**`frontend/app/components/ExportModal.tsx`** (new component)
- PDF generated client-side via `@react-pdf/renderer` — no server round-trip.
- PDF template structure:
  ```
  Header: NEXTAGENTAI logo | Query text | Run ID | Timestamp
  Section 1: Answer text
  Section 2: Claims table — Claim | Confidence | Citation ID
  Section 3: Evidence table — Source | Excerpt (truncated 200 chars) | Score
  Footer: "Generated by NextAgentAI | run_id: ..."
  ```
- JSON export: `JSON.stringify(queryResponse, null, 2)` downloaded as `run_<id>.json`.

**`frontend/app/components/AgentTimeline.tsx`**
- SQL result tables gain a "CSV" download button.
- CSV = first 1000 rows of the SQL result, column headers from `result.columns`.
- Client-side generation via `Papa.unparse()` (papaparse already in deps).

#### Acceptance Criteria — Epic 5
- [ ] PDF export contains answer, claims table, and evidence table.
- [ ] PDF footer shows correct `run_id` and generation timestamp.
- [ ] CSV download produces valid CSV matching the displayed SQL result columns.
- [ ] JSON export is valid parseable JSON matching the `QueryResponse` schema.

---

### Epic 6 — Enhanced Citation UX

**Why:** Citations are the trust mechanism. Three specific issues currently undermine them:
only first citation shown per claim, char-offset highlighting not rendering, and conflicted
claims have no visual indicator.

#### Frontend changes only (no backend work required)

**`frontend/app/components/CitationsDrawer.tsx`**
- Add Prev/Next navigation buttons when `citations.length > 1`. Show "1 of N" counter.
- Implement char-offset highlighting:
  ```typescript
  function highlightRange(text: string, start: number, end: number): ReactNode {
    return (<>{text.slice(0, start)}<mark>{text.slice(start, end)}</mark>{text.slice(end)}</>);
  }
  ```
  Use `char_start`/`char_end` from citation metadata to call this function.
- Conflict badge: if `claim.conflict_flagged === true`, render amber "⚠ CONFLICT" badge
  next to the confidence score in both inline claims and CitationsDrawer.
- Claims with `confidence < 0.4` default to 2-line clamp with "Read more" chevron to expand.

#### Acceptance Criteria — Epic 6
- [ ] Claim with 3 citations shows Prev/Next buttons and "1 of 3" / "2 of 3" counter.
- [ ] `<mark>` wraps exactly the character range defined by `char_start`/`char_end`.
- [ ] Conflict badge appears on any claim where `conflict_flagged === true`.
- [ ] Low-confidence claims (< 0.4) are clamped to 2 lines by default.

---

## Sprint 3 (P2) — ~8 days

---

### Epic 7 — Examples → Chat Integration

**Why:** 28 example queries exist on separate pages with zero chat integration. Engineers
copy-paste. One button click fixes this entirely.

#### Frontend changes only

**`frontend/app/examples/page.tsx`** and **`frontend/app/medical-examples/page.tsx`**
- Add "▶ Run Query" button to each example card.
- On click:
  1. Store query text in `localStorage` key `pending_query`.
  2. Store domain in `localStorage` key `pending_domain` (`AIRCRAFT` or `MEDICAL`).
  3. Navigate to `/`.

**`frontend/app/components/ChatPanel.tsx`**
- On mount, check `localStorage` for `pending_query`.
- If present: set domain to `pending_domain`, pre-fill input, auto-submit after 300ms debounce.
- Clear both localStorage keys immediately after submission.

#### Acceptance Criteria — Epic 7
- [ ] Clicking "Run Query" on any aircraft example navigates to `/` and auto-submits.
- [ ] Domain switches correctly to match the example's domain before submission.
- [ ] `pending_query` and `pending_domain` are cleared from localStorage after submission.
- [ ] If ChatPanel mounts with no pending query, behavior is unchanged.

---

### Epic 8 — Graph Enhancements

**Why:** The graph is visually impressive but hard to use at scale. Node popovers go
offscreen; no way to find specific entities; no edge weight visibility.

#### Frontend changes only (`frontend/app/components/GraphViewer.tsx`)

**Node search filter:**
- Add search input (top-right corner of GraphViewer).
- On input: nodes whose label matches the substring stay at full opacity; all others dim
  to 20% opacity. Matching nodes get a white ring highlight.
- "Fit to selection" button: zooms ReactFlow viewport to matching nodes only
  (`fitView({ nodes: matchingNodes })`).

**Viewport-aware popover positioning:**
- On node click, calculate: `if (x + POPOVER_WIDTH > window.innerWidth)` flip to left.
- Same check vertically: `if (y + POPOVER_HEIGHT > window.innerHeight)` flip upward.

**Edge weight labels:**
- `SIMILAR_TO` edges show weight formatted to 2 decimal places on hover.
- Implement as ReactFlow edge label: `label={edge.type === 'SIMILAR_TO' ? edge.weight.toFixed(2) : undefined}`

#### Acceptance Criteria — Epic 8
- [ ] Typing "hydraulic" in graph search dims all non-matching nodes to 20% opacity.
- [ ] "Fit to selection" zooms to matching nodes correctly.
- [ ] Node popover never renders outside the viewport bounds.
- [ ] `SIMILAR_TO` edge weight label appears on hover.

---

### Epic 9 — Medical Domain Parity

**Why:** Medical domain trails aircraft in index performance (IVFFlat vs HNSW) and is
missing one analytics SQL query needed for Tab 4 parity.

#### Backend changes

**Alembic migration** (new migration file):
```python
def upgrade():
    # CRITICAL: must commit before CONCURRENTLY — cannot run inside transaction block
    op.execute("COMMIT")
    op.execute("""
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_medical_embeddings_hnsw
        ON medical_embeddings USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    """)
    # GIN full-text search indexes for both domains
    op.execute("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chunks_fts ON chunks USING GIN (to_tsvector('english', text))")
    op.execute("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_runs_created ON agent_runs (created_at DESC)")

def downgrade():
    op.execute("DROP INDEX IF EXISTS idx_medical_embeddings_hnsw")
    op.execute("DROP INDEX IF EXISTS idx_chunks_fts")
    op.execute("DROP INDEX IF EXISTS idx_agent_runs_created")
```

**`backend/app/tools/sql_tool.py`**
- Add named query `medical_case_trends`:
  ```sql
  SELECT DATE_TRUNC('month', date) AS month, specialty, COUNT(*) AS case_count
  FROM disease_records
  WHERE date >= CURRENT_DATE - INTERVAL ':days days'
  GROUP BY month, specialty ORDER BY month
  ```
  This provides Tab 4 parity for medical domain in the analytics dashboard.

**`frontend/app/components/ChatPanel.tsx`**
- Show persistent amber disclaimer banner beneath the input when domain = MEDICAL:
  `"⚠ Clinical data is for research only. Not for diagnostic or treatment decisions."`

#### Acceptance Criteria — Epic 9
- [ ] `EXPLAIN (ANALYZE, FORMAT JSON)` on a medical embedding query confirms
      "Index Scan using idx_medical_embeddings_hnsw".
- [ ] Medical Tab 4 chart renders with real monthly case data (not mock).
- [ ] Medical disclaimer banner is permanently visible when MEDICAL domain is active.
- [ ] Migration `downgrade()` drops all three indexes cleanly.

---

### Epic 10 — Developer Experience & Observability Improvements

**Why:** The backend captures rich telemetry that the UI never surfaces. Exposing it
increases engineer trust and accelerates debugging.

#### Backend changes

**`backend/app/tools/compute_tool.py`**
- Fix CR-007: replace `asyncio.get_event_loop()` with `asyncio.get_running_loop()`.
  Search entire codebase for `get_event_loop` — confirm zero occurrences after fix.

**`backend/app/rag/retrieval.py`**
- Add `source: Literal["bm25", "vector", "hybrid"]` field to `VectorHit` schema.
- Tag each hit with its origin during hybrid retrieval merge step.

#### Frontend changes

**`frontend/app/components/AgentTimeline.tsx`**
- CACHED badge: if `run.cached === true`, show green "CACHED" pill in the timeline header.
- Timing breakdown: new collapsible "TIMING BREAKDOWN" row beneath plan text. Renders a
  horizontal bar chart (inline CSS, no new chart library) showing ms per stage:
  `classify | vector | sql | graph | synthesise | verify`.
- Vector hit source labels: each hit in the expanded timeline step shows its `source` tag
  as a small badge (`BM25`, `VECTOR`, or `HYBRID`).

**`frontend/app/components/ChatPanel.tsx`**
- Render `next_steps` and `assumptions` from `QueryResponse` beneath the main answer as
  a collapsible "AGENT NOTES" section (collapsed by default, chevron to expand).

#### Acceptance Criteria — Epic 10
- [ ] Zero occurrences of `get_event_loop` in the codebase after CR-007 fix.
- [ ] CACHED badge renders correctly on a query that hits the cache.
- [ ] Timing breakdown bar chart sums correctly to total `latency_ms`.
- [ ] Each vector hit in the timeline shows its `source` badge.
- [ ] "AGENT NOTES" section renders and collapses correctly.

---

## Phase 4 Key Files Reference

| File | Change |
|---|---|
| `backend/app/schemas/models.py` | Add `session_id`, `conversation_history` to QueryRequest; `is_favourite` to RunSummary; `source` to VectorHit |
| `backend/app/agent/orchestrator.py` | Inject `conversation_history` into synthesis prompt; save `session_id` |
| `backend/app/api/query.py` | Add SSE streaming endpoint |
| `backend/app/api/analytics.py` | 3 new analytics aggregate endpoints (new file) |
| `backend/app/api/runs.py` | `GET /runs` paginated list + `PATCH /runs/{id}/favourite` |
| `backend/app/db/models.py` | Add `session_id`, `is_favourite` to `agent_runs` |
| `backend/app/tools/compute_tool.py` | Fix CR-007: `get_running_loop()` |
| `backend/app/rag/retrieval.py` | Add `source` label to vector hits |
| `backend/app/utils/llm_client.py` | Add `stream()` async iterator method |
| `backend/app/tools/sql_tool.py` | Add `medical_case_trends` named query |
| `backend/app/db/migrations/` | session_id + is_favourite + HNSW medical + GIN FTS indexes |
| `frontend/app/components/ChatPanel.tsx` | Session state, streaming renderer, pending_query check, export button, agent notes, medical disclaimer |
| `frontend/app/components/AgentTimeline.tsx` | CACHED badge, timing bar chart, source labels, CSV download |
| `frontend/app/components/CitationsDrawer.tsx` | Prev/Next nav, offset highlighting, conflict badge |
| `frontend/app/components/GraphViewer.tsx` | Node search filter, viewport-aware popover, edge labels |
| `frontend/app/components/HistorySidebar.tsx` | New: history + favourites sidebar |
| `frontend/app/components/ExportModal.tsx` | New: PDF + JSON export |
| `frontend/app/dashboard/page.tsx` | Wire Tabs 3–5 to real analytics API |
| `frontend/app/examples/page.tsx` | "Run this query" button + localStorage bridge |
| `frontend/app/medical-examples/page.tsx` | "Run this query" button + localStorage bridge |

---

## Phase 4 Verification Checklist

Run all 10 checks before marking Phase 4 complete:

1. **Multi-turn**: Submit "hydraulic leak last 30 days" → then "show only critical" → confirm context applied without repeating original terms.
2. **History**: Submit 3 queries → all appear in sidebar → star one → persists on refresh → click item → result reloads with no `/query` call.
3. **Streaming**: Submit any hybrid query → first tokens appear < 1.5s → claims/graph load only after `type:done`.
4. **Dashboard**: Tab 3 chart values match `SELECT defect_type, COUNT(*) FROM manufacturing_defects GROUP BY defect_type`.
5. **Export**: Submit query → Export → PDF → verify answer, claims table, evidence table, and `run_id` footer present.
6. **Citations**: Find claim with `citations.length > 1` → Prev/Next works → `<mark>` wraps correct char range.
7. **Examples**: Click "Run Query" on example #1 → redirects to `/` → query auto-submits with correct domain.
8. **Graph search**: Submit hybrid query → type "hydraulic" in graph search → non-matching nodes dim to 20%.
9. **Medical HNSW**: `EXPLAIN (ANALYZE) SELECT ...` on medical embedding query → confirms HNSW index scan.
10. **CR-007**: `grep -r "get_event_loop" backend/` → zero results.

---

- **LLM Client** (`backend/app/utils/llm_client.py`): `LLMClient.generate(prompt,
  json_schema=None)` with exponential backoff retry (3 attempts). Configurable via
  `LLM_PROVIDER` env var.
- **Structured outputs**: Use JSON schema for plan generation, tool selection, SQL
  generation, and claim extraction. Retry with stricter prompt on parse failure.
- **Observability**: Structured JSON logs for every agent decision point. No PII (strip
  names and emails from all log output).
- **Security**: SELECT-only SQL enforcement. Request/response size limits. Basic API key
  auth on `/ingest`. Sanitize all logs.
- **Tool timeouts**: 30s per tool call, 10 steps max per agent run. Graceful degradation
  on timeout.

---

## Session Workflow

Start each Claude Code session with:
```
"Let's work on [Phase 1 / Phase 2 Priority N / Phase 3 Priority N / Phase 4 Epic N] from PROMPT.md.
 Here is my current code for [relevant file]: ..."
```

After completing each priority, run its acceptance criteria checklist in full before
proceeding to the next. Do not start Priority N+1 until all checkboxes for Priority N
are green.

---

## Vercel/Render Live Production Test Report

> Source: nextvercel.md (2026-03-07)

# nextvercel.md — NextAgentAI Live Production Test Report

**Test run date:** 2026-03-07 (updated run)
**Tester:** Automated Playwright E2E suite (claude-sonnet-4-6)
**Frontend URL:** https://nextgenai-seven.vercel.app
**Backend URL:** https://nextgenai-5bf8.onrender.com
**Playwright version:** 1.58.2 | **Browser:** Chromium (Desktop Chrome, 1440x900)
**Test file:** `e2e/tests/production-vercel.spec.ts` (81 tests)

---

## Executive Summary

| Metric | Value |
|---|---|
| Total tests executed | 81 |
| Passed | 78 |
| Failed | 3 |
| Skipped | 0 |
| Overall status | PARTIAL PASS — all structural/navigation/UI tests pass; 3 chat-flow failures trace to Render free-tier 502 instability affecting browser CORS preflights |

**Improvement from last run:** 75 passed / 6 failed -> 78 passed / 3 failed. The previously critical BUG-PROD-001 (db:false) is now confirmed fixed — `/healthz` returns `{"status":"ok","db":true}`. The three remaining failures are all caused by intermittent Render 502 responses that block the browser CORS preflight for POST /query, preventing chat tests from completing a live query cycle.

---

## Backend Status at Test Time

```json
GET https://nextgenai-5bf8.onrender.com/healthz
-> {"status":"ok","db":true,"version":"1.0.0"}
```

The DB connection is restored. However, the Render free-tier instance is intermittently returning HTTP 502 from the Render load balancer layer (before requests reach FastAPI). The 502s are most frequent on the OPTIONS preflight that browsers send before POST /query, since the preflight is a cold-path request that arrives while the instance may be mid-cycle. The Playwright `request` fixture (used in API contract tests) bypasses CORS entirely and reaches the backend without a preflight, which is why those tests pass while the browser-initiated chat tests fail.

**Observed 502 pattern during test run:**
- GET /healthz: stable 200 during the API test phase (~8 consecutive requests)
- OPTIONS /query (CORS preflight from browser): 502 on all 5 consecutive attempts immediately after the test suite ran
- POST /query (no-preflight via curl): 200 when instance is warm, 502 intermittently

---

## Coverage Matrix

| Area | Tests | Passed | Failed | Notes |
|---|---|---|---|---|
| Backend API — health | 4 | 4 | 0 | db:true confirmed — regression fixed |
| Backend API — contract | 5 | 5 | 0 | OpenAPI schema, 422 validation all pass |
| Frontend page loads (HTTP) | 11 | 11 | 0 | All 9 routes return 200 |
| Homepage UI structure | 12 | 12 | 0 | All panels, buttons, layout pass |
| Domain switcher | 4 | 4 | 0 | AIRCRAFT/MEDICAL + localStorage persistence |
| Theme toggle | 2 | 2 | 0 | Toggle + localStorage persistence |
| Chat — query submission | 6 | 3 | 3 | 3 fail: "Failed to fetch" from Render 502 on CORS preflight |
| Graph Viewer | 6 | 6 | 0 | Nodes, edges, y-spread, badge, collapse all pass |
| Navigation (NAVIGATE menu) | 10 | 10 | 0 | All routes reachable, menu items present |
| Dashboard | 3 | 3 | 0 | Tabs, charts visible |
| Agent architecture page | 2 | 2 | 0 | STATE MACHINE tab button found correctly |
| Diagram page (Mermaid) | 2 | 2 | 0 | SVG renders, no error block |
| Examples / Medical examples | 3 | 3 | 0 | Pages load, content present |
| FAQ | 1 | 1 | 0 | Content present |
| Accessibility basics | 4 | 4 | 0 | Alt attrs, labels, keyboard focus |
| Performance | 2 | 2 | 0 | DOMContentLoaded 475ms, textarea < 5s |

---

## Test Results — Detailed

### Passing Tests (78/81)

#### Backend API — health and contract (all 9 PASS)

| # | Test | Result | Notes |
|---|---|---|---|
| 1 | GET /healthz returns status ok | PASS | `{"status":"ok","db":true,"version":"1.0.0"}` |
| 2 | GET /healthz db field is present and boolean | PASS | `db: true` — boolean confirmed |
| 3 | GET /healthz db:true (DB connected) | PASS | **REGRESSION FIXED** — was FAIL in previous run |
| 4 | GET /api/docs returns 200 Swagger UI | PASS | Swagger UI HTML served correctly |
| 5 | GET /api/openapi.json returns valid OpenAPI schema | PASS | OpenAPI 3.1.0, /query and /healthz paths present |
| 6 | POST /query returns QueryResponse shape (aircraft) | PASS | Returns 200 with run_id, answer, evidence, graph_path, run_summary |
| 7 | POST /query with medical domain returns correct shape | PASS | Returns 200 (logged as 502 on one parallel run — intermittency) |
| 8 | POST /query rejects query shorter than 3 characters | PASS | Returns 422 Unprocessable Entity |
| 9 | POST /query rejects invalid domain value | PASS | Returns 422 with pattern validation error |

**Key observation on POST /query:** The API contract tests pass because the Playwright `request` fixture does not send a CORS preflight. The query response has `"cached":true` in the run_summary (indicating a cached result from a previous run), `claims: []` (empty), and the answer text is the synthetic fallback "Found 2 similar incident(s)..." rather than a full Sonnet-synthesised response. This indicates either: (a) the 5-minute query cache in the orchestrator is returning a cached degraded response from the previous test run when DB was down, or (b) the VectorSearchTool is returning very low-similarity hits (similarity: 0.01) and falling through to the synthetic path. Either way, once the cache expires (after 5 minutes of non-activity), a fresh query should produce a full LLM-synthesised answer now that the DB is connected.

#### Frontend — Page Loads (all 11 PASS)

All 9 routes return HTTP 200:

| Route | HTTP Status | Result |
|---|---|---|
| `/` | 200 | PASS |
| `/agent` | 200 | PASS |
| `/dashboard` | 200 | PASS |
| `/diagram` | 200 | PASS |
| `/data` | 200 | PASS |
| `/review` | 200 | PASS |
| `/examples` | 200 | PASS |
| `/medical-examples` | 200 | PASS |
| `/faq` | 200 | PASS |

Homepage title contains "NextAgentAI": PASS. No critical JS console errors on load: PASS.

#### Homepage UI Structure (12 tests, all PASS)

- Chat textarea: visible and enabled on load
- Submit button: visible and correctly disabled when textarea is empty
- NAVIGATE dropdown: present and opens with menu items
- Domain switcher: AIRCRAFT and MEDICAL buttons both present
- Theme toggle: button present with correct title attribute
- React Flow container: `.react-flow` visible on load
- Panel headings: COMMS // QUERY INTERFACE, AGENT EXECUTION TRACE, KNOWLEDGE GRAPH // REACTFLOW all visible
- `<html lang="en">`: confirmed
- No horizontal scrollbar: confirmed

#### Domain Switcher (4 tests, all PASS)

- Clicking MEDICAL sets `localStorage["nextai_domain"] = "medical"`: PASS
- Clicking AIRCRAFT restores `localStorage["nextai_domain"] = "aircraft"`: PASS
- localStorage state persists across page reload: PASS

#### Theme Toggle (2 tests, all PASS)

- Toggle click changes html class (dark/light): PASS
- `localStorage["theme"]` written on toggle: PASS

#### Graph Viewer (6 tests, all PASS)

| Test | Result | Detail |
|---|---|---|
| React Flow container present before query | PASS | `.react-flow` visible on initial load |
| Graph shows nodes after query | PASS | 7 nodes rendered after query |
| Graph is not a flat line | PASS | Node y-spread confirmed > 20px threshold |
| Graph badge shows domain label | PASS | AIRCRAFT GRAPH badge visible |
| Graph shows connecting edges | PASS | Edges rendered |
| Graph collapse/expand button present | PASS | Collapse button visible |

**Graph layout confirmed working.** Two-tier layout shows entity nodes (purple circles) connected by edges to chunk nodes (teal rectangles). The SAMPLE DATA badge is shown because the query that ran was a cached degraded response with empty graph_path.nodes from the backend, correctly triggering the static mock fallback. When a fresh live query returns real vector hits, the badge will show VECTOR HITS or AIRCRAFT GRAPH (LIVE QUERY).

#### Navigation (10 tests, all PASS)

- NAVIGATE dropdown opens and shows all routes
- Clicking DASHBOARD menu item navigates to /dashboard
- All 8 routes directly navigatable without 404

#### Dashboard (3 tests, all PASS)

- Dashboard page loads without 404
- Dashboard tab navigation present
- SVG/Recharts chart visualisation visible

#### Agent Architecture Page (2 tests, all PASS)

- `page.getByRole("button", { name: /STATE MACHINE/i })` correctly finds the tab button
- STATE MACHINE content area visible after click

Note: BUG-TEST-003 from the previous run (wrong ARIA role to find tabs) was already corrected in the test file — the tests now use `getByRole("button", {name: ...})` which works correctly.

#### Diagram Page — Mermaid (2 tests, all PASS)

- Mermaid SVG renders: PASS — SVG element visible within 15s
- No Mermaid error block: PASS

#### Accessibility (4 tests, all PASS)

- All `<img>` elements have alt attributes: PASS
- Textarea has placeholder attribute: PASS
- Submit button has accessible `aria-label="Submit query"`: PASS
- Keyboard Tab moves focus to interactive element: PASS

#### Performance (2 tests, all PASS)

- Homepage DOMContentLoaded < 10s: PASS (measured **475ms** — excellent)
- Textarea visible < 5s from navigation: PASS

---

### Failed Tests (3/81)

#### FAILURE 1 — submitting a query enables submit button and shows loading state

**Test:** `Chat panel — live query submission > submitting a query enables submit button and shows loading state`
**Severity:** Medium (test failure caused by infrastructure instability, not application code defect)

```
Error: expect(received).not.toBe(expected)
Expected: not "timeout"
Received: "timeout"
```

**Root cause:** The `Promise.race` in the test races a loading indicator wait against `page.waitForResponse(r => r.url().includes("/query"))`. The browser submits a CORS OPTIONS preflight to `https://nextgenai-5bf8.onrender.com/query` before POST. The Render load balancer returns HTTP 502 on the preflight, causing the browser to reject the fetch with a network error ("Failed to fetch") before any /query response URL matches the Playwright route interception. Neither the loading indicator nor the `/query` response fires within 10s.

**Screenshot evidence:** The failure screenshot shows "QUERY ERROR — Failed to fetch" and "BACKEND WARMING UP" banner in the chat panel. The graph panel correctly shows the static sample data fallback (9 entity + chunk nodes, two-tier layout).

**Application state in screenshot:** The UI handles the error gracefully — an amber "BACKEND WARMING UP" banner and red "QUERY ERROR / Failed to fetch" message are displayed correctly. The submit flow and error handling are working as designed; only the underlying Render 502 prevents the query from completing.

---

#### FAILURE 2 — answer text appears in the chat panel after successful query

**Test:** `Chat panel — live query submission > answer text appears in the chat panel after successful query`
**Severity:** Medium (same root cause as Failure 1)

```
Test timeout of 100000ms exceeded.
```

**Root cause:** Same Render 502 on CORS preflight. The test waits up to 100s for a `/query` response with status 200. The browser's OPTIONS preflight to the backend gets 502, the fetch fails immediately with "Failed to fetch", and no /query 200 response ever fires. The test times out after the full 100s.

**Screenshot evidence:** "QUERY ERROR — Failed to fetch" visible in chat panel. Graph shows static SAMPLE DATA fallback correctly.

---

#### FAILURE 3 — CLAIM CONFIDENCE section appears after query response

**Test:** `Chat panel — live query submission > CLAIM CONFIDENCE section appears after query response`
**Severity:** High (key portfolio feature not visible to live users)

```
Expected: true
Received: false
```

**Root cause (immediate):** Same Render 502 on CORS preflight — the query never completes in the browser, so no response with claims is received and the CLAIM CONFIDENCE section never renders.

**Root cause (deeper, partially independent of 502):** Even when a query does complete (as confirmed by the API contract test using no-preflight curl), the response has `"cached":true` and `claims: []`. The 5-minute query cache in the orchestrator is returning a cached entry from the previous test run when the DB was down and claims were not generated. The cache key is a case-insensitive match on the query string. Once the cached entry expires (5 minutes of no matching queries), a fresh call will go through the full pipeline with the now-connected DB and should return real claims.

**Secondary contributing factor:** The VectorSearchTool returned only 2 chunks with similarity score 0.01 — extremely low. This may indicate the production database has limited ingested data for the specific query "Analyze defect patterns in hydraulic systems". With so few and low-quality hits, the verifier may still produce an empty claims array even on a fresh call.

**Status:** Cannot confirm CLAIM CONFIDENCE end-to-end via automated test until Render 502 instability is resolved. The frontend rendering code for confidence bars (ChatPanel.tsx) is confirmed correct from code review.

---

## Regression Check — Were Previously Fixed Bugs Resolved?

| Bug | Previous Status | Current Status | Verdict |
|---|---|---|---|
| BUG-PROD-001: db:false (broken DSN) | FAIL — db:false | PASS — db:true | FIXED |
| BUG-PROD-002: CLAIM CONFIDENCE absent (anthropic SDK) | FAIL | Still failing (new root cause: 502) | BLOCKED — cannot confirm E2E |
| BUG-PROD-003: Agent page STATE MACHINE blank | Medium — blank diagram | Not re-investigated this run | See notes |
| BUG-PROD-004: Medical disclaimer not visible | Low — text absent | Not re-tested (soft check only) | See notes |
| BUG-TEST-001: networkidle timeout | FAIL — timeout | PASS | FIXED |
| BUG-TEST-002: assertion direction error | FAIL — wrong direction | PASS (now uses .not.toBe) | FIXED |
| BUG-TEST-003: agent page tab role mismatch | FAIL — role=tab wrong | PASS | FIXED |

---

## Bug Report

### BUG-PROD-005 (NEW) — Render 502 on CORS Preflight Blocks All Browser Queries

| Field | Detail |
|---|---|
| Severity | Critical (all user-facing query functionality blocked) |
| Component | Render infrastructure — free-tier instance cycling |
| Symptom | Browser shows "QUERY ERROR — Failed to fetch"; OPTIONS preflight to /query returns HTTP 502 |
| Frequency | Consistent during test run; OPTIONS /query: 502 on 5/5 consecutive attempts |
| Impact | All users attempting queries on the live site receive "Failed to fetch" error |
| Root cause | Render free-tier allows only one running instance; when it cycles/restarts between requests, the Render load balancer returns 502 before FastAPI handles the request. CORS preflights are especially vulnerable because they are short-lived requests on a path the browser sends first before the actual POST. |
| Workaround | None for end users — they see the amber "BACKEND WARMING UP" banner and error message |
| Fix options | (a) Upgrade Render plan to prevent instance cycling; (b) Add a warm-up ping from the frontend on page load that retries until the instance is stable (already partially in place via healthz polling); (c) Add a retry mechanism in ChatPanel.tsx for fetch errors — if `err.message === "Failed to fetch"`, wait 3s and retry up to 3 times |
| Note | The healthz endpoint returns 200 more reliably because GET requests do not trigger CORS preflights — a simple GET from the browser (no custom headers) is a "simple request" and Render may handle it differently. POST with Content-Type: application/json always triggers a preflight. |

---

### BUG-PROD-006 (NEW) — Query Cache Returns Stale Degraded Response

| Field | Detail |
|---|---|
| Severity | Medium |
| Component | Backend — orchestrator query cache (`_check_query_cache()`) |
| Symptom | POST /query returns `"cached":true` with `claims:[]` and synthetic fallback answer even though DB is now connected |
| Impact | First-time visitors after a period of downtime see degraded (cached) responses until the cache expires |
| Root cause | The 5-minute LRU cache stores the full response including the degraded answer and empty claims array from when the DB was down. Subsequent identical queries hit the cache and receive the degraded response without re-querying the now-healthy DB. |
| Cache key | Case-insensitive LOWER(query) match on `agent_runs` table |
| TTL | 5 minutes per orchestrator code |
| Fix | Either: (a) invalidate the cache when /healthz transitions from `db:false` to `db:true`; (b) add a `claims` field check — if cached response has `claims:[]` and DB is now healthy, bypass cache and run fresh; (c) reduce cache TTL or disable caching for production demos |
| Note | This is a silent degradation — the 200 response and correct shape mask the fact that the answer quality is degraded |

---

### BUG-PROD-002 (OPEN) — CLAIM CONFIDENCE Section Absent for Live Users

| Field | Detail |
|---|---|
| Severity | High |
| Component | Frontend — ChatPanel.tsx claims rendering |
| Symptom | CLAIM CONFIDENCE bars do not appear after query response |
| Impact | Key portfolio feature invisible to visitors |
| Root cause | Two contributing factors: (1) BUG-PROD-005 prevents queries from completing in browser; (2) BUG-PROD-006 causes first successful query to return empty claims from cache |
| Dependency | Will auto-resolve once BUG-PROD-005 and BUG-PROD-006 are fixed |
| Note | Frontend rendering code (ChatPanel.tsx) is correct and ready — confirmed by code review |

---

### BUG-PROD-003 (OPEN — STATUS UNCERTAIN) — Agent Page STATE MACHINE Diagram

| Field | Detail |
|---|---|
| Severity | Medium |
| Component | Frontend — /agent page, STATE MACHINE tab |
| Previous status | Reported as blank diagram in prior run |
| Current status | Agent page passes structural tests (tab buttons found, page loads). Diagram rendering not re-asserted this run. |
| Note | The prior run screenshot showed only the legend with no diagram content. The fix (`diagKey` state + `useEffect`) should have resolved this. Manual verification recommended. |

---

## New Findings — Query Content Analysis

Post-run investigation of the backend query response (via direct API call with no CORS) revealed:

```
answer:  "Found 2 similar incident(s). Top match (similarity: 0.01): Asset FRAME-874
          (Pneumatics system) was brought in for unscheduled maintenance..."
claims:  [] (empty)
cached:  true
VectorSearchTool: Found 2 similar chunks
SQLQueryTool:     Returned 0 rows
synthesise_ms:    77.3 (too fast for a real Claude API call)
```

This is a cached degraded response. The `synthesise_ms` of 77ms is consistent with the synthesis path hitting an early-exit condition (no evidence) rather than calling Claude. Once the cache expires, a fresh call will exercise the full pipeline.

**Expected behavior on fresh call with DB connected:**
- VectorSearchTool should return more than 2 chunks with higher similarity scores
- SQLQueryTool should return rows from `manufacturing_defects` table
- Synthesis should call Claude Sonnet and return a multi-paragraph answer (>200 chars)
- Verifier should return 2-4 claims with confidence scores
- `claims.length > 0` should trigger CLAIM CONFIDENCE section in UI

---

## Acceptance Criteria Verification

| # | Criterion | Status | Notes |
|---|---|---|---|
| 1 | Pages load without JS errors | PASS | No pageerror events on any page |
| 2 | Backend health: db:true | PASS | FIXED since last run — db:true confirmed |
| 3 | Chat: full Sonnet-synthesised answer | BLOCKED | Render 502 prevents browser queries; cached response is degraded |
| 4 | Chat: CLAIM CONFIDENCE section with confidence bars | BLOCKED | Same root cause |
| 5 | Chat: AGENT EXECUTION TRACE shows tool steps | BLOCKED | Cannot test without a completed query |
| 6 | Graph: nodes and connecting edges | PASS | Nodes and edges visible; SAMPLE DATA fallback correct |
| 7 | Graph: domain badge correct | PASS | AIRCRAFT GRAPH badge visible |
| 8 | Domain toggle switches AIRCRAFT/MEDICAL | PASS | Both buttons work, localStorage persists |
| 9 | All navigation links work (no 404s) | PASS | All 9 routes return 200 |
| 10 | Theme toggle (light/dark) works | PASS | Toggle changes class, persists in localStorage |

**Summary: 6/10 criteria confirmed PASS. 4 blocked by Render 502 instability. 0 confirmed failing due to application code defects.**

---

## Comparison with Previous Test Run

| Area | 2026-03-07 Run 1 (db:false) | 2026-03-07 Run 2 (db:true) | Change |
|---|---|---|---|
| Tests passed | 75/81 | 78/81 | +3 |
| db:true health check | FAIL | PASS | Fixed |
| Homepage JS console errors | FAIL (networkidle) | PASS | Fixed (test fixed) |
| Loading state assertion | FAIL (wrong direction) | FAIL (502) | Test defect fixed; new infra failure |
| Answer text in chat | FAIL (degraded DB) | FAIL (502) | Root cause changed |
| CLAIM CONFIDENCE | FAIL (no DB) | FAIL (502) | Root cause changed |
| Agent page tab role | FAIL (wrong role) | PASS | Fixed |
| Graph y-spread (flat line fix) | PASS | PASS | Stable |
| All 9 routes HTTP 200 | PASS | PASS | Stable |
| Mermaid SVG renders | PASS | PASS | Stable |
| Domain switcher localStorage | PASS | PASS | Stable |

---

## Recommendations

### Immediate (blocking live user queries)

1. **Fix BUG-PROD-005 — Render 502 on CORS preflight.** The most impactful fix is to add a retry loop in `ChatPanel.tsx` for "Failed to fetch" errors. When `err.message === "Failed to fetch"`, the handler should wait 5s and retry the POST /query request up to 3 times before showing the error. This would handle transient 502s from Render instance cycling without requiring an infrastructure change.

2. **Fix BUG-PROD-006 — Stale cache returns degraded response.** Add a simple guard in `_check_query_cache()`: if the cached `claims` array is empty and the current DB health is `ok`, bypass the cache and run a fresh query. Alternatively, clear the `agent_runs` cache entries that have empty claims arrays after the DB is restored.

3. **Verify CLAIM CONFIDENCE after cache expires.** After deploying the retry fix, manually submit a new query from the live site (wait 5+ minutes for cache to expire first, or use a query string not in the cache). Confirm CLAIM CONFIDENCE bars appear.

### Short-term

4. **Manual check of /agent STATE MACHINE diagram.** Open https://nextgenai-seven.vercel.app/agent in a browser, click STATE MACHINE, verify the Mermaid diagram renders content (not just the legend). The `diagKey` remount fix should handle this.

5. **Upgrade Render plan if possible.** Render free-tier instance cycling is causing persistent instability. Even the "Starter" paid tier ($7/month) eliminates cold starts and provides persistent uptime.

### Test Suite

6. **Add resilience to chat tests.** The three failing tests need to gracefully handle "Failed to fetch" errors: check for the error message in the UI and skip the assertion rather than timing out. This makes the tests diagnostic rather than blocking.

7. **Add a test for the warm-up retry mechanism.** A test that intercepts the OPTIONS preflight with a 502 mock for the first 2 attempts, then 200 on the third, and verifies that the query eventually succeeds — this would regression-test the retry logic once it's added.

---

## Key Observations

### Performance — Excellent

Homepage DOMContentLoaded: **475ms** (previous run: 930ms — further improved). Textarea visible within 1s. Vercel CDN and Next.js optimizations are performing well.

### Graph Layout — Confirmed Working

The flat-line graph bug fix (commit `651572e`) is confirmed working in production. The two-tier hierarchical layout (entity nodes above, chunk nodes below) is intact across all graph tests.

### Graceful Degradation — Working Correctly

The UI correctly handles the "Failed to fetch" error state: shows the amber BACKEND WARMING UP banner and red QUERY ERROR message. The graph correctly falls back to SAMPLE DATA when no live query data is available. This graceful degradation is exactly the intended behavior.

### Test Infrastructure — Mostly Stable

The test defects from the previous run (BUG-TEST-001, BUG-TEST-002, BUG-TEST-003) have been fixed in the spec file and are confirmed passing. The remaining 3 failures are caused purely by Render 502 infrastructure instability, not by test defects.

---

## Test Artifacts

| Artifact | Path |
|---|---|
| Test spec | `e2e/tests/production-vercel.spec.ts` |
| Screenshot — Loading state / QUERY ERROR | `test-results/production-vercel-Chat-pan-9efff-ton-and-shows-loading-state-chromium/test-failed-1.png` |
| Screenshot — Answer panel / QUERY ERROR | `test-results/production-vercel-Chat-pan-a92be-anel-after-successful-query-chromium/test-failed-1.png` |
| Screenshot — CLAIM CONFIDENCE absent / QUERY ERROR | `test-results/production-vercel-Chat-pan-3614c-ppears-after-query-response-chromium/test-failed-1.png` |
| HTML report | `playwright-report/index.html` |
| Raw query response | `query_response.json` (repo root, gitignored) |

---

## Re-running Tests

```bash
# From repo root — run all production tests against live URLs
PLAYWRIGHT_BASE_URL=https://nextgenai-seven.vercel.app \
PLAYWRIGHT_API_URL=https://nextgenai-5bf8.onrender.com \
SKIP_WEBSERVER=true \
npx playwright test e2e/tests/production-vercel.spec.ts \
  --project=chromium --timeout=120000 --reporter=list

# Run only the health and contract tests (fast, no browser needed)
PLAYWRIGHT_BASE_URL=https://nextgenai-seven.vercel.app \
PLAYWRIGHT_API_URL=https://nextgenai-5bf8.onrender.com \
SKIP_WEBSERVER=true \
npx playwright test e2e/tests/production-vercel.spec.ts \
  --project=chromium -g "Backend API"

# Run only the chat tests (after fixing Render 502 / cache)
PLAYWRIGHT_BASE_URL=https://nextgenai-seven.vercel.app \
PLAYWRIGHT_API_URL=https://nextgenai-5bf8.onrender.com \
SKIP_WEBSERVER=true \
npx playwright test e2e/tests/production-vercel.spec.ts \
  --project=chromium -g "Chat panel" --timeout=120000
```


---

## API Performance Optimization Report

> Source: optimize.md (2026-03-06)

# API Performance Optimization Report — NextAgentAI Backend

**Generated:** 2026-03-06
**Analyzer:** Senior Technical Research Advisor (Claude Sonnet 4.6)
**Codebase root:** `backend/`
**Stack:** FastAPI 0.115.6, SQLAlchemy 2.0.36, pgvector 0.3.6, Python 3.11, Anthropic SDK 0.40.0, sentence-transformers 3.3.1

---

## Executive Summary

Five changes will produce the largest measurable latency reductions in this codebase:

1. **Parallelize classify + plan LLM calls** — these two sequential Haiku API round-trips (~500 ms each) can run concurrently via `asyncio.gather`, saving 400–500 ms on every non-`vector_only` query.
2. **Replace the IVFFlat index with HNSW** — pgvector HNSW at default settings delivers 15× higher QPS at equivalent recall versus IVFFlat with probes=10, and removes the mandatory `SET ivfflat.probes` statement issued before every search.
3. **Add an LRU embedding cache for repeated queries** — identical or near-identical queries currently trigger a full 384-dim inference pass (~20–80 ms on CPU); a simple `functools.lru_cache` keyed on the query string eliminates this cost on cache hits.
4. **Switch the orchestrator to fully async** — `orchestrator.run()` and all tools are synchronous, forcing FastAPI to use a thread pool (via `run_in_executor`) or, as currently coded, block the ASGI event loop entirely. Moving to async tools and `asyncio.gather` for independent tool steps unlocks true concurrency.
5. **Switch to `ORJSONResponse` and add `GZipMiddleware`** — orjson serialization is 2–3× faster than stdlib `json` for large agent output dicts; GZip at level 4 reduces wire size for large vector-hit payloads by 60–80%.

Primary risk: items 1 and 4 require rearchitecting the synchronous orchestrator; items 2 and 3 are drop-in changes with no functional risk.

---

## 1. LLM Call Parallelization

### 1-A. Classify + Plan Run Sequentially — No Dependency Between Them

**Impact:** HIGH — saves ~400–500 ms per hybrid/sql/compute query
**File:** `backend/app/agent/orchestrator.py` lines 160–170

**Problem:**

The orchestrator calls `classify_intent()` then `generate_plan()` sequentially. Each is a separate Haiku API call taking ~400–600 ms. The plan call takes `intent` as an input, so there is a dependency — but only for the plan's prompt framing. In practice the plan prompt can be constructed independently and the LLM system prompt already encodes all possible intents. The dependency is soft, not hard.

An alternative: classify and plan can be merged into a single LLM call ("classify and produce a plan in one shot"), cutting two round-trips to one.

**Current code (orchestrator.py, ~line 160):**
```python
intent = classify_intent(query, self._fast_llm, domain=domain)
# ...
plan = generate_plan(query, intent, self._fast_llm, domain=domain)
```

**Recommended approach — merged classify+plan prompt (single Haiku call):**

Create a `classify_and_plan()` function in `agent/planner.py` that returns both `{"intent": ..., "plan_text": ..., "steps": [...]}` in a single LLM call with a combined system prompt. This removes one full network round-trip (the classify call) and one LLM token-generation cycle.

Expected savings: 400–600 ms per query (one fewer Haiku API call).

**Alternative approach — asyncio.gather (if moving to async):**

If the orchestrator is converted to async (see item 4), classify and plan can be fired in parallel as they can both use the query alone — the plan can be validated/filtered by intent after the fact:

```python
intent_coro = classify_intent_async(query, self._fast_llm, domain=domain)
plan_coro = generate_plan_async(query, self._fast_llm, domain=domain)
intent, raw_plan = await asyncio.gather(intent_coro, plan_coro)
# Post-filter plan steps by intent
plan = _filter_plan_by_intent(raw_plan, intent)
```

**Expected impact:** 400–600 ms saved per non-`vector_only` query (which already skips planning).

---

### 1-B. Verify Runs After Synthesis — Can It Be Deferred?

**Impact:** MEDIUM — saves 300–500 ms on queries with 0 or 1 claims
**File:** `backend/app/agent/orchestrator.py` line 364

**Problem:**

`verify_claims()` makes a Haiku call regardless of claim count. When synthesis produces 0 claims (common on no-evidence queries), the verify call still fires.

**Current code:**
```python
verified_claims = verify_claims(raw_claims, all_evidence, self._fast_llm)
```

**Recommended fix:**

Add an early-exit guard before the LLM call in `verifier.py`:
```python
# verifier.py — already has: if not claims: return []
# But orchestrator also calls it when raw_claims is empty due to synthesis failure.
# Add guard in orchestrator:
if raw_claims:
    verified_claims = verify_claims(raw_claims, all_evidence, self._fast_llm)
else:
    verified_claims = []
```

This guard already exists in `verifier.py` line 68 (`if not claims: return []`), but that is inside the function. The orchestrator should short-circuit before constructing the JSON prompt at all, saving serialization overhead.

**Expected impact:** 300–500 ms saved for no-evidence queries (avoids network round-trip entirely).

---

### 1-C. Synthesis LLM Client Created Fresh Each Request

**Impact:** MEDIUM — eliminates repeated httpx connection overhead
**File:** `backend/app/llm/client.py` lines 146–160

**Problem:**

`get_llm_client()` and `get_fast_llm_client()` call `ClaudeClient()` constructor on every invocation. The `ClaudeClient.__init__` creates a new `anthropic.Anthropic()` instance, which instantiates a new underlying httpx connection pool. In `orchestrator.py`, both clients are created once in `__init__` (singleton orchestrator), so this is mostly mitigated. However, any code that calls `get_llm_client()` directly outside the singleton incurs this overhead.

The Anthropic SDK uses httpx under the hood. The `Anthropic` client does maintain connection pooling internally per instance — the key risk is creating multiple short-lived `Anthropic()` instances.

**Recommended fix:**

The current singleton orchestrator in `query.py` (`_get_orchestrator()`) correctly reuses a single `AgentOrchestrator` instance and therefore a single `ClaudeClient`. No change needed here — this is already correct. Document this explicitly.

The one issue: `get_fast_llm_client()` in `client.py` line 155 creates a new `ClaudeClient` each call. If called outside the orchestrator singleton (e.g., future utility code), this leaks connections. Apply module-level caching:

```python
# client.py
_fast_llm_singleton: LLMClient | None = None

def get_fast_llm_client() -> LLMClient:
    global _fast_llm_singleton
    if _fast_llm_singleton is None:
        _fast_llm_singleton = ClaudeClient(model="claude-haiku-4-5-20251001")
    return _fast_llm_singleton
```

**Expected impact:** LOW at present (singleton orchestrator already handles this), but prevents future regressions.

---

### 1-D. Switch ClaudeClient to AsyncAnthropic

**Impact:** HIGH — prerequisite for full async orchestrator
**File:** `backend/app/llm/client.py`

**Problem:**

`ClaudeClient.complete()` calls `self._client.messages.create()` — this is the synchronous Anthropic SDK. When called from within a FastAPI async handler (even via `run_in_executor`), it blocks a thread. The current architecture calls `orchestrator.run()` synchronously from the async `run_query` handler, which means the entire agent loop (multiple LLM calls + DB queries + embedding inference) runs on the thread pool, occupying one uvicorn worker thread for the full duration (typically 3–8 seconds per query).

**Recommended fix:**

Add an async variant to `ClaudeClient`:

```python
from anthropic import AsyncAnthropic

class ClaudeClient(LLMClient):
    def __init__(self, model: str, api_key: str | None = None) -> None:
        key = api_key or os.environ.get("ANTHROPIC_API_KEY", "")
        self._client = anthropic.Anthropic(api_key=key)          # sync
        self._async_client = AsyncAnthropic(api_key=key)          # async
        self.model = model

    async def complete_async(
        self,
        prompt: str,
        system: str = "",
        json_mode: bool = False,
        max_tokens: int | None = None,
    ) -> str:
        # same logic as complete() but using self._async_client
        ...
```

This enables the orchestrator to be converted to async, allowing `asyncio.gather` across independent LLM calls and releasing the event loop during I/O waits.

**Expected impact:** Foundational change — enables items 1-A and 4. On its own: LOW. Combined: HIGH.

---

## 2. pgvector Index Upgrade: IVFFlat to HNSW

**Impact:** HIGH — 5–15× query throughput improvement at equal recall
**File:** `backend/app/rag/retrieval.py`, `backend/app/db/migrations/`

### 2-A. Original IVFFlat Configuration (T-10 complete — HNSW now deployed)

The codebase originally created an IVFFlat cosine index and set `ivfflat.probes = 10` per query (line 113). With probes=10, recall is reasonable but each query must scan 10 IVFFlat clusters. At dataset scale (10,000 incidents × ~3 chunks each = ~30,000 embeddings), the IVFFlat list count at ingest time should be `rows/1000 = 30` lists. If the index was created with the default of 100 lists, probes=10 gives 10% coverage — good recall, mediocre speed.

### 2-B. HNSW is Superior for This Workload

For a read-heavy query workload with an infrequently updated index:
- HNSW at default settings (`m=16`, `ef_construction=64`, `ef_search=40`) achieves >0.99 recall on 384-dim vectors
- HNSW removes the need for the `SET ivfflat.probes` statement on every query (saves one round-trip per search)
- HNSW does not require data to be present at index creation time, unlike IVFFlat which needs ANALYZE after bulk inserts

### 2-C. Migration SQL (Alembic migration)

```python
# New Alembic migration: upgrade()
def upgrade() -> None:
    op.execute("DROP INDEX CONCURRENTLY IF EXISTS incident_embeddings_embedding_idx")
    op.execute("""
        CREATE INDEX CONCURRENTLY incident_embeddings_embedding_hnsw_idx
        ON incident_embeddings
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    """)
    op.execute("DROP INDEX CONCURRENTLY IF EXISTS medical_embeddings_embedding_idx")
    op.execute("""
        CREATE INDEX CONCURRENTLY medical_embeddings_embedding_hnsw_idx
        ON medical_embeddings
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    """)

def downgrade() -> None:
    op.execute("DROP INDEX CONCURRENTLY IF EXISTS incident_embeddings_embedding_hnsw_idx")
    op.execute("DROP INDEX CONCURRENTLY IF EXISTS medical_embeddings_embedding_hnsw_idx")
    # Recreate IVFFlat if needed
```

**Note:** `CREATE INDEX CONCURRENTLY` cannot run inside a transaction. In Alembic, wrap with `op.get_bind().execute()` outside an explicit transaction context, or set `transaction_per_migration = False` in `env.py`. Verify Neon's support for concurrent index creation (Neon supports it as of 2024).

### 2-D. Remove the Per-Query probes SET

After switching to HNSW, remove `retrieval.py` line 113:
```python
session.execute(text("SET ivfflat.probes = 10"))  # DELETE THIS LINE after HNSW migration
```

Instead, set `hnsw.ef_search` at engine level (session startup) or via PostgreSQL config:
```python
# In retrieval.py, after HNSW migration:
session.execute(text("SET hnsw.ef_search = 40"))  # 40 is the default; tune up to 100 for higher recall
```

For Neon (serverless), set this at the connection level since sessions are ephemeral. Consider setting `ef_search` in the SQLAlchemy engine's `connect_args`:
```python
_async_engine = create_async_engine(
    dsn,
    connect_args={"server_settings": {"hnsw.ef_search": "40"}},
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)
```

### 2-E. Recommended HNSW Parameters for This Dataset

| Parameter | Current (IVFFlat) | Recommended (HNSW) | Notes |
|---|---|---|---|
| Index type | `ivfflat` | `hnsw` | HNSW: no training step, better QPS |
| lists / m | Unknown (default 100?) | `m = 16` | Default; increase to 32 for >100k rows |
| probes / ef_construction | Runtime: `SET probes = 10` | `ef_construction = 64` | Build-time only; 2× m minimum |
| ef_search | N/A | 40 (default) | Tune: 20 for speed, 80 for recall |
| Ops | `vector_cosine_ops` | `vector_cosine_ops` | No change |

**Expected impact:** 5–15× QPS improvement on vector search; removes one SQL SET statement per query.

---

## 3. Embedding Cache for Repeated Queries

**Impact:** HIGH on cache hits, LOW otherwise
**File:** `backend/app/rag/embeddings.py`, `backend/app/tools/vector_tool.py`

### 3-A. Problem

`VectorSearchTool.run()` calls `model.encode_single(query_text)` on every invocation. For a CPU-only deployment (Render free tier), `all-MiniLM-L6-v2` inference on a single sentence takes 20–80 ms. Many user queries are repeated or near-identical (e.g., example queries on the frontend all hit the same text).

### 3-B. Recommended Fix — LRU Cache in EmbeddingModel

```python
# embeddings.py
import functools
import hashlib

class EmbeddingModel:
    # ... existing code ...

    @functools.lru_cache(maxsize=512)
    def encode_single_cached(self, text: str) -> tuple:
        """
        Cache up to 512 unique query embeddings.
        Returns a tuple (hashable) rather than numpy array.
        Convert back with: np.array(result, dtype=np.float32)
        """
        vec = self.encode([text])[0]
        return tuple(vec.tolist())
```

Then in `vector_tool.py`:
```python
# Replace:
query_vec = model.encode_single(query_text)

# With:
cached = model.encode_single_cached(query_text)
query_vec = np.array(cached, dtype=np.float32)
```

**Cache key:** The exact query string. LRU with maxsize=512 uses ~512 × 384 × 4 bytes = ~786 KB — negligible memory footprint.

**Caveat:** `lru_cache` is process-local and lost on restart. For multi-worker deployments, use Redis or memcached (medium-term improvement). For Render single-instance deployment, process-local cache is sufficient.

**Expected impact:** 20–80 ms saved per cache-hit query (near-zero embedding latency). Effective for popular example queries and any repeated user queries.

---

## 4. Async Orchestrator Architecture

**Impact:** HIGH — fundamental throughput and concurrency improvement
**File:** `backend/app/agent/orchestrator.py`, `backend/app/api/query.py`

### 4-A. The Core Problem: Blocking the Event Loop

`query.py` line 47:
```python
result = orchestrator.run(body.query, domain=body.domain)
```

`orchestrator.run()` is synchronous. FastAPI runs this in the ASGI thread pool via `run_in_executor` (implicitly, since the route handler is `async def`). Actually, looking at the code more carefully: the route handler IS `async def run_query`, but it calls the sync `orchestrator.run()` directly without `await` or `run_in_executor`. This means the sync call blocks the event loop for the entire 3–8 second agent run duration — preventing any other requests from being processed concurrently on the same worker.

**Correct diagnosis:** The current code has a blocking-sync-call-in-async-handler anti-pattern. Under load, this serializes all requests.

### 4-B. Immediate Fix (Low Risk): Wrap in run_in_executor

Without rearchitecting the orchestrator, add `run_in_executor` to stop blocking the event loop:

```python
# query.py
import asyncio
from fastapi.concurrency import run_in_threadpool

@router.post("/query", response_model=QueryResponse)
async def run_query(body: QueryRequest) -> QueryResponse:
    orchestrator = _get_orchestrator()
    result = await run_in_threadpool(orchestrator.run, body.query, domain=body.domain)
    return QueryResponse(**_normalise_result(result.to_dict()))
```

`run_in_threadpool` is FastAPI's wrapper around `asyncio.get_event_loop().run_in_executor(None, func, *args)`. This releases the event loop during the sync agent run, allowing other requests to proceed concurrently (up to `max_workers` threads in the executor pool, which defaults to `min(32, os.cpu_count() + 4)`).

**Expected impact:** Eliminates event loop blocking; enables true concurrency under load.

### 4-C. Long-term Fix: Full Async Orchestrator

The full rewrite converts every I/O step to async:

```python
async def run(self, query: str, domain: str = "aircraft") -> AgentRunResult:
    # CLASSIFY + PLAN in parallel (see item 1-A)
    async with asyncio.TaskGroup() as tg:
        classify_task = tg.create_task(classify_intent_async(query, self._fast_llm, domain))
        plan_task = tg.create_task(generate_plan_async(query, self._fast_llm, domain))
    intent = classify_task.result()
    plan = plan_task.result()

    # EXECUTE TOOLS — independent vector + SQL steps can run in parallel
    # (VectorSearchTool and SQLQueryTool have no data dependency between them)
    # ...

    # SYNTHESISE + (if needed, EXPAND_GRAPH) — serial dependency
    # ...

    # VERIFY — serial dependency on synthesis output
    # ...
```

**Prerequisite:** Tools must be made async (use `async with get_session()` instead of `get_sync_session()`). The embedding model (`EmbeddingModel.encode_single`) is CPU-bound — wrap with `run_in_executor` for the embedding inference to avoid blocking the event loop.

**Expected impact:** 40–60% total latency reduction on hybrid queries by overlapping classify, plan, and (where possible) vector + SQL tool execution.

---

## 5. Database Connection Pool Tuning

**Impact:** MEDIUM — prevents connection exhaustion under load
**File:** `backend/app/db/session.py`

### 5-A. Current Configuration

```python
# session.py lines 104-109
_async_engine = create_async_engine(
    dsn,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)
```

Total max connections: 10 + 20 = 30.

### 5-B. Issues

**Sync engine has no pool configuration:**
```python
# session.py line 60
_sync_engine = create_engine(dsn, pool_pre_ping=True)
```

This uses SQLAlchemy defaults: `pool_size=5`, `max_overflow=10`, `pool_timeout=30`. The sync engine is used by:
- `VectorSearchTool.run()` — every vector search
- `SQLQueryTool.run()` — every SQL query
- `expand_graph()` — every graph expansion
- `orchestrator.run()` — agent_runs persist
- `query.py GET /runs/{run_id}` — run retrieval

Under concurrent requests (even 3–5), these sync sessions compete for 5 connections. Add explicit pool settings to the sync engine:

```python
_sync_engine = create_engine(
    dsn,
    pool_pre_ping=True,
    pool_size=10,       # up from 5
    max_overflow=10,    # explicit (was default 10)
    pool_timeout=30,
    pool_recycle=1800,  # recycle connections after 30 min (Neon closes idle connections)
)
```

### 5-C. Neon Serverless Consideration

Neon uses connection proxying and may close idle connections. The `pool_pre_ping=True` (already set) handles this, but `pool_recycle=1800` (30 minutes) is a belt-and-suspenders measure. Neon's documentation recommends setting `pool_recycle` for long-running backends.

### 5-D. pool_recycle for Async Engine

Add `pool_recycle` to the async engine:
```python
_async_engine = create_async_engine(
    dsn,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    pool_recycle=1800,  # ADD THIS
    pool_timeout=30,    # ADD THIS (explicit)
)
```

**Expected impact:** Prevents "connection was closed by server" errors after periods of inactivity (common after Render cold starts and Neon idle timeouts). Improves reliability more than raw speed.

---

## 6. SQLAlchemy N+1 Query Risks

**Impact:** MEDIUM — latency spike when relationships are accessed
**File:** `backend/app/db/models.py`

### 6-A. Eager Loading on IncidentReport

`IncidentReport.embeddings` uses `lazy="selectin"` (line 60):
```python
embeddings: list["IncidentEmbedding"] = relationship(
    "IncidentEmbedding",
    back_populates="incident",
    lazy="selectin",
)
```

`lazy="selectin"` means SQLAlchemy fires a secondary `IN` query automatically whenever the `embeddings` attribute is accessed on any `IncidentReport` instance. Since all vector search and retrieval queries use raw `text()` SQL (not ORM queries), this relationship is never triggered during the agent loop — which is correct and efficient.

**Risk:** If any future code loads `IncidentReport` objects via ORM queries (e.g., `session.query(IncidentReport).all()`), the `selectin` load will fire. With 10,000 incidents, this could be a large query. Acceptable as long as ORM-based loads remain bounded.

### 6-B. GraphNode Relationships Use lazy="select"

`GraphNode.outgoing_edges` and `GraphNode.incoming_edges` use `lazy="select"` (lines 141, 147):
```python
outgoing_edges: list["GraphEdge"] = relationship(..., lazy="select")
incoming_edges: list["GraphEdge"] = relationship(..., lazy="select")
```

`lazy="select"` is the classic N+1 trigger: accessing edges on N nodes fires N individual SELECT statements. `graph/expander.py` avoids this by using raw SQL to fetch edges in bulk — good. However, `graph/scorer.py` iterates over `graph_nodes` (dicts, not ORM objects) so this relationship is not loaded there either.

**Risk:** Low for current code paths. If ORM-based graph queries are added, switch to `lazy="joined"` or `lazy="selectin"` explicitly.

### 6-C. IncidentEmbedding.incident Also Uses selectin

`IncidentEmbedding.incident` uses `lazy="selectin"` (line 121). Every time an embedding is loaded via ORM, the parent `IncidentReport` is also fetched. The ingest pipeline (`pipeline.py`) and retrieval module use raw `text()` SQL exclusively, so this is not triggered at runtime.

**Recommendation:** No change needed now. Add a comment in `models.py` flagging that all hot paths must use raw SQL text() queries, not ORM attribute traversal, to avoid triggering these eager loads.

---

## 7. Graph Expander Query Optimization

**Impact:** MEDIUM — reduces latency on large graph expansions
**File:** `backend/app/graph/expander.py`

### 7-A. String Interpolation in SQL (Parameterization)

The expander builds SQL with f-string interpolation for the `IN` clause:
```python
# expander.py lines 77-81
placeholders = ", ".join(f"'{nid}'" for nid in chunk)
result = session.execute(text(f"""
    SELECT id, from_node, to_node, type, weight
    FROM graph_edge
    WHERE from_node IN ({placeholders}) AND type {type_filter}
"""))
```

This pattern:
1. Bypasses SQLAlchemy's parameterized query binding (no SQL injection risk here since IDs are internal UUIDs, but it prevents query plan caching)
2. Issues a new query plan for every unique combination of IDs

**Recommended fix:** Use SQLAlchemy's `bindparam` with `expanding=True`:
```python
from sqlalchemy import bindparam

stmt = text("""
    SELECT id, from_node, to_node, type, weight
    FROM graph_edge
    WHERE from_node = ANY(:node_ids) AND type = ANY(:edge_types)
""")
result = session.execute(stmt, {
    "node_ids": chunk,
    "edge_types": ["mentions", "co_occurrence", "similarity"][:hop_limit],
})
```

Using `= ANY(:array)` with a PostgreSQL array parameter enables query plan reuse and avoids the 100-item CHUNK batching loop entirely. PostgreSQL `= ANY(array)` has no parameter count limit issue unlike `IN (...)` with large lists.

### 7-B. Two Separate Queries for Outgoing + Incoming Edges

For each chunk of frontier nodes, the expander fires two separate queries (outgoing, then incoming). These can be merged:
```sql
SELECT id, from_node, to_node, type, weight
FROM graph_edge
WHERE (from_node = ANY(:node_ids) OR to_node = ANY(:node_ids))
  AND type = ANY(:edge_types)
```

This halves the number of graph expansion queries per hop.

### 7-C. Missing Index on graph_edge.type

`graph_edge.type` is used in every expansion filter (`WHERE type IN (...)`) but is not indexed in `models.py`. Adding a composite index on `(from_node, type)` and `(to_node, type)` would allow PostgreSQL to satisfy both the node-ID filter and the type filter in a single index scan.

```sql
-- New Alembic migration
CREATE INDEX CONCURRENTLY idx_graph_edge_from_type ON graph_edge (from_node, type);
CREATE INDEX CONCURRENTLY idx_graph_edge_to_type   ON graph_edge (to_node, type);
```

**Expected impact:** Combined, these three changes reduce graph expansion latency by 30–50% for graphs with >1,000 nodes.

---

## 8. Ingest Pipeline Optimizations

**Impact:** MEDIUM — reduces ingest time from ~5 min to ~2–3 min
**File:** `backend/app/ingest/pipeline.py`

### 8-A. Row-by-Row Upsert Anti-Pattern

`_upsert_dataframe_sync()` inserts rows one at a time in a loop (line 73):
```python
for row in rows:
    result = session.execute(sql, clean_row)
    inserted += result.rowcount
```

With 10,000+ incidents, this fires 10,000+ individual INSERT statements. SQLAlchemy 2 supports bulk insert with `executemany`:

```python
# Replace the row loop with:
session.execute(sql, [clean_row(r) for r in rows])
session.commit()
```

Or use PostgreSQL's COPY protocol via `psycopg2.copy_expert` for maximum throughput. The `executemany` approach with SQLAlchemy Core will batch statement execution using the DBAPI's native bulk-insert capability.

### 8-B. Embedding Insertion Also Row-by-Row

`_embed_and_store_sync()` lines 142–154 inserts each chunk individually:
```python
for record in batch:
    session.execute(INSERT ..., {**record, "embedding": str(record["embedding"])})
```

Apply the same bulk `executemany` pattern. This is the highest-volume insert operation (10,000 incidents × 3 chunks = ~30,000 rows per ingest).

### 8-C. Graph Build: Per-Row Commits Are Slow

`builder.py` calls `session.commit()` after every chunk's worth of nodes/edges (line 269). For 30,000 chunks, this is 30,000 commits. Batch commits to every 500 or 1,000 rows:

```python
# Replace session.commit() inside the loop with:
if node_count % 500 == 0:
    session.commit()
# Then commit once after the loop:
session.commit()
```

**Expected impact:** Reduces ingest time from ~5 minutes to ~2–3 minutes for a 10k-incident dataset.

---

## 9. FastAPI Response Optimization

**Impact:** MEDIUM for large payloads, LOW for small
**File:** `backend/app/main.py`

### 9-A. Switch to ORJSONResponse

FastAPI's default `JSONResponse` uses Python's stdlib `json.dumps`. For the agent output (which includes up to 8 vector hits × ~500 chars each, plus graph nodes and SQL rows), the payload is typically 5–20 KB. `orjson` is 2–3× faster for serialization at this size.

```python
# main.py — in create_app():
from fastapi.responses import ORJSONResponse

app = FastAPI(
    ...
    default_response_class=ORJSONResponse,
)
```

Then in `requirements.txt`, add:
```
orjson==3.10.12
```

**Note:** `ORJSONResponse` is already available in FastAPI — no new dependency if using `fastapi[all]`, but since you pin FastAPI individually, add `orjson` explicitly.

### 9-B. Add GZipMiddleware

The query response payload (5–20 KB JSON) compresses well (60–80% reduction). Add GZip at level 4 (good speed/size tradeoff):

```python
# main.py — in create_app(), before CORS middleware:
from starlette.middleware.gzip import GZipMiddleware

app.add_middleware(GZipMiddleware, minimum_size=1000, compresslevel=4)
```

GZip only fires when the client sends `Accept-Encoding: gzip`. All modern browsers and `fetch()` calls send this header. Minimum size of 1000 bytes avoids compressing tiny health-check responses.

### 9-C. Add ETag / Cache-Control for /healthz

The `/healthz` endpoint is polled every 30 seconds by the frontend warm-up ping. Add a `Cache-Control: no-store` header (since it represents live state) and consider returning a lightweight response:

```python
@router.get("/healthz")
async def healthz():
    return ORJSONResponse({"status": "ok"}, headers={"Cache-Control": "no-store"})
```

This is already fast but confirms no accidental caching.

**Expected impact:** 20–40% faster JSON serialization; 60–80% wire-size reduction on large payloads for clients with gzip support.

---

## 10. SQL Tool Named Query Optimization

**Impact:** LOW-MEDIUM
**File:** `backend/app/tools/sql_tool.py`

### 10-A. The incidents_defects_join Query Uses ILIKE with Concatenation

```sql
JOIN manufacturing_defects md ON md.product ILIKE '%' || ir.system || '%'
```

This is a non-sargable condition — PostgreSQL cannot use any index on `product` for this join because the pattern is dynamic. On large tables this is a sequential scan join. The query is already `LIMIT 50` so impact is bounded, but consider:

1. Pre-computing the join relationship at ingest time as a materialized view, or
2. Replacing with an exact-match join on a normalized `system` column.

### 10-B. The defect_counts_by_product Query Uses Text Interpolation for INTERVAL

```python
# sql_tool.py line 262
sql = sql.replace(":days days", f"{int(days)} days")
```

This is safe (int cast prevents injection) but bypasses parameterized query planning. PostgreSQL will cache the query plan per-connection only if the query text is identical. Since the `days` value changes the query text, each unique `days` value gets its own plan. For a fixed set of `days` values (the default is always 90), this is effectively a non-issue in practice.

### 10-C. Named Query Results Are Not Cached

SQL aggregation queries (`defect_counts_by_product`, `severity_distribution`) are read-heavy and their underlying data changes only during ingest. These queries run in seconds but could be cached for minutes.

**Recommended approach:** Add a simple TTL cache for named query results:

```python
# sql_tool.py
import functools
import time

_named_query_cache: dict[str, tuple[float, dict]] = {}  # name -> (timestamp, result)
CACHE_TTL_SECONDS = 300  # 5 minutes

def run_named_cached(self, name: str, params: dict | None = None) -> dict:
    cache_key = f"{name}:{params}"
    now = time.monotonic()
    if cache_key in _named_query_cache:
        ts, cached_result = _named_query_cache[cache_key]
        if now - ts < CACHE_TTL_SECONDS:
            return cached_result
    result = self.run_named(name, params)
    _named_query_cache[cache_key] = (now, result)
    return result
```

**Expected impact:** Eliminates DB round-trip for repeated identical SQL queries within the TTL window. Relevant for the frontend dashboard which fires the same aggregation queries repeatedly.

---

## 11. Sentence-Transformer Batch Size Tuning

**Impact:** LOW for query-time, MEDIUM for ingest
**File:** `backend/app/rag/embeddings.py`, `backend/app/ingest/pipeline.py`

### 11-A. Current Batch Size

`EmbeddingModel.encode()` defaults to `batch_size=64` (line 54). `pipeline.py` calls `model.encode(texts)` with batches of 256 texts (line 135, `batch_size=256` in `_embed_and_store_sync`).

For CPU-only inference (Render free tier has no GPU):
- Optimal CPU batch size for `all-MiniLM-L6-v2` is 16–32 (larger batches increase memory pressure with no throughput gain on CPU)
- The current `batch_size=256` passed to `_embed_and_store_sync` controls how many texts are grouped before calling `model.encode()`, but `model.encode()` itself uses `batch_size=64` internally (the SentenceTransformer `batch_size` parameter)

### 11-B. Recommended Settings

For CPU-only Render deployment:
```python
# embeddings.py — change default:
def encode(self, texts: list[str], batch_size: int = 32) -> np.ndarray:  # down from 64
```

For ingest (CPU, many texts):
```python
# pipeline.py line 135:
vectors = model.encode(texts, batch_size=32)  # explicit, down from default 64
```

The memory savings from smaller batches reduce GC pressure on the 512 MB Render free tier.

### 11-C. show_progress_bar Condition

`EmbeddingModel.encode()` shows a progress bar for >500 texts (line 75). On a server with no terminal, this is harmless (tqdm writes to stderr) but slightly wasteful. Consider `show_progress_bar=False` for server deployments:

```python
vectors = self._st_model.encode(
    texts,
    batch_size=batch_size,
    convert_to_numpy=True,
    show_progress_bar=False,   # suppress for server deployment
    normalize_embeddings=True,
)
```

**Expected impact:** Marginal CPU improvement. Primary benefit is reduced memory pressure during ingest on constrained cloud instances.

---

## 12. vector_search Embedding Serialization

**Impact:** MEDIUM — removes unnecessary round-trip conversion
**File:** `backend/app/rag/retrieval.py` line 68

### 12-A. Problem

The query embedding is serialized as a Python list-string before being passed to PostgreSQL:
```python
params: dict[str, Any] = {
    "embedding": str(query_embedding.tolist()),  # converts numpy array → string
    ...
}
# Then in SQL:
CAST(:embedding AS vector)
```

This forces PostgreSQL to parse the string representation of a 384-element float list on every query. The pgvector Python extension (`pgvector==0.3.6`) supports direct numpy array passing via `register_vector()`:

```python
from pgvector.psycopg2 import register_vector  # for psycopg2 sync
# or
from pgvector.asyncpg import register_vector    # for asyncpg async
```

Once registered, you can pass the numpy array directly:
```python
params = {
    "embedding": query_embedding,  # pass numpy array directly
    ...
}
# SQL:
WHERE e.embedding <=> :embedding  # no CAST needed
```

**Prerequisite:** Register the vector type with the connection at engine creation time. In SQLAlchemy, this is done via event listeners:

```python
from sqlalchemy import event
from pgvector.sqlalchemy import Vector  # already imported in models.py

@event.listens_for(engine, "connect")
def on_connect(dbapi_conn, connection_record):
    from pgvector.psycopg2 import register_vector
    register_vector(dbapi_conn)
```

**Expected impact:** Removes string parse overhead on every vector search. Minor but consistent improvement (~2–5 ms per query). More importantly, it corrects a code smell that could cause subtle serialization bugs at scale.

---

## Prioritized Action Plan

Listed in implementation order with effort and risk estimates.

### Phase 1 — Quick Wins (1–2 days, zero risk)

| Priority | Change | File | Effort | Impact |
|---|---|---|---|---|
| 1 | Add `run_in_threadpool` to `run_query` handler | `api/query.py` | 5 min | HIGH |
| 2 | Add LRU embedding cache | `rag/embeddings.py`, `tools/vector_tool.py` | 30 min | HIGH (cache hits) |
| 3 | Add `pool_recycle=1800` to both engines | `db/session.py` | 5 min | MEDIUM |
| 4 | Add explicit pool settings to sync engine | `db/session.py` | 5 min | MEDIUM |
| 5 | Add early-exit guard for empty claims in orchestrator | `agent/orchestrator.py` | 5 min | MEDIUM |
| 6 | Add `ORJSONResponse` as default response class | `main.py`, `requirements.txt` | 15 min | MEDIUM |
| 7 | Add `GZipMiddleware` | `main.py` | 5 min | MEDIUM |

### Phase 2 — Index and Query Improvements (1–3 days, low risk)

| Priority | Change | File | Effort | Impact |
|---|---|---|---|---|
| 8 | Write HNSW migration, drop IVFFlat | New Alembic migration | 2 hrs | HIGH |
| 9 | Remove `SET ivfflat.probes` after HNSW migration | `rag/retrieval.py` | 5 min | LOW |
| 10 | Add composite indexes on `graph_edge(from_node, type)` | New Alembic migration | 30 min | MEDIUM |
| 11 | Merge outgoing+incoming edge queries in expander | `graph/expander.py` | 1 hr | MEDIUM |
| 12 | Add named query result cache in SQLQueryTool | `tools/sql_tool.py` | 1 hr | MEDIUM |
| 13 | Bulk `executemany` upsert in ingest pipeline | `ingest/pipeline.py` | 2 hrs | MEDIUM |

### Phase 3 — Architectural Changes (3–5 days, medium risk)

| Priority | Change | File | Effort | Impact |
|---|---|---|---|---|
| 14 | Add `AsyncAnthropic` to `ClaudeClient` | `llm/client.py` | 2 hrs | Prerequisite |
| 15 | Merge classify+plan into single LLM call | `agent/planner.py`, `agent/intent.py` | 4 hrs | HIGH |
| 16 | Convert orchestrator to async | `agent/orchestrator.py` | 1–2 days | HIGH |
| 17 | Convert tools to async | `tools/*.py`, `graph/expander.py` | 1 day | HIGH |

---

## pgvector Index Reference Card

### Production Configuration — Applied

```sql
-- HNSW indexes are deployed (T-10 complete).
-- Actual index names (differed from assumed names — verified with \d):
--   incident_embeddings: idx_incident_embeddings_hnsw
--   medical_embeddings:  idx_medical_embeddings_hnsw
-- Both created with m=16, ef_construction=64.
-- ef_search=40 set via ALTER DATABASE and via session.py connect_args.
-- IVFFlat indexes (idx_incident_embeddings_vec, idx_medical_embeddings_vec) dropped.
```

### Parameter Tuning Matrix

| Dataset size | m | ef_construction | ef_search | Expected recall |
|---|---|---|---|---|
| <10k rows | 8 | 32 | 20 | >0.97 |
| 10k–100k rows | 16 | 64 | 40 | >0.98 |
| 100k–1M rows | 32 | 128 | 80 | >0.99 |
| >1M rows | 48 | 128 | 100 | >0.99 |

**This codebase target:** 10k incidents × 3 chunks = ~30k rows → use `m=16, ef_construction=64, ef_search=40`.

---

## DB Connection Pool Sizing Reference

### Current State (session.py — T-04 applied)

| Engine | pool_size | max_overflow | pool_timeout | pool_recycle | pool_pre_ping |
|---|---|---|---|---|---|
| Async engine | 10 | 20 | 30 | 1800 | True |
| Sync engine | 10 | 10 | 30 | 1800 | True |

Async engine also sets `connect_args={"server_settings": {"hnsw.ef_search": "40"}}` (T-11).

**Total max connections from backend to Neon: 50.** Neon free tier allows 100 connections. Neon Pro allows 500+. These values are safe for Render single-instance deployment.

**Note:** If migrating to multiple Render instances (horizontal scaling), reduce `pool_size` proportionally to stay within Neon's connection limit, or use PgBouncer (Neon offers this as a built-in connection pooler).

---

## Caching Opportunities Summary

| Cache target | Mechanism | TTL | Scope | Priority |
|---|---|---|---|---|
| Single query embeddings | `functools.lru_cache(maxsize=512)` | Process lifetime | Per-process | HIGH |
| Named SQL query results | Dict with `time.monotonic()` TTL | 300 seconds | Per-process | MEDIUM |
| Agent run results | PostgreSQL `agent_runs` table (already implemented) | Permanent | Cross-process | Done |
| LLM classify/plan output | Not recommended — queries are unique | N/A | — | Skip |

---

## Known Gaps and Open Questions

**[ASSUMPTION]** The IVFFlat index exists in production. The codebase references it in the `retrieval.py` docstring and sets `ivfflat.probes`, but the actual Alembic migration that creates it was not read. Verify with `\d incident_embeddings` in psql before the HNSW migration.

**[ASSUMPTION]** The Render deployment runs a single instance. Pool sizing recommendations assume single-process. Verify at `render.yaml`.

**[NEEDS VERIFICATION]** Neon's support for `CREATE INDEX CONCURRENTLY` — Neon's serverless architecture has transaction semantics that may restrict concurrent index creation. Test on the Neon dev database before running in production. Per Neon docs (neon.com/docs/ai/ai-vector-search-optimization), HNSW creation is supported but may require elevated `maintenance_work_mem`.

**[NEEDS VERIFICATION]** `anthropic==0.40.0` — the version pinned in `requirements.txt`. The `AsyncAnthropic` class has been available since ~0.20.0, so this should work. Confirm with `from anthropic import AsyncAnthropic` import test.

**[GAP]** The `orchestrator.run()` is called from a FastAPI `async def` handler without `await` or `run_in_executor`. This needs urgent confirmation: does FastAPI silently handle this? Answer: No — calling a sync function directly in an async handler blocks the event loop. This is the highest-priority correctness fix, not just a performance optimization.

**[GAP]** The ingest pipeline's `_upsert_dataframe_sync` commits inside the row loop (`session.commit()` line 77). With psycopg2 autocommit off, each commit is a full round-trip. The actual commit count and performance impact depends on row count and Neon latency (typically 5–20 ms per round-trip from Render). At 10,000 rows × 20 ms = 200 seconds of commit overhead — this is likely the dominant ingest bottleneck.

**[ASSUMPTION]** The graph expander's string-interpolated `IN (...)` SQL does not pose SQL injection risk because node IDs are internal UUIDs generated by `uuid.uuid4()`. However, this assumption must hold — any code path that allows user-supplied values to reach `seed_ids` would create an injection vector.

---

## Resource References

- pgvector HNSW parameters — Neon: [neon.com/docs/ai/ai-vector-search-optimization](https://neon.com/docs/ai/ai-vector-search-optimization)
- pgvector HNSW vs IVFFlat deep dive — AWS: [aws.amazon.com/blogs/database/optimize-generative-ai-applications-with-pgvector-indexing](https://aws.amazon.com/blogs/database/optimize-generative-ai-applications-with-pgvector-indexing-a-deep-dive-into-ivfflat-and-hnsw-techniques/)
- pgvector benchmark (15× QPS for HNSW) — Tembo: [legacy.tembo.io/blog/vector-indexes-in-pgvector](https://legacy.tembo.io/blog/vector-indexes-in-pgvector/)
- SQLAlchemy 2 connection pooling — Official docs: [docs.sqlalchemy.org/en/20/core/pooling.html](https://docs.sqlalchemy.org/en/20/core/pooling.html)
- AsyncAdaptedQueuePool and async engine guidance — SQLAlchemy discussion: [github.com/sqlalchemy/sqlalchemy/discussions/10697](https://github.com/sqlalchemy/sqlalchemy/discussions/10697)
- Anthropic AsyncAnthropic client — SDK README: [github.com/anthropics/anthropic-sdk-python](https://github.com/anthropics/anthropic-sdk-python)
- FastAPI run_in_threadpool pattern — FastAPI concurrency docs: [fastapi.tiangolo.com/async](https://fastapi.tiangolo.com/async/)
- ORJSONResponse 20% speedup — benchmark: [undercodetesting.com/boost-fastapi-performance-by-20-with-orjson](https://undercodetesting.com/boost-fastapi-performance-by-20-with-orjson/)
- GZipMiddleware — FastAPI advanced middleware: [fastapi.tiangolo.com/advanced/middleware](https://fastapi.tiangolo.com/advanced/middleware/)
- sentence-transformers batch size guidance — Milvus: [milvus.io/ai-quick-reference/how-can-you-do-batch-processing-of-sentences-for-embedding-to-improve-throughput-when-using-sentence-transformers](https://milvus.io/ai-quick-reference/how-can-you-do-batch-processing-of-sentences-for-embedding-to-improve-throughput-when-using-sentence-transformers)
- asyncio.gather for parallel LLM calls — Instructor blog: [python.useinstructor.com/blog/2023/11/13/learn-async](https://python.useinstructor.com/blog/2023/11/13/learn-async/)
