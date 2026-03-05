# med_prompt.md
# Claude Code Master Prompt — NextGenAI Dual-Domain PhD Research Framework
# Aircraft Maintenance + Clinical Medical Data
# Drop this file in your project root. Claude Code will read it on demand.
# Usage: "Read med_prompt.md and run PROMPT [N]"

---

## 🎯 PROJECT CONTEXT (Read This First)

This is a **PhD research project** — not just an app. The core research claim is:

> "A domain-agnostic agentic RAG framework generalizes across heterogeneous 
> enterprise knowledge domains — validated on industrial quality engineering 
> (aircraft maintenance) and clinical decision support (medical case analysis)."

**Architecture:** Next.js (App Router) + TypeScript + Claude API (tool use) +
ChromaDB (vector search) + SQLite (structured analytics) + Recharts (visualization)

**Two data domains — same pipeline, different configuration:**

| Layer          | Domain A: Aircraft               | Domain B: Medical                        |
|----------------|----------------------------------|------------------------------------------|
| Narratives     | Maintenance incident reports     | MACCROBAT clinical case reports          |
| Structured     | Defect records (existing data)   | Disease Symptoms & Patient Profile (CSV) |
| Time Series    | Maintenance logs / sensor data   | Patient vitals / weekly case trends      |
| Vector Store   | ChromaDB: "aircraft_incidents"   | ChromaDB: "medical_incidents"            |
| SQL Table      | defect_records                   | disease_records                          |
| Agent Persona  | Quality Engineering Assistant    | Clinical Intelligence Assistant          |

**Research evaluation metrics (both domains):**
- Precision@k (retrieval quality)
- Query latency (ms)
- Cost per query ($ tokens)
- Action/recommendation consistency (3-run stability)
- Cross-domain performance delta (the PhD contribution)

---

## PROMPT 0 — Domain Framework Architecture (Run This First)

```
Read med_prompt.md in my project root for full context.

I am building a dual-domain PhD research framework in my NextGenAI Next.js app.
The same agentic RAG pipeline must serve two completely separate data domains:
  Domain A: Aircraft Maintenance (already partially built)
  Domain B: Medical / Clinical Cases (new — to be added)

Before touching any data or UI, create the domain abstraction layer:

1. Create /lib/domains/types.ts — the DomainConfig interface:

   export interface DomainConfig {
     id: 'aircraft' | 'medical'
     label: string
     description: string
     
     // Vector store
     vectorCollection: string
     embeddingField: string        // which text field to embed
     
     // SQL
     tableName: string
     severityColumn: string
     categoryColumn: string        // defect_type | disease
     dateColumn: string
     
     // Agent
     systemPrompt: string
     agentPersona: string
     disclaimer: string
     
     // UI
     primaryColor: string          // Tailwind color class
     icon: string                  // emoji or lucide icon name
     narrativeLabel: string        // "Incident" | "Clinical Case"
     categoryLabel: string         // "Defect Type" | "Disease"
     severityLabel: string         // "Severity" | "Outcome"
     analyticsLabel: string        // "Defect Analytics" | "Disease Analytics"
     explorerLabel: string         // "Incident Explorer" | "Case Explorer"
   }

2. Create /lib/domains/aircraft.config.ts implementing DomainConfig for aircraft
3. Create /lib/domains/medical.config.ts implementing DomainConfig for medical
4. Create /lib/domains/index.ts exporting:
   - All configs in a DOMAIN_CONFIGS map
   - getActiveDomain(): DomainConfig (reads NEXT_PUBLIC_ACTIVE_DOMAIN env var)
   - isDomain(id): boolean
   - switchDomain(id): void (for client-side switching)

5. Create /lib/domains/domain-context.tsx — React context provider:
   - DomainProvider wrapping the app
   - useDomain() hook returning { domain, setDomain, config }
   - Persists selection to localStorage

6. Add domain selector UI to the dashboard header:
   Two toggle buttons: [✈ Aircraft] [🏥 Medical]
   Active domain highlighted. Switching reloads the agent and chart data.

This is the foundation everything else builds on. 
Confirm this compiles before proceeding.
```

---

## PROMPT 1 — TypeScript Types (Both Domains)

