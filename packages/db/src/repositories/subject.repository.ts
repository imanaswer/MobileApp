import type { Subject } from "@prisma/client";

import type { DbClient } from "../db-client";

export type { Subject };

export interface CreateSubjectInput {
  schoolId: string;
  name: string;
}

export interface UpdateSubjectInput {
  name?: string | undefined;
}

/** Persistence for `Subject` (ADR-003). No authorization/business rules. */
export interface SubjectRepository {
  list(schoolId: string): Promise<Subject[]>;
  findById(id: string): Promise<Subject | null>;
  findByName(schoolId: string, name: string): Promise<Subject | null>;
  /** Whether any teacher assignment references this subject (delete guard). */
  hasAssignments(subjectId: string): Promise<boolean>;
  create(input: CreateSubjectInput): Promise<Subject>;
  update(id: string, data: UpdateSubjectInput): Promise<Subject>;
  delete(id: string): Promise<void>;
}

export function createSubjectRepository(client: DbClient): SubjectRepository {
  return {
    list: (schoolId) => client.subject.findMany({ where: { schoolId }, orderBy: { name: "asc" } }),
    findById: (id) => client.subject.findUnique({ where: { id } }),
    findByName: (schoolId, name) =>
      client.subject.findUnique({ where: { schoolId_name: { schoolId, name } } }),
    hasAssignments: async (subjectId) =>
      (await client.teacherAssignment.findFirst({
        where: { subjectId },
        select: { id: true },
      })) !== null,
    create: (input) => client.subject.create({ data: input }),
    update: (id, data) =>
      client.subject.update({
        where: { id },
        data: { ...(data.name !== undefined ? { name: data.name } : {}) },
      }),
    delete: async (id) => {
      await client.subject.delete({ where: { id } });
    },
  };
}
