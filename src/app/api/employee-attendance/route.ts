import { type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission, resolveBranchScope } from "@/lib/rbac";
import { handleApiError, ok, readJson, readQuery, paginationSchema, BusinessRuleError } from "@/lib/api";
import { writeAuditLog } from "@/lib/audit";
import { toDateOnly } from "@/lib/sessions";

/**
 * Employee check-in / check-out (spec §37).
 * Employees may only read their own rows unless they hold
 * `employees.attendance.manage`.
 */

const listSchema = paginationSchema.extend({
  branchId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional()
});

const punchSchema = z.object({
  employeeId: z.string().uuid(),
  action: z.enum(["CHECK_IN", "CHECK_OUT"]),
  at: z.string().datetime().optional(),
  /** Expected start time in minutes-from-midnight, for late calculation. */
  expectedStartMinutes: z.number().int().min(0).max(1439).optional(),
  notes: z.string().trim().max(300).optional()
});

export async function GET(request: NextRequest) {
  try {
    const ctx = await requirePermission("employees.attendance.view");
    const query = readQuery(request, listSchema);
    const branchIds = resolveBranchScope(ctx, query.branchId);

    const canSeeEveryone = ctx.permissions.has("employees.attendance.manage");
    let employeeFilter = query.employeeId;

    if (!canSeeEveryone) {
      // Restrict to the requester's own employee record.
      const self = await db.employee.findFirst({
        where: { organizationId: ctx.organizationId, fullName: ctx.fullName },
        select: { id: true }
      });
      if (!self) {
        return ok({ records: [], pagination: { page: 1, pageSize: 0, total: 0, totalPages: 1 } });
      }
      employeeFilter = self.id;
    }

    const where = {
      organizationId: ctx.organizationId,
      ...(branchIds ? { branchId: { in: branchIds } } : {}),
      ...(employeeFilter ? { employeeId: employeeFilter } : {}),
      ...(query.from || query.to
        ? {
            date: {
              ...(query.from ? { gte: toDateOnly(query.from) } : {}),
              ...(query.to ? { lte: toDateOnly(query.to) } : {})
            }
          }
        : {})
    };

    const [total, rows] = await Promise.all([
      db.employeeAttendance.count({ where }),
      db.employeeAttendance.findMany({
        where,
        orderBy: { date: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { employee: { select: { id: true, fullName: true, position: true } } }
      })
    ]);

    return ok({
      records: rows,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize))
      }
    });
  } catch (err) {
    return handleApiError("employeeAttendance.list", err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requirePermission("employees.attendance.manage");
    const input = await readJson(request, punchSchema);

    const employee = await db.employee.findFirst({
      where: { id: input.employeeId, organizationId: ctx.organizationId, deletedAt: null },
      select: { id: true, branchId: true }
    });
    if (!employee) throw new BusinessRuleError("Employee not found.", { status: 404 });
    resolveBranchScope(ctx, employee.branchId);

    const at = input.at ? new Date(input.at) : new Date();
    const date = toDateOnly(at);
    const existing = await db.employeeAttendance.findUnique({
      where: { employeeId_date: { employeeId: employee.id, date } }
    });

    if (input.action === "CHECK_IN") {
      if (existing?.checkInAt) {
        throw new BusinessRuleError("This employee has already checked in today.");
      }
      const minutesIntoDay = at.getUTCHours() * 60 + at.getUTCMinutes();
      const lateMinutes = input.expectedStartMinutes
        ? Math.max(0, minutesIntoDay - input.expectedStartMinutes)
        : 0;

      const record = await db.employeeAttendance.upsert({
        where: { employeeId_date: { employeeId: employee.id, date } },
        create: {
          organizationId: ctx.organizationId,
          branchId: employee.branchId,
          employeeId: employee.id,
          date,
          checkInAt: at,
          status: lateMinutes > 0 ? "LATE" : "PRESENT",
          lateMinutes,
          notes: input.notes,
          recordedById: ctx.userId
        },
        update: {
          checkInAt: at,
          status: lateMinutes > 0 ? "LATE" : "PRESENT",
          lateMinutes,
          notes: input.notes,
          recordedById: ctx.userId
        }
      });

      await writeAuditLog({
        organizationId: ctx.organizationId,
        actorUserId: ctx.userId,
        action: "EMPLOYEE_CHECK_IN",
        entityType: "EmployeeAttendance",
        entityId: record.id,
        afterValue: record
      });
      return ok(record);
    }

    if (!existing?.checkInAt) {
      throw new BusinessRuleError("This employee has not checked in today.");
    }
    if (existing.checkOutAt) {
      throw new BusinessRuleError("This employee has already checked out today.");
    }

    const totalMinutes = Math.max(
      0,
      Math.round((at.getTime() - existing.checkInAt.getTime()) / 60000)
    );
    const standardMinutes = Number(process.env.STANDARD_WORK_MINUTES || 480);
    const status =
      totalMinutes > standardMinutes + 30
        ? "OVERTIME"
        : totalMinutes < standardMinutes - 30
          ? "EARLY_LEAVE"
          : existing.status;

    const record = await db.employeeAttendance.update({
      where: { id: existing.id },
      data: { checkOutAt: at, totalMinutes, status, notes: input.notes ?? existing.notes }
    });

    await writeAuditLog({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "EMPLOYEE_CHECK_OUT",
      entityType: "EmployeeAttendance",
      entityId: record.id,
      beforeValue: existing,
      afterValue: record
    });

    return ok(record);
  } catch (err) {
    return handleApiError("employeeAttendance.punch", err);
  }
}
