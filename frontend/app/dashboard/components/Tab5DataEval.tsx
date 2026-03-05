"use client";

import React from "react";
import { Database, FlaskConical, CheckCircle2, AlertCircle } from "lucide-react";
import { DATASET_HEALTH, EVAL_METRICS, MEDICAL_DATASET_HEALTH, MEDICAL_EVAL_METRICS } from "../mock-data";
import { useDomain } from "../../lib/domain-context";

// ── Styles ────────────────────────────────────────────────────────────────────

const MONO: React.CSSProperties = { fontFamily: "var(--font-mono)" };
const DISP: React.CSSProperties = { fontFamily: "var(--font-display)" };

// ── Section wrapper ────────────────────────────────────────────────────────────

function Section({ title, accentVar, icon: Icon, children }: {
  title: string; accentVar: string; icon: React.ElementType; children: React.ReactNode;
}) {
  return (
    <div
      className="panel"
      style={{ "--panel-accent": `hsl(var(${accentVar}))`, flex: 1 } as React.CSSProperties}
    >
      <span className="corner-tl" /><span className="corner-tr" />
      <span className="corner-bl" /><span className="corner-br" />
      <div className="panel-hdr">
        <Icon size={11} style={{ color: `hsl(var(${accentVar}))`, flexShrink: 0 }} />
        <div className="panel-dot" />
        <span className="panel-hdr-title">{title}</span>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        {children}
      </div>
    </div>
  );
}

// ── Table row ──────────────────────────────────────────────────────────────────

function TableRow({ metric, value, extra, index }: {
  metric: string; value: string; extra?: React.ReactNode; index: number;
}) {
  return (
    <div
      className="step-animate"
      style={{
        animationDelay: `${index * 0.04}s`,
        display: "flex",
        alignItems: "baseline",
        gap: "12px",
        padding: "8px 16px",
        borderBottom: "1px solid hsl(var(--border-base))",
        backgroundColor: index % 2 === 0 ? "transparent" : "hsl(var(--bg-elevated) / 0.4)",
      }}
    >
      <span style={{ ...DISP, fontSize: "0.5rem", fontWeight: 600, letterSpacing: "0.1em", color: "hsl(var(--text-secondary))", flex: "0 0 220px" }}>
        {metric}
      </span>
      <span style={{ ...MONO, fontSize: "0.75rem", color: "hsl(var(--text-data))", flex: 1 }}>
        {value}
      </span>
      {extra}
    </div>
  );
}

// ── Eval row with status ───────────────────────────────────────────────────────

function EvalRow({ metric, value, target, status, index }: {
  metric: string; value: string; target: string; status: "PASS" | "FAIL"; index: number;
}) {
  const pass = status === "PASS";
  return (
    <div
      className="step-animate"
      style={{
        animationDelay: `${index * 0.04}s`,
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "8px 16px",
        borderBottom: "1px solid hsl(var(--border-base))",
        backgroundColor: index % 2 === 0 ? "transparent" : "hsl(var(--bg-elevated) / 0.4)",
      }}
    >
      <span style={{ ...DISP, fontSize: "0.5rem", fontWeight: 600, letterSpacing: "0.1em", color: "hsl(var(--text-secondary))", flex: "0 0 220px" }}>
        {metric}
      </span>
      <span style={{ ...MONO, fontSize: "0.75rem", color: pass ? "hsl(var(--col-green))" : "hsl(var(--col-red))", flex: "0 0 80px" }}>
        {value}
      </span>
      <span style={{ ...MONO, fontSize: "0.62rem", color: "hsl(var(--text-dim))", flex: "0 0 80px" }}>
        {target}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
        {pass
          ? <CheckCircle2 size={12} style={{ color: "hsl(var(--col-green))" }} />
          : <AlertCircle  size={12} style={{ color: "hsl(var(--col-red))"   }} />}
        <span style={{
          ...DISP,
          fontSize: "0.46rem",
          fontWeight: 700,
          letterSpacing: "0.12em",
          color: pass ? "hsl(var(--col-green))" : "hsl(var(--col-red))",
        }}>
          {status}
        </span>
      </div>
    </div>
  );
}

