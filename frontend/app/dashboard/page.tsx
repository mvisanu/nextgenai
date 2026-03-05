"use client";

// ============================================================
// dashboard/page.tsx — Agentic Quality Intelligence Dashboard
// Five-tab industrial control-room layout
// ============================================================

import React, { useState } from "react";
import Link from "next/link";
import {
  MessageSquare, Layers, BarChart2, TrendingUp, FlaskConical,
  ArrowLeft, Activity, HelpCircle, Database, GraduationCap, GitBranch,
} from "lucide-react";

import Tab1AgentQuery        from "./components/Tab1AgentQuery";
import Tab2IncidentExplorer  from "./components/Tab2IncidentExplorer";
import Tab3DefectAnalytics   from "./components/Tab3DefectAnalytics";
import Tab4MaintenanceTrends from "./components/Tab4MaintenanceTrends";
import Tab5DataEval          from "./components/Tab5DataEval";
import { ThemeToggle, FontSizeControl } from "../lib/theme";

// ── Types ─────────────────────────────────────────────────────────────────────

type TabId = "agent" | "explorer" | "defects" | "maintenance" | "eval";

interface Tab {
  id: TabId;
  label: string;
  shortLabel: string;
  icon: React.ElementType;
  accentVar: string;
  component: React.ComponentType;
}

const TABS: Tab[] = [
  { id: "agent",       label: "ASK THE AGENT",       shortLabel: "AGENT",    icon: MessageSquare, accentVar: "--col-green",  component: Tab1AgentQuery       },
  { id: "explorer",    label: "INCIDENT EXPLORER",    shortLabel: "INCIDENTS",icon: Layers,        accentVar: "--col-cyan",   component: Tab2IncidentExplorer },
  { id: "defects",     label: "DEFECT ANALYTICS",     shortLabel: "DEFECTS",  icon: BarChart2,     accentVar: "--col-red",    component: Tab3DefectAnalytics  },
  { id: "maintenance", label: "MAINTENANCE TRENDS",   shortLabel: "MAINT.",   icon: TrendingUp,    accentVar: "--col-amber",  component: Tab4MaintenanceTrends},
  { id: "eval",        label: "DATA & EVALUATION",    shortLabel: "EVAL",     icon: FlaskConical,  accentVar: "--col-purple", component: Tab5DataEval         },
];

// ── Dashboard header ───────────────────────────────────────────────────────────

function DashboardHeader() {
  return (
    <header
      style={{
        height: "46px",
        backgroundColor: "hsl(var(--bg-surface))",
        borderBottom: "1px solid hsl(var(--border-base))",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        flexShrink: 0,
        position: "relative",
        zIndex: 10,
      }}
    >
      {/* Left: back + branding */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            color: "hsl(var(--text-secondary))",
            textDecoration: "none",
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "hsl(var(--col-green))"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "hsl(var(--text-secondary))"; }}
        >
          <ArrowLeft size={13} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.68rem", letterSpacing: "0.1em" }}>
            MAIN APP
          </span>
        </Link>

        <div style={{ width: 1, height: 16, backgroundColor: "hsl(var(--border-strong))" }} />

        {/* Diamond logo */}
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22 }}>
          <div style={{
            position: "absolute", width: 18, height: 18,
            border: "1.5px solid hsl(var(--col-green))",
            transform: "rotate(45deg)",
            boxShadow: "0 0 8px hsl(var(--col-green) / 0.3)",
          }} />
          <div style={{
            width: 8, height: 8,
            backgroundColor: "hsl(var(--col-green))",
            transform: "rotate(45deg)",
            boxShadow: "0 0 6px hsl(var(--col-green))",
          }} />
        </div>

        <span style={{
          fontFamily: "var(--font-display)",
          fontSize: "0.75rem",
          fontWeight: 700,
          letterSpacing: "0.2em",
          color: "hsl(var(--text-primary))",
        }}>
          NEXT<span style={{ color: "hsl(var(--col-green))" }}>AGENT</span>AI
        </span>

        <span className="header-subtitle" style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.65rem",
          color: "hsl(var(--text-dim))",
          letterSpacing: "0.08em",
        }}>
          // QUALITY INTELLIGENCE DASHBOARD
        </span>
      </div>

      {/* Right: live indicator + toggle */}
      <div className="header-inner-right" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <div className="header-status-group" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Activity size={12} style={{ color: "hsl(var(--col-green))" }} />
          <span className="header-subtitle" style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.65rem",
            color: "hsl(var(--text-secondary))",
            letterSpacing: "0.08em",
          }}>
            DEMO — SYNTHETIC DATA
          </span>
          <div style={{
            width: 6, height: 6, borderRadius: "50%",
            backgroundColor: "hsl(var(--col-green))",
            boxShadow: "0 0 6px hsl(var(--col-green))",
            animation: "dot-pulse 2.4s ease-in-out infinite",
          }} />
        </div>

        <div style={{ width: 1, height: 16, backgroundColor: "hsl(var(--border-strong))" }} />

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
          <span className="nav-link-text">FAQ</span>
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
          <span className="nav-link-text">DATA</span>
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
          <span className="nav-link-text">REVIEW</span>
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
          <span className="nav-link-text">EXAMPLES</span>
        </Link>

        <Link
          href="/diagram"
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
          <GitBranch size={13} />
          <span className="nav-link-text">DIAGRAM</span>
        </Link>

        <div style={{ width: 1, height: 16, backgroundColor: "hsl(var(--border-strong))" }} />

        <div className="header-font-control"><FontSizeControl /></div>
        <ThemeToggle />
      </div>
    </header>
  );
}

