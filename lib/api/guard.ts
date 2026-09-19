import { getConfig } from "@/lib/config/env";
import { clientIp, isSecureRequest, serializeCookie } from "@/lib/auth/cookies";
import { CSRF_HEADER, createCsrfToken, csrfCookieOptions, verifyCsrfToken } from "@/lib/auth/csrf";
import { getSessionFromRequest, type SessionPayload } from "@/lib/auth/session";
import { rateLimit, rateLimitKey } from "@/lib/security/rate-limit";
import { MemoryStateStore } from "@/lib/security/state-store";
import { AppError, tooManyRequests } from "@/lib/utils/assert";

export interface AdminContext {
  session: SessionPayload;
  ip: string;
}

export interface GuardOptions {
  /** Require a valid CSRF token for mutating requests (default: true). */
  csrf?: boolean;
  /** Apply the shared admin API rate limit (default: true). */
  rateLimit?: boolean;
  /** Custom rate limit rule. */
  limit?: { limit: number; windowSeconds: number };
}

/**
 * Authentication + CSRF + rate limiting for every `/api/admin/*` route.
 *
 * Defence in depth: `proxy.ts` already redirects unauthenticated visitors away
 * from `/admin`, and each handler re-verifies the session here so a missing or
 * misconfigured proxy can never expose data.
 */
export async function requireAdmin(
  request: Request,
  options: GuardOptions = {},
): Promise<AdminContext> {
  const config = getConfig();
  const ip = clientIp(request);

  if (!config.admin.passwordHash || !config.admin.sessionSecret) {
    throw new AppError(
      "admin_not_configured",
      "Admin belum terkonfigurasi. Set ADMIN_PASSWORD_HASH dan SESSION_SECRET pada environment variables.",
      { status: 503 },
    );
  }

  const session = await getSessionFromRequest(request);
  if (!session) {
    throw new AppError("unauthorized", "Sesi admin tidak valid atau sudah berakhir. Silakan login ulang.", {
      status: 401,
    });
  }

  const isMutation = !["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase());
  if (options.csrf !== false && isMutation && !verifyCsrfToken(request)) {
    throw new AppError(
      "csrf_failed",
      `Token CSRF tidak valid. Pastikan request mengirim header ${CSRF_HEADER} yang diambil dari cookie ${config.admin.csrfCookieName}.`,
      { status: 403 },
    );
  }

  if (options.rateLimit !== false) {
    const rule = options.limit ?? {
      limit: config.rateLimit.apiRequests,
      windowSeconds: config.rateLimit.apiWindowSeconds,
    };
    const result = await rateLimit(rateLimitKey("admin", session.jti, ip), rule);
    if (!result.ok) {
      throw tooManyRequests(
        `Terlalu banyak permintaan. Coba lagi dalam ${result.retryAfterSeconds} detik.`,
        result.retryAfterSeconds,
      );
    }
  }

  return { session, ip };
}

/**
 * Rate limiting for public endpoints (download center, file metadata).
 *
 * Downloads use a per-isolate memory store on purpose: a single resumed file can
 * generate many range requests, and hitting the database for each of them would
 * add latency and cost for no real security gain.
 */
const downloadStore = new MemoryStateStore();

export async function applyPublicRateLimit(
  request: Request,
  scope: "download" | "public" | "login",
): Promise<void> {
  const config = getConfig();
  const ip = clientIp(request);
  const rule =
    scope === "download"
      ? { limit: config.rateLimit.downloads, windowSeconds: config.rateLimit.downloadWindowSeconds }
      : scope === "login"
        ? { limit: config.rateLimit.loginAttempts, windowSeconds: config.rateLimit.loginWindowSeconds }
        : { limit: config.rateLimit.apiRequests, windowSeconds: config.rateLimit.apiWindowSeconds };

  const result = await rateLimit(rateLimitKey(scope, ip), {
    ...rule,
    ...(scope === "download" ? { store: downloadStore } : {}),
  });
  if (!result.ok) {
    throw tooManyRequests(
      `Terlalu banyak permintaan dari jaringan Anda. Coba lagi dalam ${result.retryAfterSeconds} detik.`,
      result.retryAfterSeconds,
    );
  }
}

export interface AuthCookieSet {
  sessionCookie: string;
  csrfCookie: string;
  csrfToken: string;
}

/** Issues both the HttpOnly session cookie and the readable CSRF cookie. */
export async function issueAuthCookies(
  request: Request,
  sessionToken: string,
): Promise<AuthCookieSet> {
  const config = getConfig();
  const secure = isSecureRequest(request);
  const csrfToken = createCsrfToken();

  return {
    sessionCookie: serializeCookie(config.admin.sessionCookieName, sessionToken, {
      maxAgeSeconds: config.admin.sessionTtlSeconds,
      path: "/",
      secure,
      httpOnly: true,
      sameSite: "Strict",
    }),
    csrfCookie: serializeCookie(config.admin.csrfCookieName, csrfToken, csrfCookieOptions(secure)),
    csrfToken,
  };
}

export function clearAuthCookies(request: Request): string[] {
  const config = getConfig();
  const secure = isSecureRequest(request);
  const expired = { maxAgeSeconds: 0, path: "/", secure, httpOnly: true, sameSite: "Strict" as const };
  return [
    serializeCookie(config.admin.sessionCookieName, "", expired),
    serializeCookie(config.admin.csrfCookieName, "", { ...expired, httpOnly: false }),
  ];
}
