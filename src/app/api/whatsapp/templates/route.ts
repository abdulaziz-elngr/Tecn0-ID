import { type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { handleApiError, ok, created, readJson } from "@/lib/api";
import { extractPlaceholders } from "@/lib/templates";
import { writeAuditLog } from "@/lib/audit";

const upsertSchema = z.object({
  key: z.string().trim().min(2).max(100),
  locale: z.enum(["ar", "en"]),
  channel: z.enum(["IN_APP", "WHATSAPP", "EMAIL"]),
  type: z.enum(["ATTENDANCE", "PAYMENT", "EXAM", "ACADEMIC", "ADMINISTRATIVE", "SYSTEM"]),
  name: z.string().trim().min(2).max(150),
  subject: z.string().trim().max(200).optional(),
  body: z.string().trim().min(2).max(2000),
  providerTemplateName: z.string().trim().max(150).optional(),
  isActive: z.boolean().default(true)
});

export async function GET() {
  try {
    const ctx = await requirePermission("whatsapp.view");
    const templates = await db.notificationTemplate.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: [{ key: "asc" }, { locale: "asc" }]
    });
    return ok(
      templates.map((t) => ({ ...t, placeholders: extractPlaceholders(t.body) }))
    );
  } catch (err) {
    return handleApiError("whatsapp.templates.list", err);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const ctx = await requirePermission("whatsapp.templates.manage");
    const input = await readJson(request, upsertSchema);

    const template = await db.notificationTemplate.upsert({
      where: {
        organizationId_key_locale_channel: {
          organizationId: ctx.organizationId,
          key: input.key,
          locale: input.locale,
          channel: input.channel
        }
      },
      create: { organizationId: ctx.organizationId, ...input },
      update: {
        type: input.type,
        name: input.name,
        subject: input.subject,
        body: input.body,
        providerTemplateName: input.providerTemplateName,
        isActive: input.isActive
      }
    });

    await writeAuditLog({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "UPSERT_NOTIFICATION_TEMPLATE",
      entityType: "NotificationTemplate",
      entityId: template.id,
      afterValue: template
    });

    return created({ ...template, placeholders: extractPlaceholders(template.body) });
  } catch (err) {
    return handleApiError("whatsapp.templates.upsert", err);
  }
}
