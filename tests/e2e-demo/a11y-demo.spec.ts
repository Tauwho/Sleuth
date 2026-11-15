import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";

// N6: axe on the demo-mode screens (demo banner with Reset, pre-flight page, recording view).
const expect = baseExpect.configure({ timeout: 30_000 });
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function seriousViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

test("the demo banner with Reset has no serious or critical issues", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Reset demo" })).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});

test("the pre-flight page has no serious or critical issues", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/demo/preflight");
  await expect(page.getByTestId("preflight-summary")).toHaveText(
    "All checks passed. Ready to record.",
  );
  expect(await seriousViolations(page)).toEqual([]);
});

test("the recording view has no serious or critical issues", async ({ page }) => {
  await page.goto("/?rec=1");
  await expect(page.getByTestId("demo-banner")).toHaveAttribute("data-rec", "1");
  expect(await seriousViolations(page)).toEqual([]);
});
