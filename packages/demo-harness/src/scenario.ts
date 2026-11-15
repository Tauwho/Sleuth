import { z } from "zod";

/**
 * One step of a recorded walkthrough. A rehearsal plays the beats in a browser against demo mode
 * and fails on the first one that drifts: a missing or changed control, text that differs, or a
 * step slower than `maxMs`. `say` is the narration line for the person recording.
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
  /** One target: a test id, a heading or a URL fragment. `text` must be contained in it. */
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

/** A scripted job's progress, in ms after it was queued. The same on every run. */
export const TimelineSchema = z
  .object({
    runningAfterMs: z.number().int().nonnegative(),
    succeededAfterMs: z.number().int().positive(),
  })
  .refine((t) => t.succeededAfterMs > t.runningAfterMs, {
    message: "A job must start running before it succeeds.",
    path: ["succeededAfterMs"],
  });
export type Timeline = z.infer<typeof TimelineSchema>;

/**
 * The parts of a scenario every app has. An app adds its own recorded answers with `.extend()`,
 * for example `{ replay: z.object({ transcript: ..., frames: ... }) }`.
 */
export const ScenarioBaseSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,64}$/, "Use lower-case letters, digits and dashes."),
  title: z.string().trim().min(1).max(120),
  /** Shown on every demo page. Says plainly that this is sample data. */
  disclosure: z.string().trim().min(1).max(300),
  /** Scripted job progress. */
  timeline: TimelineSchema,
  /** The scenario's own video, served by the app from its public folder. */
  video: z
    .object({
      path: z.string().regex(/^\/scenarios\/[a-z0-9-]+\/[\w.-]+\.(mp4|webm)$/),
      durationMs: z.number().int().positive(),
      /** How the video was made, in one line, for whoever re-records it. */
      provenance: z.string().trim().min(1).max(300),
    })
    .optional(),
  /** The walkthrough to rehearse before recording. */
  beats: z.array(DemoBeatSchema).optional(),
});
export type ScenarioBase = z.infer<typeof ScenarioBaseSchema>;

/** Where a timeline says a job is, `elapsedMs` after it was queued. */
export function timelineStage(t: Timeline, elapsedMs: number): "queued" | "running" | "succeeded" {
  if (elapsedMs >= t.succeededAfterMs) return "succeeded";
  if (elapsedMs >= t.runningAfterMs) return "running";
  return "queued";
}
