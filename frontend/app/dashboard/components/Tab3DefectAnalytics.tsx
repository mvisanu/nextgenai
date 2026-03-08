"use client";

import React, { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line, ResponsiveContainer, Legend,
} from "recharts";
import { AlertOctagon, TrendingDown, Tag } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DEFECT_BY_TYPE, SEVERITY_BY_SYSTEM, DEFECT_TREND, INCIDENT_THEMES,
  DISEASE_BY_TYPE, SEVERITY_BY_SPECIALTY, DISEASE_TREND, CLINICAL_THEMES,
} from "../mock-data";
import { useDomain } from "../../lib/domain-context";
import { useAuth } from "../../lib/auth-context";
import { getAnalyticsDefects, getAnalyticsDiseases } from "../../lib/api";
import type { DefectAnalytics, DiseaseAnalytics } from "../../lib/api";

// ── Palette ──────────────────────────────────────────────────────────────────

const C = {
  green:  "hsl(155 85% 42%)",
  cyan:   "hsl(191 92% 50%)",
  amber:  "hsl(38 90% 52%)",
  red:    "hsl(0 82% 58%)",
  purple: "hsl(276 65% 58%)",
  blue:   "hsl(218 88% 60%)",
  grid:   "hsl(210 22% 13%)",
  tick:   "hsl(210 14% 42%)",
};

const MONO: React.CSSProperties = { fontFamily: "var(--font-mono)" };
const DISP: React.CSSProperties = { fontFamily: "var(--font-display)" };

// ── Dark tooltip ──────────────────────────────────────────────────────────────

function DarkTooltip({ active, payload, label }: {
  active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      backgroundColor: "hsl(215 22% 10%)",
      border: "1px solid hsl(210 22% 18%)",
      borderRadius: "2px",
      padding: "8px 12px",
      ...MONO,
      fontSize: "0.68rem",
      color: "hsl(210 18% 86%)",
    }}>
      {label && (
        <p style={{ color: C.tick, marginBottom: "5px", fontSize: "0.58rem", letterSpacing: "0.1em" }}>
          {label}
        </p>
      )}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: <span style={{ fontWeight: 600 }}>{p.value.toLocaleString()}</span>
        </p>
      ))}
    </div>
  );
}

// ── Shared axis props ─────────────────────────────────────────────────────────

const axisFont = { fontFamily: "var(--font-mono)", fontSize: 9, fill: C.tick };

