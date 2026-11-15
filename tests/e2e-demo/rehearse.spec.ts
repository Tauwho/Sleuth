import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { DemoBeat } from "../../apps/web/lib/demo/scenario";

// N3: play a scenario's beats against demo mode and fail on the first one that drifts.
// Run with: pnpm demo:rehearse proofpay-v1   (sets DEMO_SCENARIO; defaults to proofpay-v1)
// The beats are the scenario's own JSON file; the unit tests check it against DemoBeatSchema.
const id = process.env.DEMO_SCENARIO ?? "proofpay-v1";
// Playwright runs from the repo root (playwright.demo.config.ts lives there).
const file = join(process.cwd(), "apps", "web", "lib", "demo", "beats", `${id}.json`);
const beats: DemoBeat[] = existsSync(file)
  ? (JSON.parse(readFileSync(file, "utf8")) as DemoBeat[])
  : [];
const DEFAULT_MAX_MS = 10_000;

function describeBeat(b: DemoBeat): string {
  switch (b.do) {
    case "open":
      return `open ${b.path}`;
    case "click":
      return `click ${b.role} "${b.name}"`;
    case "edit":
      return `edit "${b.label}"`;
    case "expect":
      return `expect ${b.testId ?? b.heading ?? b.url ?? "?"}${b.text ? ` "${b.text}"` : ""}`;
  }
}

async function play(page: Page, b: DemoBeat, timeout: number): Promise<void> {
  if (b.do === "open") {
    await page.goto(b.path);
    return;
  }
  if (b.do === "click") {
    const target = page.getByRole(b.role, { name: b.name, exact: true });
    await expect(target, "the control must be there exactly once").toHaveCount(1, { timeout });
    await target.click({ timeout });
    return;
  }
  if (b.do === "edit") {
    const field = page.getByLabel(b.label, { exact: true });
    await expect(field).toHaveCount(1, { timeout });
    const before = await field.inputValue({ timeout });
    expect(before, `the field must contain "${b.find}"`).toContain(b.find);
    await field.fill(before.replace(b.find, b.replace), { timeout });
    return;
  }
  if (b.url) {
    await expect(page).toHaveURL(new RegExp(b.url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), {
      timeout,
    });
    return;
  }
  const target = b.testId
    ? page.getByTestId(b.testId)
    : page.getByRole("heading", { name: b.heading ?? "", exact: true });
  await expect(target, "the target must be there exactly once").toHaveCount(1, { timeout });
  await expect(target).toBeVisible({ timeout });
  if (b.text) await expect(target).toContainText(b.text, { timeout });
}

test(`rehearse scenario ${id}: every beat as written, in time, with no network`, async ({
  browser,
}) => {
  expect(beats.length, "the scenario has beats").toBeGreaterThan(0);
  test.setTimeout(60_000 + beats.length * 20_000);

  // A fresh context is a fresh tab: no saved demo state, as after Reset.
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  const bad: string[] = [];
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (url.protocol === "data:" || url.protocol === "blob:") return;
    if (url.host !== "localhost:3100" || url.pathname.startsWith("/api/")) bad.push(url.href);
  });

  const timings: string[] = [];
  for (const [i, beat] of beats.entries()) {
    const label = `${String(i + 1).padStart(2, "0")} ${describeBeat(beat)}`;
    const maxMs = beat.maxMs ?? DEFAULT_MAX_MS;
    const started = Date.now();
    await test.step(label, () => play(page, beat, maxMs));
    const took = Date.now() - started;
    timings.push(`${label}: ${took} ms`);
    expect(took, `${label} took ${took} ms, more than ${maxMs} ms`).toBeLessThanOrEqual(maxMs);
  }
  console.log(`REHEARSAL ${id}\n${timings.join("\n")}`);
  expect(bad, "demo mode made no server API call and reached no other host").toEqual([]);
  await context.close();
});
