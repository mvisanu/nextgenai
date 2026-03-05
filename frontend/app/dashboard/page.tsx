"use client";

// ============================================================
// dashboard/page.tsx — Agentic Quality Intelligence Dashboard
// Five-tab industrial control-room layout
// ============================================================

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  MessageSquare, Layers, BarChart2, TrendingUp, FlaskConical,
  ArrowLeft, Activity, HelpCircle, Database, GraduationCap, GitBranch, Stethoscope, ChevronDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import Tab1AgentQuery        from "./components/Tab1AgentQuery";
import Tab2IncidentExplorer  from "./components/Tab2IncidentExplorer";
import Tab3DefectAnalytics   from "./components/Tab3DefectAnalytics";
import Tab4MaintenanceTrends from "./components/Tab4MaintenanceTrends";
import Tab5DataEval          from "./components/Tab5DataEval";
import { ThemeToggle, FontSizeControl } from "../lib/theme";
import { useDomain, DOMAIN_CONFIGS, type Domain } from "../lib/domain-context";

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

function useTabs(isMedical: boolean): Tab[] {
  return [
    {
      id: "agent",
      label: isMedical ? "CLINICAL QUERY"      : "ASK THE AGENT",
      shortLabel: "AGENT",
      icon: MessageSquare,
      accentVar: "--col-green",
      component: Tab1AgentQuery,
    },
    {
      id: "explorer",
      label: isMedical ? "CASE EXPLORER"        : "INCIDENT EXPLORER",
      shortLabel: isMedical ? "CASES"    : "INCIDENTS",
      icon: Layers,
      accentVar: "--col-cyan",
      component: Tab2IncidentExplorer,
    },
    {
      id: "defects",
      label: isMedical ? "DISEASE ANALYTICS"   : "DEFECT ANALYTICS",
      shortLabel: isMedical ? "DISEASE"  : "DEFECTS",
      icon: BarChart2,
      accentVar: "--col-red",
      component: Tab3DefectAnalytics,
    },
    {
      id: "maintenance",
      label: isMedical ? "COHORT TRENDS"        : "MAINTENANCE TRENDS",
      shortLabel: isMedical ? "COHORT"   : "MAINT.",
      icon: TrendingUp,
      accentVar: "--col-amber",
      component: Tab4MaintenanceTrends,
    },
    {
      id: "eval",
      label: isMedical ? "CLINICAL EVALUATION"  : "DATA & EVALUATION",
      shortLabel: "EVAL",
      icon: FlaskConical,
      accentVar: "--col-purple",
      component: Tab5DataEval,
    },
  ];
}

// ── Dashboard header ───────────────────────────────────────────────────────────

function DomainSwitcher() {
  const { domain, setDomain } = useDomain();
  return (
    <div style={{ display: "flex", gap: "3px", alignItems: "center" }}>
      {(["aircraft", "medical"] as Domain[]).map((d) => {
        const cfg = DOMAIN_CONFIGS[d];
        const isActive = domain === d;
        return (
          <button
            key={d}
            onClick={() => setDomain(d)}
            style={{
              display: "flex", alignItems: "center", gap: "4px",
              padding: "3px 9px",
              fontFamily: "var(--font-display)",
              fontSize: "0.58rem",
              fontWeight: 700,
              letterSpacing: "0.12em",
              border: `1px solid ${isActive ? `hsl(var(${cfg.accentVar}))` : "hsl(var(--border-base))"}`,
              borderRadius: "2px",
              backgroundColor: isActive ? `hsl(var(${cfg.accentVar}) / 0.12)` : "transparent",
              color: isActive ? `hsl(var(${cfg.accentVar}))` : "hsl(var(--text-dim))",
              cursor: "pointer",
              transition: "all 0.15s",
              boxShadow: isActive ? `0 0 8px hsl(var(${cfg.accentVar}) / 0.2)` : "none",
            }}
          >
            <span>{cfg.icon}</span>
            <span className="nav-link-text">{cfg.shortLabel}</span>
          </button>
        );
      })}
    </div>
  );
}

const DASH_NAV_ITEMS = [
  { href: "/",                 label: "MAIN APP",   icon: ArrowLeft,      accent: "--col-green"  },
  { href: "/data",             label: "DATA",        icon: Database,       accent: "--col-amber"  },
  { href: "/review",           label: "REVIEW",      icon: GraduationCap,  accent: "--col-purple" },
  { href: "/examples",         label: "EXAMPLES",    icon: FlaskConical,   accent: "--col-green"  },
  { href: "/medical-examples", label: "MED-EX",      icon: Stethoscope,    accent: "--col-cyan"   },
  { href: "/diagram",          label: "DIAGRAM",     icon: GitBranch,      accent: "--col-cyan"   },
  { href: "/faq",              label: "FAQ",          icon: HelpCircle,     accent: "--col-cyan"   },
] as const;

