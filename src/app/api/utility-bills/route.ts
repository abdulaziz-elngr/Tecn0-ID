import { type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission, resolveBranchScope } from "@/lib/rbac";
import { handleApiError, ok, created, readJson, readQuery, paginationSchema, BusinessRuleError } from "@/lib/api";
import { writeAuditLog } from "@/lib/audit";
import { round2 } from "@/lib/billing";

/** Electricity (§34) and Water (§35) tracking share one structure. */

const listSchema = paginationSchema.extend({
  branchId: z.string().uuid().optional(),
  type: z.enum(["ELECTRICITY", "WATER"]).optional(),
  status: z.enum(["UNPAID", "PAID", "OVERDUE"]).optional()
});

const createSchema = z.object({
  branchId: z.string().uuid(),
  type: z.enum(["ELECTRICITY", "WATER"]),
  meterNumber: z.string().trim().min(1).max(50),
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
  previousReading: z.number().min(0).max(100000000),
  currentReading: z.number().min(0).max(100000000),
  amount: z.number().min(0).max(10000000),
  dueDate: z.string().date(),
  attachmentUrl: z.string().url().max(500).optional(),
  notes: z.string().trim().max(500).optional()
});

export async function GET(request: NextRequest) {
  try {
    const ctx = await requirePermission("utilities.view");
    const query = readQuery(request, listSchema);
    const branchIds = resolveBranchScope(ctx, query.branchId);

    const where = {
      organizationId: ctx.organizationId,
      ...(branchIds ? { branchId: { in: branchIds } } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {})
    };

    const [total, rows, unpaid] = await Promise.all([
      db.utilityBill.count({ where }),
      db.utilityBill.findMany({
        where,
        orderBy: { periodStart: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      db.utilityBill.aggregate({
        where: { ...where, status: { in: ["UNPAID", "OVERDUE"] } },
        _sum: { amount: true }
      })
    ]);

    return ok({
      bills: rows.map((b) => ({
        ...b,
        previousReading: Number(b.previousReading),
        currentReading: Number(b.currentReading),
        consumption: Number(b.consumption),
        amount: Number(b.amount)
      })),
      totals: { outstanding: Number(unpaid._sum.amount ?? 0) },
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize))
      }
    });
  } catch (err) {
    return handleApiError("utilities.list", err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requirePermission("utilities.manage");
    const input = await readJson(request, createSchema);
    resolveBranchScope(ctx, input.branchId);

    if (input.currentReading < input.previousReading) {
      throw new BusinessRuleError("The current reading cannot be lower than the previous reading.");
    }
    if (new Date(input.periodEnd) < new Date(input.periodStart)) {
      throw new BusinessRuleError("The billing period end must be after its start.");
    }

    const branch = await db.branch.findFirst({
      where: { id: input.branchId, deletedAt: null, center: { organizationId: ctx.organizationId } }
    });
    if (!branch) throw new BusinessRuleError("Invalid branch.", { status: 400 });

    const dueDate = new Date(input.dueDate);
    const bill = await db.utilityBill.create({
      data: {
        organizationId: ctx.organizationId,
        branchId: input.branchId,
        type: input.type,
        meterNumber: input.meterNumber,
        periodStart: new Date(input.periodStart),
        periodEnd: new Date(input.periodEnd),
        previousReading: input.previousReading,
        currentReading: input.currentReading,
        consumption: round2(input.currentReading - input.previousReading),
        amount: input.amount,
        dueDate,
        status: dueDate < new Date() ? "OVERDUE" : "UNPAID",
        attachmentUrl: input.attachmentUrl,
        notes: input.notes,
        createdById: ctx.userId
      }
    });

    await writeAuditLog({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "CREATE_UTILITY_BILL",
      entityType: "UtilityBill",
      entityId: bill.id,
      afterValue: bill
    });

    return created({ ...bill, amount: Number(bill.amount), consumption: Number(bill.consumption) });
  } catch (err) {
    return handleApiError("utilities.create", err);
  }
}
