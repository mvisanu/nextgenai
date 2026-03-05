// ============================================================
// mock-data.ts — Synthetic manufacturing data for the dashboard
// Realistic aerospace / industrial manufacturing scenario
// ============================================================

export type Severity = "Critical" | "High" | "Medium" | "Low";
export type System = "Hydraulic" | "Avionics" | "Structural" | "Propulsion" | "Electronics";

// ── Incidents ──────────────────────────────────────────────

export interface Incident {
  id: string;
  system: System;
  severity: Severity;
  date: string;
  assetId: string;
  narrativeText: string;
  correctiveAction: string;
  relatedDefects: string[];
  relatedMaintenance: string[];
}

export const INCIDENTS: Incident[] = [
  {
    id: "INC-2024-0041",
    system: "Hydraulic",
    severity: "Critical",
    date: "2024-03-12",
    assetId: "ASSET-002",
    narrativeText:
      "Hydraulic leak detected at actuator junction P7-B. Seal appeared worn beyond tolerance. Fluid loss rate ~0.3 L/hr. System pressure dropped to 1,840 PSI before isolation. Root cause suspected as thermal cycling fatigue on O-ring compound. Reworked seal stack; performed 2-hour pressure soak test.",
    correctiveAction:
      "Replaced O-ring stack (P/N HYD-4432) and actuator end-seal. Pressure tested to 3,000 PSI. Returned to service after 48-hour observation.",
    relatedDefects: ["DEF-2024-0089", "DEF-2024-0091"],
    relatedMaintenance: ["MLOG-2024-0033"],
  },
  {
    id: "INC-2024-0039",
    system: "Avionics",
    severity: "High",
    date: "2024-03-08",
    assetId: "ASSET-001",
    narrativeText:
      "Intermittent short circuit in avionics harness bundle AV-12. Chafing observed at bulkhead grommet where insulation had worn through. Circuit breaker tripped 3 times during preflight. Suspect vibration-induced wear over extended operational period.",
    correctiveAction:
      "Replaced harness segment AV-12-03 to AV-12-07. Added chafe protection sleeve at all grommet contact points. Performed continuity and insulation resistance checks.",
    relatedDefects: ["DEF-2024-0082"],
    relatedMaintenance: ["MLOG-2024-0031", "MLOG-2024-0028"],
  },
  {
    id: "INC-2024-0037",
    system: "Structural",
    severity: "High",
    date: "2024-03-05",
    assetId: "ASSET-003",
    narrativeText:
      "Corrosion found on fastener cluster at fuselage skin panel SP-22. Approximately 12 fasteners showed pitting corrosion exceeding allowable limits per SRM 51-20. Adjacent panel showed minor blistering of sealant. Lot traceability review initiated.",
    correctiveAction:
      "Replaced affected fasteners with corrosion-resistant alloy (CRES) per EO-2024-0047. Applied corrosion inhibiting compound. Panel sealant reapplied. Lot quarantined pending supplier quality investigation.",
    relatedDefects: ["DEF-2024-0078", "DEF-2024-0079"],
    relatedMaintenance: [],
  },
  {
    id: "INC-2024-0035",
    system: "Propulsion",
    severity: "Critical",
    date: "2024-02-28",
    assetId: "ASSET-004",
    narrativeText:
      "Fuel line fitting at engine P-3 junction exhibited seepage. Torque verification showed fitting 12% below minimum. Adjacent fittings inspected; 2 additional fittings found sub-spec. Source traced to incorrect torque wrench calibration during last maintenance cycle.",
    correctiveAction:
      "Re-torqued all fuel system fittings to spec (250 in-lbs). Torque wrench TW-4412 removed from service for recalibration. All affected fittings leak-checked per MOPM 28-10.",
    relatedDefects: ["DEF-2024-0074"],
    relatedMaintenance: ["MLOG-2024-0025"],
  },
  {
    id: "INC-2024-0033",
    system: "Electronics",
    severity: "Medium",
    date: "2024-02-22",
    assetId: "ASSET-005",
    narrativeText:
      "Intermittent power fluctuation in FADEC unit during ground run. Voltage readings showed ±0.4V variation beyond acceptable ±0.1V limit. Connector C-449 showed evidence of fretting corrosion at pin contacts 12, 14, and 16.",
    correctiveAction:
      "Cleaned and treated connector pins with electrical contact cleaner. Applied dielectric grease. Performed 3-cycle ground run to verify stable operation.",
    relatedDefects: ["DEF-2024-0071"],
    relatedMaintenance: ["MLOG-2024-0022"],
  },
  {
    id: "INC-2024-0031",
    system: "Hydraulic",
    severity: "High",
    date: "2024-02-18",
    assetId: "ASSET-002",
    narrativeText:
      "Hydraulic pump output fluctuating between 2,800 and 3,200 PSI nominal range. Pressure relief valve PRV-7 showed evidence of internal contamination. Blue hydraulic fluid discolouration noted, indicating possible seal material degradation.",
    correctiveAction:
      "Replaced PRV-7 with serviceable unit. Flushed hydraulic system and replaced filter element. Fluid sample sent for spectroscopic analysis.",
    relatedDefects: ["DEF-2024-0067"],
    relatedMaintenance: ["MLOG-2024-0019"],
  },
  {
    id: "INC-2024-0029",
    system: "Structural",
    severity: "Low",
    date: "2024-02-14",
    assetId: "ASSET-001",
    narrativeText:
      "Hairline crack detected in non-structural fairing bracket FB-114 during scheduled visual inspection. Crack length 14mm, confirmed by dye penetrant inspection. No structural load path involvement confirmed per stress analysis.",
    correctiveAction:
      "Bracket replaced with new-manufacture unit. Engineering disposition issued. Crack monitoring record closed.",
    relatedDefects: [],
    relatedMaintenance: [],
  },
  {
    id: "INC-2024-0027",
    system: "Avionics",
    severity: "Medium",
    date: "2024-02-09",
    assetId: "ASSET-003",
    narrativeText:
      "TCAS display intermittently blanking for 2–3 seconds during flight. Fault code 0x4A22 logged. Suspected software fault in display processor DP-2 linked to a known issue in firmware version 3.1.4.",
    correctiveAction:
      "Firmware upgraded to version 3.2.1 per SB-AV-2024-004. Unit ground tested 4 hours with no recurrence.",
    relatedDefects: ["DEF-2024-0063"],
    relatedMaintenance: ["MLOG-2024-0017"],
  },
  {
    id: "INC-2024-0025",
    system: "Propulsion",
    severity: "High",
    date: "2024-02-04",
    assetId: "ASSET-004",
    narrativeText:
      "Engine vibration level exceeded 3.5 IPS threshold on N1 rotor during climb. Fan blade FRB-22 showed leading edge nick approximately 8mm deep. Damage classified as within repairable limits per Engine Overhaul Manual.",
    correctiveAction:
      "Fan blade blend-repaired per EOM Chapter 72-21. Post-repair trim balance performed. Engine run to verify vibration within limits.",
    relatedDefects: ["DEF-2024-0059"],
    relatedMaintenance: ["MLOG-2024-0015"],
  },
  {
    id: "INC-2024-0023",
    system: "Electronics",
    severity: "Critical",
    date: "2024-01-30",
    assetId: "ASSET-005",
    narrativeText:
      "Complete loss of Bus 2 power during taxi operations. Investigation revealed failed diode in power distribution unit PDU-3. Diode showed thermal overstress failure mode consistent with recent high-ambient temperature operations.",
    correctiveAction:
      "PDU-3 replaced with overhauled unit. Root cause attributed to inadequate thermal margin in original design. Engineering review initiated for design improvement.",
    relatedDefects: ["DEF-2024-0055", "DEF-2024-0056"],
    relatedMaintenance: ["MLOG-2024-0013"],
  },
  {
    id: "INC-2024-0021",
    system: "Hydraulic",
    severity: "Medium",
    date: "2024-01-25",
    assetId: "ASSET-001",
    narrativeText:
      "Slow hydraulic leak from line coupling LC-229 on landing gear actuator circuit. Leak rate within self-sealing limits but approaching threshold. Coupling threads showed minor damage from over-torque during previous installation.",
    correctiveAction:
      "Coupling LC-229 replaced. Torque specification verified and technician re-briefed on correct procedure.",
    relatedDefects: ["DEF-2024-0051"],
    relatedMaintenance: [],
  },
  {
    id: "INC-2024-0019",
    system: "Structural",
    severity: "High",
    date: "2024-01-20",
    assetId: "ASSET-002",
    narrativeText:
      "Delamination detected in composite floor panel FP-08 near galley attachment point. Area approximately 200cm². Ply separation visible on edge inspection. Suspected impact damage from cargo loading event.",
    correctiveAction:
      "Panel removed and sent for composite repair. Replacement panel installed. Loading procedure reviewed with ground crew.",
    relatedDefects: ["DEF-2024-0047"],
    relatedMaintenance: [],
  },
  {
    id: "INC-2024-0017",
    system: "Avionics",
    severity: "Low",
    date: "2024-01-15",
    assetId: "ASSET-003",
    narrativeText:
      "Minor calibration drift on altimeter ALT-3 detected during daily functional check. Reading 80ft high at 10,000ft reference. Within allowable for continued operation but flagged for next scheduled calibration.",
    correctiveAction:
      "Altimeter calibrated and re-sealed. Calibration record updated.",
    relatedDefects: [],
    relatedMaintenance: ["MLOG-2024-0010"],
  },
  {
    id: "INC-2024-0015",
    system: "Propulsion",
    severity: "Medium",
    date: "2024-01-11",
    assetId: "ASSET-004",
    narrativeText:
      "Oil consumption elevated to 0.8qt/hr against baseline 0.3qt/hr. Borescope inspection of HPT stage 1 seal revealed wear exceeding serviceable limits. No performance degradation observed.",
    correctiveAction:
      "Engine removed for shop maintenance. HPT seal replaced during shop visit.",
    relatedDefects: ["DEF-2024-0043"],
    relatedMaintenance: ["MLOG-2024-0008"],
  },
  {
    id: "INC-2024-0013",
    system: "Electronics",
    severity: "Low",
    date: "2024-01-07",
    assetId: "ASSET-005",
    narrativeText:
      "Ground proximity warning system (GPWS) self-test flag intermittently set on power-up. BITE data showed clock synchronisation issue between GPWS and IRS. Resolved after IRS realignment.",
    correctiveAction:
      "IRS realigned. GPWS software timing parameter adjusted per SB-GPWS-0019.",
    relatedDefects: [],
    relatedMaintenance: [],
  },
];

