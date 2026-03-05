"use client";

// ============================================================
// page.tsx — Industrial Control-Room Layout
// Four-panel grid: Chat | Graph (spanning) | Timeline
// ============================================================

import ChatPanel from "./components/ChatPanel";
import AgentTimeline from "./components/AgentTimeline";
import GraphViewer from "./components/GraphViewer";
import { ThemeToggle, FontSizeControl } from "./lib/theme";
import Link from "next/link";
import { LayoutDashboard, HelpCircle, Database, GraduationCap, FlaskConical } from "lucide-react";

// ── Shared label font sizes (rem values at 16px base) ──────────────────────
// Header labels  : 0.7rem  = 11.2px
// Status dots/txt: 0.65rem = 10.4px
// Subtitle       : 0.65rem = 10.4px

// ---------------------------------------------------------------------------
// App header
// ---------------------------------------------------------------------------

function AppHeader() {
  return (
    <header
      className="flex items-center justify-between px-4 shrink-0"
      style={{
        height: "46px",
        backgroundColor: "hsl(var(--bg-surface))",
        borderBottom: "1px solid hsl(var(--border-base))",
        position: "relative",
        zIndex: 10,
      }}
    >
      {/* ── Logo + name ── */}
      <div className="flex items-center gap-3">
        {/* Diamond logo mark */}
        <div className="relative flex items-center justify-center" style={{ width: 22, height: 22 }}>
          <div
            style={{
              position: "absolute",
              width: 18,
              height: 18,
              border: "1.5px solid hsl(var(--col-green))",
              transform: "rotate(45deg)",
              boxShadow: "0 0 8px hsl(var(--col-green) / 0.3)",
            }}
          />
          <div
            style={{
              width: 8,
              height: 8,
              backgroundColor: "hsl(var(--col-green))",
              transform: "rotate(45deg)",
              boxShadow: "0 0 6px hsl(var(--col-green))",
            }}
          />
        </div>

        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "0.75rem",
            fontWeight: 700,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "hsl(var(--text-primary))",
          }}
        >
          NEXT
          <span style={{ color: "hsl(var(--col-green))" }}>
            AGENT
          </span>
          AI
        </span>

        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.65rem",
            color: "hsl(var(--text-dim))",
            letterSpacing: "0.08em",
          }}
        >
          // MANUFACTURING INTELLIGENCE PLATFORM
        </span>
      </div>

      {/* ── Right: status + dashboard link + theme toggle ── */}
      <div className="flex items-center gap-4">
        {/* Status indicators */}
        {[
          { label: "VECTOR", cssVar: "--col-cyan" },
          { label: "SQL",    cssVar: "--col-green" },
          { label: "GRAPH",  cssVar: "--col-purple" },
        ].map(({ label, cssVar }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                backgroundColor: `hsl(var(${cssVar}))`,
                boxShadow: `0 0 6px hsl(var(${cssVar}))`,
                animation: "dot-pulse 2.4s ease-in-out infinite",
              }}
            />
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.65rem",
                color: `hsl(var(${cssVar}))`,
                letterSpacing: "0.1em",
              }}
            >
              {label}
            </span>
          </div>
        ))}

        <div style={{ width: 1, height: 16, backgroundColor: "hsl(var(--border-strong))" }} />

        {/* Dashboard link */}
        <Link
          href="/dashboard"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            color: "hsl(var(--text-secondary))",
            textDecoration: "none",
            fontFamily: "var(--font-mono)",
            fontSize: "0.65rem",
            letterSpacing: "0.08em",
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "hsl(var(--col-cyan))"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "hsl(var(--text-secondary))"; }}
        >
          <LayoutDashboard size={13} />
          DASHBOARD
        </Link>

        {/* FAQ link */}
        <Link
          href="/faq"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            color: "hsl(var(--text-secondary))",
            textDecoration: "none",
            fontFamily: "var(--font-mono)",
            fontSize: "0.65rem",
            letterSpacing: "0.08em",
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "hsl(var(--col-cyan))"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "hsl(var(--text-secondary))"; }}
        >
          <HelpCircle size={13} />
          FAQ
        </Link>

        <Link
          href="/data"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            color: "hsl(var(--text-secondary))",
            textDecoration: "none",
            fontFamily: "var(--font-mono)",
            fontSize: "0.65rem",
            letterSpacing: "0.08em",
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "hsl(var(--col-amber))"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "hsl(var(--text-secondary))"; }}
        >
          <Database size={13} />
          DATA
        </Link>

        <Link
          href="/review"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            color: "hsl(var(--text-secondary))",
            textDecoration: "none",
            fontFamily: "var(--font-mono)",
            fontSize: "0.65rem",
            letterSpacing: "0.08em",
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "hsl(var(--col-purple))"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "hsl(var(--text-secondary))"; }}
        >
          <GraduationCap size={13} />
          REVIEW
        </Link>

        <Link
          href="/examples"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            color: "hsl(var(--text-secondary))",
            textDecoration: "none",
            fontFamily: "var(--font-mono)",
            fontSize: "0.65rem",
            letterSpacing: "0.08em",
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "hsl(var(--col-green))"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "hsl(var(--text-secondary))"; }}
        >
          <FlaskConical size={13} />
          EXAMPLES
        </Link>

        <div style={{ width: 1, height: 16, backgroundColor: "hsl(var(--border-strong))" }} />

        <FontSizeControl />
        <ThemeToggle />
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// IndustrialPanel
// ---------------------------------------------------------------------------

function IndustrialPanel({
  label,
  accentCssVar,
  children,
  gridArea,
}: {
  label: string;
  accentCssVar: string;
  children: React.ReactNode;
  gridArea: string;
}) {
  return (
    <div
      className="panel"
      style={{ gridArea, "--panel-accent": `hsl(var(${accentCssVar}))` } as React.CSSProperties}
    >
      <span className="corner-tl" />
      <span className="corner-tr" />
      <span className="corner-bl" />
      <span className="corner-br" />
      <div className="panel-hdr">
        <div className="panel-dot" />
        <span className="panel-hdr-title">{label}</span>
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

export default function Home() {
  return (
    <div
      className="flex flex-col h-screen w-screen overflow-hidden grid-bg"
      style={{ backgroundColor: "hsl(var(--bg-void))" }}
    >
      <AppHeader />

      <main
        style={{
          flex: 1,
          overflow: "hidden",
          display: "grid",
          gridTemplateColumns: "2fr 3fr",
          gridTemplateRows: "3fr 2fr",
          gridTemplateAreas: `
            "chat  graph"
            "timeline graph"
          `,
          gap: "6px",
          padding: "6px",
        }}
      >
        <IndustrialPanel label="COMMS // QUERY INTERFACE"   accentCssVar="--col-green"  gridArea="chat">
          <ChatPanel />
        </IndustrialPanel>

        <IndustrialPanel label="AGENT EXECUTION TRACE"      accentCssVar="--col-amber"  gridArea="timeline">
          <AgentTimeline />
        </IndustrialPanel>

        <IndustrialPanel label="KNOWLEDGE GRAPH // REACTFLOW" accentCssVar="--col-cyan" gridArea="graph">
          <GraphViewer />
        </IndustrialPanel>
      </main>
    </div>
  );
}
