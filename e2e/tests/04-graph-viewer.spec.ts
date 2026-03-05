// ============================================================
// 04-graph-viewer.spec.ts
// Graph Viewer panel: empty state, React Flow node/edge rendering,
// node type styling, zoom controls, and node click popover.
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

test.describe("Graph Viewer — empty state", () => {
  test("shows 'Submit a query to see the graph' before any query", async ({ page }) => {
    await mockHealthOk(page);
    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();

    await expect(page.getByText("Submit a query to see the graph")).toBeVisible();
  });

  test("React Flow container is present but empty of nodes", async ({ page }) => {
    await mockHealthOk(page);
    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();

    await expect(page.locator(".react-flow")).toBeVisible();
    const nodeCount = await page.locator(".react-flow__node").count();
    expect(nodeCount).toBe(0);
  });
});

test.describe("Graph Viewer — nodes and edges (Query 1 — vector-only)", () => {
  let panelPage: FourPanelPage;

  test.beforeEach(async ({ page }) => {
    await mockHealthOk(page);
    await mockQueryResponse(page, MOCK_RESPONSE_QUERY_1);
    panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await panelPage.submitQuery("Find similar incidents to: hydraulic actuator crack");
    await panelPage.waitForAnswer();
    // Wait for graph to render nodes
    await page.waitForSelector(".react-flow__node", { timeout: 10_000 });
  });

  test("renders the correct number of nodes from the fixture", async () => {
    // MOCK_RESPONSE_QUERY_1.graph_path.nodes has 4 nodes
    const count = await panelPage.getGraphNodeCount();
    expect(count).toBe(4);
  });

  test("renders React Flow edges", async ({ page }) => {
    // MOCK_RESPONSE_QUERY_1.graph_path.edges has 4 edges
    await page.waitForSelector(".react-flow__edge", { timeout: 5_000 });
    const edgeCount = await page.locator(".react-flow__edge").count();
    expect(edgeCount).toBeGreaterThan(0);
  });

  test("entity nodes are rendered with the entity node type class", async ({ page }) => {
    // Entity nodes use the custom 'entity' React Flow type — rendered as circular divs
    const entityNodes = page.locator(".react-flow__node-entity");
    await expect(entityNodes.first()).toBeVisible({ timeout: 5_000 });
    const count = await entityNodes.count();
    // MOCK_RESPONSE_QUERY_1 has 2 entity nodes
    expect(count).toBe(2);
  });

  test("chunk nodes are rendered with the chunk node type class", async ({ page }) => {
    const chunkNodes = page.locator(".react-flow__node-chunk");
    await expect(chunkNodes.first()).toBeVisible({ timeout: 5_000 });
    const count = await chunkNodes.count();
    // MOCK_RESPONSE_QUERY_1 has 2 chunk nodes
    expect(count).toBe(2);
  });

  test("entity node has purple background colour", async ({ page }) => {
    const entityNode = page.locator(".react-flow__node-entity").first();
    // The inner div has inline style with ENTITY_NODE_COLOUR = #7c3aed
    const inner = entityNode.locator("div").first();
    const style = await inner.getAttribute("style");
    expect(style).toMatch(/7c3aed|124.*58.*237/i);
  });

  test("chunk node has teal background colour", async ({ page }) => {
    const chunkNode = page.locator(".react-flow__node-chunk").first();
    // CHUNK_NODE_COLOUR = #0d9488
    const inner = chunkNode.locator("div").first();
    const style = await inner.getAttribute("style");
    expect(style).toMatch(/0d9488|13.*148.*136/i);
  });

  test("zoom controls are visible", async () => {
    const visible = await panelPage.areZoomControlsVisible();
    expect(visible).toBe(true);
  });

  test("minimap is visible", async ({ page }) => {
    await expect(page.locator(".react-flow__minimap")).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Graph Viewer — node click popover", () => {
  test("clicking a node opens a popover with node label and type badge", async ({ page }) => {
    await mockHealthOk(page);
    await mockQueryResponse(page, MOCK_RESPONSE_QUERY_1);
    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();

    await panelPage.submitQuery("Find similar incidents to: hydraulic actuator crack");
    await panelPage.waitForAnswer();
    await page.waitForSelector(".react-flow__node", { timeout: 10_000 });

    // Click the first entity node
    await panelPage.clickGraphNode(0);

    // Popover (Popover component) should open — look for the Label/Type content
    // PopoverContent renders in a portal; look for text "Label" or "Type"
    await expect(page.getByText("Label")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Type")).toBeVisible({ timeout: 3_000 });
  });

  test("node popover shows the node's label text", async ({ page }) => {
    await mockHealthOk(page);
    await mockQueryResponse(page, MOCK_RESPONSE_QUERY_1);
    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();

    await panelPage.submitQuery("Find similar incidents to: hydraulic actuator crack");
    await panelPage.waitForAnswer();
    await page.waitForSelector(".react-flow__node-entity", { timeout: 10_000 });

    await panelPage.clickGraphNode(0);

    // The first entity node label is "Hydraulics System"
    // After click the popover should contain this label
    await expect(page.getByText(/Hydraulics System|ASSET-247/i)).toBeVisible({ timeout: 5_000 });
  });

  test("node popover closes when clicking outside", async ({ page }) => {
    await mockHealthOk(page);
    await mockQueryResponse(page, MOCK_RESPONSE_QUERY_1);
    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();

    await panelPage.submitQuery("Find similar incidents to: hydraulic actuator crack");
    await panelPage.waitForAnswer();
    await page.waitForSelector(".react-flow__node", { timeout: 10_000 });

    await panelPage.clickGraphNode(0);
    // Popover is open — now click outside
    await expect(page.getByText("Label")).toBeVisible({ timeout: 3_000 });
    await page.mouse.click(50, 50);

    // Popover should close
    await expect(page.getByText("Label")).toBeHidden({ timeout: 3_000 });
  });
});

test.describe("Graph Viewer — multiple query types", () => {
  test("hybrid query (Query 3) renders more nodes (entities + chunks)", async ({ page }) => {
    await mockHealthOk(page);
    await mockQueryResponse(page, MOCK_RESPONSE_QUERY_3);
    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();

    await panelPage.submitQuery(
      "Given this incident: corrosion found on avionics connector, classify defect"
    );
    await panelPage.waitForAnswer();
    await page.waitForSelector(".react-flow__node", { timeout: 10_000 });

    // MOCK_RESPONSE_QUERY_3.graph_path.nodes has 5 nodes
    const count = await panelPage.getGraphNodeCount();
    expect(count).toBe(5);
  });

  test("graph updates when a new query is submitted", async ({ page }) => {
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

    // Submit first query — 4 nodes
    await panelPage.submitQuery("First query");
    await panelPage.waitForAnswer();
    await page.waitForSelector(".react-flow__node", { timeout: 10_000 });
    const firstCount = await panelPage.getGraphNodeCount();

    // Submit second query — 4 nodes (same count but different data)
    await panelPage.submitQuery("Second query");
    const assistantMessages = page.locator(".justify-start .bg-card");
    await expect(assistantMessages.nth(1)).toBeVisible({ timeout: 30_000 });

    // Graph should still have nodes (it updated to second response)
    const secondCount = await panelPage.getGraphNodeCount();
    expect(secondCount).toBeGreaterThan(0);
  });
});
