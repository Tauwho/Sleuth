import { z } from "zod";
import { FrameObservationSchema, TranscriptSegmentSchema } from "@sleuth/contracts";
import { ScenarioBaseSchema } from "@sleuth/demo-harness";

export { DemoBeatSchema, type DemoBeat } from "@sleuth/demo-harness";

/**
 * A SLEUTH demo scenario (ADR 0010): the harness's common parts (id, disclosure, timeline,
 * video, beats) plus what the worker and the providers would have done, recorded once and
 * replayed on every run. The project data itself is the golden fixture.
 */
export const DemoScenarioSchema = ScenarioBaseSchema.extend({
  /** Recorded provider answers, replayed for every analysis in this scenario. */
  replay: z.object({
    transcript: z.array(TranscriptSegmentSchema),
    frames: z.array(FrameObservationSchema),
  }),
});

export type DemoScenario = z.infer<typeof DemoScenarioSchema>;
