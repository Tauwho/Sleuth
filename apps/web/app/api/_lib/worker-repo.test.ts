import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..", "..", "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

/**
 * The repository moved from dngvmnh/sleuth to Tauwho/Sleuth (15 Nov 2026). The worker and
 * keep-alive jobs run only when `github.repository` matches, and the web app starts the worker
 * on that repository. If these drift apart, queued jobs silently stop running (step 7).
 */
describe("one repository name everywhere the worker depends on it", () => {
  const dispatch = read("apps/web/app/api/_lib/worker-dispatch.ts");
  const repo = /const REPO = "([^"]+)"/.exec(dispatch)?.[1];

  it("the web app starts the worker on Tauwho/Sleuth", () => {
    expect(repo).toBe("Tauwho/Sleuth");
  });

  for (const wf of [".github/workflows/worker.yml", ".github/workflows/keep-alive.yml"]) {
    it(`${wf} runs on the same repository`, () => {
      expect(read(wf)).toContain(`if: github.repository == '${repo}'`);
    });
  }
});
