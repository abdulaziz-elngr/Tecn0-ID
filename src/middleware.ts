import { NextResponse, type NextRequest } from "next/server";

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "tecnoid_session";
const PROTECTED_PREFIXES = ["/dashboard"];

/**
 * Lightweight edge-level gate: only checks cookie *presence* (fast,
 * no DB/crypto at the edge). Full verification — signature, expiry,
 * revocation, and permission checks — happens server-side in
 * `src/lib/rbac.ts` on every API route and server component. This
 * middleware only prevents obviously-unauthenticated users from
 * loading the dashboard shell; it is not itself a security boundary.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  const hasCookie = request.cookies.has(COOKIE_NAME);
  if (!hasCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"]
};
