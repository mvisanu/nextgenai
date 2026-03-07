"use client";

// ============================================================
// /agent — Agent Architecture
// Four diagram tabs: State Machine · LLM Routing ·
//                    Intent & Tools · Full Request Flow
// Rendered with Mermaid.js, styled in industrial SCADA theme
// ============================================================

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft, Bot, Cpu, GitBranch, Layers,
  Zap, ChevronRight, BarChart3, Shield, Database,
} from "lucide-react";
import { ThemeToggle, FontSizeControl } from "../lib/theme";
import MermaidDiagram from "../components/MermaidDiagram";

// ── Diagram sources ────────────────────────────────────────────────────────

const STATE_MACHINE_DIAGRAM = `
flowchart TD
  classDef state  fill:#091a2e,stroke:#00d4ff,color:#7dd3fc,stroke-width:2px
  classDef tool   fill:#091e12,stroke:#4ade80,color:#86efac,stroke-width:2px
  classDef llm    fill:#1e0514,stroke:#f472b6,color:#f9a8d4,stroke-width:2px
  classDef store  fill:#130a25,stroke:#a78bfa,color:#c4b5fd,stroke-width:2px
  classDef limit  fill:#1e0909,stroke:#f87171,color:#fca5a5,stroke-width:2px

  START(["⬤ Query + Domain"]):::state

  subgraph SM["AGENT STATE MACHINE"]
    direction TB
    S1["① CLASSIFY\nHaiku classifies intent"]:::llm
    S2["② PLAN\nHaiku generates step plan\n(skipped for vector_only)"]:::llm
    S3["③ EXECUTE TOOLS\nRun each plan step (max 10)"]:::tool
    S4["④ EXPAND GRAPH\nSeed chunk IDs → 1-hop graph"]:::tool
    S5["⑤ RE-RANK\nMerge vector + graph evidence"]:::state
    S6["⑥ SYNTHESISE\nHaiku or Sonnet builds answer"]:::llm
    S7["⑦ VERIFY\nHaiku scores claims 0–1"]:::llm
    S8["⑧ SAVE\nPersist to agent_runs table"]:::store
  end

  DONE(["⬤ AgentRunResult"]):::state
  HALT["⚠ STEP LIMIT\n10 steps reached"]:::limit

  START --> S1 --> S2 --> S3
  S3 -->|"next step"| S3
  S3 -->|"all steps done"| S4
  S3 -->|"max 10 hit"| HALT --> S4
  S4 --> S5 --> S6 --> S7 --> S8 --> DONE
`;

const LLM_ROUTING_DIAGRAM = `
flowchart LR
  classDef task   fill:#091a2e,stroke:#00d4ff,color:#7dd3fc,stroke-width:2px
  classDef haiku  fill:#1e0514,stroke:#f472b6,color:#f9a8d4,stroke-width:2px
  classDef sonnet fill:#0a1520,stroke:#fb923c,color:#fdba74,stroke-width:2px
  classDef arrow  fill:none,stroke:none

  subgraph Tasks["AGENT TASKS"]
    T1["Classify Intent"]:::task
    T2["Generate Plan"]:::task
    T3["Verify Claims"]:::task
    T4["Synthesise\nvector_only / sql_only"]:::task
    T5["Synthesise\nhybrid / compute"]:::task
  end

  subgraph Models["LLM MODELS"]
    H["Claude Haiku 4.5\n─────────────────\n✦ Fast · Low latency\n✦ JSON routing tasks\n✦ Classify · Plan · Verify\n✦ Simple synthesis"]:::haiku
    S["Claude Sonnet 4.6\n─────────────────\n✦ Powerful reasoning\n✦ Multi-source evidence\n✦ Hybrid & compute paths\n✦ Deep synthesis only"]:::sonnet
  end

  T1 --> H
  T2 --> H
  T3 --> H
  T4 --> H
  T5 --> S
`;

