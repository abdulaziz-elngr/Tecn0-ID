import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, ok } from "@/lib/api";

const SCOPE = "permissions";

/** Read-only catalog used by the Users & Permissions screen. */
export async function GET() {
  try {
    await requirePermission("roles.manage");
    const rows = await db.permission.findMany({ orderBy: [{ module: "asc" }, { key: "asc" }] });

    const byModule = rows.reduce<Record<string, typeof rows>>((acc, p) => {
      (acc[p.module] ??= []).push(p);
      return acc;
    }, {});

    return ok({ modules: byModule, catalog: PERMISSIONS });
  } catch (err) {
    return handleApiError(SCOPE, err);
  }
}
