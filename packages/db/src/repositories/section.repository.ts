import type { Section } from "@prisma/client";

import type { DbClient } from "../db-client";

export type { Section };

export interface CreateSectionInput {
  classId: string;
  name: string;
}

export interface UpdateSectionInput {
  name?: string | undefined;
}

/** Persistence for `Section` (ADR-003). No authorization/business rules. */
export interface SectionRepository {
  listByClass(classId: string): Promise<Section[]>;
  findById(id: string): Promise<Section | null>;
  findByName(classId: string, name: string): Promise<Section | null>;
  /** Whether any teacher assignment references this section (delete guard). */
  hasAssignments(sectionId: string): Promise<boolean>;
  create(input: CreateSectionInput): Promise<Section>;
  update(id: string, data: UpdateSectionInput): Promise<Section>;
  delete(id: string): Promise<void>;
}

export function createSectionRepository(client: DbClient): SectionRepository {
  return {
    listByClass: (classId) =>
      client.section.findMany({ where: { classId }, orderBy: { name: "asc" } }),
    findById: (id) => client.section.findUnique({ where: { id } }),
    findByName: (classId, name) =>
      client.section.findUnique({ where: { classId_name: { classId, name } } }),
    hasAssignments: async (sectionId) =>
      (await client.teacherAssignment.findFirst({
        where: { sectionId },
        select: { id: true },
      })) !== null,
    create: (input) => client.section.create({ data: input }),
    update: (id, data) =>
      client.section.update({
        where: { id },
        data: { ...(data.name !== undefined ? { name: data.name } : {}) },
      }),
    delete: async (id) => {
      await client.section.delete({ where: { id } });
    },
  };
}
