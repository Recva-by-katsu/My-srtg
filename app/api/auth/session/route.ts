import { getConfig } from "@/lib/config/env";
import { jsonOk, withErrorHandling } from "@/lib/api/respond";
import { getSessionFromRequest } from "@/lib/auth/session";
import { readCsrfCookie } from "@/lib/auth/csrf";
import { isSecureRequest, serializeCookie } from "@/lib/auth/cookies";
import { csrfCookieOptions, createCsrfToken } from "@/lib/auth/csrf";

export const dynamic = "force-dynamic";

/** Returns the current session plus a CSRF token for the admin SPA shell. */
export async function GET(request: Request): Promise<Response> {
  return withErrorHandling(
    async () => {
      const config = getConfig();
      const session = await getSessionFromRequest(request);

      if (!session) {
        return jsonOk({
          authenticated: false,
          username: null,
          csrfToken: null,
          adminConfigured: Boolean(config.admin.passwordHash && config.admin.sessionSecret),
        });
      }

      let csrfToken = readCsrfCookie(request);
      const response = jsonOk({
        authenticated: true,
        username: session.sub,
        expiresAt: new Date(session.exp * 1000).toISOString(),
        csrfToken,
        adminConfigured: true,
      });

      if (!csrfToken) {
        csrfToken = createCsrfToken();
        response.headers.append(
          "Set-Cookie",
          serializeCookie(config.admin.csrfCookieName, csrfToken, csrfCookieOptions(isSecureRequest(request))),
        );
      }

      return response;
    },
    { route: "/api/auth/session", method: "GET" },
  );
}
