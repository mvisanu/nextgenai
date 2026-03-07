"use client";

// ============================================================
// /diagram — Architecture Diagrams
// Two views: MVP Architecture & Enterprise Scale
// Rendered with Mermaid.js, styled in industrial SCADA theme
// ============================================================

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, GitBranch, Layers, Globe, Server, Database,
  Cpu, Shield, Users, Zap, BarChart3, ChevronRight,
} from "lucide-react";
import { NavDropdown } from "../components/AppHeader";
import MermaidDiagram from "../components/MermaidDiagram";

// ── Diagram sources ────────────────────────────────────────────────────────

const MVP_DIAGRAM = `
flowchart TB
  classDef user fill:#091a2e,stroke:#00d4ff,color:#7dd3fc,stroke-width:2px
  classDef fe   fill:#091e12,stroke:#4ade80,color:#86efac,stroke-width:2px
  classDef be   fill:#1e1205,stroke:#fb923c,color:#fdba74,stroke-width:2px
  classDef db   fill:#130a25,stroke:#a78bfa,color:#c4b5fd,stroke-width:2px
  classDef ing  fill:#091a09,stroke:#34d399,color:#6ee7b7,stroke-width:2px
  classDef ext  fill:#1e0909,stroke:#f87171,color:#fca5a5,stroke-width:2px

  U(["Quality Engineers / Engineering Managers"]):::user

  subgraph FE["VERCEL — NEXT.JS 16 APP ROUTER"]
    UI["App Router · 7 Pages · SCADA Industrial Theme"]:::fe
  end

  subgraph BE["RENDER — FASTAPI PYTHON AGENT"]
    Router{{"Intent Router · vector / sql / hybrid"}}:::be
    VTool["VectorSearchTool · HNSW cosine similarity"]:::be
    STool["SQLQueryTool · SELECT-only guardrails"]:::be
    GTool["GraphTool · knowledge graph traversal"]:::be
    Synth["Claude Sonnet 4.6 · Reasoning + Citation"]:::be
  end

  subgraph DB["NEON — POSTGRESQL 16 + PGVECTOR"]
    IE[("incident_embeddings · 10k x 384-dim vectors")]:::db
    IR[("incident_reports · 10,000 rows")]:::db
    MD[("manufacturing_defects · 4,240 rows")]:::db
    ML[("maintenance_logs · 6,169 rows")]:::db
    GN[("graph_node · 14,352 nodes")]:::db
    GE[("graph_edge · 88,150 edges")]:::db
  end

  subgraph ING["INGEST PIPELINE — ONE-TIME SETUP"]
    KL["Kaggle Loader · 3 OSS datasets"]:::ing
    EMB["all-MiniLM-L6-v2 · 384-dim embeddings"]:::ing
    GB["spaCy Graph Builder · NER + co-occurrence"]:::ing
  end

  subgraph EXT["EXTERNAL SERVICES"]
    Kaggle["Kaggle Hub"]:::ext
    AnthAPI["Anthropic API"]:::ext
  end

  U --> UI --> Router
  Router -->|vector| VTool
  Router -->|sql| STool
  Router -->|hybrid| GTool
  VTool & STool & GTool --> Synth
  Synth --> AnthAPI
  VTool --> IE
  STool --> IR & MD & ML
  GTool --> GN & GE
  KL --> Kaggle
  KL --> IR & MD & ML
  KL --> EMB --> IE
  KL --> GB --> GN & GE
`;

