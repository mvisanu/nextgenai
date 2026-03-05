// ============================================================
// 12-domain-switcher.spec.ts
// Domain switcher: aircraft ↔ medical updates UI correctly,
// persists to localStorage, and propagates to dashboard tabs.
//
// Coverage:
//   - Aircraft → Medical updates chat placeholder text
//   - Aircraft → Medical updates graph panel label
//   - Aircraft → Medical shows medical disclaimer in chat
//   - Medical → Aircraft reverts all of the above
//   - Domain choice persists after page reload (localStorage)
//   - Dashboard tab labels relabel per domain
//   - Domain banner shows correct text per domain
// ============================================================

import { test, expect } from "@playwright/test";
import { NavPage, DashboardPage } from "../helpers/nav-page";
import { mockHealthOk } from "../fixtures/api-mock";

// Aircraft placeholder from DOMAIN_CONFIGS
const AIRCRAFT_PLACEHOLDER =
  "Describe the maintenance issue, defect pattern, or ask about incident trends";
// Medical placeholder from DOMAIN_CONFIGS
const MEDICAL_PLACEHOLDER =
  "Describe the clinical presentation or ask about disease patterns and case trends";

test.describe("Domain Switcher — main page (/) aircraft → medical", () => {
  test.beforeEach(async ({ page }) => {
    await mockHealthOk(page);
    await page.goto("/");
    // Ensure we start from aircraft domain by clearing localStorage
    await page.evaluate(() => localStorage.removeItem("nextai_domain"));
    await page.reload();
    await page.getByRole("button", { name: /AIRCRAFT/i }).waitFor({ state: "visible" });
  });

  test("AIRCRAFT domain button is visible in the header", async ({ page }) => {
    await expect(page.getByRole("button", { name: /AIRCRAFT/i })).toBeVisible();
  });

  test("MEDICAL domain button is visible in the header", async ({ page }) => {
    await expect(page.getByRole("button", { name: /MEDICAL/i })).toBeVisible();
  });

  test("default domain is aircraft — textarea has aircraft placeholder", async ({ page }) => {
    const textarea = page.locator("textarea.industrial-textarea, textarea[placeholder]").first();
    await expect(textarea).toBeVisible();
    const placeholder = await textarea.getAttribute("placeholder") ?? "";
    expect(placeholder.toLowerCase()).toContain("maintenance");
  });

  test("switching to medical updates the chat textarea placeholder", async ({ page }) => {
    const nav = new NavPage(page);
    await nav.setDomain("medical");

    const textarea = page.locator("textarea").first();
    const placeholder = await textarea.getAttribute("placeholder") ?? "";
    expect(placeholder.toLowerCase()).toContain("clinical");
  });

  test("switching to medical shows the medical disclaimer text", async ({ page }) => {
    const nav = new NavPage(page);
    await nav.setDomain("medical");

    // Disclaimer from DOMAIN_CONFIGS.medical.disclaimer
    await expect(
      page.getByText(/AI-generated analysis for research purposes only/i)
    ).toBeVisible({ timeout: 5_000 });
  });

  test("switching to medical changes the graph panel label to include CLINICAL", async ({ page }) => {
    const nav = new NavPage(page);
    await nav.setDomain("medical");

    // IndustrialPanel label for graph changes to "CLINICAL KNOWLEDGE GRAPH // REACTFLOW"
    await expect(
      page.getByText(/CLINICAL KNOWLEDGE GRAPH/i)
    ).toBeVisible({ timeout: 5_000 });
  });

  test("switching back to aircraft removes the medical disclaimer", async ({ page }) => {
    const nav = new NavPage(page);
    await nav.setDomain("medical");
    // Confirm disclaimer is visible
    await expect(page.getByText(/AI-generated analysis for research purposes only/i)).toBeVisible();

    await nav.setDomain("aircraft");
    // Disclaimer should no longer be visible
    await expect(page.getByText(/AI-generated analysis for research purposes only/i)).toBeHidden({
      timeout: 5_000,
    });
  });

  test("switching back to aircraft reverts graph label to KNOWLEDGE GRAPH", async ({ page }) => {
    const nav = new NavPage(page);
    await nav.setDomain("medical");
    await nav.setDomain("aircraft");

    await expect(page.getByText(/CLINICAL KNOWLEDGE GRAPH/i)).toBeHidden({ timeout: 5_000 });
    await expect(page.getByText(/KNOWLEDGE GRAPH/i)).toBeVisible({ timeout: 5_000 });
  });

  test("switching back to aircraft restores maintenance placeholder", async ({ page }) => {
    const nav = new NavPage(page);
    await nav.setDomain("medical");
    await nav.setDomain("aircraft");

    const textarea = page.locator("textarea").first();
    const placeholder = await textarea.getAttribute("placeholder") ?? "";
    expect(placeholder.toLowerCase()).toContain("maintenance");
  });
});

