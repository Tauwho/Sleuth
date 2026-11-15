import { z } from "zod";
import { FrameObservationSchema, TranscriptSegmentSchema } from "@sleuth/contracts";

/**
 * A demo scenario (ADR 0010): everything demo mode needs to play the product with no network.
 * The project data itself is the golden fixture; a scenario adds what the worker and the
 * providers would have done, recorded once and replayed on every run.
 */
export const DemoScenarioSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,64}$/, "Use lower-case letters, digits and dashes."),
    title: z.string().trim().min(1).max(120),
    /** Shown on every demo page. Says plainly that this is sample data. */
    disclosure: z.string().trim().min(1).max(300),
    /** Scripted job progress, in ms after "Run analysis". The same on every run. */
    timeline: z.object({
      runningAfterMs: z.number().int().nonnegative(),
      succeededAfterMs: z.number().int().positive(),
    }),
    /**
     * The scenario's own video, served by this app from `apps/web/public`. It plays for every
     * video version the scenario brings (the demo and its copies), never for an upload.
     */
    video: z
      .object({
        path: z.string().regex(/^\/scenarios\/[a-z0-9-]+\/[\w.-]+\.(mp4|webm)$/),
        durationMs: z.number().int().positive(),
        /** How the video was made, in one line. Shown nowhere, kept for whoever re-records it. */
        provenance: z.string().trim().min(1).max(300),
      })
      .optional(),
    /** Recorded provider answers, replayed for every analysis in this scenario. */
    replay: z.object({
      transcript: z.array(TranscriptSegmentSchema),
      frames: z.array(FrameObservationSchema),
    }),
    /** The walkthrough to rehearse before recording (N3). Optional. */
    beats: z.array(z.lazy(() => DemoBeatSchema)).optional(),
  })
  .refine((s) => s.timeline.succeededAfterMs > s.timeline.runningAfterMs, {
    message: "A job must start running before it succeeds.",
    path: ["timeline", "succeededAfterMs"],
  });

export type DemoScenario = z.infer<typeof DemoScenarioSchema>;

/**
 * One step of a recorded walkthrough (N3). `pnpm demo:rehearse <scenario>` plays the beats in a
 * browser against demo mode and fails on the first one that drifts: a missing or changed control,
 * text that differs, or a step slower than `maxMs`. `say` is the narration line, for the person
 * recording; nothing reads it aloud.
 */
const Say = {
  say: z.string().max(300).optional(),
  maxMs: z.number().int().positive().max(60_000).optional(),
};
export const DemoBeatSchema = z.discriminatedUnion("do", [
  z.object({ do: z.literal("open"), path: z.string().startsWith("/"), ...Say }),
  z.object({
    do: z.literal("click"),
    role: z.enum(["button", "link", "tab"]),
    name: z.string().min(1),
    ...Say,
  }),
  /** Change text in a field: the first `find` becomes `replace`. Fails if `find` is not there. */
  z.object({
    do: z.literal("edit"),
    label: z.string().min(1),
    find: z.string().min(1),
    replace: z.string(),
    ...Say,
  }),
  /** Exactly one of the targets. `text` must be contained in it (or equal, for `exact`). */
  z.object({
    do: z.literal("expect"),
    testId: z.string().optional(),
    heading: z.string().optional(),
    url: z.string().optional(),
    text: z.string().optional(),
    ...Say,
  }),
]);
export type DemoBeat = z.infer<typeof DemoBeatSchema>;
