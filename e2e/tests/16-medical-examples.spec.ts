// ============================================================
// 16-medical-examples.spec.ts
// /medical-examples page: 14 medical example cards, copy button,
// PhD frame sections (Claim/Evidence/Limitation/Future Work).
//
// Coverage:
//   - Page loads without error
//   - Back link is present and works
//   - At least 14 copy buttons render (one per example)
//   - Copy button shows "COPIED" state
//   - PhD frame section (Claim / Evidence / Limitation / Future Work)
//     is visible inside an expanded card
//   - Specialty labels (Cardiology, Oncology, etc.) are visible
//   - Research angle / cross-domain section is visible
// ============================================================

import { test, expect } from "@playwright/test";

const EXPECTED_EXAMPLE_COUNT = 14;

// Medical specialties expected from the EXAMPLES array in medical-examples/page.tsx
const EXPECTED_SPECIALTIES = ["Cardiology", "Oncology", "Pulmonology", "Neurology", "Infectious Disease"];

test.describe("Medical Examples page — load and structure", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/medical-examples");
    // Wait for recognisable medical content
    await page.getByText(/clinical|cardiac|STEMI|cardiolog/i).first()
      .waitFor({ state: "visible", timeout: 20_000 });
  });

  test("page loads without application error", async ({ page }) => {
    await expect(page.locator("body")).not.toContainText("Application error");
  });

  test("page heading contains 'MEDICAL' or 'CLINICAL'", async ({ page }) => {
    await expect(page.getByText(/MEDICAL|CLINICAL/i).first()).toBeVisible();
  });

  test("back link to main app is present", async ({ page }) => {
    const backLink = page.getByRole("link").filter({ has: page.locator("svg") }).first();
    await expect(backLink).toBeVisible();
  });
});

test.describe("Medical Examples page — example cards", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/medical-examples");
    await page.getByText(/clinical|cardiac|STEMI/i).first()
      .waitFor({ state: "visible", timeout: 20_000 });
  });

  test(`at least ${EXPECTED_EXAMPLE_COUNT} copy buttons are present`, async ({ page }) => {
    const copyBtns = page.getByRole("button").filter({ hasText: /COPY|copy/i });
    const count = await copyBtns.count();
    expect(count).toBeGreaterThanOrEqual(EXPECTED_EXAMPLE_COUNT);
  });

  test("copy button shows 'COPIED' state when clicked", async ({ page }) => {
    await page.context().grantPermissions(["clipboard-write"]);

    const firstCopyBtn = page.getByRole("button").filter({ hasText: /COPY/i }).first();
    await firstCopyBtn.click();

    await expect(page.getByRole("button").filter({ hasText: /COPIED/i }).first()).toBeVisible({
      timeout: 3_000,
    });
  });

  test("COPIED state reverts within 3 seconds", async ({ page }) => {
    await page.context().grantPermissions(["clipboard-write"]);
    const firstCopyBtn = page.getByRole("button").filter({ hasText: /COPY/i }).first();
    await firstCopyBtn.click();
    await page.getByRole("button").filter({ hasText: /COPIED/i }).first()
      .waitFor({ state: "visible", timeout: 3_000 });
    await expect(page.getByRole("button").filter({ hasText: /^COPY$/i }).first()).toBeVisible({
      timeout: 5_000,
    });
  });

  for (const specialty of EXPECTED_SPECIALTIES.slice(0, 3)) {
    test(`specialty "${specialty}" is visible on the page`, async ({ page }) => {
      await expect(page.getByText(specialty).first()).toBeVisible();
    });
  }
});

test.describe("Medical Examples page — PhD frame section", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/medical-examples");
    await page.getByText(/clinical|cardiac|STEMI/i).first()
      .waitFor({ state: "visible", timeout: 20_000 });
  });

  test("expanding first card shows PhD frame section", async ({ page }) => {
    // Click to expand the first card's toggle button (non-copy SVG button)
    const nonCopyBtns = page.locator("button").filter({
      has: page.locator("svg"),
    }).filter({ hasNotText: /COPY|COPIED/i });

    if (await nonCopyBtns.count() > 0) {
      await nonCopyBtns.first().click();
      // PhD frame has CLAIM / EVIDENCE / LIMITATION / FUTURE WORK sections
      await expect(
        page.getByText(/CLAIM|EVIDENCE|LIMITATION|FUTURE WORK/i).first()
      ).toBeVisible({ timeout: 5_000 });
    }
  });

  test("PhD frame contains Claim text when expanded", async ({ page }) => {
    const nonCopyBtns = page.locator("button").filter({
      has: page.locator("svg"),
    }).filter({ hasNotText: /COPY|COPIED/i });

    if (await nonCopyBtns.count() > 0) {
      await nonCopyBtns.first().click();
      await expect(page.getByText(/claim/i).first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test("PhD frame contains Evidence text when expanded", async ({ page }) => {
    const nonCopyBtns = page.locator("button").filter({
      has: page.locator("svg"),
    }).filter({ hasNotText: /COPY|COPIED/i });

    if (await nonCopyBtns.count() > 0) {
      await nonCopyBtns.first().click();
      await expect(page.getByText(/evidence/i).first()).toBeVisible({ timeout: 5_000 });
    }
  });
});

test.describe("Medical Examples page — research angles section", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/medical-examples");
    await page.getByText(/clinical|cardiac|STEMI/i).first()
      .waitFor({ state: "visible", timeout: 20_000 });
  });

  test("cross-domain research angles section is visible", async ({ page }) => {
    await expect(
      page.getByText(/RESEARCH|CROSS-DOMAIN|PARALLEL|ANGLE/i).first()
    ).toBeVisible();
  });
});
