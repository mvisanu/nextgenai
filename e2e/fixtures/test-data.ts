// ============================================================
// test-data.ts
// Realistic query strings and expected response shapes for all
// three PRD demo queries. All mock QueryResponse objects must
// exactly match the TypeScript interfaces defined in BACKEND.md.
// ============================================================

import type {
  QueryResponse,
  ChunkResponse,
  HealthResponse,
} from "../../frontend/app/lib/api";

// ---------------------------------------------------------------------------
// Shared citation / chunk IDs used across fixtures so that the
// CitationsDrawer fetch can be matched by the same chunk ID.
// ---------------------------------------------------------------------------

export const CHUNK_ID_HYDRAULIC = "embed-hydraulic-001";
export const INCIDENT_ID_HYDRAULIC = "INC-A1B2C3D4";

export const CHUNK_ID_DEFECT_TREND = "embed-defect-trend-001";
export const INCIDENT_ID_DEFECT_TREND = "INC-D5E6F7A8";

export const CHUNK_ID_HYBRID = "embed-hybrid-001";
export const INCIDENT_ID_HYBRID = "INC-H9I0J1K2";

// ---------------------------------------------------------------------------
// Demo Query 1 — Vector-only
// "Find similar incidents to: hydraulic actuator crack on Line 1"
// ---------------------------------------------------------------------------

export const DEMO_QUERY_1 =
  "Find similar incidents to: hydraulic actuator crack observed during routine inspection on Line 1";

