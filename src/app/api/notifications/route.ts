import { type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAuthContext, UnauthorizedError } from "@/lib/rbac";
import { handleApiError, ok, readQuery, paginationSchema } from "@/lib/api";

const listSchema = paginationSchema.extend({
  unreadOnly: z.enum(["true", "false"]).optional(),
  type: z.enum(["ATTENDANCE", "PAYMENT", "EXAM", "ACADEMIC", "ADMINISTRATIVE", "SYSTEM"]).optional()
});

/**
 * In-app notification centre. Scoped to the authenticated user — a
 * notification addressed to someone else is never returned, regardless
 * of what the client asks for.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) throw new UnauthorizedError();
    const query = readQuery(request, listSchema);

    const where = {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      ...(query.unreadOnly === "true" ? { isRead: false } : {}),
      ...(query.type ? { type: query.type } : {})
    };

    const [total, unread, rows] = await Promise.all([
      db.notification.count({ where }),
      db.notification.count({
        where: { organizationId: ctx.organizationId, userId: ctx.userId, isRead: false }
      }),
      db.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      })
    ]);

    return ok({
      notifications: rows,
      unread,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize))
      }
    });
  } catch (err) {
    return handleApiError("notifications.list", err);
  }
}

/** Marks every notification for the current user as read. */
export async function PATCH() {
  try {
    const ctx = await getAuthContext();
    if (!ctx) throw new UnauthorizedError();

    const result = await db.notification.updateMany({
      where: { organizationId: ctx.organizationId, userId: ctx.userId, isRead: false },
      data: { isRead: true, readAt: new Date() }
    });

    return ok({ updated: result.count });
  } catch (err) {
    return handleApiError("notifications.readAll", err);
  }
}
