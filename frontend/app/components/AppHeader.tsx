"use client";

// ============================================================
// AppHeader.tsx — Shared site-wide header with nav dropdown,
// domain switcher, theme controls. Rendered in layout.tsx so
// every page gets the header automatically.
// ============================================================

import { useRouter } from "next/navigation";
import { LayoutDashboard, HelpCircle, Database, GraduationCap, FlaskConical, GitBranch, Stethoscope, ChevronDown, Bot, Home, Building2, LogOut, Network } from "lucide-react";
import { useDomain, DOMAIN_CONFIGS, type Domain } from "../lib/domain-context";
import { useAuth } from "../lib/auth-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ---------------------------------------------------------------------------
// Nav items
// ---------------------------------------------------------------------------

export const NAV_ITEMS = [
  { href: "/",                 label: "HOME",      icon: Home,           accent: "--col-green"  },
  { href: "/dashboard",        label: "DASHBOARD", icon: LayoutDashboard,accent: "--col-cyan"   },
  { href: "/data",             label: "DATA",      icon: Database,       accent: "--col-amber"  },
  { href: "/review",           label: "REVIEW",    icon: GraduationCap,  accent: "--col-purple" },
  { href: "/examples",              label: "EXAMPLES",   icon: FlaskConical, accent: "--col-green"  },
  { href: "/medical-examples",      label: "MED-EX",     icon: Stethoscope,  accent: "--col-cyan"   },
  { href: "/examples?tab=industries", label: "INDUSTRIES", icon: Building2,   accent: "--col-purple" },
  { href: "/agent",            label: "AGENT",     icon: Bot,            accent: "--col-pink"   },
  { href: "/diagram",          label: "DIAGRAM",   icon: GitBranch,      accent: "--col-cyan"   },
  { href: "/faq",              label: "FAQ",       icon: HelpCircle,     accent: "--col-cyan"   },
  { href: "/lightrag",         label: "LIGHTRAG",  icon: Network,        accent: "--col-cyan"   },
] as const;

// ---------------------------------------------------------------------------
// Domain switcher
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

// ---------------------------------------------------------------------------
// Nav dropdown
// ---------------------------------------------------------------------------

export function NavDropdown() {
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

// ---------------------------------------------------------------------------
// AppHeader — exported, used in layout.tsx
// ---------------------------------------------------------------------------

export default function AppHeader() {
  const { user, loading, signOut } = useAuth();
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
          <span style={{ color: "hsl(var(--col-green))" }}>AGENT</span>
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

      {/* ── Right: status dots + nav + domain + controls ── */}
      <div className="header-inner-right flex items-center gap-3">
        <div className="header-status-group flex items-center gap-3">
          {[
            { label: "VECTOR", cssVar: "--col-cyan"   },
            { label: "SQL",    cssVar: "--col-green"  },
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
        <NavDropdown />
        <div style={{ width: 1, height: 14, backgroundColor: "hsl(var(--border-strong))" }} />
        <DomainSwitcher />
        <div style={{ width: 1, height: 14, backgroundColor: "hsl(var(--border-strong))" }} />
        {!loading && user && (
          <>
            <span
              title={user.email ?? ""}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.6rem",
                color: "hsl(var(--text-dim))",
                maxWidth: "160px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {user.email}
            </span>
            <button
              onClick={signOut}
              aria-label="Sign out"
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
              <LogOut size={10} />
              SIGN OUT
            </button>
          </>
        )}
      </div>
    </header>
  );
}