const INTENT_TOOLS_DIAGRAM = `
flowchart TD
  classDef query  fill:#091a2e,stroke:#00d4ff,color:#7dd3fc,stroke-width:2px
  classDef intent fill:#1e1205,stroke:#fb923c,color:#fdba74,stroke-width:2px
  classDef tool   fill:#091e12,stroke:#4ade80,color:#86efac,stroke-width:2px
  classDef db     fill:#130a25,stroke:#a78bfa,color:#c4b5fd,stroke-width:2px

  Q(["User Query"]):::query
  IC{{"Intent Classifier\nClaude Haiku 4.5"}}:::intent

  Q --> IC

  IC -->|"vector_only\nfind / search / retrieve"| VS
  IC -->|"sql_only\ncounts / trends / stats"| ST
  IC -->|"hybrid\nboth semantic + SQL"| VS2
  IC -->|"hybrid"| ST2
  IC -->|"compute\ncalculate / ratio"| ST3

  subgraph VectorPath["VECTOR PATH"]
    VS["VectorSearchTool\n──────────────\nall-MiniLM-L6-v2 embed\nHNSW cosine search\ntop_k=8, thresh=0.20"]:::tool
  end

  subgraph SQLPath["SQL PATH"]
    ST["SQLQueryTool\n──────────────\nNamed queries only\nSELECT guardrails\n4 aircraft / 4 medical"]:::tool
  end

  subgraph HybridPath["HYBRID PATH"]
    VS2["VectorSearchTool"]:::tool
    ST2["SQLQueryTool"]:::tool
  end

  subgraph ComputePath["COMPUTE PATH"]
    ST3["SQLQueryTool\nfetch data"] --> PC["PythonComputeTool\nsandboxed Python\narithmetic / stats"]:::tool
    ST3:::tool
  end

  subgraph DBs["DATA LAYER"]
    PG[("PostgreSQL\nincident_reports\nmanufacturing_defects\nmaintenance_logs")]:::db
    PGV[("pgvector\nincident_embeddings\n384-dim HNSW")]:::db
    GR[("graph_node\ngraph_edge")]:::db
  end

  VS --> PGV
  ST --> PG
  VS2 --> PGV
  ST2 --> PG
  ST3 --> PG
`;

const SEQUENCE_DIAGRAM = `
sequenceDiagram
  autonumber
  actor User
  participant Orc as Orchestrator
  participant H   as Haiku 4.5
  participant S   as Sonnet 4.6
  participant VS  as VectorSearchTool
  participant SQL as SQLQueryTool
  participant GE  as GraphExpander
  participant DB  as PostgreSQL/pgvector

  User  ->> Orc : POST /query  {query, domain}
  Orc   ->> H   : classify_intent(query, domain)
  H     -->> Orc: {intent}

  alt intent != vector_only
    Orc ->> H   : generate_plan(query, intent)
    H   -->> Orc: {plan_text, steps[]}
  else vector_only
    Note over Orc: Fallback plan — skip LLM round-trip
  end

  loop Each plan step (max 10)
    Orc ->> VS  : run(query_text, top_k, filters)
    VS  ->> DB  : HNSW cosine search
    DB  -->> VS : vector_hits[]
    VS  -->> Orc: chunks + scores

    Orc ->> SQL : run_named(named_query, params)
    SQL ->> DB  : SELECT (guardrailed)
    DB  -->> SQL: rows[]
    SQL -->> Orc: sql_rows[]
  end

  Orc  ->> GE  : expand(seed_chunk_ids, k=1)
  GE   ->> DB  : graph_node + graph_edge
  DB   -->> GE : nodes[] + edges[]
  GE   -->> Orc: graph_path

  alt hybrid or compute
    Orc ->> S  : synthesise(evidence)
    S   -->> Orc: answer + claims
  else vector_only or sql_only
    Orc ->> H  : synthesise(evidence)
    H   -->> Orc: answer + claims
  end

  Orc  ->> H  : verify_claims(claims, evidence)
  H    -->> Orc: verified_claims + confidence[0–1]

  Orc  ->> DB : INSERT agent_runs (run_id, query, result)
  Orc  -->> User: AgentRunResult
`;

// ── Tab config ────────────────────────────────────────────────────────────

type TabId = "state" | "llm" | "intent" | "sequence";

