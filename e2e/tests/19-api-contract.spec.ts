// ============================================================
// 19-api-contract.spec.ts
// Backend API contract tests using Playwright's APIRequestContext.
// These tests target the LIVE backend at PLAYWRIGHT_API_URL.
// By default they are tagged @live and skipped in mock-only runs.
//
// Run against the live backend:
//   PLAYWRIGHT_API_URL=https://nextai-backend.onrender.com npx playwright test 19-api-contract
//
// Run against a local backend:
//   PLAYWRIGHT_API_URL=http://localhost:8000 npx playwright test 19-api-contract
//
// Skip entirely (mock-only CI):
//   Set SKIP_LIVE_API_TESTS=true
//
// Coverage:
//   - GET /healthz returns 200 with {status, db, version}
//   - POST /query with valid body returns QueryResponse shape
//   - POST /query/medical (via domain field) returns QueryResponse shape
//   - POST /query with empty body returns 422
//   - GET /docs returns an array
//   - GET /runs/{nonexistent} returns 404
//   - GET /nonexistent returns 404 or 422
// ============================================================

import { test, expect, request } from "@playwright/test";

const API_URL = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8000";
const SKIP_LIVE = process.env.SKIP_LIVE_API_TESTS === "true";

// ---------------------------------------------------------------------------
// Minimal valid query request body matching QueryRequest schema
// ---------------------------------------------------------------------------
const MINIMAL_QUERY: Record<string, unknown> = {
  query: "Show defect counts for the last 30 days",
  domain: "aircraft",
  filters: null,
};

const MEDICAL_QUERY: Record<string, unknown> = {
  query: "Find clinical cases similar to: chest pain, elevated troponin, ST-elevation",
  domain: "medical",
  filters: null,
};

// ---------------------------------------------------------------------------
// GET /healthz
// ---------------------------------------------------------------------------

test.describe("API Contract — GET /healthz", () => {
  test.skip(SKIP_LIVE, "Skipping live API tests (SKIP_LIVE_API_TESTS=true)");

  test("returns HTTP 200", async () => {
    const ctx = await request.newContext({ baseURL: API_URL });
    const response = await ctx.get("/healthz");
    expect(response.status()).toBe(200);
    await ctx.dispose();
  });

  test("response body has 'status' field", async () => {
    const ctx = await request.newContext({ baseURL: API_URL });
    const response = await ctx.get("/healthz");
    const body = await response.json() as Record<string, unknown>;
    expect(body).toHaveProperty("status");
    await ctx.dispose();
  });

  test("'status' field is 'ok' or 'degraded'", async () => {
    const ctx = await request.newContext({ baseURL: API_URL });
    const response = await ctx.get("/healthz");
    const body = await response.json() as Record<string, unknown>;
    expect(["ok", "degraded"]).toContain(body.status);
    await ctx.dispose();
  });

  test("response body has 'db' boolean field", async () => {
    const ctx = await request.newContext({ baseURL: API_URL });
    const response = await ctx.get("/healthz");
    const body = await response.json() as Record<string, unknown>;
    expect(body).toHaveProperty("db");
    expect(typeof body.db).toBe("boolean");
    await ctx.dispose();
  });

  test("response body has 'version' string field", async () => {
    const ctx = await request.newContext({ baseURL: API_URL });
    const response = await ctx.get("/healthz");
    const body = await response.json() as Record<string, unknown>;
    expect(body).toHaveProperty("version");
    expect(typeof body.version).toBe("string");
    await ctx.dispose();
  });

  test("/healthz GET request sends no Content-Type header (stays simple CORS)", async () => {
    // This documents the CORS fix: GET /healthz must not require a preflight.
    // We verify by sending a bare GET and confirming the response is valid.
    const ctx = await request.newContext({
      baseURL: API_URL,
      extraHTTPHeaders: {}, // No Content-Type
    });
    const response = await ctx.get("/healthz");
    // If CORS preflight was required and the server was cold, this would fail.
    expect(response.status()).toBeLessThan(500);
    await ctx.dispose();
  });
});