export const MOCK_RESPONSE_QUERY_1: QueryResponse = {
  run_id: "run-11111111-1111-1111-1111-111111111111",
  query: DEMO_QUERY_1,
  answer:
    "Based on vector search across 10,000 incident narratives, I found 3 incidents similar to the reported hydraulic actuator crack. [1] A hydraulic actuator failure was recorded on Line 1 (Asset ASSET-247) in March 2024, where a stress crack propagated along the actuator rod. [2] A second incident on Line 3 in January 2024 involved a fatigue fracture at the actuator mounting flange. Recommended corrective actions include non-destructive testing of adjacent actuators and a review of maintenance intervals. [3]",
  claims: [
    {
      text: "A hydraulic actuator failure was recorded on Line 1 (Asset ASSET-247) in March 2024, where a stress crack propagated along the actuator rod.",
      confidence: 0.92,
      citations: [
        {
          chunk_id: CHUNK_ID_HYDRAULIC,
          incident_id: INCIDENT_ID_HYDRAULIC,
          char_start: 12,
          char_end: 80,
        },
      ],
      conflict_note: null,
    },
    {
      text: "A second incident on Line 3 in January 2024 involved a fatigue fracture at the actuator mounting flange.",
      confidence: 0.85,
      citations: [
        {
          chunk_id: "embed-hydraulic-002",
          incident_id: "INC-B2C3D4E5",
          char_start: 0,
          char_end: 55,
        },
      ],
      conflict_note: null,
    },
    {
      text: "Recommended corrective actions include non-destructive testing of adjacent actuators and a review of maintenance intervals.",
      confidence: 0.78,
      citations: [
        {
          chunk_id: "embed-hydraulic-003",
          incident_id: "INC-C3D4E5F6",
          char_start: 30,
          char_end: 120,
        },
      ],
      conflict_note: null,
    },
  ],
  evidence: {
    vector_hits: [
      {
        chunk_id: CHUNK_ID_HYDRAULIC,
        incident_id: INCIDENT_ID_HYDRAULIC,
        score: 0.94,
        excerpt:
          "During routine inspection on Line 1, a stress crack was identified in the hydraulic actuator rod at the mid-point. The crack measured approximately 3mm in length. Asset ASSET-247 was immediately isolated.",
        metadata: {
          asset_id: "ASSET-247",
          system: "Hydraulics",
          severity: "Critical",
          event_date: "2024-03-15",
          char_start: 12,
          char_end: 80,
        },
      },
      {
        chunk_id: "embed-hydraulic-002",
        incident_id: "INC-B2C3D4E5",
        score: 0.87,
        excerpt:
          "Line 3 actuator mounting flange fatigue fracture observed after 2,400 operating hours. Corrective action: replace actuator assembly, inspect adjacent units.",
        metadata: {
          asset_id: "ASSET-312",
          system: "Hydraulics",
          severity: "High",
          event_date: "2024-01-22",
          char_start: 0,
          char_end: 55,
        },
      },
      {
        chunk_id: "embed-hydraulic-003",
        incident_id: "INC-C3D4E5F6",
        score: 0.82,
        excerpt:
          "Preventive inspection protocol updated: all hydraulic actuators on Lines 1-4 to undergo NDT every 600 operating hours following recent crack discoveries.",
        metadata: {
          asset_id: null,
          system: "Hydraulics",
          severity: "Medium",
          event_date: "2024-04-01",
          char_start: 30,
          char_end: 120,
        },
      },
    ],
    sql_rows: [],
  },
  graph_path: {
    nodes: [
      {
        id: "entity:hydraulics-system",
        type: "entity",
        label: "Hydraulics System",
        properties: { entity_type: "system" },
      },
      {
        id: "entity:asset-247",
        type: "entity",
        label: "ASSET-247",
        properties: { entity_type: "asset" },
      },
      {
        id: `chunk:${CHUNK_ID_HYDRAULIC}`,
        type: "chunk",
        label: "Stress crack in hydraulic actuator rod on Line 1",
        properties: { incident_id: INCIDENT_ID_HYDRAULIC },
      },
      {
        id: "chunk:embed-hydraulic-002",
        type: "chunk",
        label: "Fatigue fracture at actuator mounting flange Line 3",
        properties: { incident_id: "INC-B2C3D4E5" },
      },
    ],
    edges: [
      {
        id: "edge-001",
        from_node: `chunk:${CHUNK_ID_HYDRAULIC}`,
        to_node: "entity:hydraulics-system",
        type: "mentions",
        weight: 0.9,
      },
      {
        id: "edge-002",
        from_node: `chunk:${CHUNK_ID_HYDRAULIC}`,
        to_node: "entity:asset-247",
        type: "mentions",
        weight: 0.95,
      },
      {
        id: "edge-003",
        from_node: "chunk:embed-hydraulic-002",
        to_node: "entity:hydraulics-system",
        type: "mentions",
        weight: 0.85,
      },
      {
        id: "edge-004",
        from_node: `chunk:${CHUNK_ID_HYDRAULIC}`,
        to_node: "chunk:embed-hydraulic-002",
        type: "similarity",
        weight: 0.88,
      },
    ],
  },
  run_summary: {
    intent: "vector_only",
    plan_text:
      "1. Embed the query text using all-MiniLM-L6-v2. 2. Run VectorSearchTool with top_k=8 against incident_embeddings. 3. Synthesise answer from top-3 results with confidence scoring.",
    steps: [
      {
        step_number: 1,
        tool_name: "VectorSearchTool",
        output_summary: "Retrieved 8 incident chunks; top score 0.94 (ASSET-247 hydraulic actuator crack)",
        latency_ms: 312,
        error: null,
      },
    ],
    tools_used: ["VectorSearchTool"],
    total_latency_ms: 8450,
    halted_at_step_limit: false,
  },
  assumptions: [
    "Query refers to a recent inspection event on Line 1.",
    "All retrieved chunks are from the synthetic incident dataset.",
  ],
  next_steps: [
    "Review NDT records for ASSET-247 and adjacent actuators.",
    "Cross-reference with maintenance_logs for ASSET-247 over the past 90 days.",
  ],
};

// ---------------------------------------------------------------------------
// Demo Query 2 — SQL-only
// "Show defect trends by product and defect_type for the last 90 days"
// ---------------------------------------------------------------------------

export const DEMO_QUERY_2 =
  "Show defect trends by product and defect_type for the last 90 days";