const ENTERPRISE_DIAGRAM = `
flowchart TB
  classDef src   fill:#1a0a05,stroke:#fb923c,color:#fdba74,stroke-width:2px
  classDef bus   fill:#05050f,stroke:#60a5fa,color:#93c5fd,stroke-width:2px
  classDef gw    fill:#051205,stroke:#4ade80,color:#86efac,stroke-width:2px
  classDef ag    fill:#05050f,stroke:#00d4ff,color:#7dd3fc,stroke-width:2px
  classDef store fill:#0f051a,stroke:#a78bfa,color:#c4b5fd,stroke-width:2px
  classDef llm   fill:#1a0514,stroke:#f472b6,color:#f9a8d4,stroke-width:2px
  classDef out   fill:#051209,stroke:#34d399,color:#6ee7b7,stroke-width:2px

  subgraph SRC["ENTERPRISE DATA SOURCES"]
    ERP["SAP / ERP · Defect Records"]:::src
    MES["IoT / MES · Sensor Streams"]:::src
    CMMS["CMMS · Maintenance Work Orders"]:::src
    DMS["Document Store · SOPs · NCRs · Reports"]:::src
  end

  subgraph BUS["DATA INGESTION LAYER"]
    Kafka["Apache Kafka · Event Streaming"]:::bus
    ETL["Airflow ETL · Pipeline Orchestration"]:::bus
    EMBCluster["GPU Embedding Cluster · batch encode"]:::bus
    NLP["NER Pipeline · spaCy · HuggingFace"]:::bus
  end

  subgraph GW["SECURITY + API GATEWAY"]
    Gateway["Kong API Gateway · WAF · Rate Limiting"]:::gw
    Auth["SSO · LDAP · OAuth2 · RBAC · Multi-tenant"]:::gw
  end

  subgraph AG["KUBERNETES AGENT CLUSTER"]
    LB["Load Balancer · Health Checks"]:::ag
    Agents["Agent Workers · N replicas · auto-scale HPA"]:::ag
    Redis["Redis Cluster · Session + Response Cache"]:::ag
    Queue["Celery Job Queue · async long-running tasks"]:::ag
  end

  subgraph STORE["ENTERPRISE DATA LAYER"]
    VDB["pgvector Cluster · HNSW sharded by tenant"]:::store
    PGHA["PostgreSQL HA · Primary + 2 Read Replicas"]:::store
    ES["Elasticsearch · BM25 + full-text hybrid search"]:::store
    GDB["Neo4j Graph DB · 100M+ edge knowledge graph"]:::store
    DW["Snowflake / BigQuery · Analytics Warehouse"]:::store
  end

  subgraph LLMS["LLM GATEWAY"]
    Primary["Claude Sonnet 4.6 · Primary Reasoning"]:::llm
    Fallback["GPT-4o · Automatic Failover"]:::llm
    Monitor["Cost + Token Monitor · Budget Alerts"]:::llm
  end

  subgraph OUT["ENTERPRISE CONSUMERS"]
    WebApp["Multi-tenant Web App · Vercel Edge CDN"]:::out
    RESTAPI["REST / GraphQL API · Third-party integrations"]:::out
    BI["Tableau · Power BI · Grafana dashboards"]:::out
    Audit["Audit Trail · SOC 2 · ISO 27001 · ITAR"]:::out
  end

  ERP & MES & CMMS & DMS --> Kafka --> ETL
  ETL --> EMBCluster & NLP & PGHA & DW
  EMBCluster --> VDB
  NLP --> GDB
  ETL --> ES

  WebApp & RESTAPI & BI --> Gateway --> Auth --> LB --> Agents
  Agents --> Redis & Queue
  Agents --> VDB & PGHA & ES & GDB
  Agents --> Primary & Fallback
  Primary & Fallback --> Monitor
  DW --> BI
  Agents --> Audit
`;

// ── Layer description cards ────────────────────────────────────────────────