```
Read med_prompt.md for context. Run PROMPT 1.

Create /types/domains.ts with all shared and domain-specific types:

// ── SHARED TYPES (domain-agnostic) ─────────────────────────

export interface NarrativeRecord {
  id: string                    // "ARC-001" | "MAC-001"
  domain: 'aircraft' | 'medical'
  narrative: string             // full free-text content
  corrective_action: string     // what was done / treatment
  category: string              // defect_type | disease
  severity: 'Critical' | 'High' | 'Medium' | 'Low'
  system: string                // aircraft system | body system
  date: string                  // ISO date string
  entities: string[]            // extracted key terms / NER entities
  metadata: Record<string, unknown>
}

export interface StructuredRecord {
  id: number
  domain: 'aircraft' | 'medical'
  category: string              // defect_type | disease
  severity: string
  outcome: string
  age_or_cycle: number          // patient age | maintenance cycle number
  facility: string              // plant | hospital specialty
  week_recorded: string         // ISO week "2024-W12"
  attributes: Record<string, string | number | boolean>  // domain-specific fields
}

export interface SimilarRecord {
  id: string
  narrative: string
  similarity_score: number      // 0.0 - 1.0
  severity: string
  category: string
  system: string
  date: string
  entities: string[]
}

export interface AgentResponse {
  query: string
  domain: 'aircraft' | 'medical'
  similar_records: SimilarRecord[]
  reasoned_summary: string
  recommended_actions: RecommendedAction[]
  tool_calls: ToolCallTrace[]
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  disclaimer: string
  latency_ms: number
}

export interface RecommendedAction {
  action: string
  priority: 'Critical' | 'High' | 'Medium' | 'Low'
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  evidence: string[]            // IDs of supporting records
}

export interface ToolCallTrace {
  tool_name: string
  input: Record<string, unknown>
  output_summary: string
  latency_ms: number
}

export interface KPIData {
  totalRecords: number
  criticalCount: number
  criticalRate: number          // percentage
  topCategory: string
  avgMetric: number             // avg age (medical) | avg cycle (aircraft)
  recentTrend: 'up' | 'down' | 'stable'
}

export interface EvalResult {
  domain: 'aircraft' | 'medical'
  query_id: string
  query_text: string
  top_k: number
  precision_at_k: number
  latency_ms: number
  cost_usd: number
  relevant_ids: string[]
  returned_ids: string[]
  timestamp: string
}

// ── AIRCRAFT-SPECIFIC TYPES ────────────────────────────────

export interface AircraftIncident extends NarrativeRecord {
  domain: 'aircraft'
  part_number?: string
  aircraft_type?: string
  ata_chapter?: string          // ATA 100 chapter code
}

export interface DefectRecord extends StructuredRecord {
  domain: 'aircraft'
  attributes: {
    defect_type: string
    plant: string
    product: string
    inspection_type: string
  }
}

// ── MEDICAL-SPECIFIC TYPES ─────────────────────────────────

export interface MedicalCase extends NarrativeRecord {
  domain: 'medical'
  ner_labels?: string[]         // BIO tags from MACCROBAT
  ner_info?: Record<string, unknown>
  pubmed_id?: string
}

export interface DiseaseRecord extends StructuredRecord {
  domain: 'medical'
  attributes: {
    fever: boolean
    cough: boolean
    fatigue: boolean
    difficulty_breathing: boolean
    gender: 'Male' | 'Female'
    blood_pressure: 'Normal' | 'High'
    cholesterol_level: 'Normal' | 'High'
    outcome_variable: 'Positive' | 'Negative'
  }
}

All types use strict TypeScript. Export everything. 
Add JSDoc to every interface explaining its purpose.
Verify no circular imports.
```

---

## PROMPT 2 — Database Schema (Both Domains, One DB)

```
Read med_prompt.md for context. Run PROMPT 2.

Create /scripts/setup-database.ts that initializes SQLite at /data/nextgenai.db
with tables for BOTH domains in a single database.

Schema:

-- SHARED narrative index (both domains write here)
CREATE TABLE IF NOT EXISTS narrative_records (
  id TEXT PRIMARY KEY,                          -- "ARC-001" | "MAC-001"
  domain TEXT NOT NULL,                         -- "aircraft" | "medical"
  narrative TEXT NOT NULL,
  corrective_action TEXT,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  system TEXT NOT NULL,
  date TEXT NOT NULL,
  entities TEXT,                                -- JSON array string
  embedded INTEGER DEFAULT 0,                   -- 0=not embedded, 1=embedded
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_narr_domain   ON narrative_records(domain);
CREATE INDEX IF NOT EXISTS idx_narr_category ON narrative_records(category);
CREATE INDEX IF NOT EXISTS idx_narr_severity ON narrative_records(severity);

-- AIRCRAFT structured records
CREATE TABLE IF NOT EXISTS aircraft_defects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  defect_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  system TEXT,
  plant TEXT,
  product TEXT,
  inspection_type TEXT,
  week_recorded TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_adef_type     ON aircraft_defects(defect_type);
CREATE INDEX IF NOT EXISTS idx_adef_severity ON aircraft_defects(severity);
CREATE INDEX IF NOT EXISTS idx_adef_week     ON aircraft_defects(week_recorded);

-- MEDICAL structured records
CREATE TABLE IF NOT EXISTS disease_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  disease TEXT NOT NULL,
  fever INTEGER DEFAULT 0,
  cough INTEGER DEFAULT 0,
  fatigue INTEGER DEFAULT 0,
  difficulty_breathing INTEGER DEFAULT 0,
  age INTEGER,
  gender TEXT,
  blood_pressure TEXT,
  cholesterol_level TEXT,
  outcome TEXT,
  severity TEXT,
  specialty TEXT,
  week_recorded TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dis_disease   ON disease_records(disease);
CREATE INDEX IF NOT EXISTS idx_dis_severity  ON disease_records(severity);
CREATE INDEX IF NOT EXISTS idx_dis_specialty ON disease_records(specialty);
CREATE INDEX IF NOT EXISTS idx_dis_week      ON disease_records(week_recorded);

-- EVALUATION results (both domains)
CREATE TABLE IF NOT EXISTS eval_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL,
  query_id TEXT NOT NULL,
  query_text TEXT NOT NULL,
  top_k INTEGER,
  precision_at_k REAL,
  latency_ms INTEGER,
  cost_usd REAL,
  returned_ids TEXT,            -- JSON array
  timestamp TEXT DEFAULT CURRENT_TIMESTAMP
);

-- DATA INGESTION LOG
CREATE TABLE IF NOT EXISTS ingestion_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL,
  dataset_name TEXT NOT NULL,
  records_loaded INTEGER,
  records_embedded INTEGER,
  status TEXT,
  error TEXT,
  ran_at TEXT DEFAULT CURRENT_TIMESTAMP
);

After creating tables:
- Print table summary with row counts
- Export db connection as singleton from /lib/db.ts using better-sqlite3
- Export typed query helpers: getDb(), closeDb(), runMigration()

Install: better-sqlite3 @types/better-sqlite3
```

