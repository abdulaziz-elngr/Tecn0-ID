import { type NextRequest } from "next/server";
import { z } from "zod";
import { requirePermission, resolveBranchScope } from "@/lib/rbac";
import { handleApiError, ok, readJson, BusinessRuleError } from "@/lib/api";
import { generateSessions } from "@/lib/sessions";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  from: z.string().date(),
  to: z.string().date(),
  branchId: z.string().uuid().optional(),
  groupId: z.string().uuid().optional()
});

/**
 * Materializes weekly Schedule rows into dated ClassSession rows.
 * Idempotent — safe to call repeatedly (see src/lib/sessions.ts).
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requirePermission("sessions.create");
    const input = await readJson(request, schema);

    const from = new Date(input.from);
    const to = new Date(input.to);
    if (to < from) throw new BusinessRuleError("The end date must be after the start date.");
    const days = (to.getTime() - from.getTime()) / 86400000;
    if (days > 120) {
      throw new BusinessRuleError("Please generate at most 120 days at a time.");
    }

    const branchIds = resolveBranchScope(ctx, input.branchId);

    const result = await generateSessions({
      organizationId: ctx.organizationId,
      branchIds,
      from,
      to,
      groupId: input.groupId
    });

    await writeAuditLog({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "GENERATE_SESSIONS",
      entityType: "ClassSession",
      afterValue: { ...result, from: input.from, to: input.to }
    });

    return ok(result);
  } catch (err) {
    return handleApiError("sessions.generate", err);
  }
}
