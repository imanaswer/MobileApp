import type { Parent } from "@prisma/client";

import type { DbClient } from "../db-client";

export type { Parent };

export interface CreateParentInput {
  schoolId: string;
  userId?: string | null | undefined;
  name: string;
  phone: string;
  email?: string | null | undefined;
  occupation?: string | null | undefined;
  address?: string | null | undefined;
  preferredContact?: "PHONE" | "EMAIL" | "WHATSAPP" | undefined;
}

export interface UpdateParentInput {
  userId?: string | null | undefined;
  name?: string | undefined;
  phone?: string | undefined;
  email?: string | null | undefined;
  occupation?: string | null | undefined;
  address?: string | null | undefined;
  preferredContact?: "PHONE" | "EMAIL" | "WHATSAPP" | undefined;
}

/** Persistence for `Parent` (ADR-003). No authorization/business rules. */
export interface ParentRepository {
  list(schoolId: string): Promise<Parent[]>;
  findById(id: string): Promise<Parent | null>;
  findByUserId(userId: string): Promise<Parent | null>;
  create(input: CreateParentInput): Promise<Parent>;
  update(id: string, data: UpdateParentInput): Promise<Parent>;
  delete(id: string): Promise<void>;
}

export function createParentRepository(client: DbClient): ParentRepository {
  return {
    list: (schoolId) => client.parent.findMany({ where: { schoolId }, orderBy: { name: "asc" } }),
    findById: (id) => client.parent.findUnique({ where: { id } }),
    findByUserId: (userId) => client.parent.findUnique({ where: { userId } }),
    create: (input) =>
      client.parent.create({
        data: {
          schoolId: input.schoolId,
          name: input.name,
          phone: input.phone,
          ...(input.userId !== undefined ? { userId: input.userId } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.occupation !== undefined ? { occupation: input.occupation } : {}),
          ...(input.address !== undefined ? { address: input.address } : {}),
          ...(input.preferredContact !== undefined
            ? { preferredContact: input.preferredContact }
            : {}),
        },
      }),
    update: (id, data) =>
      client.parent.update({
        where: { id },
        data: {
          ...(data.userId !== undefined ? { userId: data.userId } : {}),
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.phone !== undefined ? { phone: data.phone } : {}),
          ...(data.email !== undefined ? { email: data.email } : {}),
          ...(data.occupation !== undefined ? { occupation: data.occupation } : {}),
          ...(data.address !== undefined ? { address: data.address } : {}),
          ...(data.preferredContact !== undefined
            ? { preferredContact: data.preferredContact }
            : {}),
        },
      }),
    delete: async (id) => {
      await client.parent.delete({ where: { id } });
    },
  };
}