---

## PROMPT 3 — Ingest Aircraft Data

```
Read med_prompt.md for context. Run PROMPT 3.

Create /scripts/ingest-aircraft.ts to load existing aircraft maintenance data 
into the new unified database schema.

Check for data in these locations (in order):
  1. /data/aircraft/ folder — any CSV or JSON files present
  2. /data/maintenance_data.csv — common filename
  3. /data/defects.csv
  4. If NO data found: generate 150 realistic synthetic aircraft 
     maintenance records using these specifications:

SYNTHETIC DATA SPEC (use if no real data found):

  Defect types (weighted): 
    "Hydraulic Leak" 20%, "Avionics Fault" 15%, "Structural Crack" 12%,
    "Seal Degradation" 12%, "Corrosion" 10%, "Wiring Chafing" 10%,
    "Actuator Failure" 8%, "Fuel System Fault" 8%, "Other" 5%

  Aircraft systems:
    "Hydraulics", "Avionics", "Structural", "Fuel System", 
    "Landing Gear", "Flight Controls", "Environmental Control"

  Sample narratives (vary these with details):
    - "Hydraulic leak found near [component] during [inspection type]. 
       Suspected [cause]. [Action taken] and tested."
    - "Intermittent [fault type] in [system]. [Observation]. 
       Replaced [component] and [verification]."
    - "Corrosion found on [part] around [location]. 
       Treated and replaced. [Lot/batch] quarantined."

  Severity distribution: Critical 10%, High 25%, Medium 40%, Low 25%
  Date range: past 24 months, random distribution
  Plants: "Plant-A", "Plant-B", "Plant-C"
  Products: "A320", "A330", "B737", "B777", "Regional"

Transform all records to NarrativeRecord shape and insert into:
  - narrative_records table (for vector search)
  - aircraft_defects table (for SQL analytics)

Log results to ingestion_log table.
Print: records created, severity distribution, top 3 defect types.
```

---

## PROMPT 4 — Ingest MACCROBAT Medical Data

