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

  // Reset forgets the copy and opens the dashboard.
  await page.getByRole("button", { name: "Reset demo" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("a[href^='/projects/proj-']")).toHaveCount(0);

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

test("pre-flight passes on a clean tab and starts the recording view", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/demo/preflight");
  const summary = page.getByTestId("preflight-summary");
  await expect(summary).toHaveText("All checks passed. Ready to record.", { timeout: 30_000 });
  for (const id of ["scenario", "api", "clean", "network", "video", "fonts", "viewport"]) {
    await expect(page.locator(`[data-check='${id}']`)).toHaveAttribute("data-state", "ok");
  }

  await page.getByRole("button", { name: "Reset and start recording" }).click();
  await expect(page).toHaveURL(/\/\?rec=1$/);
  const banner = page.getByTestId("demo-banner");
  await expect(banner).toHaveAttribute("data-rec", "1");
  // Disclosure stays, the reset button goes, and nothing animates.
  await expect(banner).toContainText("Demo mode: sample data");
  await expect(page.getByRole("button", { name: "Reset demo" })).toHaveCount(0);
  const duration = await page.evaluate(() => {
    const el = document.createElement("div");
    el.style.transition = "opacity 2s";
    document.body.appendChild(el);
    return getComputedStyle(el).transitionDuration;
  });
  expect(duration).toBe("0s");

  // The choice stays for the tab until ?rec=0.
  await page.goto("/projects/proofpay-demo");
  await expect(page.getByTestId("demo-banner")).toHaveAttribute("data-rec", "1");
  await page.goto("/?rec=0");
  await expect(page.getByRole("button", { name: "Reset demo" })).toBeVisible();
});

test("pre-flight flags a tab with changes", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/projects/proofpay-demo");
  await page.getByRole("button", { name: "Make an editable copy" }).first().click();
  await expect(page).toHaveURL(/\/projects\/proj-\d+$/);
  await page.goto("/demo/preflight");
  await expect(page.locator("[data-check='clean']")).toHaveAttribute("data-state", "fail", {
    timeout: 30_000,
  });
});