test.describe("Domain Switcher — localStorage persistence", () => {
  test.beforeEach(async ({ page }) => {
    await mockHealthOk(page);
  });

  test("selecting medical domain writes 'medical' to localStorage", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.removeItem("nextai_domain"));
    await page.reload();

    const nav = new NavPage(page);
    await page.getByRole("button", { name: /AIRCRAFT/i }).waitFor({ state: "visible" });
    await nav.setDomain("medical");

    const stored = await page.evaluate(() => localStorage.getItem("nextai_domain"));
    expect(stored).toBe("medical");
  });

  test("medical domain persists after page reload", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.removeItem("nextai_domain"));
    await page.reload();

    const nav = new NavPage(page);
    await page.getByRole("button", { name: /AIRCRAFT/i }).waitFor({ state: "visible" });
    await nav.setDomain("medical");

    // Reload page — domain should still be medical
    await page.reload();
    await page.getByRole("button", { name: /AIRCRAFT/i }).waitFor({ state: "visible" });

    const textarea = page.locator("textarea").first();
    const placeholder = await textarea.getAttribute("placeholder") ?? "";
    expect(placeholder.toLowerCase()).toContain("clinical");
  });

  test("aircraft domain persists after page reload", async ({ page }) => {
    await page.goto("/");
    // Explicitly set aircraft
    await page.evaluate(() => localStorage.setItem("nextai_domain", "aircraft"));
    await page.reload();
    await page.getByRole("button", { name: /AIRCRAFT/i }).waitFor({ state: "visible" });

    const textarea = page.locator("textarea").first();
    const placeholder = await textarea.getAttribute("placeholder") ?? "";
    expect(placeholder.toLowerCase()).toContain("maintenance");
  });

  test("domain preference follows user from main page to dashboard", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.removeItem("nextai_domain"));
    await page.reload();

    const nav = new NavPage(page);
    await page.getByRole("button", { name: /AIRCRAFT/i }).waitFor({ state: "visible" });
    await nav.setDomain("medical");

    // Navigate to dashboard — it should also read the persisted domain
    await page.goto("/dashboard");
    const stored = await page.evaluate(() => localStorage.getItem("nextai_domain"));
    expect(stored).toBe("medical");
  });
});

