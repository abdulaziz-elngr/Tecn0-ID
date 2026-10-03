import { type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { handleApiError, ok, readJson } from "@/lib/api";
import { writeAuditLog } from "@/lib/audit";

/** Automatic notification rules (spec §56). */

const upsertSchema = z.object({
  event: z.enum([
    "STUDENT_ABSENT",
    "STUDENT_LATE",
    "REPEATED_ABSENCE",
    "PAYMENT_OVERDUE",
    "PAYMENT_RECEIVED",
    "EXAM_PUBLISHED",
    "ANNOUNCEMENT"
  ]),
  channel: z.enum(["IN_APP", "WHATSAPP", "EMAIL"]),
  templateKey: z.string().trim().min(2).max(100),
  isEnabled: z.boolean(),
  config: z.record(z.unknown()).optional()
});

export async function GET() {
  try {
    const ctx = await requirePermission("notifications.view");
    const rules = await db.notificationRule.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { event: "asc" }
    });
    return ok(rules);
  } catch (err) {
    return handleApiError("notificationRules.list", err);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const ctx = await requirePermission("settings.manage");
    const input = await readJson(request, upsertSchema);

    const rule = await db.notificationRule.upsert({
      where: {
        organizationId_event_channel: {
          organizationId: ctx.organizationId,
          event: input.event,
          channel: input.channel
        }
      },
      create: {
        organizationId: ctx.organizationId,
        event: input.event,
        channel: input.channel,
        templateKey: input.templateKey,
        isEnabled: input.isEnabled,
        config: input.config as object | undefined
      },
      update: {
        templateKey: input.templateKey,
        isEnabled: input.isEnabled,
        config: input.config as object | undefined
      }
    });

    await writeAuditLog({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "UPSERT_NOTIFICATION_RULE",
      entityType: "NotificationRule",
      entityId: rule.id,
      afterValue: rule
    });

    return ok(rule);
  } catch (err) {
    return handleApiError("notificationRules.upsert", err);
  }
}
