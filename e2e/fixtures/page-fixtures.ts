// ============================================================
// page-fixtures.ts
// Reusable test data constants and sample query strings for
// the secondary-page test files (navigation, dashboard, examples,
// faq, data). Not to be confused with api-mock.ts which handles
// backend mocking.
// ============================================================

// ---------------------------------------------------------------------------
// Domain constants — must match DOMAIN_CONFIGS in domain-context.tsx
// ---------------------------------------------------------------------------

export const AIRCRAFT_PLACEHOLDER =
  "Describe the maintenance issue, defect pattern, or ask about incident trends\u2026";

export const MEDICAL_PLACEHOLDER =
  "Describe the clinical presentation or ask about disease patterns and case trends\u2026";

export const MEDICAL_DISCLAIMER =
  "AI-generated analysis for research purposes only. Requires review by a qualified medical professional. Not clinical advice.";

// ---------------------------------------------------------------------------
// Navigation item definitions — must match NAV_ITEMS in page.tsx
// ---------------------------------------------------------------------------

export const MAIN_NAV_ITEMS = [
  { label: "DASHBOARD",  href: "/dashboard"        },
  { label: "DATA",       href: "/data"             },
  { label: "REVIEW",     href: "/review"           },
  { label: "EXAMPLES",   href: "/examples"         },
  { label: "MED-EX",     href: "/medical-examples" },
  { label: "DIAGRAM",    href: "/diagram"          },
  { label: "FAQ",        href: "/faq"              },
] as const;

// ---------------------------------------------------------------------------
// Dashboard tab definitions — must match useTabs() in dashboard/page.tsx
// ---------------------------------------------------------------------------

export const AIRCRAFT_TABS = [
  { shortLabel: "AGENT",     fullLabel: "ASK THE AGENT",       id: "agent"       },
  { shortLabel: "INCIDENTS", fullLabel: "INCIDENT EXPLORER",   id: "explorer"    },
  { shortLabel: "DEFECTS",   fullLabel: "DEFECT ANALYTICS",    id: "defects"     },
  { shortLabel: "MAINT.",    fullLabel: "MAINTENANCE TRENDS",  id: "maintenance" },
  { shortLabel: "EVAL",      fullLabel: "DATA & EVALUATION",   id: "eval"        },
] as const;

export const MEDICAL_TABS = [
  { shortLabel: "AGENT",   fullLabel: "CLINICAL QUERY",     id: "agent"       },
  { shortLabel: "CASES",   fullLabel: "CASE EXPLORER",      id: "explorer"    },
  { shortLabel: "DISEASE", fullLabel: "DISEASE ANALYTICS",  id: "defects"     },
  { shortLabel: "COHORT",  fullLabel: "COHORT TRENDS",      id: "maintenance" },
  { shortLabel: "EVAL",    fullLabel: "CLINICAL EVALUATION",id: "eval"        },
] as const;

// ---------------------------------------------------------------------------
// Sample queries for each domain
// ---------------------------------------------------------------------------

export const SAMPLE_QUERIES = {
  aircraft: [
    "Find similar incidents to: hydraulic actuator crack observed during routine inspection",
    "Show defect counts by product for the last 90 days",
    "Given this incident: corrosion on engine mounting bracket — classify defect and recommend action",
  ],
  medical: [
    "Find clinical cases similar to: 58-year-old male, acute chest pain, ST-elevation, positive troponin",
    "Show disease prevalence trends for the last 90 days",
    "Given this case: respiratory distress, fever, bilateral infiltrates — classify and suggest workup",
  ],
} as const;

// ---------------------------------------------------------------------------
// Expected dataset cards on /data
// ---------------------------------------------------------------------------

export const DATASET_CARDS = [
  { index: "DS-01", title: "Manufacturing Defects",    domain: "aircraft" },
  { index: "DS-02", title: "Aircraft Incident",        domain: "aircraft" },
  { index: "DS-03", title: "Maintenance Logs",         domain: "aircraft" },
  { index: "DS-04", title: "Disease Records",          domain: "medical"  },
  { index: "DS-05", title: "Clinical Case Reports",    domain: "medical"  },
] as const;

// ---------------------------------------------------------------------------
// Expected FAQ sections
// ---------------------------------------------------------------------------

export const FAQ_SECTIONS = [
  { tabNum: "00", label: "MAIN APP",       domain: "aircraft" },
  { tabNum: "01", label: "ASK THE AGENT",  domain: "aircraft" },
  { tabNum: "02", label: "INCIDENT",       domain: "aircraft" },
  { tabNum: "03", label: "DEFECT",         domain: "aircraft" },
  { tabNum: "04", label: "MAINTENANCE",    domain: "aircraft" },
  { tabNum: "05", label: "DATA",           domain: "aircraft" },
  { tabNum: "M0", label: "MEDICAL",        domain: "medical"  },
  { tabNum: "M1", label: "CLINICAL",       domain: "medical"  },
  { tabNum: "M2", label: "DISEASE",        domain: "medical"  },
  { tabNum: "M3", label: "COHORT",         domain: "medical"  },
  { tabNum: "M4", label: "EVALUATION",     domain: "medical"  },
  { tabNum: "M5", label: "RESEARCH",       domain: "medical"  },
] as const;

// ---------------------------------------------------------------------------
// Expected example counts
// ---------------------------------------------------------------------------

export const AIRCRAFT_EXAMPLE_COUNT = 14;
export const MEDICAL_EXAMPLE_COUNT = 14;