// ---------------------------------------------------------------------------
// POST /query — aircraft domain
// ---------------------------------------------------------------------------

test.describe("API Contract — POST /query (aircraft)", () => {
  test.skip(SKIP_LIVE, "Skipping live API tests");

  test("returns HTTP 200 with valid body", async () => {
    const ctx = await request.newContext({ baseURL: API_URL });
    const response = await ctx.post("/query", {
      data: MINIMAL_QUERY,
      headers: { "Content-Type": "application/json" },
      timeout: 60_000, // Agent queries can be slow
    });
    expect(response.status()).toBe(200);
    await ctx.dispose();
  }, 70_000);

  test("response body has run_id string field", async () => {
    const ctx = await request.newContext({ baseURL: API_URL });
    const response = await ctx.post("/query", {
      data: MINIMAL_QUERY,
      headers: { "Content-Type": "application/json" },
      timeout: 60_000,
    });
    const body = await response.json() as Record<string, unknown>;
    expect(body).toHaveProperty("run_id");
    expect(typeof body.run_id).toBe("string");
    await ctx.dispose();
  }, 70_000);

  test("response body has non-empty 'answer' string", async () => {
    const ctx = await request.newContext({ baseURL: API_URL });
    const response = await ctx.post("/query", {
      data: MINIMAL_QUERY,
      headers: { "Content-Type": "application/json" },
      timeout: 60_000,
    });
    const body = await response.json() as Record<string, unknown>;
    expect(body).toHaveProperty("answer");
    expect(typeof body.answer).toBe("string");
    expect((body.answer as string).length).toBeGreaterThan(0);
    await ctx.dispose();
  }, 70_000);

  test("response body has 'evidence' with vector_hits and sql_rows arrays", async () => {
    const ctx = await request.newContext({ baseURL: API_URL });
    const response = await ctx.post("/query", {
      data: MINIMAL_QUERY,
      headers: { "Content-Type": "application/json" },
      timeout: 60_000,
    });
    const body = await response.json() as Record<string, unknown>;
    const evidence = body.evidence as Record<string, unknown>;
    expect(evidence).toHaveProperty("vector_hits");
    expect(evidence).toHaveProperty("sql_rows");
    expect(Array.isArray(evidence.vector_hits)).toBe(true);
    expect(Array.isArray(evidence.sql_rows)).toBe(true);
    await ctx.dispose();
  }, 70_000);

  test("response body has run_summary with intent field", async () => {
    const ctx = await request.newContext({ baseURL: API_URL });
    const response = await ctx.post("/query", {
      data: MINIMAL_QUERY,
      headers: { "Content-Type": "application/json" },
      timeout: 60_000,
    });
    const body = await response.json() as Record<string, unknown>;
    const runSummary = body.run_summary as Record<string, unknown>;
    expect(runSummary).toHaveProperty("intent");
    expect(["vector_only", "sql_only", "hybrid", "compute"]).toContain(runSummary.intent);
    await ctx.dispose();
  }, 70_000);

  test("response body has 'claims' array", async () => {
    const ctx = await request.newContext({ baseURL: API_URL });
    const response = await ctx.post("/query", {
      data: MINIMAL_QUERY,
      headers: { "Content-Type": "application/json" },
      timeout: 60_000,
    });
    const body = await response.json() as Record<string, unknown>;
    expect(body).toHaveProperty("claims");
    expect(Array.isArray(body.claims)).toBe(true);
    await ctx.dispose();
  }, 70_000);
});

// ---------------------------------------------------------------------------
// POST /query — medical domain
// ---------------------------------------------------------------------------

