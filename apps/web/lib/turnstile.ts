/**
 * Cloudflare Turnstile for the guest sign-in (step 6 of the product plan). Supabase Auth checks
 * the token when "Enable CAPTCHA protection" is on for the project, which stops a script from
 * making guest after guest. Only the public site key reaches the browser. Turnstile is free.
 *
 * The script loads only when a site key is set and only at the moment a guest signs in, so the
 * public demo and fixture mode never load it.
 */

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render(
    el: HTMLElement,
    options: {
      sitekey: string;
      action?: string;
      appearance?: "always" | "execute" | "interaction-only";
      callback: (token: string) => void;
      "error-callback": () => void;
      "expired-callback"?: () => void;
    },
  ): string;
  remove(widgetId: string): void;
}

let loading: Promise<TurnstileApi> | null = null;

function loadScript(): Promise<TurnstileApi> {
  const w = window as unknown as { turnstile?: TurnstileApi };
  if (w.turnstile) return Promise.resolve(w.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_URL;
    s.async = true;
    s.onload = () => (w.turnstile ? resolve(w.turnstile) : reject(new Error("turnstile_missing")));
    s.onerror = () => {
      loading = null;
      reject(new Error("turnstile_load_failed"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * One fresh token. Most visitors see nothing; a few get a small check in the corner of the page,
 * which goes away once it passes. Rejects after `timeoutMs`.
 */
export function getTurnstileToken(siteKey: string, timeoutMs = 60_000): Promise<string> {
  return loadScript().then(
    (api) =>
      new Promise<string>((resolve, reject) => {
        const host = document.createElement("div");
        host.setAttribute("data-testid", "turnstile");
        host.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:60";
        document.body.appendChild(host);
        let id = "";
        const done = (fn: () => void) => {
          window.clearTimeout(timer);
          try {
            if (id) api.remove(id);
          } catch {
            // Already gone.
          }
          host.remove();
          fn();
        };
        const timer = window.setTimeout(
          () => done(() => reject(new Error("turnstile_timeout"))),
          timeoutMs,
        );
        id = api.render(host, {
          sitekey: siteKey,
          action: "guest-sign-in",
          appearance: "interaction-only",
          callback: (token) => done(() => resolve(token)),
          "error-callback": () => done(() => reject(new Error("turnstile_failed"))),
          "expired-callback": () => done(() => reject(new Error("turnstile_expired"))),
        });
      }),
  );
}
