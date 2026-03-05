"use client";

import React, { useState, useMemo } from "react";
import { Search, FileText, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { INCIDENTS, MEDICAL_CASES, type Incident, type MedCase, type Severity, type System, type Specialty } from "../mock-data";
import { useDomain } from "../../lib/domain-context";

// ── Constants ────────────────────────────────────────────────────────────────

const MONO: React.CSSProperties = { fontFamily: "var(--font-mono)" };
const DISP: React.CSSProperties = { fontFamily: "var(--font-display)" };

const SEV_COLOR: Record<Severity, string> = {
  Critical: "var(--col-red)",
  High:     "var(--col-amber)",
  Medium:   "var(--col-cyan)",
  Low:      "var(--col-green)",
};

const SYSTEMS: System[] = ["Hydraulic", "Avionics", "Structural", "Propulsion", "Electronics"];
const SPECIALTIES: Specialty[] = ["Cardiology", "Neurology", "Respiratory", "Gastroenterology", "Musculoskeletal"];
const SEVERITIES: Severity[] = ["Critical", "High", "Medium", "Low"];

// ── Input styles ─────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  ...MONO,
  fontSize: "0.72rem",
  backgroundColor: "hsl(var(--bg-input))",
  border: "1px solid hsl(var(--border-base))",
  borderRadius: "2px",
  color: "hsl(var(--text-primary))",
  padding: "4px 8px",
  outline: "none",
  caretColor: "hsl(var(--col-green))",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: "pointer",
};

// ── Severity pill ─────────────────────────────────────────────────────────────

function SevBadge({ severity }: { severity: Severity }) {
  return (
    <span
      style={{
        ...DISP,
        fontSize: "0.46rem",
        fontWeight: 700,
        letterSpacing: "0.12em",
        padding: "1px 5px",
        border: `1px solid hsl(${SEV_COLOR[severity]} / 0.5)`,
        borderRadius: "2px",
        color: `hsl(${SEV_COLOR[severity]})`,
        backgroundColor: `hsl(${SEV_COLOR[severity]} / 0.08)`,
        flexShrink: 0,
      }}
    >
      {severity.toUpperCase()}
    </span>
  );
}

// ── Similarity score bar (mock) ────────────────────────────────────────────────

function SimilarityBar({ incident }: { incident: Incident | MedCase }) {
  // Mock similarity based on severity + recency
  const base = { Critical: 0.91, High: 0.83, Medium: 0.74, Low: 0.65 }[incident.severity];
  const score = Math.max(0.55, Math.min(0.99, base - Math.random() * 0.06));
  const color = score >= 0.85 ? "var(--col-green)" : score >= 0.72 ? "var(--col-cyan)" : "var(--col-amber)";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
      <div style={{ flex: 1, height: 2, backgroundColor: "hsl(var(--border-base))", borderRadius: 1 }}>
        <div style={{ height: "100%", width: `${score * 100}%`, backgroundColor: `hsl(${color})` }} />
      </div>
      <span style={{ ...MONO, fontSize: "0.58rem", color: `hsl(${color})`, flexShrink: 0 }}>
        {(score).toFixed(2)}
      </span>
    </div>
  );
}

// ── Detail panel ───────────────────────────────────────────────────────────────

