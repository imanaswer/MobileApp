import type { StudentParent } from "@prisma/client";

import type { DbClient } from "../db-client";

export type { StudentParent };

export type RelationshipKey = "FATHER" | "MOTHER" | "GUARDIAN" | "EMERGENCY_CONTACT";

export interface CreateStudentParentInput {
  studentId: string;
  parentId: string;
  relationship: RelationshipKey;
  isPrimary?: boolean;
}

/** Persistence for the `StudentParent` junction (ADR-003). No authorization/business rules. */
export interface StudentParentRepository {
  listByStudent(studentId: string): Promise<StudentParent[]>;
  listByParent(parentId: string): Promise<StudentParent[]>;
  findLink(
    studentId: string,
    parentId: string,
    relationship: RelationshipKey,
  ): Promise<StudentParent | null>;
  /** Distinct studentIds a parent record is linked to (parent read-scope). */
  studentIdsForParent(parentId: string): Promise<string[]>;
  create(input: CreateStudentParentInput): Promise<StudentParent>;
  /** Clear the primary flag on every link of a student (before setting a new primary). */
  clearPrimary(studentId: string): Promise<void>;
  delete(studentId: string, parentId: string, relationship: RelationshipKey): Promise<void>;
}

export function createStudentParentRepository(client: DbClient): StudentParentRepository {
  return {
    listByStudent: (studentId) =>
      client.studentParent.findMany({ where: { studentId }, orderBy: { createdAt: "asc" } }),
    listByParent: (parentId) =>
      client.studentParent.findMany({ where: { parentId }, orderBy: { createdAt: "asc" } }),
    findLink: (studentId, parentId, relationship) =>
      client.studentParent.findUnique({
        where: { studentId_parentId_relationship: { studentId, parentId, relationship } },
      }),
    studentIdsForParent: async (parentId) => {
      const rows = await client.studentParent.findMany({
        where: { parentId },
        distinct: ["studentId"],
        select: { studentId: true },
      });
      return rows.map((r) => r.studentId);
    },
    create: (input) => client.studentParent.create({ data: input }),
    clearPrimary: async (studentId) => {
      await client.studentParent.updateMany({
        where: { studentId, isPrimary: true },
        data: { isPrimary: false },
      });
    },
    delete: async (studentId, parentId, relationship) => {
      await client.studentParent.delete({
        where: { studentId_parentId_relationship: { studentId, parentId, relationship } },
      });
    },
  };
}
