/**
 * @repo/validation — shared Zod schemas reused by tRPC inputs, RHF forms, and
 * import validation (DRY — CODING_STANDARDS.md §6, API_CONVENTIONS.md §3/§8).
 * Feature schemas land here per milestone; M0 ships reusable primitives only.
 */
import { DEFAULT_PAGE_SIZE, LOCALES, MAX_PAGE_SIZE, ROLES } from "@repo/constants";
import { z } from "zod";

export { z };

/** A CUID identifier (Prisma default id format). */
export const idSchema = z.string().min(1);

/** UI locale. */
export const localeSchema = z.enum(LOCALES);

/** Cursor pagination input (the default — API_CONVENTIONS.md §8). */
export const cursorPaginationInput = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type CursorPaginationInput = z.infer<typeof cursorPaginationInput>;

/** Sort direction. */
export const sortDirSchema = z.enum(["asc", "desc"]).default("asc");

/** Role (matches the fixed ROLES set). */
export const roleSchema = z.enum(ROLES);

/* ---- auth inputs (Step 5/6 procedures) ---- */

/** `auth.updateProfile` — own non-credential fields (M1: locale). */
export const updateProfileInput = z.object({ locale: localeSchema });
export type UpdateProfileInput = z.infer<typeof updateProfileInput>;

/** `auth.setRole` — admin changes another user's role. */
export const setRoleInput = z.object({ userId: idSchema, role: roleSchema });
export type SetRoleInput = z.infer<typeof setRoleInput>;

/** A single target user id (`auth.disableUser` / `auth.enableUser`). */
export const userIdInput = z.object({ userId: idSchema });
export type UserIdInput = z.infer<typeof userIdInput>;

/* ---- academic structure inputs (M2). Cross-field rules (start<end, overlap,
 * uniqueness) live in the business services, not here — no duplicated validation. */

/** A single entity id (get/delete). */
export const idInput = z.object({ id: idSchema });
export type IdInput = z.infer<typeof idInput>;

/** Non-empty display name (trimmed). */
const nameSchema = z.string().trim().min(1).max(120);

/** IST calendar date `YYYY-MM-DD` → a UTC-midnight Date (a @db.Date column value). */
export const istDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  // Reject impossible dates BEFORE transform via round-trip: 2026-13-01 → NaN, and
  // 2026-02-30 → rolls to 03-02 so it won't round-trip. Otherwise a bad date slips past
  // start<end and 500s at the @db.Date column instead of a clean 400.
  .refine((s) => {
    const d = new Date(`${s}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "Invalid calendar date")
  .transform((s) => new Date(`${s}T00:00:00.000Z`));

export const academicYearStatusSchema = z.enum(["PLANNED", "ACTIVE", "CLOSED"]);

export const createAcademicYearInput = z.object({
  name: nameSchema,
  startDate: istDateSchema,
  endDate: istDateSchema,
  status: academicYearStatusSchema.optional(),
});

export const updateAcademicYearInput = z.object({
  id: idSchema,
  name: nameSchema.optional(),
  startDate: istDateSchema.optional(),
  endDate: istDateSchema.optional(),
  status: academicYearStatusSchema.optional(),
});

export const createAcademicTermInput = z.object({
  academicYearId: idSchema,
  name: nameSchema,
  startDate: istDateSchema,
  endDate: istDateSchema,
});

export const updateAcademicTermInput = z.object({
  id: idSchema,
  name: nameSchema.optional(),
  startDate: istDateSchema.optional(),
  endDate: istDateSchema.optional(),
});

/** List terms of a year. */
export const academicYearIdInput = z.object({ academicYearId: idSchema });

export const createClassInput = z.object({
  name: nameSchema,
  sortOrder: z.number().int().optional(),
});

export const updateClassInput = z.object({
  id: idSchema,
  name: nameSchema.optional(),
  sortOrder: z.number().int().optional(),
});

export const createSectionInput = z.object({ classId: idSchema, name: nameSchema });
export const updateSectionInput = z.object({ id: idSchema, name: nameSchema.optional() });

/** List sections of a class. */
export const classIdInput = z.object({ classId: idSchema });

export const createSubjectInput = z.object({ name: nameSchema });
export const updateSubjectInput = z.object({ id: idSchema, name: nameSchema.optional() });

export const createTeacherAssignmentInput = z.object({
  teacherId: idSchema,
  subjectId: idSchema,
  sectionId: idSchema,
});

/** Filter teacher assignments (teacher-own scope is applied in the service). */
export const listTeacherAssignmentsInput = z.object({
  teacherId: idSchema.optional(),
  subjectId: idSchema.optional(),
  sectionId: idSchema.optional(),
});
