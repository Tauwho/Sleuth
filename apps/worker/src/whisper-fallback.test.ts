import { existsSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  createFallbackTranscription,
  createWhisperTranscription,
  parseWhisperOutput,
  ProviderError,
  type TranscriptionProvider,
} from "@sleuth/media";
import { loadConfig } from "./config";
import { createProviders, WHISPER_SCRIPT } from "./providers";

const input = { projectId: "p", assetVersionId: "av", durationMs: 5000, audioPath: "/tmp/a.wav" };
const ok = (name: string): TranscriptionProvider => ({
  name,
  transcribe: vi.fn(async () => [
    {
      id: `${name}-1`,
      projectId: "p",
      assetVersionId: "av",
      startMs: 0,
      endMs: 1,
      text: name,
      words: [],
    },
  ]),
});

describe("parseWhisperOutput", () => {
  it("maps seconds to ms, trims text, drops empty segments and words", () => {
    const raw = JSON.stringify({
      segments: [
        {
          start: 1,
          end: 2.5,
          text: " Open the project. ",
          words: [
            { start: 1, end: 1.4, word: " Open" },
            { start: 1.4, end: 1.3, word: " the" },
            { start: 1.5, end: 1.6, word: " " },
          ],
        },
        { start: 3, end: 4, text: "   ", words: [] },
      ],
    });
    expect(parseWhisperOutput(raw, { projectId: "p", assetVersionId: "av" })).toEqual([
      {
        id: "av-wh-1",
        projectId: "p",
        assetVersionId: "av",
        startMs: 1000,
        endMs: 2500,
        text: "Open the project.",
        words: [
          { text: "Open", startMs: 1000, endMs: 1400 },
          { text: "the", startMs: 1400, endMs: 1400 },
        ],
      },
    ]);
  });

  it("refuses output that is not the expected JSON", () => {
    expect(() =>
      parseWhisperOutput("Downloading model...", { projectId: "p", assetVersionId: "av" }),
    ).toThrow(ProviderError);
  });
});

describe("createWhisperTranscription", () => {
  it("installs once, runs the script on the audio, and never reaches the network itself", async () => {
    const ensure = vi.fn(async () => undefined);
    const run = vi.fn(async () =>
      JSON.stringify({ segments: [{ start: 0, end: 1, text: "Hi", words: [] }] }),
    );
    const w = createWhisperTranscription({ script: "x.py", ensure, run });
    expect((await w.transcribe(input))[0]?.text).toBe("Hi");
    expect(run).toHaveBeenCalledWith("/tmp/a.wav");
  });

  it("needs the audio path, and says so if the install fails", async () => {
    const w = createWhisperTranscription({ script: "x.py", run: vi.fn() });
    await expect(w.transcribe({ ...input, audioPath: undefined })).rejects.toMatchObject({
      code: "input_missing",
    });
    const broken = createWhisperTranscription({
      script: "x.py",
      ensure: async () => {
        throw new Error("pip");
      },
      run: vi.fn(),
    });
    await expect(broken.transcribe(input)).rejects.toMatchObject({
      code: "provider_not_configured",
    });
  });
});

describe("createFallbackTranscription", () => {
  it("uses the primary while it works", async () => {
    const fallback = ok("whisper");
    const t = createFallbackTranscription(ok("deepgram"), fallback);
    expect((await t.transcribe(input))[0]?.text).toBe("deepgram");
    expect(fallback.transcribe).not.toHaveBeenCalled();
  });

  it("falls back on a provider error and reports only its code", async () => {
    const onFallback = vi.fn();
    const primary: TranscriptionProvider = {
      name: "deepgram",
      transcribe: async () => {
        throw new ProviderError("deepgram", "auth_failed");
      },
    };
    const t = createFallbackTranscription(primary, ok("whisper"), onFallback);
    expect((await t.transcribe(input))[0]?.text).toBe("whisper");
    expect(onFallback).toHaveBeenCalledWith("auth_failed");
  });

  it("does not hide a bug behind the fallback", async () => {
    const primary: TranscriptionProvider = {
      name: "deepgram",
      transcribe: async () => {
        throw new TypeError("bug");
      },
    };
    await expect(
      createFallbackTranscription(primary, ok("whisper")).transcribe(input),
    ).rejects.toThrow("bug");
  });
});

describe("TRANSCRIPTION_FALLBACK=whisper (step 11)", () => {
  const base = {
    SLEUTH_DATA_MODE: "supabase",
    TRANSCRIPTION_PROVIDER: "deepgram",
    TRANSCRIPTION_API_KEY: "k",
    ALLOW_MOCK_PROVIDERS: false,
    MAX_FRAMES_PER_VIDEO: 60,
    VIDEO_ANALYSIS_PROVIDER: "none",
  } as const;

  it("is off by default and wraps the transcription when set", () => {
    expect(loadConfig({}).TRANSCRIPTION_FALLBACK).toBe("none");
    expect(createProviders(base).transcription.name).toBe("deepgram");
    expect(createProviders({ ...base, TRANSCRIPTION_FALLBACK: "whisper" }).transcription.name).toBe(
      "deepgram+whisper",
    );
  });

  it("ships the script it runs", () => {
    expect(existsSync(WHISPER_SCRIPT)).toBe(true);
  });
});
