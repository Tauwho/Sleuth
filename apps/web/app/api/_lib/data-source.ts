import { createDb } from "@sleuth/db";
import {
  createFixtureStore,
  StoreError,
  type Actor,
  type GuardOptions,
  type ProjectStore,
} from "@sleuth/db/fixture";
import { createSupabaseStore, storageFromEnv } from "@sleuth/db/supabase";
import {
  authConfigFromEnv,
  createSupabaseSessionVerifier,
  type SessionVerifier,
} from "./supabase-server";

/**
 * - `fixture` (default): the golden fixture in this server's memory.
 * - `supabase`: Postgres, Auth and Storage.
 * - `demo`: the browser answers every API call itself from a scenario (ADR 0010). If something
 *   still reaches these routes, the server answers like fixture mode. It holds no keys either way.
 */
export type DataMode = "fixture" | "supabase" | "demo";

/** Blank or invalid env values count as unset, so the store default applies. */
function positiveInt(value: string | undefined): number | undefined {
  const n = Number(value);
  return value && Number.isInteger(n) && n > 0 ? n : undefined;
}
function seconds(value: string | undefined): number | undefined {
  const n = positiveInt(value);
  return n === undefined ? undefined : n * 1000;
}

/**
 * Which Supabase pooler the web app uses. Default: the URL as given (the session pooler).
 * `SLEUTH_DB_POOL_MODE=transaction` rewrites a Supabase pooler URL from port 5432 to the
 * transaction pooler on 6543. That was the default for a few minutes on 15 Nov 2026 (N5) and made
 * reads hang for 30 s and fail on production, so it was rolled back and is opt-in only.
 */
export function webDatabaseUrl(url: string, mode: string | undefined): string {
  if (mode?.trim() !== "transaction") return url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (!parsed.hostname.endsWith(".pooler.supabase.com") || parsed.port !== "5432") return url;
  parsed.port = "6543";
  return parsed.toString();
}

export function dataMode(): DataMode {
  const mode = process.env.SLEUTH_DATA_MODE;
  if (mode === "supabase" || mode === "demo") return mode;
  return "fixture";
}

const limits = () => ({
  dailyAnalysisLimit: positiveInt(process.env.DAILY_ANALYSIS_LIMIT_PER_USER),
  maxVideoMs: seconds(process.env.MAX_VIDEO_SECONDS),
});

/**
 * Abuse guards (step 6 of the product plan). In Supabase mode they are on by default, sized for
 * the free tiers: 2 projects and 2 uploads per anonymous guest (2 x 50 MB), and 50 analyses a day
 * for everyone together. In fixture mode they apply only when set, so local tests are unchanged.
 */
export function guardsFromEnv(env: NodeJS.ProcessEnv, supabase: boolean): GuardOptions {
  const pick = (name: string, fallback: number) =>
    positiveInt(env[name]) ?? (supabase ? fallback : undefined);
  return {
    maxProjectsPerGuest: pick("MAX_PROJECTS_PER_GUEST", 2),
    maxUploadsPerGuest: pick("MAX_UPLOADS_PER_GUEST", 2),
    globalDailyAnalysisLimit: pick("GLOBAL_DAILY_ANALYSIS_LIMIT", 50),
  };
}

// Keep one store across hot reloads: the fixture keeps UI edits, Supabase keeps one pool.
const globalForStore = globalThis as unknown as {
  __sleuthFixtureStore?: ProjectStore;
  __sleuthSupabaseStore?: ProjectStore;
  __sleuthVerifier?: SessionVerifier;
};

const notConfigured = (what: string) =>
  new StoreError(
    "not_configured",
    501,
    `Supabase mode needs ${what}. Unset SLEUTH_DATA_MODE to use the fixture.`,
  );

/** The store for the current data mode. */
export function getStore(): ProjectStore {
  if (dataMode() === "supabase") {
    if (!globalForStore.__sleuthSupabaseStore) {
      const url = process.env.DATABASE_URL?.trim();
      if (!url) throw notConfigured("DATABASE_URL");
      globalForStore.__sleuthSupabaseStore = createSupabaseStore({
        // Each Vercel instance holds at most 2 connections and frees them after 2 idle seconds (N5).
        // The session pooler allows 15 clients in total. On 14 Nov, three warm instances with 5 each
        // filled it (EMAXCONNSESSION). On 15 Nov, after each redeploy, the old deployment's frozen
        // instances still held their clients for minutes, so the new ones got 500 on every read.
        // A 2 s idle limit closes a connection before an instance is frozen, at the cost of a
        // reconnect for the next request.
        db: createDb(webDatabaseUrl(url, process.env.SLEUTH_DB_POOL_MODE), {
          // 2, not 1: a query outside a transaction must never wait for that transaction.
          max: 2,
          idleTimeoutSeconds: 2,
        }).db,
        storage: storageFromEnv() ?? undefined,
        ...limits(),
        guards: guardsFromEnv(process.env, true),
      });
    }
    return globalForStore.__sleuthSupabaseStore;
  }
  globalForStore.__sleuthFixtureStore ??= createFixtureStore({
    ...limits(),
    guards: guardsFromEnv(process.env, false),
  });
  return globalForStore.__sleuthFixtureStore;
}

/** Tests only: replace how Supabase mode checks a session. Pass undefined to restore. */
export function setSessionVerifierForTests(verifier: SessionVerifier | undefined): void {
  globalForStore.__sleuthVerifier = verifier;
}

function verifier(): SessionVerifier {
  if (!globalForStore.__sleuthVerifier) {
    const config = authConfigFromEnv();
    if (!config) throw notConfigured("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY");
    globalForStore.__sleuthVerifier = createSupabaseSessionVerifier(config);
  }
  return globalForStore.__sleuthVerifier;
}

/**
 * Who is calling.
 * - Fixture mode trusts the `x-fixture-user` header so the frontend can try signed-in and
 *   signed-out views: a user id, or `anonymous`. No header means `fixture-user`.
 * - Supabase mode ignores that header. The caller is whoever Supabase Auth says the session
 *   belongs to (anonymous sign-in included), or a visitor (`userId: null`).
 */
export async function resolveActor(req: Request): Promise<Actor> {
  if (dataMode() === "supabase") {
    return { userId: await verifier()(req) };
  }
  const header = req.headers.get("x-fixture-user")?.trim();
  if (header === "anonymous") return { userId: null };
  return { userId: header && header.length > 0 ? header.slice(0, 64) : "fixture-user" };
}

/** Visitor view for server-rendered pages: the public demo is always readable. */
export const VISITOR: Actor = { userId: null };
