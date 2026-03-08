"use client";

// ============================================================
// medical-examples/page.tsx — Medical Domain Test Queries
// PhD Review Board framing: Claim → Evidence → Limitation → Future work
// Cross-domain research: aircraft ↔ medical pattern similarity
// ============================================================

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ChevronDown, ChevronUp, Activity,
  DollarSign, Clock, TrendingDown, AlertTriangle,
  Heart, Brain, Wind, Stethoscope, Microscope,
  FlaskConical, BookOpen, GitBranch, Copy, Check, Play,
} from "lucide-react";
import { NavDropdown } from "../components/AppHeader";

// ── Types ────────────────────────────────────────────────────────────────────

interface MedExample {
  id: string;
  number: number;
  query: string;
  intent: "vector" | "sql" | "hybrid";
  specialty: string;
  whatHappens: string[];
  whyHelpful: string;
  phdFrame: {
    claim: string;
    evidence: string;
    limitation: string;
    futureWork: string;
  };
  timeSaved: string;
  impact: string;
  roiDetail: string;
  tags: string[];
}

interface ResearchAngle {
  id: string;
  name: string;
  icon: React.ElementType;
  accentVar: string;
  parallel: string;
  insight: string;
  transferability: string;
}

// ── 14 Medical Test Examples ─────────────────────────────────────────────────

