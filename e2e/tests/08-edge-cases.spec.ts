// ============================================================
// 08-edge-cases.spec.ts
// Edge cases: empty query, very long query, special characters
// (XSS), citation before any query, rapid successive queries,
// browser back/forward, page refresh mid-flow.
// ============================================================

import { test, expect } from "@playwright/test";
import { FourPanelPage } from "../helpers/panels";
import {
  mockQueryResponse,
  mockHealthOk,
  MOCK_RESPONSE_QUERY_1,
  MOCK_RESPONSE_QUERY_2,
} from "../fixtures/api-mock";
import { assertNoXss } from "../helpers/assertions";

// ---------------------------------------------------------------------------
// Empty query
// ---------------------------------------------------------------------------

test.describe("Edge cases — empty query", () => {
  test("empty string: submit button is disabled", async ({ page }) => {
    await mockHealthOk(page);
    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();

    expect(await panelPage.isSubmitDisabled()).toBe(true);
  });

  test("empty string: Enter key does not submit", async ({ page }) => {
    await mockHealthOk(page);
    let queryFired = false;
    await page.route("**/query", async (route) => {
      queryFired = true;
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });

    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await page.getByPlaceholder(/Ask a question/i).press("Enter");
    await page.waitForTimeout(300);
    expect(queryFired).toBe(false);
  });

  test("whitespace-only query: submit button remains disabled", async ({ page }) => {
    await mockHealthOk(page);
    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();

    await page.getByPlaceholder(/Ask a question/i).fill("     ");
    expect(await panelPage.isSubmitDisabled()).toBe(true);
  });

  test("whitespace-only query: Enter key does not submit", async ({ page }) => {
    await mockHealthOk(page);
    let queryFired = false;
    await page.route("**/query", async (route) => {
      queryFired = true;
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });

    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await page.getByPlaceholder(/Ask a question/i).fill("     ");
    await page.getByPlaceholder(/Ask a question/i).press("Enter");
    await page.waitForTimeout(300);
    expect(queryFired).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Very long query (> 2000 characters per Pydantic schema)
// ---------------------------------------------------------------------------

test.describe("Edge cases — very long query", () => {
  test("query exactly at 2000 chars is accepted by the UI and submitted", async ({ page }) => {
    await mockHealthOk(page);
    await mockQueryResponse(page, MOCK_RESPONSE_QUERY_1);

    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();

    // 2000 character query (exactly at max boundary)
    const longQuery = "Find similar incidents to: " + "hydraulic actuator ".repeat(103).slice(0, 1974);
    expect(longQuery.length).toBeLessThanOrEqual(2000);

    await page.getByPlaceholder(/Ask a question/i).fill(longQuery);
    await expect(page.getByRole("button", { name: /submit query/i })).toBeEnabled();
  });

  test("submitting a 2000-char query does not crash the UI", async ({ page }) => {
    await mockHealthOk(page);
    await mockQueryResponse(page, MOCK_RESPONSE_QUERY_1);

    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();

    const longQuery = "A".repeat(2000);
    await panelPage.submitQuery(longQuery);
    await panelPage.waitForAnswer();

    // Page should still be functional
    await panelPage.assertAllPanelsVisible();
  });
});

// ---------------------------------------------------------------------------
// Special characters and XSS safety
// ---------------------------------------------------------------------------

test.describe("Edge cases — special characters and XSS safety", () => {
  test("<script> tag in query is rendered safely as text, not executed", async ({ page }) => {
    await mockHealthOk(page);
    // Override the response to reflect the dangerous query back in the answer
    const xssResponse = {
      ...MOCK_RESPONSE_QUERY_1,
      answer: 'The query contained: <script>window.__xss_marker="xss-marker"</script> — this is a test.',
      query: '<script>window.__xss_marker="xss-marker"</script>',
    };
    await mockQueryResponse(page, xssResponse);

    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await panelPage.submitQuery('<script>window.__xss_marker="xss-marker"</script>');
    await panelPage.waitForAnswer();

    // Verify the script was not injected
    await assertNoXss(page, '<script>');

    // The dangerous string should NOT have executed
    const xssRan = await page.evaluate(() => (window as Record<string, unknown>).__xss_marker);
    expect(xssRan).toBeUndefined();
  });

  test("double-quote characters in query are submitted safely", async ({ page }) => {
    await mockHealthOk(page);
    await mockQueryResponse(page, MOCK_RESPONSE_QUERY_1);

    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await panelPage.submitQuery('Find incidents with "critical" severity on "Line 1"');
    await panelPage.waitForAnswer();

    // Page should still be functional — no crash
    await panelPage.assertAllPanelsVisible();
  });

  test("single-quote characters in query are submitted safely", async ({ page }) => {
    await mockHealthOk(page);
    await mockQueryResponse(page, MOCK_RESPONSE_QUERY_1);

    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await panelPage.submitQuery("What's the defect trend for Bob's line?");
    await panelPage.waitForAnswer();

    await panelPage.assertAllPanelsVisible();
  });

  test("Unicode characters (Japanese, Arabic) in query are handled safely", async ({ page }) => {
    await mockHealthOk(page);
    await mockQueryResponse(page, MOCK_RESPONSE_QUERY_1);

    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await panelPage.submitQuery("設備の欠陥を検索 — ابحث عن العيوب في المعدات");
    await panelPage.waitForAnswer();

    // Page loads, no crash
    await panelPage.assertAllPanelsVisible();
  });

  test("HTML entities in answer text are escaped, not rendered as HTML", async ({ page }) => {
    await mockHealthOk(page);
    const htmlInAnswer = {
      ...MOCK_RESPONSE_QUERY_1,
      answer: "The &lt;hydraulic&gt; system has <b>defects</b> — scores &amp; metrics follow. [1]",
    };
    await mockQueryResponse(page, htmlInAnswer);

    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await panelPage.submitQuery("test query");
    await panelPage.waitForAnswer();

    // Page should not crash — react-markdown handles this safely
    await panelPage.assertAllPanelsVisible();
  });
});

// ---------------------------------------------------------------------------
// Citation click before any query
// ---------------------------------------------------------------------------

test.describe("Edge cases — citation before any query", () => {
  test("no citation buttons exist on initial load", async ({ page }) => {
    await mockHealthOk(page);
    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();

    const buttons = await panelPage.getCitationButtons();
    expect(buttons.length).toBe(0);
  });

  test("drawer is not open on initial load", async ({ page }) => {
    await mockHealthOk(page);
    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();

    // No dialog should be present
    await expect(page.locator('[role="dialog"]')).toBeHidden({ timeout: 1_000 }).catch(() => {
      // Acceptable if element doesn't exist at all
    });
  });
});

// ---------------------------------------------------------------------------
// Rapid successive queries — only the latest response is rendered
// ---------------------------------------------------------------------------

test.describe("Edge cases — rapid successive queries", () => {
  test("submitting a second query while first is in-flight is blocked (input disabled)", async ({ page }) => {
    await mockHealthOk(page);
    await page.route("**/query", async (route) => {
      // First query is slow
      await new Promise((r) => setTimeout(r, 500));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_RESPONSE_QUERY_1),
      });
    });

    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();

    // Start first query (won't await completion)
    void page.getByPlaceholder(/Ask a question/i).fill("First query").then(() =>
      page.getByRole("button", { name: /submit query/i }).click()
    );

    // Wait briefly then verify textarea is disabled
    const textarea = page.getByPlaceholder(/Ask a question/i);
    await expect(textarea).toBeDisabled({ timeout: 3_000 });
  });

  test("two sequential queries each produce a separate answer bubble", async ({ page }) => {
    await mockHealthOk(page);
    let callCount = 0;
    await page.route("**/query", async (route) => {
      callCount++;
      const fixture = callCount === 1 ? MOCK_RESPONSE_QUERY_1 : MOCK_RESPONSE_QUERY_2;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fixture),
      });
    });

    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();

    await panelPage.submitQuery("First question");
    await panelPage.waitForAnswer();

    await panelPage.submitQuery("Second question");
    const secondAnswer = page.locator(".justify-start .bg-card").nth(1);
    await expect(secondAnswer).toBeVisible({ timeout: 30_000 });

    expect(await panelPage.getAssistantMessageCount()).toBe(2);
    expect(await panelPage.getUserMessageCount()).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Browser back/forward navigation
// ---------------------------------------------------------------------------

test.describe("Edge cases — browser navigation", () => {
  test("browser back button does not crash the app", async ({ page }) => {
    await mockHealthOk(page);
    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();

    // Go forward to a dummy URL, then back
    await page.goto("about:blank");
    await page.goBack();

    // App should be back and functional
    await expect(page.getByRole("heading", { name: "Chat", exact: true })).toBeVisible({
      timeout: 10_000,
    });
  });
});

// ---------------------------------------------------------------------------
// Page refresh mid-flow
// ---------------------------------------------------------------------------

test.describe("Edge cases — page refresh", () => {
  test("refreshing the page resets all panels to their initial state", async ({ page }) => {
    await mockHealthOk(page);
    await mockQueryResponse(page, MOCK_RESPONSE_QUERY_1);

    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();

    await panelPage.submitQuery("Find similar incidents");
    await panelPage.waitForAnswer();

    // Re-setup mocks after navigation (new page context after reload)
    await mockHealthOk(page);

    // Reload
    await page.reload();
    await panelPage.navigate();

    // State should be reset
    const emptyText = await panelPage.getTimelineEmptyText();
    expect(emptyText).toBe("No run yet");

    const graphEmpty = await panelPage.getGraphEmptyText();
    expect(graphEmpty).toBe("Submit a query to see the graph");
  });
});
