/**
 * Rehearse a demo scenario before recording (N3).
 *   pnpm demo:rehearse proofpay-v1 [--repeat 3]
 * Starts demo mode on port 3100 (playwright.demo.config.ts) and plays the scenario's beats.
 * Exits non-zero on the first drift. The timing of each beat is printed.
 */
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const scenario = args.find((a) => !a.startsWith("--")) ?? "proofpay-v1";
const repeatAt = args.indexOf("--repeat");
const repeat = repeatAt >= 0 ? Number(args[repeatAt + 1] ?? "1") : 1;
if (!/^[a-z0-9-]{1,64}$/.test(scenario) || !Number.isInteger(repeat) || repeat < 1 || repeat > 10) {
  console.error("usage: pnpm demo:rehearse <scenario-id> [--repeat 1..10]");
  process.exit(2);
}

const result = spawnSync(
  "pnpm",
  [
    "exec",
    "playwright",
    "test",
    "-c",
    "playwright.demo.config.ts",
    "tests/e2e-demo/rehearse.spec.ts",
    `--repeat-each=${repeat}`,
    "--reporter=list",
  ],
  {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, DEMO_SCENARIO: scenario },
  },
);
process.exit(result.status ?? 1);