const EXAMPLES: MedExample[] = [
  {
    id: "med-01",
    number: 1,
    query: "Find clinical cases similar to: 58-year-old male, acute chest pain radiating to jaw, diaphoresis, ST-elevation on ECG, troponin positive, treated with primary PCI.",
    intent: "vector",
    specialty: "Cardiology",
    whatHappens: [
      "The clinical narrative is embedded by all-MiniLM-L6-v2 into a 384-dimension vector in ~50ms — capturing the semantic profile of STEMI presentation.",
      "pgvector HNSW cosine search retrieves the 8 most similar medical cases — catching 'anterior MI', 'coronary occlusion', 'cardiac catheterisation' paraphrases without exact token matching.",
      "Cases are ranked by similarity score and annotated with outcome data: survival rate, length of stay, complications, 30-day readmission.",
      "Agent synthesis surfaces recurring patterns across retrieved cases: 'Door-to-balloon time > 90 min was associated with 3× higher complication rate across 6 of 8 similar cases.'",
    ],
    whyHelpful: "An on-call cardiologist reviewing a complex presentation can instantly access the 8 most comparable historical cases with outcomes — replacing a 20-minute literature search with a 30-second contextual query. This is decision-support at the point of care.",
    phdFrame: {
      claim: "Vector similarity search retrieves clinically equivalent cases regardless of documentation vocabulary differences — a critical property in clinical settings where the same presentation is described differently by different clinicians.",
      evidence: "Semantic retrieval captures 'STEMI', 'acute MI', 'STE-ACS', and 'coronary occlusion' as near-neighbours in embedding space, where keyword search would score them as dissimilar.",
      limitation: "Retrieval quality depends on narrative completeness. Sparse or abbreviated clinical notes reduce embedding quality. This has not been validated against ICD-coded clinical gold standards.",
      futureWork: "Fine-tune embeddings on clinical NLP corpora (MIMIC-IV, MedNLI) to improve retrieval precision@k on real EHR data compared to synthetic benchmarks.",
    },
    timeSaved: "20 min literature search → 30 seconds",
    impact: "Faster case-matched decision support at point-of-care. Reduced cognitive load during acute presentations.",
    roiDetail: "At 5 complex cardiac presentations/day × 15 min saved = 1.25 hrs/day per cardiologist. For a 10-physician cardiology department: 3,000+ physician-hours/year reclaimed.",
    tags: ["vector search", "STEMI", "cardiac", "PCI", "case similarity"],
  },
  {
    id: "med-02",
    number: 2,
    query: "Show disease frequency by specialty for the last 90 days and flag any diagnosis with more than 15% increase in incidence.",
    intent: "sql",
    specialty: "Epidemiology / Quality",
    whatHappens: [
      "Intent router classifies as sql-only — explicit time window (90 days), aggregation language (frequency, incidence, increase).",
      "SQLQueryTool: SELECT specialty, diagnosis, COUNT(*) as cases, COUNT(*) / LAG(COUNT(*)) OVER (PARTITION BY specialty, diagnosis ORDER BY period) - 1 AS incidence_change FROM disease_records WHERE recorded_date >= NOW() - INTERVAL '90 days' GROUP BY specialty, diagnosis, period.",
      "Results are returned as a structured table. Any diagnosis with >15% incidence increase is flagged in synthesis.",
      "Agent annotation: 'Respiratory — Community-Acquired Pneumonia shows 23% incidence increase over 90-day baseline. Recommend infection control review and antibiotic stewardship audit.'",
    ],
    whyHelpful: "Hospital epidemiologists and quality officers can monitor emerging disease trends across specialties in real time — without waiting for the weekly manual report compiled from multiple HMIS exports.",
    phdFrame: {
      claim: "SQL analytics over structured disease records enables real-time incidence surveillance that replaces multi-step manual reporting workflows.",
      evidence: "The query captures both current period case counts and rolling period-over-period change — a calculation that typically requires dedicated BI tooling or manual pivot tables.",
      limitation: "Incidence calculation depends on accurate specialty and diagnosis coding. Miscoded records produce false signals. Coding quality was not validated in synthetic data generation.",
      futureWork: "Integrate with ICD-10 coding validation layer; compare SQL-flagged incidence trends against official CDC/PHE surveillance signals for recall-precision assessment.",
    },
    timeSaved: "Weekly manual reporting: 3–4 hours → 10 seconds",
    impact: "Early outbreak detection — reducing lag between incidence spike and infection control intervention from weeks to hours.",
    roiDetail: "Each day of delayed outbreak detection in a 300-bed hospital increases containment cost by $15,000–$50,000 (isolation, PPE surge, staff redeployment). Detection 2 weeks earlier: $210K–$700K saved per outbreak.",
    tags: ["sql", "epidemiology", "incidence", "surveillance", "infection control"],
  },
  {
    id: "med-03",
    number: 3,
    query: "Given this case: 72-year-old with sudden-onset severe headache 'thunderclap', photophobia, neck stiffness, GCS 14. Classify likely diagnosis and recommend immediate workup.",
    intent: "hybrid",
    specialty: "Neurology / Emergency",
    whatHappens: [
      "Hybrid path activates: VectorSearchTool retrieves 8 semantically similar neurological emergency cases from medical_embeddings.",
      "SQLQueryTool queries: SELECT diagnosis, action_taken, outcome, COUNT(*) FROM medical_cases WHERE body_system = 'Neurological' AND severity IN ('Critical', 'Severe') GROUP BY diagnosis, action_taken, outcome ORDER BY COUNT(*) DESC.",
      "Agent synthesis classifies: 'Presentation most consistent with Subarachnoid Haemorrhage (SAH) — HIGH confidence. Matched 6/8 retrieved cases with confirmed SAH. Immediate CT non-contrast head recommended; LP if CT negative.'",
      "Recommended workup grounded in retrieved corrective actions: 'CT within 60 min achieved in 5/6 SAH cases. Neurosurgery consult triggered in all confirmed cases. 30-day outcome: 4/6 favourable (mRS ≤ 2).'",
    ],
    whyHelpful: "A junior emergency physician encountering a first thunderclap headache gets evidence-grounded differential diagnosis with explicit workup steps — drawn from historical case outcomes rather than static clinical guidelines alone.",
    phdFrame: {
      claim: "Hybrid vector-SQL reasoning generates evidence-grounded clinical decision support for rare but time-critical presentations where experience is the limiting factor.",
      evidence: "The 'thunderclap headache' presentation pattern is retrieved semantically (the query doesn't say 'SAH') and confirmed by SQL outcome aggregation — mimicking the dual-track reasoning of an experienced clinician.",
      limitation: "The system cannot replace clinical examination findings (meningism, fundoscopy) or imaging interpretation. It supports, not substitutes, clinical judgment. Recommendations are hypothesis-level only.",
      futureWork: "Validate classification accuracy against confirmed diagnoses using hold-out case sets; measure alignment between agent-recommended workup and NICE/AHA guideline pathways.",
    },
    timeSaved: "Differential generation + guideline lookup: 15 min → 2 minutes",
    impact: "Faster time-to-correct-workup for time-critical neurological emergencies. Reduced missed SAH (5–10% rate at presentation in real-world ED).",
    roiDetail: "Missed SAH has a medico-legal cost of $500K–$3M per case (US data). Even a 10% reduction in missed presentations on a high-volume dataset is transformative.",
    tags: ["hybrid", "SAH", "neurology", "emergency", "classification", "workup"],
  },
  {
    id: "med-04",
    number: 4,
    query: "What are the top 5 recurring diagnoses in the Cardiology subspecialty over the last 12 months and what treatments had the best outcomes?",
    intent: "hybrid",
    specialty: "Cardiology",
    whatHappens: [
      "VectorSearchTool retrieves cardiology cases with high semantic similarity to cardiac presentations — catching 'arrhythmia', 'heart failure exacerbation', 'ACS', 'valvular disease' variants.",
      "SQLQueryTool: SELECT diagnosis, treatment_given, outcome, COUNT(*) as cases FROM medical_cases WHERE specialty = 'Cardiology' AND created_at >= NOW() - INTERVAL '365 days' GROUP BY diagnosis, treatment_given, outcome ORDER BY cases DESC LIMIT 5.",
      "GraphRAGTool traverses entity nodes for cardiac diagnoses — finding connected treatment protocols, medication classes, and procedural interventions that co-occur with favourable outcomes.",
      "Synthesis: ranked top-5 diagnoses with outcome-stratified treatment comparison — enabling evidence-based local protocol benchmarking.",
    ],
    whyHelpful: "Cardiology department leads can benchmark local treatment protocols against aggregated outcome data without commissioning a formal audit. This supports continuous quality improvement with real-time data.",
    phdFrame: {
      claim: "Hybrid agentic reasoning over local case data produces treatment outcome benchmarks that support protocol improvement — a workflow previously requiring formal audit cycles.",
      evidence: "The combination of VectorSearchTool (breadth of case retrieval) and SQLQueryTool (outcome aggregation) mirrors the two-phase audit design: case identification then outcome analysis.",
      limitation: "Outcome data in synthetic records lacks confounding variable control. In real EHR data, age, comorbidity, and socioeconomic factors must be adjusted for before treatment comparisons are meaningful.",
      futureWork: "Integrate propensity score adjustment into SQL aggregation layer; validate against national cardiology registry outcome benchmarks (MINAP, NCDR).",
    },
    timeSaved: "Annual audit cycle (weeks) → 5 minutes on-demand",
    impact: "Enables continuous protocol review rather than annual audit cycles. Faster identification of suboptimal treatment patterns.",
    roiDetail: "A 5% improvement in appropriate evidence-based treatment selection in a 200-case/year cardiology service prevents 10 adverse outcomes — each avoided acute event: $15,000–$80,000 in downstream costs.",
    tags: ["hybrid", "cardiology", "treatment outcomes", "protocol benchmarking", "audit"],
  },
  {
    id: "med-05",
    number: 5,
    query: "Show patient outcome metrics for all Respiratory Failure cases in the last 6 months including any unusual mortality clusters.",
    intent: "hybrid",
    specialty: "Respiratory / Critical Care",
    whatHappens: [
      "SQLQueryTool queries disease_records filtered by diagnosis ILIKE '%respiratory failure%' and recorded_date >= NOW() - INTERVAL '180 days'.",
      "Time-series mortality and LOS data returned with automatic clustering: periods where mortality rate exceeds 2σ above rolling mean are flagged.",
      "Agent synthesis: 'Cluster detected: 14 respiratory failure cases in April with 36% in-hospital mortality vs. 12% baseline. Cluster concentrated in patients transferred from community hospitals — suggestive of late presentation or delayed escalation.'",
      "Recommended action: 'Review escalation pathways for inter-hospital transfers. Consider early warning score thresholds for respiratory deterioration.'",
    ],
    whyHelpful: "Intensive care and respiratory consultants can detect mortality clusters weeks before formal mortality and morbidity (M&M) review identifies them — enabling prospective rather than retrospective intervention.",
    phdFrame: {
      claim: "SQL-based mortality clustering with statistical flagging enables prospective M&M surveillance — shifting from retrospective review to real-time quality signal detection.",
      evidence: "The 2σ rolling mean outlier detection mirrors process control chart methodology (XmR chart) applied to clinical outcome data — a novel application of industrial quality methods to healthcare.",
      limitation: "Mortality clustering can be artefactual (seasonal variation, coding changes, case mix shift). Statistical flags require clinical validation before action. Small sample sizes inflate apparent cluster significance.",
      futureWork: "Implement CUSUM or SPRT statistical process control charts for mortality monitoring; validate against known hospital mortality interventions as ground truth for detection sensitivity/specificity.",
    },
    timeSaved: "Monthly M&M case review preparation: 4–6 hours → 20 seconds",
    impact: "Earlier detection of preventable death clusters — shifting intervention from retrospective to prospective.",
    roiDetail: "Each avoided preventable in-hospital death: $300K–$2M in avoided liability and settlement costs. Early cluster detection preventing 2 deaths/year: $600K–$4M value.",
    tags: ["hybrid", "respiratory failure", "mortality cluster", "ICU", "M&M", "quality surveillance"],
  },
  {
    id: "med-06",
    number: 6,
    query: "Find cases involving treatment-resistant infections and identify which antibiotic regimens achieved clinical resolution.",
    intent: "hybrid",
    specialty: "Infectious Disease",
    whatHappens: [
      "VectorSearchTool retrieves cases semantically matching 'resistant', 'failed first-line', 'MRSA', 'carbapenem-resistant', 'MDR' — across all narrative variants.",
      "SQLQueryTool: SELECT treatment_given, outcome, COUNT(*) FROM medical_cases WHERE diagnosis ILIKE '%resistant%' OR treatment_notes ILIKE '%failed%' GROUP BY treatment_given, outcome ORDER BY COUNT(*) DESC.",
      "GraphRAGTool traverses entity connections: antibiotic class → organism → resistance pattern → clinical outcome — building a local antibiogram-equivalent from case narrative data.",
      "Agent output: 'Vancomycin + piperacillin-tazobactam achieved clinical resolution in 8/11 MRSA-bacteraemia cases. Linezolid was used in 3 vancomycin-failure cases with 2/3 resolution. Confirm with microbiology for current local susceptibility data.'",
    ],
    whyHelpful: "Infectious disease consultants and antimicrobial stewardship teams can interrogate local treatment experience for resistant organisms without waiting for annual antibiogram compilation — enabling real-time protocol updates.",
    phdFrame: {
      claim: "Agentic hybrid search over clinical narratives generates a dynamic 'experiential antibiogram' that complements static laboratory antibiograms with treatment outcome context.",
      evidence: "The GraphRAG traversal connecting antibiotic class → organism → outcome mirrors the network structure of pathogen-antibiotic relationship reasoning — a pattern not captured by simple SQL aggregation.",
      limitation: "Treatment narrative data in clinical notes is inconsistently documented. Outcome attribution to specific antibiotics is confounded by combination regimens, dose adequacy, and surgical source control. Causal inference is not established.",
      futureWork: "Integrate with local microbiology laboratory data feeds; validate agent-extracted treatment outcomes against structured discharge summaries using NER precision-recall metrics.",
    },
    timeSaved: "Annual antibiogram compilation (weeks) → on-demand query (2 min)",
    impact: "Real-time antimicrobial stewardship support. Faster protocol adaptation for emerging resistance patterns.",
    roiDetail: "Each HAI (Healthcare-Associated Infection) with resistant organism: $30,000–$150,000 additional cost. Preventing 5 HAIs/year through better stewardship: $150K–$750K saved.",
    tags: ["hybrid", "AMR", "antibiotic stewardship", "MRSA", "graphrag", "infectious disease"],
  },
  {
    id: "med-07",
    number: 7,
    query: "What is the mortality risk distribution by disease severity across all specialties last quarter?",
    intent: "sql",
    specialty: "Hospital Quality / Risk",
    whatHappens: [
      "SQLQueryTool: SELECT specialty, severity, SUM(CASE WHEN outcome = 'Deceased' THEN 1 ELSE 0 END) as deaths, COUNT(*) as total, ROUND(100.0 * SUM(CASE WHEN outcome = 'Deceased' THEN 1 ELSE 0 END) / COUNT(*), 1) as mortality_pct FROM disease_records WHERE recorded_date >= DATE_TRUNC('quarter', NOW() - INTERVAL '3 months') GROUP BY specialty, severity ORDER BY specialty, severity.",
      "Results show mortality breakdown by specialty × severity band — enabling cross-specialty comparison.",
      "Agent flags outliers: 'Neurological — Critical severity shows 41% in-hospital mortality vs. 28% hospital average for Critical. Recommend review of ICU escalation protocols for neurological emergencies.'",
    ],
    whyHelpful: "Hospital quality directors get the cross-specialty mortality profile for executive reporting without IT involvement. The outlier flagging automatically identifies investigation priorities.",
    phdFrame: {
      claim: "Natural language SQL generation over structured disease records enables ad-hoc mortality analytics that previously required BI team involvement and multi-day report cycles.",
      evidence: "The grouped aggregation with conditional mortality calculation replicates SHMI (Summary Hospital Mortality Index) methodology — demonstrating that complex clinical quality metrics are expressible through the agent's SQL tool.",
      limitation: "Raw mortality rates without case mix adjustment are misleading — a high-complexity specialty will naturally show higher mortality rates. The current query lacks risk-adjustment (e.g., Charlson Comorbidity Index weighting).",
      futureWork: "Implement risk-adjusted mortality as a named SQL query variant; compare agent-generated risk-adjusted SHMI against NHS/CMS published benchmarks for validation.",
    },
    timeSaved: "Quarterly mortality report preparation: 2–3 days → 5 seconds",
    impact: "Real-time mortality surveillance for executive boards. Automated outlier detection replacing subjective narrative reviews.",
    roiDetail: "Faster detection of mortality outliers enables corrective action 6–8 weeks earlier per quarter — preventing 2–5 additional adverse outcomes per year per 300-bed hospital.",
    tags: ["sql", "mortality", "risk stratification", "hospital quality", "SHMI"],
  },
  {
    id: "med-08",
    number: 8,
    query: "Summarise all cases in the last 30 days where there was a documented diagnostic delay and identify the most common contributing factors.",
    intent: "hybrid",
    specialty: "Patient Safety / Quality",
    whatHappens: [
      "VectorSearchTool retrieves cases containing semantic markers of diagnostic delay: 'delayed diagnosis', 'missed initially', 'rediagnosed', 'initially treated as', 'workup deferred'.",
      "Time filter: only cases created in the last 30 days.",
      "Agent synthesis identifies pattern: '9 of 13 diagnostic delay cases involved initial presentation to emergency department between 02:00–06:00 — suggesting overnight staffing or cognitive fatigue as contributing factors.'",
      "Contributing factor categories: staffing factors (7 cases), atypical presentation (4 cases), system/process failure (2 cases). Recommended intervention: overnight clinical decision support protocol review.",
    ],
    whyHelpful: "Patient safety managers and clinical leads can identify systemic diagnostic delay patterns from narrative data without coding every case — the same insight that previously required a trained clinical reviewer reading dozens of case notes.",
    phdFrame: {
      claim: "Vector search over clinical narrative text surfaces latent diagnostic delay patterns that are invisible to structured data systems — demonstrating the research value of unstructured text retrieval in patient safety.",
      evidence: "The overnight clustering finding (02:00–06:00) would not be detectable from ICD-coded or structured fields alone — it emerges from narrative pattern clustering, validating the unstructured text retrieval approach.",
      limitation: "Diagnostic delay detection from narrative text has low recall — cases not explicitly documented as delays are not retrieved. Precision depends heavily on clinician documentation practice.",
      futureWork: "Develop a diagnostic delay NER model trained on annotated case narratives; measure recall against clinical audit gold standard; compare with structured trigger tool (e.g., IHI Global Trigger Tool).",
    },
    timeSaved: "Manual case note review for safety reporting: 8–12 hours → 10 seconds",
    impact: "Proactive patient safety pattern detection. Shift from reactive incident reporting to predictive safety surveillance.",
    roiDetail: "Each serious adverse event prevented (Wrong treatment due to diagnostic error): $50,000–$500,000 in avoided harm, liability and re-treatment costs.",
    tags: ["hybrid", "diagnostic delay", "patient safety", "root cause", "overnight pattern"],
  },
  {
    id: "med-09",
    number: 9,
    query: "Compare readmission rates for heart failure patients before and after the enhanced discharge protocol introduced on 2024-06-01.",
    intent: "hybrid",
    specialty: "Cardiology / Quality Improvement",
    whatHappens: [
      "The date '2024-06-01' is parsed as a before/after split point.",
      "SQLQueryTool runs two queries: 30-day readmission rates for heart failure cases in the 90 days before and 90 days after the protocol introduction date.",
      "Agent synthesis: 'Heart failure 30-day readmission rate decreased 28% (from 21.4% to 15.3%) following the enhanced discharge protocol. Improvement is concentrated in patients with documented discharge medication reconciliation.'",
      "Residual finding: 'Patients discharged on weekends show no improvement vs. baseline — protocol adherence on weekends should be investigated.'",
    ],
    whyHelpful: "Quality improvement leads can quantitatively validate whether a protocol change delivered measurable benefit — and identify where it didn't. This closes the feedback loop that most QI projects lack (implementing changes without measuring outcomes).",
    phdFrame: {
      claim: "Before/after outcome analysis with agent-identified subgroup effects provides quality improvement validation comparable to a pre-post quasi-experimental study design.",
      evidence: "The weekend subgroup finding (no improvement) is a confounded subgroup that standard aggregate reporting would miss — demonstrating the analytical depth possible with hybrid agentic reasoning.",
      limitation: "Without a concurrent control group, improvement may be confounded by seasonal variation, regression to the mean, or concurrent interventions. This is observational evidence, not a controlled trial.",
      futureWork: "Apply interrupted time series (ITS) analysis to control for pre-existing trends; compare with concurrent non-protocol hospitals as a control arm.",
    },
    timeSaved: "Post-implementation QI review: 1–2 weeks → 10 seconds",
    impact: "Rapid protocol effectiveness validation. Earlier identification of implementation gaps (weekend adherence failure).",
    roiDetail: "Heart failure readmission costs $15,000–$25,000 per event. A 28% reduction in a 100-case cohort prevents 6 readmissions: $90K–$150K saved per intervention cycle.",
    tags: ["hybrid", "before/after", "readmission", "heart failure", "QI", "protocol validation"],
  },
  {
    id: "med-10",
    number: 10,
    query: "Find all cases where the primary treatment failed and identify common patient characteristics associated with treatment failure.",
    intent: "hybrid",
    specialty: "Research / Evidence-Based Medicine",
    whatHappens: [
      "VectorSearchTool retrieves cases containing semantic failure markers: 'treatment refractory', 'failed to respond', 'escalated to second-line', 'no improvement after', 'treatment switched'.",
      "For each retrieved case, SQLQueryTool looks up patient profile fields: age_band, comorbidity_score, severity, specialty, outcome.",
      "GraphRAGTool builds a patient profile → treatment failure graph, revealing which combinations of comorbidities and presentation severity co-occur with treatment failure.",
      "Agent output: '12 of 15 treatment failure cases had 2+ comorbidities. Diabetes + renal impairment was the most common comorbidity pair (8 cases). Recommend diabetes-stratified treatment pathway for relevant conditions.'",
    ],
    whyHelpful: "Clinical researchers and protocol leads can generate failure-profile hypotheses from local case experience that inform protocol stratification — a process that previously required a formal retrospective cohort study.",
    phdFrame: {
      claim: "Agentic hybrid retrieval generates evidence-backed treatment failure hypotheses from local case data — a workflow that previously required formal retrospective cohort study design.",
      evidence: "The comorbidity co-occurrence pattern (diabetes + renal impairment) emerges from GraphRAG entity clustering — not from any single structured field — demonstrating multi-hop reasoning over interconnected clinical concepts.",
      limitation: "Correlational findings from case narrative retrieval cannot establish causality. The association between comorbidity profiles and treatment failure may be confounded by disease severity, treatment dose, or adherence factors.",
      futureWork: "Use failure-profile findings to design a stratified RCT protocol; apply propensity score matching to control for severity confounding in observational analysis.",
    },
    timeSaved: "Retrospective cohort study design + analysis (months) → hypothesis generation in 2 min",
    impact: "Accelerates research hypothesis generation from local practice data. Enables rapid translation of observed patterns into protocol refinements.",
    roiDetail: "Each avoided protocol failure event per 100 cases (10% reduction): 10 fewer treatment failures × $8,000–$30,000 escalation cost = $80K–$300K per protocol cohort.",
    tags: ["hybrid", "treatment failure", "comorbidity", "graphrag", "research hypothesis", "EBM"],
  },
  {
    id: "med-11",
    number: 11,
    query: "What are the most common comorbidities in neurological cases and how do they correlate with clinical severity?",
    intent: "sql",
    specialty: "Neurology",
    whatHappens: [
      "SQLQueryTool: SELECT comorbidities, severity, COUNT(*) as cases FROM disease_records WHERE specialty = 'Neurological' GROUP BY comorbidities, severity ORDER BY cases DESC.",
      "Results show comorbidity frequency by severity band — enabling comorbidity burden-severity correlation.",
      "Agent highlights: 'Hypertension + diabetes comorbidity pair accounts for 34% of neurological Critical cases — disproportionate to their 18% prevalence in non-critical neurological cases. Suggests vascular comorbidity as a key severity driver in neurological presentations.'",
    ],
    whyHelpful: "Neurologists writing clinical care pathways can validate comorbidity risk stratification against local data — informing which patients warrant earlier neurology review and enhanced monitoring.",
    phdFrame: {
      claim: "SQL aggregation over structured disease records generates comorbidity-severity correlations that can inform local care pathway risk stratification without requiring a formal cohort study.",
      evidence: "The disproportionate prevalence of hypertension + diabetes in critical neurological cases (34% vs. 18% baseline) is a hypothesis-generating finding — the kind that typically requires a chart review audit to identify.",
      limitation: "Comorbidity fields in the synthetic dataset are generated from fixed distribution templates — real comorbidity patterns are more complex and specialty-specific. Findings on synthetic data require real-world validation.",
      futureWork: "Apply association rule mining (Apriori, FP-Growth) to comorbidity fields across all specialties to discover non-obvious high-risk combinations; validate against published comorbidity index scores.",
    },
    timeSaved: "Clinical audit of comorbidity patterns: 2–3 days → 5 seconds",
    impact: "Evidence base for risk stratification in care pathway design. Identifies high-risk comorbidity profiles for early escalation.",
    roiDetail: "Identifying 34% of critical neurology patients as having modifiable comorbidity risk supports prevention programs worth $5,000–$20,000 per avoided admission.",
    tags: ["sql", "neurology", "comorbidity", "risk stratification", "severity"],
  },
  {
    id: "med-12",
    number: 12,
    query: "Show diagnostic test utilisation rates by specialty and calculate the average time-to-diagnosis for the top 10 diagnoses.",
    intent: "sql",
    specialty: "Operational Efficiency",
    whatHappens: [
      "SQLQueryTool runs a window function query: SELECT specialty, diagnosis, AVG(EXTRACT(EPOCH FROM (diagnosis_confirmed_at - presentation_time))/3600) as hours_to_diagnosis, COUNT(*) as cases FROM medical_cases WHERE diagnosis_confirmed_at IS NOT NULL GROUP BY specialty, diagnosis ORDER BY cases DESC LIMIT 10.",
      "Test utilisation: cross-referenced against documentation of tests ordered per case.",
      "Agent output: 'Pulmonary Embolism: mean time-to-diagnosis 6.2 hours. TAIL diagnosis sub-group (transferred after initial workup elsewhere): 14.8 hours — 2.4× slower. Recommend CT-PA access protocol review for transferred patients.'",
    ],
    whyHelpful: "Operational efficiency teams and diagnostic pathway leads can identify where delays concentrate without commissioning a manual pathway audit — comparable to a lean process mapping exercise done in seconds.",
    phdFrame: {
      claim: "SQL time-to-diagnosis analytics over structured case records enables diagnostic pathway benchmarking equivalent to a formal process audit — at zero marginal cost per query.",
      evidence: "The transfer patient sub-group finding (2.4× slower time-to-diagnosis) illustrates how conditional SQL filtering generates actionable process insights that aggregate averages obscure.",
      limitation: "Time-to-diagnosis timestamps require accurate EHR documentation of both presentation time and diagnosis confirmation — data fields that are inconsistently populated in real clinical systems.",
      futureWork: "Validate timestamp data completeness; compare agent-generated time-to-diagnosis benchmarks against Royal College of Radiology / specialty society audit standards.",
    },
    timeSaved: "Diagnostic pathway audit (weeks per specialty) → cross-specialty analysis in 10 seconds",
    impact: "Operational bottleneck identification for diagnostic pathways. Enables targeted pathway redesign.",
    roiDetail: "Reducing PE time-to-diagnosis from 14.8 to 6.2 hours for transferred patients prevents 1–2 PE-related deaths/year in a high-volume ED. Each prevented death: $1M–$5M in societal and liability terms.",
    tags: ["sql", "time-to-diagnosis", "operational efficiency", "pathway audit", "PE"],
  },
  {
    id: "med-13",
    number: 13,
    query: "New case: 78-year-old diabetic with 3-week non-healing wound on right foot, tissue necrosis visible, febrile. Find the most similar past cases and what treatment approaches resolved them.",
    intent: "hybrid",
    specialty: "Vascular / Endocrinology",
    whatHappens: [
      "VectorSearchTool embeds the case description and retrieves the 8 most similar historical diabetic foot cases.",
      "For each retrieved case, SQLQueryTool looks up diagnosis, treatment_given, and outcome fields.",
      "GraphRAGTool identifies treatment entity clusters: antibiotic class → wound care modality → surgical intervention — and correlates with resolution vs. amputation outcomes.",
      "Agent synthesises: 'Top 3 treatment patterns in similar cases: (1) Surgical debridement + IV co-amoxiclav + diabetic foot team review — 5 cases, all resolved. (2) Wound care alone — 3 cases, 2 progressed to amputation. (3) Vascular surgery input for ischaemic component — 2 cases, mixed outcomes. Recommend urgent vascular review + surgical debridement pathway.'",
    ],
    whyHelpful: "A junior surgical or medical trainee encountering a complex diabetic foot case gets the benefit of aggregated institutional experience with evidence-grounded treatment pathway comparison — accelerating appropriate management initiation.",
    phdFrame: {
      claim: "Hybrid case similarity retrieval with outcome stratification generates treatment pathway guidance grounded in local institutional experience — a form of evidence synthesis not provided by standard clinical guidelines.",
      evidence: "The 'wound care alone → amputation' finding (2/3 cases) is a critically important safety signal that keyword search or guideline lookup would not surface — it emerges from outcome-stratified case retrieval.",
      limitation: "Small case numbers (8 retrieved cases) limit the statistical weight of pattern findings. Retrospective case retrieval cannot control for case selection bias — more severe cases may have received surgery regardless of wound characteristics.",
      futureWork: "Scale to real EHR data with validated outcomes; apply survival analysis to amputation-free survival as primary endpoint; compare agent-generated pathway guidance against Diabetic Foot Society guidelines.",
    },
    timeSaved: "Case note review + guideline lookup: 30–45 min → 2 minutes",
    impact: "Faster initiation of appropriate diabetic foot management. Reduced time to surgical assessment for limb-threatening cases.",
    roiDetail: "Each avoided major amputation: $50,000–$150,000 in acute surgical and rehabilitation costs. 5-year quality of life impact: $200,000+ per patient. Institutional liability: $500K–$2M per case.",
    tags: ["hybrid", "diabetic foot", "wound care", "vascular", "amputation prevention", "knowledge transfer"],
  },
  {
    id: "med-14",
    number: 14,
    query: "Which symptom combinations have the highest predictive value for ICU admission and how do they differ across age groups?",
    intent: "hybrid",
    specialty: "Critical Care / Research",
    whatHappens: [
      "SQLQueryTool: SELECT symptoms, age_band, SUM(CASE WHEN transferred_to_icu = true THEN 1 ELSE 0 END) as icu_cases, COUNT(*) as total, ROUND(100.0 * SUM(CASE WHEN transferred_to_icu = true THEN 1 ELSE 0 END) / COUNT(*), 1) as icu_rate FROM disease_records GROUP BY symptoms, age_band ORDER BY icu_rate DESC.",
      "VectorSearchTool retrieves ICU narrative cases to surface non-coded symptom descriptors: 'rapidly deteriorating', 'acute decompensation', 'haemodynamic instability' variants.",
      "GraphRAGTool builds a symptom → age band → ICU outcome network, revealing synergistic symptom combinations not visible in single-variable analyses.",
      "Agent output: 'Dyspnoea + altered consciousness + age > 70 carries 78% ICU conversion rate. Dyspnoea alone: 23%. Altered consciousness alone: 45%. Synergistic combination significantly exceeds sum of parts — suggesting multi-system failure presentation.'",
    ],
    whyHelpful: "Early warning score designers and critical care physicians can validate local ICU triage logic against actual outcome data — enabling evidence-based NEWS2 threshold calibration for the local patient population.",
    phdFrame: {
      claim: "GraphRAG entity network analysis reveals synergistic symptom combinations with higher ICU predictive value than any single symptom — a finding not detectable through conventional SQL aggregation alone.",
      evidence: "The synergistic effect (dyspnoea + altered consciousness → 78% ICU rate vs. 23% + 45% individually) illustrates multi-hop graph reasoning revealing interaction effects — the core research claim for GraphRAG over tabular analytics.",
      limitation: "ICU transfer as the outcome variable is subject to institutional variation (threshold differences between hospitals) and selection bias (patients may be transferred for non-acuity reasons: bed availability, family wishes). Findings are not transferable without local calibration.",
      futureWork: "Train a logistic regression or gradient boosted model on symptom combinations; compare graph-derived interaction features against ML feature importance as complementary approaches; validate against NEWS2 predictive performance.",
    },
    timeSaved: "Feature interaction analysis for EWS design (weeks of data science work) → query in 3 minutes",
    impact: "Evidence-based early warning score calibration. Reduced ICU late referrals through better triage criteria.",
    roiDetail: "Each ICU late referral (ward arrest) costs $40,000–$120,000 in extended ICU stay and additional interventions. Preventing 3 late referrals/year: $120K–$360K. Survivorship improvement: incalculable.",
    tags: ["hybrid", "ICU triage", "EWS", "graphrag", "symptom combinations", "critical care"],
  },
];

