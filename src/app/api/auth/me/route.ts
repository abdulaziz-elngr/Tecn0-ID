import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/rbac";

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  return NextResponse.json({
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    fullName: ctx.fullName,
    roles: ctx.roleNames,
    permissions: Array.from(ctx.permissions),
    isOrgWide: ctx.isOrgWide,
    branchIds: ctx.branchIds
  });
}
