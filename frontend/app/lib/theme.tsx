"use client";

// ============================================================
// theme.tsx — Light/dark mode + font size context
// Both preferences persist to localStorage and update <html>
// immediately — no flash on reload.
// Font sizes: small=16px(12pt) | medium=18px(14pt) | large=20px(16pt)
// ============================================================

import React, { createContext, useContext, useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

// ── Theme ──────────────────────────────────────────────────────────────────

export type Theme = "dark" | "light";

interface ThemeCtx {
  theme: Theme;
  toggle: () => void;
}

const ThemeCtxObj = createContext<ThemeCtx>({ theme: "dark", toggle: () => {} });

// ── Font size ──────────────────────────────────────────────────────────────

export type FontSize = "small" | "medium" | "large";

const FONT_SIZE_LABELS: Record<FontSize, { label: string; px: string; pt: string }> = {
  small:  { label: "A",  px: "16px", pt: "12pt — Compact"  },
  medium: { label: "A",  px: "18px", pt: "14pt — Default"  },
  large:  { label: "A",  px: "20px", pt: "16pt — Large"    },
};

const FONT_SIZES: FontSize[] = ["small", "medium", "large"];

interface FontSizeCtx {
  fontSize: FontSize;
  setFontSize: (s: FontSize) => void;
}

const FontSizeCtxObj = createContext<FontSizeCtx>({ fontSize: "medium", setFontSize: () => {} });

// ── Combined Provider ──────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [fontSize, setFontSizeState] = useState<FontSize>("medium");

  useEffect(() => {
    const savedTheme    = (localStorage.getItem("theme")    as Theme    | null) ?? "dark";
    const savedFontSize = (localStorage.getItem("fontSize") as FontSize | null) ?? "medium";
    setTheme(savedTheme);
    setFontSizeState(savedFontSize);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    const html = document.documentElement;
    html.classList.remove("dark", "light");
    html.classList.add(next);
  }

  function setFontSize(size: FontSize) {
    setFontSizeState(size);
    localStorage.setItem("fontSize", size);
    const html = document.documentElement;
    html.classList.remove("text-small", "text-medium", "text-large");
    html.classList.add(`text-${size}`);
  }

  return (
    <ThemeCtxObj.Provider value={{ theme, toggle }}>
      <FontSizeCtxObj.Provider value={{ fontSize, setFontSize }}>
        {children}
      </FontSizeCtxObj.Provider>
    </ThemeCtxObj.Provider>
  );
}

export function useTheme(): ThemeCtx {
  return useContext(ThemeCtxObj);
}

export function useFontSize(): FontSizeCtx {
  return useContext(FontSizeCtxObj);
}

// ── ThemeToggle — dark/light button ───────────────────────────────────────

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      onClick={toggle}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "4px 10px",
        border: `1px solid ${isDark ? "hsl(38 90% 52% / 0.45)" : "hsl(25 15% 12% / 0.3)"}`,
        borderRadius: "2px",
        backgroundColor: isDark ? "hsl(38 90% 52% / 0.08)" : "hsl(25 15% 12% / 0.06)",
        color: isDark ? "hsl(38 90% 52%)" : "hsl(25 15% 18%)",
        cursor: "pointer",
        fontFamily: "var(--font-display)",
        fontSize: "0.62rem",
        fontWeight: 700,
        letterSpacing: "0.14em",
        transition: "all 0.2s ease",
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        const b = e.currentTarget as HTMLButtonElement;
        b.style.boxShadow = isDark
          ? "0 0 10px hsl(38 90% 52% / 0.3)"
          : "0 0 10px hsl(25 15% 12% / 0.15)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
      }}
    >
      {isDark ? <Sun size={12} strokeWidth={2} /> : <Moon size={12} strokeWidth={2} />}
      {isDark ? "LIGHT" : "DARK"}
    </button>
  );
}

// ── FontSizeControl — A- / A / A+ segmented control ───────────────────────

export function FontSizeControl() {
  const { fontSize, setFontSize } = useFontSize();

  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        border: "1px solid hsl(var(--border-strong))",
        borderRadius: "2px",
        overflow: "hidden",
        flexShrink: 0,
      }}
      title="Adjust text size"
    >
      {FONT_SIZES.map((size, idx) => {
        const isActive = fontSize === size;
        const info = FONT_SIZE_LABELS[size];
        const scalePx = idx === 0 ? "0.68rem" : idx === 1 ? "0.78rem" : "0.9rem";
        return (
          <button
            key={size}
            onClick={() => setFontSize(size)}
            title={`${info.pt} (${info.px})`}
            style={{
              padding: "3px 9px",
              border: "none",
              borderRight: idx < 2 ? "1px solid hsl(var(--border-base))" : "none",
              backgroundColor: isActive
                ? "hsl(var(--col-cyan) / 0.14)"
                : "hsl(var(--bg-elevated))",
              color: isActive
                ? "hsl(var(--col-cyan))"
                : "hsl(var(--text-secondary))",
              cursor: "pointer",
              fontFamily: "var(--font-display)",
              fontSize: scalePx,
              fontWeight: 700,
              letterSpacing: "0.04em",
              transition: "all 0.15s",
              lineHeight: 1,
              boxShadow: isActive ? `inset 0 -2px 0 hsl(var(--col-cyan))` : "none",
            }}
            onMouseEnter={(e) => {
              if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = "hsl(var(--text-primary))";
            }}
            onMouseLeave={(e) => {
              if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = "hsl(var(--text-secondary))";
            }}
          >
            {info.label}
          </button>
        );
      })}
    </div>
  );
}
