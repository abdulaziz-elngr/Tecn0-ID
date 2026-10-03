import { type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission, resolveBranchScope } from "@/lib/rbac";
import { handleApiError, ok, created, readJson, readQuery, paginationSchema, BusinessRuleError } from "@/lib/api";
import { writeAuditLog } from "@/lib/audit";

const listSchema = paginationSchema.extend({
  branchId: z.string().uuid().optional(),
  groupId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  upcoming: z.enum(["true", "false"]).optional()
});

const createSchema = z.object({
  groupId: z.string().uuid(),
  subjectId: z.string().uuid(),
  name: z.string().trim().min(2).max(150),
  date: z.string().datetime(),
  maxScore: z.number().positive().max(10000),
  durationMinutes: z.number().int().min(1).max(600).optional(),
  description: z.string().trim().max(1000).optional()
});

export async function GET(request: NextRequest) {
  try {
    const ctx = await requirePermission("exams.view");
    const query = readQuery(request, listSchema);
    const branchIds = resolveBranchScope(ctx, query.branchId);

    const where = {
      organizationId: ctx.organizationId,
      deletedAt: null,
      ...(branchIds ? { branchId: { in: branchIds } } : {}),
      ...(query.groupId ? { groupId: query.groupId } : {}),
      ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      ...(query.upcoming === "true" ? { date: { gte: new Date() } } : {})
    };

    const [total, exams] = await Promise.all([
      db.exam.count({ where }),
      db.exam.findMany({
        where,
        orderBy: { date: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          name: true,
          date: true,
          maxScore: true,
          isPublished: true,
          subject: { select: { id: true, name: true } },
          group: { select: { id: true, name: true } },
          _count: { select: { results: true } }
        }
      })
    ]);

    return ok({
      exams: exams.map((e) => ({ ...e, maxScore: Number(e.maxScore) })),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize))
      }
    });
  } catch (err) {
    return handleApiError("exams.list", err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requirePermission("exams.create");
    const input = await readJson(request, createSchema);

    const group = await db.group.findFirst({
      where: {
        id: input.groupId,
        deletedAt: null,
        branch: { deletedAt: null, center: { organizationId: ctx.organizationId } }
      },
      select: { id: true, branchId: true, teacherId: true }
    });
    if (!group) throw new BusinessRuleError("Invalid group.", { status: 400 });
    resolveBranchScope(ctx, group.branchId);

    // Rule 4 — a teacher may only create exams for their own groups.
    if (ctx.roleNames.includes("TEACHER") && !ctx.permissions.has("academic.groups.manage")) {
      const teacher = await db.teacher.findFirst({
        where: { userId: ctx.userId },
        select: { id: true }
      });
      if (!teacher || group.teacherId !== teacher.id) {
        throw new BusinessRuleError("You can only create exams for the groups you teach.", {
          status: 403
        });
      }
    }

    const subject = await db.subject.findFirst({
      where: { id: input.subjectId, organizationId: ctx.organizationId }
    });
    if (!subject) throw new BusinessRuleError("Invalid subject.", { status: 400 });

    const exam = await db.exam.create({
      data: {
        organizationId: ctx.organizationId,
        branchId: group.branchId,
        subjectId: subject.id,
        groupId: group.id,
        name: input.name,
        date: new Date(input.date),
        maxScore: input.maxScore,
        durationMinutes: input.durationMinutes,
        description: input.description,
        createdById: ctx.userId
      }
    });

    await writeAuditLog({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "CREATE_EXAM",
      entityType: "Exam",
      entityId: exam.id,
      afterValue: exam
    });

    return created({ ...exam, maxScore: Number(exam.maxScore) });
  } catch (err) {
    return handleApiError("exams.create", err);
  }
}
