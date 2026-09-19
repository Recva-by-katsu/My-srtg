"use client";

/**
 * Browser side API helper.
 *
 * Adds the CSRF header expected by `/api/admin/*`, normalises the JSON envelope
 * and turns failures into typed errors that the UI can render directly.
 */

export interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
}

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const CSRF_COOKIE_NAME = "katsu_csrf";

export function readCsrfCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${CSRF_COOKIE_NAME}=`));
  return match ? decodeURIComponent(match.slice(CSRF_COOKIE_NAME.length + 1)) : null;
}

export interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Skip the CSRF header (only needed for public GETs). */
  skipCsrf?: boolean;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: ApiRequestOptions["query"]): string {
  if (!query) return path;
  const url = new URL(path, window.location.origin);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return `${url.pathname}${url.search}`;
}

export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { body, query, skipCsrf, headers, ...rest } = options;
  const method = (rest.method ?? (body === undefined ? "GET" : "POST")).toUpperCase();

  const finalHeaders = new Headers(headers);
  if (body !== undefined && !finalHeaders.has("Content-Type")) {
    finalHeaders.set("Content-Type", "application/json");
  }
  if (!skipCsrf && !["GET", "HEAD"].includes(method)) {
    const token = readCsrfCookie();
    if (token) finalHeaders.set("x-katsu-csrf", token);
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      ...rest,
      method,
      headers: finalHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch {
    throw new ApiClientError(0, "network_error", "Tidak dapat menghubungi server. Periksa koneksi Anda.");
  }

  const text = await response.text();
  let payload: ApiEnvelope<T> | null = null;
  if (text) {
    try {
      payload = JSON.parse(text) as ApiEnvelope<T>;
    } catch {
      payload = null;
    }
  }

  if (!response.ok || !payload || payload.ok === false) {
    const error = payload?.error;
    throw new ApiClientError(
      response.status,
      error?.code ?? `http_${response.status}`,
      error?.message ?? `Permintaan gagal (HTTP ${response.status})`,
      error?.details,
    );
  }

  return payload.data as T;
}

export function errorMessage(error: unknown, fallback = "Terjadi kesalahan yang tidak diketahui"): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

/** Extracts per-field validation messages returned by the API. */
export function fieldIssues(error: unknown): Record<string, string> {
  if (!(error instanceof ApiClientError)) return {};
  const details = error.details as { issues?: Array<{ path: string; message: string }> } | undefined;
  const issues = details?.issues;
  if (!Array.isArray(issues)) return {};
  return issues.reduce<Record<string, string>>((accumulator, issue) => {
    if (issue?.path) accumulator[issue.path] = issue.message;
    return accumulator;
  }, {});
}
