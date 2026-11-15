import { describe, expect, it } from "vitest";
import { createFixtureStore } from "./store";

const alice = { userId: "alice" };
const bob = { userId: "bob" };
const upload = {
  fileName: "v.mp4",
  mimeType: "video/mp4" as const,
  sizeBytes: 1000,
  durationMs: 10_000,
};

describe("deleteProject (step 10)", () => {
  it("the owner deletes a project and its uploads; it is gone from every read", async () => {
    const store = createFixtureStore();
    const p = await store.createProject(alice, { name: "mine", copyFromDemo: true });
    await store.createUploadUrl(alice, p.id, upload);
    expect(await store.deleteProject(alice, p.id)).toEqual({ projectId: p.id, files: 1 });
    expect((await store.listProjects(alice)).map((x) => x.id)).not.toContain(p.id);
    await expect(store.getProjectDetail(alice, p.id)).rejects.toMatchObject({ status: 404 });
  });

  it("a copy's seeded video is not counted as this project's file", async () => {
    const store = createFixtureStore();
    const p = await store.createProject(alice, { name: "copy", copyFromDemo: true });
    expect((await store.deleteProject(alice, p.id)).files).toBe(0);
  });

  it("nobody deletes the demo, someone else's project, or as a visitor", async () => {
    const store = createFixtureStore();
    const p = await store.createProject(alice, { name: "mine" });
    await expect(store.deleteProject(alice, "proofpay-demo")).rejects.toMatchObject({
      status: 403,
    });
    await expect(store.deleteProject(bob, p.id)).rejects.toMatchObject({ status: 404 });
    await expect(store.deleteProject({ userId: null }, p.id)).rejects.toMatchObject({
      status: 404,
    });
    expect((await store.listProjects(alice)).map((x) => x.id)).toContain(p.id);
  });

  it("frees a guest's project slot", async () => {
    const guest = { userId: "anon-1" };
    const store = createFixtureStore({ guards: { maxProjectsPerGuest: 1 } });
    const p = await store.createProject(guest, { name: "a" });
    await expect(store.createProject(guest, { name: "b" })).rejects.toMatchObject({ status: 429 });
    await store.deleteProject(guest, p.id);
    await store.createProject(guest, { name: "b" });
  });
});
