"use client";

import React, { useState } from "react";
import {
  Send, ChevronDown, ChevronUp, Cpu, CheckCircle2,
  AlertTriangle, Info, Search, Zap,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MOCK_AGENT_RESPONSE, MOCK_MEDICAL_RESPONSE, type Severity } from "../mock-data";
import { useDomain } from "../../lib/domain-context";

// ── Shared styles ───────────────────────────────────────────────────────────

const MONO: React.CSSProperties = { fontFamily: "var(--font-mono)" };
const DISP: React.CSSProperties = { fontFamily: "var(--font-display)" };

const SEV_COLOR: Record<Severity, string> = {
  Critical: "var(--col-red)",
  High:     "var(--col-amber)",
  Medium:   "var(--col-cyan)",
  Low:      "var(--col-green)",
};

const CONF_COLOR: Record<"HIGH" | "MEDIUM" | "LOW", string> = {
  HIGH:   "var(--col-green)",
  MEDIUM: "var(--col-amber)",
  LOW:    "var(--col-cyan)",
};

// ── Custom Tooltip badge ─────────────────────────────────────────────────────

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        ...DISP,
        fontSize: "0.48rem",
        fontWeight: 700,
        letterSpacing: "0.14em",
        padding: "1px 6px",
        border: `1px solid hsl(${color} / 0.55)`,
        borderRadius: "2px",
        color: `hsl(${color})`,
        backgroundColor: `hsl(${color} / 0.09)`,
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}

// ── Score bar ────────────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const pct = `${(score * 100).toFixed(0)}%`;
  const color =
    score >= 0.9 ? "var(--col-green)" : score >= 0.75 ? "var(--col-cyan)" : "var(--col-amber)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <div style={{ flex: 1, height: 3, backgroundColor: "hsl(var(--border-base))", borderRadius: 1 }}>
        <div
          style={{
            height: "100%",
            width: `${score * 100}%`,
            backgroundColor: `hsl(${color})`,
            boxShadow: `0 0 6px hsl(${color} / 0.5)`,
          }}
        />
      </div>
      <span style={{ ...MONO, fontSize: "0.62rem", color: `hsl(${color})`, flexShrink: 0 }}>
        {pct}
      </span>
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionLabel({ icon: Icon, label, color = "var(--text-secondary)" }: {
  icon: React.ElementType; label: string; color?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
      <Icon size={11} style={{ color: `hsl(${color})`, flexShrink: 0 }} />
      <span style={{ ...DISP, fontSize: "0.52rem", fontWeight: 700, letterSpacing: "0.18em", color: `hsl(${color})` }}>
        {label}
      </span>
    </div>
  );
}

// ── Suggested queries ─────────────────────────────────────────────────────────

const SUGGESTIONS_AIRCRAFT = [
  "Hydraulic leak near actuator; suspected seal degradation",
  "Intermittent short circuit in avionics harness; chafing observed",
  "Corrosion on fastener around skin panel; lot quarantined",
];

const SUGGESTIONS_MEDICAL = [
  "Chest pain with ST-elevation, troponin positive, diaphoresis",
  "Sudden severe headache, photophobia, neck stiffness",
  "Dyspnoea with bilateral crackles, elevated BNP, known heart failure",
];

// ── Main component ────────────────────────────────────────────────────────────

