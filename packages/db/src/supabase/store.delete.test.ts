import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as t from "../schema";
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
if (!configured)
  console.warn("[supabase delete] database or Supabase keys are not set: the suite is skipped.");
const suite = configured ? describe : describe.skip;
vi.setConfig({ testTimeout: 120_000, hookTimeout: 90_000 });

suite("deleteProject on Postgres (step 10)", () => {
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

  beforeAll(() => {
    handle = openTestDb(1);
    store = createSupabaseStore({ db: handle.db });
  });

  afterAll(async () => {
    for (const id of users) {
      await deleteProjectsOwnedBy(handle.db, id);
      await admin().auth.admin.deleteUser(id);
    }
    await handle.close();
  }, 90_000);

  it("the owner deletes a copy with all its rows; a stranger and the demo are refused", async () => {
    const owner = { userId: await anonymousUser() };
    const stranger = { userId: await anonymousUser() };
    const p = await store.createProject(owner, {
      name: `${TEST_PROJECT_PREFIX}delete`,
      copyFromDemo: true,
    });

    await expect(store.deleteProject(stranger, p.id)).rejects.toMatchObject({ status: 404 });
    await expect(store.deleteProject(owner, "proofpay-demo")).rejects.toMatchObject({
      status: 403,
    });

    expect(await store.deleteProject(owner, p.id)).toEqual({ projectId: p.id, files: 0 });
    const left = await handle.db.select().from(t.projects).where(eq(t.projects.id, p.id));
    expect(left).toEqual([]);
    const evidence = await handle.db
      .select()
      .from(t.evidenceCandidates)
      .where(eq(t.evidenceCandidates.projectId, p.id));
    expect(evidence).toEqual([]);
    const demo = await handle.db
      .select()
      .from(t.projects)
      .where(eq(t.projects.id, "proofpay-demo"));
    expect(demo).toHaveLength(1);
  });
});
