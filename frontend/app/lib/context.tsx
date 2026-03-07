"use client";

// ============================================================
// RunContext — shared agent run state across all four panels
// ============================================================

import React, { createContext, useContext, useState } from "react";
import type { QueryResponse } from "./api";

interface RunContextValue {
  /** Full response from the most recent POST /query call. Null before first query. */
  runData: QueryResponse | null;
  /** Replaces runData with the latest agent response. Pass null to clear. */
  setRunData: (data: QueryResponse | null) => void;
}

const RunContext = createContext<RunContextValue | null>(null);

export function RunProvider({ children }: { children: React.ReactNode }) {
  const [runData, setRunData] = useState<QueryResponse | null>(null);

  return (
    <RunContext.Provider value={{ runData, setRunData }}>
      {children}
    </RunContext.Provider>
  );
}

/**
 * useRunContext — consume the shared run state.
 * Must be called inside a component wrapped by RunProvider.
 */
export function useRunContext(): RunContextValue {
  const ctx = useContext(RunContext);
  if (ctx === null) {
    throw new Error("useRunContext must be used within a RunProvider");
  }
  return ctx;
}
