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