// ── Defect Analytics Data ──────────────────────────────────

export const DEFECT_BY_TYPE = [
  { type: "Seal Failure",    count: 34 },
  { type: "Wiring Fault",    count: 28 },
  { type: "Corrosion",       count: 22 },
  { type: "Fastener",        count: 19 },
  { type: "Contamination",   count: 17 },
  { type: "Crack / Fracture",count: 14 },
  { type: "Misalignment",    count: 11 },
  { type: "Calibration",     count:  9 },
  { type: "Software Fault",  count:  8 },
  { type: "Overheat",        count:  6 },
];

export const SEVERITY_BY_SYSTEM = [
  { system: "Hydraulic",   Critical: 4, High: 9,  Medium: 12, Low: 5 },
  { system: "Avionics",    Critical: 2, High: 7,  Medium: 15, Low: 9 },
  { system: "Structural",  Critical: 1, High: 8,  Medium:  9, Low: 7 },
  { system: "Propulsion",  Critical: 5, High: 11, Medium:  8, Low: 3 },
  { system: "Electronics", Critical: 3, High: 6,  Medium: 13, Low: 8 },
];

export const DEFECT_TREND = [
  { week: "W01", count: 18 },
  { week: "W02", count: 21 },
  { week: "W03", count: 15 },
  { week: "W04", count: 24 },
  { week: "W05", count: 19 },
  { week: "W06", count: 28 },
  { week: "W07", count: 22 },
  { week: "W08", count: 31 },
  { week: "W09", count: 17 },
  { week: "W10", count: 14 },
  { week: "W11", count: 20 },
  { week: "W12", count: 16 },
];

