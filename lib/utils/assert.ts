export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(
    code: string,
    message: string,
    options: { status?: number; details?: unknown; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.status = options.status ?? 400;
    this.details = options.details;
  }
}

export function badRequest(code: string, message: string, details?: unknown): AppError {
  return new AppError(code, message, { status: 400, details });
}

export function unauthorized(code = "unauthorized", message = "Authentication required"): AppError {
  return new AppError(code, message, { status: 401 });
}

export function forbidden(code = "forbidden", message = "Action not allowed"): AppError {
  return new AppError(code, message, { status: 403 });
}

export function notFound(code = "not_found", message = "Resource not found"): AppError {
  return new AppError(code, message, { status: 404 });
}

export function conflict(code: string, message: string, details?: unknown): AppError {
  return new AppError(code, message, { status: 409, details });
}

export function tooLarge(code: string, message: string, details?: unknown): AppError {
  return new AppError(code, message, { status: 413, details });
}

export function tooManyRequests(message: string, retryAfterSeconds: number): AppError {
  return new AppError("rate_limited", message, {
    status: 429,
    details: { retryAfterSeconds },
  });
}

export function serverError(message: string, cause?: unknown): AppError {
  return new AppError("internal_error", message, { status: 500, cause });
}