```
Read med_prompt.md for context. Run PROMPT 4.

Create /scripts/ingest-medical.ts to load MACCROBAT clinical data.

STEP A — Download MACCROBAT (create /scripts/download_maccrobat.py):

  from datasets import load_dataset
  import json, os
  
  os.makedirs("data/maccrobat", exist_ok=True)
  print("Downloading MACCROBAT from HuggingFace...")
  dataset = load_dataset("singh-aditya/MACCROBAT_biomedical_ner")
  records = []
  for i, row in enumerate(dataset['train']):
      records.append({
          "index": i,
          "full_text": row["full_text"],
          "tokens": row["tokens"],
          "ner_labels": row["ner_labels"],
          "ner_info": row["ner_info"]
      })
  with open("data/maccrobat/raw.json", "w") as f:
      json.dump(records, f, indent=2)
  print(f"Downloaded {len(records)} records to data/maccrobat/raw.json")

STEP B — Transform in /scripts/ingest-medical.ts:

Read /data/maccrobat/raw.json and transform each record:

  id: "MAC-" + String(index).padStart(3, "0")  → "MAC-001"
  
  narrative: full_text (the complete clinical case report)
  
  corrective_action: extract sentences containing treatment keywords:
    ["treated", "prescribed", "administered", "performed", "underwent",
     "resected", "ablated", "repaired", "replaced", "discharged",
     "started on", "initiated", "given", "received"]
    Join matched sentences. If none found, use last 2 sentences of full_text.
  
  entities: extract unique entity types from ner_labels:
    Remove B- and I- prefixes, deduplicate
    e.g. ["Sign_symptom", "Disease_disorder", "Medication", "Diagnostic_procedure"]
  
  severity: derive from entity types present:
    Critical → entities includes "Death" or text contains "emergency" or "critical"
    High     → entities includes "Disease_disorder" AND entity count ≥ 4
    Medium   → entities includes "Sign_symptom" 
    Low      → default
  
  system (body system): map from most common Disease_disorder entity:
    cardiac keywords: ["cardiac", "heart", "coronary", "atrial", "ventricular",
                       "palpitation", "arrhythmia", "murmur", "tricuspid"]
    respiratory: ["pulmonary", "lung", "respiratory", "bronchial", "pneumonia",
                  "dyspnea", "cough", "pleural"]
    neurological: ["neural", "brain", "cerebral", "spinal", "seizure",
                   "meningitis", "headache", "neurological"]
    gastrointestinal: ["gastric", "intestinal", "hepatic", "pancreatic",
                       "bowel", "colon", "liver", "esophageal"]
    musculoskeletal: ["bone", "joint", "muscle", "fracture", "arthritis",
                      "spinal", "vertebral", "tendon"]
    Default: "general"
  
  date: generate synthetic dates spread over last 24 months
  
  category: use primary disease entity if found, else "Unclassified"

STEP C — Insert into both tables:
  - narrative_records (domain='medical')
  - For each record also run disease profile extraction and insert 
    representative row into disease_records

STEP D — Ingest Disease Symptoms CSV:

  Read /data/disease-symptoms-patient-profile.csv
  (If file not present, print instructions: 
   "Download from kaggle.com/datasets/uom190346a/disease-symptoms-and-patient-profile-dataset
    and save to /data/disease-symptoms-patient-profile.csv")
  
  Transform each CSV row:
  - Convert "Yes"/"No" → 1/0 for symptom columns
  - Map Outcome "Positive" → severity "High", "Negative" → severity "Low"
  - Assign specialty based on disease name keyword matching:
      Cardiology, Pulmonology, Neurology, Gastroenterology, 
      Endocrinology, Dermatology, General Medicine
  - Generate synthetic week_recorded over last 52 weeks
  - Insert into disease_records table

Log all results to ingestion_log.
Print final summary table showing both domains loaded.
```

---

## PROMPT 5 — Dual Vector Store

```
Read med_prompt.md for context. Run PROMPT 5.

Create /lib/vector-store.ts — a unified vector store client supporting 
both domains with separate ChromaDB collections.

Install: chromadb

Architecture:
  Collection "aircraft_incidents" ← ARC-xxx records
  Collection "medical_incidents"  ← MAC-xxx records
  Both use the SAME embedding model for cross-domain comparability.

EMBEDDING MODEL (choose based on env var USE_LOCAL_EMBEDDINGS):
  
  If USE_LOCAL_EMBEDDINGS=true (default, free, no API key):
    import { pipeline } from '@xenova/transformers'
    model: "Xenova/all-MiniLM-L6-v2"   ← 384 dimensions
    Install: @xenova/transformers
  
  If USE_LOCAL_EMBEDDINGS=false (higher quality, costs money):
    OpenAI text-embedding-3-small       ← 1536 dimensions
    Requires: OPENAI_API_KEY env var

Export these functions:

  // Embed and upsert a batch of records into a domain collection
  export async function upsertRecords(
    domain: 'aircraft' | 'medical',
    records: NarrativeRecord[]
  ): Promise<{ success: number; failed: number }>

  // Search for similar records within a domain
  export async function searchSimilarRecords(
    domain: 'aircraft' | 'medical',
    query: string,
    topK: number = 5,
    filters?: {
      severity?: string
      system?: string
      category?: string
      dateFrom?: string
      dateTo?: string
    }
  ): Promise<SimilarRecord[]>

  // Cross-domain search (research feature — search BOTH collections)
  export async function crossDomainSearch(
    query: string,
    topK: number = 3
  ): Promise<{
    aircraft: SimilarRecord[]
    medical: SimilarRecord[]
    insight: string   // "Similar patterns found in both domains" | "Patterns differ significantly"
  }>

  // Get a single record by ID
  export async function getRecordById(
    domain: 'aircraft' | 'medical',
    id: string
  ): Promise<NarrativeRecord | null>

  // Collection health stats
  export async function getCollectionStats(
    domain: 'aircraft' | 'medical'
  ): Promise<{ count: number; lastEmbedded: string; dimensions: number }>

Create /scripts/embed-all.ts that:
  1. Reads all unembedded records from narrative_records (WHERE embedded=0)
  2. Embeds in batches of 10 with progress logging
  3. Upserts to correct ChromaDB collection by domain
  4. Updates embedded=1 in narrative_records table
  5. Handles rate limits with exponential backoff
  6. Prints cost estimate if using OpenAI

Note: The crossDomainSearch function is a KEY RESEARCH FEATURE.
It answers the PhD question: "Does the same query surface relevant 
patterns in both domains simultaneously?"
```

---

## PROMPT 6 — Analytics Layer (Both Domains)

