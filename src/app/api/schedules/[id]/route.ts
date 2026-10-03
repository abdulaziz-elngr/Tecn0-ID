import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermission, ForbiddenError, UnauthorizedError } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";

function handleKnownErrors(err: unknown) {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  console.error("[schedules/:id] internal error", err);
  return NextResponse.json(
    { error: "Something went wrong. Please try again." },
    { status: 500 }
  );
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await requirePermission("academic.schedule.manage");
    const branchIds = ctx.isOrgWide ? undefined : ctx.branchIds;

    const existing = await db.schedule.findFirst({
      where: {
        id: params.id,
        group: {
          branch: { center: { organizationId: ctx.organizationId } },
          ...(branchIds ? { branchId: { in: branchIds } } : {})
        }
      }
    });
    if (!existing) {
      return NextResponse.json({ error: "Schedule not found." }, { status: 404 });
    }

    // Soft deactivate rather than hard delete, consistent with the
    // rest of the system's audit trail expectations.
    const updated = await db.schedule.update({
      where: { id: existing.id },
      data: { isActive: false }
    });

    await writeAuditLog({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "DELETE_SCHEDULE",
      entityType: "Schedule",
      entityId: updated.id,
      beforeValue: existing,
      afterValue: updated
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleKnownErrors(err);
  }
}
