/**
 * @repo/types — framework-agnostic shared TypeScript types & DTO envelopes.
 * No runtime code. See docs/CODING_STANDARDS.md §1 and API_CONVENTIONS.md §8.
 */
import type { LocaleCode, RoleKey, UserStatusKey } from "@repo/constants";

/** Nominal/branded primitive, e.g. `type StudentId = Brand<string, "StudentId">`. */
export type Brand<T, B extends string> = T & { readonly __brand: B };

/** An ISO-8601 timestamp string in UTC (rendered to IST at the edge). */
export type IsoUtcString = Brand<string, "IsoUtcString">;

/** A YYYY-MM-DD IST calendar date string. */
export type IstDateString = Brand<string, "IstDateString">;

/** A value that may be absent. */
export type Maybe<T> = T | null | undefined;

/** Cursor-paginated result envelope (default — API_CONVENTIONS.md §8). */
export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

/** Offset-paginated result envelope (bounded admin lists only). */
export interface OffsetPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Public user-profile DTO returned by the API (never the raw DB row). */
export interface UserProfile {
  userId: string;
  role: RoleKey;
  status: UserStatusKey;
  locale: LocaleCode;
  email: string | null;
  phone: string | null;
}

/* ---- Academic structure DTOs (M2). Calendar columns are @db.Date → IST date
 * strings (YYYY-MM-DD); timestamps are UTC ISO strings (rendered to IST at edge). */

export type AcademicYearStatusKey = "PLANNED" | "ACTIVE" | "CLOSED";

export interface AcademicYearDto {
  id: string;
  schoolId: string;
  name: string;
  startDate: IstDateString;
  endDate: IstDateString;
  status: AcademicYearStatusKey;
}

export interface AcademicTermDto {
  id: string;
  academicYearId: string;
  name: string;
  startDate: IstDateString;
  endDate: IstDateString;
}

export interface ClassDto {
  id: string;
  schoolId: string;
  name: string;
  sortOrder: number;
}

export interface SectionDto {
  id: string;
  classId: string;
  name: string;
}

export interface SubjectDto {
  id: string;
  schoolId: string;
  name: string;
}

export interface TeacherAssignmentDto {
  id: string;
  schoolId: string;
  teacherId: string;
  subjectId: string;
  sectionId: string;
}

/* ---- People Management DTOs (M3). Student is identity-only; Enrollment owns
 * per-year placement (ADR-010). Calendar columns (dob, joiningDate) are IST date
 * strings. */

export type GenderKey = "MALE" | "FEMALE" | "OTHER";
export type StudentStatusKey = "ACTIVE" | "ARCHIVED" | "GRADUATED" | "WITHDRAWN";
export type StudentRelationshipKey = "FATHER" | "MOTHER" | "GUARDIAN" | "EMERGENCY_CONTACT";
export type PreferredContactKey = "PHONE" | "EMAIL" | "WHATSAPP";
export type StudentDocumentTypeKey =
  | "BIRTH_CERTIFICATE"
  | "PASSPORT"
  | "AADHAAR"
  | "MEDICAL_RECORD"
  | "TRANSFER_CERTIFICATE"
  | "PHOTO"
  | "OTHER";
export type EnrollmentStatusKey =
  | "ADMITTED"
  | "ACTIVE"
  | "PROMOTED"
  | "RETAINED"
  | "TRANSFERRED"
  | "DROPPED"
  | "ALUMNI";

export interface StudentDto {
  id: string;
  schoolId: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  dob: IstDateString | null;
  gender: GenderKey | null;
  bloodGroup: string | null;
  nationality: string | null;
  aadhaar: string | null;
  passport: string | null;
  address: string | null;
  photoPath: string | null;
  status: StudentStatusKey;
}

export interface EnrollmentDto {
  id: string;
  schoolId: string;
  studentId: string;
  academicYearId: string;
  classId: string;
  sectionId: string | null;
  rollNo: number | null;
  status: EnrollmentStatusKey;
}

export interface ParentDto {
  id: string;
  schoolId: string;
  userId: string | null;
  name: string;
  phone: string;
  email: string | null;
  occupation: string | null;
  address: string | null;
  preferredContact: PreferredContactKey;
}

export interface StudentParentDto {
  studentId: string;
  parentId: string;
  relationship: StudentRelationshipKey;
  isPrimary: boolean;
}

export interface StaffDto {
  id: string;
  schoolId: string;
  userId: string;
  employeeId: string;
  department: string | null;
  qualification: string | null;
  experienceYears: number | null;
  joiningDate: IstDateString | null;
  bio: string | null;
  photoPath: string | null;
}

export interface StudentDocumentDto {
  id: string;
  schoolId: string;
  studentId: string;
  type: StudentDocumentTypeKey;
  storagePath: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  checksum: string | null;
  version: number;
  uploadedByUserId: string;
  uploadedAt: IsoUtcString;
}
