import { expect as baseExpect, test, type Page } from "@playwright/test";

// Step 5 of the product plan: a visitor brings their own script and checklist, not ProofPay's.
const expect = baseExpect.configure({ timeout: 30_000 });
const openTab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true }).click();

test("a blank project starts empty and takes your own script and checklist", async ({ page }) => {
  test.setTimeout(120_000);
  // Its own fixture user, so the list and limits never mix with other specs.
  await page.setExtraHTTPHeaders({ "x-fixture-user": `e2e-blank-${Date.now()}` });
  await page.goto("/");
  await page.getByLabel("Project name").fill("Launch video");
  await page.getByRole("button", { name: "Start a blank project" }).click();

  await expect(page).toHaveURL(/\/projects\/proj-\d+$/);
  await expect(page.getByRole("heading", { level: 1, name: "Launch video" })).toBeVisible();
  await expect(page.getByTestId("blank-steps")).toBeVisible();

  await openTab(page, "Script");
  await page
    .getByLabel("Script text. Each sentence becomes one numbered line.")
    .fill("Open the app.\nClick Share to send the link.");
  await page.getByRole("button", { name: "Save script" }).click();
  await expect(page.getByRole("button", { name: /^2\./ })).toBeVisible();

  await openTab(page, "Checklist");
  await page.getByLabel("New item").fill("Show the share dialog");
  await page.getByRole("button", { name: "Add item" }).click();
  await page.getByRole("button", { name: "Save checklist" }).click();
  await expect(page.getByText("Checklist saved with 1 item.")).toBeVisible();

  // No video yet: the analysis asks for one instead of running.
  await openTab(page, "Analysis");
  await page.getByRole("button", { name: "Run analysis" }).click();
  await expect(page.getByText("Add a video and a script before analysis.")).toBeVisible();
});
