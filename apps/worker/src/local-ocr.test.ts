import { describe, expect, it, vi } from "vitest";
import { SPEECH_ONLY_NOTE } from "@sleuth/evidence-engine";
import { cleanOcrLines, createTesseractVideoAnalysis } from "@sleuth/media";
import { loadConfig } from "./config";
import { createProviders } from "./providers";
import {
  fakeMedia,
  fakeStore,
  fx,
  geminiSet,
  handlerOptions,
  inputsFor,
  job,
} from "./speech-only.fakes";
import { createSupabaseHandler } from "./supabase-handler";

const VISITOR = { userId: "22222222-2222-4222-8222-222222222222", realAccount: false };

describe("cleanOcrLines", () => {
  it("keeps readable lines once and drops OCR noise", () => {
    expect(cleanOcrLines("New Invoice\n\n|~~\n  New   Invoice \nAmount: 1,250.00\n.\n")).toEqual([
      "New Invoice",
      "Amount: 1,250.00",
    ]);
  });
});

describe("createTesseractVideoAnalysis", () => {
  it("turns each readable frame into an observation and skips the rest", async () => {
    const run = vi.fn(async (path: string) => {
      if (path.endsWith("bad.png")) throw new Error("boom");
      return path.endsWith("a.png") ? "Export report\n" : "  \n";
    });
    const ocr = createTesseractVideoAnalysis({ run });
    const out = await ocr.analyse({
      projectId: "p",
      assetVersionId: "av",
      durationMs: 6000,
      frames: [
        { timestampMs: 0, path: "/f/a.png" },
        { timestampMs: 2000, path: "/f/blank.png" },
        { timestampMs: 4000, path: "/f/bad.png" },
        { timestampMs: 6000 },
      ],
    });
    expect(out).toEqual([
      {
        id: "av-ocr-0",
        projectId: "p",
        assetVersionId: "av",
        timestampMs: 0,
        description: "Text read from the screen by OCR.",
        onScreenText: ["Export report"],
      },
    ]);
    expect(run).toHaveBeenCalledTimes(3);
  });
});

describe("LOCAL_OCR=tesseract (step 8)", () => {
  it("is off by default and on when set", () => {
    expect(loadConfig({}).LOCAL_OCR).toBe("none");
    expect(loadConfig({ LOCAL_OCR: "tesseract" }).LOCAL_OCR).toBe("tesseract");
    const base = {
      SLEUTH_DATA_MODE: "supabase",
      TRANSCRIPTION_PROVIDER: "deepgram",
      TRANSCRIPTION_API_KEY: "k",
      ALLOW_MOCK_PROVIDERS: false,
      MAX_FRAMES_PER_VIDEO: 60,
      VIDEO_ANALYSIS_PROVIDER: "none",
    } as const;
    expect(createProviders(base).localVideoAnalysis).toBeUndefined();
    expect(createProviders({ ...base, LOCAL_OCR: "tesseract" }).localVideoAnalysis?.name).toBe(
      "tesseract",
    );
  });

  it("a visitor's job reads frames locally: screen evidence, no speech-only note, nothing sent", async () => {
    const remote = geminiSet([]); // nobody on the list: the visitor may not send frames
    const local = {
      name: "local-ocr-fake",
      analyse: vi.fn(async ({ projectId, assetVersionId, frames }) =>
        fx.frames
          .filter((o) =>
            frames.some((f: { timestampMs: number }) => f.timestampMs === o.timestampMs),
          )
          .map((o) => ({ ...o, projectId, assetVersionId })),
      ),
    };
    const store = fakeStore(inputsFor(VISITOR));
    const media = fakeMedia();
    const log = vi.fn();
    await createSupabaseHandler({
      ...handlerOptions(store, { ...remote, localVideoAnalysis: local }, media),
      log,
    })(job);

    expect(remote.client.calls).toBe(0);
    expect(media.frameCalls).toBe(1);
    expect(local.analyse).toHaveBeenCalledTimes(1);
    const [written] = store.written;
    expect(written?.frames?.length).toBeGreaterThan(0);
    for (const f of written?.findings ?? []) expect(f.limits).not.toContain(SPEECH_ONLY_NOTE);
    expect(log).toHaveBeenCalledWith(
      "analysed",
      expect.objectContaining({ speechOnly: 0, screenSource: "local_ocr" }),
    );
  });
});
