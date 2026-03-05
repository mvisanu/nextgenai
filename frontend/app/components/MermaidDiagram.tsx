"use client";

import { useEffect, useRef } from "react";

// Module-level flag so we only initialize Mermaid once per page load
let _initialized = false;

interface MermaidDiagramProps {
  /** Unique ID — must be different for each diagram on the page */
  id: string;
  chart: string;
}

export default function MermaidDiagram({ id, chart }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      const mermaid = (await import("mermaid")).default;

      if (!_initialized) {
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          fontFamily: "JetBrains Mono, monospace",
          flowchart: { htmlLabels: true, curve: "basis" },
          themeVariables: {
            background:            "#060d14",
            mainBkg:               "#0d1b2e",
            primaryColor:          "#0d1b2e",
            primaryTextColor:      "#c8dff4",
            primaryBorderColor:    "#1e4a6e",
            lineColor:             "#2a5a8e",
            secondaryColor:        "#0a1520",
            tertiaryColor:         "#060d14",
            nodeBorder:            "#1e4a6e",
            clusterBkg:            "#060f18",
            clusterBorder:         "#1a3a5a",
            titleColor:            "#c8dff4",
            edgeLabelBackground:   "#0a1520",
          },
        });
        _initialized = true;
      }

      if (!active || !containerRef.current) return;
      containerRef.current.innerHTML = "";

      try {
        const { svg } = await mermaid.render(id, chart);
        if (!active || !containerRef.current) return;
        containerRef.current.innerHTML = svg;

        // Make the SVG fill its container responsively
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
            `<p style="color:#f87171;font-family:monospace;padding:1.5rem;border:1px solid #f87171;border-radius:4px;">` +
            `Diagram render error — check console for details.</p>`;
        }
      }
    })();

    return () => { active = false; };
  }, [id, chart]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", overflowX: "auto", minHeight: "120px" }}
    />
  );
}