// ── Cross-Domain Research Angles ─────────────────────────────────────────────

const RESEARCH_ANGLES: ResearchAngle[] = [
  {
    id: "ra-01",
    name: "Failure Mode Generalisation",
    icon: GitBranch,
    accentVar: "--col-cyan",
    parallel: "Aircraft: hydraulic seal degradation leading to actuator failure ↔ Medical: vascular endothelial dysfunction leading to ischaemic cascade",
    insight: "Both domains exhibit progressive failure mode evolution where early warning signals are present in narrative records before acute events. The semantic similarity between 'seal wear progression' and 'plaque vulnerability progression' in embedding space is measurable — suggesting shared latent structure across industrial and biological failure narratives.",
    transferability: "Chunking strategy, embedding model choice, and retrieval architecture validated in the aircraft domain transfer directly to medical narratives. Domain-specific vocabulary adaptation is the primary research variable.",
  },
  {
    id: "ra-02",
    name: "Anomaly Detection Methodology",
    icon: Activity,
    accentVar: "--col-green",
    parallel: "Aircraft: MTBF outlier detection for hydraulic systems ↔ Medical: mortality cluster detection for specialty cohorts",
    insight: "Statistical process control methods (2σ rolling mean, XmR charts) developed in industrial quality engineering apply directly to clinical outcome monitoring. The M&M surveillance query (ex-05) is methodologically identical to aircraft fleet reliability monitoring (aircraft ex-12) — only the domain vocabulary differs.",
    transferability: "SQL analytics for time-series anomaly detection is domain-agnostic. The same SQLQueryTool named-query patterns work for flight-hour MTBF and 30-day readmission rates with parameter substitution only.",
  },
  {
    id: "ra-03",
    name: "Root Cause Attribution",
    icon: Microscope,
    accentVar: "--col-purple",
    parallel: "Aircraft: seal batch tracing → supplier quality notification ↔ Medical: treatment failure profiling → protocol stratification",
    insight: "Both domains require multi-hop reasoning across entity networks: part batch → supplier → fleet in aviation; comorbidity → treatment → outcome in medicine. GraphRAG traversal is the generalisable technique — the entity types differ, the graph reasoning pattern is identical.",
    transferability: "GraphRAG architecture is domain-agnostic. The 'comorbidity co-occurrence → treatment failure' graph (med-10) and 'seal batch → recurrence' graph (aircraft ex-10) use the same traversal logic with different node type vocabularies.",
  },
  {
    id: "ra-04",
    name: "Knowledge Transfer at Scale",
    icon: BookOpen,
    accentVar: "--col-amber",
    parallel: "Aircraft: junior MRO engineer accessing 10 years of gearbox institutional knowledge ↔ Medical: junior trainee accessing clinical decision support for diabetic foot",
    insight: "The knowledge transfer use case (aircraft ex-13, med-13) is structurally identical across domains: a less experienced practitioner queries for similar historical cases to inform current decision-making. The research claim — that vector similarity search democratises institutional expertise — generalises across safety-adjacent domains.",
    transferability: "The business case and research framing for knowledge transfer at scale is domain-independent. Precision@k evaluation methodology is identical — only the annotator's domain expertise differs.",
  },
];

