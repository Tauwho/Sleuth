import { connection } from "next/server";
import { Preflight } from "@/features/demo/preflight";
import { clientAuthConfigFromEnv } from "@/lib/auth-config";
import { getScenario, SCENARIO_IDS } from "@/lib/demo/scenarios";

export const metadata = { title: "Demo pre-flight | SLEUTH" };

/** The pre-recording check for demo mode (ADR 0010). Outside demo mode it only says so. */
export default async function PreflightPage() {
  await connection();
  const config = clientAuthConfigFromEnv();
  if (config.mode !== "demo") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="font-display text-3xl text-foreground">Demo pre-flight</h1>
        <p className="mt-3 text-muted">
          This page works only on a demo-mode deployment (SLEUTH_DATA_MODE=demo).
        </p>
      </div>
    );
  }
  const scenario = getScenario(config.scenario) ?? getScenario(SCENARIO_IDS[0] as string);
  return (
    <Preflight
      scenarioId={scenario?.id ?? null}
      requestedId={config.scenario}
      title={scenario?.title ?? null}
      video={
        scenario?.video
          ? { path: scenario.video.path, durationMs: scenario.video.durationMs }
          : null
      }
    />
  );
}
