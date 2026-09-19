import { getConfig } from "@/lib/config/env";
import { hmacSha256Base64Url, randomToken, timingSafeEqual } from "@/lib/utils/crypto";
import { base64UrlDecode, base64UrlEncode } from "@/lib/utils/encoding";
import { parseCookieHeader } from "@/lib/auth/cookies";

export interface SessionPayload {
  /** Subject - the admin username. */
  sub: string;
  /** Issued at (seconds). */
  iat: number;
  /** Expires at (seconds). */
  exp: number;
  /** Unique token id, allows targeted invalidation. */
  jti: string;
}

const TOKEN_VERSION = "v1";
const CLOCK_SKEW_SECONDS = 60;

export class SessionError extends Error {
  readonly code: "missing_secret" | "invalid_token" | "expired";
  constructor(code: SessionError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

function signingSecret(): string {
  const secret = getConfig().admin.sessionSecret;
  if (!secret) throw new SessionError("missing_secret", "SESSION_SECRET is not configured");
  return secret;
}

export async function createSessionToken(username: string, ttlSeconds?: number): Promise<string> {
  const config = getConfig();
  const secret = signingSecret();
  const now = Math.floor(Date.now() / 1000);
  const ttl = ttlSeconds ?? config.admin.sessionTtlSeconds;
  const payload: SessionPayload = {
    sub: username,
    iat: now,
    exp: now + ttl,
    jti: randomToken(12),
  };
  const body = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await hmacSha256Base64Url(secret, `${TOKEN_VERSION}.${body}`);
  return `${TOKEN_VERSION}.${body}.${signature}`;
}

export async function verifySessionToken(token: string | null | undefined): Promise<SessionPayload> {
  if (!token) throw new SessionError("invalid_token", "No session token provided");
  const segments = token.split(".");
  if (segments.length !== 3 || segments[0] !== TOKEN_VERSION) {
    throw new SessionError("invalid_token", "Malformed session token");
  }
  const [, body, signature] = segments as [string, string, string];
  const secret = signingSecret();
  const expected = await hmacSha256Base64Url(secret, `${TOKEN_VERSION}.${body}`);
  if (!timingSafeEqual(expected, signature)) {
    throw new SessionError("invalid_token", "Session signature mismatch");
  }

  let payload: SessionPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as SessionPayload;
  } catch {
    throw new SessionError("invalid_token", "Session payload is not valid JSON");
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp + CLOCK_SKEW_SECONDS < now) {
    throw new SessionError("expired", "Session expired");
  }
  if (typeof payload.iat === "number" && payload.iat - CLOCK_SKEW_SECONDS > now) {
    throw new SessionError("invalid_token", "Session issued in the future");
  }
  if (!payload.sub || typeof payload.jti !== "string") {
    throw new SessionError("invalid_token", "Session payload incomplete");
  }
  return payload;
}

export function readSessionCookie(request: Request): string | null {
  const config = getConfig();
  const jar = parseCookieHeader(request.headers.get("cookie"));
  return jar[config.admin.sessionCookieName] ?? null;
}

export async function getSessionFromRequest(request: Request): Promise<SessionPayload | null> {
  try {
    return await verifySessionToken(readSessionCookie(request));
  } catch {
    return null;
  }
}

/** Short lived, single purpose token used to authorize public download redirects. */
export interface SignedLinkPayload {
  id: string;
  exp: number;
  scope: "download";
}

export async function createSignedLink(downloadId: string, ttlSeconds?: number): Promise<string> {
  const config = getConfig();
  const secret = config.download.signingSecret;
  if (!secret) throw new SessionError("missing_secret", "DOWNLOAD_SIGNING_SECRET is not configured");
  const payload: SignedLinkPayload = {
    id: downloadId,
    exp: Math.floor(Date.now() / 1000) + (ttlSeconds ?? config.download.linkTtlSeconds),
    scope: "download",
  };
  const body = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await hmacSha256Base64Url(secret, `link.${body}`);
  return `${body}.${signature}`;
}

export async function verifySignedLink(token: string): Promise<SignedLinkPayload | null> {
  const config = getConfig();
  const secret = config.download.signingSecret;
  if (!secret) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = await hmacSha256Base64Url(secret, `link.${body}`);
  if (!timingSafeEqual(expected, signature)) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as SignedLinkPayload;
    if (payload.scope !== "download" || typeof payload.exp !== "number") return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
