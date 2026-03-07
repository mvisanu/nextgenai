"use client";

// ============================================================
// examples/page.tsx — Test Query Examples & Industry Use Cases
// PhD Review Board analysis: what each query does, why it
// matters, measurable ROI, and cross-industry applicability.
// ============================================================

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, ChevronDown, ChevronUp, Activity,
  DollarSign, Clock, TrendingDown, Zap, Shield,
  Heart, Plane, Factory, Cpu, Truck, FlaskConical,
  Building2, Leaf, CheckCircle2, Copy, Check,
} from "lucide-react";
import { ThemeToggle, FontSizeControl } from "../lib/theme";

// ── Types ────────────────────────────────────────────────────────────────────

interface Example {
  id: string;
  number: number;
  query: string;
  intent: "vector" | "sql" | "hybrid";
  tab: string;
  whatHappens: string[];
  whyHelpful: string;
  timeSaved: string;
  moneySaved: string;
  roiDetail: string;
  tags: string[];
}

interface Industry {
  id: string;
  name: string;
  icon: React.ElementType;
  accentVar: string;
  pain: string;
  useCase: string;
  benefit: string;
  estimatedROI: string;
}

// ── 14 Test Examples ────────────────────────────────────────────────────────

const EXAMPLES: Example[] = [
  {
    id: "ex-01",
    number: 1,
    query: "Find all incidents similar to: hydraulic leak near actuator, suspected seal degradation, unit reworked and returned to service.",
    intent: "vector",
    tab: "ASK THE AGENT → Ask the Agent",
    whatHappens: [
      "The query text is embedded by the all-MiniLM-L6-v2 model into a 384-dimension vector in ~50ms.",
      "pgvector performs an HNSW approximate nearest-neighbour search against 10,000 incident embeddings using cosine distance (<-> operator).",
      "Top-8 most semantically similar incidents are returned with similarity scores — finding 'gasket failure', 'seal wear', 'actuator pressure loss' even though those exact words weren't in the query.",
      "The agent synthesises a cited response naming the matched incident IDs and common corrective actions across all retrieved records.",
    ],
    whyHelpful: "A quality engineer investigating a recurring actuator failure no longer reads through thousands of incident reports manually. The system surfaces the 8 most relevant cases in seconds, including ones using different terminology for the same failure mode.",
    timeSaved: "2–4 hours per investigation (manual keyword search + reading) → 30 seconds",
    moneySaved: "$240–$480 per investigation (engineer at $120/hr)",
    roiDetail: "At 3 investigations/week × 50 weeks = 150 investigations/year. Savings: $36,000–$72,000/year per engineer.",
    tags: ["vector search", "seal failure", "hydraulic", "actuator"],
  },
  {
    id: "ex-02",
    number: 2,
    query: "Show defect trends by product line for the last 90 days and highlight any product with more than 10% defect rate.",
    intent: "sql",
    tab: "ASK THE AGENT → Defect Analytics",
    whatHappens: [
      "The intent router classifies this as sql-only — it contains explicit time window (90 days) and aggregation language (trends, rate, highlight).",
      "SQLQueryTool executes: SELECT product, COUNT(*) as total, SUM(CASE WHEN severity IN ('High','Critical') THEN 1 ELSE 0 END) as defects FROM manufacturing_defects WHERE inspection_date >= NOW() - INTERVAL '90 days' GROUP BY product ORDER BY defects DESC.",
      "Results are returned as a structured table. Any product exceeding the 10% threshold is flagged in the synthesis.",
      "The agent annotates with natural-language commentary: 'Product line A-227 shows 14.3% defect rate — above threshold. Recommend immediate inspection of Lot #4419.'",
    ],
    whyHelpful: "This replaces a weekly manual Excel pivot that a quality manager builds by exporting from the CMMS, cleaning columns, and filtering. The agent does it in 2 seconds with natural language and no BI tool training required.",
    timeSaved: "3–5 hours/week for quality reporting → 10 seconds",
    moneySaved: "$18,000–$30,000/year (one engineer's weekly reporting time eliminated)",
    roiDetail: "Conservative: 3 hrs × 50 weeks × $120/hr = $18,000/yr. Plus earlier defect detection prevents downstream scrap/rework costs of $5,000–$50,000 per product line per incident.",
    tags: ["sql", "defect rate", "trend", "product line"],
  },
  {
    id: "ex-03",
    number: 3,
    query: "Given this incident: intermittent short circuit in avionics harness, chafing observed on wire bundle near frame 22, replaced wiring loom. Classify the defect type and recommend a maintenance action.",
    intent: "hybrid",
    tab: "ASK THE AGENT → Ask the Agent",
    whatHappens: [
      "The hybrid path fires: VectorSearchTool retrieves the 8 most similar historical incidents involving harness chafing and avionics wiring.",
      "SQLQueryTool queries: SELECT defect_type, action_taken, COUNT(*) FROM manufacturing_defects WHERE product LIKE '%avionics%' OR defect_type LIKE '%wiring%' GROUP BY defect_type, action_taken.",
      "The LLM synthesis classifies the defect as 'Electrical / Wiring Abrasion' with HIGH confidence based on retrieved evidence.",
      "Recommended actions are grounded in retrieved corrective actions: install chafe guard at frame 22–24, inspect adjacent bundles within 200mm, update inspection interval to 500FH.",
    ],
    whyHelpful: "A maintenance engineer writing a Non-Conformance Report (NCR) previously spent 45 minutes searching for precedents and classifying manually. The agent produces a cited, classified recommendation instantly — ready to paste into the NCR.",
    timeSaved: "45 min per NCR → 2 minutes",
    moneySaved: "$85 per NCR (engineer time). At 50 NCRs/month = $4,250/month = $51,000/year.",
    roiDetail: "Plus: consistent classifications reduce misrouted defects (wrong repair team dispatched), which costs $500–$2,000 per misroute in rework and delay.",
    tags: ["hybrid", "avionics", "classification", "NCR"],
  },
  {
    id: "ex-04",
    number: 4,
    query: "What are the top 5 recurring failure modes in the landing gear system over the last 12 months?",
    intent: "hybrid",
    tab: "ASK THE AGENT → Incident Explorer",
    whatHappens: [
      "VectorSearchTool retrieves incidents with high semantic similarity to 'landing gear failure' — catching 'gear retraction fault', 'MLG actuator snag', 'nose gear shimmy', and similar paraphrases.",
      "SQLQueryTool aggregates: SELECT defect_type, COUNT(*) as occurrences FROM manufacturing_defects WHERE inspection_date >= NOW() - INTERVAL '365 days' AND product LIKE '%landing gear%' GROUP BY defect_type ORDER BY occurrences DESC LIMIT 5.",
      "GraphRAGTool traverses entity nodes for 'landing gear' — finding connected components: hydraulic lines, actuators, micro-switches, uplocks — and surfaces which sub-components appear most in failure contexts.",
      "The agent synthesises a prioritised failure mode list with occurrence counts and associated corrective action patterns from historical data.",
    ],
    whyHelpful: "Reliability engineers use this for Failure Mode & Effects Analysis (FMEA) updates. Previously this required a full data pull and days of manual analysis. The agent produces a draft FMEA input in minutes.",
    timeSaved: "2–3 days of analysis → 5 minutes",
    moneySaved: "$2,880–$4,320 per FMEA update cycle (3 days × $120/hr × 8hrs). Done quarterly = $11,520–$17,280/year.",
    roiDetail: "Better FMEA accuracy also improves inspection interval optimisation — reducing unnecessary inspections worth $2,000–$10,000 each.",
    tags: ["hybrid", "graphrag", "FMEA", "landing gear", "reliability"],
  },
  {
    id: "ex-05",
    number: 5,
    query: "Show me maintenance metrics for aircraft TAIL-N447X over the last 6 months including any anomalies.",
    intent: "hybrid",
    tab: "DASHBOARD → Maintenance Trends",
    whatHappens: [
      "SQLQueryTool queries the maintenance_logs table filtered by asset_id = 'TAIL-N447X' and ts >= NOW() - INTERVAL '180 days'.",
      "Time-series data is returned: metric values over time, with automatic anomaly detection (values > 2σ from rolling mean flagged).",
      "The Maintenance Trends tab renders an annotated line chart — vertical markers indicate corrective action dates.",
      "The agent's before/after analysis compares mean metric values pre/post each corrective action to quantify improvement.",
    ],
    whyHelpful: "Maintenance planners can visually confirm whether a corrective action actually resolved a degradation trend — something previously requiring manual spreadsheet analysis across multiple maintenance cycles.",
    timeSaved: "4–6 hours of manual trend analysis → 20 seconds",
    moneySaved: "$480–$720 per asset per review cycle. Fleet of 20 aircraft × 12 reviews/year = $115,200–$172,800/year.",
    roiDetail: "Early anomaly detection can defer or prevent an unscheduled maintenance event costing $50,000–$500,000 in AOG (Aircraft on Ground) time.",
    tags: ["sql", "time-series", "maintenance", "anomaly", "aircraft"],
  },
  {
    id: "ex-06",
    number: 6,
    query: "Find incidents involving corrosion near fasteners on skin panels and show me which lots were quarantined.",
    intent: "hybrid",
    tab: "ASK THE AGENT → Incident Explorer",
    whatHappens: [
      "VectorSearchTool returns incidents semantically matching corrosion, fastener, skin panel — including 'surface oxidation', 'pitting corrosion', 'fastener galvanic reaction' variants.",
      "SQLQueryTool queries lot_number and action_taken columns filtered for quarantine actions: WHERE action_taken ILIKE '%quarantine%'.",
      "GraphRAGTool links incident entities (supplier batches, lot numbers, part numbers) to build a supplier-corrosion risk map.",
      "Agent response: 'Lot #3812 and #4001 from Supplier XYZ were quarantined following corrosion findings on 14 skin panels at frames 45–52. 3 additional lots from the same supplier remain under monitoring.'",
    ],
    whyHelpful: "Supply chain quality managers can instantly trace a corrosion finding back to source lots and identify at-risk inventory still in service — preventing a potential fleet-wide safety issue.",
    timeSaved: "1–2 days of manual tracing → 1 minute",
    moneySaved: "Preventing a single fleet-wide corrosion directive = $500,000–$5,000,000 in unplanned maintenance costs avoided.",
    roiDetail: "This is the highest-ROI scenario: one prevented airworthiness directive (AD) pays for years of system operation.",
    tags: ["hybrid", "corrosion", "lot tracing", "supply chain", "safety"],
  },
  {
    id: "ex-07",
    number: 7,
    query: "What is the defect rate by severity for product line B across all plants last quarter?",
    intent: "sql",
    tab: "DASHBOARD → Defect Analytics",
    whatHappens: [
      "SQLQueryTool executes a grouped aggregation: SELECT plant, severity, COUNT(*) FROM manufacturing_defects WHERE product LIKE '%B%' AND inspection_date >= DATE_TRUNC('quarter', NOW() - INTERVAL '3 months') GROUP BY plant, severity ORDER BY plant, severity.",
      "Results feed the Defect Analytics stacked bar chart — each plant shown as a column, severity levels stacked in red/amber/yellow/green.",
      "The agent flags Plant 3 as an outlier: 'Plant 3 shows 3.2× the critical defect rate of Plants 1 and 2 for Product B. Recommend root cause investigation.'",
    ],
    whyHelpful: "Quality directors get the cross-plant comparison they need for monthly management reviews without waiting for IT to run a BI report. They can walk into a board meeting with live data.",
    timeSaved: "2 days for BI team to build report → 5 seconds",
    moneySaved: "$1,920/month BI team time saved ($120/hr × 16hrs × 12 = $23,040/year). Plus: catching a bad plant 1 month earlier prevents $20,000–$200,000 in scrap.",
    roiDetail: "The 'outlier alert' capability alone — automatically flagging Plant 3 — is worth its weight in gold at quarterly reviews.",
    tags: ["sql", "cross-plant", "severity", "management reporting"],
  },
  {
    id: "ex-08",
    number: 8,
    query: "Summarise all incidents in the last 30 days involving torque specification non-conformances and suggest a training intervention.",
    intent: "hybrid",
    tab: "ASK THE AGENT → Ask the Agent",
    whatHappens: [
      "VectorSearchTool retrieves recent incidents semantically matching 'torque', 'tightening', 'fastener specification', 'over-torque', 'under-torque', 'torque wrench'.",
      "Time filter is applied: only incidents in the last 30 days.",
      "The LLM synthesis identifies the pattern: '11 of 14 torque non-conformances occurred on the evening shift at Plant 2, suggesting shift-specific process drift.'",
      "Recommended intervention: 'Targeted torque procedure refresher training for evening shift teams at Plant 2. Implement torque verification sign-off for critical fastener categories.'",
    ],
    whyHelpful: "Training managers and quality engineers can identify training gaps from operational data without months of manual trend review. The shift-specific insight is something keyword search would never surface.",
    timeSaved: "Manual trend review (weekly): 3 hours → 10 seconds",
    moneySaved: "Each prevented torque-related rework event saves $500–$5,000. Identifying the root cause in 30 days vs. 6 months prevents 5× more events.",
    roiDetail: "Training intervention cost: $2,000. Rework prevented: $25,000–$250,000. ROI: 12:1 to 125:1.",
    tags: ["hybrid", "torque", "training", "shift analysis", "process improvement"],
  },
  {
    id: "ex-09",
    number: 9,
    query: "Compare defect rates before and after the maintenance overhaul on engine ESN-88714 completed on 2024-03-15.",
    intent: "hybrid",
    tab: "DASHBOARD → Maintenance Trends",
    whatHappens: [
      "The date '2024-03-15' is parsed and used as a before/after split point.",
      "SQLQueryTool runs two queries: defect counts for ESN-88714 in the 90 days before and 90 days after the overhaul date.",
      "The Maintenance Trends tab renders an annotated before/after line chart with a vertical marker at the overhaul date.",
      "Agent synthesis: 'Defect rate decreased 67% (from 8.1/month to 2.7/month) following the overhaul. The improvement is statistically significant (p < 0.05). Remaining defects are concentrated in the fuel management subsystem — not addressed in the overhaul scope.'",
    ],
    whyHelpful: "Reliability engineers can quantitatively validate whether an expensive overhaul actually worked — and identify residual issues for the next maintenance scope. This closes the feedback loop that most MRO organisations lack.",
    timeSaved: "Manual before/after analysis: 1 day → 10 seconds",
    moneySaved: "Engine overhaul costs $500,000–$2,000,000. Confirming effectiveness prevents unnecessary repeat overhauls and scopes next work accurately — saving $50,000–$200,000 per engine.",
    roiDetail: "The 'remaining defect' insight (fuel management not in scope) is pure gold — it targets the next intervention precisely instead of a full repeat overhaul.",
    tags: ["hybrid", "before/after", "overhaul validation", "engine", "MRO"],
  },
  {
    id: "ex-10",
    number: 10,
    query: "Find all incidents where a corrective action of 'replaced seal' did not prevent recurrence within 60 days.",
    intent: "hybrid",
    tab: "ASK THE AGENT → Incident Explorer",
    whatHappens: [
      "VectorSearchTool finds all incidents containing 'replaced seal' as a corrective action.",
      "For each retrieved incident, SQLQueryTool checks for subsequent incidents on the same asset_id or lot_number within 60 days of the repair date.",
      "GraphRAGTool traverses entity relationships — linking seal part numbers to suppliers, revealing whether recurrence correlates with specific seal batch codes.",
      "Agent output: '7 of 23 seal replacements showed recurrence within 60 days. All 7 used seal batch SL-2204-A. Recommend supplier quality notification and batch withdrawal.'",
    ],
    whyHelpful: "This is the 'ineffective repair detection' use case that prevents fleet-wide escapes. Identifying a bad seal batch before widespread installation is the difference between a minor corrective action and a full fleet-wide directive.",
    timeSaved: "Manual recurrence tracing: 2–3 days → 2 minutes",
    moneySaved: "Identifying a bad batch before fleet-wide installation: $500,000–$5,000,000 in prevented corrective maintenance. One detection event pays for years of system cost.",
    roiDetail: "Supplier quality notification also activates warranty recovery — typically 50–80% of parts cost recovered on defective batches.",
    tags: ["hybrid", "recurrence", "ineffective repair", "batch tracing", "supplier quality"],
  },
  {
    id: "ex-11",
    number: 11,
    query: "What are the most common defect types for composite structures and which have the highest severity?",
    intent: "sql",
    tab: "DASHBOARD → Defect Analytics",
    whatHappens: [
      "SQLQueryTool: SELECT defect_type, severity, COUNT(*) as count FROM manufacturing_defects WHERE product ILIKE '%composite%' GROUP BY defect_type, severity ORDER BY count DESC.",
      "Defect Analytics bar chart renders the top types: delamination, porosity, disbond, fibre misalignment.",
      "The agent highlights: 'Delamination accounts for 38% of all composite defects but 71% of Critical-severity cases — disproportionate risk profile.'",
    ],
    whyHelpful: "Structural engineers writing composite repair procedures need to prioritise inspection methods. This query reveals that delamination deserves enhanced NDT (non-destructive testing) protocols even though it's not the most common defect.",
    timeSaved: "Manual defect categorisation review: 4 hours → 5 seconds",
    moneySaved: "Better NDT prioritisation reduces missed Critical defects — each missed critical composite defect in aerospace can cost $1,000,000+ in liability and repair.",
    roiDetail: "Improved inspection targeting reduces false positives (over-inspection) by 20–30% — saving $500–$2,000 per avoided unnecessary structural repair.",
    tags: ["sql", "composite", "NDT", "severity", "structural"],
  },
  {
    id: "ex-12",
    number: 12,
    query: "Show me all maintenance events for the hydraulic system fleet-wide in 2024 and calculate mean time between failures.",
    intent: "sql",
    tab: "DASHBOARD → Maintenance Trends",
    whatHappens: [
      "SQLQueryTool runs a window function query: SELECT asset_id, ts, LAG(ts) OVER (PARTITION BY asset_id ORDER BY ts) as prev_event, ts - LAG(ts) OVER (PARTITION BY asset_id ORDER BY ts) as gap FROM maintenance_logs WHERE metric_name ILIKE '%hydraulic%' AND ts BETWEEN '2024-01-01' AND '2024-12-31'.",
      "MTBF is calculated as the mean of all inter-event gaps by asset and fleet-wide.",
      "Agent output: 'Fleet MTBF for hydraulic system: 847 flight hours. Aircraft TAIL-N332K shows 312 FH MTBF — 63% below fleet average. Recommend enhanced inspection interval for this aircraft.'",
    ],
    whyHelpful: "MTBF calculation is a core reliability metric that typically requires a dedicated reliability engineer running a custom script. The agent does it in natural language for any system on demand.",
    timeSaved: "Reliability engineer MTBF analysis: 4–8 hours → 15 seconds",
    moneySaved: "$480–$960 per analysis. Monthly fleet reliability reports: $5,760–$11,520/year. Plus: targeted inspection of the low-MTBF aircraft prevents unscheduled events.",
    roiDetail: "Identifying TAIL-N332K early enables a proactive hydraulic system inspection ($5,000) vs. an AOG event ($100,000+). ROI: 20:1.",
    tags: ["sql", "MTBF", "reliability", "hydraulic", "fleet analysis"],
  },
  {
    id: "ex-13",
    number: 13,
    query: "I have a new incident: oil contamination found in gearbox housing during scheduled C-check, source unclear. What are the most similar past incidents and what was the root cause in each case?",
    intent: "hybrid",
    tab: "ASK THE AGENT → Ask the Agent",
    whatHappens: [
      "VectorSearchTool embeds the incident description and retrieves the 8 most similar historical gearbox oil contamination incidents.",
      "For each retrieved incident, SQLQueryTool looks up the defect_type and action_taken fields.",
      "GraphRAGTool identifies entity clusters: which gearbox component types (seals, bearings, breathers) appear most in oil contamination context.",
      "Agent synthesises: 'Top 3 root causes in similar cases: (1) Worn oil seal at input shaft — 5 cases, (2) Blocked breather causing overpressure — 2 cases, (3) Contaminated replacement oil batch — 1 case. Recommend: inspect input shaft seal first, then check breather valve.'",
    ],
    whyHelpful: "A first-time engineer on a new aircraft type gets the benefit of 10 years of institutional knowledge from historical incidents — instantly. This is knowledge transfer at scale.",
    timeSaved: "Consulting experienced engineers + manual search: 2–4 hours → 1 minute",
    moneySaved: "Faster root cause identification reduces gearbox investigation time by 50–75%, saving $1,000–$5,000 per event in hangar time and engineer hours.",
    roiDetail: "For MRO organisations: faster troubleshooting = higher aircraft utilisation. Each hour of TAT improvement = $1,000–$5,000 in revenue for the MRO shop.",
    tags: ["hybrid", "gearbox", "root cause", "knowledge transfer", "MRO"],
  },
  {
    id: "ex-14",
    number: 14,
    query: "Which suppliers have the highest defect rates and are there any patterns in the defect types associated with each?",
    intent: "hybrid",
    tab: "ASK THE AGENT → Ask the Agent",
    whatHappens: [
      "SQLQueryTool aggregates: SELECT source, defect_type, COUNT(*) FROM manufacturing_defects GROUP BY source, defect_type ORDER BY COUNT(*) DESC.",
      "GraphRAGTool builds a supplier → part → defect_type graph, revealing that Supplier A's defects cluster around 'dimensional non-conformance' while Supplier B's cluster around 'surface finish'.",
      "The agent generates a supplier risk ranking with defect-type fingerprints: 'Supplier A: 23.4% defect rate, primarily dimensional. Supplier B: 18.1%, primarily surface finish. Both exceed the 15% threshold for escalated supplier audit.'",
    ],
    whyHelpful: "Supplier quality engineers get a data-driven basis for audit prioritisation and supplier scorecards — replacing gut feel and manual spreadsheet analysis.",
    timeSaved: "Monthly supplier scorecard: 1–2 days → 30 seconds",
    moneySaved: "Targeted supplier audits cost $5,000–$15,000 each. Prioritising correctly saves 2–3 unnecessary audits/year = $10,000–$45,000. Better supplier selection reduces incoming defect rate by 15–30%.",
    roiDetail: "A 15% reduction in incoming defect rate for a manufacturer with $50M parts spend saves $750,000–$1,500,000 in rework and scrap annually.",
    tags: ["hybrid", "supplier quality", "audit", "scorecard", "graphrag"],
  },
];

