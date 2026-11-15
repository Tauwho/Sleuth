import { loadGoldenFixture } from "@sleuth/db/fixture";
import proofpayBeats from "./beats/proofpay-v1.json";
import { DemoScenarioSchema, type DemoScenario } from "./scenario";

/**
 * The scenarios demo mode can load, by id. Each one is checked against the schema when it is
 * first read, so a broken scenario fails loudly instead of playing a wrong demo.
 */
const builders: Record<string, () => unknown> = {
  "proofpay-v1": () => {
    const fx = loadGoldenFixture();
    return {
      id: "proofpay-v1",
      title: "ProofPay invoice demo",
      disclosure:
        "Demo mode: sample data. Analyses replay a saved run, and nothing you do leaves this browser.",
      timeline: { runningAfterMs: 1500, succeededAfterMs: 4500 },
      video: {
        path: "/scenarios/proofpay-v1/video.mp4",
        durationMs: fx.assetVersion.durationMs,
        provenance:
          "scripts/make-scenario-clip.ps1 from the golden fixture: frames.json drawn as on-screen text, transcript.json read by Windows text-to-speech. No third-party media.",
      },
      replay: { transcript: fx.transcript, frames: fx.frames },
      // Scenes 2 to 7 of docs/submission/demo-script.md, on the demo build. Plain JSON, so the
      // rehearsal (tests/e2e-demo/rehearse.spec.ts) reads the same file.
      beats: proofpayBeats,
    };
  },
};

const cache = new Map<string, DemoScenario>();

export const SCENARIO_IDS = Object.keys(builders);

/** The scenario with this id, or null when there is none. */
export function getScenario(id: string): DemoScenario | null {
  const cached = cache.get(id);
  if (cached) return cached;
  const build = builders[id];
  if (!build) return null;
  const scenario = DemoScenarioSchema.parse(build());
  cache.set(id, scenario);
  return scenario;
}
