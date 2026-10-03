import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext, UnauthorizedError } from "@/lib/rbac";
import { getSessionPayload, revokeAllSessionsForUser } from "@/lib/session";
import { writeAuditLog } from "@/lib/audit";
import { clientIp, handleApiError, ok } from "@/lib/api";

const SCOPE = "auth.sessions";

/** Active sessions for the *authenticated* user only (§7, Rule 13). */
export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!ctx) throw new UnauthorizedError();
    const payload = await getSessionPayload();

    const sessions = await db.session.findMany({
      where: { userId: ctx.userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: "desc" },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true
      }
    });

    return ok(sessions.map((s) => ({ ...s, current: s.id === payload?.sid })));
  } catch (err) {
    return handleApiError(SCOPE, err);
  }
}

/** Revoke all sessions (everywhere, including the current one). */
export async function DELETE(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) throw new UnauthorizedError();

    await revokeAllSessionsForUser(ctx.userId);

    await writeAuditLog({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "REVOKE_ALL_SESSIONS",
      entityType: "Session",
      entityId: ctx.userId,
      ipAddress: clientIp(request)
    });

    return ok({ revoked: true });
  } catch (err) {
    return handleApiError(SCOPE, err);
  }
}
