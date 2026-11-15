import { z } from "zod";
import {
  ENDPOINTS,
  type EndpointSpec,
  type FrameObservation,
  type ProcessingJob,
  type TranscriptSegment,
} from "@sleuth/contracts";
import { createFixtureStore, StoreError, type Actor, type FixtureStore } from "@sleuth/db/fixture";
import { runPipeline } from "@sleuth/evidence-engine";
import type { TranscriptionProvider, VideoAnalysisProvider } from "@sleuth/media/core";
import { buildCsv, buildHtml } from "../../app/api/_lib/report";
import {
  compileRoutes,
  createEventLog,
  createSerialQueue,
  jsonResponse,
  matchRoute,
  readFetchCall,
  timelineStage,
  type DemoStorage,
  type LogEntry,
} from "@sleuth/demo-harness";
import type { DemoScenario } from "./scenario";

export type { DemoStorage } from "@sleuth/demo-harness";

/**
 * Demo mode's API (ADR 0010). It answers every `/api/v1` call inside the browser, from the
 * fixture store, so the demo makes no network call and every visitor has their own state.
 *
 * - The same contract schemas as the server check every request body and every response.
 * - State is an ordered log of the calls that changed something. It is kept in sessionStorage
 *   and replayed on load with the same clock values, so a reload shows the same state.
 * - An analysis follows the scenario's timeline: queued, then running, then it succeeds with the
 *   real evidence engine run on the scenario's recorded transcript and frames.
 */

/** The one person in demo mode. Signed in, so "Make an editable copy" works as on the live site. */
export const DEMO_USER = "demo-user";
const ACTOR: Actor = { userId: DEMO_USER };
const API_PREFIX = "/api/v1";
const FRAME_INTERVAL_MS = 2000;
const MAX_FRAMES = 60;

export interface DemoApiOptions {
  scenario: DemoScenario;
  /** Where the event log lives. Null keeps it in memory only (tests, private windows). */
  storage?: DemoStorage | null;
  /** Wall clock in ms. Tests pass a fake one. */
  clock?: () => number;
  /** This app's origin, to make the scenario video's URL absolute. Defaults to the page's. */
  origin?: string;
  /** `URL.createObjectURL` and `revokeObjectURL`; tests pass fakes. */
  objectUrls?: ObjectUrls;
}

export interface ObjectUrls {
  create(file: Blob): string;
  revoke(url: string): void;
}

function browserObjectUrls(): ObjectUrls {
  return {
    create: (file) => URL.createObjectURL(file),
    revoke: (url) => URL.revokeObjectURL(url),
  };
}

/** The "upload URL" demo mode hands out. Nothing is ever sent to it. */
export const DEMO_UPLOAD_PREFIX = "demo://keep-in-tab/";

export interface DemoApi {
  /** A drop-in `fetch` for the API client. Only `/api/v1` paths are answered. */
  fetch: typeof fetch;
  /** Forget every change and start the scenario again. */
  reset: () => Promise<void>;
  /** Number of logged changes. For tests and the pre-flight page. */
  changeCount: () => Promise<number>;
  /**
   * Keep a chosen file for the video version behind a demo upload URL, so it plays in this tab.
   * Returns false if the URL is not one of ours. Nothing is sent anywhere.
   */
  keepUpload: (uploadUrl: string, file: Blob) => boolean;
}

const ROUTES = compileRoutes(ENDPOINTS as readonly EndpointSpec[]);
const match = (method: string, path: string) => matchRoute(ROUTES, method, path);

/** What each endpoint does. Mirrors the thin route handlers in `app/api/v1`. */
type Handler = (
  store: FixtureStore,
  params: Record<string, string>,
  body: never,
) => Promise<unknown>;
const p = (params: Record<string, string>, key: string) => params[key] ?? "";

