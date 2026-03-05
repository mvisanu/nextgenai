"use client";

// ============================================================
// faq/page.tsx — System Documentation & FAQ
// Industrial SCADA aesthetic matching the main app panels
// ============================================================

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  HelpCircle,
  MessageSquare,
  Layers,
  BarChart2,
  TrendingUp,
  FlaskConical,
  Monitor,
  ChevronDown,
  ChevronUp,
  Network,
  GitBranch,
} from "lucide-react";
import { ThemeToggle, FontSizeControl } from "../lib/theme";

// ── Shared style constants ────────────────────────────────────────────────────

const MONO: React.CSSProperties = { fontFamily: "var(--font-mono)" };
const DISP: React.CSSProperties = { fontFamily: "var(--font-display)" };

// ── Types ─────────────────────────────────────────────────────────────────────

interface QA {
  q: string;
  a: string;
}

interface FaqSection {
  id: string;
  tabLabel: string;
  tabNum: string;
  icon: React.ElementType;
  accentVar: string;
  description: string;
  items: QA[];
}

// ── FAQ data ──────────────────────────────────────────────────────────────────

const FAQ_SECTIONS: FaqSection[] = [
  {
    id: "main-app",
    tabLabel: "MAIN APP",
    tabNum: "00",
    icon: Monitor,
    accentVar: "--col-green",
    description:
      "The main application interface at / provides three integrated panels: the Chat Query Interface, the Knowledge Graph, and the Agent Execution Trace.",
    items: [
      {
        q: "How do I submit a query to the agent?",
        a: 'Type your question or incident description into the COMMS // QUERY INTERFACE panel on the left. Press Enter or click the send button to submit. The agent will route your query through the appropriate tool chain (vector search, SQL, or graph traversal) and return a cited answer with evidence references.',
      },
      {
        q: "What are the three search modes — vector, SQL, and graph?",
        a: "The three status indicators in the header (VECTOR / SQL / GRAPH) represent the agent's tool chain. VECTOR search uses semantic embedding similarity to find incidents with narratively similar descriptions. SQL executes structured queries against the manufacturing defects and maintenance log databases. GRAPH traversal explores entity relationships in the knowledge graph. The agent's intent router automatically selects the appropriate mode — or combines them in a hybrid call — based on the nature of your query.",
      },
      {
        q: "What does the Knowledge Graph show?",
        a: "The KNOWLEDGE GRAPH // REACTFLOW panel visualises the entity relationships discovered from your data — incidents, assets, defect types, systems, and maintenance events are represented as nodes. Edges indicate relationships such as 'related defect' or 'maintenance performed on'. You can pan and zoom the graph, and clicking a node may highlight its neighbours. The graph updates when a query returns relational evidence.",
      },
      {
        q: "What is the Agent Execution Trace?",
        a: "The AGENT EXECUTION TRACE panel (bottom-left) shows a chronological step-by-step log of every tool call the agent made while answering your query. Each step shows the tool name, input parameters, execution latency in milliseconds, and a summary of the output. This lets you audit exactly how the agent reached its conclusion.",
      },
      {
        q: "How do citation numbers in the chat response work?",
        a: "Inline citations appear as bracketed numbers (e.g. [1], [2]) within the agent's answer text. Each number maps to a specific evidence record — either a vector-retrieved incident excerpt, a SQL result row, or a graph node — listed in the EVIDENCE section below the answer. Clicking a citation number highlights the corresponding evidence entry.",
      },
      {
        q: "Can I use the chat for free-text narrative queries?",
        a: "Yes. The vector search mode is optimised for unstructured natural language descriptions. Describing a symptom such as 'hydraulic leak near actuator, suspected seal degradation' will retrieve the most semantically similar incident records from the database, ranked by cosine similarity score.",
      },
    ],
  },
  {
    id: "agent",
    tabLabel: "ASK THE AGENT",
    tabNum: "01",
    icon: MessageSquare,
    accentVar: "--col-green",
    description:
      "Tab 01 provides an embedded agent query interface with suggested prompts, similarity-ranked incident results, a reasoned synthesis, and an expandable tool call trace.",
    items: [
      {
        q: "How do I use the suggested query chips?",
        a: "Below the text input you will find three pre-populated query chips showing representative incident descriptions. Clicking any chip copies that text into the input field so you can submit it immediately or edit it first. These suggestions demonstrate the kinds of queries the vector search mode handles best — component failure narratives with specific system and symptom detail.",
      },
      {
        q: "What does the confidence score on each similar incident mean?",
        a: "The score bar next to each retrieved incident shows the cosine similarity between your query embedding and the incident's stored embedding vector. A score of 0.90+ (shown in green) indicates very high semantic similarity. Scores of 0.75–0.89 (cyan) indicate moderate similarity. Below 0.75 (amber) the match is weaker and the agent may be extrapolating from partially relevant context.",
      },
      {
        q: "What do the HIGH / MED / LOW confidence labels on recommended actions mean?",
        a: "Each recommended action carries a confidence chip derived from the strength of the supporting evidence. HIGH (green) means the action is supported by multiple high-similarity incidents and confirmed SQL data. MEDIUM (amber) means the action is plausible but the evidence base is thinner. LOW (cyan) means the recommendation is speculative — based on partial pattern matches — and should be validated before execution.",
      },
      {
        q: "How do I read the tool call trace?",
        a: "Click the 'TOOL CALL TRACE' row at the bottom of the results panel to expand it. Each entry shows: the tool name (e.g. VectorSearchTool or SQLQueryTool), the input sent to that tool, the latency in milliseconds, and a summary of the output returned. An amber triangle icon appears if a tool call exceeded 1,000 ms. Use this trace to understand why the agent retrieved the evidence it did.",
      },
      {
        q: "What does the left-border colour on each incident result indicate?",
        a: "The coloured left border mirrors the severity classification of that incident record: red for Critical, amber for High, cyan for Medium, and green for Low. This lets you quickly prioritise which results warrant immediate attention without reading the full text.",
      },
      {
        q: "Can I compare results across multiple queries?",
        a: "Currently each query replaces the previous result set. To compare results, submit one query and take note of the incident IDs and scores, then navigate to the INCIDENT EXPLORER tab (Tab 02) where you can filter and inspect those specific records side-by-side with their full narrative text and corrective action history.",
      },
    ],
  },
  {
    id: "explorer",
    tabLabel: "INCIDENT EXPLORER",
    tabNum: "02",
    icon: Layers,
    accentVar: "--col-cyan",
    description:
      "Tab 02 is a full-featured incident record browser with text search, multi-dimensional filtering, and a split-panel detail view showing full narratives and corrective actions.",
    items: [
      {
        q: "How do I filter the incident list?",
        a: "The filter bar at the top of Tab 02 provides four controls: a text search box that matches against incident ID, narrative text, and corrective action fields; a System dropdown (Hydraulic, Avionics, Structural, Propulsion, Electronics); a Severity dropdown (Critical, High, Medium, Low); and a date range picker with From and To fields. All filters are applied simultaneously and the record count updates live.",
      },
      {
        q: "What do the four severity levels mean?",
        a: "CRITICAL (red): immediate safety risk, requires grounding or line-stop action. HIGH (amber): significant defect with potential for imminent failure, prioritised repair within 24 hours. MEDIUM (cyan): notable anomaly that should be addressed in the next scheduled maintenance window. LOW (green): minor observation, logged for trend monitoring but no immediate action required.",
      },
      {
        q: "How do I open the full incident detail view?",
        a: "Click any incident row in the list. The list panel narrows to 42% width and a detail panel slides in from the right showing the incident ID, severity badge, asset ID, system, date, full narrative text, corrective action taken, and linked defect and maintenance record IDs. Click the X button in the detail panel header or click the same row again to close it.",
      },
      {
        q: "What is the corrective action field?",
        a: "The CORRECTIVE ACTION field records the engineering response that was performed after the incident was logged. It may include part replacements, inspections, torque re-checks, harness re-routing, or quarantine decisions. This field is the ground-truth for training the agent's recommendation engine — high-similarity incidents will surface these actions as suggestions in Tab 01.",
      },
      {
        q: "What does the similarity bar on each list row represent?",
        a: "Each incident row shows a horizontal score bar. This is a computed semantic similarity mock score based on incident severity and recency — Critical incidents score higher because they tend to produce more distinctive narrative embeddings. In a production system this bar would reflect actual cosine similarity against a reference query embedding.",
      },
      {
        q: "Can I search across narrative and corrective action text at the same time?",
        a: "Yes. The text search field matches against the full narrative text, the corrective action text, and the incident ID simultaneously. Entering a keyword like 'seal' will surface all incidents where that term appears in any of those three fields, regardless of which system or severity filter is active.",
      },
    ],
  },
  {
    id: "defects",
    tabLabel: "DEFECT ANALYTICS",
    tabNum: "03",
    icon: BarChart2,
    accentVar: "--col-red",
    description:
      "Tab 03 displays KPI cards and a 2×2 chart grid covering defect type distribution, severity breakdown by system, weekly defect trends, and TF-IDF keyword themes.",
    items: [
      {
        q: "What do the three KPI cards at the top show?",
        a: "The first card shows TOTAL DEFECTS year-to-date (168 across 5 systems over 15 weeks). The second card shows CRITICAL DEFECTS count (15) and what percentage of total they represent (8.9%), plus the change from the previous period. The third card shows the TOP DEFECT TYPE by occurrence count — currently Seal Failure at 34 occurrences (20.2% of total). These cards give an at-a-glance system health summary.",
      },
      {
        q: "How do I read the Defects by Type chart?",
        a: "The DEFECTS BY TYPE bar chart (top-left) shows defect occurrence counts grouped by failure category on the X axis. Bar height represents the number of recorded defects of that type. Longer bars indicate defect types requiring systemic attention. Hover over any bar to see the exact count in the dark tooltip.",
      },
      {
        q: "What does the Severity Distribution by System chart show?",
        a: "The SEVERITY DISTRIBUTION BY SYSTEM stacked bar chart (top-right) breaks down defect severity across each of the five manufacturing systems. Each bar segment colour represents a severity level: red (Critical), amber (High), cyan (Medium), green (Low). A taller red segment on a given system indicates a disproportionate concentration of critical defects in that area — a leading indicator of systemic risk.",
      },
      {
        q: "How do I interpret the weekly trend line?",
        a: "The DEFECT TREND BY WEEK line chart (bottom-left) plots the total number of defects recorded each week. An upward trend indicates increasing failure rates — potentially driven by seasonal factors, aging components, or process drift. A downward trend following a corrective action period indicates the intervention was effective. Look for inflection points that correlate with maintenance events visible in Tab 04.",
      },
      {
        q: "What is the Incident Themes chart?",
        a: "The INCIDENT THEMES chart (bottom-right) is a horizontal bar chart showing the top keywords extracted from incident narrative text using TF-IDF scoring. Keywords with higher frequency scores appear as longer bars. These themes reveal the vocabulary that most distinguishes your incident corpus — useful for identifying root cause clusters and tuning the agent's vector search.",
      },
      {
        q: "Are the charts interactive?",
        a: "Yes. Hover over any bar or line point to see an exact value tooltip with a dark industrial style. The tooltip shows the data series name and the precise value at that point. The charts are rendered with Recharts and support responsive resizing when the browser window changes size.",
      },
    ],
  },
  {
    id: "maintenance",
    tabLabel: "MAINTENANCE TRENDS",
    tabNum: "04",
    icon: TrendingUp,
    accentVar: "--col-amber",
    description:
      "Tab 04 visualises time-series sensor or operational metrics for individual assets, with a before/after corrective action comparison and computed delta statistics.",
    items: [
      {
        q: "How do I switch between assets?",
        a: "Use the ASSET SELECT dropdown at the top of the tab. Each option represents a tracked physical asset (e.g. ASSET-001 through ASSET-005). Selecting an asset loads its specific metric time series, updates both charts, and recalculates the PRE-AVG, POST-AVG, and DELTA statistics in the selector bar. The metric label also updates to reflect what is being measured for that asset (e.g. Vibration (mm/s), Oil Pressure (PSI), or Temperature (°C)).",
      },
      {
        q: "What does the amber dashed vertical reference line mean?",
        a: "The dashed amber vertical line in the METRICS OVER TIME chart marks the point in time at which a corrective maintenance action was performed. It is labelled 'ACTION' in small display font. Data points before this line constitute the PRE-ACTION PHASE; data points after it constitute the POST-ACTION PHASE. The amber dot on the line at the action timestamp is larger than the surrounding cyan data dots to make it visually distinct.",
      },
      {
        q: "What does the before/after comparison panel show?",
        a: "The BEFORE / AFTER CORRECTIVE ACTION COMPARISON panel (below the main trend chart) splits the metric time series into two sub-charts rendered side by side. The left sub-chart (amber header: PRE-ACTION PHASE) shows the metric behaviour before the corrective event. The right sub-chart (green header: POST-ACTION PHASE) shows behaviour after. This visual split makes it easy to see whether the intervention reduced vibration, restored pressure, or corrected a temperature drift.",
      },
      {
        q: "How do I interpret the IMPROVEMENT CONFIRMED / DEGRADATION DETECTED banner?",
        a: "If the post-action average is lower than the pre-action average (for metrics where lower is better, such as vibration), a green IMPROVEMENT CONFIRMED banner appears below the comparison charts, showing the corrective action timestamp and the percentage delta. If the post-action average is higher, a red DEGRADATION DETECTED banner appears instead. This provides a one-line audit trail for every maintenance intervention.",
      },
      {
        q: "What is the DELTA statistic in the selector bar?",
        a: "DELTA shows the percentage change between PRE-AVG and POST-AVG: ((postAvg - preAvg) / preAvg) × 100. A downward arrow (↓) with a green value means the metric improved after the action. An upward arrow (↑) with a red value means the metric worsened. This number is equivalent to a simple MTBF (Mean Time Between Failures) efficiency indicator when tracked across multiple maintenance cycles.",
      },
      {
        q: "What does MTBF mean in this context?",
        a: "Mean Time Between Failures (MTBF) is an industry-standard reliability metric defined as the average operating time between successive failure events. In this dashboard, the DELTA percentage after each corrective action is a proxy for MTBF improvement. A consistent downward trend in the post-action metric suggests longer intervals before the next maintenance event will be needed.",
      },
    ],
  },
  {
    id: "eval",
    tabLabel: "DATA & EVALUATION",
    tabNum: "05",
    icon: FlaskConical,
    accentVar: "--col-purple",
    description:
      "Tab 05 presents two side-by-side panels: Dataset Health (record counts and quality metrics) and Offline Evaluation Metrics (PASS/FAIL status for agent quality benchmarks).",
    items: [
      {
        q: "What does the Dataset Health panel show?",
        a: "The DATASET HEALTH panel lists metadata about each data source ingested into the system — record counts for incident reports, manufacturing defects, and maintenance logs; embedding index size; vector index coverage percentage; date range of the data; and any data quality flags such as missing field ratios. This gives operators a quick audit of the data pipeline's completeness before trusting agent output.",
      },
      {
        q: "What do the PASS / FAIL status indicators mean in the Offline Evaluation panel?",
        a: "Each row in the OFFLINE EVALUATION METRICS table represents a benchmarked quality check run against a held-out evaluation set. PASS (green check-circle) means the metric met or exceeded its target threshold. FAIL (red alert-circle) means the metric fell below the target. The overall PASS RATE bar at the top of the panel summarises what fraction of all checks are currently passing.",
      },
      {
        q: "How is the relevance score calculated?",
        a: "Relevance score measures whether the evidence chunks the agent retrieves are actually relevant to the ground-truth answer for each benchmark query. It is computed as the fraction of retrieved chunks (top-k) that were labelled as relevant by human annotators in the evaluation set. A relevance score of 0.80 means 80% of retrieved chunks were genuinely useful to answering the question.",
      },
      {
        q: "What metrics are tracked in the evaluation panel?",
        a: "The evaluation panel tracks metrics including: Vector Retrieval Relevance (how well the embedding search surfaces relevant chunks), SQL Query Accuracy (whether structured queries return the correct rows), Answer Faithfulness (whether the synthesised answer is grounded in the retrieved evidence without hallucination), Latency P95 (95th percentile response time in milliseconds), and Citation Coverage (fraction of answer claims that are backed by a numbered citation).",
      },
      {
        q: "Why might a metric show FAIL?",
        a: "A FAIL status indicates the agent is underperforming on that dimension relative to the engineering target. Common causes include: insufficient training data for a defect type (reducing vector retrieval relevance), overly broad SQL queries returning noisy rows (reducing SQL accuracy), or a synthesis model that occasionally introduces unsupported claims (reducing faithfulness). The targets shown in the VALUE / TARGET columns indicate what the engineering team has set as acceptable thresholds.",
      },
      {
        q: "How often are evaluation metrics refreshed?",
        a: "In the current demo build the evaluation data is static and represents a snapshot from the most recent benchmark run against synthetic data. In a production deployment, evaluation would be re-run automatically on a schedule (e.g. nightly) or triggered by a new model version or data ingest, with results pushed to this panel in real time.",
      },
    ],
  },
];

