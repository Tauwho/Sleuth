import { createDemoApi, type DemoApi, type DemoStorage } from "./demo-api";
import { getScenario, SCENARIO_IDS } from "./scenarios";

let shared: { id: string; api: DemoApi } | null = null;

function sessionStore(): DemoStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    // Storage blocked (some private modes): the demo still works, a reload starts over.
    return null;
  }
}

/**
 * The one demo API for this browser tab. State lives in sessionStorage, so each tab is its own
 * visitor and closing the tab forgets everything. An unknown scenario id falls back to the first.
 */
export function browserDemoApi(scenarioId: string): DemoApi {
  const id = getScenario(scenarioId) ? scenarioId : (SCENARIO_IDS[0] as string);
  const scenario = getScenario(id);
  if (!scenario) throw new Error("No demo scenario is defined.");
  // Server render: data loads in effects, so this instance is never asked anything. Never share
  // one across requests.
  if (typeof window === "undefined") return createDemoApi({ scenario, storage: null });
  if (shared?.id === id) return shared.api;
  shared = { id, api: createDemoApi({ scenario, storage: sessionStore() }) };
  return shared.api;
}
