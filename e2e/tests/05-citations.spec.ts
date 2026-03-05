// ============================================================
// 05-citations.spec.ts
// Citations drawer: inline link rendering, drawer open/close,
// chunk text with highlighted span, confidence badge colours,
// Escape key, outside click, sequential citations.
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
import { assertConfidenceBadge } from "../helpers/assertions";

// ---------------------------------------------------------------------------
// Shared setup for most citation tests (uses Query 1 fixtures)
// ---------------------------------------------------------------------------
async function setupWithQuery1(page: import("@playwright/test").Page) {
  await mockHealthOk(page);
  await mockQueryResponse(page, MOCK_RESPONSE_QUERY_1);
  await mockChunkResponse(page, MOCK_CHUNK_HYDRAULIC);
  const panelPage = new FourPanelPage(page);
  await panelPage.navigate();
  await panelPage.submitQuery("Find similar incidents to: hydraulic actuator crack");
  await panelPage.waitForAnswer();
  return panelPage;
}

test.describe("Citations — inline link rendering", () => {
  test("answer text contains [1] citation button", async ({ page }) => {
    await setupWithQuery1(page);
    await expect(page.getByRole("button", { name: "View citation 1" })).toBeVisible();
  });

  test("answer text contains [2] citation button", async ({ page }) => {
    await setupWithQuery1(page);
    await expect(page.getByRole("button", { name: "View citation 2" })).toBeVisible();
  });

  test("answer text contains [3] citation button", async ({ page }) => {
    await setupWithQuery1(page);
    await expect(page.getByRole("button", { name: "View citation 3" })).toBeVisible();
  });

  test("citation buttons display their number as text", async ({ page }) => {
    await setupWithQuery1(page);
    const btn1 = page.getByRole("button", { name: "View citation 1" }).first();
    await expect(btn1).toContainText("1");
  });
});

test.describe("Citations — drawer opens and closes", () => {
  test("clicking [1] opens the Citations drawer", async ({ page }) => {
    const panelPage = await setupWithQuery1(page);
    await panelPage.clickCitation(1);
    await panelPage.waitForDrawerOpen();
  });

  test("drawer has role='dialog'", async ({ page }) => {
    const panelPage = await setupWithQuery1(page);
    await panelPage.clickCitation(1);
    await panelPage.waitForDrawerOpen();
    await expect(page.locator('[role="dialog"]')).toBeVisible();
  });

  test("drawer title shows 'Citation [1]'", async ({ page }) => {
    const panelPage = await setupWithQuery1(page);
    await panelPage.clickCitation(1);
    await panelPage.waitForDrawerOpen();
    await expect(page.getByText("Citation [1]")).toBeVisible();
  });

  test("pressing Escape closes the drawer", async ({ page }) => {
    const panelPage = await setupWithQuery1(page);
    await panelPage.clickCitation(1);
    await panelPage.waitForDrawerOpen();
    await panelPage.closeDrawer();
    await expect(page.locator('[role="dialog"]')).toBeHidden({ timeout: 3_000 });
  });

  test("clicking outside the drawer closes it", async ({ page }) => {
    const panelPage = await setupWithQuery1(page);
    await panelPage.clickCitation(1);
    await panelPage.waitForDrawerOpen();
    await panelPage.closeDrawerByClickOutside();
    await expect(page.locator('[role="dialog"]')).toBeHidden({ timeout: 3_000 });
  });
});

