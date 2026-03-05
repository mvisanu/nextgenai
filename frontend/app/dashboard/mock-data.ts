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

// ═══════════════════════════════════════════════════════════
// MEDICAL DOMAIN MOCK DATA
// ═══════════════════════════════════════════════════════════

export type Specialty = "Cardiology" | "Neurology" | "Respiratory" | "Gastroenterology" | "Musculoskeletal";

export interface MedCase {
  id: string;
  system: Specialty;      // reuses "system" key for Tab2 compatibility
  severity: Severity;
  date: string;
  assetId: string;        // case/patient identifier
  narrativeText: string;
  correctiveAction: string;
  relatedDefects: string[];
  relatedMaintenance: string[];
}

export const MEDICAL_CASES: MedCase[] = [
  {
    id: "CASE-2024-0041",
    system: "Cardiology",
    severity: "Critical",
    date: "2024-03-12",
    assetId: "PT-002",
    narrativeText:
      "58-year-old male presenting with acute chest pain radiating to jaw, diaphoresis, and ST-elevation in leads II, III, aVF. Troponin I elevated at 4.8 ng/mL. ECG confirmed inferior STEMI. Door-to-balloon time achieved in 67 minutes. Single-vessel disease of RCA with 95% proximal occlusion found at catheterisation.",
    correctiveAction:
      "Primary PCI performed with drug-eluting stent to proximal RCA. Dual antiplatelet therapy initiated (aspirin + ticagrelor). Discharged day 4 on optimal medical therapy. 30-day follow-up ECHO scheduled.",
    relatedDefects: ["DX-2024-0089", "DX-2024-0091"],
    relatedMaintenance: ["PROC-2024-0033"],
  },
  {
    id: "CASE-2024-0039",
    system: "Neurology",
    severity: "High",
    date: "2024-03-08",
    assetId: "PT-001",
    narrativeText:
      "72-year-old female with sudden onset severe headache described as 'worst of life', photophobia, and neck stiffness. GCS 14. CT head non-contrast showed no haemorrhage. Lumbar puncture revealed xanthochromia with elevated red cells. Neurosurgical review urgently requested.",
    correctiveAction:
      "Diagnosis: subarachnoid haemorrhage. CTA confirmed 7mm posterior communicating artery aneurysm. Neurosurgical coiling performed within 24 hours. Nimodipine initiated for vasospasm prophylaxis. ICU monitoring for 14 days.",
    relatedDefects: ["DX-2024-0082"],
    relatedMaintenance: ["PROC-2024-0031", "PROC-2024-0028"],
  },
  {
    id: "CASE-2024-0037",
    system: "Respiratory",
    severity: "High",
    date: "2024-03-05",
    assetId: "PT-003",
    narrativeText:
      "67-year-old male with COPD GOLD III presenting with 5-day history of worsening dyspnoea, increased sputum production, and fever. SpO2 84% on air. Chest X-ray shows left lower lobe consolidation. Sputum culture pending. CRP 184 mg/L.",
    correctiveAction:
      "Diagnosis: acute exacerbation COPD with community-acquired pneumonia. Amoxicillin-clavulanate + clarithromycin initiated. NIV commenced for respiratory failure. Discharged day 7 on pulmonary rehabilitation referral.",
    relatedDefects: ["DX-2024-0078", "DX-2024-0079"],
    relatedMaintenance: [],
  },
  {
    id: "CASE-2024-0035",
    system: "Cardiology",
    severity: "Critical",
    date: "2024-02-28",
    assetId: "PT-004",
    narrativeText:
      "81-year-old female with known heart failure (EF 25%) presenting with acute decompensation. BNP 4,200 pg/mL. Bilateral crackles to mid-zones. JVP elevated at 8cm. Peripheral oedema +++. Trigger: medication non-adherence following discharge 3 weeks prior.",
    correctiveAction:
      "IV furosemide infusion commenced. Daily fluid balance monitored. Cardiology review optimised guideline-directed medical therapy. Social work referral for medication adherence support. Discharged day 6.",
    relatedDefects: ["DX-2024-0074"],
    relatedMaintenance: ["PROC-2024-0025"],
  },
  {
    id: "CASE-2024-0033",
    system: "Gastroenterology",
    severity: "Medium",
    date: "2024-02-22",
    assetId: "PT-005",
    narrativeText:
      "52-year-old male with 3-week history of epigastric pain, early satiety, and unintentional 4kg weight loss. Upper GI endoscopy revealed a 3cm gastric ulcer with irregular edges at lesser curve. Biopsies taken for H.pylori and histopathology.",
    correctiveAction:
      "Histopathology confirmed H.pylori gastric ulcer, no dysplasia. Triple therapy initiated (omeprazole, amoxicillin, clarithromycin × 14 days). Repeat endoscopy at 8 weeks to confirm healing. Dietary advice provided.",
    relatedDefects: ["DX-2024-0071"],
    relatedMaintenance: ["PROC-2024-0022"],
  },
  {
    id: "CASE-2024-0031",
    system: "Cardiology",
    severity: "High",
    date: "2024-02-18",
    assetId: "PT-002",
    narrativeText:
      "63-year-old male with paroxysmal atrial fibrillation presenting with palpitations and pre-syncope. Holter monitor captured AF with rapid ventricular response at 152 bpm. CHADS2-VASc score 4. Echocardiogram showed mild left atrial dilatation.",
    correctiveAction:
      "Rate control: bisoprolol titrated to 10mg. Rhythm strategy: flecainide added. Anticoagulation: apixaban 5mg BD initiated. Electrophysiology referral for ablation assessment. 3-month review arranged.",
    relatedDefects: ["DX-2024-0067"],
    relatedMaintenance: ["PROC-2024-0019"],
  },
  {
    id: "CASE-2024-0029",
    system: "Musculoskeletal",
    severity: "Low",
    date: "2024-02-14",
    assetId: "PT-001",
    narrativeText:
      "45-year-old female with 6-week history of right knee pain, swelling, and morning stiffness lasting >1 hour. RF positive (84 IU/mL), anti-CCP positive, CRP 42 mg/L. X-ray shows periarticular osteopenia. Clinical features consistent with early rheumatoid arthritis.",
    correctiveAction:
      "Rheumatology referral accepted. Methotrexate 10mg weekly commenced with folic acid supplementation. NSAIDs for symptom relief. Patient education regarding joint protection. Baseline liver function and FBC monitoring established.",
    relatedDefects: [],
    relatedMaintenance: [],
  },
  {
    id: "CASE-2024-0027",
    system: "Neurology",
    severity: "Medium",
    date: "2024-02-09",
    assetId: "PT-003",
    narrativeText:
      "34-year-old female with 3-year history of episodic neurological symptoms including unilateral visual blurring, right-sided weakness (2 episodes), and fatigue. MRI brain shows multiple periventricular T2 lesions. CSF oligoclonal bands positive.",
    correctiveAction:
      "Diagnosis: relapsing-remitting multiple sclerosis confirmed per McDonald criteria. Neurology MDT discussion. Disease-modifying therapy initiated with dimethyl fumarate. Physiotherapy and MS nurse specialist referral.",
    relatedDefects: ["DX-2024-0063"],
    relatedMaintenance: ["PROC-2024-0017"],
  },
  {
    id: "CASE-2024-0025",
    system: "Respiratory",
    severity: "High",
    date: "2024-02-04",
    assetId: "PT-004",
    narrativeText:
      "44-year-old female presenting with sudden onset pleuritic chest pain and dyspnoea, SpO2 91% on air. CTPA confirms bilateral pulmonary emboli with right heart strain on CT. Troponin mildly elevated. Wells score 7 (high probability).",
    correctiveAction:
      "Massive PE protocol activated. LMWH bridged to rivaroxaban. Haematology review for thrombophilia screen. Cause identified as oral contraceptive pill. OCP discontinued. 3-month anticoagulation with haematology follow-up.",
    relatedDefects: ["DX-2024-0059"],
    relatedMaintenance: ["PROC-2024-0015"],
  },
  {
    id: "CASE-2024-0023",
    system: "Gastroenterology",
    severity: "Critical",
    date: "2024-01-30",
    assetId: "PT-005",
    narrativeText:
      "71-year-old male with melaena × 3 days, haematemesis on admission. Hb 58 g/L. Haemodynamically unstable — HR 118, BP 88/54. Endoscopy shows large posterior duodenal ulcer with active arterial bleeding (Forrest Ia). IV PPI commenced.",
    correctiveAction:
      "Endoscopic haemostasis achieved with adrenaline injection and haemoclip × 3. Transfused 4 units pRBC. IV pantoprazole infusion 72 hours. H.pylori rapid urease test positive — eradication therapy planned post-discharge. Repeat endoscopy day 3.",
    relatedDefects: ["DX-2024-0055", "DX-2024-0056"],
    relatedMaintenance: ["PROC-2024-0013"],
  },
  {
    id: "CASE-2024-0021",
    system: "Cardiology",
    severity: "Medium",
    date: "2024-01-25",
    assetId: "PT-001",
    narrativeText:
      "55-year-old male with type 2 diabetes and hypertension presenting for annual review. BP 158/96 on current therapy. HbA1c 78 mmol/mol. eGFR 52 mL/min. Urine ACR 45 mg/mmol. QRISK3 score 28%. No symptoms of end-organ damage.",
    correctiveAction:
      "ACE inhibitor dose uptitrated. SGLT2 inhibitor added for cardiorenal protection. Statin therapy optimised. Dietitian referral for dietary modification. Ophthalmology screening arranged. 3-month follow-up.",
    relatedDefects: ["DX-2024-0051"],
    relatedMaintenance: [],
  },
  {
    id: "CASE-2024-0019",
    system: "Musculoskeletal",
    severity: "High",
    date: "2024-01-20",
    assetId: "PT-002",
    narrativeText:
      "78-year-old female following low-energy fall. Right hip pain, shortened and externally rotated right leg. X-ray confirms displaced intracapsular femoral neck fracture (Garden III). Haematology: Hb 94 g/L, INR 2.1 (on warfarin for AF).",
    correctiveAction:
      "Warfarin reversed with vitamin K and FFP. Total hip replacement performed within 36 hours (met 36h target). Physiotherapy mobilisation commenced day 1. Falls assessment completed. Bone protection: alendronate and calcium/vitamin D prescribed.",
    relatedDefects: ["DX-2024-0047"],
    relatedMaintenance: [],
  },
  {
    id: "CASE-2024-0017",
    system: "Neurology",
    severity: "Low",
    date: "2024-01-15",
    assetId: "PT-003",
    narrativeText:
      "28-year-old male with 2-week history of right-sided facial droop, inability to raise right eyebrow, and impaired taste. No forehead sparing. Examination consistent with lower motor neuron facial palsy. No preceding illness; no ear pain; no rash.",
    correctiveAction:
      "Clinical diagnosis: Bell's palsy. Prednisolone 60mg × 7 days commenced within 72-hour window. Eye protection (lubricating drops + nocturnal taping) prescribed. Neurology review at 3 months. Expected full recovery in 70-80% of cases.",
    relatedDefects: [],
    relatedMaintenance: ["PROC-2024-0010"],
  },
  {
    id: "CASE-2024-0015",
    system: "Respiratory",
    severity: "Medium",
    date: "2024-01-11",
    assetId: "PT-004",
    narrativeText:
      "61-year-old female, ex-smoker (40 pack-year), with progressive dyspnoea on exertion over 12 months. Spirometry: FEV1/FVC 0.58, FEV1 62% predicted. CT chest shows emphysematous bullae upper lobes. 6-minute walk test: 380m.",
    correctiveAction:
      "COPD diagnosed (GOLD grade B). LABA/LAMA inhaler commenced. Pulmonary rehabilitation referral. Influenza and pneumococcal vaccination administered. Smoking cessation support reinforced. Annual spirometry monitoring plan initiated.",
    relatedDefects: ["DX-2024-0043"],
    relatedMaintenance: ["PROC-2024-0008"],
  },
  {
    id: "CASE-2024-0013",
    system: "Gastroenterology",
    severity: "Low",
    date: "2024-01-07",
    assetId: "PT-005",
    narrativeText:
      "38-year-old female with 6-month history of bloating, altered bowel habit (alternating diarrhoea and constipation), and abdominal cramps relieved by defecation. No rectal bleeding, no weight loss. FBC, CRP, and coeliac screen all normal.",
    correctiveAction:
      "Clinical diagnosis: irritable bowel syndrome (Rome IV criteria met). Low FODMAP diet guidance provided. Mebeverine 135mg TDS initiated. Psychological support referral for CBT-based gut-directed therapy. Follow-up in 8 weeks.",
    relatedDefects: [],
    relatedMaintenance: [],
  },
];