```
Read med_prompt.md for context. Run PROMPT 6.

Create /lib/analytics.ts — unified analytics functions for both domains.
Uses the DomainConfig to query the correct table.

// ── SHARED KPI FUNCTION ────────────────────────────────────

export function getKPIs(domain: 'aircraft' | 'medical'): KPIData
  // Queries aircraft_defects OR disease_records based on domain
  // Returns totalRecords, criticalCount, criticalRate, topCategory, avgMetric

// ── CHART DATA FUNCTIONS ───────────────────────────────────

// Bar chart: Top N categories by count
export function getCategoryBreakdown(
  domain: 'aircraft' | 'medical',
  limit = 10
): Array<{ category: string; count: number; percentage: number }>

// Stacked bar: severity/outcome by system/specialty
export function getSeverityBySystem(
  domain: 'aircraft' | 'medical'
): Array<{ system: string; critical: number; high: number; medium: number; low: number }>

// Line chart: weekly trend
export function getWeeklyTrend(
  domain: 'aircraft' | 'medical',
  weeks = 12
): Array<{ week: string; total: number; critical: number }>

// Attribute profile for a specific category
export function getCategoryProfile(
  domain: 'aircraft' | 'medical',
  category: string
): Record<string, number | string>
  // Aircraft: top systems, inspection types, plants affected
  // Medical: symptom rates (fever%, cough%), avg age, gender split, BP distribution

// ── RESEARCH-SPECIFIC: CROSS-DOMAIN COMPARISON ─────────────

// Compare the same metric across both domains (for PhD charts)
export function getCrossDomainComparison(): {
  aircraft: { totalRecords: number; criticalRate: number; topCategory: string }
  medical:  { totalRecords: number; criticalRate: number; topCategory: string }
  similarity_score: number   // 0-1: how similar are the distributions?
  insight: string            // auto-generated comparison text
}

// Weekly trend comparison side-by-side
export function getCrossDomainTrend(weeks = 12): {
  weeks: string[]
  aircraft: number[]
  medical: number[]
}

All functions:
- Cache results for 5 minutes (Map with TTL)
- Return empty/default values instead of throwing on no data
- Add JSDoc with example return value
```

---

## PROMPT 7 — Dual-Domain Agent

```
Read med_prompt.md for context. Run PROMPT 7.

Create /lib/agent.ts — the unified agentic reasoning engine.
It reads the active DomainConfig and adjusts its behavior accordingly.

TOOL DEFINITIONS (Claude API tool_use format):

Tool 1: search_domain_records
  Description: "Search for semantically similar records in the active domain 
    using vector search. Returns ranked results with similarity scores."
  Input:
    query: string (required)
    top_k: number (optional, default 5, max 10)
    severity_filter: string (optional)
    system_filter: string (optional)
    date_from: string (optional, ISO date)
    date_to: string (optional, ISO date)

Tool 2: query_domain_analytics
  Description: "Query structured analytics for the active domain. 
    Returns aggregated statistics and trend data."
  Input:
    analysis_type: "kpis" | "category_breakdown" | "severity_by_system" | 
                   "weekly_trend" | "category_profile"
    category: string (optional)
    weeks: number (optional, default 12)

Tool 3: get_record_detail
  Description: "Retrieve the full record for a specific ID."
  Input:
    record_id: string (required)   // e.g. "ARC-001" or "MAC-001"

Tool 4: cross_domain_search  ← RESEARCH FEATURE
  Description: "Search BOTH domains simultaneously. Used for PhD cross-domain 
    analysis — surfaces whether a pattern exists in both aircraft maintenance 
    and clinical medicine."
  Input:
    query: string (required)
    top_k: number (optional, default 3 per domain)

SYSTEM PROMPTS (switch based on active domain):

Aircraft system prompt:
  "You are an expert aviation quality engineering assistant with deep knowledge 
  of aircraft maintenance, defect analysis, and corrective action planning.
  You analyze maintenance incidents, identify failure patterns, and recommend 
  evidence-based corrective actions. Always cite specific incident IDs (ARC-xxx) 
  in your responses. Frame recommendations as engineering hypotheses requiring 
  qualified review — not definitive instructions. Use ATA chapter terminology 
  where relevant."

Medical system prompt:
  "You are a clinical intelligence assistant supporting healthcare quality 
  analysis. You help identify similar clinical cases, surface disease patterns, 
  and synthesize evidence from case reports. Always cite specific case IDs 
  (MAC-xxx) and note that all outputs are AI-generated hypotheses requiring 
  qualified medical professional review. Never provide diagnoses or treatment 
  recommendations as clinical advice."

CONFIDENCE SCORING:
  HIGH:   3+ records with similarity > 0.75
  MEDIUM: 1-2 records OR similarity 0.50-0.75
  LOW:    0 direct matches OR similarity < 0.50

RESPONSE STRUCTURE (enforced in agent prompt):
  1. Summary of what was found
  2. Top 3 similar records with evidence
  3. Recommended actions (ranked by priority)
  4. Confidence level with justification
  5. Tool call trace (always include for transparency)
  6. Domain disclaimer (from DomainConfig.disclaimer)

Export:
  export async function runAgent(
    query: string,
    domain: 'aircraft' | 'medical',
    conversationHistory?: Message[]
  ): Promise<AgentResponse>

  export async function streamAgent(
    query: string, 
    domain: 'aircraft' | 'medical',
    onChunk: (chunk: string) => void
  ): Promise<AgentResponse>
```

