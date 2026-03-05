"use client";

// ============================================================
// AgentTimeline.tsx
// Implements: T-034-F
// - Renders run_summary.steps as a vertical timeline
// - Each step: number, tool name Badge (colour coded), latency ms, status
// - Tool colours: vector=blue, SQL=green, compute=orange
// - Error steps highlighted in destructive red
// - Scrollable if steps exceed panel height
// - Empty state: "No run yet"
// ============================================================

import React from "react";
import { CheckCircle2, XCircle, Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

import { useRunContext } from "../lib/context";
import type { StepSummary, RunSummary } from "../lib/api";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Tool badge colour mapping (T-034-F spec)
// ---------------------------------------------------------------------------

function getToolBadgeClass(toolName: string): string {
  const lower = toolName.toLowerCase();
  if (lower.includes("vector")) {
    return "bg-blue-100 text-blue-800 border-blue-200";
  }
  if (lower.includes("sql") || lower.includes("query")) {
    return "bg-green-100 text-green-800 border-green-200";
  }
  if (lower.includes("compute") || lower.includes("python")) {
    return "bg-orange-100 text-orange-800 border-orange-200";
  }
  return "bg-secondary text-secondary-foreground";
}

// ---------------------------------------------------------------------------
// Single timeline step
// ---------------------------------------------------------------------------

function TimelineStep({
  step,
  isLast,
}: {
  step: StepSummary;
  isLast: boolean;
}) {
  const hasError = step.error !== null;

  return (
    <div className="flex gap-3">
      {/* Step connector — vertical line + circle */}
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "flex items-center justify-center w-7 h-7 rounded-full border-2 shrink-0 text-xs font-bold",
            hasError
              ? "border-destructive bg-destructive/10 text-destructive"
              : "border-primary/30 bg-primary/5 text-primary"
          )}
        >
          {step.step_number}
        </div>
        {!isLast && (
          <div className="w-0.5 flex-1 bg-border mt-1 mb-1" />
        )}
      </div>

      {/* Step content */}
      <div
        className={cn(
          "flex-1 pb-4 min-w-0",
          hasError && "text-destructive"
        )}
      >
        <div className="flex items-center flex-wrap gap-2 mb-1">
          {/* Tool name badge */}
          <Badge
            variant="outline"
            className={cn("text-xs shrink-0", getToolBadgeClass(step.tool_name))}
          >
            {step.tool_name}
          </Badge>

          {/* Status icon */}
          {hasError ? (
            <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
          )}

          {/* Latency */}
          <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
            <Clock className="h-3 w-3" />
            {step.latency_ms.toLocaleString()} ms
          </span>
        </div>

        {/* Output summary */}
        <p className="text-xs text-muted-foreground leading-relaxed truncate">
          {step.output_summary}
        </p>

        {/* Error message */}
        {hasError && (
          <p className="text-xs text-destructive mt-1 font-medium">
            {step.error}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Run header — intent badge + total latency + plan text
// ---------------------------------------------------------------------------

const INTENT_LABELS: Record<RunSummary["intent"], string> = {
  vector_only: "Vector Search",
  sql_only: "SQL Query",
  hybrid: "Hybrid",
  compute: "Compute",
};

const INTENT_BADGE_CLASS: Record<RunSummary["intent"], string> = {
  vector_only: "bg-blue-100 text-blue-800 border-blue-200",
  sql_only: "bg-green-100 text-green-800 border-green-200",
  hybrid: "bg-purple-100 text-purple-800 border-purple-200",
  compute: "bg-orange-100 text-orange-800 border-orange-200",
};

function RunHeader({ summary }: { summary: RunSummary }) {
  return (
    <div className="mb-3 space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge
          variant="outline"
          className={cn("text-xs", INTENT_BADGE_CLASS[summary.intent])}
        >
          {INTENT_LABELS[summary.intent]}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {summary.total_latency_ms.toLocaleString()} ms total
        </span>
        {summary.halted_at_step_limit && (
          <Badge variant="destructive" className="text-xs">
            Step limit reached
          </Badge>
        )}
      </div>
      {summary.plan_text && (
        <p className="text-xs text-muted-foreground italic leading-relaxed">
          {summary.plan_text}
        </p>
      )}
      <Separator />
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
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">No run yet</p>
      </div>
    );
  }

  const { run_summary } = runData;

  return (
    <ScrollArea className="h-full">
      <div className="pr-3">
        <RunHeader summary={run_summary} />

        {run_summary.steps.length === 0 ? (
          <p className="text-sm text-muted-foreground">No steps recorded.</p>
        ) : (
          <div>
            {run_summary.steps.map((step, idx) => (
              <TimelineStep
                key={step.step_number}
                step={step}
                isLast={idx === run_summary.steps.length - 1}
              />
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
