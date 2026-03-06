// ============================================================
// NextAgentAI — Typed API Client
// Implements: T-031-F
// All interfaces sourced directly from BACKEND.md
// ============================================================

// ---------------------------------------------------------------------------
// Type Interfaces — canonical copy from BACKEND.md "Agent Output Schema"
// ---------------------------------------------------------------------------

export interface Citation {
  chunk_id: string;
  incident_id: string;
  char_start: number;
  char_end: number;
}

export interface Claim {
  text: string;
  confidence: number; // 0.0–1.0
  citations: Citation[];
  conflict_note: string | null;
}

export interface VectorHit {
  chunk_id: string;
  incident_id: string;
  score: number;
  excerpt: string;
  metadata: {
    asset_id: string | null;
    system: string | null;
    severity: string | null;
    event_date: string | null;
    char_start: number | null;
    char_end: number | null;
    domain?: string | null;
  };
}

export interface SqlResult {
  query: string;
  columns: string[];
  rows: unknown[][];
  row_count: number;
}

export interface Evidence {
  vector_hits: VectorHit[];
  sql_rows: SqlResult[];
}

export interface GraphNode {
  id: string;
  type: "chunk" | "entity";
  label: string | null;
  properties: Record<string, unknown> | null;
}

export interface GraphEdge {
  id: string;
  from_node: string;
  to_node: string;
  type: "mentions" | "similarity" | "co_occurrence";
  weight: number | null;
}

export interface GraphPath {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface StepSummary {
  step_number: number;
  tool_name: string;
  output_summary: string;
  latency_ms: number;
  error: string | null;
}

export interface RunSummary {
  intent: "vector_only" | "sql_only" | "hybrid" | "compute";
  plan_text: string;
  steps: StepSummary[];
  tools_used: string[];
  total_latency_ms: number;
  halted_at_step_limit: boolean;
}

export interface QueryRequest {
  query: string;
  domain?: "aircraft" | "medical";
  filters?: {
    system?: string;
    severity?: string;
    date_range?: [string, string];
  } | null;
}

export interface QueryResponse {
  run_id: string;
  query: string;
  answer: string;
  claims: Claim[];
  evidence: Evidence;
  graph_path: GraphPath;
  run_summary: RunSummary;
  assumptions: string[];
  next_steps: string[];
}

export interface ChunkResponse {
  chunk_id: string;
  incident_id: string;
  chunk_text: string;
  chunk_index: number;
  char_start: number;
  char_end: number;
  metadata: {
    asset_id: string | null;
    system: string | null;
    severity: string | null;
    event_date: string | null;
    source: string;
  };
}

export interface DocListItem {
  incident_id: string;
  asset_id: string | null;
  system: string | null;
  severity: string | null;
  event_date: string | null;
  source: string;
  chunk_count: number;
}

export interface IngestResponse {
  status: "started" | "already_running" | "complete" | "failed";
  message: string;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  db: boolean;
  version: string;
}

export interface RunRecord {
  run_id: string;
  query: string;
  result: QueryResponse;
  created_at: string | null;
}

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/**
 * Internal fetch wrapper that parses JSON and maps HTTP errors to thrown Error
 * instances with the backend's `detail` message preserved.
 */
async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const method = (options?.method ?? "GET").toUpperCase();
  // Only set Content-Type on requests that carry a body (POST/PUT/PATCH).
  // GET/HEAD must NOT send Content-Type — it turns a simple CORS request into
  // a preflighted request, breaking the cold-start /healthz ping on Render.
  const baseHeaders: Record<string, string> =
    method !== "GET" && method !== "HEAD"
      ? { "Content-Type": "application/json" }
      : {};
  const response = await fetch(url, {
    headers: {
      ...baseHeaders,
      ...(options?.headers as Record<string, string> | undefined ?? {}),
    },
    ...options,
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) {
        detail = body.detail;
      }
    } catch {
      // Response body is not JSON — use the status text
      detail = response.statusText || detail;
    }
    throw new Error(detail);
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Exported API functions (as required by T-031-F acceptance criteria)
// ---------------------------------------------------------------------------

/**
 * POST /query — Run the agent orchestrator and return a structured answer.
 * Latency: 10–30 seconds for hybrid queries.
 */
export async function postQuery(
  query: string,
  domain: "aircraft" | "medical" = "aircraft",
  filters?: QueryRequest["filters"]
): Promise<QueryResponse> {
  const body: QueryRequest = { query, domain, filters: filters ?? null };
  return apiFetch<QueryResponse>("/query", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * GET /runs/{run_id} — Retrieve a previously executed agent run by ID.
 */
export async function getRunById(runId: string): Promise<QueryResponse> {
  const record = await apiFetch<RunRecord>(`/runs/${encodeURIComponent(runId)}`);
  return record.result;
}

/**
 * GET /docs/{doc_id}/chunks/{chunk_id} — Fetch a specific chunk for citation display.
 * Used by CitationsDrawer to show highlighted source text.
 */
export async function getChunk(
  docId: string,
  chunkId: string
): Promise<ChunkResponse> {
  return apiFetch<ChunkResponse>(
    `/docs/${encodeURIComponent(docId)}/chunks/${encodeURIComponent(chunkId)}`
  );
}

/**
 * GET /healthz — Liveness and DB health check.
 * Uses a bare fetch (no Content-Type header) so the request stays a
 * CORS "simple request" — no preflight OPTIONS is sent. This is critical
 * for the Render cold-start ping: if the server is just waking up, it
 * cannot respond to an OPTIONS preflight, and CORS would block the GET.
 */
export async function getHealth(): Promise<HealthResponse> {
  const url = `${BASE_URL}/healthz`;
  const response = await fetch(url); // no extra headers — stays simple
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<HealthResponse>;
}

/**
 * GET /docs — List ingested incident documents with chunk counts.
 */
export async function getDocs(params?: {
  limit?: number;
  offset?: number;
  system?: string;
  severity?: string;
}): Promise<DocListItem[]> {
  const searchParams = new URLSearchParams();
  if (params?.limit !== undefined)
    searchParams.set("limit", String(params.limit));
  if (params?.offset !== undefined)
    searchParams.set("offset", String(params.offset));
  if (params?.system) searchParams.set("system", params.system);
  if (params?.severity) searchParams.set("severity", params.severity);

  const qs = searchParams.toString();
  return apiFetch<DocListItem[]>(`/docs${qs ? `?${qs}` : ""}`);
}

/**
 * POST /ingest — Trigger the full data ingestion pipeline (returns 202).
 */
export async function triggerIngest(): Promise<IngestResponse> {
  return apiFetch<IngestResponse>("/ingest", { method: "POST" });
}