test.describe("Domain Switcher — dashboard tab relabelling", () => {
  test.beforeEach(async ({ page }) => {
    await mockHealthOk(page);
  });

  test("aircraft domain: first tab contains 'AGENT' text", async ({ page }) => {
    await page.evaluate(() => localStorage.setItem("nextai_domain", "aircraft"));
    const dash = new DashboardPage(page);
    await dash.navigate();

    // useTabs with isMedical=false: shortLabel="AGENT"
    const nav = page.locator("nav.tab-nav-scroll, [class*='tab-nav-scroll']");
    await expect(nav.getByRole("button").filter({ hasText: /AGENT/i }).first()).toBeVisible();
  });

  test("aircraft domain: second tab contains 'INCIDENTS' text", async ({ page }) => {
    await page.evaluate(() => localStorage.setItem("nextai_domain", "aircraft"));
    const dash = new DashboardPage(page);
    await dash.navigate();

    const nav = page.locator("nav.tab-nav-scroll, [class*='tab-nav-scroll']");
    await expect(nav.getByRole("button").filter({ hasText: /INCIDENTS/i }).first()).toBeVisible();
  });

  test("aircraft domain: third tab contains 'DEFECTS' text", async ({ page }) => {
    await page.evaluate(() => localStorage.setItem("nextai_domain", "aircraft"));
    const dash = new DashboardPage(page);
    await dash.navigate();

    const nav = page.locator("nav.tab-nav-scroll, [class*='tab-nav-scroll']");
    await expect(nav.getByRole("button").filter({ hasText: /DEFECTS/i }).first()).toBeVisible();
  });

  test("medical domain: second tab contains 'CASES' text", async ({ page }) => {
    await page.evaluate(() => localStorage.setItem("nextai_domain", "medical"));
    const dash = new DashboardPage(page);
    await dash.navigate();

    const nav = page.locator("nav.tab-nav-scroll, [class*='tab-nav-scroll']");
    await expect(nav.getByRole("button").filter({ hasText: /CASES/i }).first()).toBeVisible();
  });

  test("medical domain: third tab contains 'DISEASE' text", async ({ page }) => {
    await page.evaluate(() => localStorage.setItem("nextai_domain", "medical"));
    const dash = new DashboardPage(page);
    await dash.navigate();

    const nav = page.locator("nav.tab-nav-scroll, [class*='tab-nav-scroll']");
    await expect(nav.getByRole("button").filter({ hasText: /DISEASE/i }).first()).toBeVisible();
  });

  test("medical domain: fourth tab contains 'COHORT' text", async ({ page }) => {
    await page.evaluate(() => localStorage.setItem("nextai_domain", "medical"));
    const dash = new DashboardPage(page);
    await dash.navigate();

    const nav = page.locator("nav.tab-nav-scroll, [class*='tab-nav-scroll']");
    await expect(nav.getByRole("button").filter({ hasText: /COHORT/i }).first()).toBeVisible();
  });

  test("switching domain on dashboard updates tab labels", async ({ page }) => {
    await page.evaluate(() => localStorage.setItem("nextai_domain", "aircraft"));
    const dash = new DashboardPage(page);
    await dash.navigate();

    // Switch to medical
    const nav = new NavPage(page);
    await nav.setDomain("medical");

    // CASES tab should now be visible instead of INCIDENTS
    const tabNav = page.locator("nav.tab-nav-scroll, [class*='tab-nav-scroll']");
    await expect(tabNav.getByRole("button").filter({ hasText: /CASES/i }).first()).toBeVisible({
      timeout: 5_000,
    });
  });
});

test.describe("Domain Switcher — domain banner on dashboard", () => {
  test("aircraft domain shows MANUFACTURING INTELLIGENCE MODE banner", async ({ page }) => {
    await mockHealthOk(page);
    await page.evaluate(() => localStorage.setItem("nextai_domain", "aircraft"));
    await page.goto("/dashboard");

    await expect(page.getByText(/MANUFACTURING INTELLIGENCE MODE/i)).toBeVisible({ timeout: 10_000 });
  });

  test("medical domain shows CLINICAL INTELLIGENCE MODE banner", async ({ page }) => {
    await mockHealthOk(page);
    await page.evaluate(() => localStorage.setItem("nextai_domain", "medical"));
    await page.goto("/dashboard");

    await expect(page.getByText(/CLINICAL INTELLIGENCE MODE/i)).toBeVisible({ timeout: 10_000 });
  });

  test("aircraft domain banner shows AIRCRAFT badge", async ({ page }) => {
    await mockHealthOk(page);
    await page.evaluate(() => localStorage.setItem("nextai_domain", "aircraft"));
    await page.goto("/dashboard");

    await expect(page.getByText(/^AIRCRAFT$/)).toBeVisible({ timeout: 10_000 });
  });

  test("medical domain banner shows MEDICAL badge", async ({ page }) => {
    await mockHealthOk(page);
    await page.evaluate(() => localStorage.setItem("nextai_domain", "medical"));
    await page.goto("/dashboard");

    await expect(page.getByText(/^MEDICAL$/)).toBeVisible({ timeout: 10_000 });
  });
});
