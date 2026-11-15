import { describe, expect, it } from "vitest";
import { createFixtureStore } from "./store";

const guest = { userId: "anon-1" };
const team = { userId: "team-1" };
const upload = {
  fileName: "v.mp4",
  mimeType: "video/mp4" as const,
  sizeBytes: 1000,
  durationMs: 10_000,
};

describe("abuse guards (step 6)", () => {
  it("caps the projects an anonymous guest owns, not a signed-up user's", async () => {
    const store = createFixtureStore({ guards: { maxProjectsPerGuest: 2 } });
    await store.createProject(guest, { name: "a" });
    await store.createProject(guest, { name: "b", copyFromDemo: true });
    await expect(store.createProject(guest, { name: "c" })).rejects.toMatchObject({
      status: 429,
      code: "project_limit",
    });
    for (const n of ["a", "b", "c"]) await store.createProject(team, { name: n });
  });

  it("caps a guest's uploads across their projects", async () => {
    const store = createFixtureStore({ guards: { maxUploadsPerGuest: 2 } });
    const p = await store.createProject(guest, { name: "a" });
    const q = await store.createProject(guest, { name: "b" });
    await store.createUploadUrl(guest, p.id, upload);
    await store.createUploadUrl(guest, q.id, upload);
    await expect(store.createUploadUrl(guest, p.id, upload)).rejects.toMatchObject({
      status: 429,
      code: "upload_limit",
    });
    const t = await store.createProject(team, { name: "t" });
    for (let i = 0; i < 3; i += 1) await store.createUploadUrl(team, t.id, upload);
  });

  it("a copy of the demo does not count as an upload", async () => {
    const store = createFixtureStore({ guards: { maxUploadsPerGuest: 1 } });
    const p = await store.createProject(guest, { name: "copy", copyFromDemo: true });
    await store.createUploadUrl(guest, p.id, upload);
  });

  it("caps analyses for everyone together per UTC day, then resets", async () => {
    let now = new Date("2026-11-20T10:00:00.000Z");
    const store = createFixtureStore({ now: () => now, guards: { globalDailyAnalysisLimit: 2 } });
    const a = await store.createProject({ userId: "u-a" }, { name: "a", copyFromDemo: true });
    const b = await store.createProject({ userId: "u-b" }, { name: "b", copyFromDemo: true });
    await store.startAnalysis({ userId: "u-a" }, a.id, {});
    await store.startAnalysis({ userId: "u-b" }, b.id, {});
    const c = await store.createProject({ userId: "u-c" }, { name: "c", copyFromDemo: true });
    await expect(store.startAnalysis({ userId: "u-c" }, c.id, {})).rejects.toMatchObject({
      status: 429,
      code: "global_limit",
      details: { limit: 2, resetsAt: "2026-11-21T00:00:00.000Z" },
    });
    now = new Date("2026-11-21T00:00:01.000Z");
    await store.startAnalysis({ userId: "u-c" }, c.id, {});
  });

  it("no guards means no limits", async () => {
    const store = createFixtureStore();
    for (let i = 0; i < 5; i += 1) await store.createProject(guest, { name: `p${i}` });
  });
});