// ── Medical Analytics Data ──────────────────────────────────

export const DISEASE_BY_TYPE = [
  { type: "Cardiovascular",  count: 38 },
  { type: "Respiratory",     count: 31 },
  { type: "Neurological",    count: 24 },
  { type: "Gastrointestinal",count: 21 },
  { type: "Musculoskeletal", count: 18 },
  { type: "Metabolic/Endo.", count: 15 },
  { type: "Infectious",      count: 13 },
  { type: "Haematological",  count:  9 },
  { type: "Renal",           count:  8 },
  { type: "Other",           count:  6 },
];

export const SEVERITY_BY_SPECIALTY = [
  { system: "Cardiology",       Critical: 6, High: 11, Medium: 14, Low: 4 },
  { system: "Neurology",        Critical: 4, High:  9, Medium: 12, Low: 7 },
  { system: "Respiratory",      Critical: 3, High: 10, Medium: 16, Low: 6 },
  { system: "Gastro.",          Critical: 5, High:  8, Medium: 10, Low: 5 },
  { system: "Musculoskeletal",  Critical: 1, High:  5, Medium: 11, Low: 9 },
];

export const DISEASE_TREND = [
  { week: "W01", count: 22 },
  { week: "W02", count: 19 },
  { week: "W03", count: 25 },
  { week: "W04", count: 28 },
  { week: "W05", count: 23 },
  { week: "W06", count: 31 },
  { week: "W07", count: 26 },
  { week: "W08", count: 34 },
  { week: "W09", count: 21 },
  { week: "W10", count: 18 },
  { week: "W11", count: 24 },
  { week: "W12", count: 20 },
];