export const INCIDENT_THEMES = [
  { keyword: "seal",         count: 28 },
  { keyword: "leak",         count: 24 },
  { keyword: "corrosion",    count: 19 },
  { keyword: "chafing",      count: 16 },
  { keyword: "torque",       count: 14 },
  { keyword: "vibration",    count: 13 },
  { keyword: "contamination",count: 11 },
  { keyword: "connector",    count: 10 },
];

// ── Maintenance / Asset Data ───────────────────────────────

export const ASSETS = [
  { id: "ASSET-001", name: "ASSET-001 // Airframe Alpha" },
  { id: "ASSET-002", name: "ASSET-002 // Hydraulic Cell B" },
  { id: "ASSET-003", name: "ASSET-003 // Avionics Bay 3" },
  { id: "ASSET-004", name: "ASSET-004 // Engine #4 Stand" },
  { id: "ASSET-005", name: "ASSET-005 // Electronics Rack E5" },
];

export interface MaintenancePoint {
  ts: string;
  value: number;
  event?: string;
}

export const ASSET_METRICS: Record<string, MaintenancePoint[]> = {
  "ASSET-001": [
    { ts: "W01", value: 2.1 }, { ts: "W02", value: 2.3 }, { ts: "W03", value: 2.5 },
    { ts: "W04", value: 2.8 }, { ts: "W05", value: 3.1 }, { ts: "W06", value: 3.4 },
    { ts: "W07", value: 3.6 }, { ts: "W08", value: 3.9, event: "Corrective Action" },
    { ts: "W09", value: 2.2 }, { ts: "W10", value: 2.1 }, { ts: "W11", value: 2.0 },
    { ts: "W12", value: 1.9 },
  ],
  "ASSET-002": [
    { ts: "W01", value: 1840 }, { ts: "W02", value: 1920 }, { ts: "W03", value: 2050 },
    { ts: "W04", value: 2100 }, { ts: "W05", value: 2200 }, { ts: "W06", value: 2150 },
    { ts: "W07", value: 2350, event: "Corrective Action" }, { ts: "W08", value: 3000 },
    { ts: "W09", value: 2980 }, { ts: "W10", value: 2990 }, { ts: "W11", value: 3010 },
    { ts: "W12", value: 3000 },
  ],
  "ASSET-003": [
    { ts: "W01", value: 0.12 }, { ts: "W02", value: 0.11 }, { ts: "W03", value: 0.14 },
    { ts: "W04", value: 0.18 }, { ts: "W05", value: 0.22 }, { ts: "W06", value: 0.25 },
    { ts: "W07", value: 0.31, event: "Corrective Action" }, { ts: "W08", value: 0.10 },
    { ts: "W09", value: 0.09 }, { ts: "W10", value: 0.08 }, { ts: "W11", value: 0.10 },
    { ts: "W12", value: 0.09 },
  ],
  "ASSET-004": [
    { ts: "W01", value: 2.2 }, { ts: "W02", value: 2.5 }, { ts: "W03", value: 2.9 },
    { ts: "W04", value: 3.1 }, { ts: "W05", value: 3.4 }, { ts: "W06", value: 3.6 },
    { ts: "W07", value: 3.8, event: "Corrective Action" }, { ts: "W08", value: 1.8 },
    { ts: "W09", value: 1.7 }, { ts: "W10", value: 1.9 }, { ts: "W11", value: 1.8 },
    { ts: "W12", value: 1.7 },
  ],
  "ASSET-005": [
    { ts: "W01", value: 11.8 }, { ts: "W02", value: 12.1 }, { ts: "W03", value: 11.9 },
    { ts: "W04", value: 12.3 }, { ts: "W05", value: 12.6 }, { ts: "W06", value: 12.9 },
    { ts: "W07", value: 13.1, event: "Corrective Action" }, { ts: "W08", value: 12.0 },
    { ts: "W09", value: 11.9 }, { ts: "W10", value: 11.8 }, { ts: "W11", value: 11.9 },
    { ts: "W12", value: 11.8 },
  ],
};

