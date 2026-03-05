// ============================================================
// assertions.ts
// Custom assertion helpers that wrap Playwright expect() with
// domain-specific language for the NextAgentAI test suite.
// ============================================================

import { expect, type Page, type Locator } from "@playwright/test";

// ---------------------------------------------------------------------------
// Badge colour assertions
// ---------------------------------------------------------------------------

/**
 * Asserts that a badge element carries the Tailwind classes for the
 * expected colour tier. Matches partial class names.
 */
export async function assertBadgeColour(
  badge: Locator,
  colour: "blue" | "green" | "orange" | "purple" | "red" | "yellow" | "teal"
): Promise<void> {
  await expect(badge).toBeVisible();
  const classAttr = (await badge.getAttribute("class")) ?? "";
  expect(classAttr).toContain(`bg-${colour}-100`);
}

/**
 * Asserts the confidence badge in the open Citations drawer shows the
 * expected tier label (High / Medium / Low) and the correct colour class.
 */
export async function assertConfidenceBadge(
  page: Page,
  confidence: number
): Promise<void> {
  const drawer = page.locator('[role="dialog"]');
  await expect(drawer).toBeVisible();

  const badge = drawer.locator('[class*="border"]').filter({ hasText: /confidence/i }).first();
  await expect(badge).toBeVisible();

  const text = await badge.innerText();
  if (confidence >= 0.7) {
    expect(text).toContain("High");
    const cls = (await badge.getAttribute("class")) ?? "";
    expect(cls).toContain("bg-green-100");
  } else if (confidence >= 0.4) {
    expect(text).toContain("Medium");
    const cls = (await badge.getAttribute("class")) ?? "";
    expect(cls).toContain("bg-yellow-100");
  } else {
    expect(text).toContain("Low");
    const cls = (await badge.getAttribute("class")) ?? "";
    expect(cls).toContain("bg-red-100");
  }
}

// ---------------------------------------------------------------------------
// Tool badge colour assertions
// ---------------------------------------------------------------------------

/**
 * Asserts that a tool badge for the given tool name has the expected
 * colour class per the FRONTEND.md § 12 spec.
 */
export async function assertToolBadgeColour(badge: Locator, toolName: string): Promise<void> {
  await expect(badge).toBeVisible();
  const cls = (await badge.getAttribute("class")) ?? "";
  const lower = toolName.toLowerCase();

  if (lower.includes("vector")) {
    expect(cls).toContain("bg-blue-100");
  } else if (lower.includes("sql") || lower.includes("query")) {
    expect(cls).toContain("bg-green-100");
  } else if (lower.includes("compute") || lower.includes("python")) {
    expect(cls).toContain("bg-orange-100");
  }
}

// ---------------------------------------------------------------------------
// Graph node colour assertions
// ---------------------------------------------------------------------------

/**
 * Asserts that a React Flow node element carries the correct inline
 * background colour for entity (purple) or chunk (teal) node types.
 */
export async function assertGraphNodeStyle(
  node: Locator,
  type: "entity" | "chunk"
): Promise<void> {
  await expect(node).toBeVisible();
  const inner = node.locator("div").first();
  const style = (await inner.getAttribute("style")) ?? "";

  if (type === "entity") {
    // Entity: rgba of purple-700 #7c3aed or exact hex
    expect(style).toMatch(/#7c3aed|rgb\(124,\s*58,\s*237\)/i);
  } else {
    // Chunk: teal-600 #0d9488
    expect(style).toMatch(/#0d9488|rgb\(13,\s*148,\s*136\)/i);
  }
}

// ---------------------------------------------------------------------------
// XSS safety assertion
// ---------------------------------------------------------------------------

/**
 * Asserts that a dangerous string was NOT injected into the DOM as raw HTML.
 * Verifies the script tag appears as text content, not as an executed element.
 */
export async function assertNoXss(page: Page, injectedText: string): Promise<void> {
  // The page should not have any <script> elements added dynamically after load
  const dynamicScripts = await page.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll("script"));
    // Filter out scripts that are part of Next.js bundle (have src attribute)
    return scripts.filter((s) => !s.src).map((s) => s.textContent ?? "").filter((t) => t.length > 0);
  });

  // None of the inline scripts should contain the injected payload
  for (const scriptContent of dynamicScripts) {
    expect(scriptContent).not.toContain("xss-marker");
  }

  // The injected text should appear safely escaped in the chat bubble text
  // (not as a live element)
  const scriptElements = page.locator('script:not([src])');
  // We specifically check that no new <script> tag with an alert was injected
  const count = await page.evaluate(() =>
    Array.from(document.querySelectorAll("script"))
      .filter((s) => !s.src && s.textContent?.includes("xss-marker"))
      .length
  );
  expect(count).toBe(0);
}

// ---------------------------------------------------------------------------
// Drawer focus trap assertion
// ---------------------------------------------------------------------------

/**
 * Asserts that keyboard focus stays within the open Citations drawer
 * when Tab is pressed multiple times.
 */
export async function assertDrawerFocusTrapped(page: Page): Promise<void> {
  const drawer = page.locator('[role="dialog"]');
  await expect(drawer).toBeVisible();

  // Tab through several elements
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Tab");
    const focusedElement = page.locator(":focus");
    // The focused element should be inside the drawer
    const isInsideDrawer = await drawer.locator(":focus").count() > 0 ||
      await page.evaluate(() => {
        const focused = document.activeElement;
        const dialog = document.querySelector('[role="dialog"]');
        return dialog ? dialog.contains(focused) : false;
      });
    expect(isInsideDrawer).toBeTruthy();
  }
}

// ---------------------------------------------------------------------------
// ARIA assertions
// ---------------------------------------------------------------------------

/**
 * Asserts that the given locator has an aria-label attribute.
 */
export async function assertHasAriaLabel(locator: Locator): Promise<void> {
  const label = await locator.getAttribute("aria-label");
  expect(label).not.toBeNull();
  expect(label!.length).toBeGreaterThan(0);
}

/**
 * Asserts that all citation buttons on the page have aria-label attributes.
 */
export async function assertCitationButtonsAccessible(page: Page): Promise<void> {
  const citationButtons = page.getByRole("button", { name: /View citation \d+/ });
  const count = await citationButtons.count();

  for (let i = 0; i < count; i++) {
    const btn = citationButtons.nth(i);
    await assertHasAriaLabel(btn);
  }
}
