import { execFile } from "node:child_process";
import type { FrameObservation } from "@sleuth/contracts";
import type { VideoAnalysisProvider } from "../providers";

/**
 * On-screen text read on the worker itself with Tesseract OCR (step 8 of the product plan).
 * Nothing leaves the machine, so it is allowed for every owner, visitors included (decision D-4
 * still holds: no frame goes to a third party). It reads text only: it cannot see that "the
 * chart turns green", so those claims stay "needs outside proof" for visitors.
 *
 * Needs the `tesseract` binary with English data (`apt-get install tesseract-ocr`). A frame it
 * cannot read gives no observation; it never fails the job.
 */

export type RunOcr = (imagePath: string) => Promise<string>;

export interface TesseractOptions {
  /** The binary. Default `tesseract`. */
  binary?: string;
  /** Per-frame limit. Default 20 s. */
  timeoutMs?: number;
  /** Tests pass their own. */
  run?: RunOcr;
}

/** Most lines a frame may give. A screen full of tiny text says little that a claim can use. */
export const MAX_OCR_LINES = 20;

function defaultRun(binary: string, timeoutMs: number): RunOcr {
  return (imagePath) =>
    new Promise((resolve, reject) => {
      // `--psm 11`: sparse text, the usual case for an app screen with labels and buttons.
      execFile(
        binary,
        [imagePath, "stdout", "-l", "eng", "--psm", "11"],
        { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 },
        (error, stdout) => (error ? reject(new Error("ocr_failed")) : resolve(String(stdout))),
      );
    });
}

/**
 * Lines worth keeping: trimmed, at least two letters or digits, mostly letters, digits and
 * normal punctuation (OCR noise is mostly stray symbols), duplicates removed.
 */
export function cleanOcrLines(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const text = line.replace(/\s+/g, " ").trim();
    const alnum = (text.match(/[\p{L}\p{N}]/gu) ?? []).length;
    if (alnum < 2 || alnum / text.length < 0.6) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text.slice(0, 200));
    if (out.length >= MAX_OCR_LINES) break;
  }
  return out;
}

export function createTesseractVideoAnalysis(
  options: TesseractOptions = {},
): VideoAnalysisProvider {
  const run = options.run ?? defaultRun(options.binary ?? "tesseract", options.timeoutMs ?? 20_000);
  return {
    name: "tesseract",
    async analyse({ projectId, assetVersionId, frames }) {
      const out: FrameObservation[] = [];
      for (const frame of frames) {
        if (!frame.path) continue;
        let lines: string[];
        try {
          lines = cleanOcrLines(await run(frame.path));
        } catch {
          continue;
        }
        if (lines.length === 0) continue;
        out.push({
          id: `${assetVersionId}-ocr-${frame.timestampMs}`,
          projectId,
          assetVersionId,
          timestampMs: frame.timestampMs,
          description: "Text read from the screen by OCR.",
          onScreenText: lines,
        });
      }
      return out;
    },
  };
}
