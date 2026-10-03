import { db } from "./db";

/**
 * Writes an audit log entry. Called from every route that creates,
 * updates, or deletes sensitive data (students, payments, attendance,
 * users, permissions...). Audit logs are insert-only from the
 * application layer — there is intentionally no update/delete API
 * for AuditLog, and only audit_logs.view can read them.
 */
export async function writeAuditLog(params: {
  organizationId: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string;
  beforeValue?: unknown;
  afterValue?: unknown;
  reason?: string;
  ipAddress?: string;
}): Promise<void> {
  await db.auditLog.create({
    data: {
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      beforeValue: params.beforeValue as any,
      afterValue: params.afterValue as any,
      reason: params.reason,
      ipAddress: params.ipAddress
    }
  });
}
