import { type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission, resolveBranchScope } from "@/lib/rbac";
import { handleApiError, ok, created, readJson, readQuery, paginationSchema, BusinessRuleError } from "@/lib/api";
import { writeAuditLog } from "@/lib/audit";

const CATEGORIES = [
  "ELECTRICITY",
  "WATER",
  "INTERNET",
  "RENT",
  "SALARIES",
  "MAINTENANCE",
  "CLEANING",
  "EQUIPMENT",
  "SUPPLIES",
  "OTHER"
] as const;

const listSchema = paginationSchema.extend({
  branchId: z.string().uuid().optional(),
  category: z.enum(CATEGORIES).optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional()
});

const createSchema = z.object({
  branchId: z.string().uuid(),
  category: z.enum(CATEGORIES),
  amount: z.number().positive().max(10000000),
  spentAt: z.string().datetime(),
  vendor: z.string().trim().max(200).optional(),
  description: z.string().trim().max(1000).optional(),
  attachmentUrl: z.string().url().max(500).optional(),
  method: z.enum(["CASH", "BANK_TRANSFER", "CARD", "OTHER"]).default("CASH")
});

export async function GET(request: NextRequest) {
  try {
    const ctx = await requirePermission("expenses.view");
    const query = readQuery(request, listSchema);
    const branchIds = resolveBranchScope(ctx, query.branchId);

    const where = {
      organizationId: ctx.organizationId,
      deletedAt: null,
      ...(branchIds ? { branchId: { in: branchIds } } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.from || query.to
        ? {
            spentAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {})
            }
          }
        : {})
    };

    const [total, rows, sum, byCategory] = await Promise.all([
      db.expense.count({ where }),
      db.expense.findMany({
        where,
        orderBy: { spentAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      db.expense.aggregate({ where, _sum: { amount: true } }),
      db.expense.groupBy({ by: ["category"], where, _sum: { amount: true } })
    ]);

    return ok({
      expenses: rows.map((e) => ({ ...e, amount: Number(e.amount) })),
      totals: {
        total: Number(sum._sum.amount ?? 0),
        byCategory: byCategory.map((c) => ({
          category: c.category,
          amount: Number(c._sum.amount ?? 0)
        }))
      },
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize))
      }
    });
  } catch (err) {
    return handleApiError("expenses.list", err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requirePermission("expenses.create");
    const input = await readJson(request, createSchema);
    resolveBranchScope(ctx, input.branchId);

    const branch = await db.branch.findFirst({
      where: {
        id: input.branchId,
        deletedAt: null,
        center: { organizationId: ctx.organizationId }
      }
    });
    if (!branch) throw new BusinessRuleError("Invalid branch.", { status: 400 });

    const expense = await db.expense.create({
      data: {
        organizationId: ctx.organizationId,
        branchId: input.branchId,
        category: input.category,
        amount: input.amount,
        spentAt: new Date(input.spentAt),
        vendor: input.vendor,
        description: input.description,
        attachmentUrl: input.attachmentUrl,
        method: input.method,
        paidByUserId: ctx.userId,
        createdById: ctx.userId
      }
    });

    await writeAuditLog({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "CREATE_EXPENSE",
      entityType: "Expense",
      entityId: expense.id,
      afterValue: expense
    });

    return created({ ...expense, amount: Number(expense.amount) });
  } catch (err) {
    return handleApiError("expenses.create", err);
  }
}