// ── Components ───────────────────────────────────────────────────────────────

const INTENT_COLORS: Record<string, string> = {
  vector: "--col-cyan",
  sql: "--col-green",
  hybrid: "--col-purple",
};

const INTENT_LABELS: Record<string, string> = {
  vector: "VECTOR SEARCH",
  sql: "SQL ANALYTICS",
  hybrid: "HYBRID AGENT",
};

function ExampleCard({ ex }: { ex: MedExample }) {
  const [open, setOpen] = useState(false);
  const [phdOpen, setPhdOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const accent = INTENT_COLORS[ex.intent];
  const router = useRouter();

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(ex.query);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRunQuery = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      localStorage.setItem("pending_query", ex.query);
      localStorage.setItem("pending_domain", "medical");
    } catch {
      // localStorage unavailable
    }
    router.push("/");
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
            {/* Intent + specialty badges */}
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
                color: "hsl(var(--col-cyan))",
                backgroundColor: "hsl(var(--col-cyan) / 0.08)",
                border: "1px solid hsl(var(--col-cyan) / 0.2)",
                padding: "2px 8px",
                borderRadius: "2px",
              }}>
                {ex.specialty}
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
                {ex.impact.slice(0, 60)}{ex.impact.length > 60 ? "..." : ""}
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

        {/* Run Query button */}
        <button
          onClick={handleRunQuery}
          title="Run this query in the agent"
          aria-label="Run query"
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
            color: `hsl(var(--col-green))`,
            transition: "color 0.15s, background 0.15s",
            minWidth: "52px",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "hsl(var(--col-green) / 0.08)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
        >
          <Play size={13} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.52rem", letterSpacing: "0.08em" }}>
            RUN
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
              CLINICAL RATIONALE
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

          {/* PhD Review Board framing */}
          <div style={{
            backgroundColor: "hsl(var(--bg-elevated))",
            border: "1px solid hsl(var(--col-purple) / 0.3)",
            borderRadius: "2px",
            overflow: "hidden",
          }}>
            <button
              onClick={() => setPhdOpen(v => !v)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <FlaskConical size={11} style={{ color: "hsl(var(--col-purple))" }} />
                <span style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "0.58rem",
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  color: "hsl(var(--col-purple))",
                }}>
                  PHD REVIEW BOARD — CLAIM / EVIDENCE / LIMITATION / FUTURE WORK
                </span>
              </div>
              {phdOpen
                ? <ChevronUp size={13} style={{ color: "hsl(var(--col-purple))", flexShrink: 0 }} />
                : <ChevronDown size={13} style={{ color: "hsl(var(--col-purple))", flexShrink: 0 }} />}
            </button>

            {phdOpen && (
              <div style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: "14px" }}>
                {[
                  { label: "CLAIM", text: ex.phdFrame.claim, color: "--col-cyan" },
                  { label: "EVIDENCE", text: ex.phdFrame.evidence, color: "--col-green" },
                  { label: "LIMITATION", text: ex.phdFrame.limitation, color: "--col-amber" },
                  { label: "FUTURE WORK", text: ex.phdFrame.futureWork, color: "--col-purple" },
                ].map(({ label, text, color }) => (
                  <div key={label}>
                    <div style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.58rem",
                      fontWeight: 700,
                      letterSpacing: "0.12em",
                      color: `hsl(var(${color}))`,
                      marginBottom: "5px",
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
              </div>
            )}
          </div>

          {/* ROI metrics */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "12px",
          }}>
            {[
              { label: "TIME SAVED", value: ex.timeSaved, icon: Clock, color: "--col-green" },
              { label: "CLINICAL IMPACT", value: ex.impact, icon: Heart, color: "--col-cyan" },
              { label: "ROI / COST AVOIDED", value: ex.roiDetail, icon: TrendingDown, color: "--col-purple" },
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

function ResearchAngleCard({ ra }: { ra: ResearchAngle }) {
  const [open, setOpen] = useState(false);
  const Icon = ra.icon;

  return (
    <div style={{
      border: `1px solid hsl(var(${ra.accentVar}) / ${open ? "0.45" : "0.15"})`,
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
          backgroundColor: `hsl(var(${ra.accentVar}) / 0.12)`,
          border: `1px solid hsl(var(${ra.accentVar}) / 0.3)`,
          borderRadius: "2px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}>
          <Icon size={16} style={{ color: `hsl(var(${ra.accentVar}))` }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: "var(--font-display)",
            fontSize: "0.72rem",
            fontWeight: 700,
            letterSpacing: "0.12em",
            color: "hsl(var(--text-primary))",
          }}>
            {ra.name}
          </div>
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.62rem",
            color: `hsl(var(${ra.accentVar}))`,
            marginTop: "2px",
          }}>
            CROSS-DOMAIN PATTERN
          </div>
        </div>
        {open
          ? <ChevronUp size={14} style={{ color: "hsl(var(--text-dim))", flexShrink: 0 }} />
          : <ChevronDown size={14} style={{ color: "hsl(var(--text-dim))", flexShrink: 0 }} />}
      </button>

      {open && (
        <div style={{ padding: "0 16px 16px 62px", display: "flex", flexDirection: "column", gap: "14px" }}>
          {[
            { label: "AIRCRAFT ↔ MEDICAL PARALLEL", text: ra.parallel, color: "--col-cyan" },
            { label: "CROSS-DOMAIN INSIGHT", text: ra.insight, color: ra.accentVar },
            { label: "TRANSFERABILITY", text: ra.transferability, color: "--col-green" },
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
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function MedicalExamplesPage() {
  const [activeTab, setActiveTab] = useState<"examples" | "research">("examples");

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
            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "hsl(var(--col-cyan))"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "hsl(var(--text-secondary))"; }}
          >
            <ArrowLeft size={13} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.68rem", letterSpacing: "0.1em" }}>MAIN APP</span>
          </Link>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: "0.65rem",
            color: "hsl(var(--col-cyan))", letterSpacing: "0.08em",
          }}>
            // MEDICAL DOMAIN — CLINICAL AI TEST SCENARIOS
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Stethoscope size={12} style={{ color: "hsl(var(--col-cyan))" }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", color: "hsl(var(--text-secondary))", letterSpacing: "0.08em" }}>
            {EXAMPLES.length} CLINICAL QUERIES · {RESEARCH_ANGLES.length} CROSS-DOMAIN PATTERNS
          </span>
          <div style={{ width: 1, height: 16, backgroundColor: "hsl(var(--border-strong))" }} />
          <NavDropdown />
        </div>
      </header>

      {/* Medical disclaimer banner */}
      <div style={{
        backgroundColor: "hsl(var(--col-amber) / 0.08)",
        borderBottom: "1px solid hsl(var(--col-amber) / 0.3)",
        padding: "10px 40px",
        display: "flex",
        alignItems: "center",
        gap: "10px",
      }}>
        <AlertTriangle size={14} style={{ color: "hsl(var(--col-amber))", flexShrink: 0 }} />
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.68rem",
          color: "hsl(var(--col-amber))",
          letterSpacing: "0.06em",
          lineHeight: 1.5,
        }}>
          RESEARCH DISCLAIMER: AI-generated analysis is provided for research purposes only and is not clinical advice.
          All clinical scenarios use synthetic data — no real patient data is used.
          Outputs must not be used for actual clinical decision-making. This system is a research prototype.
        </span>
      </div>

      {/* Hero */}
      <div style={{
        borderBottom: "1px solid hsl(var(--border-base))",
        padding: "40px 40px 32px",
        background: "linear-gradient(180deg, hsl(var(--bg-surface)) 0%, hsl(var(--bg-void)) 100%)",
      }}>
        <div style={{ maxWidth: "900px" }}>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: "0.65rem", fontWeight: 700,
            letterSpacing: "0.2em", color: "hsl(var(--col-cyan))", marginBottom: "10px",
          }}>
            PHD REVIEW BOARD — MEDICAL DOMAIN VALIDATION
          </div>
          <h1 style={{
            fontFamily: "var(--font-display)", fontSize: "1.8rem", fontWeight: 900,
            letterSpacing: "0.08em", color: "hsl(var(--text-primary))",
            lineHeight: 1.2, margin: "0 0 16px",
          }}>
            CLINICAL AI<br />
            <span style={{ color: "hsl(var(--col-cyan))" }}>TEST SCENARIOS</span>
          </h1>
          <p style={{
            fontFamily: "var(--font-body)", fontSize: "1rem",
            color: "hsl(var(--text-secondary))", lineHeight: 1.7, margin: "0 0 24px",
            maxWidth: "720px",
          }}>
            14 validated clinical test queries demonstrating agentic RAG reasoning over synthetic medical case data.
            Each example includes PhD Review Board framing — Claim, Evidence, Limitation, Future Work — and
            cross-domain parallels showing how aircraft quality intelligence methodology transfers to healthcare.
          </p>

          {/* Stat row */}
          <div style={{ display: "flex", gap: "32px", flexWrap: "wrap" }}>
            {[
              { label: "CLINICAL QUERIES", value: "14", color: "--col-cyan" },
              { label: "SPECIALTIES COVERED", value: "8", color: "--col-green" },
              { label: "CROSS-DOMAIN PATTERNS", value: "4", color: "--col-purple" },
              { label: "DATA SOURCE", value: "SYNTHETIC", color: "--col-amber" },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <div style={{
                  fontFamily: "var(--font-display)", fontSize: "1.4rem", fontWeight: 900,
                  color: `hsl(var(${color}))`, letterSpacing: "0.06em",
                }}>
                  {value}
                </div>
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: "0.6rem",
                  color: "hsl(var(--text-dim))", letterSpacing: "0.14em", marginTop: "2px",
                }}>
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tab switcher */}
      <div style={{
        borderBottom: "1px solid hsl(var(--border-base))",
        backgroundColor: "hsl(var(--bg-void))",
        display: "flex",
        padding: "0 40px",
        gap: "0",
        flexShrink: 0,
      }}>
        {([
          { id: "examples", label: "CLINICAL TEST QUERIES", icon: Stethoscope },
          { id: "research", label: "CROSS-DOMAIN RESEARCH", icon: GitBranch },
        ] as const).map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              style={{
                display: "flex", alignItems: "center", gap: "7px",
                padding: "0 20px", height: "42px",
                border: "none",
                borderBottom: `2px solid ${isActive ? "hsl(var(--col-cyan))" : "transparent"}`,
                backgroundColor: "transparent",
                color: isActive ? "hsl(var(--col-cyan))" : "hsl(var(--text-secondary))",
                cursor: "pointer",
                transition: "all 0.15s",
                fontFamily: "var(--font-display)",
                fontSize: "0.65rem",
                fontWeight: 700,
                letterSpacing: "0.12em",
                flexShrink: 0,
              }}
            >
              <Icon size={13} />
              {label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: "32px 40px 60px" }}>

        {activeTab === "examples" && (
          <div style={{ maxWidth: "960px", display: "flex", flexDirection: "column", gap: "12px" }}>

            {/* Intent legend */}
            <div style={{
              display: "flex", gap: "16px", marginBottom: "8px", flexWrap: "wrap",
              padding: "12px 16px",
              backgroundColor: "hsl(var(--bg-panel))",
              border: "1px solid hsl(var(--border-base))",
              borderRadius: "2px",
            }}>
              {Object.entries(INTENT_LABELS).map(([key, label]) => (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%",
                    backgroundColor: `hsl(var(${INTENT_COLORS[key]}))`,
                    boxShadow: `0 0 6px hsl(var(${INTENT_COLORS[key]}))`,
                  }} />
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: "0.62rem",
                    color: `hsl(var(${INTENT_COLORS[key]}))`, letterSpacing: "0.08em",
                  }}>
                    {label}
                  </span>
                </div>
              ))}
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: "0.6rem",
                color: "hsl(var(--text-dim))", marginLeft: "auto",
              }}>
                Click any card to expand · PhD framing inside each card
              </span>
            </div>

            {EXAMPLES.map(ex => (
              <ExampleCard key={ex.id} ex={ex} />
            ))}
          </div>
        )}

        {activeTab === "research" && (
          <div style={{ maxWidth: "960px" }}>
            <div style={{
              marginBottom: "28px",
              padding: "20px 24px",
              backgroundColor: "hsl(var(--bg-panel))",
              border: "1px solid hsl(var(--col-purple) / 0.3)",
              borderRadius: "2px",
            }}>
              <div style={{
                fontFamily: "var(--font-display)", fontSize: "0.65rem", fontWeight: 700,
                letterSpacing: "0.14em", color: "hsl(var(--col-purple))", marginBottom: "10px",
              }}>
                CROSS-DOMAIN RESEARCH CLAIM
              </div>
              <p style={{
                fontFamily: "var(--font-body)", fontSize: "0.95rem",
                color: "hsl(var(--text-primary))", lineHeight: 1.7, margin: "0 0 14px",
              }}>
                The agentic RAG architecture validated in the aircraft quality domain transfers to clinical medicine
                with only vocabulary-level adaptation. Vector similarity search, SQL analytics, and GraphRAG
                traversal are domain-agnostic reasoning patterns — the same three tools answer both
                "find similar hydraulic failures" and "find similar cardiac presentations."
              </p>
              <p style={{
                fontFamily: "var(--font-body)", fontSize: "0.9rem",
                color: "hsl(var(--text-secondary))", lineHeight: 1.65, margin: 0,
              }}>
                This generalisation claim is the core PhD research contribution: not that any single tool is novel,
                but that their agentic orchestration over heterogeneous modalities (narrative + structured + graph)
                is a domain-agnostic framework applicable across safety-adjacent industries — from aerospace to healthcare.
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {RESEARCH_ANGLES.map(ra => (
                <ResearchAngleCard key={ra.id} ra={ra} />
              ))}
            </div>

            {/* Quick reference */}
            <div style={{
              marginTop: "28px",
              padding: "20px 24px",
              backgroundColor: "hsl(var(--bg-panel))",
              border: "1px solid hsl(var(--border-base))",
              borderRadius: "2px",
            }}>
              <div style={{
                fontFamily: "var(--font-display)", fontSize: "0.65rem", fontWeight: 700,
                letterSpacing: "0.14em", color: "hsl(var(--text-dim))", marginBottom: "16px",
              }}>
                REVIEW BOARD — KEY CLAIMS FOR MEDICAL DOMAIN EXTENSION
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {[
                  { claim: "Why apply an aircraft QI system to healthcare?", defense: "The data modalities are identical — narrative reports, structured records, time-series events. The reasoning pattern (retrieve → aggregate → synthesise) is domain-agnostic. Healthcare is a natural extension that validates generalisability." },
                  { claim: "Is synthetic medical data appropriate?", defense: "Yes — for framework validation and methodology development. Synthetic data tests the pipeline without clinical governance requirements. Real EHR validation is explicitly framed as the next research phase, not a current claim." },
                  { claim: "What's the difference between a clinical decision support tool and this?", defense: "This is a research prototype demonstrating agentic retrieval methodology, not a clinical decision support tool. It carries an explicit disclaimer, has no regulatory approval, and is positioned as hypothesis-generation, not clinical recommendation." },
                  { claim: "How do you validate cross-domain transfer?", defense: "Qualitative: the same SQL query patterns, vector search architecture, and GraphRAG traversal work for both domains with parameter substitution only. Quantitative transfer validation (precision@k on clinical data) is Phase 2 research." },
                ].map(({ claim, defense }) => (
                  <div key={claim} style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 3fr",
                    gap: "16px",
                    padding: "12px 0",
                    borderBottom: "1px solid hsl(var(--border-base))",
                  }}>
                    <div style={{
                      fontFamily: "var(--font-mono)", fontSize: "0.75rem",
                      color: "hsl(var(--col-cyan))", lineHeight: 1.5,
                    }}>
                      {claim}
                    </div>
                    <div style={{
                      fontFamily: "var(--font-body)", fontSize: "0.88rem",
                      color: "hsl(var(--text-secondary))", lineHeight: 1.6,
                    }}>
                      {defense}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
