import { z } from "zod";
import {
  ENDPOINTS,
  type EndpointId,
  type EndpointSpec,
  type ErrorResponse,
} from "@sleuth/contracts";
import { StoreError, type Actor, type ProjectStore } from "@sleuth/db/fixture";
import { getStore, resolveActor } from "./data-source";

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: 400 | 401 | 403 | 404 | 409 | 500 | 501,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

type Spec<K extends EndpointId> = Extract<(typeof ENDPOINTS)[number], { id: K }>;
type BodyOf<K extends EndpointId> =
  Spec<K> extends { request: infer S extends z.ZodType } ? z.infer<S> : undefined;
type OutOf<K extends EndpointId> =
  Spec<K> extends { response: infer S extends z.ZodType }
    ? z.input<S>
    : Spec<K> extends { contentType: string }
      ? string
      : never;

export interface Ctx<K extends EndpointId> {
  req: Request;
  params: Record<string, string>;
  actor: Actor;
  store: ProjectStore;
  body: BodyOf<K>;
  /** Extra response headers a route may set. Never put a secret in them. */
  headers: Headers;
}

function errorBody(code: string, message: string, details?: unknown): ErrorResponse {
  return { error: { code, message, ...(details === undefined ? {} : { details }) } };
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): Response {
  return Response.json(errorBody(code, message, details), { status });
}

/** A short machine code from an error, or "-". Never a message: only [A-Z0-9_] up to 40 characters. */
export function safeCode(err: unknown): string {
  for (const e of chain(err)) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" && /^[A-Z0-9_]{2,40}$/.test(code)) return code;
  }
  return "-";
}

/** The error and up to 3 causes below it: Drizzle wraps the driver's error in `cause`. */
function chain(err: unknown): unknown[] {
  const out: unknown[] = [];
  let cur: unknown = err;
  while (out.length < 4 && typeof cur === "object" && cur !== null) {
    out.push(cur);
    cur = (cur as { cause?: unknown }).cause;
  }
  return out;
}

/** The innermost error name that is a plain word, e.g. PostgresError under a Drizzle wrapper. */
export function safeName(err: unknown): string {
  const names = chain(err)
    .map((e) => (e instanceof Error ? e.name : ""))
    .filter((n) => /^[A-Za-z]{1,40}$/.test(n));
  return names[names.length - 1] ?? "unknown";
}

function toErrorResponse(err: unknown): Response {
  if (err instanceof ApiError || err instanceof StoreError) {
    return errorResponse(err.status, err.code, err.message, err.details);
  }
  // Never echo internals. Log the error name and its short code only (for example a Postgres
  // SQLSTATE or EMAXCONNSESSION), never the message or request content.
  const name = safeName(err);
  const code = safeCode(err);
  console.error("api_error", name, code);
  const res = errorResponse(500, "internal_error", "Something went wrong on our side.");
  // The same two words in a header, so a probe can see why without the runtime logs (N5).
  // Both are checked to be short machine words: never a message, value or content.
  res.headers.set("x-sleuth-error", `${name} ${code}`);
  return res;
}

async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  if (text.trim() === "") return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError("invalid_json", 400, "Request body is not valid JSON.");
  }
}

/**
 * Wraps a route: resolves the caller, validates the request body and the response with the
 * contract schema for `id`, and turns every failure into `{ error: { code, message, details? } }`.
 */
export function endpoint<K extends EndpointId>(id: K, run: (ctx: Ctx<K>) => Promise<OutOf<K>>) {
  const spec: EndpointSpec = ENDPOINTS.find((e) => e.id === id) as EndpointSpec;
  return async (
    req: Request,
    routeCtx: { params: Promise<Record<string, string>> },
  ): Promise<Response> => {
    try {
      const params = await routeCtx.params;
      const actor = await resolveActor(req);
      const store = getStore();
      let body: unknown;
      if (spec.request) {
        const parsed = spec.request.safeParse(await readJson(req));
        if (!parsed.success) {
          throw new ApiError(
            "invalid_request",
            400,
            "The request body is not valid.",
            z.flattenError(parsed.error),
          );
        }
        body = parsed.data;
      }
      const headers = new Headers();
      const result = await run({ req, params, actor, store, body: body as BodyOf<K>, headers });
      if (spec.contentType) {
        headers.set("content-type", `${spec.contentType}; charset=utf-8`);
        if (spec.contentType === "text/csv") {
          headers.set("content-disposition", 'attachment; filename="sleuth-report.csv"');
        }
        return new Response(result as string, { status: 200, headers });
      }
      return Response.json(spec.response?.parse(result), { status: spec.successStatus, headers });
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}
