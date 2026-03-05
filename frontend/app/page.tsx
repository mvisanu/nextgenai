"use client";

// ============================================================
// page.tsx — Industrial Control-Room Layout
// Four-panel grid: Chat | Graph (spanning) | Timeline
// ============================================================

import ChatPanel from "./components/ChatPanel";
import AgentTimeline from "./components/AgentTimeline";
import GraphViewer from "./components/GraphViewer";
import { ThemeToggle, FontSizeControl } from "./lib/theme";
import { useDomain, DOMAIN_CONFIGS, type Domain } from "./lib/domain-context";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutDashboard, HelpCircle, Database, GraduationCap, FlaskConical, GitBranch, Stethoscope, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ── Shared label font sizes (rem values at 16px base) ──────────────────────
// Header labels  : 0.7rem  = 11.2px
// Status dots/txt: 0.65rem = 10.4px
// Subtitle       : 0.65rem = 10.4px

// ---------------------------------------------------------------------------
// App header
// ---------------------------------------------------------------------------

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

const NAV_ITEMS = [
  { href: "/dashboard",        label: "DASHBOARD",  icon: LayoutDashboard, accent: "--col-cyan"   },
  { href: "/data",             label: "DATA",        icon: Database,        accent: "--col-amber"  },
  { href: "/review",           label: "REVIEW",      icon: GraduationCap,   accent: "--col-purple" },
  { href: "/examples",         label: "EXAMPLES",    icon: FlaskConical,    accent: "--col-green"  },
  { href: "/medical-examples", label: "MED-EX",      icon: Stethoscope,     accent: "--col-cyan"   },
  { href: "/diagram",          label: "DIAGRAM",     icon: GitBranch,       accent: "--col-cyan"   },
  { href: "/faq",              label: "FAQ",          icon: HelpCircle,      accent: "--col-cyan"   },
] as const;

function NavDropdown() {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            padding: "3px 8px",
            fontFamily: "var(--font-mono)",
            fontSize: "0.6rem",
            fontWeight: 600,
            letterSpacing: "0.1em",
            color: "hsl(var(--text-secondary))",
            backgroundColor: "transparent",
            border: "1px solid hsl(var(--border-base))",
            borderRadius: "2px",
            cursor: "pointer",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLButtonElement;
            el.style.color = "hsl(var(--col-cyan))";
            el.style.borderColor = "hsl(var(--col-cyan))";
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLButtonElement;
            el.style.color = "hsl(var(--text-secondary))";
            el.style.borderColor = "hsl(var(--border-base))";
          }}
        >
          NAVIGATE
          <ChevronDown size={10} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        style={{
          backgroundColor: "hsl(var(--bg-surface))",
          border: "1px solid hsl(var(--border-base))",
          borderRadius: "2px",
          padding: "4px",
          minWidth: "160px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        }}
      >
        <DropdownMenuLabel
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.55rem",
            letterSpacing: "0.14em",
            color: "hsl(var(--text-dim))",
            padding: "4px 8px 6px",
          }}
        >
          // PAGES
        </DropdownMenuLabel>
        <DropdownMenuSeparator style={{ backgroundColor: "hsl(var(--border-base))", margin: "0 0 4px" }} />
        {NAV_ITEMS.map(({ href, label, icon: Icon, accent }) => (
          <DropdownMenuItem
            key={href}
            onSelect={() => router.push(href)}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.6rem",
              letterSpacing: "0.08em",
              color: "hsl(var(--text-secondary))",
              padding: "5px 8px",
              borderRadius: "1px",
              cursor: "pointer",
              gap: "7px",
            }}
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
          className="header-subtitle"
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

      {/* ── Right: status + nav dropdown + domain + controls ── */}
      <div className="header-inner-right flex items-center gap-3">
        {/* Status indicators */}
        <div className="header-status-group flex items-center gap-3">
          {[
            { label: "VECTOR", cssVar: "--col-cyan" },
            { label: "SQL",    cssVar: "--col-green" },
            { label: "GRAPH",  cssVar: "--col-purple" },
          ].map(({ label, cssVar }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  backgroundColor: `hsl(var(${cssVar}))`,
                  boxShadow: `0 0 5px hsl(var(${cssVar}))`,
                  animation: "dot-pulse 2.4s ease-in-out infinite",
                }}
              />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: `hsl(var(${cssVar}))`, letterSpacing: "0.1em" }}>
                {label}
              </span>
            </div>
          ))}
        </div>

        <div style={{ width: 1, height: 14, backgroundColor: "hsl(var(--border-strong))" }} />

        {/* ── Compact nav dropdown ── */}
        <NavDropdown />

        <div style={{ width: 1, height: 14, backgroundColor: "hsl(var(--border-strong))" }} />

        <DomainSwitcher />

        <div style={{ width: 1, height: 14, backgroundColor: "hsl(var(--border-strong))" }} />

        <div className="header-font-control"><FontSizeControl /></div>
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
  extraClass = "",
}: {
  label: string;
  accentCssVar: string;
  children: React.ReactNode;
  gridArea: string;
  extraClass?: string;
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
  const { domain } = useDomain();
  const isMedical = domain === "medical";

  return (
    <div
      className="app-shell flex flex-col h-screen w-screen overflow-hidden grid-bg"
      style={{ backgroundColor: "hsl(var(--bg-void))" }}
    >
      <AppHeader />

      <main
        className="main-panel-grid"
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
        <IndustrialPanel label="COMMS // QUERY INTERFACE"   accentCssVar="--col-green"  gridArea="chat"     extraClass="panel-chat">
          <ChatPanel />
        </IndustrialPanel>

        <IndustrialPanel label="AGENT EXECUTION TRACE"      accentCssVar="--col-amber"  gridArea="timeline">
          <AgentTimeline />
        </IndustrialPanel>

        <IndustrialPanel
          label={isMedical ? "CLINICAL KNOWLEDGE GRAPH // REACTFLOW" : "KNOWLEDGE GRAPH // REACTFLOW"}
          accentCssVar="--col-cyan"
          gridArea="graph"
          extraClass="panel-graph"
        >
          <GraphViewer />
        </IndustrialPanel>
      </main>
    </div>
  );
}
