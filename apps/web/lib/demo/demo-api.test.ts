import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENDPOINTS } from "@sleuth/contracts";
import { createApiClient } from "../api-client";
import { createDemoApi, HANDLERS, type DemoStorage } from "./demo-api";
import { DemoScenarioSchema } from "./scenario";
import { getScenario, SCENARIO_IDS } from "./scenarios";

const scenario = getScenario("proofpay-v1");
if (!scenario) throw new Error("proofpay-v1 scenario missing");

function memoryStorage(): DemoStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

function setup(storage: DemoStorage | null = null, start = Date.parse("2026-11-20T10:00:00.000Z")) {
  let t = start;
  const demo = createDemoApi({
    scenario: scenario as NonNullable<typeof scenario>,
    storage,
    clock: () => t,
  });
  const api = createApiClient({ fetchImpl: demo.fetch });
  return {
    demo,
    api,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

/** Copy the demo, edit line 1, run an analysis to the end. Returns the copy's id. */
async function scriptedSession(s: ReturnType<typeof setup>) {
  const { project } = await s.api.createProject("Copy of ProofPay demo", true);
  s.advance(1000);
  const detail = await s.api.getProject(project.id);
  const text = detail.scriptVersion?.text ?? "";
  const [first, ...rest] = text.split("\n");
  await s.api.createScript(project.id, {
    text: [(first ?? "").replace("invoicing", "billing"), ...rest].join("\n"),
  });
  s.advance(1000);
  const { job } = await s.api.startAnalysis(project.id);
  s.advance(scenario!.timeline.succeededAfterMs);
  await s.api.getJob(project.id, job.id);
  return { projectId: project.id, jobId: job.id };
}

async function snapshot(s: ReturnType<typeof setup>, projectId: string) {
  return JSON.stringify({
    projects: await s.api.listProjects(),
    detail: await s.api.getProject(projectId),
    evidence: await s.api.listEvidence(projectId),
    findings: await s.api.listFindings(projectId),
    coverage: await s.api.getCoverage(projectId),
  });
}

describe("demo mode API", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    // Demo mode must never reach the network.
    globalThis.fetch = vi.fn(() => {
      throw new Error("network call in demo mode");
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("answers every endpoint in the contract", () => {
    for (const e of ENDPOINTS) expect(HANDLERS[e.id], e.id).toBeTypeOf("function");
  });

  it("every registered scenario passes its schema", () => {
    for (const id of SCENARIO_IDS)
      expect(DemoScenarioSchema.safeParse(getScenario(id)).success).toBe(true);
  });

  it("shows the read-only demo and makes an editable copy", async () => {
    const s = setup();
    const before = await s.api.listProjects();
    expect(before.projects.filter((p) => p.isDemo)).toHaveLength(1);
    const demo = before.projects[0]!;
    await expect(s.api.createScript(demo.id, { text: "Hello." })).rejects.toMatchObject({
      status: 403,
      code: "demo_read_only",
    });
    const { project } = await s.api.createProject("Copy of ProofPay demo", true);
    expect(project.isDemo).toBe(false);
    expect((await s.api.listProjects()).projects).toHaveLength(2);
  });

  it("runs an analysis on the scenario timeline: queued, running, succeeded with evidence", async () => {
    const s = setup();
    const { project } = await s.api.createProject("Copy", true);
    const { job } = await s.api.startAnalysis(project.id);
    expect(job.status).toBe("queued");
    s.advance(scenario.timeline.runningAfterMs - 1);
    expect((await s.api.getJob(project.id, job.id)).job.status).toBe("queued");
    s.advance(1);
    expect((await s.api.getJob(project.id, job.id)).job.status).toBe("running");
    s.advance(scenario.timeline.succeededAfterMs - scenario.timeline.runningAfterMs);
    expect((await s.api.getJob(project.id, job.id)).job.status).toBe("succeeded");
    const evidence = (await s.api.listEvidence(project.id)).evidence;
    expect(evidence.some((e) => e.analysisRunId === `run-${job.id}`)).toBe(true);
  });

  it("finishes a due job on any call, not only on a job poll", async () => {
    const s = setup();
    const { project } = await s.api.createProject("Copy", true);
    const { job } = await s.api.startAnalysis(project.id);
    s.advance(scenario.timeline.succeededAfterMs + 10_000);
    const evidence = (await s.api.listEvidence(project.id)).evidence;
    expect(evidence.some((e) => e.analysisRunId === `run-${job.id}`)).toBe(true);
  });

  it("a script edit stales only that line's evidence", async () => {
    const s = setup();
    const { project } = await s.api.createProject("Copy", true);
    const detail = await s.api.getProject(project.id);
    const lines = (detail.scriptVersion?.text ?? "").split("\n");
    const res = await s.api.createScript(project.id, {
      text: [(lines[0] ?? "").replace("invoicing", "billing"), ...lines.slice(1)].join("\n"),
    });
    expect(res.diff.modified).toHaveLength(1);
    const findings = (await s.api.listFindings(project.id)).findings;
    expect(findings.some((f) => f.type === "poltergeist")).toBe(true);
  });

  it("gives the same state on every run of the same session", async () => {
    const a = setup();
    const b = setup();
    const ra = await scriptedSession(a);
    const rb = await scriptedSession(b);
    expect(await snapshot(a, ra.projectId)).toBe(await snapshot(b, rb.projectId));
  });

  it("restores the same state after a reload from storage", async () => {
    const storage = memoryStorage();
    const first = setup(storage);
    const { projectId } = await scriptedSession(first);
    const before = await snapshot(first, projectId);
    const reloaded = setup(storage, Date.parse("2026-11-20T12:00:00.000Z"));
    expect(await snapshot(reloaded, projectId)).toBe(before);
  });

  it("reset forgets every change", async () => {
    const storage = memoryStorage();
    const s = setup(storage);
    await scriptedSession(s);
    expect(await s.demo.changeCount()).toBeGreaterThan(0);
    await s.demo.reset();
    expect(await s.demo.changeCount()).toBe(0);
    expect((await s.api.listProjects()).projects).toHaveLength(1);
    expect(storage.data.size).toBe(0);
  });

  it("answers report exports in the browser", async () => {
    const s = setup();
    const { project } = await s.api.createProject("Copy", true);
    const csv = await s.demo.fetch(`/api/v1/projects/${project.id}/report.csv`);
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-type")).toContain("text/csv");
    expect((await csv.text()).length).toBeGreaterThan(0);
  });

  it("plays the scenario's own video for the demo and its copies, never for an upload", async () => {
    const s = setup();
    const demo = await s.api.getProject("proofpay-demo");
    const demoUrl = await s.api.getPlaybackUrl("proofpay-demo", demo.assetVersion!.id);
    expect(demoUrl.url).toBe("http://localhost/scenarios/proofpay-v1/video.mp4");

    const { project } = await s.api.createProject("Copy", true);
    const copy = await s.api.getProject(project.id);
    expect((await s.api.getPlaybackUrl(project.id, copy.assetVersion!.id)).url).toBe(demoUrl.url);

    const up = await s.api.createUploadUrl(project.id, {
      fileName: "mine.mp4",
      mimeType: "video/mp4",
      sizeBytes: 1000,
      durationMs: 10_000,
    });
    expect((await s.api.getPlaybackUrl(project.id, up.assetVersion.id)).url).toBeNull();
  });

  it("the scenario video file exists and matches the fixture length", async () => {
    const { existsSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const file = join(__dirname, "..", "..", "public", scenario.video!.path);
    expect(existsSync(file)).toBe(true);
    expect(statSync(file).size).toBeGreaterThan(10_000);
    expect(statSync(file).size).toBeLessThan(5 * 1024 * 1024);
  });

  it("refuses anything that is not the API", async () => {
    const s = setup();
    const res = await s.demo.fetch("/somewhere-else");
    expect(res.status).toBe(404);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("checks request bodies with the contract schemas", async () => {
    const s = setup();
    const { project } = await s.api.createProject("Copy", true);
    const res = await s.demo.fetch(`/api/v1/projects/${project.id}/scripts`, {
      method: "POST",
      body: JSON.stringify({ wrong: true }),
    });
    expect(res.status).toBe(400);
  });

  it("ignores a broken saved log instead of failing", async () => {
    const storage = memoryStorage();
    storage.setItem("sleuth-demo:proofpay-v1:v1", "{not json");
    const s = setup(storage);
    expect((await s.api.listProjects()).projects).toHaveLength(1);
  });
});
