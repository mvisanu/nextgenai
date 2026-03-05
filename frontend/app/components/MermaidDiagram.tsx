"use client";

import { useEffect, useRef, useState } from "react";

// ── Per-theme variable sets ────────────────────────────────────────────────

const DARK_VARS = {
  background:          "#060d14",
  mainBkg:             "#0d1b2e",
  primaryColor:        "#0d1b2e",
  primaryTextColor:    "#c8dff4",
  primaryBorderColor:  "#1e4a6e",
  lineColor:           "#2a5a8e",
  secondaryColor:      "#0a1520",
  tertiaryColor:       "#060d14",
  nodeBorder:          "#1e4a6e",
  clusterBkg:          "#060f18",
  clusterBorder:       "#1a3a5a",
  titleColor:          "#c8dff4",
  edgeLabelBackground: "#0a1520",
};

const LIGHT_VARS = {
  background:          "#f3ede0",
  mainBkg:             "#faf6ef",
  primaryColor:        "#faf6ef",
  primaryTextColor:    "#1a1208",
  primaryBorderColor:  "#b8a88a",
  lineColor:           "#7a6a50",
  secondaryColor:      "#ede5d8",
  tertiaryColor:       "#f3ede0",
  nodeBorder:          "#b8a88a",
  clusterBkg:          "#ede5d8",
  clusterBorder:       "#c0a87a",
  titleColor:          "#1a1208",
  edgeLabelBackground: "#faf6ef",
};

// Prepend Mermaid's %%{init}%% directive so each diagram carries its own
// theme config — avoids calling mermaid.initialize() multiple times which
// corrupts Mermaid's internal parser state and causes "payload" TypeError.
function withTheme(chart: string, theme: "dark" | "light"): string {
  const vars = theme === "light" ? LIGHT_VARS : DARK_VARS;
  const mermaidTheme = theme === "light" ? "default" : "dark";
  const init = `%%{init: {'theme': '${mermaidTheme}', 'themeVariables': ${JSON.stringify(vars)}, 'flowchart': {'htmlLabels': true, 'curve': 'basis'}}}%%\n`;
  return init + chart;
}

function getAppTheme(): "dark" | "light" {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("light") ? "light" : "dark";
}

let _mermaidReady = false;

// Module-level render queue — mermaid.render() is NOT concurrent-safe.
// Multiple simultaneous calls corrupt its shared parser state and cause
// "Cannot read properties of undefined (reading 'payload')" errors.
// All component instances share this queue so renders are strictly serialised.
let _renderQueue: Promise<void> = Promise.resolve();

// ── Component ──────────────────────────────────────────────────────────────

export default function MermaidDiagram({ id, chart }: { id: string; chart: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [appTheme, setAppTheme] = useState<"dark" | "light">(getAppTheme);

  // Watch <html> class for light/dark switches
  useEffect(() => {
    const observer = new MutationObserver(() => setAppTheme(getAppTheme()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  // Re-render when id, chart, or theme changes — serialised through global queue
  useEffect(() => {
    let active = true;

    const renderTask = async () => {
      const mermaid = (await import("mermaid")).default;

      // Initialize exactly once — theme is injected per-diagram via %%{init}%%
      if (!_mermaidReady) {
        mermaid.initialize({ startOnLoad: false });
        _mermaidReady = true;
      }

      if (!active || !containerRef.current) return;
      containerRef.current.innerHTML = "";

      // Timestamp suffix ensures no DOM id is ever reused across renders
      const renderId = `${id}-${appTheme}-${Date.now()}`;

      try {
        const { svg } = await mermaid.render(renderId, withTheme(chart, appTheme));
        if (!active || !containerRef.current) return;
        containerRef.current.innerHTML = svg;

        const svgEl = containerRef.current.querySelector("svg");
        if (svgEl) {
          svgEl.removeAttribute("width");
          svgEl.removeAttribute("height");
          svgEl.style.width = "100%";
          svgEl.style.height = "auto";
          svgEl.style.maxWidth = "100%";
        }
      } catch (err) {
        console.error("[MermaidDiagram] render error:", err);
        if (active && containerRef.current) {
          containerRef.current.innerHTML =
            `<p style="color:#f87171;font-family:monospace;padding:1.5rem;border:1px solid #f87171;">` +
            `Diagram render error — check console.</p>`;
        }
      }
    };

    // Chain onto the global queue; swallow previous errors so the queue never stalls
    _renderQueue = _renderQueue.catch(() => {}).then(renderTask);

    return () => { active = false; };
  }, [id, chart, appTheme]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", overflowX: "auto", minHeight: "120px" }}
    />
  );
}
