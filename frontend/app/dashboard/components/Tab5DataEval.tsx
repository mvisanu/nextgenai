"use client";

import React, { useEffect, useState } from "react";
import { Database, FlaskConical, CheckCircle2, AlertCircle } from "lucide-react";
import { DATASET_HEALTH, EVAL_METRICS, MEDICAL_DATASET_HEALTH, MEDICAL_EVAL_METRICS } from "../mock-data";
import { useDomain } from "../../lib/domain-context";
import { getAnalyticsDefects, getAnalyticsDiseases } from "../../lib/api";
import type { DefectAnalytics, DiseaseAnalytics } from "../../lib/api";

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
  const evalMetrics = isMedical ? MEDICAL_EVAL_METRICS : EVAL_METRICS;

  // Real API — derive live record/type counts for dataset health section
  const [liveHealth, setLiveHealth] = useState<{ metric: string; value: string }[] | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setHealthLoading(true);
    setLiveHealth(null);

    const fetchData = isMedical ? getAnalyticsDiseases() : getAnalyticsDefects();

    fetchData
      .then((rows) => {
        if (cancelled) return;
        if (isMedical) {
          const r = rows as DiseaseAnalytics[];
          const total = r.reduce((s, x) => s + x.count, 0);
          const specialties = new Set(r.map((x) => x.specialty).filter(Boolean)).size;
          const diseases    = new Set(r.map((x) => x.disease).filter(Boolean)).size;
          setLiveHealth([
            { metric: "Total Case Records",       value: total.toLocaleString() },
            { metric: "Unique Specialties",        value: String(specialties) },
            { metric: "Unique Diagnoses / Conditions", value: String(diseases) },
          ]);
        } else {
          const r = rows as DefectAnalytics[];
          const total    = r.reduce((s, x) => s + x.count, 0);
          const products = new Set(r.map((x) => x.product).filter(Boolean)).size;
          const types    = new Set(r.map((x) => x.defect_type).filter(Boolean)).size;
          setLiveHealth([
            { metric: "Total Defect Records",   value: total.toLocaleString() },
            { metric: "Unique Products / Assets", value: String(products) },
            { metric: "Unique Defect Types",      value: String(types) },
          ]);
        }
      })
      .catch(() => {
        if (!cancelled) setLiveHealth(null);
      })
      .finally(() => { if (!cancelled) setHealthLoading(false); });

    return () => { cancelled = true; };
  }, [isMedical]);

  // Merge live counts at the top of the static dataset health list
  const staticHealth  = isMedical ? MEDICAL_DATASET_HEALTH : DATASET_HEALTH;
  const datasetHealth = liveHealth
    ? [...liveHealth, ...staticHealth.filter((r) => !liveHealth.some((l) => l.metric === r.metric))]
    : staticHealth;

  return (
    <div style={{ height: "100%", display: "flex", gap: "8px", padding: "8px 10px 10px", overflow: "hidden" }}>

      {/* Dataset Health */}
      <Section
        title={isMedical ? "CLINICAL DATA HEALTH" : "DATASET HEALTH"}
        accentVar="--col-cyan"
        icon={Database}
      >
        <TableHeader cols={["METRIC", "VALUE"]} />
        {healthLoading ? (
          <div style={{ padding: "20px 16px", fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "hsl(210 14% 42%)", letterSpacing: "0.12em" }}>
            LOADING…
          </div>
        ) : (
          <div>
            {datasetHealth.map((row, i) => (
              <TableRow key={row.metric} metric={row.metric} value={row.value} index={i} />
            ))}
          </div>
        )}
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
