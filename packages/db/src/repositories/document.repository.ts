import { Prisma } from "@prisma/client";
import type { Document, DocumentStatus, DocumentType } from "@prisma/client";

import type { DbClient } from "../db-client";

export type { Document, DocumentStatus, DocumentType };

export interface CreateDocumentInput {
  schoolId: string;
  studentId: string;
  type: DocumentType;
  status: DocumentStatus; // GENERATED or UPLOADED
  templateId?: string | null;
  snapshotJson?: Prisma.InputJsonValue | null; // frozen at generate (ADR-023 §3)
  storagePath?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  generatedByUserId?: string | null;
  uploadedByUserId?: string | null;
}

export interface UpdateDocumentInput {
  status?: DocumentStatus;
  approvedByUserId?: string | null;
  approvedAt?: Date | null;
  archivedAt?: Date | null;
}

export interface ListDocumentsFilter {
  studentId?: string;
  type?: DocumentType;
  status?: DocumentStatus;
}

export interface ListSchoolDocumentsFilter {
  studentId?: string;
  type?: DocumentType;
  status?: DocumentStatus;
  limit: number;
}

/**
 * Persistence for `Document` (ADR-003, ADR-023). No authorization; the business layer
 * resolves permission/scope, the lifecycle transition graph, and the APPROVED-only
 * status filter for non-admin readers.
 */
export interface DocumentRepository {
  create(input: CreateDocumentInput): Promise<Document>;
  findById(id: string): Promise<Document | null>;
  /** A student's documents, newest first — optionally narrowed by type/status. */
  listByStudent(studentId: string, filter?: ListDocumentsFilter): Promise<Document[]>;
  /** School-wide, newest first (the admin console) — optionally narrowed by student/type/status. */
  list(schoolId: string, filter: ListSchoolDocumentsFilter): Promise<Document[]>;
  update(id: string, input: UpdateDocumentInput): Promise<Document>;
  delete(id: string): Promise<void>;
}

export function createDocumentRepository(client: DbClient): DocumentRepository {
  return {
    create: (input) =>
      client.document.create({
        data: {
          schoolId: input.schoolId,
          studentId: input.studentId,
          type: input.type,
          status: input.status,
          templateId: input.templateId ?? null,
          snapshotJson: input.snapshotJson ?? Prisma.JsonNull,
          storagePath: input.storagePath ?? null,
          fileName: input.fileName ?? null,
          mimeType: input.mimeType ?? null,
          sizeBytes: input.sizeBytes ?? null,
          generatedByUserId: input.generatedByUserId ?? null,
          uploadedByUserId: input.uploadedByUserId ?? null,
        },
      }),

    findById: (id) => client.document.findUnique({ where: { id } }),

    listByStudent: (studentId, filter) => {
      const where: Prisma.DocumentWhereInput = { studentId };
      if (filter?.type) {
        where.type = filter.type;
      }
      if (filter?.status) {
        where.status = filter.status;
      }
      return client.document.findMany({ where, orderBy: { createdAt: "desc" } });
    },

    list: (schoolId, filter) => {
      const where: Prisma.DocumentWhereInput = { schoolId };
      if (filter.studentId) {
        where.studentId = filter.studentId;
      }
      if (filter.type) {
        where.type = filter.type;
      }
      if (filter.status) {
        where.status = filter.status;
      }
      return client.document.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: filter.limit,
      });
    },

    update: (id, input) =>
      client.document.update({
        where: { id },
        data: {
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.approvedByUserId !== undefined
            ? { approvedByUserId: input.approvedByUserId }
            : {}),
          ...(input.approvedAt !== undefined ? { approvedAt: input.approvedAt } : {}),
          ...(input.archivedAt !== undefined ? { archivedAt: input.archivedAt } : {}),
        },
      }),

    delete: async (id) => {
      await client.document.delete({ where: { id } });
    },
  };
}
