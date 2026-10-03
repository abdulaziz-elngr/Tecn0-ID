import { db } from "@/lib/db";
import { getAuthContext, resolveBranchScope, UnauthorizedError } from "@/lib/rbac";
import { handleApiError, ok } from "@/lib/api";

const SCOPE = "branches";

/**
 * Lightweight branch directory. No dedicated permission gates this —
 * every authenticated user needs branch names to make sense of the
 * records already visible to them (their own scope only, same as
 * everywhere else).
 */
export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!ctx) throw new UnauthorizedError();
    const branchIds = resolveBranchScope(ctx);

    const branches = await db.branch.findMany({
      where: {
        deletedAt: null,
        center: { organizationId: ctx.organizationId },
        ...(branchIds ? { id: { in: branchIds } } : {})
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, centerId: true, isActive: true }
    });

    return ok(branches);
  } catch (err) {
    return handleApiError(SCOPE, err);
  }
}
