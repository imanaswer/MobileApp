import { PERMISSIONS } from "@repo/constants";
import { can, ConflictError, NotFoundError, ValidationError } from "@repo/core";
import type { TeacherAssignment } from "@repo/db";
import type { TeacherAssignmentDto } from "@repo/types";

import { assertCan, assertScope, type ScopeRule } from "../../authorization";
import type { ServiceContext } from "../../context";

import { mapTeacherAssignment } from "./mappers";

export interface CreateTeacherAssignmentInput {
  teacherId: string;
  subjectId: string;
  sectionId: string;
}

export interface ListTeacherAssignmentsFilter {
  sectionId?: string | undefined;
  subjectId?: string | undefined;
  teacherId?: string | undefined;
}

/**
 * Feature ScopeRule (Open/Closed extension point — ADR-002): a teacher may only
 * touch their own assignments. Admins hold ACADEMIC_MANAGE and bypass the scope.
 */
const ownsAssignment: ScopeRule<{ teacherId: string }> = (principal, r) =>
  principal.userId === r.teacherId;

/**
 * List assignments. Admins (ACADEMIC_MANAGE) see all; a teacher is scoped to their
 * own rows regardless of any teacherId filter.
 */
export async function listTeacherAssignments(
  ctx: ServiceContext,
  filter: ListTeacherAssignmentsFilter = {},
): Promise<TeacherAssignmentDto[]> {
  assertCan(ctx.user, PERMISSIONS.ACADEMIC_READ);
  const scopedTeacherId = can(ctx.user.role, PERMISSIONS.ACADEMIC_MANAGE)
    ? filter.teacherId
    : ctx.user.userId;
  const rows = await ctx.repositories.teacherAssignments.list(ctx.user.schoolId, {
    ...(scopedTeacherId ? { teacherId: scopedTeacherId } : {}),
    ...(filter.sectionId ? { sectionId: filter.sectionId } : {}),
    ...(filter.subjectId ? { subjectId: filter.subjectId } : {}),
  });
  return rows.map(mapTeacherAssignment);
}

export async function getTeacherAssignment(
  ctx: ServiceContext,
  id: string,
): Promise<TeacherAssignmentDto> {
  assertCan(ctx.user, PERMISSIONS.ACADEMIC_READ);
  const row = await loadAssignment(ctx, id);
  if (!can(ctx.user.role, PERMISSIONS.ACADEMIC_MANAGE)) {
    assertScope(ctx.user, { teacherId: row.teacherId }, ownsAssignment);
  }
  return mapTeacherAssignment(row);
}

/**
 * Create an assignment. Rules: teacher is an ACTIVE TEACHER in this school; subject
 * and section exist in this school; no duplicate (teacher, subject, section).
 */
export async function createTeacherAssignment(
  ctx: ServiceContext,
  input: CreateTeacherAssignmentInput,
): Promise<TeacherAssignmentDto> {
  assertCan(ctx.user, PERMISSIONS.ACADEMIC_MANAGE);
  await assertIsActiveTeacher(ctx, input.teacherId);
  await assertSubjectInSchool(ctx, input.subjectId);
  await assertSectionInSchool(ctx, input.sectionId);

  const dup = await ctx.repositories.teacherAssignments.findByTriple(
    input.teacherId,
    input.subjectId,
    input.sectionId,
  );
  if (dup) {
    throw new ConflictError("This teacher is already assigned to that subject and section");
  }

  return ctx.withTransaction(async (repos) => {
    const created = await repos.teacherAssignments.create({
      schoolId: ctx.user.schoolId,
      teacherId: input.teacherId,
      subjectId: input.subjectId,
      sectionId: input.sectionId,
    });
    await repos.audit.record({
      schoolId: ctx.user.schoolId,
      actorUserId: ctx.user.userId,
      action: "TEACHER_ASSIGNMENT_CREATE",
      entityType: "TeacherAssignment",
      entityId: created.id,
      after: {
        teacherId: created.teacherId,
        subjectId: created.subjectId,
        sectionId: created.sectionId,
      },
    });
    return mapTeacherAssignment(created);
  });
}

/** Delete an assignment (assignments are immutable — no update). */
export async function deleteTeacherAssignment(ctx: ServiceContext, id: string): Promise<void> {
  assertCan(ctx.user, PERMISSIONS.ACADEMIC_MANAGE);
  const before = await loadAssignment(ctx, id);
  await ctx.withTransaction(async (repos) => {
    await repos.teacherAssignments.delete(id);
    await repos.audit.record({
      schoolId: ctx.user.schoolId,
      actorUserId: ctx.user.userId,
      action: "TEACHER_ASSIGNMENT_DELETE",
      entityType: "TeacherAssignment",
      entityId: id,
      before: {
        teacherId: before.teacherId,
        subjectId: before.subjectId,
        sectionId: before.sectionId,
      },
    });
  });
}

async function loadAssignment(ctx: ServiceContext, id: string): Promise<TeacherAssignment> {
  const row = await ctx.repositories.teacherAssignments.findById(id);
  if (!row || row.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Teacher assignment not found");
  }
  return row;
}

async function assertIsActiveTeacher(ctx: ServiceContext, teacherId: string): Promise<void> {
  const user = await ctx.repositories.users.findById(teacherId);
  if (!user || user.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Teacher not found");
  }
  if (user.role !== "TEACHER" || user.status !== "ACTIVE") {
    throw new ValidationError("Assignee must be an active teacher");
  }
}

async function assertSubjectInSchool(ctx: ServiceContext, subjectId: string): Promise<void> {
  const subject = await ctx.repositories.subjects.findById(subjectId);
  if (!subject || subject.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Subject not found");
  }
}

async function assertSectionInSchool(ctx: ServiceContext, sectionId: string): Promise<void> {
  const section = await ctx.repositories.sections.findById(sectionId);
  if (!section) {
    throw new NotFoundError("Section not found");
  }
  const cls = await ctx.repositories.classes.findById(section.classId);
  if (!cls || cls.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Section not found");
  }
}
