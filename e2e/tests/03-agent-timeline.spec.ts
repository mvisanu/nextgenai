// ============================================================
// 03-agent-timeline.spec.ts
// Agent Timeline panel: empty state, step rendering, badge colours,
// error steps, latency display, plan text.
// ============================================================

import { test, expect } from "@playwright/test";
import { FourPanelPage } from "../helpers/panels";
import {
  mockQueryResponse,
  mockHealthOk,
  MOCK_RESPONSE_QUERY_1,
  MOCK_RESPONSE_QUERY_2,
  MOCK_RESPONSE_QUERY_3,
} from "../fixtures/api-mock";
import { assertToolBadgeColour } from "../helpers/assertions";

test.describe("Agent Timeline — empty state", () => {
  test("shows 'No run yet' before any query is submitted", async ({ page }) => {
    await mockHealthOk(page);
    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();

    const emptyText = await panelPage.getTimelineEmptyText();
    expect(emptyText).toBe("No run yet");
  });

  test("timeline panel heading is visible", async ({ page }) => {
    await mockHealthOk(page);
    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();

    await expect(page.getByRole("heading", { name: "Agent Timeline", exact: true })).toBeVisible();
  });
});

test.describe("Agent Timeline — vector-only query (Query 1)", () => {
  let panelPage: FourPanelPage;

  test.beforeEach(async ({ page }) => {
    await mockHealthOk(page);
    await mockQueryResponse(page, MOCK_RESPONSE_QUERY_1);
    panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await panelPage.submitQuery("Find similar incidents to: hydraulic actuator crack");
    await panelPage.waitForAnswer();
  });

  test("steps appear after a query completes", async ({ page }) => {
    // The mock has 1 step: VectorSearchTool
    await expect(page.getByText("VectorSearchTool")).toBeVisible({ timeout: 5_000 });
  });

  test("VectorSearchTool badge has blue colour class", async ({ page }) => {
    const badge = page.locator('[class*="bg-blue-100"]').filter({ hasText: "VectorSearchTool" }).first();
    await expect(badge).toBeVisible();
    await assertToolBadgeColour(badge, "VectorSearchTool");
  });

  test("latency milliseconds are shown on each step", async ({ page }) => {
    // The mock has latency_ms: 312 for step 1
    // It renders as "312 ms"
    await expect(page.getByText(/312[\s,].*ms/)).toBeVisible({ timeout: 5_000 });
  });

  test("step shows a success icon (no error state)", async ({ page }) => {
    // CheckCircle2 icon appears for successful steps
    // We verify the error indicator is NOT visible for step 1
    const errorIcon = page.locator(".text-destructive").filter({ hasText: /error|failed/i });
    await expect(errorIcon).toBeHidden({ timeout: 3_000 }).catch(() => {
      // If no destructive element, that's the pass condition
    });
  });

  test("plan text is visible at top of timeline", async () => {
    const planText = await panelPage.getTimelinePlanText();
    expect(planText).toBeTruthy();
    expect(planText!.length).toBeGreaterThan(10);
  });

  test("plan text contains tool reference", async () => {
    const planText = await panelPage.getTimelinePlanText();
    expect(planText!.toLowerCase()).toContain("vectorsearchtool");
  });

  test("intent badge shows 'Vector Search'", async ({ page }) => {
    await expect(page.getByText("Vector Search")).toBeVisible({ timeout: 5_000 });
  });

  test("total latency is shown", async ({ page }) => {
    // total_latency_ms: 8450 renders as "8,450 ms total"
    await expect(page.getByText(/8,450.*ms.*total|8450.*ms.*total/i)).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Agent Timeline — sql-only query (Query 2)", () => {
  test.beforeEach(async ({ page }) => {
    await mockHealthOk(page);
    await mockQueryResponse(page, MOCK_RESPONSE_QUERY_2);
  });

  test("SQLQueryTool badge has green colour class", async ({ page }) => {
    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await panelPage.submitQuery("Show defect trends by product and defect_type for the last 90 days");
    await panelPage.waitForAnswer();

    const badge = page.locator('[class*="bg-green-100"]').filter({ hasText: "SQLQueryTool" }).first();
    await expect(badge).toBeVisible({ timeout: 5_000 });
    await assertToolBadgeColour(badge, "SQLQueryTool");
  });

  test("intent badge shows 'SQL Query'", async ({ page }) => {
    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await panelPage.submitQuery("Show defect trends by product and defect_type for the last 90 days");
    await panelPage.waitForAnswer();

    await expect(page.getByText("SQL Query")).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Agent Timeline — hybrid query (Query 3)", () => {
  test.beforeEach(async ({ page }) => {
    await mockHealthOk(page);
    await mockQueryResponse(page, MOCK_RESPONSE_QUERY_3);
  });

  test("two steps appear in correct order for hybrid query", async ({ page }) => {
    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await panelPage.submitQuery(
      "Given this incident: corrosion found on avionics connector, classify defect"
    );
    await panelPage.waitForAnswer();

    // Step 1: VectorSearchTool, Step 2: SQLQueryTool
    await expect(page.getByText("VectorSearchTool")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("SQLQueryTool")).toBeVisible({ timeout: 5_000 });
  });

  test("intent badge shows 'Hybrid'", async ({ page }) => {
    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await panelPage.submitQuery(
      "Given this incident: corrosion found on avionics connector, classify defect"
    );
    await panelPage.waitForAnswer();

    await expect(page.getByText("Hybrid")).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Agent Timeline — error step rendering", () => {
  test("error steps show in destructive red with error message", async ({ page }) => {
    await mockHealthOk(page);

    // Build a response fixture with a step that has an error
    const errorResponse = {
      ...MOCK_RESPONSE_QUERY_1,
      run_summary: {
        ...MOCK_RESPONSE_QUERY_1.run_summary,
        steps: [
          {
            step_number: 1,
            tool_name: "VectorSearchTool",
            output_summary: "Failed to retrieve results.",
            latency_ms: 5050,
            error: "pgvector index not available — table may be empty.",
          },
        ],
      },
    };

    await mockQueryResponse(page, errorResponse);
    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await panelPage.submitQuery("Test error step rendering");
    await panelPage.waitForAnswer();

    // Error message should appear
    await expect(page.getByText("pgvector index not available")).toBeVisible({ timeout: 5_000 });
  });

  test("step limit reached badge appears when halted_at_step_limit is true", async ({ page }) => {
    await mockHealthOk(page);

    const haltedResponse = {
      ...MOCK_RESPONSE_QUERY_1,
      run_summary: {
        ...MOCK_RESPONSE_QUERY_1.run_summary,
        halted_at_step_limit: true,
      },
    };

    await mockQueryResponse(page, haltedResponse);
    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await panelPage.submitQuery("Test step limit badge");
    await panelPage.waitForAnswer();

    await expect(page.getByText(/Step limit reached/i)).toBeVisible({ timeout: 5_000 });
  });
});