export const CLINICAL_THEMES = [
  { keyword: "dyspnoea",     count: 31 },
  { keyword: "chest pain",   count: 27 },
  { keyword: "fever",        count: 22 },
  { keyword: "hypertension", count: 19 },
  { keyword: "diabetes",     count: 17 },
  { keyword: "oedema",       count: 14 },
  { keyword: "dizziness",    count: 12 },
  { keyword: "fatigue",      count: 11 },
];

// ── Patient Cohort / Trends Data ────────────────────────────

export const PATIENTS = [
  { id: "COHORT-CARDIAC",   name: "COHORT-CARDIAC // Heart Failure Patients" },
  { id: "COHORT-RESP",      name: "COHORT-RESP // Respiratory Failure" },
  { id: "COHORT-NEURO",     name: "COHORT-NEURO // Stroke Pathway" },
  { id: "COHORT-GI",        name: "COHORT-GI // GI Bleed Cases" },
  { id: "COHORT-MSK",       name: "COHORT-MSK // Hip Fracture Patients" },
];

export const PATIENT_METRICS: Record<string, MaintenancePoint[]> = {
  "COHORT-CARDIAC": [
    { ts: "W01", value: 22.4 }, { ts: "W02", value: 23.1 }, { ts: "W03", value: 24.8 },
    { ts: "W04", value: 25.2 }, { ts: "W05", value: 26.3 }, { ts: "W06", value: 27.0 },
    { ts: "W07", value: 27.8, event: "Protocol Change" }, { ts: "W08", value: 19.4 },
    { ts: "W09", value: 18.1 }, { ts: "W10", value: 17.5 }, { ts: "W11", value: 16.9 },
    { ts: "W12", value: 16.3 },
  ],
  "COHORT-RESP": [
    { ts: "W01", value: 7.2 }, { ts: "W02", value: 7.8 }, { ts: "W03", value: 8.1 },
    { ts: "W04", value: 8.6 }, { ts: "W05", value: 9.0 }, { ts: "W06", value: 9.4 },
    { ts: "W07", value: 9.8, event: "Protocol Change" }, { ts: "W08", value: 6.1 },
    { ts: "W09", value: 5.8 }, { ts: "W10", value: 5.9 }, { ts: "W11", value: 6.0 },
    { ts: "W12", value: 5.7 },
  ],
  "COHORT-NEURO": [
    { ts: "W01", value: 4.8 }, { ts: "W02", value: 5.1 }, { ts: "W03", value: 5.4 },
    { ts: "W04", value: 5.7 }, { ts: "W05", value: 6.0 }, { ts: "W06", value: 6.2 },
    { ts: "W07", value: 6.5, event: "Protocol Change" }, { ts: "W08", value: 3.9 },
    { ts: "W09", value: 3.7 }, { ts: "W10", value: 3.8 }, { ts: "W11", value: 3.6 },
    { ts: "W12", value: 3.5 },
  ],
  "COHORT-GI": [
    { ts: "W01", value: 11.2 }, { ts: "W02", value: 11.8 }, { ts: "W03", value: 12.1 },
    { ts: "W04", value: 12.6 }, { ts: "W05", value: 13.0 }, { ts: "W06", value: 13.4 },
    { ts: "W07", value: 13.9, event: "Protocol Change" }, { ts: "W08", value: 9.2 },
    { ts: "W09", value: 8.8 }, { ts: "W10", value: 8.9 }, { ts: "W11", value: 9.1 },
    { ts: "W12", value: 8.7 },
  ],
  "COHORT-MSK": [
    { ts: "W01", value: 38.4 }, { ts: "W02", value: 39.1 }, { ts: "W03", value: 40.2 },
    { ts: "W04", value: 41.5 }, { ts: "W05", value: 42.0 }, { ts: "W06", value: 43.1 },
    { ts: "W07", value: 44.2, event: "Protocol Change" }, { ts: "W08", value: 34.8 },
    { ts: "W09", value: 33.9 }, { ts: "W10", value: 33.1 }, { ts: "W11", value: 32.8 },
    { ts: "W12", value: 32.2 },
  ],
};

