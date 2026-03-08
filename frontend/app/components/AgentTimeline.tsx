"use client";

// ============================================================
// AgentTimeline.tsx — Circuit-trace execution log
// Wave 3 additions:
//   - CACHED badge in RunHeader
//   - TIMING BREAKDOWN collapsible horizontal bar chart
//   - Source label badges per vector hit (BM25/VECTOR/HYBRID)
//   - CSV download button on SQL result tables
// ============================================================

import React, { useState, useRef, useEffect } from "react";
import {
  CheckCircle2, XCircle, Clock, Cpu, ChevronDown, ChevronRight,
  ChevronUp, Download,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRunContext } from "../lib/context";
import type { StepSummary, RunSummary, Evidence } from "../lib/api";

// ---------------------------------------------------------------------------
// Tool colour mapping
// ---------------------------------------------------------------------------

interface ToolStyle {
  color: string;
  label: string;
}

function getToolStyle(toolName: string): ToolStyle {
  const lower = toolName.toLowerCase();
  if (lower.includes("vector")) return { color: "var(--col-cyan)",   label: "VEC" };
  if (lower.includes("sql") || lower.includes("query"))
                                   return { color: "var(--col-green)", label: "SQL" };
  if (lower.includes("compute") || lower.includes("python"))
                                   return { color: "var(--col-amber)", label: "PY" };
  if (lower.includes("graph"))     return { color: "var(--col-purple)",label: "GRF" };
  return { color: "var(--col-blue)", label: "SYS" };
}

// ---------------------------------------------------------------------------
// Source badge for vector hits
// ---------------------------------------------------------------------------