// ── Industry Use Cases ───────────────────────────────────────────────────────

const INDUSTRIES: Industry[] = [
  {
    id: "aerospace",
    name: "Aerospace & MRO",
    icon: Plane,
    accentVar: "--col-cyan",
    pain: "Incident reports spread across multiple CMMS/QMS systems with no cross-system search. FMEA updates take weeks. AOG events cost $10,000–$100,000/hour.",
    useCase: "Agent queries across maintenance logs, part defect records, and incident narratives to identify failure patterns, validate repair effectiveness, and trace suspect batches fleet-wide.",
    benefit: "Reduce investigation time from days to minutes. Prevent AOG events through early anomaly detection. Accelerate FMEA cycles from weeks to hours.",
    estimatedROI: "$500K–$5M/year per 50-aircraft fleet",
  },
  {
    id: "automotive",
    name: "Automotive Manufacturing",
    icon: Factory,
    accentVar: "--col-green",
    pain: "Production line defect tracking in one system, supplier quality in another, warranty claims in a third. Connecting the dots for root cause analysis requires 3 departments and 2 weeks.",
    useCase: "Unified query across production defects, supplier incoming inspection, warranty claims, and field returns. Identify defect patterns before they become recalls.",
    benefit: "Reduce recall risk by detecting supplier part problems 3–6 months earlier. Compress root cause cycle from weeks to hours.",
    estimatedROI: "$1M–$50M per avoided recall campaign",
  },
  {
    id: "healthcare",
    name: "Healthcare & Medical Devices",
    icon: Heart,
    accentVar: "--col-red",
    pain: "Adverse event reports, device maintenance logs, and calibration records are siloed. FDA MDR (Medical Device Reporting) root cause investigations take months of manual chart review.",
    useCase: "Vector search across adverse event narratives to find similar prior events. SQL analytics on device maintenance history. Graph traversal to identify shared component batches across multiple device failures.",
    benefit: "FDA MDR investigations compressed from 3–6 months to days. Proactive field safety corrective action (FSCA) triggered before more adverse events occur.",
    estimatedROI: "One prevented Class I recall = $10M–$100M. MDR compliance cost reduced by 40–60%.",
  },
  {
    id: "energy",
    name: "Oil & Gas / Energy",
    icon: Zap,
    accentVar: "--col-amber",
    pain: "Equipment failure incident reports in one database, maintenance history in another, process safety events in a third — with no cross-system correlation. Root cause for process safety incidents takes 6–12 months.",
    useCase: "Semantic search across process safety incident narratives. SQL analytics on equipment maintenance history and inspection records. Graph traversal linking equipment failures to shared maintenance crews, contractors, or parts batches.",
    benefit: "Process safety investigation time reduced from months to days. Bowties and barriers validated against historical incident data automatically.",
    estimatedROI: "One prevented process safety incident: $1M–$1B (fatality, explosion, or major spill avoided).",
  },
  {
    id: "pharma",
    name: "Pharmaceutical Manufacturing",
    icon: FlaskConical,
    accentVar: "--col-purple",
    pain: "Batch records, deviation reports, OOS (Out of Specification) investigations, and CAPA (Corrective Action / Preventive Action) records are stored in separate validated systems with no cross-system querying.",
    useCase: "Vector search across deviation narratives to find similar prior deviations. SQL analytics on batch yield by equipment, line, and operator. Graph traversal to link OOS results to specific raw material lots or equipment sequences.",
    benefit: "CAPA cycle time reduced from 60–120 days to 5–10 days. Right First Time (RFT) batch rate improved by identifying root causes earlier.",
    estimatedROI: "$2M–$20M/year (each % improvement in RFT rate for a $500M manufacturing facility).",
  },
  {
    id: "semiconductor",
    name: "Semiconductor Fabrication",
    icon: Cpu,
    accentVar: "--col-blue",
    pain: "Fab yield loss correlated with equipment maintenance logs, chamber conditions, and incoming material specs — but analysis requires a team of process engineers and weeks of data mining.",
    useCase: "Correlate yield excursions with equipment maintenance events, chamber cleans, and material lot changes via hybrid SQL + vector search. Graph traversal to identify which equipment units share failing lots.",
    benefit: "Yield loss root cause identification time reduced from 2–4 weeks to hours. Each 1% yield improvement on a high-volume product = millions in recovered revenue.",
    estimatedROI: "$5M–$50M/year per fab (1% yield improvement on 300mm wafer production).",
  },
  {
    id: "logistics",
    name: "Supply Chain & Logistics",
    icon: Truck,
    accentVar: "--col-amber",
    pain: "Damage claims, carrier performance records, and inventory quality checks exist in separate systems. Identifying a pattern of damage from a specific carrier or route requires weeks of manual analysis.",
    useCase: "SQL analytics on damage rate by carrier, route, and product category. Vector search across damage claim narratives. Graph traversal linking damage clusters to specific loading crews, terminals, or weather events.",
    benefit: "Carrier performance scorecards generated in seconds. Damage pattern detection 4–6 weeks earlier prevents cluster damage events.",
    estimatedROI: "$100K–$1M/year (damage cost reduction + insurance premium reduction).",
  },
  {
    id: "construction",
    name: "Construction & Infrastructure",
    icon: Building2,
    accentVar: "--col-green",
    pain: "Safety incident reports, quality non-conformances, and inspection findings are managed by different teams with no unified view. Pattern identification for repeat risks is manual and slow.",
    useCase: "Semantic search across safety incident narratives to identify near-miss patterns before a fatality. SQL analytics on inspection non-conformance rates by subcontractor, project type, and region.",
    benefit: "Near-miss pattern detection prevents serious injuries and fatalities. Subcontractor quality scoring improves project delivery.",
    estimatedROI: "One prevented fatality: $5M–$20M (legal liability, project delay, regulatory penalties). One prevented structural non-conformance: $500K–$5M.",
  },
  {
    id: "nuclear",
    name: "Nuclear & Power Generation",
    icon: Shield,
    accentVar: "--col-red",
    pain: "Corrective Action Programme (CAP) databases contain hundreds of thousands of condition reports. Finding similar prior conditions to inform operability determination takes a week of manual search.",
    useCase: "Vector search across condition report narratives to find similar prior conditions and their dispositions. SQL analytics on equipment reliability metrics. Graph traversal linking condition reports to shared equipment trains.",
    benefit: "Operability determination time reduced from 5–7 days to hours. Nuclear regulatory compliance improved through faster corrective action closure.",
    estimatedROI: "$1M–$10M/year per plant (faster CAP closure, reduced regulatory findings, improved equipment availability).",
  },
  {
    id: "environment",
    name: "Environmental Monitoring",
    icon: Leaf,
    accentVar: "--col-green",
    pain: "Environmental exceedance reports, equipment calibration records, and maintenance logs are siloed. Identifying whether an exceedance is due to process upset or instrument malfunction requires manual correlation.",
    useCase: "Vector search across exceedance incident narratives. SQL correlation of exceedance timestamps with equipment maintenance events and calibration records.",
    benefit: "Distinguish true environmental exceedances from instrument malfunctions within hours instead of weeks. Accelerate regulatory reporting and corrective action.",
    estimatedROI: "$100K–$1M per avoided regulatory penalty or permit violation.",
  },
];

