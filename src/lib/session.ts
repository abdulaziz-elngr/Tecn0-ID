import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "crypto";
import { db } from "./db";

/**
 * Session strategy: a signed, HTTP-only, SameSite=strict cookie holding
 * a short-lived JWT (the "access" layer), backed by a server-side
 * Session row (the "control" layer). This gives us:
 *   - Fast verification (JWT signature, no DB hit on every request)
 *   - Real revocation ("log out everywhere" invalidates the DB row,
 *     which we check on sensitive operations and periodically)
 *   - Absolute expiry independent of client-side tampering
 */

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "tecnoid_session";
const TTL_MINUTES = Number(process.env.SESSION_TTL_MINUTES || 60);
const ABSOLUTE_TTL_HOURS = Number(process.env.SESSION_ABSOLUTE_TTL_HOURS || 24);

function getSecretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "AUTH_SECRET is missing or too short. Set a strong random value in .env"
    );
  }
  return new TextEncoder().encode(secret);
}

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export interface SessionPayload {
  sub: string; // userId
  sid: string; // session row id
  org: string; // organizationId
}

export async function createSession(params: {
  userId: string;
  organizationId: string;
  userAgent?: string;
  ipAddress?: string;
}): Promise<string> {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + ABSOLUTE_TTL_HOURS * 60 * 60 * 1000);

  const session = await db.session.create({
    data: {
      userId: params.userId,
      tokenHash,
      userAgent: params.userAgent,
      ipAddress: params.ipAddress,
      expiresAt
    }
  });

  const jwt = await new SignJWT({
    sub: params.userId,
    sid: session.id,
    org: params.organizationId
  } satisfies SessionPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TTL_MINUTES}m`)
    .sign(getSecretKey());

  cookies().set(COOKIE_NAME, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: ABSOLUTE_TTL_HOURS * 60 * 60
  });

  return jwt;
}

export async function getSessionPayload(): Promise<SessionPayload | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    const parsed = payload as unknown as SessionPayload;

    // Verify the backing session row is still valid (not revoked/expired).
    const session = await db.session.findUnique({ where: { id: parsed.sid } });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      return null;
    }

    // Sliding last-seen timestamp for the "active sessions" screen.
    await db.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() }
    });

    return parsed;
  } catch {
    return null;
  }
}

export async function destroySession(): Promise<void> {
  const payload = await getSessionPayload();
  if (payload) {
    await db.session.update({
      where: { id: payload.sid },
      data: { revokedAt: new Date() }
    });
  }
  cookies().delete(COOKIE_NAME);
}

export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  await db.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() }
  });
}
