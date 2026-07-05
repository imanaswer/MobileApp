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

/* ---- People Management inputs (M3). Cross-entity rules (uniqueness, one-per-year,
 * scope, rollNo-needs-section) live in the business services — not duplicated here. */

const genderSchema = z.enum(["MALE", "FEMALE", "OTHER"]);
const studentStatusSchema = z.enum(["ACTIVE", "ARCHIVED", "GRADUATED", "WITHDRAWN"]);
const relationshipSchema = z.enum(["FATHER", "MOTHER", "GUARDIAN", "EMERGENCY_CONTACT"]);
const preferredContactSchema = z.enum(["PHONE", "EMAIL", "WHATSAPP"]);
const documentTypeSchema = z.enum([
  "BIRTH_CERTIFICATE",
  "PASSPORT",
  "AADHAAR",
  "MEDICAL_RECORD",
  "TRANSFER_CERTIFICATE",
  "PHOTO",
  "OTHER",
]);
const shortText = (max: number) => z.string().trim().min(1).max(max);
const phoneSchema = z.string().trim().min(3).max(20);
const aadhaarSchema = z.string().trim().regex(/^\d{12}$/, "Aadhaar must be 12 digits");

/* Student */
export const createStudentInput = z.object({
  admissionNo: shortText(60),
  firstName: nameSchema,
  lastName: nameSchema,
  dob: istDateSchema.optional(),
  gender: genderSchema.optional(),
  bloodGroup: shortText(10).optional(),
  nationality: shortText(60).optional(),
  aadhaar: aadhaarSchema.optional(),
  passport: shortText(20).optional(),
  address: z.string().trim().max(500).optional(),
});
export const updateStudentInput = z.object({
  id: idSchema,
  firstName: nameSchema.optional(),
  lastName: nameSchema.optional(),
  dob: istDateSchema.nullable().optional(),
  gender: genderSchema.nullable().optional(),
  bloodGroup: shortText(10).nullable().optional(),
  nationality: shortText(60).nullable().optional(),
  aadhaar: aadhaarSchema.nullable().optional(),
  passport: shortText(20).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  status: studentStatusSchema.optional(),
});
export const listStudentsInput = z.object({
  status: studentStatusSchema.optional(),
  search: z.string().trim().min(1).max(120).optional(),
});
export const studentIdInput = z.object({ studentId: idSchema });

/* Enrollment (ADR-010) */
const rollNoSchema = z.number().int().positive();
export const enrollInput = z.object({
  studentId: idSchema,
  academicYearId: idSchema,
  classId: idSchema,
  sectionId: idSchema.optional(),
  rollNo: rollNoSchema.optional(),
});
export const transferInput = z.object({
  enrollmentId: idSchema,
  toSectionId: idSchema,
  rollNo: rollNoSchema.optional(),
});
export const promoteInput = z.object({
  enrollmentId: idSchema,
  targetAcademicYearId: idSchema,
  toClassId: idSchema,
  toSectionId: idSchema.optional(),
  rollNo: rollNoSchema.optional(),
});
export const withdrawInput = z.object({ enrollmentId: idSchema });
export const sectionRosterInput = z.object({ academicYearId: idSchema, sectionId: idSchema });

/* Parent */
export const createParentInput = z.object({
  userId: idSchema.optional(),
  name: nameSchema,
  phone: phoneSchema,
  email: z.string().trim().email().optional(),
  occupation: shortText(120).optional(),
  address: z.string().trim().max(500).optional(),
  preferredContact: preferredContactSchema.optional(),
});
export const updateParentInput = z.object({
  id: idSchema,
  userId: idSchema.nullable().optional(),
  name: nameSchema.optional(),
  phone: phoneSchema.optional(),
  email: z.string().trim().email().nullable().optional(),
  occupation: shortText(120).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  preferredContact: preferredContactSchema.optional(),
});
export const linkParentInput = z.object({
  studentId: idSchema,
  parentId: idSchema,
  relationship: relationshipSchema,
  isPrimary: z.boolean().optional(),
});
export const unlinkParentInput = z.object({
  studentId: idSchema,
  parentId: idSchema,
  relationship: relationshipSchema,
});

/* Staff (employment profile) */
export const createStaffInput = z.object({
  userId: idSchema,
  employeeId: shortText(40),
  department: shortText(120).optional(),
  qualification: shortText(200).optional(),
  experienceYears: z.number().int().min(0).max(80).optional(),
  joiningDate: istDateSchema.optional(),
  bio: z.string().trim().max(1000).optional(),
});
export const updateStaffInput = z.object({
  id: idSchema,
  employeeId: shortText(40).optional(),
  department: shortText(120).nullable().optional(),
  qualification: shortText(200).nullable().optional(),
  experienceYears: z.number().int().min(0).max(80).nullable().optional(),
  joiningDate: istDateSchema.nullable().optional(),
  bio: z.string().trim().max(1000).nullable().optional(),
});

/* Student documents (metadata; bytes uploaded separately to Storage) */
const documentMeta = {
  fileName: shortText(255),
  storagePath: shortText(400),
  mimeType: shortText(120).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  checksum: shortText(128).optional(),
};
export const createStudentDocumentInput = z.object({
  studentId: idSchema,
  type: documentTypeSchema,
  ...documentMeta,
});
export const replaceStudentDocumentInput = z.object({ id: idSchema, ...documentMeta });
