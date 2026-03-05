"use client";

// ============================================================
// data/page.tsx — Dataset Intelligence Manifest
// Three Kaggle datasets powering the MVP — schema, purpose,
// tool routing, and download instructions
// ============================================================

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Database, ExternalLink, ChevronDown, ChevronUp,
  Activity, Layers, BarChart2, GitMerge, Copy, Check,
} from "lucide-react";
import { ThemeToggle, FontSizeControl } from "../lib/theme";

// ── Types ──────────────────────────────────────────────────────────────────

interface SchemaColumn {
  name: string;
  type: string;
  description: string;
}

interface DatasetCard {
  id: string;
  index: string;
  title: string;
  author: string;
  kaggleSlug: string;
  kaggleUrl: string;
  downloadSnippet: string;
  accentVar: string;
  toolBadges: { label: string; color: string; icon: React.ElementType }[];
  summary: string;
  recordsEst: string;
  columnsCount: number;
  schema: SchemaColumn[];
  whyUseful: string[];
  useCases: string[];
}

// ── Dataset definitions ───────────────────────────────────────────────────

const DATASETS: DatasetCard[] = [
  {
    id: "mfg-defects",
    index: "DS-01",
    title: "Manufacturing Defects",
    author: "Fahmida Chowdhury",
    kaggleSlug: "fahmidachowdhury/manufacturing-defects",
    kaggleUrl: "https://www.kaggle.com/datasets/fahmidachowdhury/manufacturing-defects",
    downloadSnippet: `import kagglehub

# Download latest version
path = kagglehub.dataset_download(
    "fahmidachowdhury/manufacturing-defects"
)

print("Path to dataset files:", path)`,
    accentVar: "--col-red",
    toolBadges: [
      { label: "SQL", color: "--col-green", icon: Database },
      { label: "VECTOR", color: "--col-cyan", icon: Layers },
    ],
    summary:
      "A structured record of manufacturing defects cataloguing defect types, affected products, production lines, severity ratings, and resolution timelines. Designed for quality-control analysis in industrial settings.",
    recordsEst: "~10 K rows",
    columnsCount: 12,
    schema: [
      { name: "defect_id",        type: "INTEGER",  description: "Unique defect record identifier" },
      { name: "product_id",       type: "VARCHAR",  description: "Affected product or batch identifier" },
      { name: "defect_type",      type: "VARCHAR",  description: "Category of defect (dimensional, surface, functional…)" },
      { name: "severity",         type: "VARCHAR",  description: "CRITICAL / HIGH / MEDIUM / LOW classification" },
      { name: "detection_date",   type: "DATE",     description: "Date the defect was first detected" },
      { name: "production_line",  type: "VARCHAR",  description: "Source production line or cell" },
      { name: "inspector_id",     type: "VARCHAR",  description: "Inspector or sensor that flagged the defect" },
      { name: "resolution_status",type: "VARCHAR",  description: "OPEN / IN_PROGRESS / RESOLVED" },
      { name: "resolution_time",  type: "FLOAT",    description: "Hours from detection to close" },
      { name: "root_cause",       type: "VARCHAR",  description: "Primary attributed cause" },
      { name: "corrective_action",type: "TEXT",     description: "Free-text corrective action narrative" },
      { name: "cost_impact",      type: "FLOAT",    description: "Estimated cost of defect ($)" },
    ],
    whyUseful: [
      "Directly maps to the manufacturing_defects SQL table — powers defect trend queries, severity breakdowns, and production-line comparisons.",
      "The corrective_action free-text field is embedded into the vector index, enabling semantic search over remediation history.",
      "Provides ground truth for the SQL query tool's pre-built queries: defect counts by product/type, severity distributions, and MTTR calculations.",
      "Supports the hybrid query path where an operator asks 'show defects similar to this description' — the SQL tool filters by product and the vector tool retrieves matching narrative chunks.",
    ],
    useCases: [
      "Defect frequency by production line (last 90 days)",
      "Semantic search: 'find defects similar to coolant contamination'",
      "MTTR trend analysis by severity level",
      "Root-cause clustering across product families",
    ],
  },
  {
    id: "aircraft-maint",
    index: "DS-02",
    title: "Aircraft Historical Maintenance Dataset",
    author: "Merishna Suwal",
    kaggleSlug: "merishnasuwal/aircraft-historical-maintenance-dataset",
    kaggleUrl: "https://www.kaggle.com/datasets/merishnasuwal/aircraft-historical-maintenance-dataset",
    downloadSnippet: `import kagglehub

# Download latest version
path = kagglehub.dataset_download(
    "merishnasuwal/aircraft-historical-maintenance-dataset"
)

print("Path to dataset files:", path)`,
    accentVar: "--col-amber",
    toolBadges: [
      { label: "VECTOR", color: "--col-cyan", icon: Layers },
      { label: "SQL",    color: "--col-green", icon: Database },
      { label: "GRAPH",  color: "--col-purple", icon: GitMerge },
    ],
    summary:
      "Five years (2012–2017) of aircraft maintenance event logs covering scheduled and unscheduled maintenance, system-level fault classifications, affected aircraft, technician actions, and downtime durations. Rich in narrative text ideal for semantic retrieval.",
    recordsEst: "~25 K rows",
    columnsCount: 14,
    schema: [
      { name: "event_id",         type: "INTEGER",  description: "Unique maintenance event identifier" },
      { name: "aircraft_id",      type: "VARCHAR",  description: "Tail number / asset identifier" },
      { name: "event_date",       type: "DATE",     description: "Date of the maintenance action" },
      { name: "system",           type: "VARCHAR",  description: "Aircraft system (hydraulic, avionics, airframe…)" },
      { name: "subsystem",        type: "VARCHAR",  description: "Sub-component within the system" },
      { name: "maintenance_type", type: "VARCHAR",  description: "SCHEDULED / UNSCHEDULED / CORRECTIVE" },
      { name: "fault_code",       type: "VARCHAR",  description: "Standardised fault / ATA chapter code" },
      { name: "action_taken",     type: "TEXT",     description: "Free-text technician narrative of work performed" },
      { name: "part_replaced",    type: "VARCHAR",  description: "Part number replaced (if any)" },
      { name: "technician_id",    type: "VARCHAR",  description: "Technician or team identifier" },
      { name: "downtime_hours",   type: "FLOAT",    description: "Aircraft-on-ground (AOG) duration in hours" },
      { name: "severity",         type: "VARCHAR",  description: "Event severity classification" },
      { name: "follow_up_req",    type: "BOOLEAN",  description: "Follow-up maintenance required flag" },
      { name: "cost_usd",         type: "FLOAT",    description: "Estimated maintenance cost in USD" },
    ],
    whyUseful: [
      "The action_taken narrative text is chunked and embedded into the FAISS/Chroma vector index — the primary source for semantic incident retrieval.",
      "Structured columns (system, fault_code, downtime_hours) power the maintenance_logs SQL table and enable time-series trend queries.",
      "Aircraft–system–part relationships are extracted into the knowledge graph, enabling GraphRAG traversal: 'what other aircraft share the same hydraulic fault pattern?'",
      "Five years of temporal coverage provides meaningful trend signal for the Maintenance Trends dashboard tab — MTBF calculations and corrective-action event markers.",
      "The aerospace domain makes this dataset an excellent proxy for safety-critical industrial maintenance, demonstrating the agent's value in high-stakes environments.",
    ],
    useCases: [
      "Semantic search: 'incidents involving hydraulic actuator seal failure'",
      "AOG trend analysis by aircraft and system (2015–2017)",
      "Graph traversal: shared fault patterns across tail numbers",
      "Predictive flag: assets with high unscheduled maintenance rate",
    ],
  },
  {
    id: "predict-defects",
    index: "DS-03",
    title: "Predicting Manufacturing Defects Dataset",
    author: "Rabie El Kharoua",
    kaggleSlug: "rabieelkharoua/predicting-manufacturing-defects-dataset",
    kaggleUrl: "https://www.kaggle.com/datasets/rabieelkharoua/predicting-manufacturing-defects-dataset",
    downloadSnippet: `import kagglehub

# Download latest version
path = kagglehub.dataset_download(
    "rabieelkharoua/predicting-manufacturing-defects-dataset"
)

print("Path to dataset files:", path)`,
    accentVar: "--col-purple",
    toolBadges: [
      { label: "SQL",    color: "--col-green",  icon: Database },
      { label: "GRAPH",  color: "--col-purple", icon: GitMerge },
    ],
    summary:
      "A sensor-rich dataset designed for ML-based defect prediction. Captures real-time machine telemetry (temperature, pressure, vibration, humidity) alongside binary defect outcomes and defect type labels, enabling correlation analysis between process parameters and quality failures.",
    recordsEst: "~55 K rows",
    columnsCount: 16,
    schema: [
      { name: "record_id",          type: "INTEGER", description: "Unique observation identifier" },
      { name: "machine_id",         type: "VARCHAR", description: "Machine or station identifier" },
      { name: "timestamp",          type: "DATETIME",description: "Observation timestamp (UTC)" },
      { name: "temperature_c",      type: "FLOAT",   description: "Process temperature in Celsius" },
      { name: "pressure_bar",       type: "FLOAT",   description: "Process pressure in bar" },
      { name: "vibration_ms2",      type: "FLOAT",   description: "Vibration level (m/s²)" },
      { name: "humidity_pct",       type: "FLOAT",   description: "Ambient humidity percentage" },
      { name: "rotation_rpm",       type: "FLOAT",   description: "Spindle/motor rotation speed (RPM)" },
      { name: "cycle_time_s",       type: "FLOAT",   description: "Cycle time in seconds" },
      { name: "material_grade",     type: "VARCHAR", description: "Input material grade classification" },
      { name: "operator_id",        type: "VARCHAR", description: "Operator or shift identifier" },
      { name: "defect_occurred",    type: "BOOLEAN", description: "Binary defect outcome (1 = defect)" },
      { name: "defect_type",        type: "VARCHAR", description: "Defect category when defect_occurred=1" },
      { name: "defect_probability", type: "FLOAT",   description: "Model-predicted defect probability (0–1)" },
      { name: "production_volume",  type: "INTEGER", description: "Units produced in this batch" },
      { name: "yield_rate",         type: "FLOAT",   description: "Good-unit yield rate (0–1)" },
    ],
    whyUseful: [
      "Provides the quantitative, sensor-level data layer that complements the narrative-text datasets — the SQL tool can correlate temperature spikes with defect events.",
      "Machine–parameter–defect relationships are mapped into the knowledge graph, enabling cross-dataset traversal: linking a hydraulic pressure anomaly (DS-02) to a defect outcome here.",
      "Defect probability and yield_rate columns power the Defect Analytics dashboard KPIs and the defect-by-type bar charts.",
      "The timestamp + machine_id columns enable time-series aggregation queries that feed the Maintenance Trends tab's before/after analysis.",
      "Used in the Data & Evaluation tab to benchmark agent query accuracy — ground truth defect labels allow precision/recall scoring of the agent's SQL responses.",
    ],
    useCases: [
      "Correlation query: temperature ranges associated with dimensional defects",
      "Yield rate trend by machine and material grade",
      "Graph link: process parameter → defect type → corrective action (DS-01)",
      "Eval benchmark: agent defect-count answers vs. ground truth labels",
    ],
  },
];