export const HANDLERS: Record<string, Handler> = {
  listProjects: async (s) => ({ projects: await s.listProjects(ACTOR) }),
  createProject: async (s, _p, body: { name: string; copyFromDemo?: boolean }) => ({
    project: await s.createProject(ACTOR, body),
  }),
  getProject: (s, params) => s.getProjectDetail(ACTOR, p(params, "id")),
  deleteProject: async (s, params) => ({
    deleted: true as const,
    ...(await s.deleteProject(ACTOR, p(params, "id"))),
  }),
  createUploadUrl: (s, params, body: Parameters<FixtureStore["createUploadUrl"]>[2]) =>
    s.createUploadUrl(ACTOR, p(params, "id"), body),
  getPlaybackUrl: (s, params) =>
    s.getPlaybackUrl(ACTOR, p(params, "id"), p(params, "assetVersionId")),
  createScript: (s, params, body: { text: string }) =>
    s.createScript(ACTOR, p(params, "id"), body.text),
  setChecklist: async (s, params, body: { items: { label: string }[] }) => ({
    items: await s.setChecklist(
      ACTOR,
      p(params, "id"),
      body.items.map((i) => i.label),
    ),
  }),
  startAnalysis: async (s, params, body: Parameters<FixtureStore["startAnalysis"]>[2]) => ({
    job: await s.startAnalysis(ACTOR, p(params, "id"), body),
  }),
  getJob: async (s, params) => ({
    job: await s.getJob(ACTOR, p(params, "id"), p(params, "jobId")),
  }),
  listEvidence: async (s, params) => ({ evidence: await s.listEvidence(ACTOR, p(params, "id")) }),
  listFindings: async (s, params) => ({ findings: await s.listFindings(ACTOR, p(params, "id")) }),
  reviewEvidence: (s, params, body: Parameters<FixtureStore["reviewEvidence"]>[2]) =>
    s.reviewEvidence(ACTOR, p(params, "id"), body),
  createReshoot: async (s, params, body: Parameters<FixtureStore["createReshoot"]>[2]) => ({
    reshoot: await s.createReshoot(ACTOR, p(params, "id"), body),
  }),
  listReshoots: async (s, params) => ({ reshoots: await s.listReshoots(ACTOR, p(params, "id")) }),
  updateReshoot: async (
    s,
    params,
    body: { status: Parameters<FixtureStore["updateReshoot"]>[2] },
  ) => ({
    reshoot: await s.updateReshoot(ACTOR, p(params, "id"), body.status),
  }),
  getCoverage: (s, params) => s.getCoverage(ACTOR, p(params, "id")),
  sealProject: async (s, params, body: { note?: string }) => ({
    seal: await s.sealProject(ACTOR, p(params, "id"), body.note),
  }),
  reportCsv: async (s, params) => buildCsv(await s.getReportData(ACTOR, p(params, "id"))),
  reportHtml: async (s, params) => buildHtml(await s.getReportData(ACTOR, p(params, "id"))),
};

const json = jsonResponse;
function errorJson(status: number, code: string, message: string, details?: unknown): Response {
  return json(status, { error: { code, message, ...(details === undefined ? {} : { details }) } });
}

/** Replay providers: the scenario's recorded answers, stamped with the job's project and video. */
function replayProviders(scenario: DemoScenario): {
  transcription: TranscriptionProvider;
  videoAnalysis: VideoAnalysisProvider;
} {
  return {
    transcription: {
      name: "demo-replay",
      async transcribe({ projectId, assetVersionId }) {
        return scenario.replay.transcript.map((t): TranscriptSegment => ({
          ...t,
          projectId,
          assetVersionId,
        }));
      },
    },
    videoAnalysis: {
      name: "demo-replay",
      async analyse({ projectId, assetVersionId, frames }) {
        const wanted = new Set(frames.map((f) => f.timestampMs));
        return scenario.replay.frames
          .filter((o) => wanted.has(o.timestampMs))
          .map((o): FrameObservation => ({ ...o, projectId, assetVersionId }));
      },
    },
  };
}