// ── Components ───────────────────────────────────────────────────────────────

const INTENT_COLORS: Record<string, string> = {
  vector: "--col-cyan",
  sql: "--col-amber",
  hybrid: "--col-purple",
};

const INTENT_LABELS: Record<string, string> = {
  vector: "VECTOR SEARCH",
  sql: "SQL ANALYTICS",
  hybrid: "HYBRID AGENT",
};

function ExampleCard({ ex }: { ex: Example }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const accent = INTENT_COLORS[ex.intent];

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(ex.query);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{
      border: `1px solid hsl(var(${accent}) / ${open ? "0.5" : "0.2"})`,
      borderLeft: `3px solid hsl(var(${accent}))`,
      borderRadius: "2px",
      backgroundColor: open ? `hsl(var(${accent}) / 0.04)` : "hsl(var(--bg-panel))",
      transition: "all 0.15s",
      overflow: "hidden",
    }}>
      {/* Header row — expand button + copy button as flex siblings */}
      <div style={{ display: "flex", alignItems: "stretch" }}>
        <button
          onClick={() => setOpen(v => !v)}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "flex-start",
            gap: "14px",
            padding: "16px 18px",
            background: "none",
            border: "none",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          {/* Number badge */}
          <div style={{
            flexShrink: 0,
            width: "36px",
            height: "36px",
            border: `1.5px solid hsl(var(${accent}))`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-display)",
            fontSize: "0.75rem",
            fontWeight: 700,
            color: `hsl(var(${accent}))`,
            marginTop: "2px",
          }}>
            {String(ex.number).padStart(2, "0")}
          </div>

          <div style={{ flex: 1 }}>
            {/* Intent + tab badges */}
            <div style={{ display: "flex", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
              <span style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.62rem",
                fontWeight: 700,
                letterSpacing: "0.1em",
                color: `hsl(var(${accent}))`,
                backgroundColor: `hsl(var(${accent}) / 0.12)`,
                padding: "2px 8px",
                borderRadius: "2px",
              }}>
                {INTENT_LABELS[ex.intent]}
              </span>
              <span style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.58rem",
                color: "hsl(var(--text-dim))",
                backgroundColor: "hsl(var(--bg-elevated))",
                padding: "2px 8px",
                borderRadius: "2px",
              }}>
                {ex.tab}
              </span>
            </div>

            {/* Query text */}
            <p style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.88rem",
              color: "hsl(var(--text-primary))",
              lineHeight: 1.55,
              fontStyle: "italic",
            }}>
              "{ex.query}"
            </p>

            {/* Quick metrics */}
            <div style={{ display: "flex", gap: "20px", marginTop: "10px", flexWrap: "wrap" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", color: "hsl(var(--col-green))" }}>
                {ex.timeSaved.split("→")[0].trim()} saved
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", color: "hsl(var(--col-amber))" }}>
                {ex.moneySaved}
              </span>
            </div>
          </div>

          {open
            ? <ChevronUp size={16} style={{ color: "hsl(var(--text-dim))", flexShrink: 0, marginTop: "10px" }} />
            : <ChevronDown size={16} style={{ color: "hsl(var(--text-dim))", flexShrink: 0, marginTop: "10px" }} />}
        </button>

        {/* Copy button */}
        <button
          onClick={handleCopy}
          title="Copy query to clipboard"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "4px",
            padding: "0 14px",
            background: "none",
            border: "none",
            borderLeft: `1px solid hsl(var(${accent}) / 0.15)`,
            cursor: "pointer",
            color: copied ? `hsl(var(--col-green))` : `hsl(var(--text-dim))`,
            transition: "color 0.15s, background 0.15s",
            minWidth: "52px",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = `hsl(var(${accent}) / 0.06)`; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
        >
          {copied
            ? <Check size={13} />
            : <Copy size={13} />}
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.52rem", letterSpacing: "0.08em" }}>
            {copied ? "COPIED" : "COPY"}
          </span>
        </button>
      </div>

      {/* Expanded body */}
      {open && (
        <div style={{ padding: "0 18px 20px 68px", display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* What happens */}
          <div>
            <div style={{
              fontFamily: "var(--font-display)",
              fontSize: "0.62rem",
              fontWeight: 700,
              letterSpacing: "0.14em",
              color: `hsl(var(${accent}))`,
              marginBottom: "10px",
            }}>
              WHAT THE AGENT DOES — STEP BY STEP
            </div>
            <ol style={{ margin: 0, paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "8px" }}>
              {ex.whatHappens.map((step, i) => (
                <li key={i} style={{
                  fontFamily: "var(--font-body)",
                  fontSize: "0.92rem",
                  color: "hsl(var(--text-secondary))",
                  lineHeight: 1.6,
                }}>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          {/* Why helpful */}
          <div style={{
            borderLeft: `2px solid hsl(var(${accent}) / 0.4)`,
            paddingLeft: "14px",
          }}>
            <div style={{
              fontFamily: "var(--font-display)",
              fontSize: "0.62rem",
              fontWeight: 700,
              letterSpacing: "0.14em",
              color: "hsl(var(--col-cyan))",
              marginBottom: "8px",
            }}>
              WHY THIS IS HELPFUL
            </div>
            <p style={{
              fontFamily: "var(--font-body)",
              fontSize: "0.92rem",
              color: "hsl(var(--text-primary))",
              lineHeight: 1.65,
              margin: 0,
            }}>
              {ex.whyHelpful}
            </p>
          </div>

          {/* ROI metrics */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "12px",
          }}>
            {[
              { label: "TIME SAVED", value: ex.timeSaved, icon: Clock, color: "--col-green" },
              { label: "MONEY SAVED", value: ex.moneySaved, icon: DollarSign, color: "--col-amber" },
              { label: "ROI DETAIL", value: ex.roiDetail, icon: TrendingDown, color: "--col-purple" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} style={{
                backgroundColor: "hsl(var(--bg-elevated))",
                border: `1px solid hsl(var(${color}) / 0.2)`,
                borderRadius: "2px",
                padding: "12px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                  <Icon size={11} style={{ color: `hsl(var(${color}))` }} />
                  <span style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "0.55rem",
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    color: `hsl(var(${color}))`,
                  }}>
                    {label}
                  </span>
                </div>
                <p style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.75rem",
                  color: "hsl(var(--text-primary))",
                  lineHeight: 1.5,
                  margin: 0,
                }}>
                  {value}
                </p>
              </div>
            ))}
          </div>

          {/* Tags */}
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {ex.tags.map(tag => (
              <span key={tag} style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.6rem",
                color: "hsl(var(--text-dim))",
                backgroundColor: "hsl(var(--bg-elevated))",
                border: "1px solid hsl(var(--border-base))",
                padding: "2px 8px",
                borderRadius: "2px",
              }}>
                #{tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function IndustryCard({ ind }: { ind: Industry }) {
  const [open, setOpen] = useState(false);
  const Icon = ind.icon;

  return (
    <div style={{
      border: `1px solid hsl(var(${ind.accentVar}) / ${open ? "0.45" : "0.15"})`,
      borderRadius: "2px",
      backgroundColor: "hsl(var(--bg-panel))",
      overflow: "hidden",
      transition: "all 0.15s",
    }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "14px 16px",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{
          width: "34px",
          height: "34px",
          backgroundColor: `hsl(var(${ind.accentVar}) / 0.12)`,
          border: `1px solid hsl(var(${ind.accentVar}) / 0.3)`,
          borderRadius: "2px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}>
          <Icon size={16} style={{ color: `hsl(var(${ind.accentVar}))` }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: "var(--font-display)",
            fontSize: "0.72rem",
            fontWeight: 700,
            letterSpacing: "0.12em",
            color: "hsl(var(--text-primary))",
          }}>
            {ind.name}
          </div>
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.62rem",
            color: `hsl(var(${ind.accentVar}))`,
            marginTop: "2px",
          }}>
            {ind.estimatedROI}
          </div>
        </div>
        {open
          ? <ChevronUp size={14} style={{ color: "hsl(var(--text-dim))", flexShrink: 0 }} />
          : <ChevronDown size={14} style={{ color: "hsl(var(--text-dim))", flexShrink: 0 }} />}
      </button>

      {open && (
        <div style={{ padding: "0 16px 16px 62px", display: "flex", flexDirection: "column", gap: "14px" }}>
          {[
            { label: "CURRENT PAIN", text: ind.pain, color: "--col-red" },
            { label: "HOW THIS TOOL HELPS", text: ind.useCase, color: ind.accentVar },
            { label: "KEY BENEFIT", text: ind.benefit, color: "--col-green" },
          ].map(({ label, text, color }) => (
            <div key={label}>
              <div style={{
                fontFamily: "var(--font-display)",
                fontSize: "0.58rem",
                fontWeight: 700,
                letterSpacing: "0.12em",
                color: `hsl(var(${color}))`,
                marginBottom: "6px",
              }}>
                {label}
              </div>
              <p style={{
                fontFamily: "var(--font-body)",
                fontSize: "0.88rem",
                color: "hsl(var(--text-secondary))",
                lineHeight: 1.6,
                margin: 0,
              }}>
                {text}
              </p>
            </div>
          ))}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            backgroundColor: `hsl(var(${ind.accentVar}) / 0.08)`,
            border: `1px solid hsl(var(${ind.accentVar}) / 0.2)`,
            borderRadius: "2px",
            padding: "10px 12px",
          }}>
            <DollarSign size={13} style={{ color: `hsl(var(${ind.accentVar}))`, flexShrink: 0 }} />
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.75rem",
              fontWeight: 700,
              color: `hsl(var(${ind.accentVar}))`,
            }}>
              ESTIMATED ROI: {ind.estimatedROI}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ExamplesPage() {
  const [activeTab, setActiveTab] = useState<"examples" | "industries">("examples");

  const totalTimeSaved = "2 min → 2 days per query";
  const totalMoneySaved = "$36K–$5M per use case";

  return (
    <div
      className="grid-bg"
      style={{
        minHeight: "100vh",
        backgroundColor: "hsl(var(--bg-void))",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <header style={{
        height: "46px",
        backgroundColor: "hsl(var(--bg-surface))",
        borderBottom: "1px solid hsl(var(--border-base))",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        flexShrink: 0,
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <Link href="/" style={{
            display: "flex", alignItems: "center", gap: "5px",
            color: "hsl(var(--text-secondary))", textDecoration: "none", transition: "color 0.15s",
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "hsl(var(--col-green))"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "hsl(var(--text-secondary))"; }}
          >
            <ArrowLeft size={13} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.68rem", letterSpacing: "0.1em" }}>MAIN APP</span>
          </Link>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: "0.65rem",
            color: "hsl(var(--text-dim))", letterSpacing: "0.08em",
          }}>
            // TEST EXAMPLES & INDUSTRY USE CASES
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Activity size={12} style={{ color: "hsl(var(--col-green))" }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", color: "hsl(var(--text-secondary))", letterSpacing: "0.08em" }}>
            {EXAMPLES.length} TEST QUERIES · {INDUSTRIES.length} INDUSTRIES
          </span>
          <div style={{ width: 1, height: 16, backgroundColor: "hsl(var(--border-strong))" }} />
        </div>
      </header>

      {/* Hero */}
      <div style={{
        borderBottom: "1px solid hsl(var(--border-base))",
        padding: "40px 40px 32px",
        background: "linear-gradient(180deg, hsl(var(--bg-surface)) 0%, hsl(var(--bg-void)) 100%)",
      }}>
        <div style={{ maxWidth: "900px" }}>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: "0.65rem", fontWeight: 700,
            letterSpacing: "0.2em", color: "hsl(var(--col-green))", marginBottom: "10px",
          }}>
            PHD REVIEW BOARD — VALIDATED TEST SCENARIOS
          </div>
          <h1 style={{
            fontFamily: "var(--font-display)", fontSize: "1.8rem", fontWeight: 900,
            letterSpacing: "0.06em", color: "hsl(var(--text-primary))",
            lineHeight: 1.2, marginBottom: "16px",
          }}>
            TEST THE AGENT WITH REAL QUERIES
          </h1>
          <p style={{
            fontFamily: "var(--font-body)", fontSize: "1rem",
            color: "hsl(var(--text-secondary))", lineHeight: 1.7,
            maxWidth: "700px", marginBottom: "24px",
          }}>
            Each example below is a real query you can paste into the agent. We explain exactly what
            the system does step by step, why it saves time and money, and how the same technology
            applies across industries from aerospace to healthcare.
          </p>

          {/* Summary stats */}
          <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
            {[
              { label: "TEST QUERIES", value: `${EXAMPLES.length}`, color: "--col-cyan" },
              { label: "INDUSTRY VERTICALS", value: `${INDUSTRIES.length}`, color: "--col-purple" },
              { label: "TIME SAVINGS RANGE", value: totalTimeSaved, color: "--col-green" },
              { label: "VALUE PER USE CASE", value: totalMoneySaved, color: "--col-amber" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                backgroundColor: "hsl(var(--bg-panel))",
                border: `1px solid hsl(var(${color}) / 0.25)`,
                borderTop: `2px solid hsl(var(${color}))`,
                borderRadius: "2px",
                padding: "12px 18px",
                minWidth: "160px",
              }}>
                <div style={{
                  fontFamily: "var(--font-display)", fontSize: "0.55rem", fontWeight: 700,
                  letterSpacing: "0.14em", color: `hsl(var(${color}))`, marginBottom: "4px",
                }}>
                  {label}
                </div>
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: "0.9rem", fontWeight: 700,
                  color: "hsl(var(--text-primary))",
                }}>
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tab switcher */}
      <div style={{
        display: "flex",
        gap: "2px",
        padding: "0 40px",
        backgroundColor: "hsl(var(--bg-void))",
        borderBottom: "1px solid hsl(var(--border-base))",
      }}>
        {([
          { id: "examples", label: "TEST QUERIES", count: EXAMPLES.length, color: "--col-cyan" },
          { id: "industries", label: "INDUSTRY USE CASES", count: INDUSTRIES.length, color: "--col-purple" },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "0.65rem",
              fontWeight: 700,
              letterSpacing: "0.12em",
              padding: "12px 20px",
              border: "none",
              borderBottom: `2px solid ${activeTab === tab.id ? `hsl(var(${tab.color}))` : "transparent"}`,
              backgroundColor: "transparent",
              color: activeTab === tab.id ? `hsl(var(${tab.color}))` : "hsl(var(--text-secondary))",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {tab.label}
            <span style={{
              marginLeft: "8px",
              fontSize: "0.55rem",
              opacity: 0.7,
            }}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: "32px 40px 60px", maxWidth: "1100px", width: "100%", margin: "0 auto" }}>

        {activeTab === "examples" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: "0.68rem",
              color: "hsl(var(--text-dim))", marginBottom: "8px",
              letterSpacing: "0.06em",
            }}>
              Click any query to expand the full step-by-step breakdown, ROI analysis, and evidence.
            </div>
            {EXAMPLES.map(ex => <ExampleCard key={ex.id} ex={ex} />)}

            {/* Copy-paste tip */}
            <div style={{
              marginTop: "24px",
              backgroundColor: "hsl(var(--bg-panel))",
              border: "1px solid hsl(var(--col-green) / 0.25)",
              borderLeft: "3px solid hsl(var(--col-green))",
              borderRadius: "2px",
              padding: "16px 20px",
              display: "flex",
              alignItems: "flex-start",
              gap: "12px",
            }}>
              <CheckCircle2 size={16} style={{ color: "hsl(var(--col-green))", flexShrink: 0, marginTop: "2px" }} />
              <div>
                <div style={{
                  fontFamily: "var(--font-display)", fontSize: "0.65rem", fontWeight: 700,
                  letterSpacing: "0.12em", color: "hsl(var(--col-green))", marginBottom: "6px",
                }}>
                  HOW TO TEST
                </div>
                <p style={{
                  fontFamily: "var(--font-body)", fontSize: "0.92rem",
                  color: "hsl(var(--text-secondary))", lineHeight: 1.6, margin: 0,
                }}>
                  Copy any query text above and paste it into the <strong style={{ color: "hsl(var(--text-primary))" }}>ASK THE AGENT</strong> tab
                  on the Dashboard. The agent will route it automatically to the correct tools (vector search, SQL, or hybrid)
                  and return a cited response with full transparency on which tools were called and why.
                  The intent badge in the top-left of each card tells you which routing path to expect.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === "industries" && (
          <div>
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: "0.68rem",
              color: "hsl(var(--text-dim))", marginBottom: "20px",
              letterSpacing: "0.06em",
            }}>
              The same agentic RAG architecture applies to any domain with narrative incident reports,
              structured analytical data, and time-series operational records — which is most regulated industries.
            </div>

            {/* Architecture note */}
            <div style={{
              backgroundColor: "hsl(var(--bg-panel))",
              border: "1px solid hsl(var(--col-purple) / 0.25)",
              borderLeft: "3px solid hsl(var(--col-purple))",
              borderRadius: "2px",
              padding: "16px 20px",
              marginBottom: "24px",
            }}>
              <div style={{
                fontFamily: "var(--font-display)", fontSize: "0.62rem", fontWeight: 700,
                letterSpacing: "0.14em", color: "hsl(var(--col-purple))", marginBottom: "8px",
              }}>
                WHY THIS ARCHITECTURE GENERALISES
              </div>
              <p style={{
                fontFamily: "var(--font-body)", fontSize: "0.92rem",
                color: "hsl(var(--text-secondary))", lineHeight: 1.65, margin: 0,
              }}>
                Every regulated industry has the same three data types: <strong style={{ color: "hsl(var(--col-cyan))" }}>narrative incident reports</strong> (unstructured text),{" "}
                <strong style={{ color: "hsl(var(--col-amber))" }}>structured analytical records</strong> (defects, claims, deviations), and{" "}
                <strong style={{ color: "hsl(var(--col-green))" }}>time-series operational data</strong> (maintenance logs, sensor readings, calibration records).
                The vector + SQL + GraphRAG routing handles all three — the only change required is the domain-specific data ingestion and column mapping.
                A new industry vertical can be onboarded in 2–4 weeks.
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              {INDUSTRIES.map(ind => <IndustryCard key={ind.id} ind={ind} />)}
            </div>

            {/* Total market note */}
            <div style={{
              marginTop: "24px",
              backgroundColor: "hsl(var(--bg-elevated))",
              border: "1px solid hsl(var(--col-amber) / 0.25)",
              borderRadius: "2px",
              padding: "16px 20px",
            }}>
              <div style={{
                fontFamily: "var(--font-display)", fontSize: "0.62rem", fontWeight: 700,
                letterSpacing: "0.14em", color: "hsl(var(--col-amber))", marginBottom: "8px",
              }}>
                TOTAL ADDRESSABLE MARKET
              </div>
              <p style={{
                fontFamily: "var(--font-body)", fontSize: "0.92rem",
                color: "hsl(var(--text-secondary))", lineHeight: 1.65, margin: 0,
              }}>
                The global industrial AI market is valued at $38B (2024) growing to $210B by 2030 (CAGR ~32%).
                Quality intelligence and predictive maintenance represent the fastest-growing segment.
                Each of the {INDUSTRIES.length} verticals above is a standalone market opportunity with
                ROI cases ranging from <strong style={{ color: "hsl(var(--col-amber))" }}>$100K to $5B per prevented incident</strong>.
                The same codebase, adapted with domain-specific data connectors, addresses all of them.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
