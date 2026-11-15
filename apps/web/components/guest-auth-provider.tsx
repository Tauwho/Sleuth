"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { createApiClient, type ApiClient } from "@/lib/api-client";
import type { ClientAuthConfig } from "@/lib/auth-config";
import { browserDemoApi } from "@/lib/demo/browser";
import type { DemoApi } from "@/lib/demo/demo-api";
import { createFixtureGuestAuth, type GuestAuth } from "@/lib/guest-auth";
import { createBrowserGuestAuth } from "@/lib/supabase-browser";

interface GuestAuthContextValue {
  auth: GuestAuth;
  client: ApiClient;
  /** Set in demo mode only: the in-browser API that answers every call (ADR 0010). */
  demo: DemoApi | null;
}

// Without a provider (unit tests, isolated components): fixture behaviour, no Supabase.
const fallback: GuestAuthContextValue = {
  auth: createFixtureGuestAuth(),
  client: createApiClient(),
  demo: null,
};
const GuestAuthContext = createContext<GuestAuthContextValue>(fallback);

/**
 * One guest sign-in and one API client for every page in the workspace, so the dashboard and
 * "Make an editable copy" share the same session and the same in-flight sign-in.
 * `config` comes from the server (`clientAuthConfigFromEnv`); tests may pass `auth` directly.
 * In demo mode the client's requests never leave the browser.
 */
export function GuestAuthProvider({
  config,
  auth: given,
  children,
}: {
  config: ClientAuthConfig;
  auth?: GuestAuth;
  children: ReactNode;
}) {
  const [value] = useState<GuestAuthContextValue>(() => {
    const auth = given ?? createBrowserGuestAuth(config);
    if (config.mode === "demo") {
      const demo = browserDemoApi(config.scenario);
      return { auth, client: createApiClient({ fetchImpl: demo.fetch }), demo };
    }
    const client =
      auth.mode === "supabase" ? createApiClient({ beforeRequest: () => auth.prepareRequest() }) : createApiClient();
    return { auth, client, demo: null };
  });
  return <GuestAuthContext.Provider value={value}>{children}</GuestAuthContext.Provider>;
}

export function useGuestAuth(): GuestAuth {
  return useContext(GuestAuthContext).auth;
}

export function useApiClient(): ApiClient {
  return useContext(GuestAuthContext).client;
}

/** The in-browser demo API, or null outside demo mode. */
export function useDemoApi(): DemoApi | null {
  return useContext(GuestAuthContext).demo;
}

/** Shown next to the write buttons in Supabase mode. Promises nothing it cannot keep. */
export function GuestSessionNote({ className, auth: given }: { className?: string; auth?: GuestAuth }) {
  const shared = useGuestAuth();
  const auth = given ?? shared;
  if (auth.mode !== "supabase") return null;
  return (
    <p className={`text-xs text-muted ${className ?? ""}`}>
      Your projects use a guest session in this browser only. If you clear this browser&apos;s data, the session
      and its projects cannot be recovered.
    </p>
  );
}
