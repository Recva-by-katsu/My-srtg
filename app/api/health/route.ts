import { getConfigReport } from "@/lib/config/env";
import { getDatabaseInfo } from "@/lib/db";
import { jsonOk } from "@/lib/api/respond";
import { withErrorHandling } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/** Lightweight health probe (safe to expose: no credentials, no internal ids). */
export async function GET(): Promise<Response> {
  return withErrorHandling(async () => {
    const [report, database] = await Promise.all([getConfigReport(), getDatabaseInfo()]);
    return jsonOk({
      status: report.ready ? "ok" : "degraded",
      version: process.env.npm_package_version ?? "1.0.0",
      time: new Date().toISOString(),
      database: {
        driver: database.driver,
        ready: database.ready,
        schemaInitialized: database.schemaInitialized,
      },
      downloadMode: report.downloadMode,
      demoMode: report.demoMode,
      configured: report.ready,
      blockingIssues: report.issues.filter((issue) => issue.level === "error").length,
    });
  }, { route: "/api/health", method: "GET" });
}