function SourceBadge({ source }: { source?: "bm25" | "vector" | "hybrid" }) {
  if (!source) return null;
  const configs: Record<"bm25" | "vector" | "hybrid", { label: string; color: string }> = {
    bm25:   { label: "BM25",   color: "var(--col-amber)"  },
    vector: { label: "VECTOR", color: "var(--col-cyan)"   },
    hybrid: { label: "HYBRID", color: "var(--col-purple)" },
  };
  const { label, color } = configs[source];
  return (
    <span style={{
      fontFamily: "var(--font-display)",
      fontSize: "0.42rem",
      fontWeight: 700,
      letterSpacing: "0.1em",
      padding: "1px 4px",
      borderRadius: "2px",
      border: `1px solid hsl(${color} / 0.5)`,
      color: `hsl(${color})`,
      backgroundColor: `hsl(${color} / 0.08)`,
      flexShrink: 0,
    }}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// CSV download helper
// ---------------------------------------------------------------------------

function downloadCsv(columns: string[], rows: unknown[][], filename: string) {
  const MAX_ROWS = 1000;
  const data = rows.slice(0, MAX_ROWS);
  // Simple CSV encoder — handles commas and quotes
  const escape = (v: unknown) => {
    const s = String(v ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const lines = [
    columns.map(escape).join(","),
    ...data.map((row) => (row as unknown[]).map(escape).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Tool badge
// ---------------------------------------------------------------------------

function ToolBadge({ toolName }: { toolName: string }) {
  const { color, label: _label } = getToolStyle(toolName);
  return (
    <span
      style={{
        fontFamily: "var(--font-display)",
        fontSize: "0.65rem",
        fontWeight: 700,
        letterSpacing: "0.12em",
        padding: "1px 5px",
        border: `1px solid hsl(${color} / 0.5)`,
        borderRadius: "2px",
        color: `hsl(${color})`,
        backgroundColor: `hsl(${color} / 0.08)`,
        boxShadow: `0 0 6px hsl(${color} / 0.2)`,
        flexShrink: 0,
      }}
    >
      {toolName}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Step detail panel — shown when a step row is expanded
// ---------------------------------------------------------------------------

function StepDetail({
  step,
  evidence,
}: {
  step: StepSummary;
  evidence: Evidence;
}) {
  const lower = step.tool_name.toLowerCase();
  const { color } = getToolStyle(step.tool_name);

  const panelStyle: React.CSSProperties = {
    marginTop: "6px",
    marginBottom: "2px",
    borderLeft: `2px solid hsl(${color} / 0.35)`,
    paddingLeft: "10px",
    paddingTop: "6px",
    paddingBottom: "6px",
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: "var(--font-display)",
    fontSize: "0.6rem",
    fontWeight: 700,
    letterSpacing: "0.12em",
    color: `hsl(${color} / 0.7)`,
    marginBottom: "6px",
  };

  const monoSm: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: "0.75rem",
    color: "hsl(var(--text-secondary))",
    lineHeight: "1.5",
  };

  const dimStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: "0.7rem",
    color: "hsl(var(--text-dim))",
  };

  // ── VectorSearchTool ──
  if (lower.includes("vector")) {
    const hits = evidence.vector_hits ?? [];
    if (hits.length === 0) {
      return (
        <div style={panelStyle}>
          <div style={labelStyle}>VECTOR HITS — 0 chunks</div>
          <p style={dimStyle}>No vector hits returned for this query.</p>
        </div>
      );
    }
    const rawScores = hits.map((h) => h.score);
    const minScore = Math.min(...rawScores);
    const maxScore = Math.max(...rawScores);
    const scoreRange = maxScore - minScore;
    const normalise = (s: number) =>
      scoreRange > 0 ? (s - minScore) / scoreRange : 1;
    return (
      <div style={panelStyle}>
        <div style={labelStyle}>VECTOR HITS — {hits.length} chunks</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {hits.map((hit, i) => {
            const normScore = normalise(hit.score);
            return (
              <div
                key={hit.chunk_id}
                style={{
                  padding: "6px 8px",
                  backgroundColor: "hsl(var(--bg-void) / 0.6)",
                  border: "1px solid hsl(var(--border-base) / 0.5)",
                  borderRadius: "2px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    marginBottom: "4px",
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ ...dimStyle, flexShrink: 0 }}>#{i + 1}</span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.72rem",
                      color: `hsl(${color})`,
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    score {normScore.toFixed(3)}
                  </span>
                  {/* Score bar */}
                  <div style={{ flex: 1, minWidth: "40px", maxWidth: "80px", height: "4px", backgroundColor: `hsl(${color} / 0.15)`, borderRadius: "2px", overflow: "hidden" }}>
                    <div style={{ width: `${normScore * 100}%`, height: "100%", backgroundColor: `hsl(${color})`, borderRadius: "2px" }} />
                  </div>
                  {/* Source badge — BM25/VECTOR/HYBRID */}
                  <SourceBadge source={hit.source} />
                  {hit.metadata?.system && (
                    <span style={{ ...dimStyle, flexShrink: 0 }}>
                      sys:{hit.metadata.system}
                    </span>
                  )}
                  {hit.metadata?.severity && (
                    <span style={{ ...dimStyle, flexShrink: 0 }}>
                      sev:{hit.metadata.severity}
                    </span>
                  )}
                  <span style={{ ...dimStyle, flexShrink: 0, marginLeft: "auto" }}>
                    id:{hit.incident_id.slice(0, 8)}
                  </span>
                </div>
                <p
                  style={{
                    ...monoSm,
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    margin: 0,
                  }}
                >
                  {hit.excerpt}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── SQLQueryTool ──
  if (lower.includes("sql") || lower.includes("query")) {
    const sqlResults = evidence.sql_rows ?? [];
    if (sqlResults.length === 0) {
      return (
        <div style={panelStyle}>
          <div style={labelStyle}>SQL RESULTS</div>
          <p style={dimStyle}>No SQL rows returned.</p>
        </div>
      );
    }
    return (
      <div style={panelStyle}>
        {sqlResults.map((result, ri) => {
          const cols = result.columns ?? [];
          const rows = (result.rows ?? []) as unknown[][];
          const preview = rows.slice(0, 10);
          return (
            <div key={ri} style={{ marginBottom: ri < sqlResults.length - 1 ? "10px" : 0 }}>
              {/* Label + CSV download */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <span style={labelStyle}>
                  SQL RESULT — {result.row_count} rows
                  {result.query ? ` / ${result.query.slice(0, 40)}` : ""}
                </span>
                {cols.length > 0 && rows.length > 0 && (
                  <button
                    onClick={() => downloadCsv(cols, rows, `sql_result_${ri + 1}.csv`)}
                    title="Download as CSV (first 1000 rows)"
                    aria-label="Download CSV"
                    style={{
                      display: "flex", alignItems: "center", gap: "3px",
                      padding: "2px 6px",
                      backgroundColor: "hsl(var(--col-green) / 0.08)",
                      border: "1px solid hsl(var(--col-green) / 0.35)",
                      borderRadius: "2px",
                      cursor: "pointer",
                      color: "hsl(var(--col-green))",
                      fontFamily: "var(--font-display)",
                      fontSize: "0.42rem",
                      letterSpacing: "0.1em",
                      fontWeight: 700,
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = "hsl(var(--col-green) / 0.16)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = "hsl(var(--col-green) / 0.08)";
                    }}
                  >
                    <Download size={9} />
                    CSV
                  </button>
                )}
              </div>
              {cols.length > 0 && preview.length > 0 ? (
                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      borderCollapse: "collapse",
                      width: "100%",
                      minWidth: "max-content",
                    }}
                  >
                    <thead>
                      <tr>
                        {cols.map((col) => (
                          <th
                            key={col}
                            style={{
                              ...dimStyle,
                              fontWeight: 700,
                              letterSpacing: "0.08em",
                              textAlign: "left",
                              padding: "3px 8px 3px 0",
                              borderBottom: "1px solid hsl(var(--border-base) / 0.5)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((row, rowI) => (
                        <tr key={rowI}>
                          {(row as unknown[]).map((cell, cellI) => (
                            <td
                              key={cellI}
                              style={{
                                ...monoSm,
                                padding: "3px 8px 3px 0",
                                borderBottom: "1px solid hsl(var(--border-base) / 0.2)",
                                whiteSpace: "nowrap",
                                maxWidth: "180px",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {String(cell ?? "")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rows.length > 10 && (
                    <p style={{ ...dimStyle, marginTop: "4px" }}>
                      ... {rows.length - 10} more rows
                    </p>
                  )}
                </div>
              ) : (
                <p style={dimStyle}>No rows returned.</p>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ── ComputeTool ──
  if (lower.includes("compute") || lower.includes("python")) {
    return (
      <div style={panelStyle}>
        <div style={labelStyle}>COMPUTE OUTPUT</div>
        <p style={monoSm}>{step.output_summary}</p>
      </div>
    );
  }

  // ── Fallback ──
  return (
    <div style={panelStyle}>
      <div style={labelStyle}>STEP OUTPUT</div>
      <p style={monoSm}>{step.output_summary}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single step
// ---------------------------------------------------------------------------

function TimelineStep({
  step,
  isLast,
  index,
  evidence,
  isExpanded,
  onToggle,
}: {
  step: StepSummary;
  isLast: boolean;
  index: number;
  evidence: Evidence;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasError = step.error !== null;

  // Scroll expanded step into view so detail panel is always visible
  useEffect(() => {
    if (isExpanded && containerRef.current) {
      setTimeout(() => {
        containerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 50);
    }
  }, [isExpanded]);

  const { color } = getToolStyle(step.tool_name);
  const nodeColor = hasError ? "var(--col-red)" : color;

  const lower = step.tool_name.toLowerCase();
  const isVectorStep = lower.includes("vector");
  const isSqlStep = lower.includes("sql") || lower.includes("query");
  const hasComputeData = lower.includes("compute") || lower.includes("python");
  // Vector and SQL steps are always expandable so users can see the detail panel
  // even when evidence is empty (shows "No results" message).
  const isExpandable = isVectorStep || isSqlStep || hasComputeData || !hasError;

  return (
    <div
      ref={containerRef}
      className="step-animate"
      style={{
        animationDelay: `${index * 0.05}s`,
        display: "flex",
        gap: "10px",
        position: "relative",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
        <div
          style={{
            width: 24, height: 24,
            borderRadius: "50%",
            border: `1.5px solid hsl(${nodeColor})`,
            backgroundColor: `hsl(${nodeColor} / 0.1)`,
            boxShadow: `0 0 8px hsl(${nodeColor} / 0.35)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "var(--font-display)",
            fontSize: "0.68rem", fontWeight: 700,
            color: `hsl(${nodeColor})`,
            flexShrink: 0,
          }}
        >
          {step.step_number}
        </div>
        {(!isLast || isExpanded) && (
          <div
            style={{
              width: 1, flex: 1, minHeight: "16px",
              marginTop: "3px", marginBottom: "3px",
              background: `linear-gradient(to bottom, hsl(${nodeColor} / 0.4), hsl(var(--border-base) / 0.3))`,
            }}
          />
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0, paddingBottom: isLast && !isExpanded ? 0 : "10px" }}>
        <div
          onClick={isExpandable ? onToggle : undefined}
          style={{
            display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px",
            marginBottom: "4px",
            cursor: isExpandable ? "pointer" : "default",
            padding: "2px 0", borderRadius: "2px",
            transition: "background-color 0.1s",
          }}
          onMouseEnter={(e) => {
            if (isExpandable) {
              const alpha = (isVectorStep || isSqlStep) ? "0.09" : "0.05";
              (e.currentTarget as HTMLDivElement).style.backgroundColor = `hsl(${color} / ${alpha})`;
            }
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.backgroundColor = "transparent";
          }}
        >
          <ToolBadge toolName={step.tool_name} />
          {hasError
            ? <XCircle size={11} style={{ color: "hsl(var(--col-red))", flexShrink: 0 }} />
            : <CheckCircle2 size={11} style={{ color: "hsl(var(--col-green))", flexShrink: 0 }} />
          }
          <div style={{ display: "flex", alignItems: "center", gap: "3px", flexShrink: 0 }}>
            <Clock size={9} style={{ color: "hsl(var(--text-dim))" }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.78rem", color: "hsl(var(--text-secondary))" }}>
              {step.latency_ms.toLocaleString()} ms
            </span>
          </div>
          <p
            style={{
              fontFamily: "var(--font-mono)", fontSize: "0.85rem",
              color: "hsl(var(--text-secondary))", lineHeight: "1.4",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              flex: 1, minWidth: 0, margin: 0,
            }}
          >
            {step.output_summary}
          </p>
          {isExpandable && (
            <span
              style={{
                display: "flex", alignItems: "center", gap: "3px",
                color: `hsl(${color} / ${(isVectorStep || isSqlStep) ? "0.9" : "0.6"})`,
                flexShrink: 0, lineHeight: 1,
              }}
            >
              {(isVectorStep || isSqlStep) && !isExpanded && (
                <span style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "0.42rem",
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  opacity: 0.75,
                }}>
                  DETAILS
                </span>
              )}
              {isExpanded
                ? <ChevronDown size={(isVectorStep || isSqlStep) ? 14 : 11} />
                : <ChevronRight size={(isVectorStep || isSqlStep) ? 14 : 11} />
              }
            </span>
          )}
        </div>
        {hasError && (
          <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.82rem", color: "hsl(var(--col-red))", marginTop: "3px", fontWeight: 500 }}>
            {step.error}
          </p>
        )}
        {isExpanded && <StepDetail step={step} evidence={evidence} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timing breakdown bar chart
// ---------------------------------------------------------------------------

const TIMING_STAGE_ORDER = ["classify", "vector", "sql", "graph", "synthesise", "verify"];
const TIMING_COLORS: Record<string, string> = {
  classify:   "var(--col-cyan)",
  vector:     "var(--col-purple)",
  sql:        "var(--col-green)",
  graph:      "var(--col-amber)",
  synthesise: "var(--col-cyan)",
  verify:     "var(--col-green)",
};

function TimingBreakdown({
  timings,
  totalMs,
}: {
  timings: Record<string, number>;
  totalMs: number;
}) {
  const [open, setOpen] = useState(false);
  if (Object.keys(timings).length === 0) return null;

  const stages = TIMING_STAGE_ORDER.filter((s) => timings[s] !== undefined);
  const maxMs = totalMs > 0 ? totalMs : Math.max(...Object.values(timings), 1);

  return (
    <div style={{ marginTop: "6px", marginBottom: "4px" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: "5px",
          background: "transparent", border: "none", cursor: "pointer", padding: 0,
        }}
      >
        <span style={{
          fontFamily: "var(--font-display)",
          fontSize: "0.48rem", fontWeight: 700,
          letterSpacing: "0.14em",
          color: "hsl(var(--col-amber) / 0.7)",
        }}>
          TIMING BREAKDOWN
        </span>
        {open ? <ChevronUp size={9} style={{ color: "hsl(var(--col-amber) / 0.7)" }} /> : <ChevronDown size={9} style={{ color: "hsl(var(--col-amber) / 0.7)" }} />}
      </button>

      {open && (
        <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "5px" }}>
          {stages.map((stage) => {
            const ms = timings[stage] ?? 0;
            const pct = (ms / maxMs) * 100;
            const color = TIMING_COLORS[stage] ?? "var(--col-blue)";
            return (
              <div key={stage} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.62rem",
                  color: "hsl(var(--text-dim))",
                  minWidth: "72px",
                  textAlign: "right",
                }}>
                  {stage}
                </span>
                <div style={{ flex: 1, height: "6px", backgroundColor: `hsl(${color} / 0.12)`, borderRadius: "2px", overflow: "hidden" }}>
                  <div style={{
                    width: `${Math.min(pct, 100)}%`,
                    height: "100%",
                    backgroundColor: `hsl(${color})`,
                    borderRadius: "2px",
                    transition: "width 0.4s ease",
                  }} />
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.62rem", color: `hsl(${color})`, minWidth: "48px" }}>
                  {ms.toFixed(0)} ms
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Run header — intent + total latency + plan + CACHED badge + timing
// ---------------------------------------------------------------------------

const INTENT_CONFIG: Record<
  string,
  { label: string; color: string }
> = {
  vector_only: { label: "VECTOR",  color: "var(--col-cyan)"   },
  sql_only:    { label: "SQL",     color: "var(--col-green)"  },
  hybrid:      { label: "HYBRID",  color: "var(--col-purple)" },
  compute:     { label: "COMPUTE", color: "var(--col-amber)"  },
};

function RunHeader({ summary }: { summary: RunSummary }) {
  const cfg = INTENT_CONFIG[summary.intent] ?? { label: summary.intent.toUpperCase(), color: "var(--col-blue)" };
  const { label, color } = cfg;

  return (
    <div style={{ marginBottom: "10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "5px" }}>
        {/* Intent badge */}
        <span style={{
          fontFamily: "var(--font-display)",
          fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.14em",
          padding: "2px 7px",
          border: `1px solid hsl(${color})`,
          borderRadius: "2px",
          color: `hsl(${color})`,
          backgroundColor: `hsl(${color} / 0.1)`,
          boxShadow: `0 0 8px hsl(${color} / 0.25)`,
        }}>
          {label}
        </span>

        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.78rem", color: "hsl(var(--text-secondary))" }}>
          {summary.total_latency_ms.toLocaleString()} ms total
        </span>

        {/* CACHED badge */}
        {summary.cached && (
          <span style={{
            fontFamily: "var(--font-display)",
            fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.1em",
            padding: "1px 5px",
            border: "1px solid hsl(var(--col-green) / 0.5)",
            borderRadius: "2px",
            color: "hsl(var(--col-green))",
            backgroundColor: "hsl(var(--col-green) / 0.1)",
            boxShadow: "0 0 6px hsl(var(--col-green) / 0.2)",
          }}>
            CACHED
          </span>
        )}

        {summary.halted_at_step_limit && (
          <span style={{
            fontFamily: "var(--font-display)",
            fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.1em",
            padding: "1px 5px",
            border: "1px solid hsl(var(--col-red) / 0.5)",
            borderRadius: "2px",
            color: "hsl(var(--col-red))",
            backgroundColor: "hsl(var(--col-red) / 0.1)",
          }}>
            STEP LIMIT
          </span>
        )}
      </div>

      {/* Plan text */}
      {summary.plan_text && (
        <p style={{
          fontFamily: "var(--font-mono)", fontSize: "0.82rem",
          color: "hsl(var(--text-dim))", fontStyle: "italic",
          lineHeight: "1.4", marginBottom: "4px",
        }}>
          {summary.plan_text}
        </p>
      )}

      {/* Timing breakdown */}
      {summary.state_timings_ms && Object.keys(summary.state_timings_ms).length > 0 && (
        <TimingBreakdown timings={summary.state_timings_ms} totalMs={summary.total_latency_ms} />
      )}

      {/* Separator */}
      <div style={{
        height: 1,
        background: "linear-gradient(to right, hsl(var(--col-amber) / 0.4), hsl(var(--border-base)))",
        marginTop: "6px",
      }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// AgentTimeline
// ---------------------------------------------------------------------------

export default function AgentTimeline() {
  const { runData } = useRunContext();
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  if (!runData) {
    return (
      <div className="flex flex-col items-center justify-center h-full" style={{ gap: "8px" }}>
        <Cpu size={20} style={{ color: "hsl(var(--text-dim))" }} />
        <p style={{
          fontFamily: "var(--font-mono)", fontSize: "0.8rem",
          color: "hsl(var(--text-dim))", letterSpacing: "0.12em", textAlign: "center",
        }}>
          NO EXECUTION TRACE
          <br />
          <span style={{ fontSize: "0.72rem", opacity: 0.6 }}>submit a query to begin</span>
        </p>
      </div>
    );
  }

  const { run_summary, evidence } = runData;

  return (
    <ScrollArea className="h-full">
      <div style={{ padding: "8px 12px 12px" }}>
        <RunHeader summary={run_summary} />

        {run_summary.steps.length === 0 ? (
          <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.82rem", color: "hsl(var(--text-dim))" }}>
            No steps recorded.
          </p>
        ) : (
          <div>
            {run_summary.steps.map((step, idx) => (
              <TimelineStep
                key={step.step_number}
                step={step}
                isLast={idx === run_summary.steps.length - 1}
                index={idx}
                evidence={evidence}
                isExpanded={expandedStep === step.step_number}
                onToggle={() =>
                  setExpandedStep(expandedStep === step.step_number ? null : step.step_number)
                }
              />
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
