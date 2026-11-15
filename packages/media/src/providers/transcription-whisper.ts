import { execFile } from "node:child_process";
import { z } from "zod";
import type { TranscriptSegment } from "@sleuth/contracts";
import type { TranscriptionProvider } from "../providers";
import { ProviderError } from "./errors";

/**
 * Local speech-to-text with faster-whisper (step 11 of the product plan). It is the fallback
 * when the hosted provider fails, for example once the Deepgram credit runs out. It costs
 * nothing and sends nothing anywhere; it is slower (about real time for `base.en` on a runner).
 *
 * The worker calls a small Python script (`apps/worker/whisper/transcribe.py`). On the first use
 * on a machine, `ensure` installs faster-whisper with pip, so a run that never falls back pays
 * nothing.
 */

const PROVIDER = "whisper";

const OutputSchema = z.object({
  segments: z.array(
    z.object({
      start: z.number(),
      end: z.number(),
      text: z.string(),
      words: z
        .array(z.object({ start: z.number(), end: z.number(), word: z.string() }))
        .default([]),
    }),
  ),
});

export type RunWhisper = (audioPath: string) => Promise<string>;

export interface WhisperOptions {
  /** Path of `transcribe.py`. */
  script: string;
  python?: string;
  model?: string;
  /** Default 15 minutes: the job itself has a 20-minute limit. */
  timeoutMs?: number;
  /** Installs faster-whisper if it is missing. Called once, before the first transcription. */
  ensure?: () => Promise<void>;
  /** Tests pass their own. */
  run?: RunWhisper;
}

function exec(binary: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      binary,
      args,
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout) => (error ? reject(error) : resolve(String(stdout))),
    );
  });
}

/**
 * `pip install faster-whisper` unless it imports already. Use a Python whose pip may install
 * (the worker workflow sets one up with actions/setup-python).
 */
export function pipEnsure(python = "python3", timeoutMs = 10 * 60_000): () => Promise<void> {
  let done: Promise<void> | null = null;
  return () =>
    (done ??= exec(python, ["-c", "import faster_whisper"], 30_000)
      .catch(() =>
        exec(
          python,
          // 1.2.1 tested on 15 Nov 2026 (the demo clip, 52 s, in about 4 s). It needs `requests`
          // without declaring it. The audio is read with `wave`, so PyAV's version does not matter.
          ["-m", "pip", "install", "--quiet", "faster-whisper==1.2.1", "requests"],
          timeoutMs,
        ),
      )
      .then(() => undefined)
      .catch((e: unknown) => {
        done = null;
        throw e;
      }));
}

const toMs = (s: number) => Math.max(0, Math.round(s * 1000));

/** The script's JSON as transcript segments, with ids unique to the video version. */
export function parseWhisperOutput(
  raw: string,
  ids: { projectId: string; assetVersionId: string },
): TranscriptSegment[] {
  let parsed: z.infer<typeof OutputSchema>;
  try {
    parsed = OutputSchema.parse(JSON.parse(raw));
  } catch {
    throw new ProviderError(PROVIDER, "bad_response");
  }
  const out: TranscriptSegment[] = [];
  for (const s of parsed.segments) {
    const text = s.text.trim();
    if (!text) continue;
    const startMs = toMs(s.start);
    const words = s.words
      .map((w) => ({ text: w.word.trim(), startMs: toMs(w.start), endMs: toMs(w.end) }))
      .filter((w) => w.text !== "")
      .map((w) => ({ ...w, endMs: Math.max(w.startMs, w.endMs) }));
    out.push({
      id: `${ids.assetVersionId}-wh-${out.length + 1}`,
      projectId: ids.projectId,
      assetVersionId: ids.assetVersionId,
      startMs,
      endMs: Math.max(startMs, toMs(s.end)),
      text,
      words,
    });
  }
  return out;
}

export function createWhisperTranscription(options: WhisperOptions): TranscriptionProvider {
  const python = options.python ?? "python3";
  const timeoutMs = options.timeoutMs ?? 15 * 60_000;
  const run: RunWhisper =
    options.run ??
    ((audio) => exec(python, [options.script, audio, options.model ?? "base.en"], timeoutMs));
  return {
    name: PROVIDER,
    async transcribe(input) {
      if (!input.audioPath) throw new ProviderError(PROVIDER, "input_missing");
      try {
        await options.ensure?.();
      } catch {
        throw new ProviderError(PROVIDER, "provider_not_configured");
      }
      let raw: string;
      try {
        raw = await run(input.audioPath);
      } catch {
        throw new ProviderError(PROVIDER, "audio_unreadable");
      }
      return parseWhisperOutput(raw, input);
    },
  };
}

/**
 * Uses `primary`, and `fallback` when the primary fails with a provider error (no credit, rate
 * limit, outage). Other errors are bugs and are not hidden. `onFallback` gets the primary's code.
 */
export function createFallbackTranscription(
  primary: TranscriptionProvider,
  fallback: TranscriptionProvider,
  onFallback?: (code: string) => void,
): TranscriptionProvider {
  return {
    name: `${primary.name}+${fallback.name}`,
    async transcribe(input) {
      try {
        return await primary.transcribe(input);
      } catch (error) {
        if (!(error instanceof ProviderError)) throw error;
        onFallback?.(error.code);
        return fallback.transcribe(input);
      }
    },
  };
}
