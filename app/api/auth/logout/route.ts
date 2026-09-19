import { jsonOk, withErrorHandling } from "@/lib/api/respond";
import { clearAuthCookies } from "@/lib/api/guard";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return withErrorHandling(
    async () => {
      const response = jsonOk({ loggedOut: true });
      for (const cookie of clearAuthCookies(request)) {
        response.headers.append("Set-Cookie", cookie);
      }
      return response;
    },
    { route: "/api/auth/logout", method: "POST" },
  );
}
