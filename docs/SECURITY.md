# Security

This document describes the security controls implemented in the
Phase 1–2 foundation and what must be added as later phases land.

## Implemented in this phase

- **Password storage:** Argon2id (`src/lib/password.ts`), OWASP-recommended
  parameters. Plaintext passwords are never logged or stored.
- **Session management:** signed JWT (HS256) in an HTTP-only,
  `SameSite=strict`, `Secure` (in production) cookie, backed by a
  server-side `Session` table so logout / "revoke all sessions" is a
  real, immediate invalidation — not just deleting a client cookie.
- **Brute-force protection:** login is rate-limited per IP
  (`src/lib/rate-limit.ts`) and accounts lock out for 15 minutes after
  5 consecutive failed attempts (`src/lib/auth.ts`).
- **Generic error messages:** login never reveals whether an email
  exists; all unexpected server errors return a generic message to the
  client while the real error is logged server-side only
  (`console.error`, never returned in the response body).
- **Authorization is server-side only:** every protected API route
  calls `requirePermission()` (`src/lib/rbac.ts`), which re-derives the
  user's organization, roles, permissions, and branch scope from the
  **session**, not from any client-supplied field. Organization ID,
  branch ID, and role are never trusted from request bodies or query
  strings — see `resolveBranchScope()` for how a client-supplied
  `branchId` is verified against the caller's actual scope before use.
- **Input validation:** every API route validates its input with Zod
  before touching the database.
- **Soft deletes for business-critical data:** `Student.deletedAt` (and
  the equivalent on `Organization`/`Center`/`Branch`/`Room`/`Subject`/
  `Employee`) — sensitive records are never hard-deleted, preserving
  history for audit and reporting.
- **Audit logging:** `writeAuditLog()` records actor, action, entity,
  before/after values, and (for deletes) a mandatory reason, for every
  sensitive write. Audit logs have no update/delete API.
- **Least-privilege RBAC:** granular permission keys per module
  (`src/lib/permissions.ts`); default roles are least-privilege except
  `SUPER_ADMIN`/`CENTER_OWNER`.

## Deferred to later phases (tracked, not forgotten)

- CSRF token double-submit for state-changing requests beyond
  `SameSite=strict` cookie protection (Phase 11 hardening pass)
- MFA for administrator accounts (Phase 11)
- File upload validation (MIME sniffing, size limits, safe filenames) —
  lands with the file storage integration in Phase 7+
- Redis-backed distributed rate limiting for multi-instance deployments
- Automated security tests: IDOR, role escalation, rate-limit abuse
  (Phase 12)
- Dependency/SCA scanning and secret scanning in CI (Phase 14)

## Reporting a vulnerability

This is a generated foundation codebase, not a deployed product; if
you adopt it, put your own security contact and disclosure process
here before going to production.