// ── Accordion item ─────────────────────────────────────────────────────────────

function AccordionItem({
  item,
  index,
  accentVar,
}: {
  item: QA;
  index: number;
  accentVar: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{
        border: "1px solid hsl(var(--border-base))",
        borderLeft: open
          ? `2px solid hsl(var(${accentVar}))`
          : "2px solid transparent",
        borderRadius: "2px",
        backgroundColor: open
          ? `hsl(var(${accentVar}) / 0.04)`
          : "hsl(var(--bg-elevated))",
        overflow: "hidden",
        transition: "border-color 0.15s, background-color 0.15s",
      }}
    >
      {/* Question row (trigger) */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "10px",
          width: "100%",
          padding: "11px 14px",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {/* Index badge */}
        <span
          style={{
            ...DISP,
            fontSize: "0.44rem",
            fontWeight: 700,
            letterSpacing: "0.14em",
            color: `hsl(var(${accentVar}))`,
            backgroundColor: `hsl(var(${accentVar}) / 0.1)`,
            border: `1px solid hsl(var(${accentVar}) / 0.3)`,
            borderRadius: "2px",
            padding: "1px 5px",
            flexShrink: 0,
            marginTop: "1px",
          }}
        >
          Q{String(index + 1).padStart(2, "0")}
        </span>

        {/* Question text */}
        <span
          style={{
            ...MONO,
            fontSize: "0.78rem",
            color: "hsl(var(--text-primary))",
            lineHeight: "1.5",
            flex: 1,
            fontWeight: open ? 600 : 400,
          }}
        >
          {item.q}
        </span>

        {/* Chevron */}
        {open ? (
          <ChevronUp
            size={14}
            style={{ color: `hsl(var(${accentVar}))`, flexShrink: 0, marginTop: "2px" }}
          />
        ) : (
          <ChevronDown
            size={14}
            style={{ color: "hsl(var(--text-dim))", flexShrink: 0, marginTop: "2px" }}
          />
        )}
      </button>

      {/* Answer — collapsed via max-height */}
      <div
        style={{
          maxHeight: open ? "600px" : "0",
          overflow: "hidden",
          transition: "max-height 0.25s ease",
        }}
      >
        <div
          style={{
            padding: "0 14px 14px 38px",
            borderTop: `1px solid hsl(var(--border-base))`,
          }}
        >
          <p
            style={{
              ...MONO,
              fontSize: "0.75rem",
              color: "hsl(var(--text-secondary))",
              lineHeight: "1.75",
              marginTop: "11px",
            }}
          >
            {item.a}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── FAQ section panel ──────────────────────────────────────────────────────────

function FaqPanel({ section }: { section: FaqSection }) {
  const Icon = section.icon;

  return (
    <div
      className="panel"
      style={
        {
          "--panel-accent": `hsl(var(${section.accentVar}))`,
        } as React.CSSProperties
      }
    >
      <span className="corner-tl" />
      <span className="corner-tr" />
      <span className="corner-bl" />
      <span className="corner-br" />

      {/* Panel header */}
      <div className="panel-hdr">
        <div className="panel-dot" />
        <Icon
          size={12}
          style={{ color: `hsl(var(${section.accentVar}))`, flexShrink: 0 }}
        />
        <span className="panel-hdr-title">
          TAB {section.tabNum} — {section.tabLabel}
        </span>
        <span
          style={{
            ...MONO,
            fontSize: "0.58rem",
            color: "hsl(var(--text-dim))",
            marginLeft: "auto",
          }}
        >
          {section.items.length} entries
        </span>
      </div>

      {/* Section description */}
      <div
        style={{
          padding: "10px 16px",
          borderBottom: "1px solid hsl(var(--border-base))",
          backgroundColor: "hsl(var(--bg-surface))",
          flexShrink: 0,
        }}
      >
        <p
          style={{
            ...MONO,
            fontSize: "0.7rem",
            color: "hsl(var(--text-secondary))",
            lineHeight: "1.6",
          }}
        >
          {section.description}
        </p>
      </div>

      {/* Q&A items */}
      <div
        style={{
          flex: 1,
          padding: "12px 16px 16px",
          display: "flex",
          flexDirection: "column",
          gap: "6px",
        }}
      >
        {section.items.map((item, i) => (
          <AccordionItem
            key={i}
            item={item}
            index={i}
            accentVar={section.accentVar}
          />
        ))}
      </div>
    </div>
  );
}

// ── Page header ───────────────────────────────────────────────────────────────

function FaqHeader() {
  return (
    <header
      style={{
        height: "46px",
        backgroundColor: "hsl(var(--bg-surface))",
        borderBottom: "1px solid hsl(var(--border-base))",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        flexShrink: 0,
        position: "relative",
        zIndex: 10,
      }}
    >
      {/* Left: back link + branding */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <Link
          href="/dashboard"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            color: "hsl(var(--text-secondary))",
            textDecoration: "none",
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.color =
              "hsl(var(--col-green))";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.color =
              "hsl(var(--text-secondary))";
          }}
        >
          <ArrowLeft size={13} />
          <span
            style={{
              ...MONO,
              fontSize: "0.68rem",
              letterSpacing: "0.1em",
            }}
          >
            DASHBOARD
          </span>
        </Link>

        <div
          style={{
            width: 1,
            height: 16,
            backgroundColor: "hsl(var(--border-strong))",
          }}
        />

        {/* Diamond logo */}
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 22,
            height: 22,
          }}
        >
          <div
            style={{
              position: "absolute",
              width: 18,
              height: 18,
              border: "1.5px solid hsl(var(--col-green))",
              transform: "rotate(45deg)",
              boxShadow: "0 0 8px hsl(var(--col-green) / 0.3)",
            }}
          />
          <div
            style={{
              width: 8,
              height: 8,
              backgroundColor: "hsl(var(--col-green))",
              transform: "rotate(45deg)",
              boxShadow: "0 0 6px hsl(var(--col-green))",
            }}
          />
        </div>

        <span
          style={{
            ...DISP,
            fontSize: "0.75rem",
            fontWeight: 700,
            letterSpacing: "0.2em",
            color: "hsl(var(--text-primary))",
          }}
        >
          NEXT
          <span style={{ color: "hsl(var(--col-green))" }}>AGENT</span>
          AI
        </span>

        <span
          style={{
            ...MONO,
            fontSize: "0.65rem",
            color: "hsl(var(--text-dim))",
            letterSpacing: "0.08em",
          }}
        >
          // SYSTEM DOCUMENTATION
        </span>
      </div>

      {/* Right: ThemeToggle */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <HelpCircle size={12} style={{ color: "hsl(var(--col-cyan))" }} />
        <span
          style={{
            ...MONO,
            fontSize: "0.65rem",
            color: "hsl(var(--text-secondary))",
            letterSpacing: "0.08em",
          }}
        >
          FAQ — REV 1.0.0
        </span>
        <div
          style={{
            width: 1,
            height: 16,
            backgroundColor: "hsl(var(--border-strong))",
          }}
        />
        <FontSizeControl />
        <ThemeToggle />
      </div>
    </header>
  );
}

