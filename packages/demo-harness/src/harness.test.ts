import { describe, expect, it } from "vitest";
import {
  compileRoutes,
  createEventLog,
  createSerialQueue,
  DemoBeatSchema,
  matchRoute,
  readFetchCall,
  readRecMode,
  ScenarioBaseSchema,
  timelineStage,
} from "./index";

function memory() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe("router", () => {
  const routes = compileRoutes([
    { id: "list", method: "GET", path: "/things" },
    { id: "job", method: "GET", path: "/things/{id}/jobs/{jobId}" },
    { id: "csv", method: "GET", path: "/things/{id}/report.csv" },
  ]);

  it("matches method and path, and decodes parameters", () => {
    expect(matchRoute(routes, "GET", "/things/a%20b/jobs/j1")).toEqual({
      spec: { id: "job", method: "GET", path: "/things/{id}/jobs/{jobId}" },
      params: { id: "a b", jobId: "j1" },
    });
    expect(matchRoute(routes, "POST", "/things")).toBeNull();
    expect(matchRoute(routes, "GET", "/things/x/reportXcsv")).toBeNull();
  });

  it("reads a fetch call under the prefix only", () => {
    expect(readFetchCall("/api/v1/things", { method: "post", body: "{}" }, "/api/v1")).toEqual({
      method: "POST",
      path: "/things",
      body: "{}",
    });
    expect(readFetchCall("/other", undefined, "/api/v1")).toBeNull();
  });
});

describe("event log", () => {
  it("saves, reads and clears entries, and ignores broken data", () => {
    const s = memory();
    const log = createEventLog(s, "k");
    log.save([
      { kind: "call", at: 1, method: "POST", path: "/x", body: { a: 1 } },
      { kind: "event", at: 2, name: "finish", data: { jobId: "j" } },
    ]);
    expect(log.read()).toHaveLength(2);
    s.setItem("k", "{broken");
    expect(log.read()).toEqual([]);
    log.clear();
    expect(s.data.size).toBe(0);
    expect(createEventLog(null, "k").read()).toEqual([]);
  });
});

describe("serial queue", () => {
  it("runs tasks in order and keeps going after a failure", async () => {
    const serial = createSerialQueue();
    const seen: number[] = [];
    const a = serial(async () => {
      await new Promise((r) => setTimeout(r, 5));
      seen.push(1);
    });
    const b = serial(async () => {
      throw new Error("x");
    });
    const c = serial(async () => void seen.push(3));
    await a;
    await expect(b).rejects.toThrow("x");
    await c;
    expect(seen).toEqual([1, 3]);
  });
});

describe("scenario and timeline", () => {
  it("accepts a minimal scenario and refuses a backwards timeline", () => {
    const base = {
      id: "any-app",
      title: "Any app",
      disclosure: "Demo mode: sample data.",
      timeline: { runningAfterMs: 1000, succeededAfterMs: 3000 },
    };
    expect(ScenarioBaseSchema.safeParse(base).success).toBe(true);
    expect(
      ScenarioBaseSchema.safeParse({
        ...base,
        timeline: { runningAfterMs: 3000, succeededAfterMs: 1000 },
      }).success,
    ).toBe(false);
  });

  it("says where a job is on its timeline", () => {
    const t = { runningAfterMs: 1000, succeededAfterMs: 3000 };
    expect([0, 999, 1000, 2999, 3000].map((ms) => timelineStage(t, ms))).toEqual([
      "queued",
      "queued",
      "running",
      "running",
      "succeeded",
    ]);
  });

  it("checks beats", () => {
    expect(DemoBeatSchema.safeParse({ do: "click", role: "button", name: "Go" }).success).toBe(
      true,
    );
    expect(DemoBeatSchema.safeParse({ do: "click", role: "checkbox", name: "Go" }).success).toBe(
      false,
    );
    expect(DemoBeatSchema.safeParse({ do: "open", path: "no-slash" }).success).toBe(false);
  });
});

describe("rec mode", () => {
  it("uses the key it is given", () => {
    const s = memory();
    expect(readRecMode("?rec=1", s, "my-app:rec")).toBe(true);
    expect(s.data.get("my-app:rec")).toBe("1");
    expect(readRecMode("", s)).toBe(false);
  });
});
