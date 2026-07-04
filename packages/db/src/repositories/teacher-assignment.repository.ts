import type { TeacherAssignment } from "@prisma/client";

import type { DbClient } from "../db-client";

export type { TeacherAssignment };

export interface CreateTeacherAssignmentInput {
  schoolId: string;
  teacherId: string;
  subjectId: string;
  sectionId: string;
}

/** Optional narrowing for list queries (teacher-own scope is applied by the service). */
export interface TeacherAssignmentFilter {
  teacherId?: string;
  sectionId?: string;
  subjectId?: string;
}

/**
 * Persistence for `TeacherAssignment` (ADR-003). No authorization/business rules.
 * Immutable — no update; staffing changes are audited delete + create.
 */
export interface TeacherAssignmentRepository {
  list(schoolId: string, filter?: TeacherAssignmentFilter): Promise<TeacherAssignment[]>;
  findById(id: string): Promise<TeacherAssignment | null>;
  findByTriple(
    teacherId: string,
    subjectId: string,
    sectionId: string,
  ): Promise<TeacherAssignment | null>;
  create(input: CreateTeacherAssignmentInput): Promise<TeacherAssignment>;
  delete(id: string): Promise<void>;
}

export function createTeacherAssignmentRepository(
  client: DbClient,
): TeacherAssignmentRepository {
  return {
    list: (schoolId, filter) =>
      client.teacherAssignment.findMany({
        where: {
          schoolId,
          ...(filter?.teacherId ? { teacherId: filter.teacherId } : {}),
          ...(filter?.sectionId ? { sectionId: filter.sectionId } : {}),
          ...(filter?.subjectId ? { subjectId: filter.subjectId } : {}),
        },
        orderBy: { createdAt: "desc" },
      }),
    findById: (id) => client.teacherAssignment.findUnique({ where: { id } }),
    findByTriple: (teacherId, subjectId, sectionId) =>
      client.teacherAssignment.findUnique({
        where: { teacherId_subjectId_sectionId: { teacherId, subjectId, sectionId } },
      }),
    create: (input) => client.teacherAssignment.create({ data: input }),
    delete: async (id) => {
      await client.teacherAssignment.delete({ where: { id } });
    },
  };
}