---

## PROMPT 8 — Dashboard UI (Domain-Aware)

```
Read med_prompt.md for context. Run PROMPT 8.

Update the Next.js dashboard to be fully domain-aware.
All components read from useDomain() hook and adapt automatically.

1. Update /app/dashboard/layout.tsx:
   - Wrap with DomainProvider from /lib/domains/domain-context.tsx
   - Add DomainSwitcher component to header

2. Create /components/shared/DomainSwitcher.tsx:
   Two pill buttons side by side:
   [✈️  Aircraft Maintenance]  [🏥  Clinical Cases]
   Active domain: highlighted with domain's primaryColor
   On switch: clear agent conversation, refetch all chart data
   Show record count under each button: "150 incidents" | "200 cases"

3. Create /components/shared/KPICards.tsx (domain-aware):
   Reads active domain config for labels
   4 cards: Total Records | Critical Count | Critical Rate % | Top Category
   Aircraft colors: blue/amber/red
   Medical colors: teal/rose/emerald

4. Create /components/shared/CategoryBarChart.tsx:
   Title changes: "Defects by Type" | "Diseases by Frequency"
   Data from getCategoryBreakdown(domain)
   Horizontal BarChart, Recharts, top 10

5. Create /components/shared/SeverityStackedBar.tsx:
   Title changes: "Severity by System" | "Outcomes by Specialty"
   X-axis label: "System" | "Medical Specialty"
   Stack colors: red(Critical/High) amber(Medium) green(Low/Negative)

6. Create /components/shared/WeeklyTrendLine.tsx:
   Title: "Defect Trend" | "Case Trend"
   Dual lines: total (blue) + critical (red)

7. Create /components/shared/NarrativeExplorer.tsx:
   Search + filter sidebar (severity, system/specialty, date range)
   Results list with similarity badge, severity badge, category tag
   Click → expand full record with all fields + entity tags
   Title: "Incident Explorer" | "Clinical Case Explorer"

8. Create /components/shared/AgentPanel.tsx:
   Text input with domain-aware placeholder:
     Aircraft: "Describe the maintenance issue..."
     Medical:  "Describe the clinical presentation..."
   Response sections:
     - Similar Records (with IDs, scores, snippets)
     - Reasoned Summary
     - Recommended Actions (with confidence tags)
     - Tool Call Trace (collapsible, always present)
     - Disclaimer banner (domain-specific, non-dismissible)

9. Create /components/research/CrossDomainPanel.tsx  ← PhD FEATURE
   A special tab labeled "🔬 Research: Cross-Domain"
   Input: one search query
   Two side-by-side result columns: Aircraft | Medical
   Similarity score between domains shown as a gauge (0-100%)
   Auto-generated insight text from crossDomainSearch()
   Export button: downloads results as JSON for thesis appendix

Use Tailwind CSS throughout. 
Server Components by default, 'use client' only for interactivity.
All loading states handled with Suspense + skeleton components.
```

---

## PROMPT 9 — Evaluation Framework