const MVP_LAYERS = [
  {
    icon: Globe,
    accentVar: "--col-green",
    label: "Frontend · Vercel",
    desc: "Next.js 16 App Router with 7 pages (Chat, Dashboard, Data, FAQ, Review, Examples, Diagram). Deployed globally via Vercel CDN. Industrial SCADA theme with Orbitron, Rajdhani, and JetBrains Mono fonts.",
  },
  {
    icon: Zap,
    accentVar: "--col-amber",
    label: "Agent Backend · Render",
    desc: "FastAPI Python service hosting the intent router, three tool classes, and the Claude synthesis step. Intent router classifies every query as vector-only, SQL-only, or hybrid before invoking the correct tool chain.",
  },
  {
    icon: Database,
    accentVar: "--col-purple",
    label: "Neon PostgreSQL 16 + pgvector",
    desc: "Serverless PostgreSQL with pgvector extension. Stores 10k incident reports, 4.2k manufacturing defects, 6.2k maintenance logs, 10k embedding vectors (384-dim HNSW index), and 14k graph nodes + 88k edges.",
  },
  {
    icon: Layers,
    accentVar: "--col-green",
    label: "Ingest Pipeline",
    desc: "Downloads 3 Kaggle OSS datasets via kagglehub, maps columns to canonical schemas, generates 10k synthetic incident reports, embeds narratives with all-MiniLM-L6-v2 (384-dim), and builds a knowledge graph with spaCy NER.",
  },
  {
    icon: Cpu,
    accentVar: "--col-red",
    label: "External Services",
    desc: "Kaggle Hub for open source datasets (fahmidachowdhury, merishnasuwal, rabieelkharoua). Anthropic API (Claude Sonnet 4.6) for reasoning, synthesis, and citation generation in every query response.",
  },
];

const ENT_LAYERS = [
  {
    icon: Server,
    accentVar: "--col-amber",
    label: "Enterprise Data Sources",
    desc: "SAP / ERP systems provide structured defect records. IoT / MES platforms stream real-time sensor telemetry. CMMS tracks maintenance work orders. Document stores hold SOPs, NCRs, inspection reports, and audit packages.",
  },
  {
    icon: Layers,
    accentVar: "--col-blue",
    label: "Data Ingestion Layer",
    desc: "Apache Kafka ingests high-throughput event streams. Airflow orchestrates batch ETL pipelines. GPU-backed embedding clusters encode documents at scale. HuggingFace + spaCy NER pipelines extract entities for the knowledge graph.",
  },
  {
    icon: Shield,
    accentVar: "--col-green",
    label: "Security + API Gateway",
    desc: "Kong API Gateway enforces WAF rules, rate limits, and API key authentication. SSO / LDAP / OAuth2 provide enterprise identity. RBAC and multi-tenant isolation ensure data sovereignty across business units.",
  },
  {
    icon: Cpu,
    accentVar: "--col-cyan",
    label: "Kubernetes Agent Cluster",
    desc: "Horizontally auto-scaled agent worker pods (HPA). Redis cluster caches session state and frequent query results for sub-100ms repeat responses. Celery job queue handles async long-running analysis and report generation.",
  },
  {
    icon: Database,
    accentVar: "--col-purple",
    label: "Enterprise Data Layer",
    desc: "pgvector sharded by tenant with HNSW indexes. PostgreSQL HA with primary + 2 read replicas. Elasticsearch for BM25 + full-text hybrid retrieval. Neo4j for 100M+ edge knowledge graph traversal. Snowflake / BigQuery for analytical reporting.",
  },
  {
    icon: Zap,
    accentVar: "--col-pink",
    label: "LLM Gateway",
    desc: "Claude Sonnet 4.6 as primary reasoning engine with automatic GPT-4o failover. Token budget monitoring, per-tenant cost allocation, and alert thresholds prevent runaway inference costs at enterprise scale.",
  },
  {
    icon: Users,
    accentVar: "--col-green",
    label: "Enterprise Consumers",
    desc: "Multi-tenant web app on Vercel Edge CDN. REST + GraphQL APIs for ERP/MES integrations. Tableau / Power BI / Grafana for embedded analytics. Full audit trail for SOC 2 Type II, ISO 27001, and ITAR compliance.",
  },
];

type TabId = "mvp" | "enterprise";

// ── Shared styles ──────────────────────────────────────────────────────────

const MONO: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
};

const DISPLAY: React.CSSProperties = {
  fontFamily: "var(--font-display)",
};

const BODY: React.CSSProperties = {
  fontFamily: "var(--font-body)",
};

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