export default function Tab1AgentQuery() {
  const { domain, config } = useDomain();
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showToolCalls, setShowToolCalls] = useState(false);
  const data = domain === "medical" ? MOCK_MEDICAL_RESPONSE : MOCK_AGENT_RESPONSE;
  const accent = config.accentVar;
  const SUGGESTIONS = domain === "medical" ? SUGGESTIONS_MEDICAL : SUGGESTIONS_AIRCRAFT;

  function handleSubmit() {
    if (!query.trim() || loading) return;
    setLoading(true);
    setSubmitted(false);
    setTimeout(() => {
      setLoading(false);
      setSubmitted(true);
    }, 1600);
  }

  function handleSuggestion(s: string) {
    setQuery(s);
  }

  const panelStyle: React.CSSProperties = {
    border: "1px solid hsl(var(--border-base))",
    borderRadius: "2px",
    backgroundColor: "hsl(var(--bg-elevated))",
    padding: "12px 14px",
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: "8px", padding: "8px 10px 10px" }}>
      {/* ── Input section ── */}
      <div style={panelStyle}>
        <SectionLabel icon={Search} label="QUERY INPUT" color={`var(${accent})`} />

        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
          placeholder={config.queryPlaceholder}
          rows={3}
          className="industrial-textarea"
          style={{ width: "100%", padding: "8px 10px", marginBottom: "8px" }}
        />

        {/* Suggestions */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginBottom: "8px" }}>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => handleSuggestion(s)}
              style={{
                ...MONO,
                fontSize: "0.6rem",
                color: "hsl(var(--text-dim))",
                border: "1px solid hsl(var(--border-base))",
                borderRadius: "2px",
                padding: "2px 7px",
                backgroundColor: "transparent",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = `hsl(var(${accent}))`;
                (e.currentTarget as HTMLButtonElement).style.borderColor = `hsl(var(${accent}) / 0.4)`;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "hsl(var(--text-dim))";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "hsl(var(--border-base))";
              }}
            >
              {s.slice(0, 52)}{s.length > 52 ? "…" : ""}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={handleSubmit}
            disabled={!query.trim() || loading}
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "6px 16px",
              backgroundColor: (!query.trim() || loading) ? "hsl(var(--bg-panel))" : `hsl(var(${accent}) / 0.12)`,
              border: `1px solid ${(!query.trim() || loading) ? "hsl(var(--border-base))" : `hsl(var(${accent}) / 0.6)`}`,
              borderRadius: "2px",
              color: (!query.trim() || loading) ? "hsl(var(--text-dim))" : `hsl(var(${accent}))`,
              cursor: (!query.trim() || loading) ? "not-allowed" : "pointer",
              boxShadow: (!query.trim() || loading) ? "none" : `0 0 12px hsl(var(${accent}) / 0.2)`,
              transition: "all 0.15s",
            }}
          >
            {loading ? (
              <>
                <Cpu size={13} style={{ animation: "dot-pulse 1s infinite" }} />
                <span style={{ ...DISP, fontSize: "0.55rem", fontWeight: 700, letterSpacing: "0.15em" }}>
                  PROCESSING…
                </span>
              </>
            ) : (
              <>
                <Send size={13} />
                <span style={{ ...DISP, fontSize: "0.55rem", fontWeight: 700, letterSpacing: "0.15em" }}>
                  EXECUTE QUERY
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Results ── */}
      {submitted && (
        <ScrollArea className="flex-1">
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", paddingRight: "4px" }}>

            {/* Similar incidents */}
            <div style={panelStyle}>
              <SectionLabel icon={Search} label={`TOP SIMILAR ${config.narrativeLabel.toUpperCase()}S`} color="var(--col-cyan)" />
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {data.similarIncidents.map((inc, i) => (
                  <div
                    key={inc.id}
                    className="step-animate"
                    style={{
                      animationDelay: `${i * 0.06}s`,
                      padding: "8px 10px",
                      border: "1px solid hsl(var(--border-base))",
                      borderLeft: `2px solid hsl(${SEV_COLOR[inc.severity]})`,
                      borderRadius: "2px",
                      backgroundColor: "hsl(var(--bg-panel))",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "5px" }}>
                      <span style={{ ...DISP, fontSize: "0.55rem", fontWeight: 700, letterSpacing: "0.1em", color: "hsl(var(--text-primary))" }}>
                        {inc.id}
                      </span>
                      <Chip label={inc.system.toUpperCase()} color="var(--col-blue)" />
                      <Chip label={inc.severity.toUpperCase()} color={SEV_COLOR[inc.severity]} />
                      <div style={{ flex: 1 }} />
                      <span style={{ ...MONO, fontSize: "0.55rem", color: "hsl(var(--text-dim))" }}>rank {i + 1}</span>
                    </div>
                    <ScoreBar score={inc.score} />
                    <p style={{ ...MONO, fontSize: "0.68rem", color: "hsl(var(--text-secondary))", lineHeight: "1.5", marginTop: "5px" }}>
                      {inc.excerpt}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Reasoned summary */}
            <div style={panelStyle}>
              <SectionLabel icon={Zap} label="REASONED SUMMARY" color="var(--col-purple)" />
              <p
                style={{ ...MONO, fontSize: "0.75rem", color: "hsl(var(--text-primary))", lineHeight: "1.7" }}
                dangerouslySetInnerHTML={{
                  __html: data.summary.replace(
                    /\*\*(.+?)\*\*/g,
                    `<strong style="color:hsl(var(--col-green));font-weight:600">$1</strong>`
                  ),
                }}
              />
            </div>

            {/* Recommended actions */}
            <div style={panelStyle}>
              <SectionLabel icon={CheckCircle2} label="RECOMMENDED ACTIONS" color={`var(${accent})`} />
              <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                {data.recommendations.map((rec, i) => (
                  <div
                    key={i}
                    className="step-animate"
                    style={{
                      animationDelay: `${i * 0.07}s`,
                      display: "flex",
                      gap: "10px",
                      alignItems: "flex-start",
                      padding: "8px 10px",
                      border: "1px solid hsl(var(--border-base))",
                      borderRadius: "2px",
                      backgroundColor: "hsl(var(--bg-panel))",
                    }}
                  >
                    <Chip label={rec.confidence} color={CONF_COLOR[rec.confidence]} />
                    <p style={{ ...MONO, fontSize: "0.72rem", color: "hsl(var(--text-secondary))", lineHeight: "1.5", flex: 1 }}>
                      {rec.action}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Tool calls */}
            <div style={{ ...panelStyle, padding: "10px 14px" }}>
              <button
                onClick={() => setShowToolCalls((v) => !v)}
                style={{
                  display: "flex", alignItems: "center", gap: "8px",
                  background: "none", border: "none", cursor: "pointer", padding: 0, width: "100%",
                }}
              >
                <Info size={11} style={{ color: "hsl(var(--col-amber))", flexShrink: 0 }} />
                <span style={{ ...DISP, fontSize: "0.52rem", fontWeight: 700, letterSpacing: "0.18em", color: "hsl(var(--col-amber))" }}>
                  TOOL CALL TRACE ({data.toolCalls.length} calls)
                </span>
                <div style={{ flex: 1 }} />
                {showToolCalls
                  ? <ChevronUp size={12} style={{ color: "hsl(var(--text-dim))" }} />
                  : <ChevronDown size={12} style={{ color: "hsl(var(--text-dim))" }} />}
              </button>

              {showToolCalls && (
                <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "6px" }}>
                  {data.toolCalls.map((tc, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "8px 10px",
                        border: "1px solid hsl(var(--border-base))",
                        borderLeft: "2px solid hsl(var(--col-amber))",
                        borderRadius: "2px",
                        backgroundColor: "hsl(var(--bg-void))",
                      }}
                    >
                      <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "5px" }}>
                        <span style={{ ...DISP, fontSize: "0.52rem", fontWeight: 700, letterSpacing: "0.12em", color: "hsl(var(--col-amber))" }}>
                          {tc.tool}
                        </span>
                        <span style={{ ...MONO, fontSize: "0.55rem", color: "hsl(var(--text-dim))" }}>
                          {tc.latencyMs.toLocaleString()} ms
                        </span>
                        <AlertTriangle size={9} style={{ color: tc.latencyMs > 1000 ? "hsl(var(--col-amber))" : "hsl(var(--col-green))", flexShrink: 0 }} />
                      </div>
                      <p style={{ ...MONO, fontSize: "0.62rem", color: "hsl(var(--col-cyan))", marginBottom: "3px" }}>
                        IN: {tc.input}
                      </p>
                      <p style={{ ...MONO, fontSize: "0.62rem", color: "hsl(var(--text-secondary))" }}>
                        OUT: {tc.output}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </ScrollArea>
      )}

      {!submitted && !loading && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p style={{ ...MONO, fontSize: "0.62rem", color: "hsl(var(--text-dim))", letterSpacing: "0.1em", textAlign: "center" }}>
            AWAITING QUERY — ENTER TEXT ABOVE AND PRESS EXECUTE
          </p>
        </div>
      )}
    </div>
  );
}
