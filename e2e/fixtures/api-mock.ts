// ============================================================
// api-mock.ts
// Playwright route intercept helpers. Import and call these
// inside test files to mock the backend API responses.
//
// Usage:
//   import { mockQueryResponse, mockChunkResponse, mockHealthOk } from '../fixtures/api-mock';
//
//   test.beforeEach(async ({ page }) => {
//     await mockHealthOk(page);
//     await mockQueryResponse(page, MOCK_RESPONSE_QUERY_1);
//   });
// ============================================================

import type { Page, Route } from "@playwright/test";
import type { QueryResponse, ChunkResponse, HealthResponse } from "../../frontend/app/lib/api";
import {
  MOCK_RESPONSE_QUERY_1,
  MOCK_RESPONSE_QUERY_2,
  MOCK_RESPONSE_QUERY_3,
  MOCK_CHUNK_HYDRAULIC,
  MOCK_CHUNK_DEFECT_TREND,
  MOCK_CHUNK_HYBRID,
  MOCK_HEALTH_OK,
  MOCK_HEALTH_DEGRADED,
  MOCK_500_BODY,
  MOCK_404_CHUNK_BODY,
  INCIDENT_ID_HYDRAULIC,
  CHUNK_ID_HYDRAULIC,
  INCIDENT_ID_DEFECT_TREND,
  CHUNK_ID_DEFECT_TREND,
  INCIDENT_ID_HYBRID,
  CHUNK_ID_HYBRID,
} from "./test-data";

// Re-export for convenience
export {
  MOCK_RESPONSE_QUERY_1,
  MOCK_RESPONSE_QUERY_2,
  MOCK_RESPONSE_QUERY_3,
  MOCK_CHUNK_HYDRAULIC,
  MOCK_CHUNK_DEFECT_TREND,
  MOCK_CHUNK_HYBRID,
  MOCK_HEALTH_OK,
  MOCK_HEALTH_DEGRADED,
};

// ---------------------------------------------------------------------------
// Base API URL derived from Playwright's env config.
// Tests run against PLAYWRIGHT_API_URL or default localhost:8000.
// ---------------------------------------------------------------------------
const API_URL = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8000";

// ---------------------------------------------------------------------------
// Helper: build a full API URL pattern
// ---------------------------------------------------------------------------
function apiUrl(path: string): string {
  return `${API_URL}${path}`;
}

// ---------------------------------------------------------------------------
// POST /query — intercept once with provided response
// ---------------------------------------------------------------------------
export async function mockQueryResponse(
  page: Page,
  response: QueryResponse,
  latencyMs = 0
): Promise<void> {
  await page.route(apiUrl("/query"), async (route: Route) => {
    if (latencyMs > 0) {
      await new Promise((r) => setTimeout(r, latencyMs));
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });
}

// ---------------------------------------------------------------------------
// POST /query — returns HTTP 500 (agent error)
// ---------------------------------------------------------------------------
export async function mockQueryError500(page: Page): Promise<void> {
  await page.route(apiUrl("/query"), async (route: Route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify(MOCK_500_BODY),
    });
  });
}

// ---------------------------------------------------------------------------
// POST /query — simulates a network timeout (aborts the request)
// ---------------------------------------------------------------------------
export async function mockQueryTimeout(page: Page): Promise<void> {
  await page.route(apiUrl("/query"), async (route: Route) => {
    await route.abort("timedout");
  });
}

// ---------------------------------------------------------------------------
// GET /docs/{doc_id}/chunks/{chunk_id} — fulfills with the correct mock chunk
// Uses a glob pattern to match any doc/chunk combo and returns the
// appropriate fixture based on the chunk_id path segment.
// ---------------------------------------------------------------------------
export async function mockChunkResponse(
  page: Page,
  chunkResponse: ChunkResponse
): Promise<void> {
  const pattern = `${API_URL}/docs/${chunkResponse.incident_id}/chunks/${chunkResponse.chunk_id}`;
  await page.route(pattern, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(chunkResponse),
    });
  });
}

// ---------------------------------------------------------------------------
// GET /docs/{doc_id}/chunks/{chunk_id} — returns 404
// ---------------------------------------------------------------------------
export async function mockChunk404(page: Page): Promise<void> {
  await page.route(`${API_URL}/docs/**`, async (route: Route) => {
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify(MOCK_404_CHUNK_BODY),
    });
  });
}

// ---------------------------------------------------------------------------
// GET /healthz — returns { status: "ok" }
// ---------------------------------------------------------------------------
export async function mockHealthOk(page: Page): Promise<void> {
  await page.route(apiUrl("/healthz"), async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_HEALTH_OK),
    });
  });
}

// ---------------------------------------------------------------------------
// GET /healthz — returns { status: "degraded" }
// ---------------------------------------------------------------------------
export async function mockHealthDegraded(page: Page): Promise<void> {
  await page.route(apiUrl("/healthz"), async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_HEALTH_DEGRADED),
    });
  });
}

// ---------------------------------------------------------------------------
// Convenience: set up all three demo query mocks + matching chunk responses.
// Call this once when a test needs all three queries available.
// Uses route with a predicate so the correct fixture is returned per query.
// ---------------------------------------------------------------------------
export async function mockAllDemoQueries(page: Page): Promise<void> {
  await page.route(apiUrl("/query"), async (route: Route) => {
    const body = route.request().postDataJSON() as { query: string } | null;
    const query = body?.query ?? "";

    let fixture: QueryResponse = MOCK_RESPONSE_QUERY_1;
    if (query.toLowerCase().includes("defect trends")) {
      fixture = MOCK_RESPONSE_QUERY_2;
    } else if (query.toLowerCase().includes("corrosion") || query.toLowerCase().includes("classify")) {
      fixture = MOCK_RESPONSE_QUERY_3;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(fixture),
    });
  });

  // Register all three chunk mocks
  await mockChunkResponse(page, MOCK_CHUNK_HYDRAULIC);
  await mockChunkResponse(page, MOCK_CHUNK_DEFECT_TREND);
  await mockChunkResponse(page, MOCK_CHUNK_HYBRID);
}

// ---------------------------------------------------------------------------
// Convenience: wrap a slow 3G simulation (used in slow-network edge case tests)
// ---------------------------------------------------------------------------
export async function mockQuerySlow3G(page: Page, response: QueryResponse): Promise<void> {
  // 400ms latency simulates a 3G response time for the API call itself
  await mockQueryResponse(page, response, 400);
}