function DashNavDropdown() {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          style={{
            display: "flex", alignItems: "center", gap: "4px",
            padding: "3px 8px",
            fontFamily: "var(--font-mono)",
            fontSize: "0.6rem", fontWeight: 600, letterSpacing: "0.1em",
            color: "hsl(var(--text-secondary))",
            backgroundColor: "transparent",
            border: "1px solid hsl(var(--border-base))",
            borderRadius: "2px", cursor: "pointer", transition: "all 0.15s",
          }}
          onMouseEnter={(e) => { const el = e.currentTarget as HTMLButtonElement; el.style.color = "hsl(var(--col-cyan))"; el.style.borderColor = "hsl(var(--col-cyan))"; }}
          onMouseLeave={(e) => { const el = e.currentTarget as HTMLButtonElement; el.style.color = "hsl(var(--text-secondary))"; el.style.borderColor = "hsl(var(--border-base))"; }}
        >
          NAVIGATE <ChevronDown size={10} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end" sideOffset={6}
        style={{
          backgroundColor: "hsl(var(--bg-surface))",
          border: "1px solid hsl(var(--border-base))",
          borderRadius: "2px", padding: "4px", minWidth: "160px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        }}
      >
        <DropdownMenuLabel style={{ fontFamily: "var(--font-mono)", fontSize: "0.55rem", letterSpacing: "0.14em", color: "hsl(var(--text-dim))", padding: "4px 8px 6px" }}>
          // PAGES
        </DropdownMenuLabel>
        <DropdownMenuSeparator style={{ backgroundColor: "hsl(var(--border-base))", margin: "0 0 4px" }} />
        {DASH_NAV_ITEMS.map(({ href, label, icon: Icon, accent }) => (
          <DropdownMenuItem
            key={href}
            onSelect={() => router.push(href)}
            style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", letterSpacing: "0.08em", color: "hsl(var(--text-secondary))", padding: "5px 8px", borderRadius: "1px", cursor: "pointer", gap: "7px" }}
            className="nav-dropdown-item"
          >
            <Icon size={11} style={{ color: `hsl(var(${accent}))`, flexShrink: 0 }} />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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

        <div style={{ width: 1, height: 14, backgroundColor: "hsl(var(--border-strong))" }} />

        <DashNavDropdown />

        <div style={{ width: 1, height: 14, backgroundColor: "hsl(var(--border-strong))" }} />

        <DomainSwitcher />

        <div style={{ width: 1, height: 14, backgroundColor: "hsl(var(--border-strong))" }} />

        <div className="header-font-control"><FontSizeControl /></div>
        <ThemeToggle />
      </div>
    </header>
  );
}

// ── Domain banner ──────────────────────────────────────────────────────────────

function DomainBanner() {
  const { domain, config } = useDomain();
  const accent = config.accentVar;
  const isMedical = domain === "medical";

  return (
    <div
      style={{
        height: "28px",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "0 16px",
        backgroundColor: `hsl(var(${accent}) / 0.06)`,
        borderBottom: `1px solid hsl(var(${accent}) / 0.25)`,
        flexShrink: 0,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Animated scan line */}
      <div style={{
        position: "absolute",
        inset: 0,
        background: `linear-gradient(90deg, transparent 0%, hsl(var(${accent}) / 0.08) 50%, transparent 100%)`,
        animation: "scan-h 4s linear infinite",
        pointerEvents: "none",
      }} />

      <span style={{ fontSize: "0.48rem", fontFamily: "var(--font-display)", fontWeight: 700, letterSpacing: "0.16em", color: `hsl(var(${accent}))` }}>
        {config.icon}
      </span>
      <span style={{ fontSize: "0.52rem", fontFamily: "var(--font-display)", fontWeight: 700, letterSpacing: "0.18em", color: `hsl(var(${accent}))` }}>
        {isMedical ? "CLINICAL INTELLIGENCE MODE" : "MANUFACTURING INTELLIGENCE MODE"}
      </span>

      <div style={{ width: 4, height: 4, borderRadius: "50%", backgroundColor: `hsl(var(${accent}))`, boxShadow: `0 0 5px hsl(var(${accent}))`, animation: "dot-pulse 2.4s ease-in-out infinite" }} />

      <span style={{ fontSize: "0.48rem", fontFamily: "var(--font-mono)", color: `hsl(var(${accent}) / 0.6)`, letterSpacing: "0.1em" }}>
        {isMedical
          ? "5 specialties · 15 cohorts · patient outcome analytics"
          : "5 systems · 50 assets · quality defect analytics"}
      </span>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ fontSize: "0.44rem", fontFamily: "var(--font-display)", fontWeight: 700, letterSpacing: "0.12em", color: `hsl(var(${accent}) / 0.5)` }}>
          DOMAIN
        </span>
        <span style={{
          fontSize: "0.52rem",
          fontFamily: "var(--font-mono)",
          fontWeight: 600,
          color: `hsl(var(${accent}))`,
          padding: "1px 7px",
          border: `1px solid hsl(var(${accent}) / 0.35)`,
          borderRadius: "2px",
          backgroundColor: `hsl(var(${accent}) / 0.08)`,
          letterSpacing: "0.1em",
        }}>
          {domain.toUpperCase()}
        </span>
      </div>
    </div>
  );
}

// ── Tab navigation bar ─────────────────────────────────────────────────────────

function TabNav({ active, onChange }: { active: TabId; onChange: (id: TabId) => void }) {
  const { domain } = useDomain();
  const tabs = useTabs(domain === "medical");

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
      {tabs.map((tab) => {
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
              0{tabs.indexOf(tab) + 1}
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
          {tabs.find((t) => t.id === active)?.label}
        </span>
      </div>
    </nav>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<TabId>("agent");
  const { domain } = useDomain();
  const tabs = useTabs(domain === "medical");
  const ActiveComponent = tabs.find((t) => t.id === activeTab)?.component ?? Tab1AgentQuery;
  const activeAccent = tabs.find((t) => t.id === activeTab)?.accentVar ?? "--col-green";

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
      <DomainBanner />
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
