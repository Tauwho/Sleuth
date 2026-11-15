import { createBrowserClient } from "@supabase/ssr";
import type { ClientAuthConfig } from "./auth-config";
import { createFixtureGuestAuth, createGuestAuth, type GuestAuth, type GuestAuthPort } from "./guest-auth";
import { getTurnstileToken } from "./turnstile";

/**
 * The browser's guest sign-in for a server-given config.
 * - Fixture: no Supabase client is ever built.
 * - Supabase: `createBrowserClient` from `@supabase/ssr`, built on first use. It keeps the
 *   session in the `@supabase/ssr` cookies that `app/api/_lib/supabase-server.ts` reads, so
 *   same-origin API calls carry it without any header.
 */
export function createBrowserGuestAuth(
  config: ClientAuthConfig,
  createClient: typeof createBrowserClient = createBrowserClient,
): GuestAuth {
  // Demo mode answers every call in the browser (ADR 0010), so it needs no sign-in either.
  if (config.mode !== "supabase") return createFixtureGuestAuth();
  const { url, anonKey } = config;
  if (!url || !anonKey) return createGuestAuth(null);
  const siteKey = config.turnstileSiteKey;
  return createGuestAuth(
    (): GuestAuthPort => createClient(url, anonKey).auth,
    siteKey ? () => getTurnstileToken(siteKey) : undefined,
  );
}