export const PATIENT_METRIC_LABELS: Record<string, string> = {
  "COHORT-CARDIAC":  "30-day Readmission Rate (%)",
  "COHORT-RESP":     "ICU Length of Stay (days)",
  "COHORT-NEURO":    "Time to CT Imaging (hours)",
  "COHORT-GI":       "Length of Stay (days)",
  "COHORT-MSK":      "Time to Surgery (hours)",
};

// ── Mock Medical Agent Response ────────────────────────────

export const MOCK_MEDICAL_RESPONSE = {
  similarIncidents: [
    {
      id: "CASE-2024-0041",
      score: 0.952,
      system: "Cardiology",
      severity: "Critical" as Severity,
      excerpt: "STEMI with inferior ST-elevation, troponin positive. Primary PCI to proximal RCA. Dual antiplatelet therapy commenced.",
    },
    {
      id: "CASE-2024-0035",
      score: 0.887,
      system: "Cardiology",
      severity: "Critical" as Severity,
      excerpt: "Decompensated heart failure, EF 25%. BNP markedly elevated. IV diuresis required. Medication non-adherence as trigger.",
    },
    {
      id: "CASE-2024-0031",
      score: 0.841,
      system: "Cardiology",
      severity: "High" as Severity,
      excerpt: "Paroxysmal AF with rapid ventricular response. Rate control and anticoagulation initiated. Electrophysiology referral made.",
    },
    {
      id: "CASE-2024-0021",
      score: 0.774,
      system: "Cardiology",
      severity: "Medium" as Severity,
      excerpt: "Diabetic with hypertension, CKD stage 3. Cardiorenal optimisation: SGLT2i added. QRISK3 28% — statin uptitrated.",
    },
    {
      id: "CASE-2024-0025",
      score: 0.721,
      system: "Respiratory",
      severity: "High" as Severity,
      excerpt: "Bilateral pulmonary emboli with right heart strain. OCP-associated VTE. Anticoagulated with rivaroxaban × 3 months.",
    },
  ],
  summary:
    "Analysis of retrieved cases reveals a dominant **cardiovascular risk escalation pattern** — cardiac and thromboembolic presentations clustering around modifiable risk factors (hypertension, diabetes, AF). Four of the top five matches involve cardiovascular compromise; root causes cluster around **medication non-adherence** and **undertreated comorbidities**. Corrective actions consistently involve guideline-directed medical therapy optimisation and specialist referral. A secondary theme of **metabolic-cardiovascular interaction** (diabetes driving CKD and CVD simultaneously) acts as a compounding risk factor across multiple cases.",
  recommendations: [
    {
      action: "Initiate structured medication adherence review for all heart failure patients at 30-day post-discharge follow-up — the identified trigger in 2 of 5 cases.",
      confidence: "HIGH" as const,
    },
    {
      action: "Audit SGLT2 inhibitor prescribing rates for diabetic patients with eGFR >30 and established CVD — cardiorenal benefit documented in retrieved cases.",
      confidence: "HIGH" as const,
    },
    {
      action: "Implement shared CHADS2-VASc calculation prompt in AF outpatient letters to standardise anticoagulation initiation across the cohort.",
      confidence: "MEDIUM" as const,
    },
    {
      action: "Review OCP prescribing criteria in patients with VTE risk factors — OCP-associated PE identified in retrieved case set.",
      confidence: "MEDIUM" as const,
    },
    {
      action: "Evaluate feasibility of remote BP/HR monitoring for high QRISK3 patients to enable earlier hypertension intervention.",
      confidence: "LOW" as const,
    },
  ],
  toolCalls: [
    { tool: "VectorSearchTool", input: `query_text="cardiac chest pain acute coronary syndrome management", top_k=5`, output: "Retrieved 5 clinical case chunks, scores [0.952, 0.887, 0.841, 0.774, 0.721]", latencyMs: 298 },
    { tool: "SQLQueryTool", input: `SELECT diagnosis, COUNT(*) FROM medical_cases WHERE specialty='Cardiology' GROUP BY diagnosis ORDER BY COUNT(*) DESC LIMIT 5`, output: "5 rows: heart_failure=38, STEMI=24, AF=19, NSTEMI=16, hypertension=12", latencyMs: 74 },
    { tool: "SQLQueryTool", input: `SELECT treatment_given, AVG(outcome_score) FROM medical_cases WHERE specialty='Cardiology' GROUP BY treatment_given ORDER BY AVG(outcome_score) DESC`, output: "3 rows: pci_stent=0.91, anticoagulation=0.84, medical_therapy=0.77", latencyMs: 61 },
    { tool: "AgentReasoning", input: "Synthesise vector hits + SQL results → clinical root-cause themes + recommended actions", output: "Generated summary (362 tokens) + 5 recommendations", latencyMs: 2910 },
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

export const MEDICAL_DATASET_HEALTH = [
  { metric: "Total clinical cases",       value: "892" },
  { metric: "Total disease records",      value: "3,241" },
  { metric: "Clinical procedure entries", value: "1,587" },
  { metric: "Vector chunks indexed",      value: "2,847" },
  { metric: "Missing clinical narrative", value: "11 (1.2%)" },
  { metric: "Missing severity code",      value: "28 (3.1%)" },
  { metric: "Latest ingest",              value: "2024-03-12 14:32 UTC" },
  { metric: "Embedding model",            value: "all-MiniLM-L6-v2" },
];

export const MEDICAL_EVAL_METRICS = [
  { metric: "Precision@3 (case similarity)",  value: "0.81", target: "≥ 0.70", status: "PASS" },
  { metric: "Precision@5 (case similarity)",  value: "0.74", target: "≥ 0.65", status: "PASS" },
  { metric: "Recall@5 (case similarity)",     value: "0.68", target: "≥ 0.60", status: "PASS" },
  { metric: "Avg query latency (p50)",        value: "3.5 s", target: "≤ 5 s",  status: "PASS" },
  { metric: "Avg query latency (p95)",        value: "9.2 s", target: "≤ 15 s", status: "PASS" },
  { metric: "SQL guardrail rejections",       value: "0 / 500", target: "0",    status: "PASS" },
  { metric: "Cost per query (GPT-4o)",        value: "$0.021", target: "≤ $0.05", status: "PASS" },
  { metric: "Answer hallucination rate",      value: "~5%",  target: "≤ 10%",  status: "PASS" },
];