// ── KPI card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color, icon: Icon }: {
  label: string; value: string; sub: string; color: string; icon: React.ElementType;
}) {
  return (
    <div style={{
      flex: 1,
      padding: "14px 16px",
      border: "1px solid hsl(var(--border-base))",
      borderTop: `2px solid hsl(${color})`,
      borderRadius: "2px",
      backgroundColor: "hsl(var(--bg-elevated))",
      display: "flex",
      flexDirection: "column",
      gap: "6px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <Icon size={11} style={{ color: `hsl(${color})`, flexShrink: 0 }} />
        <span style={{ ...DISP, fontSize: "0.48rem", fontWeight: 700, letterSpacing: "0.16em", color: "hsl(var(--text-dim))" }}>
          {label}
        </span>
      </div>
      <span style={{
        ...DISP,
        fontSize: "1.6rem",
        fontWeight: 900,
        color: `hsl(${color})`,
        textShadow: `0 0 20px hsl(${color} / 0.35)`,
        lineHeight: 1,
      }}>
        {value}
      </span>
      <span style={{ ...MONO, fontSize: "0.6rem", color: "hsl(var(--text-secondary))" }}>
        {sub}
      </span>
    </div>
  );
}

// ── Chart panel wrapper ───────────────────────────────────────────────────────

function ChartPanel({ title, accentVar, children }: {
  title: string; accentVar: string; children: React.ReactNode;
}) {
  return (
    <div
      className="panel"
      style={{ "--panel-accent": `hsl(var(${accentVar}))` } as React.CSSProperties}
    >
      <span className="corner-tl" /><span className="corner-tr" />
      <span className="corner-bl" /><span className="corner-br" />
      <div className="panel-hdr">
        <div className="panel-dot" />
        <span className="panel-hdr-title">{title}</span>
      </div>
      <div style={{ flex: 1, padding: "10px 8px 12px", minHeight: 0 }}>
        {children}
      </div>
    </div>
  );
}

// ── Legend renderer ────────────────────────────────────────────────────────────

function ChartLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", justifyContent: "center", marginTop: "6px" }}>
      {items.map(({ label, color }) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <div style={{ width: 8, height: 8, borderRadius: "1px", backgroundColor: color }} />
          <span style={{ ...MONO, fontSize: "0.58rem", color: C.tick }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

// ── Loading skeleton ──────────────────────────────────────────────────────────

function ChartSkeleton({ height = 200 }: { height?: number }) {
  return (
    <div style={{
      height,
      backgroundColor: "hsl(210 22% 13%)",
      borderRadius: "2px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "hsl(210 14% 42%)", letterSpacing: "0.12em" }}>
        LOADING…
      </span>
    </div>
  );
}

export default function Tab3DefectAnalytics() {
  const { domain, config } = useDomain();
  const { accessToken } = useAuth();
  const isMedical = domain === "medical";

  // Real analytics data — fetched on mount and domain change
  const [apiByType, setApiByType] = useState<{ type: string; count: number }[] | null>(null);
  const [apiError, setApiError]   = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setApiError(null);
    setApiByType(null);

    const fetchData = isMedical
      ? getAnalyticsDiseases(undefined, undefined, undefined, accessToken ?? undefined)
      : getAnalyticsDefects(undefined, undefined, undefined, accessToken ?? undefined);

    fetchData
      .then((rows) => {
        if (cancelled) return;
        if (isMedical) {
          // DiseaseAnalytics: group by disease
          const grouped: Record<string, number> = {};
          (rows as DiseaseAnalytics[]).forEach((r) => {
            const key = r.disease ?? "Unknown";
            grouped[key] = (grouped[key] ?? 0) + r.count;
          });
          setApiByType(
            Object.entries(grouped)
              .map(([type, count]) => ({ type, count }))
              .sort((a, b) => b.count - a.count)
              .slice(0, 10)
          );
        } else {
          // DefectAnalytics: group by defect_type
          const grouped: Record<string, number> = {};
          (rows as DefectAnalytics[]).forEach((r) => {
            const key = r.defect_type ?? "Unknown";
            grouped[key] = (grouped[key] ?? 0) + r.count;
          });
          setApiByType(
            Object.entries(grouped)
              .map(([type, count]) => ({ type, count }))
              .sort((a, b) => b.count - a.count)
              .slice(0, 10)
          );
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setApiError(err instanceof Error ? err.message : "Failed to load analytics");
        // Fall back to mock on error
        setApiByType(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [isMedical, accessToken]);

  // Use real API data when available, fall back to mock
  const byTypeData     = apiByType ?? (isMedical ? DISEASE_BY_TYPE       : DEFECT_BY_TYPE);
  const bySysData      = isMedical ? SEVERITY_BY_SPECIALTY : SEVERITY_BY_SYSTEM;
  const trendData      = isMedical ? DISEASE_TREND         : DEFECT_TREND;
  const themesData     = isMedical ? CLINICAL_THEMES       : INCIDENT_THEMES;

  // Derive live total from API data when available
  const liveTotal = apiByType ? apiByType.reduce((sum, r) => sum + r.count, 0) : null;
  const liveTotalStr = liveTotal !== null ? liveTotal.toLocaleString() : (isMedical ? "183" : "168");

  const kpi1 = isMedical
    ? { label: "TOTAL CASES (YTD)",    value: liveTotalStr, sub: "across 5 specialties · 15 weeks", color: "var(--col-cyan)" }
    : { label: "TOTAL DEFECTS (YTD)",  value: liveTotalStr, sub: "across 5 systems · 15 weeks",     color: "var(--col-cyan)" };
  const kpi2 = isMedical
    ? { label: "CRITICAL SEVERITY",    value: "19",  sub: "10.4% of total · ↑ 4 from prev. period", color: "var(--col-red)" }
    : { label: "CRITICAL DEFECTS",     value: "15",  sub: "8.9% of total · ↑ 2 from prev. period",  color: "var(--col-red)" };
  const kpi3 = isMedical
    ? { label: "TOP CONDITION",        value: "CV",  sub: "Cardiovascular · 38 cases · 20.8%",       color: "var(--col-amber)" }
    : { label: "TOP DEFECT TYPE",      value: "Seal",sub: "Seal Failure · 34 occurrences · 20.2%",   color: "var(--col-amber)" };

  const chart1Title = isMedical ? "CASES BY CONDITION TYPE"              : "DEFECTS BY TYPE";
  const chart2Title = isMedical ? "SEVERITY DISTRIBUTION BY SPECIALTY"   : "SEVERITY DISTRIBUTION BY SYSTEM";
  const chart3Title = isMedical ? "CASE INCIDENCE TREND BY WEEK"         : "DEFECT TREND BY WEEK";
  const chart4Title = isMedical ? "CLINICAL NLP THEMES (TF-IDF)"         : "INCIDENT THEMES (TF-IDF KEYWORDS)";
  const chart3Series = isMedical ? "Cases" : "Defects";
  const chart4Series = isMedical ? "Frequency" : "Frequency";
  const sysDataKey   = "system"; // both datasets share this key

  return (
    <ScrollArea className="h-full">
      <div style={{ padding: "8px 10px 12px", display: "flex", flexDirection: "column", gap: "10px" }}>

        {/* API error notice */}
        {apiError && (
          <div style={{
            padding: "7px 12px",
            border: "1px solid hsl(var(--col-amber) / 0.4)",
            borderLeft: "2px solid hsl(var(--col-amber))",
            borderRadius: "2px",
            backgroundColor: "hsl(var(--col-amber) / 0.06)",
            fontFamily: "var(--font-mono)",
            fontSize: "0.62rem",
            color: "hsl(var(--col-amber))",
          }}>
            API unavailable — showing sample data. {apiError}
          </div>
        )}

        {/* KPI row */}
        <div style={{ display: "flex", gap: "8px" }}>
          <KpiCard label={kpi1.label} value={kpi1.value} sub={kpi1.sub} color={kpi1.color} icon={Tag} />
          <KpiCard label={kpi2.label} value={kpi2.value} sub={kpi2.sub} color={kpi2.color} icon={AlertOctagon} />
          <KpiCard label={kpi3.label} value={kpi3.value} sub={kpi3.sub} color={kpi3.color} icon={TrendingDown} />
        </div>

        {/* Chart grid 2×2 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>

          {/* 1. By type — vertical bar */}
          <ChartPanel title={chart1Title} accentVar={isMedical ? "--col-cyan" : "--col-green"}>
            {loading ? (
              <ChartSkeleton height={200} />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={byTypeData} margin={{ top: 4, right: 8, bottom: 30, left: 0 }}>
                  <CartesianGrid vertical={false} stroke={C.grid} strokeDasharray="2 4" />
                  <XAxis
                    dataKey="type"
                    tick={{ ...axisFont }}
                    axisLine={{ stroke: C.grid }}
                    tickLine={false}
                    angle={-35}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis tick={{ ...axisFont }} axisLine={false} tickLine={false} />
                  <Tooltip content={<DarkTooltip />} />
                  <Bar dataKey="count" name="Count" fill={isMedical ? C.cyan : C.green} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartPanel>

          {/* 2. Severity distribution — stacked bar */}
          <ChartPanel title={chart2Title} accentVar="--col-red">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={bySysData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid vertical={false} stroke={C.grid} strokeDasharray="2 4" />
                <XAxis dataKey={sysDataKey} tick={{ ...axisFont }} axisLine={{ stroke: C.grid }} tickLine={false} />
                <YAxis tick={{ ...axisFont }} axisLine={false} tickLine={false} />
                <Tooltip content={<DarkTooltip />} />
                <Bar dataKey="Critical" name="Critical" stackId="a" fill={C.red}    />
                <Bar dataKey="High"     name="High"     stackId="a" fill={C.amber}  />
                <Bar dataKey="Medium"   name="Medium"   stackId="a" fill={C.cyan}   />
                <Bar dataKey="Low"      name="Low"      stackId="a" fill={C.green}  radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <ChartLegend items={[
              { label: "Critical", color: C.red },
              { label: "High",     color: C.amber },
              { label: "Medium",   color: C.cyan },
              { label: "Low",      color: C.green },
            ]} />
          </ChartPanel>

          {/* 3. Trend by week — line */}
          <ChartPanel title={chart3Title} accentVar="--col-cyan">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trendData} margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
                <CartesianGrid stroke={C.grid} strokeDasharray="2 4" />
                <XAxis dataKey="week" tick={{ ...axisFont }} axisLine={{ stroke: C.grid }} tickLine={false} />
                <YAxis tick={{ ...axisFont }} axisLine={false} tickLine={false} />
                <Tooltip content={<DarkTooltip />} />
                <Line
                  type="monotone"
                  dataKey="count"
                  name={chart3Series}
                  stroke={C.cyan}
                  strokeWidth={2}
                  dot={{ fill: C.cyan, r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: C.cyan, stroke: "hsl(var(--bg-elevated))", strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartPanel>

          {/* 4. NLP themes — horizontal bar */}
          <ChartPanel title={chart4Title} accentVar="--col-purple">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={themesData}
                layout="vertical"
                margin={{ top: 4, right: 24, bottom: 4, left: 70 }}
              >
                <CartesianGrid horizontal={false} stroke={C.grid} strokeDasharray="2 4" />
                <XAxis type="number" tick={{ ...axisFont }} axisLine={{ stroke: C.grid }} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="keyword"
                  tick={{ ...axisFont }}
                  axisLine={false}
                  tickLine={false}
                  width={68}
                />
                <Tooltip content={<DarkTooltip />} />
                <Bar dataKey="count" name={chart4Series} fill={C.purple} radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>

        </div>
      </div>
    </ScrollArea>
  );
}
