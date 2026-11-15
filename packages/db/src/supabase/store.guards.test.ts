import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createSupabaseStore, type SupabaseStore } from "./store";
import {
  deleteProjectsOwnedBy,
  openTestDb,
  TEST_PROJECT_PREFIX,
  testDatabaseUrl,
} from "./test-support";

const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const configured = Boolean(testDatabaseUrl() && supaUrl && serviceKey && anonKey);
if (!configured) {
  console.warn(
    "[supabase guards] database or Supabase keys are not set: the guards suite is skipped.",
  );
}
const suite = configured ? describe : describe.skip;
vi.setConfig({ testTimeout: 120_000, hookTimeout: 90_000 });

const upload = {
  fileName: "v.mp4",
  mimeType: "video/mp4" as const,
  sizeBytes: 1000,
  durationMs: 10_000,
};

suite("abuse guards on Postgres (step 6)", () => {
  let handle: ReturnType<typeof openTestDb>;
  let store: SupabaseStore;
  const users: string[] = [];
  const admin = () =>
    createClient(supaUrl as string, serviceKey as string, { auth: { persistSession: false } });

  async function anonymousUser(): Promise<string> {
    const browser = createClient(supaUrl as string, anonKey as string, {
      auth: { persistSession: false },
    });
    const { data, error } = await browser.auth.signInAnonymously();
    if (error || !data.user) throw new Error("Anonymous sign-in is not enabled on this project.");
    users.push(data.user.id);
    return data.user.id;
  }

  async function realUser(): Promise<string> {
    const email = `${TEST_PROJECT_PREFIX}guards-${Date.now()}@example.com`;
    const { data, error } = await admin().auth.admin.createUser({ email, email_confirm: true });
    if (error || !data.user) throw new Error("Could not create a test user.");
    users.push(data.user.id);
    return data.user.id;
  }

  beforeAll(() => {
    handle = openTestDb(1);
    store = createSupabaseStore({
      db: handle.db,
      guards: { maxProjectsPerGuest: 2, maxUploadsPerGuest: 2 },
    });
  });

  afterAll(async () => {
    for (const id of users) {
      await deleteProjectsOwnedBy(handle.db, id);
      await admin().auth.admin.deleteUser(id);
    }
    await handle.close();
  }, 90_000);

  it("an anonymous guest keeps at most 2 projects and uploads at most 2 videos", async () => {
    const guest = { userId: await anonymousUser() };
    const a = await store.createProject(guest, { name: `${TEST_PROJECT_PREFIX}guards-a` });
    await store.createProject(guest, { name: `${TEST_PROJECT_PREFIX}guards-b` });
    await expect(
      store.createProject(guest, { name: `${TEST_PROJECT_PREFIX}guards-c` }),
    ).rejects.toMatchObject({
      status: 429,
      code: "project_limit",
    });
    await store.createUploadUrl(guest, a.id, upload);
    await store.createUploadUrl(guest, a.id, upload);
    await expect(store.createUploadUrl(guest, a.id, upload)).rejects.toMatchObject({
      status: 429,
      code: "upload_limit",
    });
  });

  it("a signed-up user has no guest limits", async () => {
    const person = { userId: await realUser() };
    for (const n of ["x", "y", "z"]) {
      await store.createProject(person, { name: `${TEST_PROJECT_PREFIX}guards-${n}` });
    }
  });
});