export const MOCK_RESPONSE_QUERY_2: QueryResponse = {
  run_id: "run-22222222-2222-2222-2222-222222222222",
  query: DEMO_QUERY_2,
  answer:
    "Over the last 90 days, the SQL aggregation across manufacturing_defects reveals the following trends. [1] Hydraulic Pump Assembly accounts for the highest defect volume with 12 recorded incidents, predominantly of type 'Dimensional Variance'. [2] Control Valve Body follows with 8 incidents, mostly 'Surface Finish' defects. The data suggests a systemic issue in precision machining at Plant A. [3]",
  claims: [
    {
      text: "Hydraulic Pump Assembly accounts for the highest defect volume with 12 recorded incidents, predominantly of type 'Dimensional Variance'.",
      confidence: 0.97,
      citations: [
        {
          chunk_id: CHUNK_ID_DEFECT_TREND,
          incident_id: INCIDENT_ID_DEFECT_TREND,
          char_start: 0,
          char_end: 45,
        },
      ],
      conflict_note: null,
    },
    {
      text: "Control Valve Body follows with 8 incidents, mostly 'Surface Finish' defects.",
      confidence: 0.95,
      citations: [
        {
          chunk_id: "embed-defect-trend-002",
          incident_id: "INC-E6F7A8B9",
          char_start: 10,
          char_end: 60,
        },
      ],
      conflict_note: null,
    },
    {
      text: "The data suggests a systemic issue in precision machining at Plant A.",
      confidence: 0.62,
      citations: [
        {
          chunk_id: "embed-defect-trend-003",
          incident_id: "INC-F7A8B9C0",
          char_start: 5,
          char_end: 40,
        },
      ],
      conflict_note: "SQL data may under-represent Plant B due to incomplete log sync.",
    },
  ],
  evidence: {
    vector_hits: [],
    sql_rows: [
      {
        query: "defect_counts_by_product",
        columns: ["product", "defect_type", "count", "inspection_date_min", "inspection_date_max"],
        rows: [
          ["Hydraulic Pump Assembly", "Dimensional Variance", 12, "2025-12-05", "2026-03-02"],
          ["Control Valve Body", "Surface Finish", 8, "2025-12-10", "2026-03-01"],
          ["Actuator Rod", "Porosity", 6, "2026-01-03", "2026-02-28"],
          ["Electrical Connector", "Contamination", 5, "2026-01-15", "2026-03-01"],
          ["Bearing Assembly", "Dimensional Variance", 4, "2026-01-20", "2026-03-03"],
        ],
        row_count: 5,
      },
    ],
  },
  graph_path: {
    nodes: [
      {
        id: "entity:hydraulic-pump-product",
        type: "entity",
        label: "Hydraulic Pump Assembly",
        properties: { entity_type: "product" },
      },
      {
        id: "entity:dimensional-variance",
        type: "entity",
        label: "Dimensional Variance",
        properties: { entity_type: "defect_type" },
      },
      {
        id: "entity:plant-a",
        type: "entity",
        label: "Plant A",
        properties: { entity_type: "plant" },
      },
      {
        id: `chunk:${CHUNK_ID_DEFECT_TREND}`,
        type: "chunk",
        label: "Hydraulic pump defect report — dimensional variance",
        properties: { incident_id: INCIDENT_ID_DEFECT_TREND },
      },
    ],
    edges: [
      {
        id: "edge-sql-001",
        from_node: `chunk:${CHUNK_ID_DEFECT_TREND}`,
        to_node: "entity:hydraulic-pump-product",
        type: "mentions",
        weight: 0.93,
      },
      {
        id: "edge-sql-002",
        from_node: `chunk:${CHUNK_ID_DEFECT_TREND}`,
        to_node: "entity:dimensional-variance",
        type: "mentions",
        weight: 0.88,
      },
      {
        id: "edge-sql-003",
        from_node: "entity:hydraulic-pump-product",
        to_node: "entity:plant-a",
        type: "co_occurrence",
        weight: 0.71,
      },
    ],
  },
  run_summary: {
    intent: "sql_only",
    plan_text:
      "1. Run SQLQueryTool with named query 'defect_counts_by_product' filtered to last 90 days. 2. Synthesise trend summary from aggregation results.",
    steps: [
      {
        step_number: 1,
        tool_name: "SQLQueryTool",
        output_summary:
          "defect_counts_by_product returned 5 rows: top product Hydraulic Pump Assembly (12 defects, Dimensional Variance)",
        latency_ms: 145,
        error: null,
      },
    ],
    tools_used: ["SQLQueryTool"],
    total_latency_ms: 6820,
    halted_at_step_limit: false,
  },
  assumptions: [
    "Last 90 days calculated from 2026-03-04 (today).",
    "Only manufacturing_defects table is queried; maintenance_logs excluded.",
  ],
  next_steps: [
    "Drill into Plant A's dimensional variance defects for root cause analysis.",
    "Cross-reference with maintenance_logs for the same 90-day window.",
  ],
};

// ---------------------------------------------------------------------------
// Demo Query 3 — Hybrid
// "Given this incident: corrosion found on avionics connector, classify the
//  defect and recommend action"
// ---------------------------------------------------------------------------

export const DEMO_QUERY_3 =
  "Given this incident: corrosion found on avionics connector SN-482910, classify the likely defect category and recommend next maintenance action";

