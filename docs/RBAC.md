# Roles & Permissions

## Default roles

| Role | Scope | Notes |
|---|---|---|
| `SUPER_ADMIN` | All organizations (platform operator) | Full access |
| `CENTER_OWNER` | Org-wide within their organization | Full access within org |
| `MANAGER` | Org-wide within their organization | Operational management, no `users.manage`/`roles.manage` |
| `ACCOUNTANT` | Branch-scoped | Payments, expenses, read-only students |
| `TEACHER` | Branch-scoped | Own groups: students, attendance, exams/grades |
| `TEACHER_ASSISTANT` | Branch-scoped | Attendance + student lookup only |
| `RECEPTIONIST` | Branch-scoped | Student/parent intake |
| `ATTENDANCE_OPERATOR` | Branch-scoped | QR scanning station |
| `PARENT` | Own linked children only | No permission keys — access is enforced via a separate parent-portal scope, added in a later phase |
| `STUDENT` | Own data only | Same as above |

`SUPER_ADMIN` and `CENTER_OWNER` have no `UserBranch` rows and are
treated as "all branches in this organization" (`AuthContext.isOrgWide
= true`). Every other role must have explicit `UserBranch` rows —
a user with zero branch assignments and a non-org-wide role sees no
data anywhere, by design (fail closed).

## Permission key format

`<module>.<action>`, e.g. `students.create`, `payments.refund`. The
full catalog lives in `src/lib/permissions.ts` — that file is the only
place permission keys are defined; both the seed script and (via the
database) every API route consume it, so there is no way for the
"list of permissions that exist" and "list of permissions that are
enforced" to drift apart.

## Adding a new permission

1. Add the key to the relevant module array in `PERMISSIONS`
   (`src/lib/permissions.ts`).
2. Add it to whichever `DEFAULT_ROLE_PERMISSIONS` entries should have
   it by default.
3. Re-run `npm run db:seed` in a dev environment, or write a migration
   that inserts the new `Permission` row and any `RolePermission`
   grants for existing organizations.
4. Guard the corresponding API route with
   `await requirePermission("your.new.key")`.

## Extending scope beyond branch

Some later-phase roles (`PARENT`, `STUDENT`) need row-level scoping
(their own children / their own record) rather than branch-level
scoping. This is intentionally not implemented as a permission key —
it's enforced by looking up the caller's linked `Student`/`Parent`
record and filtering queries to it directly, the same server-derived
pattern used for `organizationId`/`branchId` elsewhere.
