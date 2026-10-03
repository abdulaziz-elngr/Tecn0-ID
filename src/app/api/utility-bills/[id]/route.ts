import { type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { handleApiError, ok, readJson, NotFoundError, BusinessRuleError } from "@/lib/api";
import { writeAuditLog } from "@/lib/audit";

const patchSchema = z.object({
  markPaid: z.boolean().optional(),
  paidAt: z.string().datetime().optional(),
  amount: z.number().min(0).max(10000000).optional(),
  attachmentUrl: z.string().url().max(500).optional(),
  notes: z.string().trim().max(500).optional(),
  /** Also record the bill as an expense so P&L stays complete. */
  createExpense: z.boolean().default(true)
});

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission("utilities.manage");
    const existing = await db.utilityBill.findFirst({
      where: {
        id: params.id,
        organizationId: ctx.organizationId,
        ...(ctx.isOrgWide ? {} : { branchId: { in: ctx.branchIds } })
      }
    });
    if (!existing) throw new NotFoundError("Utility bill not found.");

    const input = await readJson(request, patchSchema);
    if (existing.status === "PAID" && input.markPaid) {
      throw new BusinessRuleError("This bill is already marked as paid.");
    }

    const paidAt = input.markPaid ? (input.paidAt ? new Date(input.paidAt) : new Date()) : undefined;

    const updated = await db.$transaction(async (tx) => {
      let expenseId = existing.expenseId;

      if (input.markPaid && input.createExpense && !expenseId) {
        const expense = await tx.expense.create({
          data: {
            organizationId: ctx.organizationId,
            branchId: existing.branchId,
            category: existing.type === "ELECTRICITY" ? "ELECTRICITY" : "WATER",
            amount: input.amount ?? existing.amount,
            spentAt: paidAt ?? new Date(),
            description: `${existing.type} bill — meter ${existing.meterNumber}`,
            attachmentUrl: input.attachmentUrl ?? existing.attachmentUrl,
            createdById: ctx.userId,
            paidByUserId: ctx.userId
          }
        });
        expenseId = expense.id;
      }

      return tx.utilityBill.update({
        where: { id: existing.id },
        data: {
          amount: input.amount ?? existing.amount,
          attachmentUrl: input.attachmentUrl ?? existing.attachmentUrl,
          notes: input.notes ?? existing.notes,
          paidAt: paidAt ?? existing.paidAt,
          status: input.markPaid ? "PAID" : existing.status,
          expenseId
        }
      });
    });

    await writeAuditLog({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: input.markPaid ? "PAY_UTILITY_BILL" : "UPDATE_UTILITY_BILL",
      entityType: "UtilityBill",
      entityId: updated.id,
      beforeValue: existing,
      afterValue: updated
    });

    return ok({ ...updated, amount: Number(updated.amount), consumption: Number(updated.consumption) });
  } catch (err) {
    return handleApiError("utilities.update", err);
  }
}
