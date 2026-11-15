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
  })
  .refine((s) => s.timeline.succeededAfterMs > s.timeline.runningAfterMs, {
    message: "A job must start running before it succeeds.",
    path: ["timeline", "succeededAfterMs"],
  });

export type DemoScenario = z.infer<typeof DemoScenarioSchema>;
