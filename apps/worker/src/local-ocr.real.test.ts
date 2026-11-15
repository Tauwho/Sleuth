import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createTesseractVideoAnalysis } from "@sleuth/media";

function has(binary: string, flag: string): boolean {
  try {
    execFileSync(binary, [flag], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// CI installs both (ci.yml). Locally the test skips itself when either is missing.
// ffmpeg takes `-version`; `--version` is an error and made this test skip in CI.
const ready = has("tesseract", "--version") && has("ffmpeg", "-version");
const suite = ready ? describe : describe.skip;

suite("Tesseract on a real frame (step 8)", () => {
  const dir = mkdtempSync(join(tmpdir(), "sleuth-ocr-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("reads the text the demo clip shows at 17 s", async () => {
    // Our own generated clip (scripts/make-scenario-clip.ps1): "Client: Lumen Studio" at 16-20 s.
    const clip = join(
      __dirname,
      "..",
      "..",
      "web",
      "public",
      "scenarios",
      "proofpay-v1",
      "video.mp4",
    );
    const frame = join(dir, "f17.png");
    execFileSync("ffmpeg", [
      "-nostdin",
      "-y",
      "-v",
      "error",
      "-ss",
      "17",
      "-i",
      clip,
      "-frames:v",
      "1",
      frame,
    ]);
    const [obs] = await createTesseractVideoAnalysis().analyse({
      projectId: "p",
      assetVersionId: "av",
      durationMs: 52_000,
      frames: [{ timestampMs: 17_000, path: frame }],
    });
    expect(obs?.onScreenText.join(" ")).toMatch(/Lumen Studio/);
  }, 60_000);
});
