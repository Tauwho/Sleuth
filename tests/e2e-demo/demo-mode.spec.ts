import { expect as baseExpect, test, type Page } from "@playwright/test";

// Demo mode (ADR 0010). Run with: pnpm test:e2e:demo
// Dev mode compiles each route on first visit; the longer wait only gives pages time to appear.
const expect = baseExpect.configure({ timeout: 30_000 });

/**
 * Records every request the page makes. In demo mode the only allowed requests are the app's own
 * pages, scripts, styles and fonts from this server: never `/api/`, and never another host.
 */
function watchNetwork(page: Page) {
  const api: string[] = [];
  const foreign: string[] = [];
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (url.protocol === "data:" || url.protocol === "blob:") return;
    if (url.host !== "localhost:3100") foreign.push(url.href);
    else if (url.pathname.startsWith("/api/")) api.push(url.pathname);
  });
  return { api, foreign };
}

const openTab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true }).click();

test("the whole demo path runs with no API call and no other host, and survives a reload", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const net = watchNetwork(page);

  await page.goto("/");
  await expect(page.getByTestId("demo-banner")).toContainText("Demo mode: sample data");
  await page.getByRole("link", { name: /Open demo/ }).click();
  await expect(page).toHaveURL(/\/projects\/proofpay-demo$/);
  await expect(page.getByTestId("workspace-counts")).toHaveText(
    "4 evidence candidates, 4 findings (4 open)",
  );
  // A real video from this app, not the simulated clock.
  const video = page.locator("video");
  await expect(video).toHaveAttribute("src", /\/scenarios\/proofpay-v1\/video\.mp4$/);
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => Math.round(v.duration)), {
      timeout: 20_000,
    })
    .toBe(52);

  // Make an editable copy, as on the live site.
  await page.getByRole("button", { name: "Make an editable copy" }).first().click();
  await expect(page).toHaveURL(/\/projects\/proj-\d+$/);
  const copyUrl = page.url();

  // Run an analysis: the scripted timeline finishes it in a few seconds.
  await openTab(page, "Analysis");
  await page.getByRole("button", { name: "Run analysis" }).click();
  await expect(page.getByTestId("job-processing")).toContainText("Demo mode replays a saved run");
  await expect(page.getByTestId("job-done")).toBeVisible({ timeout: 20_000 });
  const counts = await page.getByTestId("workspace-counts").textContent();

  // A reload replays the saved log: the same project and the same counts.
  await page.reload();
  await expect(page).toHaveURL(copyUrl);
  await expect(page.getByTestId("workspace-counts")).toHaveText(counts ?? "");

  // The report builds in the browser too.
  await page.goto(`${copyUrl}/report`);
  await expect(page.getByRole("heading", { name: "Export" })).toBeVisible();

  expect(net.api).toEqual([]);
  expect(net.foreign).toEqual([]);
});

test("a new tab starts from the scenario, not from another tab's changes", async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext();
  const first = await context.newPage();
  await first.goto("/projects/proofpay-demo");
  await first.getByRole("button", { name: "Make an editable copy" }).first().click();
  await expect(first).toHaveURL(/\/projects\/proj-\d+$/);

  const second = await context.newPage();
  await second.goto("/");
  await expect(second.getByTestId("demo-banner")).toBeVisible();
  await expect(second.getByRole("link", { name: /Open demo/ })).toBeVisible();
  await expect(second.locator("a[href^='/projects/proj-']")).toHaveCount(0);
  await context.close();
});