export const MOCK_RESPONSE_QUERY_3: QueryResponse = {
  run_id: "run-33333333-3333-3333-3333-333333333333",
  query: DEMO_QUERY_3,
  answer:
    "Based on both vector similarity search and SQL defect statistics, the avionics connector corrosion on SN-482910 is classified as a 'Corrosion' defect of 'High' severity. [1] Three similar incidents were found in the incident narrative database, all involving avionics connector corrosion in humid environments. [2] SQL analysis shows that 'Electrical Connector' products account for 5 corrosion defects in the last 90 days, all actioned with 'Replacement'. [3] Recommended next action: immediate replacement of SN-482910, inspection of adjacent connectors, and environmental humidity audit of the avionics bay.",
  claims: [
    {
      text: "The avionics connector corrosion on SN-482910 is classified as a 'Corrosion' defect of 'High' severity.",
      confidence: 0.89,
      citations: [
        {
          chunk_id: CHUNK_ID_HYBRID,
          incident_id: INCIDENT_ID_HYBRID,
          char_start: 18,
          char_end: 95,
        },
      ],
      conflict_note: null,
    },
    {
      text: "Three similar incidents were found in the incident narrative database, all involving avionics connector corrosion in humid environments.",
      confidence: 0.84,
      citations: [
        {
          chunk_id: "embed-hybrid-002",
          incident_id: "INC-I1J2K3L4",
          char_start: 0,
          char_end: 70,
        },
      ],
      conflict_note: null,
    },
    {
      text: "SQL analysis shows that 'Electrical Connector' products account for 5 corrosion defects in the last 90 days, all actioned with 'Replacement'.",
      confidence: 0.96,
      citations: [
        {
          chunk_id: "embed-hybrid-003",
          incident_id: "INC-J2K3L4M5",
          char_start: 5,
          char_end: 88,
        },
      ],
      conflict_note: null,
    },
  ],
  evidence: {
    vector_hits: [
      {
        chunk_id: CHUNK_ID_HYBRID,
        incident_id: INCIDENT_ID_HYBRID,
        score: 0.91,
        excerpt:
          "Corrosion identified on avionics connector assembly SN-482910 during scheduled maintenance inspection. Corrosion type: galvanic, affecting pin contacts. Severity rated High. Immediate grounding of aircraft recommended.",
        metadata: {
          asset_id: "AIRCRAFT-003",
          system: "Avionics",
          severity: "High",
          event_date: "2024-09-12",
          char_start: 18,
          char_end: 95,
        },
      },
    ],
    sql_rows: [
      {
        query: "defect_counts_by_product",
        columns: ["product", "defect_type", "count", "action_taken"],
        rows: [
          ["Electrical Connector", "Contamination", 5, "Replacement"],
        ],
        row_count: 1,
      },
    ],
  },
  graph_path: {
    nodes: [
      {
        id: "entity:avionics-system",
        type: "entity",
        label: "Avionics System",
        properties: { entity_type: "system" },
      },
      {
        id: "entity:aircraft-003",
        type: "entity",
        label: "AIRCRAFT-003",
        properties: { entity_type: "asset" },
      },
      {
        id: "entity:corrosion-defect",
        type: "entity",
        label: "Corrosion",
        properties: { entity_type: "defect_type" },
      },
      {
        id: `chunk:${CHUNK_ID_HYBRID}`,
        type: "chunk",
        label: "Avionics connector corrosion SN-482910",
        properties: { incident_id: INCIDENT_ID_HYBRID },
      },
      {
        id: "chunk:embed-hybrid-002",
        type: "chunk",
        label: "Avionics connector corrosion in humid environment",
        properties: { incident_id: "INC-I1J2K3L4" },
      },
    ],
    edges: [
      {
        id: "edge-hybrid-001",
        from_node: `chunk:${CHUNK_ID_HYBRID}`,
        to_node: "entity:avionics-system",
        type: "mentions",
        weight: 0.92,
      },
      {
        id: "edge-hybrid-002",
        from_node: `chunk:${CHUNK_ID_HYBRID}`,
        to_node: "entity:aircraft-003",
        type: "mentions",
        weight: 0.97,
      },
      {
        id: "edge-hybrid-003",
        from_node: `chunk:${CHUNK_ID_HYBRID}`,
        to_node: "entity:corrosion-defect",
        type: "mentions",
        weight: 0.94,
      },
      {
        id: "edge-hybrid-004",
        from_node: "chunk:embed-hybrid-002",
        to_node: "entity:avionics-system",
        type: "mentions",
        weight: 0.89,
      },
      {
        id: "edge-hybrid-005",
        from_node: `chunk:${CHUNK_ID_HYBRID}`,
        to_node: "chunk:embed-hybrid-002",
        type: "similarity",
        weight: 0.86,
      },
      {
        id: "edge-hybrid-006",
        from_node: "entity:avionics-system",
        to_node: "entity:corrosion-defect",
        type: "co_occurrence",
        weight: 0.75,
      },
    ],
  },
  run_summary: {
    intent: "hybrid",
    plan_text:
      "1. Run VectorSearchTool to find similar avionics connector incidents. 2. Run SQLQueryTool with defect_counts_by_product filtered to Electrical Connector. 3. Synthesise classification and maintenance recommendation from combined evidence.",
    steps: [
      {
        step_number: 1,
        tool_name: "VectorSearchTool",
        output_summary:
          "Retrieved 5 similar avionics connector incidents; top score 0.91 (AIRCRAFT-003, High severity)",
        latency_ms: 290,
        error: null,
      },
      {
        step_number: 2,
        tool_name: "SQLQueryTool",
        output_summary:
          "defect_counts_by_product: Electrical Connector — 5 corrosion incidents, all actioned Replacement",
        latency_ms: 110,
        error: null,
      },
    ],
    tools_used: ["VectorSearchTool", "SQLQueryTool"],
    total_latency_ms: 19350,
    halted_at_step_limit: false,
  },
  assumptions: [
    "SN-482910 is mapped to the Electrical Connector product category.",
    "Corrosion defect type is classified under 'Contamination' in manufacturing_defects.",
  ],
  next_steps: [
    "Inspect all avionics connectors on AIRCRAFT-003 for further galvanic corrosion.",
    "Review environmental humidity controls in the avionics maintenance bay.",
  ],
};