export function createDemoApi(options: DemoApiOptions): DemoApi {
  const { scenario } = options;
  const storage = options.storage ?? null;
  const clock = options.clock ?? (() => Date.now());
  // v2: the log format moved to @sleuth/demo-harness (N8). An older v1 log is simply not read.
  const log = createEventLog(storage, `sleuth-demo:${scenario.id}:v2`);
  const providers = replayProviders(scenario);
  const origin =
    options.origin ?? (typeof window !== "undefined" ? window.location.origin : "http://localhost");
  /** Video versions made by an upload in this session. Only scenario videos have a file to play. */
  let uploaded = new Set<string>();
  /**
   * Video versions whose chosen file this tab still holds, as `blob:` URLs. They live only as long
   * as the tab: after a reload the version is still there, but with no file it gets the simulated clock.
   */
  const files = new Map<string, string>();
  const objectUrls = options.objectUrls ?? browserObjectUrls();
  const forgetFiles = () => {
    for (const url of files.values()) objectUrls.revoke(url);
    files.clear();
  };

  let current = 0;
  let store: FixtureStore;
  let events: LogEntry[] = [];
  /** Queued jobs the timeline has not finished yet: job id to project id and start time. */
  let pending = new Map<string, { projectId: string; createdAtMs: number }>();

  function fresh() {
    store = createFixtureStore({
      now: () => new Date(current),
      // A visitor may analyse as often as they like here: it costs nothing.
      dailyAnalysisLimit: 100_000,
    });
    events = [];
    pending = new Map();
    uploaded = new Set();
    forgetFiles();
  }

  const save = () => log.save(events);

  async function finish(projectId: string, jobId: string) {
    pending.delete(jobId);
    const job = await store.getJob(ACTOR, projectId, jobId);
    if (job.status !== "queued") return;
    const detail = await store.getProjectDetail(ACTOR, projectId);
    const result = await runPipeline({
      projectId,
      assetVersionId: job.payload.assetVersionId,
      durationMs: detail.assetVersion?.durationMs ?? 0,
      analysisRunId: `run-${job.id}`,
      segments: detail.scriptVersion?.segments ?? [],
      checklist: detail.checklist,
      transcription: providers.transcription,
      videoAnalysis: providers.videoAnalysis,
      frameIntervalMs: FRAME_INTERVAL_MS,
      maxFrames: MAX_FRAMES,
      ...(job.payload.segmentIds ? { segmentIds: job.payload.segmentIds } : {}),
      existingEvidence: await store.listEvidence(ACTOR, projectId),
    });
    await store.applyAnalysisResult(ACTOR, projectId, jobId, {
      evidence: result.evidence,
      findings: result.findings,
    });
  }

  /** Finish every job whose time has come, at the exact time the timeline says. */
  async function tick(now: number) {
    const due = [...pending.entries()]
      .map(([jobId, j]) => ({
        jobId,
        ...j,
        at: j.createdAtMs + scenario.timeline.succeededAfterMs,
      }))
      .filter((j) => j.at <= now)
      .sort((a, b) => a.at - b.at);
    for (const j of due) {
      current = j.at;
      await finish(j.projectId, j.jobId);
      events.push({
        kind: "event",
        at: j.at,
        name: "finish",
        data: { projectId: j.projectId, jobId: j.jobId },
      });
    }
    if (due.length > 0) save();
  }

  function overlay(job: ProcessingJob, now: number): ProcessingJob {
    const started = pending.get(job.id);
    if (job.status !== "queued" || !started) return job;
    if (timelineStage(scenario.timeline, now - started.createdAtMs) === "queued") return job;
    const at = new Date(started.createdAtMs + scenario.timeline.runningAfterMs).toISOString();
    return {
      ...job,
      status: "running",
      attempts: 1,
      lockedBy: "demo",
      heartbeatAt: at,
      updatedAt: at,
    };
  }

  /** Run one call against the store. Returns the result, or throws a StoreError. */
  async function run(
    spec: EndpointSpec,
    params: Record<string, string>,
    body: unknown,
  ): Promise<unknown> {
    const handler = HANDLERS[spec.id];
    if (!handler) throw new StoreError("not_found", 404, "No such endpoint in demo mode.");
    const result = await handler(store, params, body as never);
    if (spec.id === "createUploadUrl") {
      const r = result as { assetVersion: { id: string }; uploadUrl: string };
      uploaded.add(r.assetVersion.id);
      // The file never leaves the tab: the upload flow hands it to `keepUpload` instead (N4).
      return { ...r, uploadUrl: `${DEMO_UPLOAD_PREFIX}${encodeURIComponent(r.assetVersion.id)}` };
    }
    if (spec.id === "getPlaybackUrl") {
      const kept = files.get(p(params, "assetVersionId"));
      if (kept) return { url: kept, expiresAt: new Date(current + 24 * 60 * 60_000).toISOString() };
    }
    if (
      spec.id === "getPlaybackUrl" &&
      scenario.video &&
      !uploaded.has(p(params, "assetVersionId"))
    ) {
      // The store said the version exists (else it threw). It came with the scenario: play its video.
      return {
        url: new URL(scenario.video.path, origin).href,
        expiresAt: new Date(current + 24 * 60 * 60_000).toISOString(),
      };
    }
    if (spec.id === "startAnalysis") {
      const job = (result as { job: ProcessingJob }).job;
      if (job.status === "queued" && !pending.has(job.id)) {
        pending.set(job.id, { projectId: job.projectId, createdAtMs: Date.parse(job.createdAt) });
      }
    }
    return result;
  }

  async function replay() {
    fresh();
    const saved = log.read();
    for (const e of saved) {
      current = e.at;
      try {
        if (e.kind === "event") {
          if (e.name === "finish") await finish(e.data.projectId ?? "", e.data.jobId ?? "");
        } else {
          const found = match(e.method, e.path);
          if (!found) continue;
          const body = found.spec.request ? found.spec.request.parse(e.body ?? {}) : undefined;
          await run(found.spec, found.params, body);
        }
        events.push(e);
      } catch {
        // A log from an older build that no longer applies: stop and keep what did apply.
        break;
      }
    }
    if (events.length !== saved.length) save();
  }

  // Calls run one at a time, in order, after the saved log has been replayed.
  const serial = createSerialQueue(replay());

  async function handle(method: string, path: string, rawBody: string | null): Promise<Response> {
    const found = match(method, path);
    if (!found) return errorJson(404, "not_found", "No such endpoint in demo mode.");
    const { spec, params } = found;
    const now = clock();
    await tick(now);
    current = now;

    let body: unknown;
    if (spec.request) {
      let raw: unknown = {};
      if (rawBody && rawBody.trim() !== "") {
        try {
          raw = JSON.parse(rawBody);
        } catch {
          return errorJson(400, "invalid_json", "Request body is not valid JSON.");
        }
      }
      const parsed = spec.request.safeParse(raw);
      if (!parsed.success) {
        return errorJson(
          400,
          "invalid_request",
          "The request body is not valid.",
          z.flattenError(parsed.error),
        );
      }
      body = parsed.data;
    }

    let result: unknown;
    try {
      result = await run(spec, params, body);
    } catch (err) {
      if (err instanceof StoreError)
        return errorJson(err.status, err.code, err.message, err.details);
      return errorJson(500, "internal_error", "Something went wrong in demo mode.");
    }

    if (method !== "GET") {
      events.push({ kind: "call", at: now, method, path, ...(body === undefined ? {} : { body }) });
      save();
    }
    if (spec.id === "getJob") {
      const r = result as { job: ProcessingJob };
      result = { job: overlay(r.job, now) };
    }
    if (spec.contentType) {
      return new Response(result as string, {
        status: 200,
        headers: { "content-type": `${spec.contentType}; charset=utf-8` },
      });
    }
    return json(spec.successStatus, spec.response?.parse(result));
  }

  const demoFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = readFetchCall(input, init, API_PREFIX);
    if (!call) return errorJson(404, "not_found", "Demo mode answers only /api/v1 calls.");
    return serial(() => handle(call.method, call.path, call.body));
  }) as typeof fetch;

  return {
    fetch: demoFetch,
    reset: () =>
      serial(async () => {
        log.clear();
        fresh();
      }),
    changeCount: () => serial(async () => events.length),
    keepUpload: (uploadUrl, file) => {
      if (!uploadUrl.startsWith(DEMO_UPLOAD_PREFIX)) return false;
      const id = decodeURIComponent(uploadUrl.slice(DEMO_UPLOAD_PREFIX.length));
      if (!uploaded.has(id)) return false;
      const old = files.get(id);
      if (old) objectUrls.revoke(old);
      files.set(id, objectUrls.create(file));
      return true;
    },
  };
}
