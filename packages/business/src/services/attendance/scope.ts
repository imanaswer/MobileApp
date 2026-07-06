import { ForbiddenError, NotFoundError, ValidationError } from "@repo/core";
import type { AcademicYear, AttendanceSession, Enrollment } from "@repo/db";

import type { ServiceContext } from "../../context";
import { isFullAccess, parentChildIds, teacherSectionIds } from "../people/scope";

// Attendance row-scope helpers (M4, ADR-011). Admin full access, teacher
// own-section, parent own-child all reuse the M3 people scope primitives.
export { isFullAccess, parentChildIds, recordAudit, teacherSectionIds } from "../people/scope";
export type { AuditFields } from "../people/scope";

/* ---- IST calendar dates ----
 * @db.Date columns round-trip as UTC-midnight `Date`s; the API speaks
 * YYYY-MM-DD strings (DATABASE_CONVENTIONS §4). Parsing pins T00:00:00Z so the
 * unique keys and range logic cannot drift by a UTC off-by-one. */

const IST_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD → UTC-midnight Date (throws ValidationError on bad input). */
export function parseIstDate(value: string): Date {
  if (!IST_DATE_RE.test(value)) {
    throw new ValidationError(`Invalid date: ${value} (expected YYYY-MM-DD)`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new ValidationError(`Invalid date: ${value}`);
  }
  return date;
}

/** UTC-midnight Date → YYYY-MM-DD. */
export function formatIstDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Mon–Fri (working-weekday config pending client answer — Dev PRD §16.15). */
export function isWorkingWeekday(date: Date): boolean {
  const day = date.getUTCDay();
  return day >= 1 && day <= 5;
}

/** Every calendar date in [from, to], inclusive (both UTC midnight). */
export function eachDateInRange(from: Date, to: Date): Date[] {
  const dates: Date[] = [];
  for (let t = from.getTime(); t <= to.getTime(); t += 86_400_000) {
    dates.push(new Date(t));
  }
  return dates;
}

/* ---- loaders (tenant-checked, 404 on other-school) ---- */

export async function loadSessionInSchool(
  ctx: ServiceContext,
  id: string,
): Promise<AttendanceSession> {
  const session = await ctx.repositories.attendanceSessions.findById(id);
  if (!session || session.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Attendance session not found");
  }
  return session;
}

export async function loadEnrollmentInSchool(ctx: ServiceContext, id: string): Promise<Enrollment> {
  const enrollment = await ctx.repositories.enrollments.findById(id);
  if (!enrollment || enrollment.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Enrollment not found");
  }
  return enrollment;
}

export async function loadYearInSchool(ctx: ServiceContext, id: string): Promise<AcademicYear> {
  const year = await ctx.repositories.academicYears.findById(id);
  if (!year || year.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Academic year not found");
  }
  return year;
}

/** The ACTIVE academic year — attendance can only be marked inside it. */
export async function requireActiveYear(ctx: ServiceContext): Promise<AcademicYear> {
  const year = await ctx.repositories.academicYears.findActive(ctx.user.schoolId);
  if (!year) {
    throw new ValidationError("No academic year is active");
  }
  return year;
}

/** Throw unless the actor is an admin or a teacher assigned to this section. */
export async function assertSectionMarkable(ctx: ServiceContext, sectionId: string): Promise<void> {
  if (isFullAccess(ctx)) {
    return;
  }
  if (ctx.user.role === "TEACHER" && (await teacherSectionIds(ctx)).includes(sectionId)) {
    return;
  }
  throw new ForbiddenError("Out of scope for this section");
}

/**
 * Throw unless the actor may READ this enrollment's attendance: admin any;
 * teacher → enrollment's section is one they teach; parent → own child.
 */
export async function assertEnrollmentReadable(
  ctx: ServiceContext,
  enrollment: Enrollment,
): Promise<void> {
  if (isFullAccess(ctx)) {
    return;
  }
  if (ctx.user.role === "TEACHER") {
    if (enrollment.sectionId && (await teacherSectionIds(ctx)).includes(enrollment.sectionId)) {
      return;
    }
    throw new ForbiddenError("Out of scope for this section");
  }
  if (ctx.user.role === "PARENT") {
    if ((await parentChildIds(ctx)).includes(enrollment.studentId)) {
      return;
    }
    throw new ForbiddenError("Out of scope for this student");
  }
  throw new ForbiddenError("Out of scope");
}
