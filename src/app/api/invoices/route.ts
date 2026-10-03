import { type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { handleApiError, ok, readQuery, paginationSchema } from "@/lib/api";

const listSchema = paginationSchema.extend({
  studentId: z.string().uuid().optional(),
  status: z.enum(["ISSUED", "VOID"]).optional(),
  search: z.string().trim().max(100).optional()
});

export async function GET(request: NextRequest) {
  try {
    const ctx = await requirePermission("invoices.view");
    const query = readQuery(request, listSchema);

    const where = {
      organizationId: ctx.organizationId,
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { invoiceNumber: { contains: query.search, mode: "insensitive" as const } },
              { student: { fullName: { contains: query.search, mode: "insensitive" as const } } }
            ]
          }
        : {}),
      ...(ctx.isOrgWide ? {} : { student: { branchId: { in: ctx.branchIds } } })
    };

    const [total, rows] = await Promise.all([
      db.invoice.count({ where }),
      db.invoice.findMany({
        where,
        orderBy: { issuedAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          student: { select: { id: true, fullName: true, studentCode: true } },
          payment: { select: { id: true, method: true, receiptNumber: true, status: true } }
        }
      })
    ]);

    return ok({
      invoices: rows.map((i) => ({
        id: i.id,
        invoiceNumber: i.invoiceNumber,
        issuedAt: i.issuedAt,
        status: i.status,
        totalAmount: Number(i.totalAmount),
        paidAmount: Number(i.paidAmount),
        remainingAmount: Number(i.remainingAmount),
        student: i.student,
        payment: i.payment
      })),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize))
      }
    });
  } catch (err) {
    return handleApiError("invoices.list", err);
  }
}
