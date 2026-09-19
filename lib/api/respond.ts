import { AppError } from "@/lib/utils/assert";
import { createLogger } from "@/lib/utils/logger";

const logger = createLogger("api");

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: ApiErrorBody;
}

const CACHE_CONTROL_NO_STORE = "no-store, max-age=0, must-revalidate";

function baseHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", CACHE_CONTROL_NO_STORE);
  if (!headers.has("X-Content-Type-Options")) headers.set("X-Content-Type-Options", "nosniff");
  return headers;
}

export function jsonOk<T>(data: T, init: { status?: number; headers?: HeadersInit } = {}): Response {
  const body: ApiEnvelope<T> = { ok: true, data };
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: baseHeaders({ ...Object.fromEntries(new Headers(init.headers ?? {})), "Content-Type": "application/json; charset=utf-8" }),
  });
}

export function jsonError(
  status: number,
  code: string,
  message: string,
  details?: unknown,
  headers?: HeadersInit,
): Response {
  const body: ApiEnvelope<never> = { ok: false, error: { code, message, ...(details === undefined ? {} : { details }) } };
  const responseHeaders = baseHeaders({
    ...Object.fromEntries(new Headers(headers ?? {})),
    "Content-Type": "application/json; charset=utf-8",
  });
  if (status === 429) {
    const retryAfter =
      details && typeof details === "object" && "retryAfterSeconds" in details
        ? String((details as { retryAfterSeconds: number }).retryAfterSeconds)
        : "60";
    responseHeaders.set("Retry-After", retryAfter);
  }
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

export function fromAppError(error: AppError): Response {
  return jsonError(error.status, error.code, error.message, error.details);
}

/** Wraps a handler so every thrown error becomes a consistent JSON envelope. */
export async function withErrorHandling(
  handler: () => Promise<Response>,
  context?: { route: string; method: string },
): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof AppError) {
      if (error.status >= 500) logger.error(error.message, { route: context, code: error.code });
      return fromAppError(error);
    }

    logger.error("Unhandled API error", {
      route: context,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack?.split("\n").slice(0, 3).join(" | ") : undefined,
    });

    return jsonError(500, "internal_error", "Terjadi kesalahan pada server. Detail tersedia di log platform.");
  }
}

export function methodNotAllowed(allowed: string[]): Response {
  return jsonError(405, "method_not_allowed", `Method tidak diizinkan. Gunakan: ${allowed.join(", ")}`, undefined, {
    Allow: allowed.join(", "),
  });
}
