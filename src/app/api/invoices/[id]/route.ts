import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { handleApiError, ok, NotFoundError } from "@/lib/api";
import { getCenterProfile } from "@/lib/settings";

/**
 * Full invoice payload for the printable/PDF view. The centre profile
 * (name, logo, address, currency) is joined here so the print page is a
 * single fetch and renders identically offline.
 */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission("invoices.view");

    const invoice = await db.invoice.findFirst({
      where: {
        id: params.id,
        organizationId: ctx.organizationId,
        ...(ctx.isOrgWide ? {} : { student: { branchId: { in: ctx.branchIds } } })
      },
      include: {
        student: {
          select: {
            id: true,
            fullName: true,
            studentCode: true,
            parents: { include: { parent: { select: { fullName: true, phone: true } } } }
          }
        },
        payment: {
          include: {
            allocations: {
              include: {
                subscription: { select: { periodYear: true, periodMonth: true, amount: true } }
              }
            }
          }
        }
      }
    });
    if (!invoice) throw new NotFoundError("Invoice not found.");

    const center = await getCenterProfile(ctx.organizationId);

    return ok({
      center,
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        issuedAt: invoice.issuedAt,
        status: invoice.status,
        description: invoice.description,
        totalAmount: Number(invoice.totalAmount),
        paidAmount: Number(invoice.paidAmount),
        remainingAmount: Number(invoice.remainingAmount),
        voidReason: invoice.voidReason
      },
      student: {
        id: invoice.student.id,
        fullName: invoice.student.fullName,
        studentCode: invoice.student.studentCode,
        parent: invoice.student.parents[0]?.parent ?? null
      },
      payment: {
        receiptNumber: invoice.payment.receiptNumber,
        method: invoice.payment.method,
        paidAt: invoice.payment.paidAt,
        status: invoice.payment.status,
        lines: invoice.payment.allocations.map((a) => ({
          description: `Tuition ${a.subscription.periodYear}-${String(a.subscription.periodMonth).padStart(2, "0")}`,
          amount: Number(a.amount)
        }))
      }
    });
  } catch (err) {
    return handleApiError("invoices.get", err);
  }
}
