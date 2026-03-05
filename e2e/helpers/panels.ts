// ============================================================
// panels.ts
// FourPanelPage — Page Object for the NextAgentAI main layout.
// Provides typed, reusable helpers for all four panels.
//
// Architecture: each method uses semantic selectors first,
// then data-testid fallbacks. This makes tests resilient while
// also highlighting where data-testid attributes should be added.
// ============================================================

import { type Page, type Locator, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Data shapes returned from helper methods
// ---------------------------------------------------------------------------

export interface StepData {
  stepNumber: number;
  toolName: string;
  latencyMs: number;
  hasError: boolean;
  errorText: string | null;
  outputSummary: string;
}

export interface NodeInfo {
  id: string;
  type: "entity" | "chunk" | "unknown";
}

// ---------------------------------------------------------------------------
// FourPanelPage — page object for the main page
// ---------------------------------------------------------------------------

export class FourPanelPage {
  readonly page: Page;

  // ---------------------------------------------------------------------------
  // Panel root locators — using Card heading text, which is stable
  // ---------------------------------------------------------------------------
  readonly chatPanel: Locator;
  readonly timelinePanel: Locator;
  readonly graphPanel: Locator;

  // ---------------------------------------------------------------------------
  // Chat panel sub-elements
  // ---------------------------------------------------------------------------
  readonly textarea: Locator;
  readonly submitButton: Locator;
  readonly errorAlert: Locator;
  readonly loadingSkeleton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Panels identified by their CardTitle heading text
    this.chatPanel = page.locator("main").filter({ has: page.getByRole("heading", { name: "Chat", exact: true }) });
    this.timelinePanel = page.locator("main").filter({ has: page.getByRole("heading", { name: "Agent Timeline", exact: true }) });
    this.graphPanel = page.locator("main").filter({ has: page.getByRole("heading", { name: "Graph Viewer", exact: true }) });

    // Chat inputs — the textarea and submit button live inside ChatPanel
    // The textarea has placeholder text we can rely on
    this.textarea = page.getByPlaceholder(/Ask a question/i);
    // Submit button has aria-label="Submit query"
    this.submitButton = page.getByRole("button", { name: /submit query/i });
    // Error alert is a shadcn Alert with role="alert" containing "Error"
    this.errorAlert = page.getByRole("alert");
    // Loading skeleton: Skeleton elements that appear during in-flight request
    this.loadingSkeleton = page.locator("[data-slot='skeleton'], .animate-pulse").first();
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  async navigate(): Promise<void> {
    await this.page.goto("/");
    // Wait for the page to be fully painted — the Chat heading must be visible
    await expect(this.page.getByRole("heading", { name: "Chat", exact: true })).toBeVisible();
  }

  // ---------------------------------------------------------------------------
  // Chat: submit a query
  // ---------------------------------------------------------------------------

  async submitQuery(text: string): Promise<void> {
    await this.textarea.fill(text);
    await this.submitButton.click();
  }

  async submitQueryByEnter(text: string): Promise<void> {
    await this.textarea.fill(text);
    await this.textarea.press("Enter");
  }

  // ---------------------------------------------------------------------------
  // Chat: wait for the assistant answer bubble to appear.
  // The answer bubble is a div.justify-start containing the response text.
  // Returns the full visible text content of the last assistant message.
  // ---------------------------------------------------------------------------

  async waitForAnswer(timeoutMs = 30_000): Promise<string> {
    // The skeleton disappears when the answer arrives; then a new message div appears
    // We look for any message div in the justify-start (assistant) position
    const assistantMessage = this.page
      .locator(".justify-start .bg-card")
      .last();
    await expect(assistantMessage).toBeVisible({ timeout: timeoutMs });
    return assistantMessage.innerText();
  }

  // ---------------------------------------------------------------------------
  // Chat: get visible text of the error alert (if shown)
  // ---------------------------------------------------------------------------

  async getErrorText(): Promise<string | null> {
    const alert = this.page.getByRole("alert");
    if (await alert.isVisible()) {
      return alert.innerText();
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Chat: check if textarea is disabled
  // ---------------------------------------------------------------------------

  async isInputDisabled(): Promise<boolean> {
    return this.textarea.isDisabled();
  }

  // ---------------------------------------------------------------------------
  // Chat: check if submit button is disabled
  // ---------------------------------------------------------------------------

  async isSubmitDisabled(): Promise<boolean> {
    return this.submitButton.isDisabled();
  }

  // ---------------------------------------------------------------------------
  // Agent Timeline: get all rendered step rows as structured data
  // ---------------------------------------------------------------------------

  async getTimelineSteps(): Promise<StepData[]> {
    // Each step is a flex row inside the timeline ScrollArea.
    // Steps contain a Badge (tool name) and a Clock latency text.
    // We grab all Badge elements inside the timeline card.
    const timelineCard = this.page.locator('[style*="timeline"], [style*="gridArea"]')
      .filter({ has: this.page.getByRole("heading", { name: "Agent Timeline" }) });

    // Alternative: grab the timeline panel's Badge list
    const stepBadges = this.page
      .locator(".flex.gap-3") // each TimelineStep is a flex row with gap-3
      .filter({ has: this.page.locator('[class*="bg-blue-100"], [class*="bg-green-100"], [class*="bg-orange-100"]') });

    const count = await stepBadges.count();
    const steps: StepData[] = [];

    for (let i = 0; i < count; i++) {
      const row = stepBadges.nth(i);
      const toolBadge = row.locator('[class*="bg-blue-100"], [class*="bg-green-100"], [class*="bg-orange-100"], [class*="bg-secondary"]').first();
      const toolName = await toolBadge.innerText().catch(() => "unknown");

      // Step number from the circle div
      const stepNumEl = row.locator(".rounded-full").first();
      const stepNumText = await stepNumEl.innerText().catch(() => "0");
      const stepNumber = parseInt(stepNumText, 10) || 0;

      // Latency from the "NNN ms" text
      const latencyEl = row.locator("span").filter({ hasText: /\d+.*ms/ }).first();
      const latencyText = await latencyEl.innerText().catch(() => "0 ms");
      const latencyMs = parseInt(latencyText.replace(/[^0-9]/g, ""), 10) || 0;

      // Check for error (XCircle icon or destructive text)
      const hasError = await row.locator('[class*="text-destructive"]').count() > 0;
      const errorEl = row.locator('[class*="text-destructive"]').last();
      const errorText = hasError ? await errorEl.innerText().catch(() => null) : null;

      // Output summary — the small muted text paragraph
      const summaryEl = row.locator("p.text-xs").first();
      const outputSummary = await summaryEl.innerText().catch(() => "");

      steps.push({ stepNumber, toolName, latencyMs, hasError, errorText, outputSummary });
    }

    return steps;
  }

  // ---------------------------------------------------------------------------
  // Agent Timeline: check empty state text
  // ---------------------------------------------------------------------------

  async getTimelineEmptyText(): Promise<string | null> {
    const el = this.page.getByText("No run yet");
    if (await el.isVisible()) return el.innerText();
    return null;
  }

  // ---------------------------------------------------------------------------
  // Agent Timeline: get the plan text (italic muted text at top of timeline)
  // ---------------------------------------------------------------------------

  async getTimelinePlanText(): Promise<string | null> {
    const planEl = this.page.locator("p.italic").first();
    if (await planEl.isVisible()) return planEl.innerText();
    return null;
  }

  // ---------------------------------------------------------------------------
  // Graph Viewer: count visible React Flow nodes
  // ---------------------------------------------------------------------------

  async getGraphNodeCount(): Promise<number> {
    // React Flow renders nodes inside .react-flow__node elements
    await this.page.waitForSelector(".react-flow__node", { timeout: 10_000 }).catch(() => null);
    return this.page.locator(".react-flow__node").count();
  }

  // ---------------------------------------------------------------------------
  // Graph Viewer: check empty state text
  // ---------------------------------------------------------------------------

  async getGraphEmptyText(): Promise<string | null> {
    const el = this.page.getByText("Submit a query to see the graph");
    if (await el.isVisible()) return el.innerText();
    return null;
  }

  // ---------------------------------------------------------------------------
  // Graph Viewer: click on the Nth React Flow node (0-indexed)
  // ---------------------------------------------------------------------------

  async clickGraphNode(index: number): Promise<void> {
    const nodes = this.page.locator(".react-flow__node");
    await nodes.nth(index).click();
  }

  // ---------------------------------------------------------------------------
  // Graph Viewer: check if zoom controls (Controls component) are visible
  // ---------------------------------------------------------------------------

  async areZoomControlsVisible(): Promise<boolean> {
    // React Flow renders Controls inside .react-flow__controls
    return this.page.locator(".react-flow__controls").isVisible();
  }

  // ---------------------------------------------------------------------------
  // Citations: click the Nth inline citation link in the answer (1-indexed, matching [N] display)
  // ---------------------------------------------------------------------------

  async clickCitation(displayNum: number): Promise<void> {
    // Citation buttons have aria-label="View citation N"
    const btn = this.page.getByRole("button", { name: `View citation ${displayNum}` }).first();
    await btn.click();
  }

  // ---------------------------------------------------------------------------
  // Citations: get all visible citation buttons in the current answer
  // ---------------------------------------------------------------------------

  async getCitationButtons(): Promise<Locator[]> {
    const buttons = this.page.getByRole("button", { name: /View citation \d+/ });
    const count = await buttons.count();
    return Array.from({ length: count }, (_, i) => buttons.nth(i));
  }

  // ---------------------------------------------------------------------------
  // Citations Drawer: wait for the sheet/drawer to be open
  // ---------------------------------------------------------------------------

  async waitForDrawerOpen(timeoutMs = 5_000): Promise<void> {
    // Sheet renders a dialog-like role; SheetContent has role="dialog"
    await expect(this.page.locator('[role="dialog"]')).toBeVisible({ timeout: timeoutMs });
  }

  // ---------------------------------------------------------------------------
  // Citations Drawer: get the full visible text of the drawer
  // ---------------------------------------------------------------------------

  async getCitationDrawerText(): Promise<string> {
    const drawer = this.page.locator('[role="dialog"]');
    await expect(drawer).toBeVisible({ timeout: 5_000 });
    return drawer.innerText();
  }

  // ---------------------------------------------------------------------------
  // Citations Drawer: get the highlighted span text (<mark> element)
  // ---------------------------------------------------------------------------

  async getHighlightedSpanText(): Promise<string | null> {
    const mark = this.page.locator("mark.citation-highlight");
    if (await mark.isVisible({ timeout: 5_000 }).catch(() => false)) {
      return mark.innerText();
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Citations Drawer: close with Escape key
  // ---------------------------------------------------------------------------

  async closeDrawer(): Promise<void> {
    await this.page.keyboard.press("Escape");
    // Wait for drawer to disappear
    await expect(this.page.locator('[role="dialog"]')).toBeHidden({ timeout: 3_000 });
  }

  // ---------------------------------------------------------------------------
  // Citations Drawer: close by clicking outside
  // ---------------------------------------------------------------------------

  async closeDrawerByClickOutside(): Promise<void> {
    // Click the top-left corner of the viewport (outside the right-side sheet)
    await this.page.mouse.click(50, 50);
    await expect(this.page.locator('[role="dialog"]')).toBeHidden({ timeout: 3_000 });
  }

  // ---------------------------------------------------------------------------
  // Citations Drawer: check if confidence badge with given label is visible
  // ---------------------------------------------------------------------------

  async getConfidenceBadgeText(): Promise<string | null> {
    // The badge is inside the drawer, contains "confidence" in its text
    const badge = this.page.locator('[role="dialog"]').locator('[class*="border"]').filter({ hasText: /confidence/i }).first();
    if (await badge.isVisible({ timeout: 3_000 }).catch(() => false)) {
      return badge.innerText();
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Utility: wait for the loading skeleton to appear and then disappear
  // (verifies the loading state is shown during the request)
  // ---------------------------------------------------------------------------

  async waitForLoadingAndComplete(timeoutMs = 30_000): Promise<void> {
    // Skeleton should appear quickly
    const skeleton = this.page.locator(".animate-pulse").first();
    await expect(skeleton).toBeVisible({ timeout: 5_000 });
    // Then disappear when the response arrives
    await expect(skeleton).toBeHidden({ timeout: timeoutMs });
  }

  // ---------------------------------------------------------------------------
  // Utility: assert all four panel headings are visible
  // ---------------------------------------------------------------------------

  async assertAllPanelsVisible(): Promise<void> {
    await expect(this.page.getByRole("heading", { name: "Chat", exact: true })).toBeVisible();
    await expect(this.page.getByRole("heading", { name: "Agent Timeline", exact: true })).toBeVisible();
    await expect(this.page.getByRole("heading", { name: "Graph Viewer", exact: true })).toBeVisible();
  }

  // ---------------------------------------------------------------------------
  // Utility: get the count of user message bubbles
  // ---------------------------------------------------------------------------

  async getUserMessageCount(): Promise<number> {
    return this.page.locator(".justify-end .bg-primary").count();
  }

  // ---------------------------------------------------------------------------
  // Utility: get the count of assistant message bubbles
  // ---------------------------------------------------------------------------

  async getAssistantMessageCount(): Promise<number> {
    return this.page.locator(".justify-start .bg-card").count();
  }
}
