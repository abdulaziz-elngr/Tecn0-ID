import { type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { handleApiError, ok, readQuery, paginationSchema } from "@/lib/api";

/**
 * Audit log reader (spec §41).
 *
 * Read-only by design: there is no POST/PATCH/DELETE handler in this
 * file, and the application never exposes a mutation path for AuditLog,
 * so normal users cannot rewrite history. Access requires
 * `audit_logs.view`, which only administrator roles hold.
 */

const listSchema = paginationSchema.extend({
  action: z.string().trim().max(60).optional(),
  entityType: z.string().trim().max(60).optional(),
  entityId: z.string().trim().max(60).optional(),
  actorUserId: z.string().uuid().optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional()
});

export async function GET(request: NextRequest) {
  try {
    const ctx = await requirePermission("audit_logs.view");
    const query = readQuery(request, listSchema);

    const where = {
      organizationId: ctx.organizationId,
      ...(query.action ? { action: query.action } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {})
            }
          }
        : {})
    };

    const [total, rows] = await Promise.all([
      db.auditLog.count({ where }),
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { actor: { select: { id: true, fullName: true, email: true } } }
      })
    ]);

    return ok({
      logs: rows,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize))
      }
    });
  } catch (err) {
    return handleApiError("auditLogs.list", err);
  }
}
