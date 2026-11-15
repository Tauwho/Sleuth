import { describe, expect, it } from "vitest";
import { clientAuthConfigFromEnv, DEFAULT_DEMO_SCENARIO } from "./auth-config";

describe("clientAuthConfigFromEnv", () => {
  it("defaults to fixture mode", () => {
    expect(clientAuthConfigFromEnv({})).toEqual({ mode: "fixture" });
  });

  it("demo mode sends only a scenario id, never a key", () => {
    const config = clientAuthConfigFromEnv({
      SLEUTH_DATA_MODE: "demo",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon",
      SUPABASE_SERVICE_ROLE_KEY: "secret",
    });
    expect(config).toEqual({ mode: "demo", scenario: DEFAULT_DEMO_SCENARIO });
  });

  it("demo mode reads SLEUTH_DEMO_SCENARIO", () => {
    expect(
      clientAuthConfigFromEnv({ SLEUTH_DATA_MODE: "demo", SLEUTH_DEMO_SCENARIO: " other " }),
    ).toEqual({
      mode: "demo",
      scenario: "other",
    });
  });

  it("supabase mode passes the two public values", () => {
    expect(
      clientAuthConfigFromEnv({
        SLEUTH_DATA_MODE: "supabase",
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon",
      }),
    ).toEqual({ mode: "supabase", url: "https://example.supabase.co", anonKey: "public-anon" });
  });
});
