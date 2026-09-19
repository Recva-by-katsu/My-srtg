import { getConfig } from "@/lib/config/env";
import { randomToken, timingSafeEqual } from "@/lib/utils/crypto";
import { parseCookieHeader, type CookieOptions } from "@/lib/auth/cookies";

/**
 * Double submit cookie CSRF protection.
 *
 * The session cookie is `SameSite=Strict`, which already blocks cross-site
 * form/fetch requests. The CSRF token adds a second factor for every state
 * changing admin API call: the browser must read the (non HttpOnly) cookie and
 * echo it back in the `x-katsu-csrf` header, which a cross-origin attacker
 * cannot do because of the same-origin policy.
 */

export const CSRF_HEADER = "x-katsu-csrf";

export function createCsrfToken(): string {
  return randomToken(24);
}

export function readCsrfCookie(request: Request): string | null {
  const config = getConfig();
  const jar = parseCookieHeader(request.headers.get("cookie"));
  return jar[config.admin.csrfCookieName] ?? null;
}

export function csrfCookieOptions(secure: boolean): CookieOptions {
  const config = getConfig();
  return {
    maxAgeSeconds: config.admin.sessionTtlSeconds,
    path: "/",
    secure,
    httpOnly: false,
    sameSite: "Strict",
  };
}

export function csrfCookieName(): string {
  return getConfig().admin.csrfCookieName;
}

/** Validates the CSRF header of a mutating request. */
export function verifyCsrfToken(request: Request): boolean {
  const cookieValue = readCsrfCookie(request);
  if (!cookieValue) return false;
  const headerValue = request.headers.get(CSRF_HEADER);
  if (!headerValue) return false;
  return timingSafeEqual(cookieValue, headerValue);
}
