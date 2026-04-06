"use client";

import dynamic from "next/dynamic";
import React, { Suspense } from "react";

// MUST be dynamic ssr:false — D3 requires browser APIs (window, document)
const ObsidianGraph = dynamic(
  () => import("./ObsidianGraph"),
  { ssr: false }
);

function GraphLoadingScreen() {
  return (
    <div
      style={{
        height: "calc(100vh - 46px)",
        width: "100%",
        background: "#0a0a0f",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "16px",
      }}
    >
      <div style={{ position: "relative", width: 80, height: 80 }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              inset: i * 10,
              borderRadius: "50%",
              border: "1px solid #00d4ff",
              opacity: 0.6 - i * 0.15,
              animation: `pulse ${1.2 + i * 0.4}s ease-in-out infinite`,
              animationDelay: `${i * 0.2}s`,
            }}
          />
        ))}
      </div>
      <p
        style={{
          fontFamily: "Orbitron, monospace",
          color: "#00d4ff",
          fontSize: "11px",
          letterSpacing: "0.2em",
          textTransform: "uppercase",
        }}
      >
        INITIALISING KNOWLEDGE GRAPH...
      </p>
    </div>
  );
}

function ObsidianGraphInner() {
  return (
    <div
      style={{ height: "calc(100vh - 46px)", width: "100%", background: "#0a0a0f" }}
    >
      <Suspense fallback={<GraphLoadingScreen />}>
        <ObsidianGraph />
      </Suspense>
    </div>
  );
}

export default function ObsidianGraphPage() {
  return (
    <Suspense fallback={<GraphLoadingScreen />}>
      <ObsidianGraphInner />
    </Suspense>
  );
}
