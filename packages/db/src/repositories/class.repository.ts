import type { Class } from "@prisma/client";

import type { DbClient } from "../db-client";

export type { Class };

export interface CreateClassInput {
  schoolId: string;
  name: string;
  sortOrder?: number;
}

export interface UpdateClassInput {
  name?: string | undefined;
  sortOrder?: number | undefined;
}

/** Persistence for `Class` (ADR-003). No authorization/business rules. */
export interface ClassRepository {
  list(schoolId: string): Promise<Class[]>;
  findById(id: string): Promise<Class | null>;
  findByName(schoolId: string, name: string): Promise<Class | null>;
  /** Whether any section belongs to this class (delete guard). */
  hasSections(classId: string): Promise<boolean>;
  create(input: CreateClassInput): Promise<Class>;
  update(id: string, data: UpdateClassInput): Promise<Class>;
  delete(id: string): Promise<void>;
}

export function createClassRepository(client: DbClient): ClassRepository {
  return {
    list: (schoolId) =>
      client.class.findMany({ where: { schoolId }, orderBy: { sortOrder: "asc" } }),
    findById: (id) => client.class.findUnique({ where: { id } }),
    findByName: (schoolId, name) =>
      client.class.findUnique({ where: { schoolId_name: { schoolId, name } } }),
    hasSections: async (classId) =>
      (await client.section.findFirst({ where: { classId }, select: { id: true } })) !== null,
    create: (input) => client.class.create({ data: input }),
    update: (id, data) =>
      client.class.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        },
      }),
    delete: async (id) => {
      await client.class.delete({ where: { id } });
    },
  };
}