const TABS: { id: TabId; label: string; sub: string; accent: string }[] = [
  { id: "state",    label: "STATE MACHINE",   sub: "9-state agentic loop",         accent: "--col-cyan"   },
  { id: "llm",      label: "LLM ROUTING",     sub: "Haiku vs Sonnet decisions",    accent: "--col-pink"   },
  { id: "intent",   label: "INTENT & TOOLS",  sub: "4 intents → 3 tools → DB",    accent: "--col-amber"  },
  { id: "sequence", label: "REQUEST FLOW",    sub: "Full end-to-end sequence",     accent: "--col-green"  },
];

// ── Shared styles ──────────────────────────────────────────────────────────

const MONO: React.CSSProperties = { fontFamily: "var(--font-mono)" };
const DISPLAY: React.CSSProperties = { fontFamily: "var(--font-display)" };
const BODY: React.CSSProperties = { fontFamily: "var(--font-body)" };

// ── Sub-components ─────────────────────────────────────────────────────────

function CornerBracket({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const size = 10;
  const s: React.CSSProperties = {
    position: "absolute",
    width: size,
    height: size,
    borderColor: "hsl(var(--border-strong))",
    borderStyle: "solid",
    borderTopWidth:    pos.startsWith("t") ? 1 : 0,
    borderBottomWidth: pos.startsWith("b") ? 1 : 0,
    borderLeftWidth:   pos.endsWith("l")   ? 1 : 0,
    borderRightWidth:  pos.endsWith("r")   ? 1 : 0,
    top:    pos.startsWith("t") ? 0 : "auto",
    bottom: pos.startsWith("b") ? 0 : "auto",
    left:   pos.endsWith("l")   ? 0 : "auto",
    right:  pos.endsWith("r")   ? 0 : "auto",
  };
  return <span style={s} />;
}

function InfoCard({
  icon: Icon,
  accentVar,
  label,
  desc,
}: {
  icon: React.ElementType;
  accentVar: string;
  label: string;
  desc: string;
}) {
  const accent = `hsl(var(${accentVar}))`;
  return (
    <div
      style={{
        backgroundColor: "hsl(var(--bg-surface))",
        border: `1px solid hsl(var(--border-base))`,
        borderLeft: `3px solid ${accent}`,
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon size={14} style={{ color: accent, flexShrink: 0 }} />
        <span style={{ ...MONO, fontSize: "0.65rem", letterSpacing: "0.1em", color: accent }}>
          {label.toUpperCase()}
        </span>
      </div>
      <p style={{ ...BODY, fontSize: "0.82rem", color: "hsl(var(--text-secondary))", lineHeight: 1.55, margin: 0 }}>
        {desc}
      </p>
    </div>
  );
}

function DiagramPanel({
  id,
  chart,
  title,
  subtitle,
  accentVar,
  legend,
}: {
  id: string;
  chart: string;
  title: string;
  subtitle: string;
  accentVar: string;
  legend: { col: string; label: string }[];
}) {
  const accent = `hsl(var(${accentVar}))`;
  return (
    <div
      style={{
        position: "relative",
        backgroundColor: "hsl(var(--bg-surface))",
        border: "1px solid hsl(var(--border-base))",
      }}
    >
      <CornerBracket pos="tl" /><CornerBracket pos="tr" />
      <CornerBracket pos="bl" /><CornerBracket pos="br" />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 16px",
          borderBottom: "1px solid hsl(var(--border-base))",
          backgroundColor: "hsl(var(--bg-void))",
        }}
      >
        <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: accent }} />
        <span style={{ ...MONO, fontSize: "0.62rem", letterSpacing: "0.1em", color: accent }}>
          {title}
        </span>
        <span style={{ ...MONO, fontSize: "0.55rem", color: "hsl(var(--text-dim))", marginLeft: "auto" }}>
          {subtitle}
        </span>
      </div>

      <div style={{ padding: "24px 20px" }}>
        <MermaidDiagram id={id} chart={chart} />
      </div>

      {legend.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            padding: "12px 20px",
            borderTop: "1px solid hsl(var(--border-base))",
            backgroundColor: "hsl(var(--bg-void))",
          }}
        >
          {legend.map(({ col, label }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div
                style={{
                  width: 10,
                  height: 10,
                  border: `2px solid ${col}`,
                  backgroundColor: `${col}22`,
                  flexShrink: 0,
                }}
              />
              <span style={{ ...MONO, fontSize: "0.58rem", color: "hsl(var(--text-dim))" }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab content ───────────────────────────────────────────────────────────

function StateTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <DiagramPanel
        id="agent-state"
        chart={STATE_MACHINE_DIAGRAM}
        title="AGENT STATE MACHINE — 9-STATE AGENTIC LOOP"
        subtitle="orchestrator.py"
        accentVar="--col-cyan"
        legend={[
          { col: "#7dd3fc", label: "State / IO" },
          { col: "#f9a8d4", label: "LLM Step (Haiku)" },
          { col: "#86efac", label: "Tool Execution" },
          { col: "#c4b5fd", label: "Persist (DB)" },
          { col: "#fca5a5", label: "Step Limit Guard" },
        ]}
      />

      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <ChevronRight size={13} style={{ color: "hsl(var(--col-cyan))" }} />
          <span style={{ ...MONO, fontSize: "0.62rem", letterSpacing: "0.1em", color: "hsl(var(--text-secondary))" }}>
            STATE DESCRIPTIONS
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {[
            { icon: Bot,      accentVar: "--col-pink",   label: "① Classify",       desc: "Claude Haiku classifies the query into one of four intents: vector_only, sql_only, hybrid, or compute. Returns JSON in ~200ms. Falls back to hybrid on failure." },
            { icon: Layers,   accentVar: "--col-pink",   label: "② Plan",           desc: "Haiku generates a numbered step plan with specific tool names and inputs. Skipped entirely for vector_only — a hardcoded fallback plan avoids a wasted API round-trip." },
            { icon: Cpu,      accentVar: "--col-green",  label: "③ Execute Tools",  desc: "Each plan step runs a tool: VectorSearchTool, SQLQueryTool, or PythonComputeTool. Steps are sequential; max 10 enforced. Each step logs tool name, inputs, latency, and errors." },
            { icon: GitBranch,accentVar: "--col-green",  label: "④ Expand Graph",   desc: "Vector hit chunk IDs seed a 1-hop graph traversal across graph_node and graph_edge tables. Returns additional entity and chunk nodes to enrich evidence." },
            { icon: BarChart3,accentVar: "--col-cyan",   label: "⑤ Re-Rank",        desc: "Graph evidence is merged with vector hits. The top-k=8 scorer combines vector similarity and graph composite scores to surface the most relevant evidence for synthesis." },
            { icon: Zap,      accentVar: "--col-amber",  label: "⑥ Synthesise",     desc: "Evidence is formatted into a prompt. Haiku synthesises for simple intents; Sonnet 4.6 handles hybrid and compute paths. Output: answer, claims, assumptions, next_steps in JSON." },
            { icon: Shield,   accentVar: "--col-pink",   label: "⑦ Verify",         desc: "Haiku scores each claim against the top 5 evidence items (0.0–1.0 confidence). Attaches chunk citations with char offsets. Confidence capped at 0.5 when evidence is sparse." },
            { icon: Database, accentVar: "--col-purple", label: "⑧ Save",           desc: "Full AgentRunResult serialised to JSON and persisted to the agent_runs table. Includes run_id, query, answer, verified claims, evidence, graph_path, step logs, and total latency." },
          ].map((card) => (
            <InfoCard key={card.label} {...card} />
          ))}
        </div>
      </div>
    </div>
  );
}

function LLMTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <DiagramPanel
        id="agent-llm"
        chart={LLM_ROUTING_DIAGRAM}
        title="LLM ROUTING — HAIKU vs SONNET"
        subtitle="llm/client.py · orchestrator.py"
        accentVar="--col-pink"
        legend={[
          { col: "#7dd3fc", label: "Agent Tasks" },
          { col: "#f9a8d4", label: "Claude Haiku 4.5" },
          { col: "#fdba74", label: "Claude Sonnet 4.6" },
        ]}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div
          style={{
            backgroundColor: "hsl(var(--bg-surface))",
            border: "1px solid hsl(var(--border-base))",
            borderLeft: "3px solid hsl(var(--col-pink))",
            padding: "16px 20px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Zap size={13} style={{ color: "hsl(var(--col-pink))" }} />
            <span style={{ ...MONO, fontSize: "0.62rem", letterSpacing: "0.1em", color: "hsl(var(--col-pink))" }}>
              CLAUDE HAIKU 4.5 — FAST PATH
            </span>
          </div>
          <ul style={{ ...BODY, fontSize: "0.84rem", color: "hsl(var(--text-secondary))", lineHeight: 1.75, margin: 0, paddingLeft: 18 }}>
            <li><b>Classify Intent</b> — JSON mode, max 64 tokens, ~200ms</li>
            <li><b>Generate Plan</b> — JSON mode, max 1024 tokens, step list</li>
            <li><b>Verify Claims</b> — JSON mode, max 768 tokens, confidence scores</li>
            <li><b>Simple Synthesis</b> — vector_only and sql_only intents only</li>
          </ul>
          <p style={{ ...MONO, fontSize: "0.6rem", color: "hsl(var(--text-dim))", marginTop: 12, marginBottom: 0 }}>
            Model ID: claude-haiku-4-5-20251001 · get_fast_llm_client()
          </p>
        </div>

        <div
          style={{
            backgroundColor: "hsl(var(--bg-surface))",
            border: "1px solid hsl(var(--border-base))",
            borderLeft: "3px solid hsl(var(--col-amber))",
            padding: "16px 20px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Cpu size={13} style={{ color: "hsl(var(--col-amber))" }} />
            <span style={{ ...MONO, fontSize: "0.62rem", letterSpacing: "0.1em", color: "hsl(var(--col-amber))" }}>
              CLAUDE SONNET 4.6 — DEEP PATH
            </span>
          </div>
          <ul style={{ ...BODY, fontSize: "0.84rem", color: "hsl(var(--text-secondary))", lineHeight: 1.75, margin: 0, paddingLeft: 18 }}>
            <li><b>Hybrid Synthesis</b> — vector + SQL multi-source reasoning</li>
            <li><b>Compute Synthesis</b> — SQL + Python computation results</li>
            <li>JSON mode, max 1024 tokens, richer evidence context</li>
            <li>Only invoked when intent requires deep multi-step reasoning</li>
          </ul>
          <p style={{ ...MONO, fontSize: "0.6rem", color: "hsl(var(--text-dim))", marginTop: 12, marginBottom: 0 }}>
            Model ID: claude-sonnet-4-6 · get_llm_client()
          </p>
        </div>
      </div>

      <div
        style={{
          backgroundColor: "hsl(var(--bg-surface))",
          border: "1px solid hsl(var(--border-base))",
          borderLeft: "3px solid hsl(var(--col-cyan))",
          padding: "16px 20px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <BarChart3 size={13} style={{ color: "hsl(var(--col-cyan))" }} />
          <span style={{ ...MONO, fontSize: "0.62rem", letterSpacing: "0.1em", color: "hsl(var(--col-cyan))" }}>
            ROUTING DECISION LOGIC
          </span>
        </div>
        <p style={{ ...BODY, fontSize: "0.84rem", color: "hsl(var(--text-secondary))", lineHeight: 1.7, margin: 0 }}>
          The orchestrator selects the LLM at synthesis time based on the classified intent:{" "}
          <code style={{ ...MONO, fontSize: "0.78rem", backgroundColor: "hsl(var(--bg-void))", padding: "1px 6px" }}>
            synthesis_llm = self.llm if intent in (&quot;hybrid&quot;, &quot;compute&quot;) else self._fast_llm
          </code>
          {" "}— Sonnet is only invoked when multi-source reasoning is required, keeping the majority of queries on the cheaper, faster Haiku model.
        </p>
      </div>
    </div>
  );
}

function IntentTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <DiagramPanel
        id="agent-intent"
        chart={INTENT_TOOLS_DIAGRAM}
        title="INTENT CLASSIFICATION → TOOL ROUTING → DATA LAYER"
        subtitle="intent.py · planner.py · tools/"
        accentVar="--col-amber"
        legend={[
          { col: "#7dd3fc", label: "Query / Result" },
          { col: "#fdba74", label: "Intent Classifier" },
          { col: "#86efac", label: "Tools" },
          { col: "#c4b5fd", label: "Data Stores" },
        ]}
      />

      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <ChevronRight size={13} style={{ color: "hsl(var(--col-amber))" }} />
          <span style={{ ...MONO, fontSize: "0.62rem", letterSpacing: "0.1em", color: "hsl(var(--text-secondary))" }}>
            INTENT DEFINITIONS
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {[
            {
              icon: Zap,
              accentVar: "--col-cyan",
              label: "vector_only",
              desc: 'Queries that ask to find, search, or retrieve similar incidents or narratives by semantic content. Example: "find incidents similar to hydraulic actuator crack". Fastest path — LLM planner is skipped entirely.',
            },
            {
              icon: BarChart3,
              accentVar: "--col-amber",
              label: "sql_only",
              desc: 'Queries for counts, trends, aggregations, or statistics on structured data. Example: "show defect counts by product for last 90 days". Uses named queries only — raw SQL from LLM is intercepted and replaced with a safe named alternative.',
            },
            {
              icon: GitBranch,
              accentVar: "--col-green",
              label: "hybrid",
              desc: 'Queries requiring both semantic search AND SQL analysis. Example: "find similar incidents and show defect statistics". At least one VectorSearchTool step and one SQLQueryTool step are planned. Synthesised by Sonnet 4.6.',
            },
            {
              icon: Cpu,
              accentVar: "--col-pink",
              label: "compute",
              desc: 'Queries requesting arithmetic or statistical computation. Example: "calculate the average defect rate". SQLQueryTool fetches data first, then PythonComputeTool runs sandboxed Python (RestrictedPython) to produce the result.',
            },
          ].map((card) => (
            <InfoCard key={card.label} {...card} />
          ))}
        </div>
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <ChevronRight size={13} style={{ color: "hsl(var(--col-amber))" }} />
          <span style={{ ...MONO, fontSize: "0.62rem", letterSpacing: "0.1em", color: "hsl(var(--text-secondary))" }}>
            TOOL SPECIFICATIONS
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {[
            {
              icon: Database,
              accentVar: "--col-purple",
              label: "VectorSearchTool",
              desc: "Encodes query_text with all-MiniLM-L6-v2 (384-dim). Runs HNSW cosine similarity search against incident_embeddings in pgvector. Default top_k=8, similarity threshold=0.20. Supports metadata filters. Returns chunk excerpts, scores, and char offsets.",
            },
            {
              icon: Layers,
              accentVar: "--col-green",
              label: "SQLQueryTool",
              desc: "Executes named queries only — raw SQL from the LLM planner is intercepted and replaced with a safe named alternative to prevent hallucinated table/column errors. Aircraft queries: defect_counts_by_product, severity_distribution, maintenance_trends, incidents_defects_join. Medical queries: disease_counts_by_specialty, disease_severity_distribution, disease_symptom_profile, medical_system_summary.",
            },
            {
              icon: Cpu,
              accentVar: "--col-pink",
              label: "PythonComputeTool",
              desc: "Sandboxed Python execution via RestrictedPython. The latest sql_rows are injected into the execution context automatically. Used for arithmetic, statistics, and ratio calculations. Result is truncated to 100 chars in the step log summary.",
            },
          ].map((card) => (
            <InfoCard key={card.label} {...card} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SequenceTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <DiagramPanel
        id="agent-sequence"
        chart={SEQUENCE_DIAGRAM}
        title="FULL REQUEST FLOW — END-TO-END SEQUENCE"
        subtitle="POST /query → AgentRunResult"
        accentVar="--col-green"
        legend={[]}
      />

      <div
        style={{
          backgroundColor: "hsl(var(--bg-surface))",
          border: "1px solid hsl(var(--border-base))",
          borderLeft: "3px solid hsl(var(--col-green))",
          padding: "16px 20px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <BarChart3 size={13} style={{ color: "hsl(var(--col-green))" }} />
          <span style={{ ...MONO, fontSize: "0.62rem", letterSpacing: "0.1em", color: "hsl(var(--col-green))" }}>
            KEY DESIGN DECISIONS
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 10 }}>
          {[
            {
              label: "No raw SQL from LLM",
              desc: "If the planner returns a step with raw sql instead of named_query, the orchestrator intercepts it and substitutes the appropriate domain-specific named query, preventing schema hallucinations from reaching the database.",
            },
            {
              label: "vector_only skips LLM planner",
              desc: "For vector_only intent, the orchestrator skips the generate_plan() LLM call entirely and uses a hardcoded fallback plan. This saves ~400–600ms per vector-only query.",
            },
            {
              label: "Graph expansion always attempted",
              desc: "If vector_hits exist, the orchestrator always attempts graph expansion using the chunk IDs as seeds. Failures are silently logged and do not abort the pipeline — the synthesis continues with whatever evidence exists.",
            },
            {
              label: "Confidence capped at 0.5 for sparse evidence",
              desc: "The verifier automatically clamps claim confidence to 0.5 when fewer than 2 evidence items are present, preventing overconfident claims when retrieval quality is low.",
            },
            {
              label: "Domain-aware throughout",
              desc: "The domain parameter (aircraft / medical) is passed to every LLM call, tool call, and named query — selecting domain-appropriate system prompts, named queries, and synthesis framing at each step.",
            },
            {
              label: "Persist always attempted, never blocking",
              desc: "The INSERT into agent_runs is wrapped in a try/except. A persistence failure logs a warning but does not raise an error — the AgentRunResult is always returned to the user even if the DB save fails.",
            },
          ].map(({ label, desc }) => (
            <div
              key={label}
              style={{
                backgroundColor: "hsl(var(--bg-void))",
                border: "1px solid hsl(var(--border-base))",
                padding: "12px 14px",
              }}
            >
              <div style={{ ...MONO, fontSize: "0.6rem", letterSpacing: "0.08em", color: "hsl(var(--col-green))", marginBottom: 6 }}>
                {label.toUpperCase()}
              </div>
              <p style={{ ...BODY, fontSize: "0.8rem", color: "hsl(var(--text-secondary))", margin: 0, lineHeight: 1.65 }}>
                {desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function AgentPage() {
  const [activeTab, setActiveTab] = useState<TabId>("state");
  // diagKey increments each time a tab becomes active, forcing MermaidDiagram
  // to remount and re-render after the container is visible in the DOM.
  // Without this, the diagram renders into a zero-height container on the
  // initial page load before CSS layout has settled.
  const [diagKey, setDiagKey] = useState(0);

  useEffect(() => {
    setDiagKey(k => k + 1);
  }, [activeTab]);

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "hsl(var(--bg-void))",
        color: "hsl(var(--text-primary))",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Header ── */}
      <header
        style={{
          height: 48,
          backgroundColor: "hsl(var(--bg-surface))",
          borderBottom: "1px solid hsl(var(--border-base))",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          position: "sticky",
          top: 0,
          zIndex: 50,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Link
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: "hsl(var(--text-secondary))",
              textDecoration: "none",
              ...MONO,
              fontSize: "0.65rem",
              letterSpacing: "0.08em",
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.color = "hsl(var(--col-cyan))";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.color = "hsl(var(--text-secondary))";
            }}
          >
            <ArrowLeft size={13} />
            BACK
          </Link>

          <div style={{ width: 1, height: 16, backgroundColor: "hsl(var(--border-strong))" }} />

          <Bot size={14} style={{ color: "hsl(var(--col-cyan))" }} />
          <span
            style={{
              ...DISPLAY,
              fontSize: "0.7rem",
              letterSpacing: "0.15em",
              color: "hsl(var(--col-cyan))",
            }}
          >
            AGENT ARCHITECTURE
          </span>

          <span
            style={{
              ...MONO,
              fontSize: "0.6rem",
              color: "hsl(var(--text-dim))",
              letterSpacing: "0.06em",
            }}
          >
            // NextAgentAI · State Machine · LLM Routing · Tools
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        </div>
      </header>

      {/* ── Hero ── */}
      <section
        style={{
          borderBottom: "1px solid hsl(var(--border-base))",
          backgroundColor: "hsl(var(--bg-surface))",
          padding: "28px 32px 24px",
        }}
      >
        <div style={{ maxWidth: 900 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div
              style={{
                width: 3,
                height: 28,
                backgroundColor: "hsl(var(--col-cyan))",
                flexShrink: 0,
              }}
            />
            <h1
              style={{
                ...DISPLAY,
                fontSize: "clamp(1rem, 2.5vw, 1.4rem)",
                letterSpacing: "0.1em",
                color: "hsl(var(--text-primary))",
                margin: 0,
              }}
            >
              HOW THE AGENT WORKS
            </h1>
          </div>
          <p
            style={{
              ...BODY,
              fontSize: "0.9rem",
              color: "hsl(var(--text-secondary))",
              margin: "0 0 16px 13px",
              lineHeight: 1.6,
              maxWidth: 720,
            }}
          >
            A nine-state agentic loop — classify intent, plan tool steps, execute vector search
            and SQL queries, expand a knowledge graph, re-rank evidence, synthesise a cited answer
            via Claude, verify confidence scores, and persist the result.
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginLeft: 13 }}>
            {[
              { label: "9 agent states",              col: "--col-cyan"   },
              { label: "4 intent classes",            col: "--col-amber"  },
              { label: "3 tools",                     col: "--col-green"  },
              { label: "Haiku 4.5 · Sonnet 4.6",     col: "--col-pink"   },
              { label: "max 10 tool steps",           col: "--col-purple" },
              { label: "aircraft + medical domains",  col: "--col-blue"   },
            ].map(({ label, col }) => (
              <span
                key={label}
                style={{
                  ...MONO,
                  fontSize: "0.6rem",
                  letterSpacing: "0.08em",
                  color: `hsl(var(${col}))`,
                  border: `1px solid hsl(var(${col}) / 0.35)`,
                  backgroundColor: `hsl(var(${col}) / 0.08)`,
                  padding: "3px 10px",
                }}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Tab bar ── */}
      <nav
        style={{
          display: "flex",
          borderBottom: "1px solid hsl(var(--border-base))",
          backgroundColor: "hsl(var(--bg-void))",
          padding: "0 32px",
          gap: 2,
        }}
      >
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          const accent = active ? `hsl(var(${tab.accent}))` : "hsl(var(--text-secondary))";
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 2,
                padding: "12px 20px",
                border: "none",
                borderBottom: active
                  ? `2px solid hsl(var(${tab.accent}))`
                  : "2px solid transparent",
                backgroundColor: "transparent",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              <span style={{ ...MONO, fontSize: "0.65rem", letterSpacing: "0.1em", color: accent }}>
                {tab.label}
              </span>
              <span style={{ ...BODY, fontSize: "0.7rem", color: "hsl(var(--text-dim))" }}>
                {tab.sub}
              </span>
            </button>
          );
        })}
      </nav>

      {/* ── Content ── */}
      {/* diagKey is passed as the React key so each tab's diagram component
          remounts whenever the active tab changes — this ensures Mermaid
          renders into a visible, correctly-sized container rather than a
          zero-height hidden element. */}
      <main style={{ flex: 1, padding: "28px 32px 48px", maxWidth: 1280, width: "100%", margin: "0 auto" }}>
        {activeTab === "state"    && <StateTab    key={`state-${diagKey}`} />}
        {activeTab === "llm"      && <LLMTab      key={`llm-${diagKey}`} />}
        {activeTab === "intent"   && <IntentTab   key={`intent-${diagKey}`} />}
        {activeTab === "sequence" && <SequenceTab key={`sequence-${diagKey}`} />}
      </main>
    </div>
  );
}