export const ASSET_METRIC_LABELS: Record<string, string> = {
  "ASSET-001": "Vibration (IPS)",
  "ASSET-002": "System Pressure (PSI)",
  "ASSET-003": "Voltage Deviation (V)",
  "ASSET-004": "Rotor Vibration (IPS)",
  "ASSET-005": "Bus Voltage (V)",
};

// ── Mock Agent Response ────────────────────────────────────

export const MOCK_AGENT_RESPONSE = {
  similarIncidents: [
    {
      id: "INC-2024-0041",
      score: 0.947,
      system: "Hydraulic",
      severity: "Critical" as Severity,
      excerpt: "Hydraulic leak at actuator junction P7-B. Seal worn beyond tolerance. Thermal cycling fatigue on O-ring compound.",
    },
    {
      id: "INC-2024-0031",
      score: 0.891,
      system: "Hydraulic",
      severity: "High" as Severity,
      excerpt: "Pump output fluctuating. Pressure relief valve contamination. Seal material degradation indicators.",
    },
    {
      id: "INC-2024-0021",
      score: 0.834,
      system: "Hydraulic",
      severity: "Medium" as Severity,
      excerpt: "Slow leak from coupling LC-229 on landing gear actuator. Coupling threads damaged from over-torque.",
    },
    {
      id: "INC-2024-0035",
      score: 0.762,
      system: "Propulsion",
      severity: "Critical" as Severity,
      excerpt: "Fuel line seepage at engine junction. Fitting below minimum torque. Incorrect torque wrench calibration.",
    },
    {
      id: "INC-2024-0015",
      score: 0.714,
      system: "Propulsion",
      severity: "Medium" as Severity,
      excerpt: "Oil consumption elevated 2.7× baseline. HPT stage 1 seal wear exceeding limits.",
    },
  ],
  summary:
    "Analysis of retrieved incidents reveals a dominant **seal and sealing-system failure pattern** across hydraulic and propulsion subsystems. Three of the top five matches involve O-ring/seal degradation; root causes cluster around thermal cycling fatigue and installation procedure non-conformances (incorrect torque). Corrective actions consistently involve seal stack replacement + system pressure validation. A secondary theme of **calibration non-conformance** (torque wrenches, test equipment) acts as a latent risk amplifier across multiple incidents.",
  recommendations: [
    {
      action: "Initiate fleet-wide seal inspection on hydraulic actuator circuits P7 series. Focus on O-ring compound thermal rating vs. operational profile.",
      confidence: "HIGH" as const,
    },
    {
      action: "Audit torque wrench calibration records for all hydraulic and propulsion line maintenance personnel. Replace out-of-tolerance equipment immediately.",
      confidence: "HIGH" as const,
    },
    {
      action: "Review O-ring compound specification against current thermal cycling exposure data. Consider upgrade to higher-rated compound for high-cycle actuators.",
      confidence: "MEDIUM" as const,
    },
    {
      action: "Implement periodic fluid sampling program (quarterly) for hydraulic systems on ASSET-002 to detect early seal material degradation.",
      confidence: "MEDIUM" as const,
    },
    {
      action: "Evaluate feasibility of predictive maintenance sensor on high-risk actuator junctions to provide early leak detection before threshold breach.",
      confidence: "LOW" as const,
    },
  ],
  toolCalls: [
    { tool: "VectorSearchTool", input: `query_text="${"hydraulic leak actuator seal degradation"}", top_k=5`, output: "Retrieved 5 incident chunks, scores [0.947, 0.891, 0.834, 0.762, 0.714]", latencyMs: 312 },
    { tool: "SQLQueryTool",     input: `SELECT defect_type, COUNT(*) FROM manufacturing_defects WHERE system='Hydraulic' GROUP BY defect_type ORDER BY COUNT(*) DESC LIMIT 5`, output: "5 rows: seal_failure=34, contamination=17, fitting_leak=12, coupling=8, o_ring=6", latencyMs: 89 },
    { tool: "SQLQueryTool",     input: `SELECT AVG(latency_ms), COUNT(*) FROM incident_reports WHERE system='Hydraulic' AND severity IN ('Critical','High')`, output: "1 row: avg_severity_score=2.7, incident_count=13", latencyMs: 64 },
    { tool: "AgentReasoning",   input: "Synthesise vector hits + SQL results → root-cause themes + recommended actions", output: "Generated summary (348 tokens) + 5 recommendations", latencyMs: 2840 },
  ],
};

