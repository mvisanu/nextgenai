"use client";

import { useEffect, useRef, useState } from "react";

// ── Theme variable sets ────────────────────────────────────────────────────

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

function getAppTheme(): "dark" | "light" {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("light") ? "light" : "dark";
}

// ── Component ──────────────────────────────────────────────────────────────

interface MermaidDiagramProps {
  id: string;
  chart: string;
}

export default function MermaidDiagram({ id, chart }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [appTheme, setAppTheme] = useState<"dark" | "light">("dark");

  // Watch <html> class for theme changes
  useEffect(() => {
    setAppTheme(getAppTheme());

    const observer = new MutationObserver(() => setAppTheme(getAppTheme()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  // Re-render diagram whenever id, chart, or theme changes
  useEffect(() => {
    let active = true;

    (async () => {
      const mermaid = (await import("mermaid")).default;

      // Re-initialize with correct theme each time
      mermaid.initialize({
        startOnLoad: false,
        theme: appTheme === "light" ? "default" : "dark",
        fontFamily: "JetBrains Mono, monospace",
        flowchart: { htmlLabels: true, curve: "basis" },
        themeVariables: appTheme === "light" ? LIGHT_VARS : DARK_VARS,
      });

      if (!active || !containerRef.current) return;
      containerRef.current.innerHTML = "";

      try {
        const { svg } = await mermaid.render(id, chart);
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
        console.error("[MermaidDiagram] render error for id=" + id, err);
        if (active && containerRef.current) {
          containerRef.current.innerHTML =
            `<p style="color:#f87171;font-family:monospace;padding:1.5rem;border:1px solid #f87171;">` +
            `Diagram render error — check console.</p>`;
        }
      }
    })();

    return () => { active = false; };
  }, [id, chart, appTheme]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", overflowX: "auto", minHeight: "120px" }}
    />
  );
}
