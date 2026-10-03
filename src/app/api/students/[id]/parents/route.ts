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
  console.error("[students/:id/parents] internal error", err);
  return NextResponse.json(
    { error: "Something went wrong. Please try again." },
    { status: 500 }
  );
}

async function findScopedStudent(organizationId: string, branchIds: string[] | undefined, id: string) {
  return db.student.findFirst({
    where: {
      id,
      organizationId,
      deletedAt: null,
      ...(branchIds ? { branchId: { in: branchIds } } : {})
    }
  });
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission("parents.view");
    const branchIds = ctx.isOrgWide ? undefined : ctx.branchIds;
    const student = await findScopedStudent(ctx.organizationId, branchIds, params.id);
    if (!student) {
      return NextResponse.json({ error: "Student not found." }, { status: 404 });
    }

    const links = await db.studentParent.findMany({
      where: { studentId: student.id },
      include: { parent: true }
    });

    return NextResponse.json({ data: links });
  } catch (err) {
    return handleKnownErrors(err);
  }
}
