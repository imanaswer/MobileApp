import type { DocumentTemplate, DocumentType, Prisma } from "@prisma/client";

import type { DbClient } from "../db-client";

export type { DocumentTemplate };

export interface CreateDocumentTemplateInput {
  schoolId: string;
  type: DocumentType;
  name: string;
}

export interface UpdateDocumentTemplateInput {
  name?: string;
  active?: boolean;
}

export interface ListDocumentTemplatesFilter {
  type?: DocumentType;
  active?: boolean;
}

/** Persistence for `DocumentTemplate` (ADR-003, ADR-023 §4). Admin metadata; no auth here. */
export interface DocumentTemplateRepository {
  create(input: CreateDocumentTemplateInput): Promise<DocumentTemplate>;
  findById(id: string): Promise<DocumentTemplate | null>;
  list(schoolId: string, filter?: ListDocumentTemplatesFilter): Promise<DocumentTemplate[]>;
  update(id: string, input: UpdateDocumentTemplateInput): Promise<DocumentTemplate>;
}

export function createDocumentTemplateRepository(client: DbClient): DocumentTemplateRepository {
  return {
    create: (input) =>
      client.documentTemplate.create({
        data: { schoolId: input.schoolId, type: input.type, name: input.name },
      }),

    findById: (id) => client.documentTemplate.findUnique({ where: { id } }),

    list: (schoolId, filter) => {
      const where: Prisma.DocumentTemplateWhereInput = { schoolId };
      if (filter?.type) {
        where.type = filter.type;
      }
      if (filter?.active !== undefined) {
        where.active = filter.active;
      }
      return client.documentTemplate.findMany({
        where,
        orderBy: [{ type: "asc" }, { name: "asc" }],
      });
    },

    update: (id, input) =>
      client.documentTemplate.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
        },
      }),
  };
}
