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
  console.error("[students/:id/parents/:parentId] internal error", err);
  return NextResponse.json(
    { error: "Something went wrong. Please try again." },
    { status: 500 }
  );
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; parentId: string } }
) {
  try {
    const ctx = await requirePermission("parents.update");
    const branchIds = ctx.isOrgWide ? undefined : ctx.branchIds;

    const student = await db.student.findFirst({
      where: {
        id: params.id,
        organizationId: ctx.organizationId,
        deletedAt: null,
        ...(branchIds ? { branchId: { in: branchIds } } : {})
      }
    });
    if (!student) {
      return NextResponse.json({ error: "Student not found." }, { status: 404 });
    }

    const link = await db.studentParent.findUnique({
      where: { studentId_parentId: { studentId: params.id, parentId: params.parentId } }
    });
    if (!link) {
      return NextResponse.json({ error: "Link not found." }, { status: 404 });
    }

    await db.studentParent.delete({ where: { id: link.id } });

    await writeAuditLog({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "UNLINK_PARENT_FROM_STUDENT",
      entityType: "StudentParent",
      entityId: link.id,
      beforeValue: link
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleKnownErrors(err);
  }
}
