import { type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { handleApiError, ok, readJson, NotFoundError, BusinessRuleError } from "@/lib/api";
import { writeAuditLog } from "@/lib/audit";

const patchSchema = z.object({
  status: z.enum(["SCHEDULED", "OPEN", "COMPLETED", "CANCELLED"]).optional(),
  notes: z.string().trim().max(500).optional(),
  reason: z.string().trim().min(3).max(500).optional()
});

async function findScoped(ctx: { organizationId: string; isOrgWide: boolean; branchIds: string[] }, id: string) {
  return db.classSession.findFirst({
    where: {
      id,
      organizationId: ctx.organizationId,
      ...(ctx.isOrgWide ? {} : { branchId: { in: ctx.branchIds } })
    }
  });
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission("sessions.view");
    const session = await db.classSession.findFirst({
      where: {
        id: params.id,
        organizationId: ctx.organizationId,
        ...(ctx.isOrgWide ? {} : { branchId: { in: ctx.branchIds } })
      },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            capacity: true,
            grade: { select: { id: true, name: true, stage: { select: { id: true, name: true } } } },
            teacher: { select: { id: true, fullName: true } },
            assistant: { select: { id: true, fullName: true } },
            students: {
              where: { deletedAt: null },
              select: {
                id: true,
                fullName: true,
                studentCode: true,
                photoUrl: true,
                status: true,
                parents: {
                  where: { isPrimary: true },
                  take: 1,
                  select: { parent: { select: { fullName: true, phone: true, whatsappNumber: true } } }
                }
              }
            }
          }
        },
        attendances: {
          where: { deletedAt: null },
          select: {
            id: true,
            studentId: true,
            type: true,
            recordedAt: true,
            notes: true,
            makeUpReason: true
          }
        }
      }
    });

    if (!session) throw new NotFoundError("Session not found.");

    // Roster = enrolled students + any make-up attendees not on the roster.
    const attendanceByStudent = new Map(session.attendances.map((a) => [a.studentId, a]));
    const roster = session.group.students.map((student) => ({
      student,
      isPrimary: true,
      attendance: attendanceByStudent.get(student.id) ?? null
    }));

    const rosterIds = new Set(session.group.students.map((s) => s.id));
    const makeUpStudentIds = session.attendances
      .filter((a) => !rosterIds.has(a.studentId))
      .map((a) => a.studentId);
    const makeUpStudents = makeUpStudentIds.length
      ? await db.student.findMany({
          where: { id: { in: makeUpStudentIds } },
          select: {
            id: true,
            fullName: true,
            studentCode: true,
            photoUrl: true,
            status: true,
            parents: {
              where: { isPrimary: true },
              take: 1,
              select: { parent: { select: { fullName: true, phone: true, whatsappNumber: true } } }
            }
          }
        })
      : [];

    return ok({
      session: {
        id: session.id,
        date: session.date,
        startMinutes: session.startMinutes,
        endMinutes: session.endMinutes,
        status: session.status,
        notes: session.notes,
        group: {
          id: session.group.id,
          name: session.group.name,
          capacity: session.group.capacity,
          grade: session.group.grade,
          stage: session.group.grade.stage,
          teacher: session.group.teacher,
          assistant: session.group.assistant
        }
      },
      roster,
      makeUpAttendees: makeUpStudents.map((s) => ({
        student: s,
        attendance: attendanceByStudent.get(s.id) ?? null
      })),
      counts: {
        present: session.attendances.filter((a) => a.type === "REGULAR").length,
        late: session.attendances.filter((a) => a.type === "LATE").length,
        makeUp: session.attendances.filter((a) => a.type === "MAKE_UP").length,
        excused: session.attendances.filter((a) => a.type === "EXCUSED").length,
        absent: session.attendances.filter((a) => a.type === "ABSENT").length,
        enrolled: session.group.students.length
      }
    });
  } catch (err) {
    return handleApiError("sessions.get", err);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission("sessions.update");
    const existing = await findScoped(ctx, params.id);
    if (!existing) throw new NotFoundError("Session not found.");

    const input = await readJson(request, patchSchema);

    // Cancelling a session that already has attendance needs a reason —
    // it changes the meaning of historical records.
    if (input.status === "CANCELLED") {
      const recorded = await db.attendance.count({
        where: { sessionId: existing.id, deletedAt: null }
      });
      if (recorded > 0 && !input.reason) {
        throw new BusinessRuleError(
          "This session already has attendance records. A reason is required to cancel it."
        );
      }
    }

    const updated = await db.classSession.update({
      where: { id: existing.id },
      data: {
        status: input.status,
        notes: input.notes,
        openedAt: input.status === "OPEN" && !existing.openedAt ? new Date() : existing.openedAt,
        closedAt: input.status === "COMPLETED" ? new Date() : existing.closedAt
      }
    });

    // Closing a session (spec §13/§14) finalizes attendance: every
    // roster student with no attendance row yet is marked ABSENT so
    // the Absent list and its WhatsApp button have real data to show,
    // rather than requiring a manual pass afterwards.
    if (input.status === "COMPLETED" && existing.status !== "COMPLETED") {
      const [roster, recorded] = await Promise.all([
        db.student.findMany({
          where: { groupId: existing.groupId, deletedAt: null, status: "ACTIVE" },
          select: { id: true }
        }),
        db.attendance.findMany({
          where: { sessionId: existing.id, deletedAt: null },
          select: { studentId: true }
        })
      ]);
      const recordedIds = new Set(recorded.map((r) => r.studentId));
      const absentees = roster.filter((s) => !recordedIds.has(s.id));
      if (absentees.length > 0) {
        await db.attendance.createMany({
          data: absentees.map((s) => ({
            organizationId: ctx.organizationId,
            branchId: existing.branchId,
            sessionId: existing.id,
            studentId: s.id,
            groupId: existing.groupId,
            type: "ABSENT" as const,
            operatorUserId: ctx.userId
          }))
        });
      }
    }

    await writeAuditLog({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "UPDATE_SESSION",
      entityType: "ClassSession",
      entityId: updated.id,
      beforeValue: existing,
      afterValue: updated,
      reason: input.reason
    });

    return ok(updated);
  } catch (err) {
    return handleApiError("sessions.update", err);
  }
}