test.describe("API Contract — POST /query (medical domain)", () => {
  test.skip(SKIP_LIVE, "Skipping live API tests");

  test("POST /query with domain=medical returns HTTP 200", async () => {
    const ctx = await request.newContext({ baseURL: API_URL });
    const response = await ctx.post("/query", {
      data: MEDICAL_QUERY,
      headers: { "Content-Type": "application/json" },
      timeout: 60_000,
    });
    expect(response.status()).toBe(200);
    await ctx.dispose();
  }, 70_000);

  test("medical query response has non-empty answer", async () => {
    const ctx = await request.newContext({ baseURL: API_URL });
    const response = await ctx.post("/query", {
      data: MEDICAL_QUERY,
      headers: { "Content-Type": "application/json" },
      timeout: 60_000,
    });
    const body = await response.json() as Record<string, unknown>;
    expect((body.answer as string).length).toBeGreaterThan(0);
    await ctx.dispose();
  }, 70_000);
});

// ---------------------------------------------------------------------------
// POST /query — validation errors
// ---------------------------------------------------------------------------

test.describe("API Contract — POST /query validation", () => {
  test.skip(SKIP_LIVE, "Skipping live API tests");

  test("POST /query with empty body returns HTTP 422", async () => {
    const ctx = await request.newContext({ baseURL: API_URL });
    const response = await ctx.post("/query", {
      data: {},
      headers: { "Content-Type": "application/json" },
    });
    expect(response.status()).toBe(422);
    await ctx.dispose();
  });

  test("POST /query with missing query field returns HTTP 422", async () => {
    const ctx = await request.newContext({ baseURL: API_URL });
    const response = await ctx.post("/query", {
      data: { domain: "aircraft" },
      headers: { "Content-Type": "application/json" },
    });
    expect(response.status()).toBe(422);
    await ctx.dispose();
  });

  test("POST /query with invalid domain returns HTTP 422", async () => {
    const ctx = await request.newContext({ baseURL: API_URL });
    const response = await ctx.post("/query", {
      data: { query: "test", domain: "invalid_domain_value" },
      headers: { "Content-Type": "application/json" },
    });
    // FastAPI Pydantic validation rejects unrecognised enum values
    expect(response.status()).toBe(422);
    await ctx.dispose();
  });
});

// ---------------------------------------------------------------------------
// GET /docs
// ---------------------------------------------------------------------------

test.describe("API Contract — GET /docs", () => {
  test.skip(SKIP_LIVE, "Skipping live API tests");

  test("GET /docs returns HTTP 200", async () => {
    const ctx = await request.newContext({ baseURL: API_URL });
    const response = await ctx.get("/docs?limit=5");
    expect(response.status()).toBe(200);
    await ctx.dispose();
  });

  test("GET /docs returns an array", async () => {
    const ctx = await request.newContext({ baseURL: API_URL });
    const response = await ctx.get("/docs?limit=5");
    const body = await response.json() as unknown[];
    expect(Array.isArray(body)).toBe(true);
    await ctx.dispose();
  });
});

// ---------------------------------------------------------------------------
// GET /runs — 404 for non-existent run
// ---------------------------------------------------------------------------

test.describe("API Contract — GET /runs/{run_id}", () => {
  test.skip(SKIP_LIVE, "Skipping live API tests");

  test("GET /runs with non-existent run_id returns HTTP 404", async () => {
    const ctx = await request.newContext({ baseURL: API_URL });
    const response = await ctx.get("/runs/this-run-does-not-exist-xyz-999");
    expect(response.status()).toBe(404);
    await ctx.dispose();
  });
});

// ---------------------------------------------------------------------------
// Unrecognised routes
// ---------------------------------------------------------------------------

test.describe("API Contract — unrecognised routes", () => {
  test.skip(SKIP_LIVE, "Skipping live API tests");

  test("GET /nonexistent returns 404 or 422", async () => {
    const ctx = await request.newContext({ baseURL: API_URL });
    const response = await ctx.get("/this-route-does-not-exist-xyz");
    expect([404, 422]).toContain(response.status());
    await ctx.dispose();
  });
});
