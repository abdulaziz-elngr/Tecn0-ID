import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext, UnauthorizedError } from "@/lib/rbac";
import { handleApiError, ok, NotFoundError } from "@/lib/api";

export async function PATCH(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) throw new UnauthorizedError();

    // Ownership is part of the WHERE clause — this is the IDOR defence.
    const result = await db.notification.updateMany({
      where: { id: params.id, organizationId: ctx.organizationId, userId: ctx.userId },
      data: { isRead: true, readAt: new Date() }
    });
    if (result.count === 0) throw new NotFoundError("Notification not found.");

    return ok({ id: params.id, isRead: true });
  } catch (err) {
    return handleApiError("notifications.read", err);
  }
}
