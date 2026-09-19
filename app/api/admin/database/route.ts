import { getDatabase, getDatabaseInfo, ensureSchema } from "@/lib/db";
import { jsonOk, withErrorHandling } from "@/lib/api/respond";
import { requireAdmin } from "@/lib/api/guard";
import { SCHEMA_SQL, SCHEMA_VERSION } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request): Promise<Response> {
  return withErrorHandling(
    async () => {
      await requireAdmin(request, { csrf: false });
      const [info, db] = await Promise.all([getDatabaseInfo(), getDatabase()]);
      const counts = await Promise.all([
        db.listFiles({ limit: 1 }),
        db.listStorages(),
        db.listUploadSessions({ limit: 1 }),
      ]);
      return jsonOk({
        info,
        schemaVersion: SCHEMA_VERSION,
        counts: {
          files: counts[0]!.total,
          storages: counts[1]!.length,
          uploadSessions: counts[2]!.length,
        },
      });
    },
    { route: "/api/admin/database", method: "GET" },
  );
}

/** One click schema installer - the browser only alternative to a CLI migration. */
export async function POST(request: Request): Promise<Response> {
  return withErrorHandling(
    async () => {
      await requireAdmin(request);
      const url = new URL(request.url);
      const force = url.searchParams.get("force") === "true";
      const info = await ensureSchema(force);
      return jsonOk({ info, schemaVersion: SCHEMA_VERSION, schemaSql: SCHEMA_SQL });
    },
    { route: "/api/admin/database", method: "POST" },
  );
}