// ── Tab navigation bar ─────────────────────────────────────────────────────────

function TabNav({ active, onChange }: { active: TabId; onChange: (id: TabId) => void }) {
  return (
    <nav
      className="tab-nav-scroll"
      style={{
        height: "42px",
        backgroundColor: "hsl(var(--bg-void))",
        borderBottom: "1px solid hsl(var(--border-base))",
        display: "flex",
        alignItems: "stretch",
        padding: "0 10px",
        gap: "2px",
        flexShrink: 0,
      }}
    >
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "7px",
              padding: "0 16px",
              border: "none",
              borderBottom: `2px solid ${isActive ? `hsl(var(${tab.accentVar}))` : "transparent"}`,
              backgroundColor: isActive ? "hsl(var(--bg-panel))" : "transparent",
              color: isActive ? `hsl(var(${tab.accentVar}))` : "hsl(var(--text-secondary))",
              cursor: "pointer",
              transition: "all 0.15s",
              position: "relative",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                (e.currentTarget as HTMLButtonElement).style.color = "hsl(var(--text-primary))";
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = "hsl(var(--bg-elevated))";
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                (e.currentTarget as HTMLButtonElement).style.color = "hsl(var(--text-secondary))";
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
              }
            }}
          >
            {isActive && (
              <div style={{
                width: 5, height: 5, borderRadius: "50%",
                backgroundColor: `hsl(var(${tab.accentVar}))`,
                boxShadow: `0 0 5px hsl(var(${tab.accentVar}))`,
                animation: "dot-pulse 2.4s ease-in-out infinite",
                flexShrink: 0,
              }} />
            )}
            <Icon size={13} style={{ flexShrink: 0 }} />
            <span style={{
              fontFamily: "var(--font-display)",
              fontSize: "0.65rem",
              fontWeight: 700,
              letterSpacing: "0.12em",
            }}>
              {tab.shortLabel}
            </span>
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.58rem",
              color: "hsl(var(--text-dim))",
              opacity: isActive ? 0.8 : 0.5,
            }}>
              0{TABS.indexOf(tab) + 1}
            </span>
          </button>
        );
      })}

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
        <span style={{
          fontFamily: "var(--font-display)",
          fontSize: "0.62rem",
          fontWeight: 700,
          letterSpacing: "0.16em",
          color: "hsl(var(--text-dim))",
          padding: "0 10px",
        }}>
          {TABS.find((t) => t.id === active)?.label}
        </span>
      </div>
    </nav>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<TabId>("agent");
  const ActiveComponent = TABS.find((t) => t.id === activeTab)?.component ?? Tab1AgentQuery;
  const activeAccent = TABS.find((t) => t.id === activeTab)?.accentVar ?? "--col-green";

  return (
    <div
      className="app-shell grid-bg"
      style={{
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "hsl(var(--bg-void))",
      }}
    >
      <DashboardHeader />
      <TabNav active={activeTab} onChange={setActiveTab} />

      <div
        key={activeTab}
        style={{
          flex: 1,
          overflow: "hidden",
          animation: "msg-in 0.18s ease forwards",
          borderTop: `1px solid hsl(var(${activeAccent}) / 0.15)`,
        }}
      >
        <ActiveComponent />
      </div>
    </div>
  );
}
