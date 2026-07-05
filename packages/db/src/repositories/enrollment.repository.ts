import type { Enrollment } from "@prisma/client";

import type { DbClient } from "../db-client";

export type { Enrollment };

export interface CreateEnrollmentInput {
  schoolId: string;
  studentId: string;
  academicYearId: string;
  classId: string;
  sectionId?: string | null;
  rollNo?: number | null;
  status?: "ADMITTED" | "ACTIVE" | "PROMOTED" | "RETAINED" | "TRANSFERRED" | "DROPPED" | "ALUMNI";
}

export interface UpdateEnrollmentInput {
  classId?: string | undefined;
  sectionId?: string | null | undefined;
  rollNo?: number | null | undefined;
  status?:
    | "ADMITTED"
    | "ACTIVE"
    | "PROMOTED"
    | "RETAINED"
    | "TRANSFERRED"
    | "DROPPED"
    | "ALUMNI"
    | undefined;
}

/** Persistence for `Enrollment` (ADR-003, ADR-010). No authorization/business rules. */
export interface EnrollmentRepository {
  listByStudent(studentId: string): Promise<Enrollment[]>;
  listBySection(academicYearId: string, sectionId: string): Promise<Enrollment[]>;
  findById(id: string): Promise<Enrollment | null>;
  findByStudentYear(studentId: string, academicYearId: string): Promise<Enrollment | null>;
  /** A roll-number clash in the same section+year (clean 409 before the DB partial unique). */
  findRollNoConflict(
    academicYearId: string,
    sectionId: string,
    rollNo: number,
    excludeId?: string,
  ): Promise<Enrollment | null>;
  /** Distinct studentIds enrolled in any of these sections (teacher read-scope);
   *  narrowed to a year when `academicYearId` is given. */
  studentIdsInSections(
    sectionIds: readonly string[],
    academicYearId?: string,
  ): Promise<string[]>;
  create(input: CreateEnrollmentInput): Promise<Enrollment>;
  update(id: string, data: UpdateEnrollmentInput): Promise<Enrollment>;
}

export function createEnrollmentRepository(client: DbClient): EnrollmentRepository {
  return {
    listByStudent: (studentId) =>
      client.enrollment.findMany({ where: { studentId }, orderBy: { createdAt: "desc" } }),
    listBySection: (academicYearId, sectionId) =>
      client.enrollment.findMany({
        where: { academicYearId, sectionId },
        orderBy: [{ rollNo: "asc" }, { createdAt: "asc" }],
      }),
    findById: (id) => client.enrollment.findUnique({ where: { id } }),
    findByStudentYear: (studentId, academicYearId) =>
      client.enrollment.findUnique({
        where: { studentId_academicYearId: { studentId, academicYearId } },
      }),
    findRollNoConflict: (academicYearId, sectionId, rollNo, excludeId) =>
      client.enrollment.findFirst({
        where: {
          academicYearId,
          sectionId,
          rollNo,
          ...(excludeId ? { NOT: { id: excludeId } } : {}),
        },
      }),
    studentIdsInSections: async (sectionIds, academicYearId) => {
      if (sectionIds.length === 0) {
        return [];
      }
      const rows = await client.enrollment.findMany({
        where: {
          sectionId: { in: [...sectionIds] },
          ...(academicYearId ? { academicYearId } : {}),
        },
        distinct: ["studentId"],
        select: { studentId: true },
      });
      return rows.map((r) => r.studentId);
    },
    create: (input) => client.enrollment.create({ data: input }),
    update: (id, data) =>
      client.enrollment.update({
        where: { id },
        data: {
          ...(data.classId !== undefined ? { classId: data.classId } : {}),
          ...(data.sectionId !== undefined ? { sectionId: data.sectionId } : {}),
          ...(data.rollNo !== undefined ? { rollNo: data.rollNo } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
        },
      }),
  };
}
