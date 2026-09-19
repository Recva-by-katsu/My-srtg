import { parseWith, type ValidationIssue } from "@/lib/api/schemas";
import { jsonError } from "@/lib/api/respond";
import { badRequest } from "@/lib/utils/assert";
import type { z } from "zod";

const MAX_JSON_BODY_BYTES = 1024 * 1024;

export async function readJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  const declaredLength = Number(request.headers.get("content-length") ?? 0);

  if (declaredLength > MAX_JSON_BODY_BYTES) {
    throw badRequest("body_too_large", `Body JSON maksimal ${MAX_JSON_BODY_BYTES / 1024} KB`);
  }
  if (request.method === "GET" || request.method === "HEAD") return {};
  if (contentType && !contentType.includes("application/json") && !contentType.includes("text/plain")) {
    throw badRequest("invalid_content_type", "Gunakan Content-Type: application/json");
  }

  const text = await request.text();
  if (!text) return {};
  if (text.length > MAX_JSON_BODY_BYTES) {
    throw badRequest("body_too_large", `Body JSON maksimal ${MAX_JSON_BODY_BYTES / 1024} KB`);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw badRequest("invalid_json", "Body bukan JSON yang valid");
  }
}

export interface ParseResult<T> {
  data?: T;
  response?: Response;
}

/** Parses + validates a JSON body, returning a ready-to-send 400 response on failure. */
export async function parseBody<TSchema extends z.ZodType>(
  request: Request,
  schema: TSchema,
): Promise<ParseResult<z.output<TSchema>>> {
  const body = await readJsonBody(request);
  return validate(schema, body);
}

export function parseSearchParams<TSchema extends z.ZodType>(
  request: Request,
  schema: TSchema,
): ParseResult<z.output<TSchema>> {
  const url = new URL(request.url);
  const raw: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    raw[key] = value;
  });
  return validate(schema, raw);
}

function validate<TSchema extends z.ZodType>(
  schema: TSchema,
  input: unknown,
): ParseResult<z.output<TSchema>> {
  const { data, issues } = parseWith(schema, input);
  if (issues.length > 0) {
    return {
      response: jsonError(400, "validation_error", summarize(issues), { issues }),
    };
  }
  return { data };
}

function summarize(issues: ValidationIssue[]): string {
  if (issues.length === 1) return `${issues[0]!.path}: ${issues[0]!.message}`;
  return `${issues.length} field tidak valid: ${issues.map((issue) => issue.path).join(", ")}`;
}
