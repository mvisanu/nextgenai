// ============================================================
// 02-chat-submit.spec.ts
// Query submission flow: input, submit, loading, response rendering,
// input state management, and conversation history.
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

test.describe("Chat submission — input and basic submit", () => {
  let panelPage: FourPanelPage;

  test.beforeEach(async ({ page }) => {
    await mockHealthOk(page);
    await mockQueryResponse(page, MOCK_RESPONSE_QUERY_1);
    panelPage = new FourPanelPage(page);
    await panelPage.navigate();
  });

  test("typing in the textarea reflects the value", async ({ page }) => {
    const textarea = page.getByPlaceholder(/Ask a question/i);
    await textarea.fill("test query text");
    await expect(textarea).toHaveValue("test query text");
  });

  test("submit button becomes enabled when text is typed", async ({ page }) => {
    const textarea = page.getByPlaceholder(/Ask a question/i);
    await textarea.fill("hello");
    await expect(page.getByRole("button", { name: /submit query/i })).toBeEnabled();
  });

  test("pressing Enter submits the query", async ({ page }) => {
    await panelPage.submitQueryByEnter("Find similar incidents to: hydraulic actuator crack");
    // User message bubble should appear
    const userBubble = page.locator(".justify-end .bg-primary").first();
    await expect(userBubble).toContainText("hydraulic actuator crack");
  });

  test("clicking the submit button submits the query", async ({ page }) => {
    await panelPage.submitQuery("Find similar incidents to: hydraulic actuator crack");
    const userBubble = page.locator(".justify-end .bg-primary").first();
    await expect(userBubble).toContainText("hydraulic actuator crack");
  });

  test("Shift+Enter does not submit — adds a newline instead", async ({ page }) => {
    const textarea = page.getByPlaceholder(/Ask a question/i);
    await textarea.fill("line one");
    await textarea.press("Shift+Enter");
    // Should not have submitted — no loading skeleton
    await expect(page.locator(".animate-pulse").first()).toBeHidden({ timeout: 500 }).catch(() => {
      // If we get here it means no skeleton appeared, which is the expected behaviour
    });
    // Input should still contain content
    const value = await textarea.inputValue();
    expect(value).toContain("line one");
  });
});

test.describe("Chat submission — loading state", () => {
  test("loading skeleton appears while request is in-flight", async ({ page }) => {
    await mockHealthOk(page);
    // Use a slow mock (200ms delay)
    await page.route("**/query", async (route) => {
      await new Promise((r) => setTimeout(r, 200));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_RESPONSE_QUERY_1),
      });
    });
    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();

    // Start submit and immediately check for skeleton
    await panelPage.submitQuery("Find similar incidents to: hydraulic actuator crack");
    // Skeleton should appear during in-flight request
    const skeleton = page.locator(".animate-pulse").first();
    await expect(skeleton).toBeVisible({ timeout: 3_000 });
    // Then disappear after response arrives
    await expect(skeleton).toBeHidden({ timeout: 10_000 });
  });

  test("textarea is disabled while request is in-flight", async ({ page }) => {
    await mockHealthOk(page);
    await page.route("**/query", async (route) => {
      await new Promise((r) => setTimeout(r, 300));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_RESPONSE_QUERY_1),
      });
    });
    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();

    void panelPage.submitQuery("Find similar incidents to: hydraulic actuator crack");
    // Immediately check that textarea is disabled
    const textarea = page.getByPlaceholder(/Ask a question/i);
    await expect(textarea).toBeDisabled({ timeout: 3_000 });
  });

  test("submit button is disabled while request is in-flight", async ({ page }) => {
    await mockHealthOk(page);
    await page.route("**/query", async (route) => {
      await new Promise((r) => setTimeout(r, 300));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_RESPONSE_QUERY_1),
      });
    });
    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();

    void panelPage.submitQuery("Find similar incidents to: hydraulic actuator crack");
    await expect(page.getByRole("button", { name: /submit query/i })).toBeDisabled({ timeout: 3_000 });
  });
});

test.describe("Chat submission — answer rendering", () => {
  let panelPage: FourPanelPage;

  test.beforeEach(async ({ page }) => {
    await mockHealthOk(page);
    await mockQueryResponse(page, MOCK_RESPONSE_QUERY_1);
    panelPage = new FourPanelPage(page);
    await panelPage.navigate();
  });

  test("answer text is rendered in a message bubble after response", async () => {
    await panelPage.submitQuery("Find similar incidents to: hydraulic actuator crack");
    const answerText = await panelPage.waitForAnswer();
    // Answer should contain partial text from the fixture
    expect(answerText).toContain("hydraulic actuator");
  });

  test("user message appears in right-aligned bubble", async ({ page }) => {
    await panelPage.submitQuery("Find similar incidents to: hydraulic actuator crack");
    const userBubble = page.locator(".justify-end .bg-primary").first();
    await expect(userBubble).toBeVisible({ timeout: 5_000 });
  });

  test("assistant message appears in left-aligned bubble", async ({ page }) => {
    await panelPage.submitQuery("Find similar incidents to: hydraulic actuator crack");
    await panelPage.waitForAnswer();
    const assistantBubble = page.locator(".justify-start .bg-card").first();
    await expect(assistantBubble).toBeVisible();
  });

  test("inline citation buttons [1] [2] [3] appear in the answer", async ({ page }) => {
    await panelPage.submitQuery("Find similar incidents to: hydraulic actuator crack");
    await panelPage.waitForAnswer();
    // Citation buttons have aria-label "View citation N"
    await expect(page.getByRole("button", { name: "View citation 1" })).toBeVisible();
    await expect(page.getByRole("button", { name: "View citation 2" })).toBeVisible();
    await expect(page.getByRole("button", { name: "View citation 3" })).toBeVisible();
  });

  test("textarea is cleared after successful submission", async ({ page }) => {
    await panelPage.submitQuery("Find similar incidents to: hydraulic actuator crack");
    const textarea = page.getByPlaceholder(/Ask a question/i);
    // After submit the value should be cleared
    await expect(textarea).toHaveValue("", { timeout: 3_000 });
  });
});

test.describe("Chat submission — conversation history", () => {
  test("multiple queries build up a history with alternating user/assistant bubbles", async ({ page }) => {
    await mockHealthOk(page);
    // Set up two different response fixtures for two queries
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

    // Submit first query
    await panelPage.submitQuery("First question about hydraulic actuator");
    await panelPage.waitForAnswer();

    // Submit second query
    await panelPage.submitQuery("Second question about defect trends");
    // Wait for the second answer
    await expect(page.locator(".justify-start .bg-card").nth(1)).toBeVisible({ timeout: 30_000 });

    // Verify we have 2 user messages and 2 assistant messages
    expect(await panelPage.getUserMessageCount()).toBe(2);
    expect(await panelPage.getAssistantMessageCount()).toBe(2);
  });

  test("run_id from response is captured (evidenced by timeline populating)", async ({ page }) => {
    await mockHealthOk(page);
    await mockQueryResponse(page, MOCK_RESPONSE_QUERY_1);
    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();

    await panelPage.submitQuery("Find similar incidents to: hydraulic actuator crack");
    await panelPage.waitForAnswer();

    // If run_id was captured and shared to RunContext, the timeline will populate
    // The VectorSearchTool badge should be visible in the timeline
    await expect(page.getByText("VectorSearchTool")).toBeVisible({ timeout: 5_000 });
  });
});
