import { type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission, resolveBranchScope } from "@/lib/rbac";
import { handleApiError, ok, readJson } from "@/lib/api";
import { writeAuditLog } from "@/lib/audit";
import { getPaymentRules } from "@/lib/settings";
import { computeSubscriptionStatus } from "@/lib/billing";

const schema = z.object({
  periodYear: z.number().int().min(2000).max(2100),
  periodMonth: z.number().int().min(1).max(12),
  branchId: z.string().uuid().optional(),
  groupId: z.string().uuid().optional(),
  amount: z.number().min(0).max(1000000).optional(),
  dueDay: z.number().int().min(1).max(28).optional()
});

/**
 * Bulk-creates the monthly tuition charges for every active student in
 * scope. Idempotent: existing (student, group, period) rows are skipped
 * rather than duplicated or overwritten, so re-running never destroys
 * an already-paid record.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requirePermission("subscriptions.manage");
    const input = await readJson(request, schema);
    const branchIds = resolveBranchScope(ctx, input.branchId);
    const rules = await getPaymentRules(ctx.organizationId);

    const amount = input.amount ?? rules.defaultMonthlyAmount;
    const dueDay = input.dueDay ?? rules.dueDayOfMonth;
    const dueDate = new Date(Date.UTC(input.periodYear, input.periodMonth - 1, dueDay));

    // Each Student belongs to exactly one Group (Student.groupId is the
    // source of truth — there is no groupStudent join table), so the
    // "enrollment" set is just the matching active students.
    const enrollments = await db.student.findMany({
      where: {
        status: "ACTIVE",
        deletedAt: null,
        organizationId: ctx.organizationId,
        ...(input.groupId ? { groupId: input.groupId } : {}),
        group: { isActive: true, deletedAt: null, ...(branchIds ? { branchId: { in: branchIds } } : {}) }
      },
      select: { id: true, groupId: true, branchId: true },
      take: 5000
    });

    const existing = await db.subscription.findMany({
      where: {
        organizationId: ctx.organizationId,
        periodYear: input.periodYear,
        periodMonth: input.periodMonth,
        studentId: { in: enrollments.map((e) => e.id) }
      },
      select: { studentId: true, groupId: true }
    });
    const existingKeys = new Set(existing.map((e) => `${e.studentId}:${e.groupId ?? ""}`));

    const toCreate = enrollments
      .filter((e) => !existingKeys.has(`${e.id}:${e.groupId}`))
      .map((e) => ({
        organizationId: ctx.organizationId,
        branchId: e.branchId,
        studentId: e.id,
        groupId: e.groupId,
        periodYear: input.periodYear,
        periodMonth: input.periodMonth,
        amount,
        dueDate,
        status: computeSubscriptionStatus({ amount, discount: 0, paidAmount: 0, dueDate })
      }));

    const result = toCreate.length
      ? await db.subscription.createMany({ data: toCreate, skipDuplicates: true })
      : { count: 0 };

    await writeAuditLog({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "GENERATE_SUBSCRIPTIONS",
      entityType: "Subscription",
      afterValue: {
        created: result.count,
        skipped: enrollments.length - toCreate.length,
        period: `${input.periodYear}-${String(input.periodMonth).padStart(2, "0")}`,
        amount
      }
    });

    return ok({
      created: result.count,
      skipped: enrollments.length - toCreate.length,
      considered: enrollments.length
    });
  } catch (err) {
    return handleApiError("subscriptions.generate", err);
  }
}
