"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export type Domain = "aircraft" | "medical";

export interface DomainConfig {
  id: Domain;
  label: string;
  shortLabel: string;
  icon: string;           // emoji
  accentVar: string;      // CSS var e.g. "--col-cyan"
  narrativeLabel: string; // "Incident" | "Clinical Case"
  categoryLabel: string;  // "Defect Type" | "Disease"
  systemLabel: string;    // "Aircraft System" | "Body System"
  queryPlaceholder: string;
  disclaimer: string | null;
}

export const DOMAIN_CONFIGS: Record<Domain, DomainConfig> = {
  aircraft: {
    id: "aircraft",
    label: "Aircraft Maintenance",
    shortLabel: "AIRCRAFT",
    icon: "✈",
    accentVar: "--col-green",
    narrativeLabel: "Incident",
    categoryLabel: "Defect Type",
    systemLabel: "Aircraft System",
    queryPlaceholder:
      "Describe the maintenance issue, defect pattern, or ask about incident trends…",
    disclaimer: null,
  },
  medical: {
    id: "medical",
    label: "Clinical Cases",
    shortLabel: "MEDICAL",
    icon: "⚕",
    accentVar: "--col-cyan",
    narrativeLabel: "Clinical Case",
    categoryLabel: "Disease",
    systemLabel: "Body System",
    queryPlaceholder:
      "Describe the clinical presentation or ask about disease patterns and case trends…",
    disclaimer:
      "AI-generated analysis for research purposes only. Requires review by a qualified medical professional. Not clinical advice.",
  },
};

interface DomainContextValue {
  domain: Domain;
  config: DomainConfig;
  setDomain: (d: Domain) => void;
}

const DomainContext = createContext<DomainContextValue>({
  domain: "aircraft",
  config: DOMAIN_CONFIGS.aircraft,
  setDomain: () => {},
});

export function DomainProvider({ children }: { children: ReactNode }) {
  const [domain, setDomainState] = useState<Domain>("aircraft");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("nextai_domain") as Domain | null;
      if (saved === "aircraft" || saved === "medical") setDomainState(saved);
    } catch {
      // localStorage may be unavailable in SSR/sandboxed context
    }
  }, []);

  function setDomain(d: Domain) {
    setDomainState(d);
    try {
      localStorage.setItem("nextai_domain", d);
    } catch {
      // ignore
    }
  }

  return (
    <DomainContext.Provider value={{ domain, config: DOMAIN_CONFIGS[domain], setDomain }}>
      {children}
    </DomainContext.Provider>
  );
}

export function useDomain() {
  return useContext(DomainContext);
}
