import { db } from "./db";
import { verifyPassword } from "./password";
import { createSession, destroySession } from "./session";
import { checkRateLimit } from "./rate-limit";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const LOGIN_RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_LOGIN_MAX || 5);
const LOGIN_RATE_LIMIT_WINDOW_MIN = Number(
  process.env.RATE_LIMIT_LOGIN_WINDOW_MINUTES || 15
);

export interface LoginResult {
  success: boolean;
  error?: string;
}

/**
 * Authenticates a user by email + password.
 *
 * Security properties:
 *  - Generic error messages (never reveal whether the email exists)
 *  - Per-IP AND per-account rate limiting
 *  - Account lockout after repeated failures, with automatic unlock
 *  - Passwords compared via constant-time Argon2id verify
 */
export async function login(params: {
  email: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<LoginResult> {
  const email = params.email.trim().toLowerCase();

  const ipKey = `login:ip:${params.ipAddress ?? "unknown"}`;
  const ipCheck = checkRateLimit(
    ipKey,
    LOGIN_RATE_LIMIT_MAX,
    LOGIN_RATE_LIMIT_WINDOW_MIN * 60 * 1000
  );
  if (!ipCheck.allowed) {
    return { success: false, error: "Too many attempts. Please try again later." };
  }

  const user = await db.user.findUnique({ where: { email } });
  const genericError = "Invalid email or password.";

  if (!user || !user.isActive || user.deletedAt) {
    return { success: false, error: genericError };
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return {
      success: false,
      error: "This account is temporarily locked due to repeated failed attempts."
    };
  }

  const passwordValid = await verifyPassword(user.passwordHash, params.password);

  if (!passwordValid) {
    const newFailedCount = user.failedLoginCount + 1;
    const shouldLock = newFailedCount >= MAX_FAILED_ATTEMPTS;

    await db.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: shouldLock ? 0 : newFailedCount,
        lockedUntil: shouldLock
          ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
          : user.lockedUntil
      }
    });

    return { success: false, error: genericError };
  }

  // Successful login — reset failure counters.
  await db.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() }
  });

  await createSession({
    userId: user.id,
    organizationId: user.organizationId,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent
  });

  return { success: true };
}

export async function logout(): Promise<void> {
  await destroySession();
}
