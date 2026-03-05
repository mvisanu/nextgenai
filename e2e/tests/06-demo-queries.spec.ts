// ============================================================
// 06-demo-queries.spec.ts
// End-to-end tests for all three PRD demo queries.
// All API calls are mocked; these tests verify that each query
// produces the correct answer text, tools in timeline, ≥1 graph
// node, ≥1 citation link, and a functional citations drawer.
// ============================================================

import { test, expect } from "@playwright/test";
import { FourPanelPage } from "../helpers/panels";
import {
  mockQueryResponse,
  mockChunkResponse,
  mockHealthOk,
  MOCK_RESPONSE_QUERY_1,
  MOCK_RESPONSE_QUERY_2,
  MOCK_RESPONSE_QUERY_3,
  MOCK_CHUNK_HYDRAULIC,
  MOCK_CHUNK_DEFECT_TREND,
  MOCK_CHUNK_HYBRID,
} from "../fixtures/api-mock";
import {
  DEMO_QUERY_1,
  DEMO_QUERY_2,
  DEMO_QUERY_3,
} from "../fixtures/test-data";

// ---------------------------------------------------------------------------
// Demo Query 1: Vector-only
// "Find similar incidents to: hydraulic actuator crack observed during routine inspection on Line 1"
// ---------------------------------------------------------------------------

