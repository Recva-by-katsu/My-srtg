import { getConfig } from "@/lib/config/env";
import { jsonError, jsonOk, withErrorHandling } from "@/lib/api/respond";
import { parseBody } from "@/lib/api/request";
import { loginSchema } from "@/lib/api/schemas";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionToken } from "@/lib/auth/session";
import { applyPublicRateLimit, issueAuthCookies } from "@/lib/api/guard";
import { clientIp } from "@/lib/auth/cookies";
import { rateLimit, rateLimitKey, resetRateLimit } from "@/lib/security/rate-limit";
import { timingSafeEqual } from "@/lib/utils/crypto";
import { createLogger } from "@/lib/utils/logger";

const logger = createLogger("auth-login");

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return withErrorHandling(
    async () => {
      const config = getConfig();
      const ip = clientIp(request);

      if (!config.admin.passwordHash || !config.admin.sessionSecret) {
        return jsonError(
          503,
          "admin_not_configured",
          "Login admin belum aktif. Set ADMIN_PASSWORD_HASH dan SESSION_SECRET di dashboard hosting Anda.",
        );
      }

      await applyPublicRateLimit(request, "login");

      const { data, response } = await parseBody(request, loginSchema);
      if (response) return response;
      const input = data!;

      // Throttle repeated failures per IP + username combination.
      const attemptKey = rateLimitKey("login-fail", ip, input.username.toLowerCase());
      const attempts = await rateLimit(attemptKey, {
        limit: config.rateLimit.loginAttempts,
        windowSeconds: config.rateLimit.loginWindowSeconds,
        prefix: "auth",
      });
      if (!attempts.ok) {
        logger.warn("Login blocked by rate limit", { ip, username: input.username });
        return jsonError(
          429,
          "too_many_attempts",
          `Terlalu banyak percobaan login. Coba lagi dalam ${attempts.retryAfterSeconds} detik.`,
          { retryAfterSeconds: attempts.retryAfterSeconds },
        );
      }

      const usernameOk = timingSafeEqual(
        input.username.trim().toLowerCase(),
        config.admin.username.trim().toLowerCase(),
      );
      const passwordOk = await verifyPassword(input.password, config.admin.passwordHash);

      if (!usernameOk || !passwordOk) {
        logger.warn("Login failed", { ip, username: input.username });
        return jsonError(401, "invalid_credentials", "Username atau password salah");
      }

      const ttlSeconds = input.remember
        ? Math.min(config.admin.sessionTtlSeconds * 7, 30 * 24 * 60 * 60)
        : config.admin.sessionTtlSeconds;

      const token = await createSessionToken(config.admin.username, ttlSeconds);
      const cookies = await issueAuthCookies(request, token);

      await resetRateLimit(attemptKey, "auth").catch(() => undefined);

      logger.info("Admin logged in", { ip, username: config.admin.username });

      const body = jsonOk({
        username: config.admin.username,
        expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
        csrfToken: cookies.csrfToken,
      });
      body.headers.append("Set-Cookie", cookies.sessionCookie);
      body.headers.append("Set-Cookie", cookies.csrfCookie);
      return body;
    },
    { route: "/api/auth/login", method: "POST" },
  );
}