// ── Copy button ───────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      title="Copy snippet"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "4px",
        padding: "3px 8px",
        border: "1px solid hsl(var(--border-base))",
        borderRadius: "2px",
        backgroundColor: "transparent",
        color: copied ? "hsl(var(--col-green))" : "hsl(var(--text-dim))",
        cursor: "pointer",
        fontFamily: "var(--font-display)",
        fontSize: "0.58rem",
        fontWeight: 700,
        letterSpacing: "0.1em",
        transition: "all 0.15s",
      }}
    >
      {copied ? <Check size={10} /> : <Copy size={10} />}
      {copied ? "COPIED" : "COPY"}
    </button>
  );
}

// ── Schema table ──────────────────────────────────────────────────────────

function SchemaTable({ columns, accentVar }: { columns: SchemaColumn[]; accentVar: string }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? columns : columns.slice(0, 6);
  return (
    <div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: `1px solid hsl(${accentVar} / 0.25)` }}>
            {["COLUMN", "TYPE", "DESCRIPTION"].map((h) => (
              <th
                key={h}
                style={{
                  textAlign: "left",
                  padding: "5px 10px",
                  fontFamily: "var(--font-display)",
                  fontSize: "0.58rem",
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  color: `hsl(${accentVar})`,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((col, i) => (
            <tr
              key={col.name}
              style={{
                backgroundColor: i % 2 === 0 ? "hsl(var(--bg-void) / 0.4)" : "transparent",
                borderBottom: "1px solid hsl(var(--border-base) / 0.4)",
              }}
            >
              <td style={{ padding: "5px 10px", fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: `hsl(${accentVar} / 0.85)`, whiteSpace: "nowrap" }}>
                {col.name}
              </td>
              <td style={{ padding: "5px 10px", fontFamily: "var(--font-mono)", fontSize: "0.68rem", color: "hsl(var(--col-amber))", whiteSpace: "nowrap" }}>
                {col.type}
              </td>
              <td style={{ padding: "5px 10px", fontFamily: "var(--font-mono)", fontSize: "0.68rem", color: "hsl(var(--text-secondary))", lineHeight: "1.4" }}>
                {col.description}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {columns.length > 6 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            marginTop: "6px",
            padding: "4px 10px",
            border: "none",
            backgroundColor: "transparent",
            cursor: "pointer",
            fontFamily: "var(--font-display)",
            fontSize: "0.58rem",
            fontWeight: 700,
            letterSpacing: "0.1em",
            color: `hsl(${accentVar} / 0.7)`,
          }}
        >
          {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          {expanded ? `COLLAPSE (${columns.length - 6} hidden)` : `SHOW ALL ${columns.length} COLUMNS`}
        </button>
      )}
    </div>
  );
}

// ── Dataset card ──────────────────────────────────────────────────────────

function DatasetCard({ ds, animDelay }: { ds: DatasetCard; animDelay: number }) {
  const [snippetOpen, setSnippetOpen] = useState(false);

  return (
    <div
      className="panel msg-animate"
      style={{
        "--panel-accent": `hsl(${ds.accentVar})`,
        animationDelay: `${animDelay}s`,
        display: "flex",
        flexDirection: "column",
      } as React.CSSProperties}
    >
      <span className="corner-tl" />
      <span className="corner-tr" />
      <span className="corner-bl" />
      <span className="corner-br" />

      {/* Panel header */}
      <div className="panel-hdr" style={{ gap: "10px", flexWrap: "wrap" }}>
        <div className="panel-dot" />
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "0.58rem",
            fontWeight: 700,
            letterSpacing: "0.18em",
            color: `hsl(${ds.accentVar} / 0.6)`,
            flexShrink: 0,
          }}
        >
          {ds.index}
        </span>
        <span className="panel-hdr-title" style={{ flex: 1 }}>
          {ds.title.toUpperCase()}
        </span>

        {/* Tool badges */}
        <div style={{ display: "flex", gap: "5px", flexShrink: 0 }}>
          {ds.toolBadges.map((b) => {
            const Icon = b.icon;
            return (
              <span
                key={b.label}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "3px",
                  padding: "1px 6px",
                  border: `1px solid hsl(${b.color} / 0.5)`,
                  borderRadius: "2px",
                  backgroundColor: `hsl(${b.color} / 0.08)`,
                  fontFamily: "var(--font-display)",
                  fontSize: "0.55rem",
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  color: `hsl(${b.color})`,
                  boxShadow: `0 0 6px hsl(${b.color} / 0.2)`,
                }}
              >
                <Icon size={8} />
                {b.label}
              </span>
            );
          })}
        </div>

        {/* Kaggle link */}
        <a
          href={ds.kaggleUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            padding: "2px 8px",
            border: "1px solid hsl(var(--col-blue) / 0.4)",
            borderRadius: "2px",
            backgroundColor: "hsl(var(--col-blue) / 0.06)",
            fontFamily: "var(--font-display)",
            fontSize: "0.55rem",
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: "hsl(var(--col-blue))",
            textDecoration: "none",
            flexShrink: 0,
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.backgroundColor = "hsl(var(--col-blue) / 0.14)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.backgroundColor = "hsl(var(--col-blue) / 0.06)"; }}
        >
          <ExternalLink size={9} />
          KAGGLE
        </a>
      </div>

      {/* Card body */}
      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "16px" }}>

        {/* Top meta row */}
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          {[
            { label: "AUTHOR",  value: ds.author },
            { label: "RECORDS", value: ds.recordsEst },
            { label: "COLUMNS", value: `${ds.columnsCount}` },
            { label: "SLUG",    value: ds.kaggleSlug },
          ].map(({ label, value }) => (
            <div key={label} style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: "0.52rem", fontWeight: 700, letterSpacing: "0.14em", color: "hsl(var(--text-dim))" }}>
                {label}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: `hsl(${ds.accentVar})` }}>
                {value}
              </span>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div>
          <p
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "0.58rem",
              fontWeight: 700,
              letterSpacing: "0.14em",
              color: "hsl(var(--text-dim))",
              marginBottom: "5px",
            }}
          >
            DATASET SUMMARY
          </p>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.82rem", color: "hsl(var(--text-secondary))", lineHeight: "1.65" }}>
            {ds.summary}
          </p>
        </div>

        {/* Separator */}
        <div style={{ height: 1, background: `linear-gradient(to right, hsl(${ds.accentVar} / 0.3), hsl(var(--border-base) / 0.3))` }} />

        {/* Schema table */}
        <div>
          <p
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "0.58rem",
              fontWeight: 700,
              letterSpacing: "0.14em",
              color: "hsl(var(--text-dim))",
              marginBottom: "8px",
            }}
          >
            SCHEMA // COLUMN REFERENCE
          </p>
          <div style={{ border: "1px solid hsl(var(--border-base))", borderRadius: "2px", overflow: "hidden", backgroundColor: "hsl(var(--bg-void) / 0.5)" }}>
            <SchemaTable columns={ds.schema} accentVar={ds.accentVar} />
          </div>
        </div>

        {/* Why useful */}
        <div>
          <p
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "0.58rem",
              fontWeight: 700,
              letterSpacing: "0.14em",
              color: "hsl(var(--text-dim))",
              marginBottom: "8px",
            }}
          >
            PROJECT VALUE // WHY THIS DATASET
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {ds.whyUseful.map((point, i) => (
              <div key={i} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "0.52rem",
                    fontWeight: 700,
                    color: `hsl(${ds.accentVar})`,
                    flexShrink: 0,
                    marginTop: "2px",
                    minWidth: "24px",
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.80rem", color: "hsl(var(--text-secondary))", lineHeight: "1.6" }}>
                  {point}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Use cases */}
        <div>
          <p
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "0.58rem",
              fontWeight: 700,
              letterSpacing: "0.14em",
              color: "hsl(var(--text-dim))",
              marginBottom: "7px",
            }}
          >
            EXAMPLE QUERIES
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {ds.useCases.map((uc, i) => (
              <span
                key={i}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.72rem",
                  color: "hsl(var(--text-secondary))",
                  backgroundColor: `hsl(${ds.accentVar} / 0.06)`,
                  border: `1px solid hsl(${ds.accentVar} / 0.2)`,
                  borderRadius: "2px",
                  padding: "3px 9px",
                  lineHeight: "1.5",
                }}
              >
                {uc}
              </span>
            ))}
          </div>
        </div>

        {/* Download snippet */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
            <p
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "0.58rem",
                fontWeight: 700,
                letterSpacing: "0.14em",
                color: "hsl(var(--text-dim))",
              }}
            >
              KAGGLEHUB DOWNLOAD
            </p>
            <div style={{ display: "flex", gap: "6px" }}>
              <CopyButton text={ds.downloadSnippet} />
              <button
                onClick={() => setSnippetOpen((v) => !v)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "3px 8px",
                  border: `1px solid hsl(${ds.accentVar} / 0.4)`,
                  borderRadius: "2px",
                  backgroundColor: "transparent",
                  color: `hsl(${ds.accentVar})`,
                  cursor: "pointer",
                  fontFamily: "var(--font-display)",
                  fontSize: "0.58rem",
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  transition: "background 0.15s",
                }}
              >
                {snippetOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                {snippetOpen ? "HIDE" : "SHOW"}
              </button>
            </div>
          </div>

          {snippetOpen && (
            <div
              className="msg-animate"
              style={{
                backgroundColor: "hsl(var(--bg-void))",
                border: `1px solid hsl(${ds.accentVar} / 0.25)`,
                borderLeft: `2px solid hsl(${ds.accentVar})`,
                borderRadius: "2px",
                padding: "12px 14px",
                overflow: "auto",
              }}
            >
              <pre style={{ margin: 0, fontFamily: "var(--font-mono)", fontSize: "0.82rem", lineHeight: "1.7", color: "hsl(var(--text-primary))" }}>
                {ds.downloadSnippet.split("\n").map((line, li) => {
                  if (line.startsWith("#")) {
                    return <span key={li} style={{ color: "hsl(var(--text-dim))" }}>{line}{"\n"}</span>;
                  }
                  if (line.includes("import ")) {
                    return <span key={li} style={{ color: "hsl(var(--col-purple))" }}>{line}{"\n"}</span>;
                  }
                  if (line.includes("path =") || line.includes("print(")) {
                    const parts = line.match(/^(\w+\s*=\s*|print\()(.+)(\)?)$/);
                    if (parts) {
                      return (
                        <span key={li}>
                          <span style={{ color: "hsl(var(--col-cyan))" }}>{parts[1]}</span>
                          <span style={{ color: "hsl(var(--col-green))" }}>{parts[2]}</span>
                          <span style={{ color: "hsl(var(--col-cyan))" }}>{parts[3]}</span>
                          {"\n"}
                        </span>
                      );
                    }
                  }
                  return <span key={li}>{line}{"\n"}</span>;
                })}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page header ───────────────────────────────────────────────────────────

function DataHeader() {
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
      {/* Left */}
      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
        <Link
          href="/"
          style={{ display: "flex", alignItems: "center", gap: "5px", color: "hsl(var(--text-secondary))", textDecoration: "none", transition: "color 0.15s" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "hsl(var(--col-green))"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "hsl(var(--text-secondary))"; }}
        >
          <ArrowLeft size={13} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.68rem", letterSpacing: "0.1em" }}>MAIN APP</span>
        </Link>

        <div style={{ width: 1, height: 16, backgroundColor: "hsl(var(--border-strong))" }} />

        {/* Diamond logo */}
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22 }}>
          <div style={{ position: "absolute", width: 18, height: 18, border: "1.5px solid hsl(var(--col-green))", transform: "rotate(45deg)", boxShadow: "0 0 8px hsl(var(--col-green) / 0.3)" }} />
          <div style={{ width: 8, height: 8, backgroundColor: "hsl(var(--col-green))", transform: "rotate(45deg)", boxShadow: "0 0 6px hsl(var(--col-green))" }} />
        </div>

        <span style={{ fontFamily: "var(--font-display)", fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.2em", color: "hsl(var(--text-primary))" }}>
          NEXT<span style={{ color: "hsl(var(--col-green))" }}>AGENT</span>AI
        </span>

        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", color: "hsl(var(--text-dim))", letterSpacing: "0.08em" }}>
          // DATASET INTELLIGENCE MANIFEST
        </span>
      </div>

      {/* Right */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <Activity size={12} style={{ color: "hsl(var(--col-green))" }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", color: "hsl(var(--text-secondary))", letterSpacing: "0.08em" }}>
          3 DATASETS // MVP
        </span>
        <div style={{ width: 1, height: 16, backgroundColor: "hsl(var(--border-strong))" }} />
        <FontSizeControl />
        <ThemeToggle />
      </div>
    </header>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────

function Hero() {
  const stats = [
    { label: "DATASETS",     value: "3",       color: "--col-green" },
    { label: "EST. RECORDS", value: "~90 K",   color: "--col-cyan" },
    { label: "TOOL ROUTES",  value: "3",       color: "--col-purple" },
    { label: "DOMAIN",       value: "MFG + AERO", color: "--col-amber" },
  ];

  return (
    <div style={{ padding: "28px 20px 20px", borderBottom: "1px solid hsl(var(--border-base))" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <p style={{ fontFamily: "var(--font-display)", fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.2em", color: "hsl(var(--col-green))", marginBottom: "6px" }}>
            NEXTAGENTAI // DATA LAYER
          </p>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "1.4rem", fontWeight: 900, letterSpacing: "0.1em", color: "hsl(var(--text-primary))", lineHeight: 1.1, marginBottom: "8px" }}>
            DATASET INTELLIGENCE<br />
            <span style={{ color: "hsl(var(--col-cyan))" }}>MANIFEST</span>
          </h1>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.82rem", color: "hsl(var(--text-secondary))", maxWidth: "540px", lineHeight: "1.65" }}>
            Three open Kaggle datasets forming the data foundation of the NextAgentAI MVP.
            Each feeds a distinct query tool — SQL, vector search, or knowledge graph — to
            power multi-modal agentic reasoning over manufacturing and maintenance intelligence.
          </p>
        </div>

        {/* Stat pills */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-end" }}>
          {stats.map(({ label, value, color }) => (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "5px 12px",
                border: `1px solid hsl(${color} / 0.25)`,
                borderRadius: "2px",
                backgroundColor: `hsl(${color} / 0.05)`,
              }}
            >
              <span style={{ fontFamily: "var(--font-display)", fontSize: "0.55rem", fontWeight: 700, letterSpacing: "0.14em", color: "hsl(var(--text-dim))" }}>
                {label}
              </span>
              <span style={{ fontFamily: "var(--font-display)", fontSize: "0.85rem", fontWeight: 900, letterSpacing: "0.08em", color: `hsl(${color})` }}>
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Tool routing legend */}
      <div style={{ marginTop: "18px", display: "flex", gap: "16px", flexWrap: "wrap" }}>
        {[
          { label: "SQL ENGINE",        color: "--col-green",  desc: "Structured queries — counts, trends, aggregates" },
          { label: "VECTOR SEARCH",     color: "--col-cyan",   desc: "Semantic retrieval — narrative text embeddings" },
          { label: "GRAPH TRAVERSAL",   color: "--col-purple", desc: "Relationship queries — entity linking, co-occurrence" },
        ].map(({ label, color, desc }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: `hsl(${color})`, boxShadow: `0 0 5px hsl(${color})`, flexShrink: 0 }} />
            <span style={{ fontFamily: "var(--font-display)", fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.1em", color: `hsl(${color})` }}>
              {label}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", color: "hsl(var(--text-dim))" }}>
              — {desc}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function DataPage() {
  return (
    <div
      className="grid-bg"
      style={{
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "hsl(var(--bg-void))",
      }}
    >
      <DataHeader />

      <div style={{ flex: 1, overflowY: "auto", padding: "0" }}>
        <Hero />

        <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "16px 20px 32px" }}>
          {DATASETS.map((ds, i) => (
            <DatasetCard key={ds.id} ds={ds} animDelay={i * 0.08} />
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            borderTop: "1px solid hsl(var(--border-base))",
            padding: "12px 20px",
            display: "flex",
            alignItems: "center",
            gap: "16px",
          }}
        >
          <span style={{ fontFamily: "var(--font-display)", fontSize: "0.55rem", fontWeight: 700, letterSpacing: "0.14em", color: "hsl(var(--text-dim))" }}>
            NEXTAGENTAI // MVP DATA LAYER
          </span>
          <div style={{ width: 1, height: 12, backgroundColor: "hsl(var(--border-strong))" }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.62rem", color: "hsl(var(--text-dim))" }}>
            All datasets sourced from Kaggle under their respective licenses.
          </span>
        </div>
      </div>
    </div>
  );
}