test.describe("Demo Query 1 — Vector-only: hydraulic actuator crack", () => {
  let panelPage: FourPanelPage;

  test.beforeEach(async ({ page }) => {
    await mockHealthOk(page);
    await mockQueryResponse(page, MOCK_RESPONSE_QUERY_1);
    await mockChunkResponse(page, MOCK_CHUNK_HYDRAULIC);
    panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await panelPage.submitQuery(DEMO_QUERY_1);
    await panelPage.waitForAnswer();
  });

  test("correct answer text appears mentioning hydraulic actuator", async ({ page }) => {
    const answer = await panelPage.waitForAnswer();
    expect(answer.toLowerCase()).toContain("hydraulic actuator");
  });

  test("VectorSearchTool appears in the agent timeline", async ({ page }) => {
    await expect(page.getByText("VectorSearchTool")).toBeVisible({ timeout: 5_000 });
  });

  test("no SQL tool appears in the timeline (vector-only)", async ({ page }) => {
    // SQLQueryTool should NOT be in the timeline for a vector-only query
    const sqlBadge = page.getByText("SQLQueryTool");
    await expect(sqlBadge).toBeHidden({ timeout: 2_000 }).catch(() => {
      // If it doesn't appear, that's correct
    });
    expect(await sqlBadge.isVisible()).toBe(false);
  });

  test("graph path renders at least 1 node", async ({ page }) => {
    await page.waitForSelector(".react-flow__node", { timeout: 10_000 });
    const count = await panelPage.getGraphNodeCount();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("graph renders exactly 4 nodes as in the fixture", async ({ page }) => {
    await page.waitForSelector(".react-flow__node", { timeout: 10_000 });
    const count = await panelPage.getGraphNodeCount();
    expect(count).toBe(4);
  });

  test("at least 1 citation link [N] appears in the answer text", async () => {
    const citationButtons = await panelPage.getCitationButtons();
    expect(citationButtons.length).toBeGreaterThanOrEqual(1);
  });

  test("clicking [1] opens the citations drawer", async () => {
    await panelPage.clickCitation(1);
    await panelPage.waitForDrawerOpen();
  });

  test("citations drawer shows highlighted span from the chunk", async () => {
    await panelPage.clickCitation(1);
    await panelPage.waitForDrawerOpen();

    const mark = panelPage.page.locator("mark.citation-highlight");
    await expect(mark).toBeVisible({ timeout: 5_000 });
  });

  test("intent badge shows 'Vector Search' in the timeline", async ({ page }) => {
    await expect(page.getByText("Vector Search")).toBeVisible({ timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// Demo Query 2: SQL-only
// "Show defect trends by product and defect_type for the last 90 days"
// ---------------------------------------------------------------------------

test.describe("Demo Query 2 — SQL-only: defect trends", () => {
  let panelPage: FourPanelPage;

  test.beforeEach(async ({ page }) => {
    await mockHealthOk(page);
    await mockQueryResponse(page, MOCK_RESPONSE_QUERY_2);
    await mockChunkResponse(page, MOCK_CHUNK_DEFECT_TREND);
    panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await panelPage.submitQuery(DEMO_QUERY_2);
    await panelPage.waitForAnswer();
  });

  test("correct answer text appears mentioning defect volume", async () => {
    const answer = await panelPage.waitForAnswer();
    expect(answer.toLowerCase()).toMatch(/defect|hydraulic pump|dimensional/i);
  });

  test("SQLQueryTool appears in the agent timeline", async ({ page }) => {
    await expect(page.getByText("SQLQueryTool")).toBeVisible({ timeout: 5_000 });
  });

  test("no VectorSearchTool in the timeline (sql-only)", async ({ page }) => {
    const vectorBadge = page.getByText("VectorSearchTool");
    expect(await vectorBadge.isVisible()).toBe(false);
  });

  test("graph path renders at least 1 node", async ({ page }) => {
    await page.waitForSelector(".react-flow__node", { timeout: 10_000 });
    const count = await panelPage.getGraphNodeCount();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("at least 1 citation link appears in the answer", async () => {
    const citationButtons = await panelPage.getCitationButtons();
    expect(citationButtons.length).toBeGreaterThanOrEqual(1);
  });

  test("citations drawer opens for the SQL-based claim", async () => {
    await panelPage.clickCitation(1);
    await panelPage.waitForDrawerOpen();
  });

  test("citations drawer shows highlighted span", async () => {
    await panelPage.clickCitation(1);
    await panelPage.waitForDrawerOpen();
    const mark = panelPage.page.locator("mark.citation-highlight");
    await expect(mark).toBeVisible({ timeout: 5_000 });
  });

  test("intent badge shows 'SQL Query'", async ({ page }) => {
    await expect(page.getByText("SQL Query")).toBeVisible({ timeout: 5_000 });
  });

  test("confidence badge for first claim (0.97) shows 'High'", async () => {
    await panelPage.clickCitation(1);
    await panelPage.waitForDrawerOpen();
    await expect(panelPage.page.getByText(/High.*confidence|confidence.*97%/i)).toBeVisible({
      timeout: 5_000,
    });
  });
});

// ---------------------------------------------------------------------------
// Demo Query 3: Hybrid
// "Given this incident: corrosion found on avionics connector SN-482910,
//  classify the likely defect category and recommend next maintenance action"
// ---------------------------------------------------------------------------

test.describe("Demo Query 3 — Hybrid: avionics connector corrosion", () => {
  let panelPage: FourPanelPage;

  test.beforeEach(async ({ page }) => {
    await mockHealthOk(page);
    await mockQueryResponse(page, MOCK_RESPONSE_QUERY_3);
    await mockChunkResponse(page, MOCK_CHUNK_HYBRID);
    panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await panelPage.submitQuery(DEMO_QUERY_3);
    await panelPage.waitForAnswer();
  });

  test("correct answer text mentions avionics connector corrosion", async () => {
    const answer = await panelPage.waitForAnswer();
    expect(answer.toLowerCase()).toContain("avionics connector");
  });

  test("answer contains a classification or defect category reference", async () => {
    const answer = await panelPage.waitForAnswer();
    expect(answer.toLowerCase()).toMatch(/corrosion|defect.*category|classif/i);
  });

  test("answer contains a maintenance recommendation", async () => {
    const answer = await panelPage.waitForAnswer();
    expect(answer.toLowerCase()).toMatch(/recommend|replacement|inspect/i);
  });

  test("both VectorSearchTool and SQLQueryTool appear in the timeline", async ({ page }) => {
    await expect(page.getByText("VectorSearchTool")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("SQLQueryTool")).toBeVisible({ timeout: 5_000 });
  });

  test("graph path renders at least 1 node", async ({ page }) => {
    await page.waitForSelector(".react-flow__node", { timeout: 10_000 });
    const count = await panelPage.getGraphNodeCount();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("graph renders exactly 5 nodes as in the fixture", async ({ page }) => {
    await page.waitForSelector(".react-flow__node", { timeout: 10_000 });
    const count = await panelPage.getGraphNodeCount();
    expect(count).toBe(5);
  });

  test("at least 1 citation link appears in the answer", async () => {
    const citationButtons = await panelPage.getCitationButtons();
    expect(citationButtons.length).toBeGreaterThanOrEqual(1);
  });

  test("citations drawer opens and shows highlighted chunk", async () => {
    await panelPage.clickCitation(1);
    await panelPage.waitForDrawerOpen();
    const mark = panelPage.page.locator("mark.citation-highlight");
    await expect(mark).toBeVisible({ timeout: 5_000 });
  });

  test("intent badge shows 'Hybrid'", async ({ page }) => {
    await expect(page.getByText("Hybrid")).toBeVisible({ timeout: 5_000 });
  });

  test("two timeline steps are rendered (vector + SQL)", async ({ page }) => {
    await page.waitForSelector(".react-flow__node", { timeout: 10_000 });
    const steps = await panelPage.getTimelineSteps();
    expect(steps.length).toBe(2);
  });
});
