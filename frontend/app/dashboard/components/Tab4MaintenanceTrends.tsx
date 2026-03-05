"use client";

import React, { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Label,
} from "recharts";
import { Settings2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ASSETS, ASSET_METRICS, ASSET_METRIC_LABELS,
  type MaintenancePoint,
} from "../mock-data";

// ── Palette ────────────────────────────────────────────────────────────────

const C = {
  green:  "hsl(155 85% 42%)",
  cyan:   "hsl(191 92% 50%)",
  amber:  "hsl(38 90% 52%)",
  grid:   "hsl(210 22% 13%)",
  tick:   "hsl(210 14% 42%)",
};

const MONO: React.CSSProperties = { fontFamily: "var(--font-mono)" };
const DISP: React.CSSProperties = { fontFamily: "var(--font-display)" };

const axisFont = { fontFamily: "var(--font-mono)", fontSize: 9, fill: C.tick };

// ── Dark tooltip ──────────────────────────────────────────────────────────────

function DarkTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
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
    }}>
      <p style={{ color: C.tick, marginBottom: "4px", fontSize: "0.58rem", letterSpacing: "0.1em" }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: <span style={{ fontWeight: 600 }}>{typeof p.value === "number" ? p.value.toLocaleString() : p.value}</span>
        </p>
      ))}
    </div>
  );
}

