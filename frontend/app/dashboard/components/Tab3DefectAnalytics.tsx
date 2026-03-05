"use client";

import React from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line, ResponsiveContainer, Legend,
} from "recharts";
import { AlertOctagon, TrendingDown, Tag } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DEFECT_BY_TYPE, SEVERITY_BY_SYSTEM, DEFECT_TREND, INCIDENT_THEMES,
} from "../mock-data";

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

export default function Tab3DefectAnalytics() {
  return (
    <ScrollArea className="h-full">
      <div style={{ padding: "8px 10px 12px", display: "flex", flexDirection: "column", gap: "10px" }}>

        {/* KPI row */}
        <div style={{ display: "flex", gap: "8px" }}>
          <KpiCard
            label="TOTAL DEFECTS (YTD)"
            value="168"
            sub="across 5 systems · 15 weeks"
            color="var(--col-cyan)"
            icon={Tag}
          />
          <KpiCard
            label="CRITICAL DEFECTS"
            value="15"
            sub="8.9% of total · ↑ 2 from prev. period"
            color="var(--col-red)"
            icon={AlertOctagon}
          />
          <KpiCard
            label="TOP DEFECT TYPE"
            value="Seal"
            sub="Seal Failure · 34 occurrences · 20.2%"
            color="var(--col-amber)"
            icon={TrendingDown}
          />
        </div>

        {/* Chart grid 2×2 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>

          {/* 1. Defects by Type — vertical bar */}
          <ChartPanel title="DEFECTS BY TYPE" accentVar="--col-green">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={DEFECT_BY_TYPE} margin={{ top: 4, right: 8, bottom: 30, left: 0 }}>
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
                <Bar dataKey="count" name="Count" fill={C.green} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>

          {/* 2. Severity distribution — stacked bar */}
          <ChartPanel title="SEVERITY DISTRIBUTION BY SYSTEM" accentVar="--col-red">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={SEVERITY_BY_SYSTEM} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid vertical={false} stroke={C.grid} strokeDasharray="2 4" />
                <XAxis dataKey="system" tick={{ ...axisFont }} axisLine={{ stroke: C.grid }} tickLine={false} />
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

          {/* 3. Defect trend by week — line */}
          <ChartPanel title="DEFECT TREND BY WEEK" accentVar="--col-cyan">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={DEFECT_TREND} margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
                <CartesianGrid stroke={C.grid} strokeDasharray="2 4" />
                <XAxis dataKey="week" tick={{ ...axisFont }} axisLine={{ stroke: C.grid }} tickLine={false} />
                <YAxis tick={{ ...axisFont }} axisLine={false} tickLine={false} />
                <Tooltip content={<DarkTooltip />} />
                <Line
                  type="monotone"
                  dataKey="count"
                  name="Defects"
                  stroke={C.cyan}
                  strokeWidth={2}
                  dot={{ fill: C.cyan, r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: C.cyan, stroke: "hsl(var(--bg-elevated))", strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartPanel>

          {/* 4. Incident themes — horizontal bar */}
          <ChartPanel title="INCIDENT THEMES (TF-IDF KEYWORDS)" accentVar="--col-purple">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={INCIDENT_THEMES}
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
                <Bar dataKey="count" name="Frequency" fill={C.purple} radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>

        </div>
      </div>
    </ScrollArea>
  );
}
