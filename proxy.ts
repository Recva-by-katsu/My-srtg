import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken } from "@/lib/auth/session";
import { getConfig } from "@/lib/config/env";

/**
 * Edge-of-the-app protection layer (Next.js 16 renamed `middleware` to `proxy`).
 *
 * It runs before any page or API route is rendered:
 *  - unauthenticated visitors of `/admin/*` are redirected to the login page
 *  - unauthenticated calls to `/api/admin/*` get a fast 401 JSON response
 *  - authenticated visitors of `/admin/login` are pushed into the dashboard
 *
 * Every protected handler re-verifies the session as well, so this file is a
 * convenience/defence layer rather than the only line of defence.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;
  const appConfig = getConfig();

  // Without a configured admin the panel cannot work at all - let the pages
  // render so the operator can read the setup instructions.
  if (!appConfig.admin.sessionSecret || !appConfig.admin.passwordHash) {
    return NextResponse.next();
  }

  let authenticated = false;
  const token = request.cookies.get(appConfig.admin.sessionCookieName)?.value ?? null;
  if (token) {
    try {
      await verifySessionToken(token);
      authenticated = true;
    } catch {
      authenticated = false;
    }
  }

  if (pathname.startsWith("/api/admin")) {
    if (authenticated) return NextResponse.next();
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "Sesi admin tidak valid atau sudah berakhir." } },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (pathname === "/admin/login") {
    if (authenticated) {
      const target = new URL("/admin", request.url);
      return NextResponse.redirect(target);
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin")) {
    if (authenticated) return NextResponse.next();
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    const response = NextResponse.redirect(loginUrl);
    // Make sure a stale cookie cannot keep redirecting forever.
    response.cookies.set(appConfig.admin.sessionCookieName, "", { maxAge: 0, path: "/" });
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
