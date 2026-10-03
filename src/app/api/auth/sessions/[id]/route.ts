import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext, UnauthorizedError } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { NotFoundError, clientIp, handleApiError, ok } from "@/lib/api";

const SCOPE = "auth.sessions.detail";

/** Revoke one specific session. IDOR-safe: scoped to the caller's own userId. */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) throw new UnauthorizedError();

    const session = await db.session.findFirst({
      where: { id: params.id, userId: ctx.userId }
    });
    if (!session) throw new NotFoundError("Session not found.");

    await db.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });

    await writeAuditLog({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "REVOKE_SESSION",
      entityType: "Session",
      entityId: session.id,
      ipAddress: clientIp(request)
    });

    return ok({ id: session.id, revoked: true });
  } catch (err) {
    return handleApiError(SCOPE, err);
  }
}
