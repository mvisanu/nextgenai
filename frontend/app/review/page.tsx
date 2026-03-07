"use client";

// ============================================================
// review/page.tsx — PhD Review Board Study Interface
// Generated from SKILL.md + full project knowledge
// Flashcard + accordion study format, category filter,
// progress tracker, quick-reference table
// ============================================================

import React, { useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft, BookOpen, ChevronDown, ChevronUp,
  CheckCircle2, Circle, Activity, Brain, Layers,
  Database, GitMerge, Shield, Rocket, Monitor, BarChart2, Stethoscope,
} from "lucide-react";
import { ThemeToggle, FontSizeControl } from "../lib/theme";

// ── Types ──────────────────────────────────────────────────────────────────

interface QA {
  id: string;
  question: string;
  claim: string;
  evidence: string[];
  limitations: string[];
  futureWork: string;
  tags?: string[];
}

interface Category {
  id: string;
  label: string;
  shortLabel: string;
  accentVar: string;
  icon: React.ElementType;
  description: string;
  questions: QA[];
}

// ── Full Q&A bank ──────────────────────────────────────────────────────────

const CATEGORIES: Category[] = [
  // ─────────────────────────────────────────────────────────
  // CATEGORY 1 — Research Motivation & Novelty
  // ─────────────────────────────────────────────────────────
  {
    id: "motivation",
    label: "Research Motivation & Novelty",
    shortLabel: "MOTIVATION",
    accentVar: "--col-green",
    icon: Brain,
    description: "Why this research exists, what gap it addresses, and what makes it novel.",
    questions: [
      {
        id: "q1-1",
        question: "What is the specific research gap your work addresses?",
        claim: "Existing quality management systems treat unstructured narratives, structured defect records, and time-series maintenance logs as separate data silos — no unified agentic interface bridges all three for real-time root-cause hypothesis generation.",
        evidence: [
          "Industry literature (ISO 9001, MES systems) shows analytics and narrative search are handled by separate tools with no cross-modal reasoning layer.",
          "No peer-reviewed system demonstrates LLM-based reasoning over all three modalities simultaneously with traceable tool-call transparency.",
          "The NextAgentAI system routes a single natural-language query through vector search, SQL, and graph traversal — synthesising all results into a cited, auditable response.",
        ],
        limitations: [
          "The gap is demonstrated conceptually and through system design; empirical user studies comparing this system against existing workflows have not yet been conducted.",
        ],
        futureWork: "Longitudinal study with quality engineers measuring time-to-insight and decision accuracy vs. baseline keyword search + spreadsheet workflows.",
      },
      {
        id: "q1-2",
        question: "Why is this considered 'agentic' rather than just a search or analytics tool?",
        claim: "The system qualifies as agentic because the LLM autonomously plans which tools to invoke, sequences multiple tool calls, synthesises cross-modal evidence, and generates recommendations — without the user specifying the retrieval strategy.",
        evidence: [
          "The agent orchestrator maintains a tool registry (search_incidents, query_defects, get_maintenance_metrics, summarize_themes). The LLM decides at inference time which combination to call.",
          "Queries are classified as vector-only, sql-only, or hybrid by an intent router before tool invocation — closer to ReAct (Yao et al., 2022) than a standard RAG pipeline.",
          "The Agent Execution Trace UI panel surfaces every tool call, latency, and output summary — providing process-level auditability of the agent's decisions.",
        ],
        limitations: [
          "The agent's planning is implicit in next-token prediction — not a formal planning algorithm (no PDDL, no Monte Carlo tree search).",
          "Tool selection is prompt-guided and may be inconsistent across runs for ambiguous queries.",
        ],
        futureWork: "Evaluate formal planning frameworks (e.g., LLM+P or ReAct with verification) to improve routing consistency and support multi-step hypothesis chains.",
      },
      {
        id: "q1-3",
        question: "What makes this 'research' rather than just engineering or product work?",
        claim: "The research contribution is the evaluation framework and the novel combination of modalities — not the individual components, which are each established techniques.",
        evidence: [
          "No prior work combines precision@k + latency + cost-per-query + action consistency as a unified eval suite for industrial agentic RAG.",
          "Transparency-first design (tool call traces as first-class UI elements) is a design research contribution for auditable AI in safety-adjacent domains.",
          "The before/after annotated time-series comparison in the Maintenance Trends tab is a novel visualisation primitive for causal hypothesis framing.",
          "The multi-modal fusion architecture (vector + SQL + graph under one agent) provides a generalisable pattern absent from existing industrial AI literature.",
        ],
        limitations: [
          "Individual components (transformers, pgvector, PostgreSQL) are not novel. The novelty is their composition and the evaluation framework around them.",
        ],
        futureWork: "Publish the evaluation protocol as a standalone benchmark to allow reproducibility and community comparison.",
      },
      {
        id: "q1-4",
        question: "Who is the intended user of this system and what is their current workflow?",
        claim: "The primary user is a quality engineer or manufacturing operations analyst who currently uses disconnected tools — keyword search in a document system, Excel pivot tables for defect data, and manual log review for maintenance trends.",
        evidence: [
          "The dashboard's five tabs mirror the five core tasks of a quality engineer: ad-hoc queries, incident investigation, defect analytics, maintenance trend review, and data quality evaluation.",
          "The Chat Interface on the main page replaces the 'open multiple tools and correlate manually' workflow with a single natural-language entry point.",
          "Confidence tags (HIGH/MED/LOW) and recommended actions match the decision-support format quality engineers expect from advisory tools.",
        ],
        limitations: [
          "No formal user research was conducted to validate these personas — they are based on domain literature and the project author's engineering background.",
        ],
        futureWork: "Conduct contextual inquiry sessions with quality engineers at a partner manufacturer to validate and refine the user model.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────
  // CATEGORY 2 — Methodology & Technical Choices
  // ─────────────────────────────────────────────────────────
  {
    id: "methodology",
    label: "Methodology & Technical Choices",
    shortLabel: "METHODOLOGY",
    accentVar: "--col-cyan",
    icon: Layers,
    description: "Justification for each technical decision — vector search, LLMs, SQL, graph, and infrastructure.",
    questions: [
      {
        id: "q2-1",
        question: "Why did you choose vector search over traditional keyword / BM25 search for incident retrieval?",
        claim: "Vector search retrieves semantically similar incidents regardless of phrasing differences — critical in quality engineering where the same failure mode may be described with entirely different vocabulary by different engineers.",
        evidence: [
          "'Seal degradation near actuator' and 'O-ring failure in hydraulic actuator assembly' describe the same failure but share few exact tokens. BM25 scores them as dissimilar; cosine similarity of their embeddings scores them as near-neighbours.",
          "Preliminary demo queries show retrieval clusters aligning with expected failure mode semantics: leak/seal/actuator; harness/chafing/connector; corrosion/fastener/structures.",
          "The Aircraft Historical Maintenance dataset (DS-02) contains free-text technician narratives with high lexical variance — exactly the domain where vector search outperforms BM25.",
        ],
        limitations: [
          "Retrieval quality is sensitive to chunking strategy and embedding model. No head-to-head BM25 vs. vector comparison has been run yet — this is a planned ablation.",
          "Dense retrieval can struggle with rare or highly technical part numbers that appear infrequently in training data.",
        ],
        futureWork: "Hybrid retrieval combining sparse BM25 and dense vector scores (e.g., via reciprocal rank fusion) to capture both lexical precision and semantic recall.",
      },
      {
        id: "q2-2",
        question: "How did you select your embedding model and what are the tradeoffs?",
        claim: "Two candidate models are evaluated: OpenAI text-embedding-3-small (API, 1536-dim) for quality and all-MiniLM-L6-v2 (local, 384-dim) for privacy and cost.",
        evidence: [
          "text-embedding-3-small ranks higher on MTEB benchmarks and provides richer semantic representation for longer incident narratives.",
          "all-MiniLM-L6-v2 runs locally at ~10ms vs. ~100ms API round-trip, has zero cost, and supports air-gapped deployment — critical for manufacturers with data sovereignty requirements.",
          "The config.yaml parameter embedding_model allows runtime switching between the two without code changes.",
        ],
        limitations: [
          "Neither model was fine-tuned on manufacturing or aviation maintenance text. Domain-specific vocabulary (ATA codes, part numbers, fault taxonomies) may not be optimally represented.",
          "1536-dim vs. 384-dim affects FAISS index size and query latency at scale.",
        ],
        futureWork: "Fine-tune all-MiniLM-L6-v2 on domain-specific quality corpora using contrastive learning to improve retrieval precision on industrial terminology.",
      },
      {
        id: "q2-3",
        question: "Why use an LLM for synthesis rather than a rule-based or template system?",
        claim: "Rule-based systems cannot generalise across the combinatorial space of incident types, defect patterns, and maintenance states. LLM synthesis handles novel query/evidence combinations without exhaustive rule authoring.",
        evidence: [
          "A quality engineer may ask 'given this hydraulic leak pattern, what corrective actions were most effective in similar aircraft systems?' — no fixed template can answer this across all incident types.",
          "The LLM synthesises evidence from three heterogeneous tool outputs (vector hits, SQL rows, graph paths) into a coherent narrative — a task that would require hundreds of rule branches to approximate.",
          "The system's cited output format constrains the LLM to ground claims in retrieved data, reducing (though not eliminating) hallucination.",
        ],
        limitations: [
          "LLMs introduce non-determinism. The same query may produce slightly different recommended actions across runs.",
          "Synthesis quality degrades when tool results are sparse or contradictory — the LLM may over-extrapolate.",
        ],
        futureWork: "Evaluate constrained decoding or structured output schemas (e.g., JSON mode) to improve consistency of recommendations across runs.",
      },
      {
        id: "q2-4",
        question: "How do you handle the risk of LLM hallucination in a quality/safety-adjacent context?",
        claim: "Three mitigations are applied: retrieval grounding, citation enforcement, and human-in-the-loop UI design.",
        evidence: [
          "Retrieval grounding: the agent is prompted to base its summary only on tool results returned in context — no parametric knowledge for specific incident claims.",
          "Citation enforcement: the prompt requires the agent to reference specific incident IDs, chunk indices, and metric data points in its output. Inline citation buttons link directly to source chunks.",
          "Human-in-the-loop: confidence tags (HIGH/MED/LOW) and the 'AI-generated hypothesis' label in the UI actively signal that engineer validation is required before action.",
        ],
        limitations: [
          "Prompt-based grounding is not formally verifiable. A fine-tuned model or constrained decoding approach would offer stronger guarantees.",
          "Citation coverage is incomplete — a claim may be partially supported but the LLM may not cite all relevant sources.",
        ],
        futureWork: "Implement attribution scoring: automatically verify that each claim in the synthesis is grounded in at least one retrieved chunk using entailment models.",
      },
      {
        id: "q2-5",
        question: "Why PostgreSQL 16 + pgvector rather than SQLite or a separate vector database?",
        claim: "PostgreSQL 16 with the pgvector extension co-locates structured SQL data and vector embeddings in one ACID-compliant database — eliminating a separate FAISS/Chroma process and enabling hybrid SQL+vector queries in a single transaction.",
        evidence: [
          "The Docker stack uses pgvector/pgvector:pg16 as the database image, giving immediate access to the <-> (cosine distance), <#> (inner product), and <+> (L1 distance) vector operators alongside standard SQL.",
          "pgvector supports HNSW and IVFFlat indexes: CREATE INDEX ON chunks USING hnsw (embedding vector_cosine_ops) — providing sub-millisecond approximate nearest-neighbour search at MVP scale.",
          "Alembic migrations manage the schema (via SQLAlchemy + asyncpg for async ops, psycopg2 for migration-time sync). This gives production-grade schema versioning absent from SQLite.",
          "In production the same PostgreSQL schema runs on Neon (managed serverless PostgreSQL) — so local Docker dev and cloud prod are architecturally identical, avoiding environment drift.",
          "The unified events link table (incident_id, defect_id, maintenance_id) uses PostgreSQL foreign keys with ON DELETE CASCADE — referential integrity impossible to enforce in SQLite without triggers.",
        ],
        limitations: [
          "pgvector's HNSW index builds are memory-intensive for very large corpora (>10M vectors). At that scale, dedicated vector databases (Weaviate, Qdrant) offer better throughput.",
          "asyncpg requires careful connection pool tuning (min_size, max_size) to avoid exhaustion under concurrent agent requests.",
        ],
        futureWork: "Evaluate pg_embedding (Neon's native HNSW extension) vs. pgvector for latency at the 1M-vector scale, and add TimescaleDB for native time-series compression on maintenance_logs.",
      },
      {
        id: "q2-6",
        question: "How does the SQL guardrail system work and why is it necessary?",
        claim: "The SQLQueryTool enforces a SELECT-only allowlist: it parses every incoming query for prohibited statement types (DROP, DELETE, UPDATE, INSERT, ALTER, EXEC) and rejects them before execution.",
        evidence: [
          "The guardrail is implemented as a statement-type classifier in src/tools_sql.py that inspects the parsed AST before any database connection is opened.",
          "This is critical because the LLM generates SQL dynamically — a prompt injection or adversarial query could otherwise issue destructive database commands.",
          "All pre-built analytical queries (defect counts by product, severity distributions, maintenance trends) are read-only by design.",
        ],
        limitations: [
          "Static allowlist checking can be bypassed by sufficiently creative SQL injection (e.g., stacked queries, comment obfuscation). A parameterised query interface would be more robust.",
          "The guardrail does not limit computational cost — a SELECT with a Cartesian join could still time out or exhaust memory.",
        ],
        futureWork: "Implement query cost estimation and timeout limits alongside the allowlist check. Evaluate query sandboxing (read-only database replica) as an additional layer.",
      },
      {
        id: "q2-7",
        question: "How does the agent's intent router classify queries, and what are the three routing paths?",
        claim: "The intent router uses semantic classification to assign each query to one of three paths — vector-only, sql-only, or hybrid — before any tool is invoked.",
        evidence: [
          "Vector-only: queries asking for similar incidents, narratives, or experiences ('find incidents similar to hydraulic leak in landing gear').",
          "SQL-only: queries asking for counts, trends, aggregates, or structured comparisons ('defect rate by production line last 90 days').",
          "Hybrid: queries requiring both semantic retrieval and structured data ('given this incident description, classify the defect type and show trend for that type').",
          "The routing decision is surfaced in the Agent Execution Trace panel as the INTENT badge (VECTOR / SQL / HYBRID / COMPUTE).",
        ],
        limitations: [
          "Intent classification is performed by the LLM itself — making it subject to the same non-determinism as the synthesis step.",
          "Ambiguous queries may be misrouted, leading to incomplete evidence for the synthesis step.",
        ],
        futureWork: "Train a lightweight intent classifier (e.g., a fine-tuned BERT model) on labelled query examples to provide deterministic, auditable routing.",
      },
      {
        id: "q2-8",
        question: "Why React Flow (@xyflow/react) for the knowledge graph visualisation?",
        claim: "React Flow provides a production-ready interactive graph rendering library with built-in zoom, pan, minimap, and custom node type support — significantly reducing implementation complexity vs. D3 from scratch.",
        evidence: [
          "The knowledge graph requires two custom node types (entity: circular purple nodes, chunk: cyan rectangles) with popover detail panels on click — React Flow's nodeTypes API supports this directly.",
          "The layout algorithm (entity nodes top row, chunk nodes bottom row) is computed from the GraphRAG path data returned by the backend's graph_path field.",
          "Edge labels (relationship type + weight) and directional arrows are rendered natively by React Flow's edge system.",
        ],
        limitations: [
          "React Flow's flat layout algorithm does not handle large graphs (>200 nodes) gracefully. Force-directed or hierarchical layout would be needed for production-scale knowledge graphs.",
          "The current layout is computed client-side — no persistent graph position state between sessions.",
        ],
        futureWork: "Integrate a force-directed layout engine (e.g., elkjs or d3-force) for automatic graph layout, and add node clustering for large knowledge graphs.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────
  // CATEGORY 3 — Data & Evaluation
  // ─────────────────────────────────────────────────────────
  {
    id: "data",
    label: "Data & Evaluation",
    shortLabel: "DATA & EVAL",
    accentVar: "--col-amber",
    icon: Database,
    description: "Dataset validity, evaluation metrics, baselines, and the three Kaggle datasets.",
    questions: [
      {
        id: "q3-1",
        question: "Your dataset is synthetic/Kaggle — how can you make valid research claims?",
        claim: "Synthetic and public datasets are appropriate for MVP system validation and framework development. The research contribution is the architecture and evaluation methodology — not specific numeric results on proprietary data.",
        evidence: [
          "Significant NLP/IR research (MS MARCO, SQuAD, BEIR benchmarks) uses curated or synthetic datasets. Research value lies in the method, not the data.",
          "Results are framed as 'evidence-backed hypotheses' — explicitly acknowledged in every dashboard output with 'DEMO — SYNTHETIC DATA' headers.",
          "The system is data-agnostic: config.yaml paths are the only coupling between the system and any specific dataset.",
        ],
        limitations: [
          "Precision@k and recommendation quality validated on Kaggle data. Generalization to real industrial incidents is unproven.",
          "Synthetic data may lack the noise, ambiguity, and edge cases found in real quality records.",
        ],
        futureWork: "Phase 2 partner deployment with a manufacturer using real quality records, with appropriate data governance and IRB-equivalent ethics review.",
      },
      {
        id: "q3-2",
        question: "How did you define and measure precision@k? Why is it the right metric?",
        claim: "Precision@k measures the proportion of top-k retrieved incidents judged relevant by a domain expert. It is the right metric because the task is ranked retrieval, not binary classification.",
        evidence: [
          "Protocol: define 20–50 test queries → retrieve top-k=5 incidents → expert labels each as relevant/not-relevant → Precision@5 = relevant results / 5.",
          "Simpler than NDCG or MRR which require graded relevance judgments — appropriate for MVP evaluation scope.",
          "The Data & Evaluation tab (Tab 05) displays offline evaluation results including relevance scores, latency, and PASS/FAIL status for each benchmark query.",
        ],
        limitations: [
          "Annotation is subjective and requires domain knowledge. Inter-annotator agreement has not been formally measured.",
          "Precision@5 does not capture ranking quality within the top-5 — NDCG would be more informative for a full study.",
        ],
        futureWork: "Expand to a full IR evaluation suite (NDCG, MRR, MAP) with multiple annotators and published inter-annotator agreement scores.",
      },
      {
        id: "q3-3",
        question: "What is your baseline for comparison?",
        claim: "The baseline is keyword search (BM25) over the same incident corpus — the current state of practice in most quality management systems.",
        evidence: [
          "BM25 is used in the majority of enterprise document search systems and represents the standard that quality engineers currently use.",
          "Planned comparison: BM25 precision@k vs. vector precision@k on the same query set; time-to-first-relevant-result; coverage of semantically similar incidents that keyword search misses.",
        ],
        limitations: [
          "Baseline comparison is a planned study. The MVP demonstrates the agentic workflow end-to-end; rigorous comparative evaluation is Phase 2.",
          "Without the baseline comparison, the precision@k numbers cannot yet be interpreted as improvements — only as absolute performance figures.",
        ],
        futureWork: "Implement BM25 retrieval (via rank_bm25 Python library) over the same corpus and run the full evaluation protocol on both systems simultaneously.",
      },
      {
        id: "q3-4",
        question: "Describe the three Kaggle datasets used in the MVP and their specific role.",
        claim: "Three complementary datasets cover the three data modalities: manufacturing defects (structured SQL), aircraft maintenance logs (narrative vector + SQL + graph), and sensor-based defect prediction (quantitative SQL + graph).",
        evidence: [
          "DS-01 — Manufacturing Defects (fahmidachowdhury): ~10K structured defect records. Powers the manufacturing_defects SQL table, defect-by-type analytics, and embeds corrective_action narratives into the vector index.",
          "DS-02 — Aircraft Historical Maintenance 2012–2017 (merishnasuwal): ~25K maintenance events. The action_taken free-text field is the primary vector index source. Structured columns feed maintenance_logs SQL. Aircraft/system/part relationships populate the knowledge graph.",
          "DS-03 — Predicting Manufacturing Defects (rabieelkharoua): ~55K sensor readings with binary defect outcomes. Powers quantitative SQL queries (temperature vs. defect correlation), yield rate analytics, and provides ground-truth defect labels for evaluation benchmarking.",
        ],
        limitations: [
          "DS-02 is aviation-domain; the MVP applies it as a proxy for general industrial maintenance. Domain transfer to other industries has not been validated.",
          "DS-03's sensor data is independent of DS-01/DS-02 — the events link table uses fuzzy key matching (date/product/system) which may introduce false joins.",
        ],
        futureWork: "Replace Kaggle proxy data with partner-provided real quality records across all three modalities to validate cross-dataset join accuracy.",
      },
      {
        id: "q3-5",
        question: "How are incident narratives chunked before embedding, and why does chunking strategy matter?",
        claim: "Incident narratives are chunked into 300–600 token segments with 50–100 token overlap, balancing sufficient context for semantic coherence against embedding model context limits.",
        evidence: [
          "Chunk size of 300–600 tokens typically covers one complete incident description or one maintenance action narrative — the natural semantic unit for retrieval.",
          "50–100 token overlap ensures that phrases spanning chunk boundaries are not split, preventing retrieval misses at boundaries.",
          "Each chunk stores metadata (incident_id, date, system, severity) alongside the vector, enabling metadata-filtered retrieval without a separate lookup.",
        ],
        limitations: [
          "Optimal chunk size is domain-dependent. Aviation maintenance narratives may be longer than manufacturing defect descriptions — a fixed chunk size may not suit both.",
          "Chunking is currently fixed at ingest time. Dynamic chunking based on sentence boundaries or paragraph structure would be more semantically principled.",
        ],
        futureWork: "Evaluate semantic chunking (split at sentence/paragraph boundaries) vs. fixed-token chunking on retrieval precision@k for both narrative types.",
      },
      {
        id: "q3-6",
        question: "What does the Data & Evaluation tab measure and how should results be interpreted?",
        claim: "Tab 05 tracks two parallel quality dimensions: dataset health (ingestion completeness, schema conformance) and offline evaluation (retrieval precision, answer relevance, latency per benchmark query).",
        evidence: [
          "Dataset health table: row counts, null rates, schema validation status, and last-ingest timestamp for each of the three datasets — a data quality dashboard.",
          "Offline evaluation table: each benchmark query shows a relevance score (0–1), response latency (ms), cost estimate, and PASS/FAIL against a minimum threshold.",
          "PASS/FAIL thresholds are configurable — enabling researchers to tighten standards as the system matures.",
        ],
        limitations: [
          "The offline eval uses synthetic benchmark queries, not real user queries. Real-world query distribution may differ significantly.",
          "Cost estimates are approximations based on token counts — actual API billing may vary.",
        ],
        futureWork: "Log real user queries (with consent) and incorporate them into the evaluation benchmark to close the synthetic/real distribution gap.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────
  // CATEGORY 4 — Limitations & Ethics
  // ─────────────────────────────────────────────────────────
  {
    id: "limitations",
    label: "Limitations & Ethics",
    shortLabel: "LIMITATIONS",
    accentVar: "--col-red",
    icon: Shield,
    description: "Honest acknowledgment of system boundaries, ethical considerations, and responsible AI design choices.",
    questions: [
      {
        id: "q4-1",
        question: "What are the most significant limitations of your current system?",
        claim: "Five honest limitations must be proactively acknowledged: synthetic data ceiling, chunking sensitivity, LLM non-determinism, no causal inference, and MVP-scale infrastructure.",
        evidence: [
          "Synthetic data ceiling: precision@k validated on Kaggle data only. Generalization to real industrial incidents is unproven.",
          "Chunking sensitivity: retrieval quality varies substantially with chunk size and overlap — a hyperparameter requiring domain-specific tuning.",
          "LLM non-determinism: the same query may produce different recommended actions across runs, complicating reproducibility and consistency evaluation.",
          "No causal inference: the system identifies correlational patterns in retrieved evidence. It cannot establish causality between process parameters and defect outcomes.",
          "Scale: pgvector's IVFFlat/HNSW indexes perform well at MVP scale but require tuning (lists, ef_construction, m parameters) for corpora exceeding 1M vectors.",
        ],
        limitations: [],
        futureWork: "Address each limitation in sequence: (1) real-data partner study, (2) chunking ablation, (3) structured output for consistency, (4) causal inference layer, (5) vector database migration (Weaviate/Pinecone).",
      },
      {
        id: "q4-2",
        question: "What are the ethical considerations of deploying AI recommendations in quality/safety engineering?",
        claim: "Four key ethical considerations apply: accountability ambiguity, automation bias risk, data privacy, and mechanistic opacity — each addressed through design choices in the system.",
        evidence: [
          "Accountability: the system is explicitly positioned as advisory. No action can be taken automatically — all recommendations require engineer sign-off.",
          "Automation bias: confidence tags (HIGH/MED/LOW), 'AI-generated hypothesis' labelling, and the tool-call trace panel are designed to actively encourage critical evaluation rather than passive acceptance.",
          "Data privacy: incident narratives may contain proprietary or PII. The local embedding option (all-MiniLM-L6-v2) addresses this for privacy-sensitive deployments.",
          "Mechanistic opacity: tool call traces provide process transparency (what the agent did) but not mechanistic transparency (why the LLM made a specific inference).",
        ],
        limitations: [
          "Transparency features reduce but do not eliminate automation bias — empirical user studies are needed to validate their effectiveness.",
          "No formal privacy impact assessment has been conducted for the Kaggle datasets used in the MVP.",
        ],
        futureWork: "Commission a formal AI ethics review before any production deployment. Implement differential privacy techniques for embedding storage in multi-tenant scenarios.",
      },
      {
        id: "q4-3",
        question: "How do you distinguish between correlation and causation in your system's outputs?",
        claim: "The system explicitly frames all outputs as 'evidence-backed hypotheses' — not causal conclusions — and the UI language reinforces this at every point of output.",
        evidence: [
          "Answer outputs use hedged language: 'incidents with similar characteristics suggest…', 'a pattern is observed between X and Y' — never 'X causes Y'.",
          "The Maintenance Trends before/after comparison shows temporal correlation around corrective actions, not causal attribution.",
          "The confidence meter in the Citations Drawer reflects retrieval similarity, not causal certainty.",
        ],
        limitations: [
          "Users with domain expertise may infer causality from strong correlational evidence — the UI framing cannot fully prevent this cognitive step.",
          "The system does not implement any formal causal inference framework (DAGs, do-calculus, instrumental variables).",
        ],
        futureWork: "Integrate causal discovery algorithms (e.g., PC algorithm or LiNGAM) over the structured defect + sensor data to move from correlational to causal hypothesis ranking.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────
  // CATEGORY 5 — System Architecture
  // ─────────────────────────────────────────────────────────
  {
    id: "architecture",
    label: "System Architecture",
    shortLabel: "ARCHITECTURE",
    accentVar: "--col-purple",
    icon: GitMerge,
    description: "End-to-end architecture — backend stack, data layer, tool system, agent orchestration, and API.",
    questions: [
      {
        id: "q5-1",
        question: "Describe the overall end-to-end system architecture.",
        claim: "The system is a three-layer architecture: a data/vector layer (PostgreSQL 16 + pgvector), an agent/tool layer (LLM orchestrator + four tools), and a presentation layer (Next.js 15 + FastAPI).",
        evidence: [
          "Data layer: PostgreSQL 16 (pgvector/pgvector:pg16) hosts three canonical tables (incident_reports, manufacturing_defects, maintenance_logs) + a unified events link table + vector embeddings stored directly in a chunks table with an HNSW index via pgvector.",
          "Schema management: Alembic migrations with SQLAlchemy models; asyncpg driver for async FastAPI endpoints; psycopg2 for migration-time synchronous execution. Production database: Neon (managed serverless PostgreSQL).",
          "Agent layer: an intent router classifies each query → invokes SQLQueryTool, VectorSearchTool, GraphRAGTool, or any combination → a synthesis LLM generates a cited response with run_summary metadata.",
          "Presentation layer: Next.js 15 App Router frontend (React, Tailwind, shadcn/ui) consuming a FastAPI backend via /api/query and /api/chunk endpoints. Deployed: Vercel (frontend) + Render (backend) + Neon (database).",
        ],
        limitations: [
          "The MVP runs as a monolith — all layers in a single Python process. Horizontal scaling requires decomposition into microservices.",
          "No authentication or multi-user session isolation — the MVP is single-user by design.",
        ],
        futureWork: "Decompose into independently scalable services: a retrieval service, an agent service, and a data ingestion pipeline with event-driven triggers.",
      },
      {
        id: "q5-2",
        question: "What is GraphRAG and how is it applied in this project?",
        claim: "GraphRAG augments standard RAG by replacing or supplementing the flat vector index with a knowledge graph — enabling multi-hop relationship queries that flat retrieval cannot answer.",
        evidence: [
          "The knowledge graph stores entities (aircraft IDs, systems, fault codes, part numbers) and chunks (narrative segments) as nodes, connected by typed edges (mentions, similarity, co_occurrence).",
          "A graph traversal query can answer 'what other aircraft share this fault code pattern?' by following edges — something that vector similarity cannot do because it operates on individual chunk embeddings, not relationships.",
          "The ReactFlow knowledge graph visualisation surfaces the graph path used in each response — making the multi-hop reasoning transparent.",
        ],
        limitations: [
          "The knowledge graph is static — built at ingest time. It does not update dynamically when new incidents are added without re-ingestion.",
          "Graph entity extraction relies on heuristic rules and LLM-based NER — both sources of noise in entity identification.",
        ],
        futureWork: "Replace static graph construction with continuous entity extraction from incoming incidents using an online NER pipeline feeding a graph database (Neo4j or Kuzu).",
      },
      {
        id: "q5-3",
        question: "How does the events link table work and why is it architecturally important?",
        claim: "The events link table is a unified cross-reference that connects records from all three domain tables using fuzzy keys (date, product, system, part) — enabling cross-modal queries without hardcoded foreign keys.",
        evidence: [
          "An incident in incident_reports may relate to a defect in manufacturing_defects if they share the same product_id and a proximate date range — the events table captures this fuzzy link.",
          "Without this link table, cross-modal queries (e.g., 'show the defect record associated with this maintenance event') would require ad-hoc JOIN logic in every query.",
          "The link table enables the hybrid query path: vector retrieval finds the incident → the link table resolves the defect → SQL retrieves the structured metrics.",
        ],
        limitations: [
          "Fuzzy key matching introduces false positives (incorrect links) and false negatives (missed links). The matching threshold is a configurable hyperparameter.",
          "The link table must be regenerated whenever any source table is updated — creating a data consistency dependency.",
        ],
        futureWork: "Apply entity resolution techniques (blocking + classification) to improve link accuracy, and implement incremental link table updates on new data ingestion.",
      },
      {
        id: "q5-4",
        question: "How does the citation system work end-to-end, from LLM output to source chunk?",
        claim: "Citations are inline numbered references [1], [2]… in the LLM's answer that link directly to specific vector-retrieved chunks via a /api/chunk endpoint — making every claim traceable to a source document segment.",
        evidence: [
          "The LLM synthesis prompt requires inline citation numbers referencing specific claim objects returned by the vector tool.",
          "Each claim object carries citations: [{incident_id, chunk_id, char_start, char_end}] — enabling the CitationsDrawer to highlight the exact sentence within the source chunk.",
          "The sidebar drawer fetches the raw chunk text from /api/chunk, displays metadata (system, severity, date, asset), and renders a highlighted excerpt with a confidence meter.",
        ],
        limitations: [
          "The LLM may generate a citation number without a corresponding claim object — a hallucinated citation reference. The UI handles this gracefully by hiding orphaned citation buttons.",
          "char_start/char_end character offsets are approximate and may shift slightly depending on the chunking implementation.",
        ],
        futureWork: "Implement automated citation verification: after synthesis, check each claim against its cited chunk using an entailment model to flag unsupported claims.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────
  // CATEGORY 6 — Frontend & UX
  // ─────────────────────────────────────────────────────────
  {
    id: "frontend",
    label: "Frontend & UX Design",
    shortLabel: "FRONTEND",
    accentVar: "--col-blue",
    icon: Monitor,
    description: "Design decisions for the dashboard, visualisations, transparency features, and study interfaces.",
    questions: [
      {
        id: "q6-1",
        question: "Why was an industrial SCADA control-room aesthetic chosen for the UI?",
        claim: "The SCADA aesthetic directly communicates the system's domain (industrial quality engineering) and its operational nature — signalling to users that this is a serious monitoring and analysis tool, not a consumer chatbot.",
        evidence: [
          "SCADA interfaces are the established visual language of industrial operations — quality engineers and plant operators immediately recognise the panel-based layout, status indicators, and monospace data typography.",
          "The dark void background with phosphor-green accents evokes terminal and CRT monitor aesthetics — reinforcing the 'intelligence layer over raw industrial data' metaphor.",
          "Panel headers, corner bracket decorators, and pulsing status dots are direct references to HMI (Human-Machine Interface) design conventions in industrial automation.",
        ],
        limitations: [
          "The industrial aesthetic may be unfamiliar to users from non-manufacturing backgrounds. Contextual onboarding (the FAQ page) partially addresses this.",
          "High-contrast dark mode can cause eye strain in long sessions — the light mode (warm ivory theme) provides an alternative.",
        ],
        futureWork: "Conduct usability testing with quality engineers specifically to measure whether the SCADA aesthetic aids domain comprehension or introduces cognitive friction.",
      },
      {
        id: "q6-2",
        question: "What are the five dashboard tabs and what distinct analytical purpose does each serve?",
        claim: "The five tabs map to the five core analytical tasks of a quality engineer: ad-hoc agent queries, incident investigation, defect analytics, maintenance trends, and data/evaluation health.",
        evidence: [
          "Tab 01 — Ask the Agent: natural-language query interface with suggested queries, similarity scores, confidence-tagged recommended actions, and collapsible tool-call trace.",
          "Tab 02 — Incident Explorer: live-filtered incident list with search, system/severity/date filters, and a split-panel detail view with full narrative and corrective action.",
          "Tab 03 — Defect Analytics: KPI cards (total YTD, critical count, top defect type) + four recharts charts (vertical bar, stacked bar, weekly trend line, horizontal defect type bar).",
          "Tab 04 — Maintenance Trends: asset selector, line chart with corrective-action reference line, before/after comparison charts, MTBF metrics.",
          "Tab 05 — Data & Evaluation: dataset health table + offline evaluation benchmark table with relevance scores, latency, and PASS/FAIL status.",
        ],
        limitations: [
          "The tabs are currently independent — no cross-tab navigation (e.g., clicking a defect in Tab 03 does not pre-filter Tab 02). Cross-tab linking would improve analytical flow.",
        ],
        futureWork: "Implement cross-tab state sharing: selecting a defect type in Tab 03 filters the incident list in Tab 02 and pre-populates a query in Tab 01.",
      },
      {
        id: "q6-3",
        question: "How does the Agent Execution Trace transparency panel work and why is it a research contribution?",
        claim: "The Agent Execution Trace renders every tool call in the agent's run as a sequenced timeline — showing tool type, latency, output summary, and error state — making the agent's decision process auditable without requiring users to read logs.",
        evidence: [
          "Each step in the RunSummary response includes: step_number, tool_name, latency_ms, output_summary, and error. These are rendered as a vertical circuit-trace timeline.",
          "Tool badges are colour-coded by type (VEC=cyan, SQL=green, PY=amber, GRF=purple) allowing instant visual classification of the agent's tool mix.",
          "The INTENT badge (VECTOR/SQL/HYBRID/COMPUTE) at the top of the trace shows the agent's overall routing decision — a first-class transparency signal.",
        ],
        limitations: [
          "The trace shows what the agent did, not why. The LLM's internal reasoning for selecting a particular tool sequence is not surfaced.",
          "In the current MVP, the trace is populated only after the full response is returned — not streaming/progressive.",
        ],
        futureWork: "Stream the trace in real time as each tool completes, and explore chain-of-thought extraction to surface the agent's reasoning alongside its tool calls.",
      },
      {
        id: "q6-4",
        question: "How does the light/dark mode implementation work and why was it prioritised?",
        claim: "Theme switching is implemented via CSS custom properties and a localStorage-persisted class toggle on the HTML element, with an anti-flash inline script that applies the saved theme before React hydrates.",
        evidence: [
          "All colours use hsl(var(--col-*)) and hsl(var(--bg-*)) CSS variables — zero hardcoded colour values in any component. Switching the HTML class from .dark to .light re-resolves all variables instantly.",
          "The anti-flash inline script in <head> reads localStorage and applies the class before the first paint — preventing the dark→light flash that degrades perceived quality.",
          "Light mode uses warm ivory backgrounds (#f3ede0 equivalent) with darkened accent colours for legibility — not a simple colour inversion.",
        ],
        limitations: [
          "Server-side rendering (Next.js) cannot access localStorage — the anti-flash script is a client-side-only workaround and adds a small HTML payload.",
          "Light mode accent colours (reduced saturation/lightness) were hand-tuned — no automated contrast-ratio verification was performed.",
        ],
        futureWork: "Add a system preference auto-detect mode (prefers-color-scheme media query) and verify all colour combinations meet WCAG AA contrast ratios.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────
  // CATEGORY 7 — Future Work & Contributions
  // ─────────────────────────────────────────────────────────
  {
    id: "future",
    label: "Future Work & Contributions",
    shortLabel: "FUTURE WORK",
    accentVar: "--col-amber",
    icon: Rocket,
    description: "Research roadmap, broader field contributions, and the path from MVP to production.",
    questions: [
      {
        id: "q7-1",
        question: "Where does this research go next? Describe the near, medium, and long-term roadmap.",
        claim: "The roadmap follows three phases: framework validation (6–12 months), production deployment and causal inference (1–2 years), and federated/closed-loop systems (3+ years).",
        evidence: [
          "Near-term: head-to-head BM25 vs. vector retrieval ablation; user study with quality engineers; fine-tuning embedding on domain vocabulary; WCAG accessibility audit.",
          "Medium-term: partner deployment with real industrial data; causal inference layer (causal discovery algorithms over sensor + defect data); multi-lingual incident retrieval for global manufacturing.",
          "Long-term: closed-loop system where agent recommendations feed back into defect prevention workflows with outcome tracking; federated deployment with privacy-preserving similarity search across plants.",
        ],
        limitations: [
          "Each phase depends on securing either research funding, a partner organisation, or both — which are external dependencies outside the research team's control.",
        ],
        futureWork: "Publish the Phase 1 evaluation protocol as an open benchmark to build community interest and attract potential partner organisations.",
      },
      {
        id: "q7-2",
        question: "How does this work contribute to the broader field of AI for industrial applications?",
        claim: "Three transferable contributions: a repeatable evaluation framework for industrial agentic RAG, a transparency-first design pattern for safety-adjacent AI, and a multi-modal fusion architecture applicable beyond quality engineering.",
        evidence: [
          "Evaluation framework: precision@k + latency + cost + consistency protocol for agentic RAG in industrial settings — currently absent from the literature.",
          "Transparency-first design: demonstrates that tool call traces can serve as practical auditability without full mechanistic interpretability — applicable to medical, legal, and financial AI systems.",
          "Multi-modal fusion: the vector + SQL + graph architecture pattern is applicable to EHR analysis (clinical notes + lab values + patient timelines), legal discovery (documents + case records + precedent graphs), and financial audit (narratives + transactions + entity networks).",
        ],
        limitations: [
          "Contributions are demonstrated on manufacturing/aviation data. Cross-domain applicability is argued by architectural analogy, not empirical transfer study.",
        ],
        futureWork: "Apply the same architecture and evaluation framework to one adjacent domain (e.g., EHR quality auditing) to empirically demonstrate generalizability.",
      },
      {
        id: "q7-3",
        question: "How would you scale this system from MVP to a production deployment handling real enterprise data?",
        claim: "Six architectural changes are required: database migration, vector database upgrade, microservice decomposition, authentication/RBAC, data governance, and monitoring/observability.",
        evidence: [
          "Database: already on PostgreSQL 16 + pgvector. Phase 2 adds TimescaleDB extension for native time-series compression on maintenance_logs and read replicas for query throughput.",
          "Vector index: flat FAISS → Weaviate, Pinecone, or Qdrant for billion-scale vector search with metadata filtering and replication.",
          "Microservices: monolith → separate ingestion, retrieval, agent, and presentation services with API contracts — enabling independent scaling.",
          "Auth/RBAC: add OAuth2 + role-based access control so different engineers have appropriate data visibility.",
          "Data governance: audit logging, data retention policies, PII detection in incident narratives before embedding.",
          "Observability: structured agent run logging, cost tracking per query, and anomaly alerts for retrieval quality degradation.",
        ],
        limitations: [
          "Each of these changes represents significant engineering work beyond the research scope. A dedicated MLOps team would be required for production deployment.",
        ],
        futureWork: "Partner with an MLOps platform (e.g., Databricks, Azure AI) to manage the production infrastructure while the research team focuses on the agent and evaluation layers.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────
  // CATEGORY 8 — Rapid-fire Defend-Your-Choice
  // ─────────────────────────────────────────────────────────
  {
    id: "defend",
    label: "Rapid-fire: Defend Your Choice",
    shortLabel: "QUICK DEFENSE",
    accentVar: "--col-green",
    icon: BarChart2,
    description: "One-line defenses for the most commonly challenged decisions — know these cold.",
    questions: [
      {
        id: "q8-1",
        question: "Why Next.js 15 for the frontend rather than a simpler static site or Python Streamlit app?",
        claim: "Next.js App Router provides server-side rendering, file-based routing, and TypeScript support — giving production-quality structure to the dashboard while remaining deployable as a static export alongside the Python backend.",
        evidence: [
          "Streamlit would limit UI customisation — the SCADA industrial aesthetic with custom CSS variables, React Flow, and recharts would be impossible to achieve.",
          "Next.js 15 App Router's layout system (layout.tsx → nested pages) enables the shared ThemeProvider, RunProvider context, and header components used across the main app, dashboard, FAQ, data, and review pages.",
        ],
        limitations: ["Next.js adds build complexity vs. Streamlit — justified only if the UI quality is a research deliverable, which it is here."],
        futureWork: "Evaluate whether a lighter framework (SvelteKit or Astro) could achieve the same result with less build overhead.",
      },
      {
        id: "q8-2",
        question: "Why FastAPI rather than Flask or Django for the backend?",
        claim: "FastAPI's automatic OpenAPI documentation, async support, and Pydantic schema validation make it the most appropriate Python web framework for a research API — enabling rapid iteration with type-safe contracts.",
        evidence: [
          "Pydantic models enforce the QueryResponse schema (answer, claims, evidence, run_summary, graph_path) at the API boundary — critical for maintaining contract consistency between backend and frontend.",
          "Async endpoints support concurrent tool calls without blocking — important when the agent invokes multiple tools in the hybrid path.",
        ],
        limitations: ["Django REST Framework would offer more built-in features (ORM, admin, auth) but with significantly more configuration overhead for a research MVP."],
        futureWork: "Add automatic API contract testing (schemathesis or Dredd) to catch frontend/backend schema drift early.",
      },
      {
        id: "q8-3",
        question: "Why recharts for dashboard charts rather than D3, Plotly, or Vega?",
        claim: "recharts is a React-native charting library with declarative API and TypeScript support — providing production-quality charts with minimal implementation overhead vs. imperative D3.",
        evidence: [
          "D3 requires imperative DOM manipulation that conflicts with React's virtual DOM rendering model — recharts wraps D3 internally with a React component API.",
          "Plotly.js adds ~3MB bundle overhead for features not needed in this dashboard. recharts is ~300KB and covers all required chart types (BarChart, LineChart, ReferenceLine, ResponsiveContainer).",
        ],
        limitations: ["recharts is less flexible than D3 for custom visualisations. The knowledge graph (React Flow) and any future custom charts would need D3 directly."],
        futureWork: "Evaluate Observable Plot for its declarative API and smaller bundle size in a future UI performance audit.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────
  // CATEGORY 9 — RAG Algorithms & Mathematical Formulas
  // ─────────────────────────────────────────────────────────
  {
    id: "rag-algorithms",
    label: "RAG Algorithms & Formulas",
    shortLabel: "RAG MATH",
    accentVar: "--col-cyan",
    icon: Monitor,
    description: "The mathematical foundations of retrieval-augmented generation — cosine similarity, embeddings, BM25, precision@k, and pgvector index types.",
    questions: [
      {
        id: "q9-1",
        question: "What is the cosine similarity formula and how does pgvector use it for retrieval?",
        claim: "Cosine similarity measures the angle between two embedding vectors regardless of their magnitude — a value of 1.0 means identical direction (semantically equivalent), 0.0 means orthogonal (unrelated).",
        evidence: [
          "Formula: cos(θ) = (A · B) / (‖A‖ × ‖B‖)  where A · B = Σ(aᵢ × bᵢ) is the dot product and ‖A‖ = √(Σaᵢ²) is the L2 norm.",
          "pgvector exposes this as the <-> distance operator: SELECT id, 1 - (embedding <-> query_vec) AS score FROM chunks ORDER BY embedding <-> query_vec LIMIT 5;  — lower <-> distance = higher cosine similarity.",
          "When vectors are L2-normalised (‖v‖ = 1), cosine similarity equals the dot product: A · B = cos(θ). Many embedding models output normalised vectors, making dot-product search and cosine search equivalent.",
          "The HNSW index (CREATE INDEX ON chunks USING hnsw (embedding vector_cosine_ops)) enables approximate nearest-neighbour search in O(log n) rather than O(n) brute-force scan.",
        ],
        limitations: [
          "Cosine similarity ignores vector magnitude — two texts with very different specificity but similar topic direction get the same score.",
          "HNSW is approximate: setting ef_search too low trades recall for speed. ef_search=64 is a common starting point; tune against your precision@k target.",
        ],
        futureWork: "Implement a re-ranking step (cross-encoder model) after cosine retrieval to refine top-k results with a more expensive but more accurate similarity computation.",
        tags: ["math", "pgvector", "cosine"],
      },
      {
        id: "q9-2",
        question: "What is the embedding pipeline — how does text become a vector?",
        claim: "Embedding converts raw text into a fixed-dimension dense vector by passing tokens through a transformer encoder and pooling the hidden states. The resulting vector encodes semantic meaning in its direction.",
        evidence: [
          "Step 1 — Tokenise: split text into subword tokens using a BPE or WordPiece vocabulary (e.g., 'maintenance' → ['main', '##ten', '##ance']). Each token maps to an integer ID.",
          "Step 2 — Encode: feed token IDs through N transformer layers. Each layer applies multi-head self-attention: Attention(Q,K,V) = softmax(QKᵀ / √dₖ) × V, mixing contextual information across all tokens.",
          "Step 3 — Pool: collapse the sequence of hidden states to one vector. Common strategies: [CLS] token (BERT-style), mean pooling over all tokens, or max pooling. Mean pooling over non-padding tokens is most robust.",
          "Step 4 — Normalise: divide by L2 norm so ‖v‖ = 1. Required for cosine similarity via dot product and for consistent pgvector <-> distances.",
          "The resulting vector (e.g., 768-dim for all-MiniLM-L6-v2, 1536-dim for text-embedding-3-small) is stored in PostgreSQL as a vector(768) column type and indexed by HNSW.",
        ],
        limitations: [
          "Embedding models have a context window (typically 512 tokens). Text longer than this must be chunked — introducing a boundary sensitivity problem.",
          "Embeddings encode meaning at training time. Domain-specific jargon (e.g., 'MRO', 'AOG', 'MTBF') may be poorly represented in general-purpose models; fine-tuning or domain-adapted models help.",
        ],
        futureWork: "Fine-tune a sentence-transformer on domain incident reports to improve retrieval of manufacturing-specific terminology.",
        tags: ["embedding", "transformer", "math"],
      },
      {
        id: "q9-3",
        question: "What are the HNSW and IVFFlat pgvector index types and when should you use each?",
        claim: "HNSW (Hierarchical Navigable Small World) and IVFFlat (Inverted File with Flat quantisation) are both approximate nearest-neighbour indexes in pgvector — HNSW offers better recall at query time; IVFFlat offers faster build time and lower memory footprint.",
        evidence: [
          "HNSW builds a multi-layer proximity graph. Traversal starts at a random entry-point at the top layer and greedily follows edges toward the query vector, descending layers until the bottom. Query time: O(log n). Build time: O(n log n). Memory: high (stores graph edges).",
          "HNSW key parameters: m (edges per node, default 16 — higher = better recall, more memory) and ef_construction (search width during build, default 64 — higher = better graph quality, slower build).",
          "IVFFlat partitions vectors into lists (Voronoi cells). At query time only the nearest probes lists are scanned. Key parameters: lists (number of clusters, rule of thumb: √n) and probes (lists to scan at query time, higher = better recall, slower).",
          "Rule of thumb: use HNSW when query latency matters most and memory is available; use IVFFlat when index build time or memory is constrained (e.g., embedded devices or very large corpora).",
        ],
        limitations: [
          "Neither index supports exact nearest-neighbour search — they are approximate. For safety-critical decisions, always validate top-k results with a post-retrieval confidence check.",
          "HNSW index cannot be built concurrently with writes in older pgvector versions; use maintenance_work_mem settings to control build memory.",
        ],
        futureWork: "Benchmark HNSW (m=16, ef=64) vs IVFFlat (lists=100, probes=10) on the full 3-dataset corpus and report recall@10 to select the production index type.",
        tags: ["pgvector", "hnsw", "ivfflat", "index"],
      },
      {
        id: "q9-4",
        question: "What is BM25 and how does it compare to embedding-based retrieval?",
        claim: "BM25 (Best Match 25) is a probabilistic keyword-ranking function that scores documents by term frequency saturation and document-length normalisation — complementary to embeddings because it excels at exact keyword and rare-term matching.",
        evidence: [
          "BM25 formula: score(D,Q) = Σᵢ IDF(qᵢ) × [ f(qᵢ,D) × (k₁+1) ] / [ f(qᵢ,D) + k₁ × (1 - b + b × |D|/avgdl) ]",
          "Where: f(qᵢ,D) = term frequency of query term qᵢ in document D; |D| = document length; avgdl = average document length in corpus; k₁ ∈ [1.2,2.0] controls TF saturation (prevents high-freq terms dominating); b ∈ [0,1] controls length normalisation (b=0.75 typical).",
          "IDF (Inverse Document Frequency): IDF(qᵢ) = ln( (N - n(qᵢ) + 0.5) / (n(qᵢ) + 0.5) + 1 )  — rare terms score higher; common terms score lower.",
          "Hybrid retrieval (BM25 + cosine embedding) consistently outperforms either method alone. Reciprocal Rank Fusion (RRF) merges ranked lists: RRF_score(d) = Σₖ 1/(rank_k(d) + 60). This is the recommended production approach.",
          "pgvector handles the vector side; PostgreSQL full-text search (pg_trgm or tsvector/tsquery) handles the BM25 side, both in the same database.",
        ],
        limitations: [
          "BM25 requires exact or morphologically similar term matches — it cannot find 'turbine bearing failure' given query 'rotating component degradation' (embedding can).",
          "BM25 weights must be recomputed when the corpus changes significantly (IDF shifts with new documents).",
        ],
        futureWork: "Implement hybrid search with RRF fusion: retrieve top-50 by BM25 and top-50 by cosine, merge via RRF, re-rank with a cross-encoder, return top-10.",
        tags: ["bm25", "keyword", "hybrid", "math"],
      },
      {
        id: "q9-5",
        question: "How is precision@k calculated and why is it the primary evaluation metric?",
        claim: "Precision@k measures what fraction of the top-k retrieved results are actually relevant — a direct measure of retrieval quality that aligns with how a quality engineer uses the system: they read the first k results and expect them to be on-topic.",
        evidence: [
          "Formula: Precision@k = |{relevant documents} ∩ {retrieved top-k documents}| / k",
          "Example: if k=5 and 3 of the top-5 retrieved chunks are judged relevant by a human annotator, Precision@5 = 3/5 = 0.60.",
          "Precision@k is chosen over recall@k because the system returns a fixed small set (k=5 or k=10) — maximising precision in that window is more important than finding every relevant chunk in the corpus.",
          "Evaluation protocol: for each test query, a human judge labels each retrieved chunk as relevant (1) or not (0). Precision@k is averaged over all test queries to give mean Precision@k (mP@k).",
          "Related metric — NDCG@k (Normalised Discounted Cumulative Gain): weights relevant results higher if they appear earlier in the ranking. NDCG@k = DCG@k / IDCG@k where DCG@k = Σᵢ relᵢ / log₂(i+1). Planned for Phase 2.",
        ],
        limitations: [
          "Precision@k ignores ranking order within the top-k (a relevant result at position 1 and position k score equally). NDCG addresses this.",
          "Binary relevance labels oversimplify: a chunk that is partially relevant receives 0, distorting the metric. Graded relevance (0/1/2) with NDCG is more accurate.",
        ],
        futureWork: "Expand evaluation to NDCG@10 with graded relevance and add a separate recall@50 to measure coverage of the full relevant set.",
        tags: ["evaluation", "precision", "metric", "math"],
      },
      {
        id: "q9-6",
        question: "What is TF-IDF and where does the project use it?",
        claim: "TF-IDF (Term Frequency — Inverse Document Frequency) weights terms by their local frequency in a document relative to how rare they are across the corpus — producing sparse feature vectors that capture keyword importance without embeddings.",
        evidence: [
          "TF formula: TF(t,d) = count(t in d) / total_terms(d)  — normalised frequency of term t in document d.",
          "IDF formula: IDF(t) = log( N / (1 + df(t)) )  where N = total documents, df(t) = documents containing term t. Rare terms get high IDF; stop words ('the', 'and') approach 0.",
          "TF-IDF(t,d) = TF(t,d) × IDF(t)  — the product rewards terms that appear frequently in d but rarely elsewhere in the corpus.",
          "Project use: TF-IDF is used in the theme extraction step of GraphRAG — identifying the most discriminative terms in each incident cluster to label knowledge graph nodes. scikit-learn's TfidfVectorizer provides this in two lines of Python.",
          "TF-IDF also serves as a fast baseline for retrieval quality comparison: if cosine-embedding retrieval cannot beat TF-IDF+cosine retrieval, the embedding model choice needs revisiting.",
        ],
        limitations: [
          "TF-IDF produces high-dimensional sparse vectors (vocabulary-sized, often 50K+). Unlike dense embeddings, these cannot capture synonymy or paraphrase — 'failure' and 'breakdown' score as unrelated.",
        ],
        futureWork: "Use TF-IDF cluster labels as seed terms for a topic model (LDA or BERTopic) to auto-generate knowledge graph node labels at ingest time.",
        tags: ["tfidf", "keyword", "graphrag", "math"],
      },
      {
        id: "q9-7",
        question: "How does the RAG pipeline flow end-to-end — from user query to cited answer?",
        claim: "RAG has six deterministic stages: encode query → retrieve chunks → filter by metadata → assemble context → synthesise with LLM → extract citations. Each stage is independently testable.",
        evidence: [
          "Stage 1 — Encode: query_text → embedding model → query_vec (same model used at ingest time, so vectors are in the same space).",
          "Stage 2 — Retrieve: SELECT id, text, metadata, 1-(embedding <-> query_vec) AS score FROM chunks WHERE score > threshold ORDER BY score DESC LIMIT k; — returns top-k chunks with scores.",
          "Stage 3 — Filter: apply metadata filters (date range, severity, system_id) as SQL WHERE clauses alongside the vector search — pgvector supports this natively.",
          "Stage 4 — Assemble: concatenate retrieved chunk texts into a context window: [SYSTEM PROMPT] + [CHUNK_1: text + metadata] + ... + [CHUNK_k] + [USER QUERY]. Total must fit within LLM context window (e.g., 128K tokens for Claude).",
          "Stage 5 — Synthesise: LLM receives assembled context and generates answer grounded in provided chunks. Temperature=0 for reproducibility in production.",
          "Stage 6 — Cite: LLM is instructed to include chunk IDs in its response. Backend parses these to populate the evidence[] array in the QueryResponse schema, which the frontend renders in the CitationsDrawer.",
        ],
        limitations: [
          "Retrieval quality gates synthesis quality — a well-written LLM prompt cannot compensate for poor chunk retrieval. Precision@k is the leading indicator to optimise first.",
          "Context window stuffing: if k is too high, early chunks are forgotten (LLM 'lost-in-the-middle' problem). k=5 to k=10 is recommended; re-rank to prioritise highest-score chunks first.",
        ],
        futureWork: "Add a query expansion step before Stage 1: use the LLM to generate 3 alternative phrasings of the query, retrieve for each, merge results with RRF — improving recall for ambiguous queries.",
        tags: ["rag", "pipeline", "architecture"],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────
  // CATEGORY 10 — Pain Points & Problem Statement
  // ─────────────────────────────────────────────────────────
  {
    id: "pain-points",
    label: "Pain Points & Problem Statement",
    shortLabel: "PAIN POINTS",
    accentVar: "--col-amber",
    icon: Rocket,
    description: "The real-world engineering problems this system solves — what quality engineers suffer without it and the measurable improvements it delivers.",
    questions: [
      {
        id: "q10-1",
        question: "What is the core problem that NextAgentAI solves for quality and maintenance engineers?",
        claim: "Quality engineers waste 40–60% of investigation time manually correlating evidence across disconnected silos — incident reports in text files, defect counts in spreadsheets, and maintenance logs in CMMS systems. NextAgentAI collapses this into a single natural-language query.",
        evidence: [
          "Before: an engineer investigating a recurring bearing failure must (1) keyword-search the incident narrative database, (2) query the defect tracking system with SQL or a BI tool, (3) pull maintenance logs from CMMS, (4) manually cross-reference dates, asset IDs, and part numbers across all three — a process taking hours to days.",
          "After: the same investigation is a single query — 'Find similar bearing failure incidents and show defect trends for asset A-227 over the last 90 days' — answered in seconds with citations from all three data sources.",
          "The hybrid tool routing (vector → semantic match of narrative text; SQL → structured defect aggregation; GraphRAG → entity relationships across datasets) mirrors the mental model engineers already use, reducing cognitive overhead.",
          "Evidence from adjacent literature: NIST studies of industrial maintenance show that knowledge retrieval and correlation account for 35–55% of diagnostic cycle time in unstructured MRO environments.",
        ],
        limitations: [
          "Time-saving estimates are based on domain literature, not controlled user studies with this system. A formal user study (Task Completion Time, NASA-TLX cognitive load scale) is required for Phase 2.",
          "The system does not eliminate the engineer — it accelerates evidence gathering. Final decisions remain human-in-the-loop.",
        ],
        futureWork: "Run a comparative study: 10 quality engineers solve 5 investigation tasks with and without the system, measuring time-to-insight, accuracy of root-cause identification, and cognitive load.",
        tags: ["problem", "value", "roi"],
      },
      {
        id: "q10-2",
        question: "What are the three data silos the project bridges and why is that bridging hard?",
        claim: "The three silos — incident narratives (unstructured text), manufacturing defects (structured metadata), and maintenance logs (time-series events) — resist integration because they have different schemas, different query paradigms, and different temporal granularities.",
        evidence: [
          "Incident narratives require semantic (vector) search — keyword search misses paraphrasing ('seal degradation' vs 'gasket deterioration'). No SQL schema can capture the full narrative.",
          "Defect metadata (product, type, severity, line, timestamp) is inherently structured and best queried with aggregation SQL (GROUP BY, COUNT, AVG over time windows). Natural language cannot reliably express these aggregations.",
          "Maintenance logs are time-series: failure events, MTBF calculations, and trend detection require ordered temporal queries (LAG, LEAD, rolling windows) — neither text search nor simple SQL GROUP BY is sufficient.",
          "The link table (events) uses fuzzy matching on (date ± 3 days, product_code, system_id) to bridge records without requiring a shared primary key across source systems — a common real-world constraint where legacy systems cannot be modified.",
        ],
        limitations: [
          "Fuzzy linking introduces false positives: two unrelated events on the same date and product can be incorrectly linked. Precision of the link table degrades as data volume grows.",
          "The current schema assumes three fixed data sources. A real enterprise CMMS + QMS + ERP integration would require ETL pipelines with schema mapping, change data capture, and data quality checks.",
        ],
        futureWork: "Replace fuzzy key linking with entity resolution models (Splink or dedupe) that learn probabilistic match weights from labelled training pairs.",
        tags: ["silos", "integration", "architecture"],
      },
      {
        id: "q10-3",
        question: "What is the 'black box' problem in industrial AI and how does NextAgentAI address it?",
        claim: "Industrial AI deployed without explainability creates liability and compliance risk — quality engineers cannot act on a recommendation they cannot audit. NextAgentAI's transparency-first design makes every claim traceable to its source evidence.",
        evidence: [
          "Every agent response includes a run_summary with the intent classification, tools invoked, tool latencies, and confidence levels — visible in the AgentTimeline component.",
          "Every claim in the synthesised answer is linked to specific chunk IDs (incident report excerpts) and SQL rows — visible in the CitationsDrawer. Engineers can click through to the original record.",
          "The GraphRAG visualisation shows which entity nodes and chunk nodes contributed to the answer, allowing engineers to spot missing connections or misattributed evidence.",
          "ISO 9001 and AS9100 quality management standards require documented evidence for non-conformance decisions. CitationsDrawer output is designed to be copy-pasted into NCR documentation.",
        ],
        limitations: [
          "Citation granularity is at the chunk level, not the sentence level. A chunk may contain both relevant and irrelevant sentences, making fine-grained attribution imprecise.",
          "The system cannot prove that the LLM synthesis is faithful to the retrieved evidence (hallucination detection). Confidence tags are heuristic, not formally verified.",
        ],
        futureWork: "Add faithfulness scoring: for each sentence in the LLM answer, run a Natural Language Inference (NLI) model to verify it is entailed by at least one retrieved chunk (entailment ratio metric).",
        tags: ["explainability", "trust", "transparency"],
      },
      {
        id: "q10-4",
        question: "How does the system reduce time-to-insight for recurring failure investigations?",
        claim: "By pre-indexing all incident narratives as vector embeddings at ingest time, the system converts O(n) manual keyword search + manual reading into O(log n) approximate nearest-neighbour retrieval — reducing investigation from hours to seconds for the retrieval phase.",
        evidence: [
          "Traditional keyword search: engineer tries multiple search terms, reads each result, discards irrelevant ones. For a corpus of 10K incidents, this takes 30–90 minutes per investigation.",
          "Vector retrieval: query embedded once (< 100ms), HNSW index scanned (< 10ms), top-5 most semantically similar incidents returned with relevance scores. The engineer reviews 5 pre-filtered, ranked results.",
          "SQL aggregation replaces manual pivot-table construction: 'defect counts by product and type over the last 90 days' is a 3-line SQL query executed in < 200ms vs. 20–40 minutes of CMMS export + Excel analysis.",
          "The agent's hybrid path combines both in one response — something that was previously impossible without a custom BI integration project costing weeks of engineering time.",
        ],
        limitations: [
          "Time savings assume the corpus is fully ingested and indexed. Initial ingest (embedding generation for 10K incidents) takes 30–60 minutes depending on the embedding model and hardware.",
          "The system retrieves similar incidents — it does not guarantee they share the same root cause. Engineers must still apply domain expertise to interpret the evidence.",
        ],
        futureWork: "Add a temporal clustering view: automatically group retrieved incidents by time period to help engineers distinguish recurring chronic failures from one-off events.",
        tags: ["time-to-insight", "roi", "search"],
      },
      {
        id: "q10-5",
        question: "What types of questions can an engineer ask that were previously impossible or very slow?",
        claim: "The agent enables three classes of question that were previously intractable: (1) semantic similarity queries over narrative text, (2) multi-modal correlation queries spanning all three data sources, and (3) hypothesis-framing queries that combine retrieval with LLM reasoning.",
        evidence: [
          "Class 1 — Semantic: 'Find all incidents where a seal or gasket degradation caused a production stop' — impossible with keyword search if the corpus uses inconsistent terminology.",
          "Class 2 — Multi-modal: 'Given this bearing failure incident, what are the defect trends for this part number and are there maintenance events in the 30 days prior?' — previously required three separate tool queries and manual correlation.",
          "Class 3 — Hypothesis: 'Given this incident text, classify the defect type and recommend a maintenance action' — requires LLM synthesis over retrieved evidence; no BI tool can do this.",
          "These question types align with the three intent routes: vector-only (Class 1), hybrid (Class 2), and synthesis-heavy hybrid (Class 3) — the intent router selects the appropriate path automatically.",
        ],
        limitations: [
          "The system cannot answer questions requiring real-time sensor data, live ERP inventory queries, or calculations outside its tool set (e.g., statistical process control limits).",
          "Complex multi-step reasoning ('If we change the maintenance interval from 30 to 45 days, what is the predicted impact on defect rate?') requires causal inference not yet implemented.",
        ],
        futureWork: "Add a simulation tool: given a maintenance parameter change, use historical defect data to estimate the distribution shift in defect rate using a Bayesian update.",
        tags: ["use-cases", "capabilities", "examples"],
      },
      {
        id: "q10-6",
        question: "Who is the target user and what is their current workflow pain level?",
        claim: "The primary user is a quality or reliability engineer with domain expertise but limited data-science skill — someone who understands manufacturing processes deeply but cannot write SQL joins or vector queries. Current workflow pain is high: evidence is fragmented, retrieval is slow, and synthesis is manual.",
        evidence: [
          "Persona: Quality Engineer at a Tier-1 automotive or aerospace supplier. Tools currently used: CMMS (e.g., SAP PM, IBM Maximo), quality management system (Excel/SharePoint), incident tracking (Jira/Confluence or paper-based). None of these have semantic search or cross-system correlation.",
          "Pain point 1 — Fragmented evidence: related data lives in 3+ disconnected systems. Cross-referencing requires manual export, data cleaning, and pivot analysis.",
          "Pain point 2 — Slow retrieval: keyword search in incident databases returns too many false positives or misses semantic matches. Engineers spend more time filtering results than analysing them.",
          "Pain point 3 — Manual synthesis: after gathering evidence, the engineer must write the root-cause narrative and recommended actions entirely from memory and notes — with no AI assistance.",
          "The SCADA industrial aesthetic of the UI is a deliberate design decision: it communicates operational seriousness and domain fit to this user population, increasing adoption likelihood vs. a generic 'chat with your data' interface.",
        ],
        limitations: [
          "User research with actual quality engineers has not been conducted. The persona is derived from domain literature and the project author's domain knowledge. Formal user testing is a Phase 2 requirement.",
        ],
        futureWork: "Conduct contextual inquiry interviews with 5 quality engineers at manufacturing firms to validate pain points, refine the query interface, and identify missing tool capabilities.",
        tags: ["user", "persona", "design"],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────
  // CATEGORY 11 — Medical Domain Extension
  // ─────────────────────────────────────────────────────────
  {
    id: "medical",
    label: "Medical Domain Extension",
    shortLabel: "MEDICAL",
    accentVar: "--col-cyan",
    icon: Stethoscope,
    description: "Why and how the system extends from aircraft/manufacturing to clinical case intelligence — dual-domain architecture, medical pipeline, ethics, and evaluation.",
    questions: [
      {
        id: "q11-1",
        question: "Why extend the system to the medical domain and what research value does that add?",
        claim: "Extending to clinical case intelligence demonstrates that the multi-modal agentic RAG architecture is domain-agnostic — the same vector, SQL, and graph tool chain applies to any domain where unstructured narratives, structured records, and temporal patterns co-exist.",
        evidence: [
          "Clinical case management shares the identical trimodal structure: case narratives (vector search), disease/symptom records (SQL aggregation), and longitudinal patient cohort trends (time-series analysis) — directly parallel to the aircraft domain's three silos.",
          "The dual-domain pivot from the single paper 'AI for quality engineering' to 'generalised agentic RAG for safety-critical multi-modal data' significantly broadens the research contribution and publication scope.",
          "Medical AI is a high-stakes domain where LLM transparency and hallucination mitigation are not optional — validating the system there strengthens the trust arguments made for the manufacturing domain.",
          "The MACCROBAT clinical NER dataset and a synthetic fallback pipeline (200 cases across 5 specialties) provide a structured evaluation corpus without requiring access to protected health information.",
        ],
        limitations: [
          "The medical pipeline uses synthetic clinical case narratives — not real patient records. Generalisability to production EHR data is unproven and would require IRB approval and HIPAA-compliant infrastructure.",
          "Clinical NLP is a specialised field; the all-MiniLM-L6-v2 embedding model is not fine-tuned on medical terminology (ICD codes, SNOMED CT, clinical abbreviations). A domain-adapted model (BioBERT, ClinicalBERT) would substantially improve retrieval quality.",
        ],
        futureWork: "Evaluate BioBERT vs. all-MiniLM-L6-v2 retrieval precision@k on the clinical case corpus. Partner with a hospital informatics team for IRB-approved pilot on de-identified discharge summaries.",
        tags: ["medical", "motivation", "domain-transfer"],
      },
      {
        id: "q11-2",
        question: "How does the medical data pipeline work and how is it different from the aircraft pipeline?",
        claim: "The medical pipeline generates 200 synthetic clinical case narratives across 5 specialties using template-based NLP, embeds them with IVFFlat indexing, and populates both a medical_cases narrative table and a disease_records structured table — a direct parallel to aircraft incident_reports and manufacturing_defects.",
        evidence: [
          "Pipeline structure: (1) MACCROBAT CSV loader attempts real clinical NER data; (2) synthetic fallback generates cases across Cardiac, Respiratory, Neurological, Gastrointestinal, and Musculoskeletal specialties with realistic symptom distributions; (3) narrative chunks are embedded and stored in medical_embeddings; (4) structured symptom/outcome data is written to disease_records.",
          "The disease_records table includes boolean symptom flags (fever, cough, fatigue, difficulty_breathing), demographic fields (age, gender), vitals (blood_pressure, cholesterol_level), and outcome (Positive/Negative) — enabling structured SQL aggregation analogous to manufacturing_defects GROUP BY queries.",
          "Medical embeddings use IVFFlat indexing (lists=100) rather than HNSW — IVFFlat builds faster and is appropriate for the smaller corpus size (~800 chunks), while HNSW provides better recall at scale for the larger aircraft corpus.",
          "The entrypoint.sh seeds aircraft and medical data as independent steps — each checks its own table row count, so neither pipeline blocks the other and both are idempotent on repeated container restarts.",
        ],
        limitations: [
          "Template-based synthesis produces structurally realistic but clinically limited cases. Real clinical narratives have far greater linguistic diversity, abbreviation density, and cross-referential complexity.",
          "IVFFlat requires the index to be trained on representative data; with 800 chunks and lists=100, the index is effectively brute-force — HNSW would be more appropriate if the corpus grew beyond ~5,000 chunks.",
        ],
        futureWork: "Replace synthetic generation with MIMIC-III or i2b2 de-identified clinical notes (requires data access agreement). Evaluate ClinicalBERT embeddings vs. all-MiniLM-L6-v2 on case retrieval tasks.",
        tags: ["medical", "pipeline", "architecture", "embedding"],
      },
      {
        id: "q11-3",
        question: "What are the ethical and regulatory considerations unique to deploying AI in the medical domain?",
        claim: "Medical AI carries substantially higher ethical and regulatory obligations than manufacturing AI — FDA Software as a Medical Device (SaMD) classification, HIPAA data governance, clinical liability, and automation bias in life-critical decisions require explicit architectural and policy responses.",
        evidence: [
          "FDA SaMD guidance (2021) classifies clinical decision support software by risk level. A tool that retrieves similar cases and generates treatment hypotheses may qualify as a Class II or III medical device requiring 510(k) clearance or PMA — a legal threshold that must be assessed before any clinical deployment.",
          "HIPAA requires that patient data used for AI training and retrieval is de-identified under Safe Harbor or Expert Determination standards. The current system's synthetic data avoids this, but any production deployment requires a formal data governance review.",
          "Automation bias in medical AI is particularly dangerous: a clinician who over-trusts an AI case match may anchor to an incorrect diagnosis. The UI must communicate 'this is a decision-support tool only' with stronger regulatory-grade disclaimers than the manufacturing equivalent.",
          "The dual-domain design explicitly labels all medical outputs as 'AI-generated hypotheses — consult a qualified clinician.' The confidence tier system (HIGH/MEDIUM/LOW) and full tool-call trace are mitigations, not guarantees.",
          "Unlike quality engineering, medical errors can be fatal. The human-in-the-loop requirement is non-negotiable and must be enforced by product design, not just documented in fine print.",
        ],
        limitations: [
          "The current implementation is a research prototype. It does not have FDA clearance, HIPAA-compliant infrastructure, audit logging, or the access control mechanisms required for clinical deployment.",
          "Bias in the synthetic training corpus (e.g., demographic skew in synthetic patient generation) propagates to retrieval — cases for underrepresented demographic groups may have lower retrieval recall.",
        ],
        futureWork: "Conduct a bias audit across demographic dimensions (age, gender, condition prevalence). Design a regulatory compliance roadmap identifying the FDA SaMD pathway and HIPAA controls required for a clinical pilot.",
        tags: ["medical", "ethics", "regulation", "hipaa", "fda"],
      },
      {
        id: "q11-4",
        question: "How do you evaluate clinical case retrieval quality and what metrics are appropriate?",
        claim: "Clinical case retrieval uses the same precision@k framework as the aircraft domain, but requires specialty-stratified evaluation to detect whether retrieval degrades for underrepresented conditions — a medical-specific concern absent in the manufacturing domain.",
        evidence: [
          "Precision@k protocol for medical: define 30 test queries across 5 specialties (6 per specialty); retrieve top-k=5 cases per query; a clinical annotator (or proxy using MACCROBAT gold labels) judges each result as clinically relevant or not; precision@5 is computed per specialty and aggregated.",
          "Specialty stratification is critical: a model that achieves 0.80 mean precision@5 may achieve 0.95 for Cardiac (most cases) and 0.50 for Musculoskeletal (fewest cases). Mean precision hides this performance gap.",
          "Additional medical metric: symptom co-occurrence recall — for a query like 'patients with chest pain and elevated troponin,' verify that retrieved cases share both symptoms (not just one). Standard precision@k does not capture multi-symptom query satisfaction.",
          "Negative example relevance: retrieved cases for 'cardiac arrest presenting with ST-elevation' should NOT include hypertensive urgency cases even if both are Cardiac domain. False positive specialty contamination must be explicitly measured.",
        ],
        limitations: [
          "Clinical relevance is highly context-dependent — two cardiologists may disagree on whether a retrieved case is 'relevant' to a query. Inter-annotator agreement (Cohen's kappa) must be measured to establish annotation reliability.",
          "Without real clinical cases, precision@k is validated on synthetic data generated from the same templates used to build the corpus — creating a circularity risk where the model retrieves syntactically similar templates rather than semantically similar clinical presentations.",
        ],
        futureWork: "Develop a medical query test set in collaboration with a clinician; annotate relevance with two independent reviewers; compute inter-annotator kappa; report precision@5 and recall@10 stratified by specialty.",
        tags: ["medical", "evaluation", "precision", "metrics"],
      },
      {
        id: "q11-5",
        question: "What architectural changes were required to support the medical domain and what stayed the same?",
        claim: "The dual-domain extension required zero changes to the agent orchestrator, zero changes to the tool interfaces, and zero changes to the frontend rendering pipeline — demonstrating genuine architectural domain-agnosticism. Only three layers changed: the data schema, the ingest pipeline, and the API routing.",
        evidence: [
          "Unchanged: agent orchestrator (intent classification, tool sequencing, synthesis), vector_tool (embedding query + cosine retrieval), sql_tool (SELECT-only guardrailed execution), GraphViewer (ReactFlow rendering), ChatPanel, AgentTimeline, CitationsDrawer.",
          "Schema additions: three new Alembic-migrated tables (medical_cases, medical_embeddings with IVFFlat index, disease_records). The migration is additive — no existing aircraft tables were modified, ensuring backwards compatibility.",
          "API additions: POST /query/medical and POST /ingest/medical routes added to the FastAPI router. The medical query endpoint follows the identical request/response schema as /query — the frontend requires no branching logic.",
          "Frontend domain switch: the DomainContext provider (domain-context.tsx) toggles API target, chat placeholder text, disclaimer label, graph mock data, and dashboard tab labels — all via a single domain state variable with zero conditional render trees.",
          "This architectural proof-of-concept strengthens the research claim: the system is a generalised multi-modal agentic RAG framework, not an aircraft-specific tool. The paper title can expand from 'quality engineering' to 'safety-critical multi-modal AI.'",
        ],
        limitations: [
          "The medical and aircraft graph views use static mock data — the live graph traversal for clinical entity relationships (symptom → diagnosis → treatment) has not yet been implemented in GraphRAG.",
          "SQL tool queries are domain-specific: the aircraft SQL templates (GROUP BY product, defect_type) differ from medical templates (GROUP BY specialty, disease, outcome). These are pre-defined — the agent cannot yet auto-generate domain-appropriate SQL.",
        ],
        futureWork: "Implement dynamic SQL template selection: given the active domain, the agent selects from a domain-appropriate SQL tool registry rather than a shared static set.",
        tags: ["medical", "architecture", "domain-transfer", "design"],
      },
      {
        id: "q11-6",
        question: "Why is a medical AI system particularly well-suited to demonstrate the 'transparency-first' design principle?",
        claim: "Medical AI is the strongest possible test case for transparency-first design because the consequences of unexplained AI recommendations are most severe — clinicians cannot act on black-box outputs, and regulatory bodies increasingly require auditability as a condition of clinical AI deployment.",
        evidence: [
          "FDA's AI/ML-based SaMD Action Plan (2021) and the EU AI Act's Article 13 both require high-risk AI systems (including clinical decision support) to provide 'sufficient transparency' for users to interpret and override outputs. NextAgentAI's tool-call trace, confidence tiers, and citation drawers are direct implementations of these requirements.",
          "The AgentTimeline component surfaces every tool invocation, latency, and output in the medical domain — a clinician can trace exactly which retrieved cases influenced the LLM's differential diagnosis suggestion before acting on it.",
          "Clinical AI trust literature (Cai et al., 2019; Rajpurkar et al., 2022) consistently finds that clinicians require explanation, not just accuracy, before incorporating AI recommendations into practice. Precision@90% with no explanation is less clinically useful than precision@80% with case-level citations.",
          "The dual-domain system demonstrates that the same transparency framework (tool traces + citations + confidence tags) applies equally to manufacturing and clinical contexts — strengthening the universality of the design contribution.",
        ],
        limitations: [
          "Tool-call traces show process transparency (what the agent did) but not mechanistic transparency (why the LLM generated a particular synthesis from the retrieved evidence). A saliency-map or faithfulness-score approach would be required for the latter.",
          "Clinicians under time pressure may skip the tool trace panel entirely, defaulting to the synthesised answer — the same automation bias risk the transparency design was intended to mitigate.",
        ],
        futureWork: "Add a faithfulness checker: for each sentence in the medical synthesis, run an NLI model to verify it is entailed by at least one retrieved case chunk. Display sentence-level entailment scores inline in the answer panel.",
        tags: ["medical", "transparency", "trust", "regulation", "ethics"],
      },
    ],
  },
];

// ── Quick reference table ──────────────────────────────────────────────────

const QUICK_REF = [
  { claim: "Why vector search?",       defense: "Same failure mode, different words — keyword search misses it; cosine similarity finds it." },
  { claim: "Why LLM synthesis?",       defense: "Rules can't generalise; LLM handles novel evidence combinations grounded in retrieved data." },
  { claim: "Why not causal?",          defense: "Correlation from retrieval ≠ causation; outputs are framed as hypotheses, not conclusions." },
  { claim: "Why synthetic data?",      defense: "Method validation doesn't require real data; generalization study is Phase 2." },
  { claim: "What's novel?",            defense: "Evaluation framework + transparency-first design + multi-modal fusion architecture." },
  { claim: "Main limitation?",         defense: "Non-determinism + chunking sensitivity + no causal inference + synthetic data ceiling." },
  { claim: "Why PostgreSQL+pgvector?",  defense: "Co-locates SQL and vectors in one ACID DB — cosine search via <-> operator, HNSW index, no separate vector service needed." },
  { claim: "Why SCADA aesthetic?",     defense: "Directly communicates domain (industrial ops) and operational seriousness to the target user." },
  { claim: "What's the agent router?", defense: "LLM classifies intent → routes to vector-only / sql-only / hybrid tool chains before retrieval." },
  { claim: "How is bias mitigated?",   defense: "Confidence tags, AI-hypothesis labelling, tool-call trace, and human-in-the-loop positioning." },
  { claim: "Cosine similarity?",       defense: "cos(θ) = (A·B)/(‖A‖×‖B‖). pgvector: embedding <-> query_vec. HNSW index for O(log n) search." },
  { claim: "Precision@k formula?",     defense: "|relevant ∩ top-k| / k. Averaged over all queries = mean P@k. Phase 2: NDCG@k for ranking." },
  { claim: "BM25 vs embeddings?",      defense: "BM25 excels at exact/rare-term matching; embeddings handle synonymy. Hybrid+RRF beats either alone." },
  { claim: "TF-IDF use?",             defense: "GraphRAG node labelling: identifies discriminative terms per incident cluster. Also retrieval baseline." },
  { claim: "Core pain point?",         defense: "40–60% of investigation time wasted correlating 3 disconnected silos. Agent collapses this to seconds." },
  { claim: "Who is the user?",         defense: "Quality/reliability engineer: deep domain expertise, limited SQL/data-science skill. 3+ tool silos today." },
  { claim: "Why medical domain?",      defense: "Proves domain-agnosticism — same vector+SQL+graph agent serves clinical cases with zero orchestrator changes." },
  { claim: "IVFFlat vs HNSW?",        defense: "IVFFlat builds faster for small corpora (~800 chunks); HNSW gives better recall at scale. Medical uses IVFFlat (lists=100)." },
  { claim: "Medical ethics?",         defense: "FDA SaMD classification, HIPAA data governance, automation bias — medical requires stricter disclaimers and human-in-the-loop than manufacturing." },
  { claim: "BioBERT vs MiniLM?",      defense: "all-MiniLM-L6-v2 is not tuned on clinical text; BioBERT/ClinicalBERT would improve precision@k on medical NER-rich queries." },
  { claim: "Medical eval metric?",    defense: "Precision@k stratified by specialty — mean P@k hides recall collapse for underrepresented conditions (e.g., Musculoskeletal)." },
  { claim: "What changed for medical?", defense: "Only 3 layers: DB schema (+3 tables), ingest pipeline, API routes. Orchestrator, tools, frontend rendering — zero changes." },
];

// ── Presentation tips ──────────────────────────────────────────────────────

const TIPS = [
  { title: "Lead with the problem",         body: "Start every answer with the real-world pain point, then explain what technique solves it and why. Never start with the technology." },
  { title: "Name your limitations first",   body: "Say 'the limitation here is X, and here's how I'd address it in Phase 2.' Being caught off-guard is worse than a known gap." },
  { title: "Frame synthetic data correctly",body: "'This phase validates the framework and methodology; production validation is the next research phase' — not 'results are preliminary.'" },
  { title: "System vs algorithm novelty",   body: "You are not claiming a new algorithm. You claim a novel system design, evaluation framework, and transparency pattern. Know which one you're defending." },
  { title: "Use the tool trace as your ace",body: "When asked about trust and accountability, demo the transparency panel. It answers 'how do you know the AI isn't making things up?' visually." },
  { title: "Precision@k is your anchor",    body: "When asked about evaluation, immediately go to precision@k. Define it clearly, acknowledge its limitations, then mention NDCG as the Phase 2 upgrade." },
  { title: "Lead with domain-agnosticism",  body: "When asked why you added medical, say: 'The strongest evidence that an architecture is generalised is that it works in a second unrelated domain with zero changes to the core agent.' Then show what changed (3 layers) and what didn't (everything else)." },
  { title: "Medical ethics is a strength",  body: "Don't be defensive about medical AI risks — use them. Say: 'Medical is the hardest test case for transparency-first design. If the tool-trace and confidence tiers are sufficient for a clinician, they are more than sufficient for a quality engineer.'" },
];

// ── QA Card component ──────────────────────────────────────────────────────

function QACard({
  qa, index, accentVar, reviewed, onToggleReviewed,
}: {
  qa: QA;
  index: number;
  accentVar: string;
  reviewed: boolean;
  onToggleReviewed: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{
        border: `1px solid hsl(${accentVar} / ${open ? "0.4" : "0.18"})`,
        borderLeft: `2px solid hsl(${accentVar} / ${open ? "1" : "0.4"})`,
        borderRadius: "2px",
        backgroundColor: open ? `hsl(${accentVar} / 0.04)` : "hsl(var(--bg-panel))",
        transition: "all 0.15s",
        overflow: "hidden",
      }}
    >
      {/* Question row */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "flex-start",
          gap: "12px",
          padding: "12px 14px",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "0.58rem",
            fontWeight: 700,
            letterSpacing: "0.14em",
            color: `hsl(${accentVar})`,
            flexShrink: 0,
            paddingTop: "2px",
            minWidth: "36px",
          }}
        >
          Q{String(index + 1).padStart(2, "0")}
        </span>

        <p
          style={{
            flex: 1,
            fontFamily: "var(--font-mono)",
            fontSize: "0.88rem",
            color: "hsl(var(--text-primary))",
            lineHeight: "1.5",
            fontWeight: 500,
          }}
        >
          {qa.question}
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          <button
            onClick={(e) => { e.stopPropagation(); onToggleReviewed(); }}
            title={reviewed ? "Mark unreviewed" : "Mark reviewed"}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: reviewed ? `hsl(${accentVar})` : "hsl(var(--text-dim))",
              padding: "2px",
              transition: "color 0.15s",
            }}
          >
            {reviewed ? <CheckCircle2 size={14} /> : <Circle size={14} />}
          </button>
          {open ? <ChevronUp size={14} style={{ color: "hsl(var(--text-dim))" }} /> : <ChevronDown size={14} style={{ color: "hsl(var(--text-dim))" }} />}
        </div>
      </button>

      {/* Answer */}
      {open && (
        <div
          className="msg-animate"
          style={{ padding: "0 14px 14px 62px", display: "flex", flexDirection: "column", gap: "12px" }}
        >
          {/* Claim */}
          <div
            style={{
              padding: "8px 12px",
              borderLeft: `2px solid hsl(${accentVar})`,
              backgroundColor: `hsl(${accentVar} / 0.06)`,
              borderRadius: "0 2px 2px 0",
            }}
          >
            <p style={{ fontFamily: "var(--font-display)", fontSize: "0.55rem", fontWeight: 700, letterSpacing: "0.14em", color: `hsl(${accentVar})`, marginBottom: "4px" }}>
              CLAIM
            </p>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem", color: "hsl(var(--text-primary))", lineHeight: "1.6" }}>
              {qa.claim}
            </p>
          </div>

          {/* Evidence */}
          <div>
            <p style={{ fontFamily: "var(--font-display)", fontSize: "0.55rem", fontWeight: 700, letterSpacing: "0.14em", color: "hsl(var(--text-dim))", marginBottom: "6px" }}>
              METHODOLOGY / EVIDENCE
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
              {qa.evidence.map((e, i) => (
                <div key={i} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: "0.52rem", fontWeight: 700, color: `hsl(${accentVar} / 0.7)`, flexShrink: 0, paddingTop: "3px" }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.82rem", color: "hsl(var(--text-secondary))", lineHeight: "1.6" }}>
                    {e}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Limitations */}
          {qa.limitations.length > 0 && (
            <div>
              <p style={{ fontFamily: "var(--font-display)", fontSize: "0.55rem", fontWeight: 700, letterSpacing: "0.14em", color: "hsl(var(--col-red) / 0.8)", marginBottom: "6px" }}>
                HONEST LIMITATIONS
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                {qa.limitations.map((l, i) => (
                  <div key={i} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "hsl(var(--col-red) / 0.6)", flexShrink: 0, paddingTop: "2px" }}>▸</span>
                    <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.82rem", color: "hsl(var(--text-secondary))", lineHeight: "1.6" }}>{l}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Future work */}
          {qa.futureWork && (
            <div
              style={{
                padding: "7px 10px",
                border: "1px solid hsl(var(--col-amber) / 0.3)",
                borderRadius: "2px",
                backgroundColor: "hsl(var(--col-amber) / 0.05)",
              }}
            >
              <p style={{ fontFamily: "var(--font-display)", fontSize: "0.52rem", fontWeight: 700, letterSpacing: "0.12em", color: "hsl(var(--col-amber))", marginBottom: "3px" }}>
                FUTURE WORK HOOK
              </p>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.80rem", color: "hsl(var(--col-amber) / 0.9)", lineHeight: "1.5", fontStyle: "italic" }}>
                {qa.futureWork}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function ReviewPage() {
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [tipsOpen, setTipsOpen] = useState(false);
  const [refOpen, setRefOpen] = useState(false);

  const totalQuestions = CATEGORIES.reduce((sum, c) => sum + c.questions.length, 0);

  const toggleReviewed = useCallback((id: string) => {
    setReviewed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const visibleCategories = activeCategory === "all"
    ? CATEGORIES
    : CATEGORIES.filter((c) => c.id === activeCategory);

  const pct = Math.round((reviewed.size / totalQuestions) * 100);

  return (
    <div
      className="grid-bg"
      style={{ minHeight: "100svh", width: "100%", overflowX: "hidden", display: "flex", flexDirection: "column", backgroundColor: "hsl(var(--bg-void))" }}
    >
      {/* Header */}
      <header
        style={{
          height: "46px", flexShrink: 0,
          backgroundColor: "hsl(var(--bg-surface))",
          borderBottom: "1px solid hsl(var(--border-base))",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 16px", position: "relative", zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: "5px", color: "hsl(var(--text-secondary))", textDecoration: "none", transition: "color 0.15s" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "hsl(var(--col-green))"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "hsl(var(--text-secondary))"; }}
          >
            <ArrowLeft size={13} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.68rem", letterSpacing: "0.1em" }}>MAIN APP</span>
          </Link>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", color: "hsl(var(--text-dim))", letterSpacing: "0.08em" }}>
            // PHD REVIEW BOARD — STUDY INTERFACE
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <BookOpen size={12} style={{ color: "hsl(var(--col-purple))" }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", color: "hsl(var(--text-secondary))", letterSpacing: "0.08em" }}>
            {reviewed.size}/{totalQuestions} REVIEWED — {pct}%
          </span>
          <div style={{ width: 1, height: 16, backgroundColor: "hsl(var(--border-strong))" }} />
        </div>
      </header>

      {/* Progress bar */}
      <div style={{ height: "3px", backgroundColor: "hsl(var(--border-base))", flexShrink: 0 }}>
        <div style={{ height: "100%", width: `${pct}%`, backgroundColor: "hsl(var(--col-green))", boxShadow: "0 0 8px hsl(var(--col-green) / 0.5)", transition: "width 0.3s ease" }} />
      </div>

      {/* Category filter nav */}
      <nav style={{
        height: "40px", flexShrink: 0,
        backgroundColor: "hsl(var(--bg-void))",
        borderBottom: "1px solid hsl(var(--border-base))",
        display: "flex", alignItems: "stretch",
        padding: "0 10px", gap: "2px", overflowX: "auto",
      }}>
        {[{ id: "all", shortLabel: "ALL CATEGORIES", accentVar: "--col-green" }, ...CATEGORIES].map((cat) => {
          const isActive = cat.id === activeCategory;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              style={{
                padding: "0 14px", border: "none",
                borderBottom: `2px solid ${isActive ? `hsl(var(${cat.accentVar}))` : "transparent"}`,
                backgroundColor: isActive ? "hsl(var(--bg-panel))" : "transparent",
                color: isActive ? `hsl(var(${cat.accentVar}))` : "hsl(var(--text-secondary))",
                cursor: "pointer", transition: "all 0.15s", flexShrink: 0, whiteSpace: "nowrap",
                fontFamily: "var(--font-display)", fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.1em",
              }}
            >
              {cat.shortLabel}
            </button>
          );
        })}
      </nav>

      {/* Main content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 32px" }}>

        {/* Presentation Tips (collapsible) */}
        <div
          style={{
            marginBottom: "14px",
            border: "1px solid hsl(var(--col-amber) / 0.3)",
            borderRadius: "2px",
            backgroundColor: "hsl(var(--col-amber) / 0.04)",
          }}
        >
          <button
            onClick={() => setTipsOpen((v) => !v)}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: "10px",
              padding: "10px 14px", background: "none", border: "none", cursor: "pointer", textAlign: "left",
            }}
          >
            <Activity size={12} style={{ color: "hsl(var(--col-amber))", flexShrink: 0 }} />
            <span style={{ fontFamily: "var(--font-display)", fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.14em", color: "hsl(var(--col-amber))", flex: 1 }}>
              PRESENTATION TIPS // READ BEFORE YOUR DEFENSE
            </span>
            {tipsOpen ? <ChevronUp size={13} style={{ color: "hsl(var(--col-amber))" }} /> : <ChevronDown size={13} style={{ color: "hsl(var(--col-amber))" }} />}
          </button>
          {tipsOpen && (
            <div className="msg-animate" style={{ padding: "0 14px 14px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "10px" }}>
              {TIPS.map((tip) => (
                <div key={tip.title} style={{ padding: "10px 12px", border: "1px solid hsl(var(--col-amber) / 0.2)", borderRadius: "2px", backgroundColor: "hsl(var(--bg-elevated))" }}>
                  <p style={{ fontFamily: "var(--font-display)", fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.12em", color: "hsl(var(--col-amber))", marginBottom: "5px" }}>
                    {tip.title.toUpperCase()}
                  </p>
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.80rem", color: "hsl(var(--text-secondary))", lineHeight: "1.6" }}>
                    {tip.body}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick reference (collapsible) */}
        <div
          style={{
            marginBottom: "20px",
            border: "1px solid hsl(var(--col-cyan) / 0.3)",
            borderRadius: "2px",
            backgroundColor: "hsl(var(--col-cyan) / 0.03)",
          }}
        >
          <button
            onClick={() => setRefOpen((v) => !v)}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: "10px",
              padding: "10px 14px", background: "none", border: "none", cursor: "pointer", textAlign: "left",
            }}
          >
            <BarChart2 size={12} style={{ color: "hsl(var(--col-cyan))", flexShrink: 0 }} />
            <span style={{ fontFamily: "var(--font-display)", fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.14em", color: "hsl(var(--col-cyan))", flex: 1 }}>
              QUICK REFERENCE // KEY CLAIMS TO KNOW COLD
            </span>
            {refOpen ? <ChevronUp size={13} style={{ color: "hsl(var(--col-cyan))" }} /> : <ChevronDown size={13} style={{ color: "hsl(var(--col-cyan))" }} />}
          </button>
          {refOpen && (
            <div className="msg-animate" style={{ padding: "0 14px 14px" }}>
              <div style={{ border: "1px solid hsl(var(--border-base))", borderRadius: "2px", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid hsl(var(--col-cyan) / 0.3)" }}>
                      {["CLAIM", "ONE-LINE DEFENSE"].map((h) => (
                        <th key={h} style={{ textAlign: "left", padding: "7px 12px", fontFamily: "var(--font-display)", fontSize: "0.55rem", fontWeight: 700, letterSpacing: "0.14em", color: "hsl(var(--col-cyan))" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {QUICK_REF.map((row, i) => (
                      <tr key={row.claim} style={{ backgroundColor: i % 2 === 0 ? "hsl(var(--bg-void) / 0.5)" : "transparent", borderBottom: "1px solid hsl(var(--border-base) / 0.4)" }}>
                        <td style={{ padding: "7px 12px", fontFamily: "var(--font-mono)", fontSize: "0.78rem", color: "hsl(var(--col-cyan))", whiteSpace: "nowrap", verticalAlign: "top", minWidth: "200px" }}>{row.claim}</td>
                        <td style={{ padding: "7px 12px", fontFamily: "var(--font-mono)", fontSize: "0.80rem", color: "hsl(var(--text-secondary))", lineHeight: "1.5" }}>{row.defense}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Category sections */}
        {visibleCategories.map((cat) => {
          const Icon = cat.icon;
          const catReviewed = cat.questions.filter((q) => reviewed.has(q.id)).length;
          return (
            <div key={cat.id} style={{ marginBottom: "24px" }}>
              {/* Category header */}
              <div
                style={{
                  display: "flex", alignItems: "center", gap: "10px",
                  padding: "8px 12px",
                  borderBottom: `1px solid hsl(var(${cat.accentVar}) / 0.3)`,
                  backgroundColor: `hsl(var(${cat.accentVar}) / 0.05)`,
                  marginBottom: "10px",
                }}
              >
                <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: `hsl(var(${cat.accentVar}))`, boxShadow: `0 0 5px hsl(var(${cat.accentVar}))`, animation: "dot-pulse 2.4s ease-in-out infinite", flexShrink: 0 }} />
                <Icon size={13} style={{ color: `hsl(var(${cat.accentVar}))`, flexShrink: 0 }} />
                <span style={{ fontFamily: "var(--font-display)", fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.14em", color: `hsl(var(${cat.accentVar}))`, flex: 1 }}>
                  {cat.label.toUpperCase()}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", color: "hsl(var(--text-dim))" }}>
                  {catReviewed}/{cat.questions.length} reviewed
                </span>
              </div>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.78rem", color: "hsl(var(--text-dim))", marginBottom: "10px", paddingLeft: "2px" }}>
                {cat.description}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {cat.questions.map((qa, idx) => (
                  <QACard
                    key={qa.id}
                    qa={qa}
                    index={idx}
                    accentVar={cat.accentVar}
                    reviewed={reviewed.has(qa.id)}
                    onToggleReviewed={() => toggleReviewed(qa.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {/* Footer */}
        <div style={{ marginTop: "24px", padding: "12px 0", borderTop: "1px solid hsl(var(--border-base))", display: "flex", alignItems: "center", gap: "16px" }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: "0.55rem", fontWeight: 700, letterSpacing: "0.14em", color: "hsl(var(--text-dim))" }}>
            NEXTAGENTAI // PHD REVIEW BOARD PREP
          </span>
          <div style={{ width: 1, height: 12, backgroundColor: "hsl(var(--border-strong))" }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", color: "hsl(var(--text-dim))" }}>
            {totalQuestions} questions across {CATEGORIES.length} categories — generated from SKILL.md + full project knowledge
          </span>
        </div>
      </div>
    </div>
  );
}
