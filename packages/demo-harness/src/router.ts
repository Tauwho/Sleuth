/**
 * Matching `fetch` calls to an app's endpoint list, so an in-tab API can answer them. Paths use
 * OpenAPI style: `/projects/{id}/jobs/{jobId}`.
 */
export interface RouteSpec {
  id: string;
  method: string;
  path: string;
}

export interface Route<S extends RouteSpec> {
  spec: S;
  pattern: RegExp;
  names: string[];
}

export function compileRoutes<S extends RouteSpec>(specs: readonly S[]): Route<S>[] {
  return specs.map((spec) => {
    const names: string[] = [];
    const source = spec.path
      .split("/")
      .map((part) => {
        const m = /^\{(\w+)\}$/.exec(part);
        if (!m) return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        names.push(m[1] as string);
        return "([^/]+)";
      })
      .join("/");
    return { spec, pattern: new RegExp(`^${source}$`), names };
  });
}

export function matchRoute<S extends RouteSpec>(
  routes: readonly Route<S>[],
  method: string,
  path: string,
): { spec: S; params: Record<string, string> } | null {
  for (const route of routes) {
    if (route.spec.method !== method) continue;
    const m = route.pattern.exec(path);
    if (!m) continue;
    const params: Record<string, string> = {};
    route.names.forEach((name, i) => {
      params[name] = decodeURIComponent(m[i + 1] ?? "");
    });
    return { spec: route.spec, params };
  }
  return null;
}

/** The parts of a `fetch` call an in-tab API needs. Only string bodies are read. */
export function readFetchCall(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  prefix: string,
): { method: string; path: string; body: string | null } | null {
  const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(href, "http://demo.invalid");
  if (!url.pathname.startsWith(`${prefix}/`)) return null;
  const method = (
    init?.method ??
    (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")
  ).toUpperCase();
  return {
    method,
    path: url.pathname.slice(prefix.length),
    body: typeof init?.body === "string" ? init.body : null,
  };
}

export function jsonResponse(status: number, value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}
