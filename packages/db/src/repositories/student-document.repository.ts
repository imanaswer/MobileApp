import type { StudentDocument } from "@prisma/client";

import type { DbClient } from "../db-client";

export type { StudentDocument };

export type DocumentTypeKey =
  | "BIRTH_CERTIFICATE"
  | "PASSPORT"
  | "AADHAAR"
  | "MEDICAL_RECORD"
  | "TRANSFER_CERTIFICATE"
  | "PHOTO"
  | "OTHER";

export interface CreateStudentDocumentInput {
  schoolId: string;
  studentId: string;
  type: DocumentTypeKey;
  storagePath: string;
  fileName: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  checksum?: string | null;
  version?: number;
  uploadedByUserId: string;
}

export interface UpdateStudentDocumentInput {
  storagePath?: string | undefined;
  fileName?: string | undefined;
  mimeType?: string | null | undefined;
  sizeBytes?: number | null | undefined;
  checksum?: string | null | undefined;
  version?: number | undefined;
  uploadedByUserId?: string | undefined;
}

/** Persistence for `StudentDocument` metadata (bytes live in Storage). ADR-003/004. */
export interface StudentDocumentRepository {
  listByStudent(studentId: string): Promise<StudentDocument[]>;
  findById(id: string): Promise<StudentDocument | null>;
  create(input: CreateStudentDocumentInput): Promise<StudentDocument>;
  update(id: string, data: UpdateStudentDocumentInput): Promise<StudentDocument>;
  delete(id: string): Promise<void>;
}

export function createStudentDocumentRepository(client: DbClient): StudentDocumentRepository {
  return {
    listByStudent: (studentId) =>
      client.studentDocument.findMany({
        where: { studentId },
        orderBy: [{ type: "asc" }, { version: "desc" }, { createdAt: "desc" }],
      }),
    findById: (id) => client.studentDocument.findUnique({ where: { id } }),
    create: (input) => client.studentDocument.create({ data: input }),
    update: (id, data) =>
      client.studentDocument.update({
        where: { id },
        data: {
          ...(data.storagePath !== undefined ? { storagePath: data.storagePath } : {}),
          ...(data.fileName !== undefined ? { fileName: data.fileName } : {}),
          ...(data.mimeType !== undefined ? { mimeType: data.mimeType } : {}),
          ...(data.sizeBytes !== undefined ? { sizeBytes: data.sizeBytes } : {}),
          ...(data.checksum !== undefined ? { checksum: data.checksum } : {}),
          ...(data.version !== undefined ? { version: data.version } : {}),
          ...(data.uploadedByUserId !== undefined
            ? { uploadedByUserId: data.uploadedByUserId }
            : {}),
        },
      }),
    delete: async (id) => {
      await client.studentDocument.delete({ where: { id } });
    },
  };
}
