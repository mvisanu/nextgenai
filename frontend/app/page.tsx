"use client";

// ============================================================
// page.tsx — Industrial Control-Room Layout
// Four-panel grid: Chat | Graph (spanning) | Timeline
// ============================================================

import { useState } from "react";
import ChatPanel from "./components/ChatPanel";
import AgentTimeline from "./components/AgentTimeline";
import GraphViewer from "./components/GraphViewer";
import { useDomain } from "./lib/domain-context";
import { PanelRightClose, PanelRightOpen } from "lucide-react";


// ---------------------------------------------------------------------------
// IndustrialPanel
// ---------------------------------------------------------------------------

function IndustrialPanel({
  label,
  accentCssVar,
  children,
  gridArea,
  extraClass = "",
  headerRight,
}: {
  label: string;
  accentCssVar: string;
  children: React.ReactNode;
  gridArea: string;
  extraClass?: string;
  headerRight?: React.ReactNode;
}) {
  return (
    <div
      className={`panel ${extraClass}`}
      style={{ gridArea, "--panel-accent": `hsl(var(${accentCssVar}))` } as React.CSSProperties}
    >
      <span className="corner-tl" />
      <span className="corner-tr" />
      <span className="corner-bl" />
      <span className="corner-br" />
      <div className="panel-hdr" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <div className="panel-dot" />
          <span className="panel-hdr-title">{label}</span>
        </div>
        {headerRight && <div style={{ paddingRight: "4px" }}>{headerRight}</div>}
      </div>
      <div className="panel-body">
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

const collapseButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "transparent",
  border: "1px solid hsl(var(--border-base))",
  borderRadius: "2px",
  color: "hsl(var(--text-dim))",
  cursor: "pointer",
  padding: "2px 4px",
  lineHeight: 1,
  transition: "all 0.15s",
};

export default function Home() {
  const { domain } = useDomain();
  const isMedical = domain === "medical";
  const [graphCollapsed, setGraphCollapsed] = useState(false);

  return (
    <div
      className="app-shell flex flex-col h-screen w-screen overflow-hidden grid-bg"
      style={{ backgroundColor: "hsl(var(--bg-void))" }}
    >
      <main
        className="main-panel-grid"
        style={{
          flex: 1,
          overflow: "hidden",
          display: "grid",
          gridTemplateColumns: graphCollapsed ? "1fr" : "2fr 3fr",
          gridTemplateRows: "3fr 2fr",
          gridTemplateAreas: graphCollapsed
            ? `"chat" "timeline"`
            : `"chat graph" "timeline graph"`,
          gap: "6px",
          padding: "6px",
        }}
      >
        <IndustrialPanel label="COMMS // QUERY INTERFACE" accentCssVar="--col-green" gridArea="chat" extraClass="panel-chat">
          <ChatPanel />
        </IndustrialPanel>

        <IndustrialPanel label="AGENT EXECUTION TRACE" accentCssVar="--col-amber" gridArea="timeline">
          <AgentTimeline />
        </IndustrialPanel>

        {!graphCollapsed && (
          <IndustrialPanel
            label={isMedical ? "CLINICAL KNOWLEDGE GRAPH // REACTFLOW" : "KNOWLEDGE GRAPH // REACTFLOW"}
            accentCssVar="--col-cyan"
            gridArea="graph"
            extraClass="panel-graph"
            headerRight={
              <button
                style={collapseButtonStyle}
                title="Collapse graph pane"
                onClick={() => setGraphCollapsed(true)}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "hsl(var(--col-cyan))"; (e.currentTarget as HTMLButtonElement).style.borderColor = "hsl(var(--col-cyan))"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "hsl(var(--text-dim))"; (e.currentTarget as HTMLButtonElement).style.borderColor = "hsl(var(--border-base))"; }}
              >
                <PanelRightClose size={11} />
              </button>
            }
          >
            <GraphViewer />
          </IndustrialPanel>
        )}

        {graphCollapsed && (
          <button
            title="Expand graph pane"
            onClick={() => setGraphCollapsed(false)}
            style={{
              position: "fixed",
              right: 10,
              top: "50%",
              transform: "translateY(-50%)",
              zIndex: 20,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "6px",
              padding: "10px 5px",
              background: "hsl(var(--bg-surface))",
              border: "1px solid hsl(var(--col-cyan) / 0.4)",
              borderRadius: "2px",
              color: "hsl(var(--col-cyan))",
              cursor: "pointer",
              boxShadow: "0 0 10px hsl(var(--col-cyan) / 0.15)",
              transition: "all 0.15s",
              writingMode: "vertical-lr",
              fontFamily: "var(--font-display)",
              fontSize: "0.5rem",
              fontWeight: 700,
              letterSpacing: "0.14em",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 16px hsl(var(--col-cyan) / 0.3)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 10px hsl(var(--col-cyan) / 0.15)"; }}
          >
            <PanelRightOpen size={11} style={{ transform: "rotate(90deg)" }} />
            GRAPH
          </button>
        )}
      </main>
    </div>
  );
}