test.describe("Citations — chunk text and highlight", () => {
  test("drawer shows chunk text from the mocked chunk response", async ({ page }) => {
    const panelPage = await setupWithQuery1(page);
    await panelPage.clickCitation(1);
    await panelPage.waitForDrawerOpen();

    // The chunk text contains "hydraulic actuator rod" from MOCK_CHUNK_HYDRAULIC
    await expect(page.locator('[role="dialog"]')).toContainText("hydraulic actuator rod", {
      timeout: 5_000,
    });
  });

  test("cited span is wrapped in a <mark> element with citation-highlight class", async ({ page }) => {
    const panelPage = await setupWithQuery1(page);
    await panelPage.clickCitation(1);
    await panelPage.waitForDrawerOpen();

    const mark = page.locator("mark.citation-highlight");
    await expect(mark).toBeVisible({ timeout: 5_000 });
  });

  test("highlighted span text comes from the correct char_start..char_end range", async ({ page }) => {
    const panelPage = await setupWithQuery1(page);
    await panelPage.clickCitation(1);
    await panelPage.waitForDrawerOpen();

    const highlightedText = await panelPage.getHighlightedSpanText();
    // char_start=12, char_end=80 of MOCK_CHUNK_HYDRAULIC.chunk_text
    const expectedHighlight = MOCK_CHUNK_HYDRAULIC.chunk_text.slice(12, 80);
    expect(highlightedText).toBe(expectedHighlight);
  });

  test("chunk metadata (system, severity) is shown in the drawer", async ({ page }) => {
    const panelPage = await setupWithQuery1(page);
    await panelPage.clickCitation(1);
    await panelPage.waitForDrawerOpen();

    // MOCK_CHUNK_HYDRAULIC.metadata: system=Hydraulics, severity=Critical
    await expect(page.locator('[role="dialog"]')).toContainText("Hydraulics", { timeout: 5_000 });
    await expect(page.locator('[role="dialog"]')).toContainText("Critical", { timeout: 3_000 });
  });

  test("loading skeleton is shown while chunk is being fetched", async ({ page }) => {
    await mockHealthOk(page);
    await mockQueryResponse(page, MOCK_RESPONSE_QUERY_1);
    // Slow down the chunk fetch
    await page.route(`**/${MOCK_CHUNK_HYDRAULIC.incident_id}/chunks/${MOCK_CHUNK_HYDRAULIC.chunk_id}`, async (route) => {
      await new Promise((r) => setTimeout(r, 300));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_CHUNK_HYDRAULIC),
      });
    });

    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await panelPage.submitQuery("Find similar incidents");
    await panelPage.waitForAnswer();
    await panelPage.clickCitation(1);
    await panelPage.waitForDrawerOpen();

    // Skeleton should appear during fetch
    const skeleton = page.locator('[role="dialog"] .animate-pulse').first();
    await expect(skeleton).toBeVisible({ timeout: 2_000 });
  });
});

test.describe("Citations — confidence badge colours", () => {
  test("high confidence (≥0.7) badge is green", async ({ page }) => {
    // MOCK_RESPONSE_QUERY_1.claims[0].confidence = 0.92 → High (green)
    await mockHealthOk(page);
    await mockQueryResponse(page, MOCK_RESPONSE_QUERY_1);
    await mockChunkResponse(page, MOCK_CHUNK_HYDRAULIC);
    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await panelPage.submitQuery("Find similar incidents to: hydraulic actuator crack");
    await panelPage.waitForAnswer();
    await panelPage.clickCitation(1);
    await panelPage.waitForDrawerOpen();

    await assertConfidenceBadge(page, 0.92);
  });

  test("medium confidence (0.4–0.69) badge is yellow", async ({ page }) => {
    // Create a fixture where claim[0].confidence = 0.55
    const mediumConfidenceResponse = {
      ...MOCK_RESPONSE_QUERY_1,
      claims: [
        { ...MOCK_RESPONSE_QUERY_1.claims[0], confidence: 0.55 },
        ...MOCK_RESPONSE_QUERY_1.claims.slice(1),
      ],
    };

    await mockHealthOk(page);
    await mockQueryResponse(page, mediumConfidenceResponse);
    await mockChunkResponse(page, MOCK_CHUNK_HYDRAULIC);

    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await panelPage.submitQuery("Find similar incidents");
    await panelPage.waitForAnswer();
    await panelPage.clickCitation(1);
    await panelPage.waitForDrawerOpen();

    await assertConfidenceBadge(page, 0.55);
  });

  test("low confidence (<0.4) badge is red", async ({ page }) => {
    const lowConfidenceResponse = {
      ...MOCK_RESPONSE_QUERY_1,
      claims: [
        { ...MOCK_RESPONSE_QUERY_1.claims[0], confidence: 0.25 },
        ...MOCK_RESPONSE_QUERY_1.claims.slice(1),
      ],
    };

    await mockHealthOk(page);
    await mockQueryResponse(page, lowConfidenceResponse);
    await mockChunkResponse(page, MOCK_CHUNK_HYDRAULIC);

    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await panelPage.submitQuery("Find similar incidents");
    await panelPage.waitForAnswer();
    await panelPage.clickCitation(1);
    await panelPage.waitForDrawerOpen();

    await assertConfidenceBadge(page, 0.25);
  });

  test("boundary: confidence exactly 0.7 is treated as High (green)", async ({ page }) => {
    const boundaryResponse = {
      ...MOCK_RESPONSE_QUERY_1,
      claims: [
        { ...MOCK_RESPONSE_QUERY_1.claims[0], confidence: 0.7 },
        ...MOCK_RESPONSE_QUERY_1.claims.slice(1),
      ],
    };

    await mockHealthOk(page);
    await mockQueryResponse(page, boundaryResponse);
    await mockChunkResponse(page, MOCK_CHUNK_HYDRAULIC);

    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await panelPage.submitQuery("Find similar incidents");
    await panelPage.waitForAnswer();
    await panelPage.clickCitation(1);
    await panelPage.waitForDrawerOpen();

    await assertConfidenceBadge(page, 0.7);
  });

  test("boundary: confidence exactly 0.4 is treated as Medium (yellow)", async ({ page }) => {
    const boundaryResponse = {
      ...MOCK_RESPONSE_QUERY_1,
      claims: [
        { ...MOCK_RESPONSE_QUERY_1.claims[0], confidence: 0.4 },
        ...MOCK_RESPONSE_QUERY_1.claims.slice(1),
      ],
    };

    await mockHealthOk(page);
    await mockQueryResponse(page, boundaryResponse);
    await mockChunkResponse(page, MOCK_CHUNK_HYDRAULIC);

    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await panelPage.submitQuery("Find similar incidents");
    await panelPage.waitForAnswer();
    await panelPage.clickCitation(1);
    await panelPage.waitForDrawerOpen();

    await assertConfidenceBadge(page, 0.4);
  });
});

