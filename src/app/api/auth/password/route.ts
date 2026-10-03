import { type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAuthContext, UnauthorizedError } from "@/lib/rbac";
import { hashPassword, isPasswordStrongEnough, verifyPassword } from "@/lib/password";
import { revokeAllSessionsForUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { writeAuditLog } from "@/lib/audit";
import { BusinessRuleError, clientIp, handleApiError, ok, readJson } from "@/lib/api";

const SCOPE = "auth.password";

const bodySchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(10).max(200)
});

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) throw new UnauthorizedError();

    // Brute-force protection on the "current password" check (§45).
    const limit = checkRateLimit(`password-change:${ctx.userId}`, 5, 15 * 60_000);
    if (!limit.allowed) {
      throw new BusinessRuleError("Too many attempts. Please try again later.", { status: 429 });
    }

    const input = await readJson(request, bodySchema);

    const user = await db.user.findUnique({ where: { id: ctx.userId } });
    if (!user) throw new UnauthorizedError();

    const valid = await verifyPassword(user.passwordHash, input.currentPassword);
    if (!valid) throw new BusinessRuleError("The current password is incorrect.", { status: 400 });

    if (!isPasswordStrongEnough(input.newPassword)) {
      throw new BusinessRuleError(
        "Password must be at least 10 characters and contain letters and numbers."
      );
    }
    if (await verifyPassword(user.passwordHash, input.newPassword)) {
      throw new BusinessRuleError("The new password must be different from the current one.");
    }

    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(input.newPassword) }
    });

    // Password rotation invalidates every session (§7 session hijacking).
    await revokeAllSessionsForUser(user.id);

    await writeAuditLog({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "CHANGE_PASSWORD",
      entityType: "User",
      entityId: user.id,
      ipAddress: clientIp(request)
    });

    return ok({ changed: true, sessionsRevoked: true });
  } catch (err) {
    return handleApiError(SCOPE, err);
  }
}