```
Read med_prompt.md for context. Run PROMPT 9.

Create the PhD evaluation framework that measures both domains.

1. Create /scripts/run-eval.ts — master evaluation runner:

TEST QUERIES — AIRCRAFT (5 queries):
  ARC-Q1: "Hydraulic leak near actuator; suspected seal degradation; reworked and tested."
           Expected: hydraulic / seal / actuator / pump failures
  ARC-Q2: "Intermittent short circuit in avionics harness; chafing observed; replaced wiring."
           Expected: wiring / chafing / avionics / electrical faults
  ARC-Q3: "Corrosion on fastener around skin panel; treated and replaced; lot quarantined."
           Expected: corrosion / structural / fastener / surface treatment
  ARC-Q4: "Fuel system pressure loss detected during preflight check; fuel line replaced."
           Expected: fuel system / pressure / leak / line replacement
  ARC-Q5: "Landing gear retraction failure; actuator jammed; hydraulic pressure restored."
           Expected: landing gear / actuator / hydraulic / mechanical failure

TEST QUERIES — MEDICAL (5 queries):
  MED-Q1: "Patient with palpitations, dyspnea, holosystolic murmur, ECG pre-excitation."
           Expected: cardiac / arrhythmia / valve / conduction disorders
  MED-Q2: "Young adult with progressive dyspnea, dry cough, bilateral chest infiltrates."
           Expected: respiratory / pulmonary / pneumonia / lung disorders
  MED-Q3: "Severe headache, neck stiffness, photophobia, fever, altered consciousness."
           Expected: neurological / meningitis / intracranial / CNS disorders
  MED-Q4: "Progressive dysphagia, weight loss, iron-deficiency anemia, elderly patient."
           Expected: GI / esophageal / malignancy / nutritional disorders
  MED-Q5: "Fever, joint pain, skin rash, positive ANA, young female."
           Expected: autoimmune / lupus / rheumatological / inflammatory

For EACH query in BOTH domains:
  a. Run vector search (top_k=5), measure latency
  b. Calculate precision@5 (use entity/keyword overlap as proxy relevance)
  c. Estimate token cost
  d. Save to eval_results table AND /data/eval/results-{timestamp}.json

2. Create /lib/eval-metrics.ts:
  
  export function calculatePrecisionAtK(
    returned: SimilarRecord[],
    expectedThemes: string[],
    k: number
  ): number
    // A result is "relevant" if its entities or narrative contain 
    // any of the expectedThemes keywords
  
  export function calculateCrossDomainDelta(
    aircraftResults: EvalResult[],
    medicalResults: EvalResult[]
  ): {
    aircraft_avg_precision: number
    medical_avg_precision: number
    delta: number               // difference — key PhD metric
    interpretation: string      // "Framework performs consistently across domains" etc.
  }
  
  export function generateEvalReport(results: EvalResult[]): {
    summary: string
    by_domain: Record<string, { avg_precision: number; avg_latency: number; total_cost: number }>
    recommendation: string
  }

3. Update the Data & Evaluation dashboard tab with:
   
   Section A: Dataset Health (both domains side by side)
   | Domain    | Records | Embedded | Last Ingest | Status |
   | Aircraft  | 150     | 150      | [date]      | ✅     |
   | Medical   | 200     | 200      | [date]      | ✅     |

   Section B: Eval Metrics (both domains side by side)
   | Metric            | Aircraft | Medical | Delta  |
   | Avg Precision@5   | 0.xx     | 0.xx    | ±0.xx  |
   | Avg Latency (ms)  | xxxx     | xxxx    | ±xxx   |
   | Cost/1K queries   | $x.xx    | $x.xx   | -      |
   | Queries Passed    | x/5      | x/5     | -      |

   Section C: Run Evaluation button
   POST /api/eval/run → triggers run-eval.ts, streams progress back

   The cross-domain delta is the headline PhD metric —
   highlight it prominently with an interpretation label.
```

---

## PROMPT 10 — Vercel Deployment

```
Read med_prompt.md for context. Run PROMPT 10.

Prepare the full project for Vercel deployment with both domains.

1. Update /next.config.ts:
   - Add webpack config to handle @xenova/transformers (if using local embeddings)
   - Configure headers for ChromaDB CORS if self-hosted
   - Add NEXT_PUBLIC_ACTIVE_DOMAIN to publicRuntimeConfig

2. Create /app/api/agent/route.ts — streaming agent endpoint:
   POST body: { query: string; domain: 'aircraft' | 'medical'; history: Message[] }
   Returns: Server-Sent Events stream of AgentResponse chunks
   Error handling: 400 (missing query), 500 (agent error) with typed error body

3. Create /app/api/search/route.ts:
   POST body: { query: string; domain: string; filters?: object; topK?: number }
   Returns: SimilarRecord[]

4. Create /app/api/analytics/route.ts:
   GET ?domain=aircraft&type=kpis
   Returns: KPIData | chart data based on type param

5. Create /app/api/eval/run/route.ts:
   POST → runs evaluation, streams progress
   Returns: EvalResult[] summary

6. Update .env.local.example with ALL required variables:

   # Domain
   NEXT_PUBLIC_ACTIVE_DOMAIN=aircraft     # default domain on load

   # Embeddings (choose one)
   USE_LOCAL_EMBEDDINGS=true              # free, uses @xenova/transformers
   # OPENAI_API_KEY=sk-...               # uncomment for OpenAI embeddings
   EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2

   # Vector Store
   CHROMA_URL=http://localhost:8000       # local ChromaDB
   CHROMA_AIRCRAFT_COLLECTION=aircraft_incidents
   CHROMA_MEDICAL_COLLECTION=medical_incidents

   # Database
   DB_PATH=./data/nextgenai.db

   # LLM
   ANTHROPIC_API_KEY=sk-ant-...
   AGENT_MODEL=claude-sonnet-4-20250514
   AGENT_MAX_TOKENS=2048

   # Research
   ENABLE_CROSS_DOMAIN=true               # enables Research tab
   PHD_MODE=true                          # shows extra eval metrics

7. Update package.json scripts:
   "db:setup":           "tsx scripts/setup-database.ts",
   "ingest:aircraft":    "tsx scripts/ingest-aircraft.ts",
   "ingest:medical":     "tsx scripts/ingest-medical.ts",
   "embed:all":          "tsx scripts/embed-all.ts",
   "eval:run":           "tsx scripts/run-eval.ts",
   "setup:all":          "npm run db:setup && npm run ingest:aircraft && npm run ingest:medical && npm run embed:all",
   "dev":                "next dev",
   "build":              "next build",
   "start":              "next start"

8. Create /scripts/setup.sh:
   #!/bin/bash
   set -e
   echo "🚀 NextGenAI Dual-Domain Setup"
   echo "================================"
   echo "📦 Installing Python dependencies..."
   pip install datasets
   echo "⬇️  Downloading MACCROBAT..."
   python scripts/download_maccrobat.py
   echo "🗄️  Setting up database..."
   npm run db:setup
   echo "📥 Ingesting aircraft data..."
   npm run ingest:aircraft
   echo "📥 Ingesting medical data..."
   npm run ingest:medical
   echo "🔢 Embedding all records..."
   npm run embed:all
   echo "✅ Setup complete. Run: npm run dev"

9. Vercel-specific: since SQLite is read-only on Vercel serverless,
   add a note in README that for Vercel deployment, either:
   Option A: Use Turso (LibSQL) instead of SQLite — migrate schema
   Option B: Use Vercel Postgres — migrate schema  
   Option C: Pre-build the DB and serve as a static asset (read-only, fine for demo)
   Recommend Option C for PhD demo (simplest), Option B for production.

Confirm the build passes: npm run build
```