// ── Hero section ──────────────────────────────────────────────────────────────

function Hero() {
  return (
    <div
      style={{
        padding: "32px 32px 24px",
        borderBottom: "1px solid hsl(var(--border-base))",
        backgroundColor: "hsl(var(--bg-surface))",
        flexShrink: 0,
      }}
    >
      {/* Breadcrumb */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "14px",
        }}
      >
        <span
          style={{
            ...MONO,
            fontSize: "0.6rem",
            color: "hsl(var(--text-dim))",
            letterSpacing: "0.1em",
          }}
        >
          NEXTAGENTAI
        </span>
        <span style={{ color: "hsl(var(--text-dim))", fontSize: "0.6rem" }}>
          /
        </span>
        <span
          style={{
            ...MONO,
            fontSize: "0.6rem",
            color: "hsl(var(--col-cyan))",
            letterSpacing: "0.1em",
          }}
        >
          DOCUMENTATION
        </span>
        <span style={{ color: "hsl(var(--text-dim))", fontSize: "0.6rem" }}>
          /
        </span>
        <span
          style={{
            ...MONO,
            fontSize: "0.6rem",
            color: "hsl(var(--text-secondary))",
            letterSpacing: "0.1em",
          }}
        >
          FAQ
        </span>
      </div>

      {/* Title */}
      <h1
        style={{
          ...DISP,
          fontSize: "1.55rem",
          fontWeight: 900,
          letterSpacing: "0.18em",
          color: "hsl(var(--text-primary))",
          lineHeight: 1.1,
          marginBottom: "8px",
          textTransform: "uppercase",
        }}
        className="glow-green"
      >
        SYSTEM DOCUMENTATION
        <span
          style={{
            color: "hsl(var(--col-green))",
            display: "block",
            fontSize: "1.1rem",
          }}
        >
          // FAQ
        </span>
      </h1>

      {/* Subtitle */}
      <p
        style={{
          ...MONO,
          fontSize: "0.78rem",
          color: "hsl(var(--text-secondary))",
          lineHeight: "1.6",
          maxWidth: "680px",
          marginBottom: "20px",
        }}
      >
        Reference documentation covering the main application panels and all five
        dashboard tabs. Each section explains what a component does, how to
        interact with it, and how to interpret the data it displays.
      </p>

      {/* Quick-nav pills */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {FAQ_SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <a
              key={section.id}
              href={`#${section.id}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                padding: "3px 10px",
                border: `1px solid hsl(var(${section.accentVar}) / 0.35)`,
                borderRadius: "2px",
                backgroundColor: `hsl(var(${section.accentVar}) / 0.07)`,
                color: `hsl(var(${section.accentVar}))`,
                textDecoration: "none",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.backgroundColor =
                  `hsl(var(${section.accentVar}) / 0.14)`;
                (e.currentTarget as HTMLAnchorElement).style.borderColor =
                  `hsl(var(${section.accentVar}) / 0.6)`;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.backgroundColor =
                  `hsl(var(${section.accentVar}) / 0.07)`;
                (e.currentTarget as HTMLAnchorElement).style.borderColor =
                  `hsl(var(${section.accentVar}) / 0.35)`;
              }}
            >
              <Icon size={10} />
              <span style={{ ...DISP, fontSize: "0.52rem", fontWeight: 700, letterSpacing: "0.14em" }}>
                {section.tabNum} {section.tabLabel}
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

// ── System overview section ───────────────────────────────────────────────────

function SystemOverview() {
  const pillStyle = (accentVar: string): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "8px 12px",
    border: `1px solid hsl(var(${accentVar}) / 0.3)`,
    borderTop: `2px solid hsl(var(${accentVar}))`,
    borderRadius: "2px",
    backgroundColor: "hsl(var(--bg-elevated))",
  });

  return (
    <div
      style={{
        padding: "20px 32px",
        borderBottom: "1px solid hsl(var(--border-base))",
        backgroundColor: "hsl(var(--bg-panel))",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          ...DISP,
          fontSize: "0.52rem",
          fontWeight: 700,
          letterSpacing: "0.2em",
          color: "hsl(var(--text-dim))",
          display: "block",
          marginBottom: "12px",
        }}
      >
        ARCHITECTURE OVERVIEW
      </span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
        {[
          { icon: MessageSquare, label: "VECTOR SEARCH", sub: "Semantic similarity over incident narratives", accentVar: "--col-cyan" },
          { icon: GitBranch,     label: "SQL ENGINE",    sub: "Structured defect & maintenance queries",      accentVar: "--col-green" },
          { icon: Network,       label: "GRAPH TRAVERSAL", sub: "Entity relationship exploration",            accentVar: "--col-purple" },
          { icon: FlaskConical,  label: "SYNTHESIS LLM", sub: "Cited reasoning over retrieved evidence",      accentVar: "--col-amber" },
        ].map(({ icon: Icon, label, sub, accentVar }) => (
          <div key={label} style={pillStyle(accentVar)}>
            <Icon size={14} style={{ color: `hsl(var(${accentVar}))`, flexShrink: 0 }} />
            <div>
              <div style={{ ...DISP, fontSize: "0.52rem", fontWeight: 700, letterSpacing: "0.14em", color: `hsl(var(${accentVar}))` }}>
                {label}
              </div>
              <div style={{ ...MONO, fontSize: "0.62rem", color: "hsl(var(--text-dim))" }}>
                {sub}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Footer ─────────────────────────────────────────────────────────────────────

function FaqFooter() {
  return (
    <footer
      style={{
        padding: "16px 32px",
        borderTop: "1px solid hsl(var(--border-base))",
        backgroundColor: "hsl(var(--bg-surface))",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          ...MONO,
          fontSize: "0.6rem",
          color: "hsl(var(--text-dim))",
          letterSpacing: "0.08em",
        }}
      >
        NEXTAGENTAI // MANUFACTURING INTELLIGENCE PLATFORM — DEMO BUILD — SYNTHETIC DATA ONLY
      </span>
      <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
        <Link
          href="/"
          style={{
            ...MONO,
            fontSize: "0.6rem",
            color: "hsl(var(--text-dim))",
            textDecoration: "none",
            letterSpacing: "0.08em",
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.color = "hsl(var(--col-green))";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.color = "hsl(var(--text-dim))";
          }}
        >
          MAIN APP
        </Link>
        <Link
          href="/dashboard"
          style={{
            ...MONO,
            fontSize: "0.6rem",
            color: "hsl(var(--text-dim))",
            textDecoration: "none",
            letterSpacing: "0.08em",
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.color = "hsl(var(--col-cyan))";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.color = "hsl(var(--text-dim))";
          }}
        >
          DASHBOARD
        </Link>
      </div>
    </footer>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FaqPage() {
  return (
    <div
      className="grid-bg"
      style={{
        minHeight: "100vh",
        width: "100vw",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "hsl(var(--bg-void))",
        overflowY: "auto",
        overflowX: "hidden",
      }}
    >
      <FaqHeader />
      <Hero />
      <SystemOverview />

      {/* Main content — FAQ panels */}
      <main
        style={{
          flex: 1,
          padding: "24px 32px 32px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        {FAQ_SECTIONS.map((section) => (
          <div
            key={section.id}
            id={section.id}
            className="msg-animate"
            style={{ scrollMarginTop: "60px" }}
          >
            <FaqPanel section={section} />
          </div>
        ))}
      </main>

      <FaqFooter />
    </div>
  );
}