test.describe("Citations — conflict note", () => {
  test("conflict note alert is shown when claim has conflict_note", async ({ page }) => {
    // MOCK_RESPONSE_QUERY_2.claims[2] has a conflict_note
    await mockHealthOk(page);
    await mockQueryResponse(page, MOCK_RESPONSE_QUERY_2);
    await mockChunkResponse(page, MOCK_CHUNK_DEFECT_TREND);

    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await panelPage.submitQuery("Show defect trends by product");
    await panelPage.waitForAnswer();

    // Citation 3 (index 2) has a conflict_note
    await panelPage.clickCitation(3);
    await panelPage.waitForDrawerOpen();

    await expect(page.locator('[role="dialog"]')).toContainText(
      "SQL data may under-represent Plant B",
      { timeout: 5_000 }
    );
  });
});

test.describe("Citations — sequential opens", () => {
  test("opening citation 2 after citation 1 shows the second claim's data", async ({ page }) => {
    await mockHealthOk(page);
    await mockQueryResponse(page, MOCK_RESPONSE_QUERY_1);
    // Register mocks for both chunk IDs used by claims[0] and claims[1]
    await mockChunkResponse(page, MOCK_CHUNK_HYDRAULIC);
    await page.route(`**/docs/INC-B2C3D4E5/chunks/embed-hydraulic-002`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          chunk_id: "embed-hydraulic-002",
          incident_id: "INC-B2C3D4E5",
          chunk_text: "Line 3 actuator mounting flange fatigue fracture observed after 2,400 operating hours.",
          chunk_index: 0,
          char_start: 0,
          char_end: 55,
          metadata: {
            asset_id: "ASSET-312",
            system: "Hydraulics",
            severity: "High",
            event_date: "2024-01-22",
            source: "synthetic",
          },
        }),
      });
    });

    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await panelPage.submitQuery("Find similar incidents");
    await panelPage.waitForAnswer();

    // Open citation 1
    await panelPage.clickCitation(1);
    await panelPage.waitForDrawerOpen();
    const firstDrawerText = await panelPage.getCitationDrawerText();
    expect(firstDrawerText).toContain("Citation [1]");

    // Close, then open citation 2
    await panelPage.closeDrawer();
    await panelPage.clickCitation(2);
    await panelPage.waitForDrawerOpen();

    const secondDrawerText = await panelPage.getCitationDrawerText();
    expect(secondDrawerText).toContain("Citation [2]");
  });
});