// ── Dataset / Eval Stats ───────────────────────────────────

export const DATASET_HEALTH = [
  { metric: "Total incident records",  value: "1,247" },
  { metric: "Total defect records",    value: "8,341" },
  { metric: "Maintenance log entries", value: "3,892" },
  { metric: "Vector chunks indexed",   value: "4,189" },
  { metric: "Missing narrative text",  value: "23 (1.8%)" },
  { metric: "Missing severity",        value: "41 (3.3%)" },
  { metric: "Latest ingest",           value: "2024-03-12 14:32 UTC" },
  { metric: "Embedding model",         value: "all-MiniLM-L6-v2" },
];

export const EVAL_METRICS = [
  { metric: "Precision@3 (similarity)", value: "0.78", target: "≥ 0.70", status: "PASS" },
  { metric: "Precision@5 (similarity)", value: "0.71", target: "≥ 0.65", status: "PASS" },
  { metric: "Recall@5 (similarity)",    value: "0.65", target: "≥ 0.60", status: "PASS" },
  { metric: "Avg query latency (p50)",  value: "3.2 s", target: "≤ 5 s",  status: "PASS" },
  { metric: "Avg query latency (p95)",  value: "8.7 s", target: "≤ 15 s", status: "PASS" },
  { metric: "SQL guardrail rejections", value: "0 / 500", target: "0",    status: "PASS" },
  { metric: "Cost per query (GPT-4o)",  value: "$0.018", target: "≤ $0.05", status: "PASS" },
  { metric: "Answer hallucination rate",value: "~4%",  target: "≤ 10%",  status: "PASS" },
];