---

## 🗺️ MASTER CHECKLIST

Track all phases in Claude Code:

```
PHASE 0 — Domain Framework
  [ ] DomainConfig interface created
  [ ] aircraft.config.ts + medical.config.ts implemented
  [ ] DomainProvider + useDomain() hook working
  [ ] Domain switcher renders in header
  [ ] Switching domain updates context throughout app

PHASE 1 — Types
  [ ] /types/domains.ts compiles with strict TypeScript
  [ ] All domain-specific types extend shared base types
  [ ] No 'any' types used

PHASE 2 — Database
  [ ] /data/nextgenai.db created with all 5 tables
  [ ] All indexes created
  [ ] /lib/db.ts exports singleton connection

PHASE 3 — Aircraft Data
  [ ] narrative_records populated with aircraft data
  [ ] aircraft_defects table populated
  [ ] ingestion_log shows successful run

PHASE 4 — Medical Data
  [ ] MACCROBAT downloaded to /data/maccrobat/raw.json
  [ ] 200 MAC-xxx records in narrative_records
  [ ] disease_records populated from CSV
  [ ] Both ingestion_log entries show success

PHASE 5 — Vector Store
  [ ] ChromaDB running (local or cloud)
  [ ] "aircraft_incidents" collection: 150 records
  [ ] "medical_incidents" collection: 200 records
  [ ] searchSimilarRecords() returns results for both domains
  [ ] crossDomainSearch() works and returns both columns

PHASE 6 — Analytics
  [ ] getKPIs() returns non-null for both domains
  [ ] All 4 chart functions return arrays
  [ ] getCrossDomainComparison() works
  [ ] 5-min cache working

PHASE 7 — Agent
  [ ] Aircraft agent responds with ARC-xxx citations
  [ ] Medical agent responds with MAC-xxx citations
  [ ] Both include tool call traces
  [ ] Disclaimers present on all responses
  [ ] crossDomainSearch tool works

PHASE 8 — UI
  [ ] Domain switcher toggles correctly
  [ ] KPI cards update on domain switch
  [ ] All 3 charts render real data
  [ ] Narrative Explorer searches correct domain
  [ ] Cross-Domain Research tab visible and working
  [ ] All disclaimers visible

PHASE 9 — Evaluation
  [ ] 5 aircraft queries evaluated + saved
  [ ] 5 medical queries evaluated + saved
  [ ] Precision@5 calculated for both domains
  [ ] Cross-domain delta computed
  [ ] Eval tab displays metrics table

PHASE 10 — Deployment
  [ ] npm run build passes with zero errors
  [ ] All API routes respond correctly
  [ ] .env.local.example complete
  [ ] setup.sh runs end-to-end
  [ ] Vercel deployment strategy documented
```

---

## ⚡ SINGLE QUICK-START PROMPT

Paste this into Claude Code to kick off the entire integration:

```
Read med_prompt.md in my project root.

I am building a dual-domain PhD research framework — NextGenAI Agentic 
Quality Intelligence Dashboard — that runs the same RAG pipeline over:
  Domain A: Aircraft Maintenance incident data
  Domain B: MACCROBAT clinical case reports + Disease Symptoms data

Work through PROMPT 0 through PROMPT 10 in order.
After each prompt, confirm it compiles and basic functionality works 
before moving to the next.

Hard constraints:
  - TypeScript strict mode throughout — no 'any'
  - Server Components by default, 'use client' only for interactivity
  - Use @xenova/transformers for local embeddings (free, no API cost)
  - Use better-sqlite3 for database
  - Use ChromaDB for vector store
  - Every agent response must include tool call traces and a disclaimer
  - The Cross-Domain Research tab is a PhD-critical feature — do not skip it
  - npm run build must pass before declaring any phase complete

Start with PROMPT 0 — the domain abstraction layer.
```
