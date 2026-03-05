"use client";

// ============================================================
// AgentTimeline.tsx — Circuit-trace execution log
// Industrial aesthetic: glowing step nodes, tool badges with
// type-coded glow, amber trace connector lines
// ============================================================

import React from "react";
import { CheckCircle2, XCircle, Clock, Cpu } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRunContext } from "../lib/context";
import type { StepSummary, RunSummary } from "../lib/api";

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
// Single step
// ---------------------------------------------------------------------------

function TimelineStep({
  step,
  isLast,
  index,
}: {
  step: StepSummary;
  isLast: boolean;
  index: number;
}) {
  const hasError = step.error !== null;
  const { color } = getToolStyle(step.tool_name);
  const nodeColor = hasError ? "var(--col-red)" : color;

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
        {!isLast && (
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
      <div style={{ flex: 1, minWidth: 0, paddingBottom: isLast ? 0 : "10px" }}>
        {/* Header row: badge + status + latency */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "6px",
            marginBottom: "4px",
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
        </div>

        {/* Output summary */}
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.85rem",
            color: "hsl(var(--text-secondary))",
            lineHeight: "1.4",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {step.output_summary}
        </p>

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

  const { run_summary } = runData;

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
              />
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
