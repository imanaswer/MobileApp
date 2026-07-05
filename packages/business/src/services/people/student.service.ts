import { PERMISSIONS } from "@repo/constants";
import { ConflictError } from "@repo/core";
import type { GenderKey, StudentDto } from "@repo/types";

import { assertCan } from "../../authorization";
import type { ServiceContext } from "../../context";

import { mapStudent } from "./mappers";
import {
  accessibleStudentIds,
  assertStudentInScope,
  loadStudentInSchool,
  recordAudit,
} from "./scope";

export interface CreateStudentInput {
  admissionNo: string;
  firstName: string;
  lastName: string;
  dob?: Date | undefined;
  gender?: GenderKey | undefined;
  bloodGroup?: string | undefined;
  nationality?: string | undefined;
  aadhaar?: string | undefined;
  passport?: string | undefined;
  address?: string | undefined;
}

export interface UpdateStudentInput {
  firstName?: string | undefined;
  lastName?: string | undefined;
  dob?: Date | null | undefined;
  gender?: GenderKey | null | undefined;
  bloodGroup?: string | null | undefined;
  nationality?: string | null | undefined;
  aadhaar?: string | null | undefined;
  passport?: string | null | undefined;
  address?: string | null | undefined;
  status?: "ACTIVE" | "ARCHIVED" | "GRADUATED" | "WITHDRAWN" | undefined;
}

/** Read students in scope (admin → all; teacher → own-section; parent → own children). */
export async function listStudents(
  ctx: ServiceContext,
  filter?: { status?: StudentDto["status"]; search?: string },
): Promise<StudentDto[]> {
  assertCan(ctx.user, PERMISSIONS.STUDENT_READ);
  const ids = await accessibleStudentIds(ctx);
  const rows =
    ids === "ALL"
      ? await ctx.repositories.students.list(ctx.user.schoolId, filter)
      : await ctx.repositories.students.listByIds(ids, filter);
  return rows.map(mapStudent);
}

export async function getStudent(ctx: ServiceContext, id: string): Promise<StudentDto> {
  assertCan(ctx.user, PERMISSIONS.STUDENT_READ);
  const student = await loadStudentInSchool(ctx, id);
  await assertStudentInScope(ctx, student);
  return mapStudent(student);
}

/**
 * Create a student IDENTITY (admission). The first Enrollment is a separate
 * `enrollment.enroll` call — this supersedes Step 1's "single atomic admission"
 * framing, matching ADR-010's ADMITTED-before-placement state and the web UI's
 * separate Create / Enroll steps. Admission number is unique per school; a
 * duplicate Aadhaar (when present) is a clean 409, not a DB 500.
 */
export async function createStudent(
  ctx: ServiceContext,
  input: CreateStudentInput,
): Promise<StudentDto> {
  assertCan(ctx.user, PERMISSIONS.STUDENT_MANAGE);

  if (await ctx.repositories.students.findByAdmissionNo(ctx.user.schoolId, input.admissionNo)) {
    throw new ConflictError(`Admission number "${input.admissionNo}" is already in use`);
  }
  if (input.aadhaar && (await ctx.repositories.students.findByAadhaar(ctx.user.schoolId, input.aadhaar))) {
    throw new ConflictError("That Aadhaar number is already on another student");
  }

  return ctx.withTransaction(async (repos) => {
    const created = await repos.students.create({ schoolId: ctx.user.schoolId, ...input });
    await recordAudit(ctx, repos, {
      action: "STUDENT_CREATE",
      entityType: "Student",
      entityId: created.id,
      after: { admissionNo: created.admissionNo, status: created.status },
    });
    return mapStudent(created);
  });
}

export async function updateStudent(
  ctx: ServiceContext,
  id: string,
  input: UpdateStudentInput,
): Promise<StudentDto> {
  assertCan(ctx.user, PERMISSIONS.STUDENT_MANAGE);
  const before = await loadStudentInSchool(ctx, id);

  if (input.aadhaar && input.aadhaar !== before.aadhaar) {
    const clash = await ctx.repositories.students.findByAadhaar(ctx.user.schoolId, input.aadhaar);
    if (clash && clash.id !== id) {
      throw new ConflictError("That Aadhaar number is already on another student");
    }
  }

  return ctx.withTransaction(async (repos) => {
    const after = await repos.students.update(id, input);
    await recordAudit(ctx, repos, {
      action: "STUDENT_UPDATE",
      entityType: "Student",
      entityId: id,
      before: { status: before.status },
      after: { status: after.status },
    });
    return mapStudent(after);
  });
}

/** Archive a student record (lifecycle, not deletion — DATABASE_CONVENTIONS §3). */
export async function archiveStudent(ctx: ServiceContext, id: string): Promise<StudentDto> {
  assertCan(ctx.user, PERMISSIONS.STUDENT_MANAGE);
  const before = await loadStudentInSchool(ctx, id);

  return ctx.withTransaction(async (repos) => {
    const after = await repos.students.update(id, { status: "ARCHIVED" });
    await recordAudit(ctx, repos, {
      action: "STUDENT_ARCHIVE",
      entityType: "Student",
      entityId: id,
      before: { status: before.status },
      after: { status: after.status },
    });
    return mapStudent(after);
  });
}