// ── Column header ─────────────────────────────────────────────────────────────

function TableHeader({ cols }: { cols: string[] }) {
  return (
    <div style={{
      display: "flex",
      gap: "12px",
      padding: "6px 16px",
      borderBottom: "1px solid hsl(var(--border-strong))",
      backgroundColor: "hsl(var(--bg-surface))",
    }}>
      {cols.map((col, i) => (
        <span
          key={i}
          style={{
            ...DISP,
            fontSize: "0.44rem",
            fontWeight: 700,
            letterSpacing: "0.16em",
            color: "hsl(var(--text-dim))",
            flex: i === 0 ? "0 0 220px" : i === cols.length - 1 ? "0 0 80px" : 1,
          }}
        >
          {col}
        </span>
      ))}
    </div>
  );
}

// ── Status summary bar ────────────────────────────────────────────────────────

function EvalSummary({ metrics }: { metrics: typeof EVAL_METRICS }) {
  const pass = metrics.filter((m) => m.status === "PASS").length;
  const total = metrics.length;
  const pct = Math.round((pass / total) * 100);

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "12px",
      padding: "10px 16px",
      backgroundColor: "hsl(var(--bg-elevated))",
      borderBottom: "1px solid hsl(var(--border-base))",
      flexShrink: 0,
    }}>
      <span style={{ ...DISP, fontSize: "0.5rem", fontWeight: 700, letterSpacing: "0.14em", color: "hsl(var(--text-dim))" }}>
        OVERALL PASS RATE
      </span>
      <div style={{ flex: 1, height: 4, backgroundColor: "hsl(var(--border-base))", borderRadius: "2px", overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: `${pct}%`,
          backgroundColor: "hsl(var(--col-green))",
          boxShadow: "0 0 8px hsl(var(--col-green) / 0.5)",
          transition: "width 0.6s ease",
        }} />
      </div>
      <span style={{ ...MONO, fontSize: "0.78rem", fontWeight: 600, color: "hsl(var(--col-green))" }}>
        {pass}/{total} ({pct}%)
      </span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Tab5DataEval() {
  const { domain } = useDomain();
  const isMedical = domain === "medical";
  const datasetHealth = isMedical ? MEDICAL_DATASET_HEALTH : DATASET_HEALTH;
  const evalMetrics   = isMedical ? MEDICAL_EVAL_METRICS   : EVAL_METRICS;

  return (
    <div style={{ height: "100%", display: "flex", gap: "8px", padding: "8px 10px 10px", overflow: "hidden" }}>

      {/* Dataset Health */}
      <Section
        title={isMedical ? "CLINICAL DATA HEALTH" : "DATASET HEALTH"}
        accentVar="--col-cyan"
        icon={Database}
      >
        <TableHeader cols={["METRIC", "VALUE"]} />
        <div>
          {datasetHealth.map((row, i) => (
            <TableRow key={row.metric} metric={row.metric} value={row.value} index={i} />
          ))}
        </div>
      </Section>

      {/* Offline Evaluation */}
      <Section
        title={isMedical ? "CLINICAL EVALUATION METRICS" : "OFFLINE EVALUATION METRICS"}
        accentVar={isMedical ? "--col-cyan" : "--col-green"}
        icon={FlaskConical}
      >
        <EvalSummary metrics={evalMetrics} />
        <TableHeader cols={["METRIC", "VALUE", "TARGET", "STATUS"]} />
        <div>
          {evalMetrics.map((row, i) => (
            <EvalRow
              key={row.metric}
              metric={row.metric}
              value={row.value}
              target={row.target}
              status={row.status as "PASS" | "FAIL"}
              index={i}
            />
          ))}
        </div>
      </Section>
    </div>
  );
}