function IncidentDetail({ incident, onClose, narrativeLabel, systemLabel, accentVar }: {
  incident: Incident | MedCase; onClose: () => void;
  narrativeLabel: string; systemLabel: string; accentVar: string;
}) {
  const sev = SEV_COLOR[incident.severity];

  function MetaItem({ label, value }: { label: string; value: string }) {
    return (
      <div style={{ display: "flex", gap: "8px", alignItems: "baseline" }}>
        <span style={{ ...DISP, fontSize: "0.46rem", fontWeight: 700, letterSpacing: "0.14em", color: "hsl(var(--text-dim))", minWidth: "72px", flexShrink: 0 }}>
          {label}
        </span>
        <span style={{ ...MONO, fontSize: "0.7rem", color: "hsl(var(--text-data))" }}>
          {value}
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Detail header */}
      <div style={{
        padding: "10px 14px",
        borderBottom: "1px solid hsl(var(--border-base))",
        backgroundColor: "hsl(var(--bg-surface))",
        display: "flex", alignItems: "flex-start", gap: "10px", flexShrink: 0,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
            <FileText size={12} style={{ color: `hsl(${sev})`, flexShrink: 0 }} />
            <span style={{ ...DISP, fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.14em", color: "hsl(var(--text-primary))" }}>
              {incident.id}
            </span>
            <SevBadge severity={incident.severity} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
            <MetaItem label={systemLabel.toUpperCase()}  value={incident.system} />
            <MetaItem label="RECORD ID" value={incident.assetId} />
            <MetaItem label="DATE"     value={incident.date} />
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center",
            border: "1px solid hsl(var(--border-base))", borderRadius: "2px",
            backgroundColor: "transparent", color: "hsl(var(--text-secondary))", cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <X size={11} />
        </button>
      </div>

      {/* Scrollable body */}
      <ScrollArea style={{ flex: 1 }}>
        <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: "14px" }}>

          {/* Narrative */}
          <div>
            <span style={{ ...DISP, fontSize: "0.48rem", fontWeight: 700, letterSpacing: "0.16em", color: "hsl(var(--text-dim))", display: "block", marginBottom: "5px" }}>
              {narrativeLabel.toUpperCase()} NARRATIVE
            </span>
            <div style={{
              ...MONO, fontSize: "0.72rem", color: "hsl(var(--text-secondary))", lineHeight: "1.7",
              padding: "9px 11px",
              border: `1px solid hsl(var(--border-base))`,
              borderLeft: `2px solid hsl(${sev})`,
              borderRadius: "2px",
              backgroundColor: "hsl(var(--bg-void))",
            }}>
              {incident.narrativeText}
            </div>
          </div>

          {/* Corrective action */}
          <div>
            <span style={{ ...DISP, fontSize: "0.48rem", fontWeight: 700, letterSpacing: "0.16em", color: "hsl(var(--text-dim))", display: "block", marginBottom: "5px" }}>
              CORRECTIVE ACTION
            </span>
            <div style={{
              ...MONO, fontSize: "0.72rem", color: "hsl(var(--text-secondary))", lineHeight: "1.7",
              padding: "9px 11px",
              border: "1px solid hsl(var(--border-base))",
              borderLeft: `2px solid hsl(var(${accentVar}))`,
              borderRadius: "2px",
              backgroundColor: "hsl(var(--bg-void))",
            }}>
              {incident.correctiveAction}
            </div>
          </div>

          {/* Related records */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            {[
              { label: narrativeLabel === "Clinical Case" ? "RELATED DIAGNOSES" : "RELATED DEFECTS", items: incident.relatedDefects, color: "var(--col-red)" },
              { label: narrativeLabel === "Clinical Case" ? "RELATED PROCEDURES" : "MAINTENANCE LOGS", items: incident.relatedMaintenance, color: "var(--col-cyan)" },
            ].map(({ label, items, color }) => (
              <div
                key={label}
                style={{
                  padding: "8px 10px",
                  border: "1px solid hsl(var(--border-base))",
                  borderRadius: "2px",
                  backgroundColor: "hsl(var(--bg-void))",
                }}
              >
                <span style={{ ...DISP, fontSize: "0.46rem", fontWeight: 700, letterSpacing: "0.14em", color: "hsl(var(--text-dim))", display: "block", marginBottom: "5px" }}>
                  {label}
                </span>
                {items.length === 0 ? (
                  <span style={{ ...MONO, fontSize: "0.62rem", color: "hsl(var(--text-dim))" }}>none</span>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    {items.map((r) => (
                      <span key={r} style={{ ...MONO, fontSize: "0.65rem", color: `hsl(${color})` }}>
                        {r}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Tab2IncidentExplorer() {
  const { domain, config } = useDomain();
  const allRecords: (Incident | MedCase)[] = domain === "medical" ? MEDICAL_CASES : INCIDENTS;
  const systemOptions = domain === "medical" ? SPECIALTIES : SYSTEMS;
  const systemLabel = config.systemLabel;
  const narrativeLabel = config.narrativeLabel;
  const accent = config.accentVar;

  const [search, setSearch] = useState("");
  const [filterSystem, setFilterSystem] = useState("");
  const [filterSev, setFilterSev] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selected, setSelected] = useState<Incident | MedCase | null>(null);

  // Reset selection when domain switches
  React.useEffect(() => { setSelected(null); setFilterSystem(""); }, [domain]);

  const filtered = useMemo(() => {
    return allRecords.filter((inc) => {
      if (filterSystem && inc.system !== filterSystem) return false;
      if (filterSev && inc.severity !== filterSev) return false;
      if (dateFrom && inc.date < dateFrom) return false;
      if (dateTo && inc.date > dateTo) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          inc.id.toLowerCase().includes(q) ||
          inc.narrativeText.toLowerCase().includes(q) ||
          inc.correctiveAction.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [search, filterSystem, filterSev, dateFrom, dateTo]);

  return (
    <div style={{ height: "100%", display: "flex", gap: "6px", padding: "8px 10px 10px", overflow: "hidden" }}>

      {/* ── Left: filters + list ── */}
      <div style={{
        width: selected ? "42%" : "100%",
        display: "flex", flexDirection: "column", gap: "8px",
        transition: "width 0.2s ease",
        overflow: "hidden",
      }}>
        {/* Filter bar */}
        <div style={{
          padding: "10px 12px",
          border: "1px solid hsl(var(--border-base))",
          borderRadius: "2px",
          backgroundColor: "hsl(var(--bg-elevated))",
          display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center",
          flexShrink: 0,
        }}>
          {/* Search */}
          <div style={{ display: "flex", alignItems: "center", gap: "5px", flex: "1 1 160px" }}>
            <Search size={11} style={{ color: "hsl(var(--text-secondary))" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search narratives…"
              style={{ ...inputStyle, flex: 1 }}
            />
          </div>

          {/* System/Specialty filter */}
          <select value={filterSystem} onChange={(e) => setFilterSystem(e.target.value)} style={{ ...selectStyle, flex: "0 0 130px" }}>
            <option value="">All {systemLabel}s</option>
            {systemOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>

          {/* Severity filter */}
          <select value={filterSev} onChange={(e) => setFilterSev(e.target.value)} style={{ ...selectStyle, flex: "0 0 110px" }}>
            <option value="">All Severities</option>
            {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>

          {/* Date range */}
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ ...inputStyle, flex: "0 0 130px" }} />
          <input type="date" value={dateTo}   onChange={(e) => setDateTo(e.target.value)}   style={{ ...inputStyle, flex: "0 0 130px" }} />

          {/* Result count */}
          <span style={{ ...MONO, fontSize: "0.58rem", color: "hsl(var(--text-dim))", marginLeft: "auto" }}>
            {filtered.length} RECORDS
          </span>
        </div>

        {/* Record list */}
        <ScrollArea style={{ flex: 1 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", paddingRight: "4px" }}>
            {filtered.length === 0 && (
              <p style={{ ...MONO, fontSize: "0.65rem", color: "hsl(var(--text-dim))", padding: "16px", textAlign: "center" }}>
                NO MATCHING {narrativeLabel.toUpperCase()}S
              </p>
            )}
            {filtered.map((inc, i) => {
              const isActive = selected?.id === inc.id;
              return (
                <button
                  key={inc.id}
                  onClick={() => setSelected(isActive ? null : inc)}
                  className="step-animate"
                  style={{
                    animationDelay: `${i * 0.02}s`,
                    display: "flex", flexDirection: "column", gap: "5px",
                    padding: "9px 11px",
                    border: `1px solid ${isActive ? `hsl(${SEV_COLOR[inc.severity]} / 0.5)` : "hsl(var(--border-base))"}`,
                    borderLeft: `2px solid hsl(${SEV_COLOR[inc.severity]})`,
                    borderRadius: "2px",
                    backgroundColor: isActive ? `hsl(${SEV_COLOR[inc.severity]} / 0.06)` : "hsl(var(--bg-elevated))",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                    <span style={{ ...DISP, fontSize: "0.55rem", fontWeight: 700, letterSpacing: "0.1em", color: "hsl(var(--text-primary))" }}>
                      {inc.id}
                    </span>
                    <SevBadge severity={inc.severity} />
                    <span style={{ ...MONO, fontSize: "0.55rem", color: "hsl(var(--text-secondary))" }}>
                      {inc.system}
                    </span>
                    <span style={{ ...MONO, fontSize: "0.52rem", color: "hsl(var(--text-dim))", marginLeft: "auto" }}>
                      {inc.date}
                    </span>
                  </div>
                  <SimilarityBar incident={inc} />
                  <p style={{ ...MONO, fontSize: "0.65rem", color: "hsl(var(--text-secondary))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {inc.narrativeText.slice(0, 110)}{inc.narrativeText.length > 110 ? "…" : ""}
                  </p>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* ── Right: detail view ── */}
      {selected && (
        <div style={{
          flex: 1,
          border: "1px solid hsl(var(--border-base))",
          borderTop: `2px solid hsl(var(${accent}))`,
          borderRadius: "2px",
          backgroundColor: "hsl(var(--bg-panel))",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          animation: "msg-in 0.2s ease forwards",
        }}>
          <IncidentDetail incident={selected} onClose={() => setSelected(null)} narrativeLabel={narrativeLabel} systemLabel={systemLabel} accentVar={accent} />
        </div>
      )}
    </div>
  );
}