// ── Chart panel ───────────────────────────────────────────────────────────────

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
      <div style={{ flex: 1, padding: "10px 8px 14px" }}>
        {children}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Tab4MaintenanceTrends() {
  const [assetId, setAssetId] = useState("ASSET-001");

  const data: MaintenancePoint[] = ASSET_METRICS[assetId] ?? [];
  const metricLabel = ASSET_METRIC_LABELS[assetId] ?? "Metric Value";
  const eventPoint = data.find((d) => d.event);

  // Stats
  const values = data.map((d) => d.value);
  const avg  = values.reduce((a, b) => a + b, 0) / values.length;
  const pre  = eventPoint ? data.filter((d) => !d.event && data.indexOf(d) < data.findIndex((x) => x.event)) : [];
  const post = eventPoint ? data.filter((d) => !d.event && data.indexOf(d) > data.findIndex((x) => x.event)) : [];
  const preAvg  = pre.length  ? pre.reduce((a, b) => a + b.value, 0) / pre.length  : avg;
  const postAvg = post.length ? post.reduce((a, b) => a + b.value, 0) / post.length : avg;
  const delta = ((postAvg - preAvg) / preAvg * 100).toFixed(1);
  const improved = postAvg < preAvg;

  return (
    <ScrollArea className="h-full">
      <div style={{ padding: "8px 10px 12px", display: "flex", flexDirection: "column", gap: "10px" }}>

        {/* Asset selector + stats row */}
        <div style={{
          display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap",
          padding: "10px 14px",
          border: "1px solid hsl(var(--border-base))",
          borderRadius: "2px",
          backgroundColor: "hsl(var(--bg-elevated))",
        }}>
          <Settings2 size={13} style={{ color: "hsl(var(--col-cyan))", flexShrink: 0 }} />
          <span style={{ ...DISP, fontSize: "0.52rem", fontWeight: 700, letterSpacing: "0.16em", color: "hsl(var(--text-secondary))" }}>
            ASSET SELECT
          </span>
          <select
            value={assetId}
            onChange={(e) => setAssetId(e.target.value)}
            style={{
              ...MONO,
              fontSize: "0.72rem",
              backgroundColor: "hsl(var(--bg-input))",
              border: "1px solid hsl(var(--col-cyan) / 0.4)",
              borderRadius: "2px",
              color: "hsl(var(--col-cyan))",
              padding: "4px 10px",
              outline: "none",
              cursor: "pointer",
              boxShadow: "0 0 8px hsl(var(--col-cyan) / 0.12)",
            }}
          >
            {ASSETS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>

          {/* Stat chips */}
          <div style={{ marginLeft: "auto", display: "flex", gap: "16px" }}>
            {[
              { label: "METRIC",  value: metricLabel,               color: "var(--text-secondary)" },
              { label: "PRE-AVG", value: preAvg.toFixed(2),         color: "var(--col-amber)"      },
              { label: "POST-AVG",value: postAvg.toFixed(2),        color: "var(--col-green)"      },
              {
                label: "DELTA",
                value: `${improved ? "↓" : "↑"} ${Math.abs(parseFloat(delta))}%`,
                color: improved ? "var(--col-green)" : "var(--col-red)",
              },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <span style={{ ...DISP, fontSize: "0.44rem", fontWeight: 700, letterSpacing: "0.14em", color: "hsl(var(--text-dim))" }}>
                  {label}
                </span>
                <span style={{ ...MONO, fontSize: "0.75rem", color: `hsl(${color})` }}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Chart 1 — Metrics over time */}
        <ChartPanel title={`METRICS OVER TIME // ${assetId}`} accentVar="--col-cyan">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data} margin={{ top: 8, right: 20, bottom: 4, left: 10 }}>
              <CartesianGrid stroke={C.grid} strokeDasharray="2 4" />
              <XAxis
                dataKey="ts"
                tick={{ ...axisFont }}
                axisLine={{ stroke: C.grid }}
                tickLine={false}
              />
              <YAxis tick={{ ...axisFont }} axisLine={false} tickLine={false} />
              <Tooltip content={<DarkTooltip />} />
              <Line
                type="monotone"
                dataKey="value"
                name={metricLabel}
                stroke={C.cyan}
                strokeWidth={2}
                dot={(props: { cx?: number; cy?: number; index?: number }) => {
                  const pt = data[props.index ?? 0];
                  return (
                    <circle
                      key={props.index}
                      cx={props.cx ?? 0}
                      cy={props.cy ?? 0}
                      r={pt?.event ? 6 : 3}
                      fill={pt?.event ? C.amber : C.cyan}
                      stroke={pt?.event ? "hsl(var(--bg-elevated))" : "none"}
                      strokeWidth={2}
                    />
                  );
                }}
                activeDot={{ r: 5, fill: C.cyan, stroke: "hsl(var(--bg-elevated))", strokeWidth: 2 }}
              />
              {eventPoint && (
                <ReferenceLine
                  x={eventPoint.ts}
                  stroke={C.amber}
                  strokeDasharray="4 3"
                  strokeWidth={1.5}
                >
                  <Label
                    value="ACTION"
                    position="insideTopRight"
                    style={{ ...DISP, fontSize: "0.44rem", fontWeight: 700, fill: C.amber, letterSpacing: "0.12em" }}
                  />
                </ReferenceLine>
              )}
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>

        {/* Chart 2 — Before / after corrective action */}
        <ChartPanel title="BEFORE / AFTER CORRECTIVE ACTION COMPARISON" accentVar="--col-amber">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", height: "220px" }}>

            {/* Before */}
            <div style={{
              border: "1px solid hsl(var(--border-base))",
              borderTop: "2px solid hsl(var(--col-amber))",
              borderRadius: "2px",
              backgroundColor: "hsl(var(--bg-void))",
              padding: "8px",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
            }}>
              <span style={{ ...DISP, fontSize: "0.46rem", fontWeight: 700, letterSpacing: "0.14em", color: "hsl(var(--col-amber))", marginBottom: "4px" }}>
                PRE-ACTION PHASE
              </span>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={pre.length ? pre : data.slice(0, 7)} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke={C.grid} strokeDasharray="2 4" />
                  <XAxis dataKey="ts" tick={{ ...axisFont }} axisLine={{ stroke: C.grid }} tickLine={false} />
                  <YAxis tick={{ ...axisFont }} axisLine={false} tickLine={false} />
                  <Tooltip content={<DarkTooltip />} />
                  <Line type="monotone" dataKey="value" name={metricLabel}
                    stroke={C.amber} strokeWidth={2}
                    dot={{ fill: C.amber, r: 3, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* After */}
            <div style={{
              border: "1px solid hsl(var(--border-base))",
              borderTop: "2px solid hsl(var(--col-green))",
              borderRadius: "2px",
              backgroundColor: "hsl(var(--bg-void))",
              padding: "8px",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
            }}>
              <span style={{ ...DISP, fontSize: "0.46rem", fontWeight: 700, letterSpacing: "0.14em", color: "hsl(var(--col-green))", marginBottom: "4px" }}>
                POST-ACTION PHASE
              </span>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={post.length ? post : data.slice(7)} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke={C.grid} strokeDasharray="2 4" />
                  <XAxis dataKey="ts" tick={{ ...axisFont }} axisLine={{ stroke: C.grid }} tickLine={false} />
                  <YAxis tick={{ ...axisFont }} axisLine={false} tickLine={false} />
                  <Tooltip content={<DarkTooltip />} />
                  <Line type="monotone" dataKey="value" name={metricLabel}
                    stroke={C.green} strokeWidth={2}
                    dot={{ fill: C.green, r: 3, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Δ annotation */}
          {eventPoint && (
            <div style={{
              marginTop: "10px",
              padding: "7px 12px",
              border: `1px solid hsl(${improved ? "var(--col-green)" : "var(--col-red)"} / 0.35)`,
              borderLeft: `2px solid hsl(${improved ? "var(--col-green)" : "var(--col-red)"})`,
              borderRadius: "2px",
              backgroundColor: `hsl(${improved ? "var(--col-green)" : "var(--col-red)"} / 0.06)`,
              display: "flex",
              gap: "12px",
              alignItems: "center",
            }}>
              <span style={{ ...DISP, fontSize: "0.5rem", fontWeight: 700, letterSpacing: "0.14em", color: `hsl(${improved ? "var(--col-green)" : "var(--col-red)"})` }}>
                {improved ? "IMPROVEMENT CONFIRMED" : "DEGRADATION DETECTED"}
              </span>
              <span style={{ ...MONO, fontSize: "0.68rem", color: "hsl(var(--text-secondary))" }}>
                Corrective action at {eventPoint.ts} · avg Δ {improved ? "↓" : "↑"}{Math.abs(parseFloat(delta))}%
                · pre-avg: {preAvg.toFixed(2)} → post-avg: {postAvg.toFixed(2)} {metricLabel.split(" ")[0]}
              </span>
            </div>
          )}
        </ChartPanel>

      </div>
    </ScrollArea>
  );
}