function LayerCard({
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
        <span
          style={{
            ...MONO,
            fontSize: "0.65rem",
            letterSpacing: "0.1em",
            color: accent,
          }}
        >
          {label.toUpperCase()}
        </span>
      </div>
      <p
        style={{
          ...BODY,
          fontSize: "0.82rem",
          color: "hsl(var(--text-secondary))",
          lineHeight: 1.55,
          margin: 0,
        }}
      >
        {desc}
      </p>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function DiagramPage() {
  const [activeTab, setActiveTab] = useState<TabId>("mvp");

  const tabs: { id: TabId; label: string; sub: string }[] = [
    { id: "mvp",        label: "MVP ARCHITECTURE",  sub: "Current deployed stack" },
    { id: "enterprise", label: "ENTERPRISE SCALE",  sub: "Production-grade evolution" },
  ];

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

          <GitBranch size={14} style={{ color: "hsl(var(--col-cyan))" }} />
          <span
            style={{
              ...DISPLAY,
              fontSize: "0.7rem",
              letterSpacing: "0.15em",
              color: "hsl(var(--col-cyan))",
            }}
          >
            ARCHITECTURE DIAGRAMS
          </span>

          <span
            style={{
              ...MONO,
              fontSize: "0.6rem",
              color: "hsl(var(--text-dim))",
              letterSpacing: "0.06em",
            }}
          >
            // NextAgentAI · MVP + Enterprise Scale
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <NavDropdown />
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
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 8,
            }}
          >
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
              SYSTEM ARCHITECTURE
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
            Two architecture views — the current MVP running on Vercel + Render + Neon, and a
            production enterprise evolution on Kubernetes with multi-region data layer, LLM gateway,
            and enterprise security controls.
          </p>

          {/* Stat pills */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginLeft: 13 }}>
            {[
              { label: "133k+ rows ingested",  col: "--col-green"  },
              { label: "10k embeddings · 384-dim", col: "--col-cyan" },
              { label: "88k graph edges",       col: "--col-purple" },
              { label: "3 intent routes",       col: "--col-amber"  },
              { label: "3 Kaggle OSS datasets", col: "--col-blue"   },
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
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
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
                  ? "2px solid hsl(var(--col-cyan))"
                  : "2px solid transparent",
                backgroundColor: "transparent",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              <span
                style={{
                  ...MONO,
                  fontSize: "0.65rem",
                  letterSpacing: "0.1em",
                  color: active ? "hsl(var(--col-cyan))" : "hsl(var(--text-secondary))",
                }}
              >
                {tab.label}
              </span>
              <span
                style={{
                  ...BODY,
                  fontSize: "0.7rem",
                  color: "hsl(var(--text-dim))",
                }}
              >
                {tab.sub}
              </span>
            </button>
          );
        })}
      </nav>

      {/* ── Content ── */}
      <main style={{ flex: 1, padding: "28px 32px 48px", maxWidth: 1280, width: "100%", margin: "0 auto" }}>

        {activeTab === "mvp" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

            {/* Diagram panel */}
            <div
              style={{
                position: "relative",
                backgroundColor: "hsl(var(--bg-surface))",
                border: "1px solid hsl(var(--border-base))",
                padding: "0",
              }}
            >
              <CornerBracket pos="tl" /><CornerBracket pos="tr" />
              <CornerBracket pos="bl" /><CornerBracket pos="br" />

              {/* Panel header */}
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
                <div
                  style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "hsl(var(--col-green))" }}
                />
                <span style={{ ...MONO, fontSize: "0.62rem", letterSpacing: "0.1em", color: "hsl(var(--col-green))" }}>
                  MVP ARCHITECTURE — CURRENT DEPLOYED STACK
                </span>
                <span style={{ ...MONO, fontSize: "0.55rem", color: "hsl(var(--text-dim))", marginLeft: "auto" }}>
                  Vercel · Render · Neon · Anthropic
                </span>
              </div>

              {/* Diagram */}
              <div style={{ padding: "24px 20px" }}>
                <MermaidDiagram id="mvp-arch" chart={MVP_DIAGRAM} />
              </div>

              {/* Legend row */}
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
                {[
                  { col: "#7dd3fc", label: "Users" },
                  { col: "#86efac", label: "Frontend" },
                  { col: "#fdba74", label: "Backend / Agent" },
                  { col: "#c4b5fd", label: "PostgreSQL / pgvector" },
                  { col: "#6ee7b7", label: "Ingest Pipeline" },
                  { col: "#fca5a5", label: "External APIs" },
                ].map(({ col, label }) => (
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
            </div>

            {/* Layer description grid */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <ChevronRight size={13} style={{ color: "hsl(var(--col-cyan))" }} />
                <span style={{ ...MONO, fontSize: "0.62rem", letterSpacing: "0.1em", color: "hsl(var(--text-secondary))" }}>
                  LAYER BREAKDOWN
                </span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                  gap: 12,
                }}
              >
                {MVP_LAYERS.map((layer) => (
                  <LayerCard key={layer.label} {...layer} />
                ))}
              </div>
            </div>

            {/* Request flow sequence */}
            <div
              style={{
                backgroundColor: "hsl(var(--bg-surface))",
                border: "1px solid hsl(var(--border-base))",
                borderLeft: "3px solid hsl(var(--col-cyan))",
                padding: "16px 20px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <BarChart3 size={13} style={{ color: "hsl(var(--col-cyan))" }} />
                <span style={{ ...MONO, fontSize: "0.62rem", letterSpacing: "0.1em", color: "hsl(var(--col-cyan))" }}>
                  REQUEST FLOW — STEP BY STEP
                </span>
              </div>
              <ol
                style={{
                  ...BODY,
                  fontSize: "0.85rem",
                  color: "hsl(var(--text-secondary))",
                  lineHeight: 1.8,
                  margin: 0,
                  paddingLeft: 20,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                {[
                  "User types a natural-language query in the Chat or Dashboard panel.",
                  "Next.js client POSTs to the FastAPI backend on Render via NEXT_PUBLIC_API_URL.",
                  "The Intent Router classifies the query as vector-only, SQL-only, or hybrid using keyword and semantic heuristics.",
                  "VectorSearchTool: encodes the query with all-MiniLM-L6-v2, runs HNSW cosine search against incident_embeddings in pgvector.",
                  "SQLQueryTool: builds a SELECT statement (guardrails block all non-SELECT statements), queries incident_reports / defects / logs tables.",
                  "GraphTool: traverses the knowledge graph (graph_node + graph_edge) to find co-occurrence paths between entities.",
                  "All retrieved evidence (chunks, rows, graph paths) is assembled into a prompt and sent to Claude Sonnet 4.6 via Anthropic API.",
                  "Claude synthesises a cited answer. The response (answer + evidence + assumptions + next_steps) is returned to the frontend.",
                  "The frontend renders the answer with highlighted citations, tool-call trace in the AgentTimeline, and graph nodes in GraphViewer.",
                ].map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
          </div>
        )}

        {activeTab === "enterprise" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

            {/* Diagram panel */}
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
                <div
                  style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "hsl(var(--col-purple))" }}
                />
                <span style={{ ...MONO, fontSize: "0.62rem", letterSpacing: "0.1em", color: "hsl(var(--col-purple))" }}>
                  ENTERPRISE SCALE ARCHITECTURE — PRODUCTION EVOLUTION
                </span>
                <span style={{ ...MONO, fontSize: "0.55rem", color: "hsl(var(--text-dim))", marginLeft: "auto" }}>
                  Kubernetes · Kafka · Neo4j · Snowflake · Kong
                </span>
              </div>

              <div style={{ padding: "24px 20px" }}>
                <MermaidDiagram id="enterprise-arch" chart={ENTERPRISE_DIAGRAM} />
              </div>

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
                {[
                  { col: "#fdba74", label: "Data Sources" },
                  { col: "#93c5fd", label: "Ingestion Layer" },
                  { col: "#86efac", label: "Security / Gateway" },
                  { col: "#7dd3fc", label: "Agent Cluster (K8s)" },
                  { col: "#c4b5fd", label: "Data Layer" },
                  { col: "#f9a8d4", label: "LLM Gateway" },
                  { col: "#6ee7b7", label: "Enterprise Consumers" },
                ].map(({ col, label }) => (
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
            </div>

            {/* Layer description grid */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <ChevronRight size={13} style={{ color: "hsl(var(--col-purple))" }} />
                <span style={{ ...MONO, fontSize: "0.62rem", letterSpacing: "0.1em", color: "hsl(var(--text-secondary))" }}>
                  ENTERPRISE LAYER BREAKDOWN
                </span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                  gap: 12,
                }}
              >
                {ENT_LAYERS.map((layer) => (
                  <LayerCard key={layer.label} {...layer} />
                ))}
              </div>
            </div>

            {/* MVP → Enterprise migration path */}
            <div
              style={{
                backgroundColor: "hsl(var(--bg-surface))",
                border: "1px solid hsl(var(--border-base))",
                borderLeft: "3px solid hsl(var(--col-purple))",
                padding: "16px 20px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <Layers size={13} style={{ color: "hsl(var(--col-purple))" }} />
                <span style={{ ...MONO, fontSize: "0.62rem", letterSpacing: "0.1em", color: "hsl(var(--col-purple))" }}>
                  MVP → ENTERPRISE MIGRATION PATH
                </span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                  gap: 12,
                }}
              >
                {[
                  {
                    phase: "Phase 1 — Auth & Multi-tenancy",
                    col: "--col-green",
                    items: [
                      "Add SSO / LDAP via Auth.js or Clerk",
                      "Namespace all DB rows by tenant_id",
                      "RBAC middleware on FastAPI routes",
                      "Vercel team/org project isolation",
                    ],
                  },
                  {
                    phase: "Phase 2 — Scale Data Layer",
                    col: "--col-cyan",
                    items: [
                      "Partition pgvector by tenant (shard key)",
                      "Add read replicas to Neon (or migrate to RDS)",
                      "Introduce Redis for response caching",
                      "Add Elasticsearch for BM25 hybrid retrieval",
                    ],
                  },
                  {
                    phase: "Phase 3 — Streaming Ingestion",
                    col: "--col-amber",
                    items: [
                      "Replace batch Kaggle loader with Kafka consumers",
                      "Deploy Airflow for orchestrated ETL pipelines",
                      "GPU embedding cluster for real-time indexing",
                      "Migrate graph to Neo4j for 100M+ edge scale",
                    ],
                  },
                  {
                    phase: "Phase 4 — LLM & Operations",
                    col: "--col-purple",
                    items: [
                      "Add LLM gateway (model router + fallback)",
                      "Token budget + cost monitoring per tenant",
                      "Containerise agent into K8s pods + HPA",
                      "SOC 2 audit trail, ITAR data residency controls",
                    ],
                  },
                ].map(({ phase, col, items }) => (
                  <div
                    key={phase}
                    style={{
                      backgroundColor: "hsl(var(--bg-void))",
                      border: `1px solid hsl(var(${col}) / 0.3)`,
                      padding: "12px 14px",
                    }}
                  >
                    <div
                      style={{
                        ...MONO,
                        fontSize: "0.6rem",
                        letterSpacing: "0.08em",
                        color: `hsl(var(${col}))`,
                        marginBottom: 8,
                      }}
                    >
                      {phase.toUpperCase()}
                    </div>
                    <ul
                      style={{
                        ...BODY,
                        fontSize: "0.8rem",
                        color: "hsl(var(--text-secondary))",
                        margin: 0,
                        paddingLeft: 16,
                        lineHeight: 1.7,
                      }}
                    >
                      {items.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
