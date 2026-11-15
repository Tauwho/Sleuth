/**
 * Server only: which sign-in the browser should use, read from the server's environment at
 * request time. The mode follows `SLEUTH_DATA_MODE` with the same rule as the API
 * (`app/api/_lib/data-source.ts`, `dataMode()`): only "supabase" means Supabase, and only "demo"
 * means demo mode. Having a URL or a key set never switches the mode on its own.
 *
 * Only public values go to the browser. The Supabase URL and anon key are public by design
 * (ADR 0006); the service-role key, DATABASE_URL and provider keys are never read here. Demo mode
 * sends only a scenario id (ADR 0010).
 */
export type ClientAuthConfig =
  | { mode: "fixture" }
  | { mode: "demo"; scenario: string }
  | { mode: "supabase"; url: string | null; anonKey: string | null };

/** The scenario demo mode loads when `SLEUTH_DEMO_SCENARIO` is unset or blank. */
export const DEFAULT_DEMO_SCENARIO = "proofpay-v1";

export function clientAuthConfigFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): ClientAuthConfig {
  if (env.SLEUTH_DATA_MODE === "demo") {
    return { mode: "demo", scenario: env.SLEUTH_DEMO_SCENARIO?.trim() || DEFAULT_DEMO_SCENARIO };
  }
  if (env.SLEUTH_DATA_MODE !== "supabase") return { mode: "fixture" };
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim() || null;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || null;
  return { mode: "supabase", url, anonKey };
}