// ---------------------------------------------------------------------------
// Mock chunk responses used by CitationsDrawer fetch interception
// ---------------------------------------------------------------------------

export const MOCK_CHUNK_HYDRAULIC: ChunkResponse = {
  chunk_id: CHUNK_ID_HYDRAULIC,
  incident_id: INCIDENT_ID_HYDRAULIC,
  chunk_text:
    "During routine inspection on Line 1, a stress crack was identified in the hydraulic actuator rod at the mid-point. The crack measured approximately 3mm in length propagating along the actuator rod. Asset ASSET-247 was immediately isolated from production and a full NDT sweep was initiated on adjacent units.",
  chunk_index: 0,
  char_start: 12,
  char_end: 80,
  metadata: {
    asset_id: "ASSET-247",
    system: "Hydraulics",
    severity: "Critical",
    event_date: "2024-03-15",
    source: "synthetic",
  },
};

export const MOCK_CHUNK_DEFECT_TREND: ChunkResponse = {
  chunk_id: CHUNK_ID_DEFECT_TREND,
  incident_id: INCIDENT_ID_DEFECT_TREND,
  chunk_text:
    "Hydraulic pump defect report — dimensional variance detected across 12 units inspected at Plant A between December 2025 and March 2026. All units exceeded tolerance by +0.05mm on bore diameter. Disposition: rework required.",
  chunk_index: 0,
  char_start: 0,
  char_end: 45,
  metadata: {
    asset_id: null,
    system: "Manufacturing",
    severity: "High",
    event_date: "2026-02-15",
    source: "kaggle",
  },
};

export const MOCK_CHUNK_HYBRID: ChunkResponse = {
  chunk_id: CHUNK_ID_HYBRID,
  incident_id: INCIDENT_ID_HYBRID,
  chunk_text:
    "Corrosion identified on avionics connector assembly SN-482910 during scheduled maintenance inspection. Corrosion type: galvanic, affecting pin contacts 18-95. Severity rated High. Immediate grounding of aircraft recommended pending full replacement of connector assembly.",
  chunk_index: 0,
  char_start: 18,
  char_end: 95,
  metadata: {
    asset_id: "AIRCRAFT-003",
    system: "Avionics",
    severity: "High",
    event_date: "2024-09-12",
    source: "synthetic",
  },
};

// ---------------------------------------------------------------------------
// Health responses
// ---------------------------------------------------------------------------

export const MOCK_HEALTH_OK: HealthResponse = {
  status: "ok",
  db: true,
  version: "1.0.0",
};

export const MOCK_HEALTH_DEGRADED: HealthResponse = {
  status: "degraded",
  db: false,
  version: "1.0.0",
};

// ---------------------------------------------------------------------------
// Error response bodies
// ---------------------------------------------------------------------------

export const MOCK_500_BODY = {
  detail: "Agent error: LLM synthesis failed after 3 retries.",
};

export const MOCK_404_CHUNK_BODY = {
  detail: "Chunk 'nonexistent-chunk-id' not found in document 'nonexistent-doc-id'.",
};
