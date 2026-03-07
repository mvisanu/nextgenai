"use client";

// ============================================================
// AgentTimeline.tsx — Circuit-trace execution log
// Industrial aesthetic: glowing step nodes, tool badges with
// type-coded glow, amber trace connector lines
// ============================================================

import React, { useState } from "react";
import { CheckCircle2, XCircle, Clock, Cpu, ChevronDown, ChevronRight } from "lucide-react";
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
          <div style={labelStyle}>VECTOR HITS</div>
          <p style={dimStyle}>No vector hits recorded.</p>
        </div>
      );
    }
    // Normalise scores within this result set so best match = 1.000
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
          );})}
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
          <p style={dimStyle}>No SQL results recorded.</p>
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
              <div style={labelStyle}>
                SQL RESULT — {result.row_count} rows
                {result.query ? ` / ${result.query.slice(0, 40)}` : ""}
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
  const hasError = step.error !== null;
  const { color } = getToolStyle(step.tool_name);
  const nodeColor = hasError ? "var(--col-red)" : color;

  // Determine if this step has any expandable content
  const lower = step.tool_name.toLowerCase();
  const hasVectorData = lower.includes("vector") && (evidence.vector_hits ?? []).length > 0;
  const hasSqlData = (lower.includes("sql") || lower.includes("query")) && (evidence.sql_rows ?? []).length > 0;
  const hasComputeData = lower.includes("compute") || lower.includes("python");
  const isExpandable = hasVectorData || hasSqlData || hasComputeData || !hasError;

  return (
    <div
      className="step-animate"
      style={{
        animationDelay: `${index * 0.05}s`,
        display: "flex",
        gap: "10px",
        position: "relative",
      }}
    >
      {/* ── Left: node + connector line ── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        {/* Step number circle */}
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            border: `1.5px solid hsl(${nodeColor})`,
            backgroundColor: `hsl(${nodeColor} / 0.1)`,
            boxShadow: `0 0 8px hsl(${nodeColor} / 0.35)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-display)",
            fontSize: "0.68rem",
            fontWeight: 700,
            color: `hsl(${nodeColor})`,
            flexShrink: 0,
          }}
        >
          {step.step_number}
        </div>

        {/* Vertical trace line */}
        {(!isLast || isExpanded) && (
          <div
            style={{
              width: 1,
              flex: 1,
              minHeight: "16px",
              marginTop: "3px",
              marginBottom: "3px",
              background: `linear-gradient(to bottom, hsl(${nodeColor} / 0.4), hsl(var(--border-base) / 0.3))`,
            }}
          />
        )}
      </div>

      {/* ── Right: step content ── */}
      <div style={{ flex: 1, minWidth: 0, paddingBottom: isLast && !isExpanded ? 0 : "10px" }}>
        {/* Header row: badge + status + latency + expand toggle */}
        <div
          onClick={isExpandable ? onToggle : undefined}
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "6px",
            marginBottom: "4px",
            cursor: isExpandable ? "pointer" : "default",
            padding: "2px 0",
            borderRadius: "2px",
            transition: "background-color 0.1s",
          }}
          onMouseEnter={(e) => {
            if (isExpandable) {
              (e.currentTarget as HTMLDivElement).style.backgroundColor = `hsl(${color} / 0.05)`;
            }
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.backgroundColor = "transparent";
          }}
        >
          <ToolBadge toolName={step.tool_name} />

          {hasError ? (
            <XCircle size={11} style={{ color: "hsl(var(--col-red))", flexShrink: 0 }} />
          ) : (
            <CheckCircle2 size={11} style={{ color: "hsl(var(--col-green))", flexShrink: 0 }} />
          )}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "3px",
              flexShrink: 0,
            }}
          >
            <Clock size={9} style={{ color: "hsl(var(--text-dim))" }} />
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.78rem",
                color: "hsl(var(--text-secondary))",
              }}
            >
              {step.latency_ms.toLocaleString()} ms
            </span>
          </div>

          {/* Output summary — inline in header row */}
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.85rem",
              color: "hsl(var(--text-secondary))",
              lineHeight: "1.4",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
              minWidth: 0,
              margin: 0,
            }}
          >
            {step.output_summary}
          </p>

          {/* Expand chevron */}
          {isExpandable && (
            <span style={{ color: `hsl(${color} / 0.6)`, flexShrink: 0, lineHeight: 1 }}>
              {isExpanded
                ? <ChevronDown size={11} />
                : <ChevronRight size={11} />
              }
            </span>
          )}
        </div>

        {/* Error message */}
        {hasError && (
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.82rem",
              color: "hsl(var(--col-red))",
              marginTop: "3px",
              fontWeight: 500,
            }}
          >
            {step.error}
          </p>
        )}

        {/* Expanded detail panel */}
        {isExpanded && (
          <StepDetail step={step} evidence={evidence} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Run header — intent + total latency + plan
// ---------------------------------------------------------------------------

const INTENT_CONFIG: Record<
  RunSummary["intent"],
  { label: string; color: string }
> = {
  vector_only: { label: "VECTOR",  color: "var(--col-cyan)"   },
  sql_only:    { label: "SQL",     color: "var(--col-green)"  },
  hybrid:      { label: "HYBRID",  color: "var(--col-purple)" },
  compute:     { label: "COMPUTE", color: "var(--col-amber)"  },
};

function RunHeader({ summary }: { summary: RunSummary }) {
  const { label, color } = INTENT_CONFIG[summary.intent];

  return (
    <div style={{ marginBottom: "10px" }}>
      {/* Intent + latency row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          flexWrap: "wrap",
          marginBottom: "5px",
        }}
      >
        {/* Intent badge */}
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "0.68rem",
            fontWeight: 700,
            letterSpacing: "0.14em",
            padding: "2px 7px",
            border: `1px solid hsl(${color})`,
            borderRadius: "2px",
            color: `hsl(${color})`,
            backgroundColor: `hsl(${color} / 0.1)`,
            boxShadow: `0 0 8px hsl(${color} / 0.25)`,
          }}
        >
          {label}
        </span>

        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.78rem",
            color: "hsl(var(--text-secondary))",
          }}
        >
          {summary.total_latency_ms.toLocaleString()} ms total
        </span>

        {summary.halted_at_step_limit && (
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "0.65rem",
              fontWeight: 700,
              letterSpacing: "0.1em",
              padding: "1px 5px",
              border: "1px solid hsl(var(--col-red) / 0.5)",
              borderRadius: "2px",
              color: "hsl(var(--col-red))",
              backgroundColor: "hsl(var(--col-red) / 0.1)",
            }}
          >
            STEP LIMIT
          </span>
        )}
      </div>

      {/* Plan text */}
      {summary.plan_text && (
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.82rem",
            color: "hsl(var(--text-dim))",
            fontStyle: "italic",
            lineHeight: "1.4",
            marginBottom: "6px",
          }}
        >
          {summary.plan_text}
        </p>
      )}

      {/* Separator */}
      <div
        style={{
          height: 1,
          background:
            "linear-gradient(to right, hsl(var(--col-amber) / 0.4), hsl(var(--border-base)))",
        }}
      />
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
      <div
        className="flex flex-col items-center justify-center h-full"
        style={{ gap: "8px" }}
      >
        <Cpu
          size={20}
          style={{ color: "hsl(var(--text-dim))" }}
        />
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.8rem",
            color: "hsl(var(--text-dim))",
            letterSpacing: "0.12em",
            textAlign: "center",
          }}
        >
          NO EXECUTION TRACE
          <br />
          <span style={{ fontSize: "0.72rem", opacity: 0.6 }}>
            submit a query to begin
          </span>
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
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.82rem",
              color: "hsl(var(--text-dim))",
            }}
          >
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
                  setExpandedStep(
                    expandedStep === step.step_number ? null : step.step_number
                  )
                }
              />
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
