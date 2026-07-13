import { PERMISSIONS, STORAGE_BUCKETS } from "@repo/constants";
import { NotFoundError } from "@repo/core";
import type { StudentDocumentTypeKey } from "@repo/types";

import { assertCan } from "../../authorization";
import type { ServiceContext } from "../../context";

import { assertStudentInScope, loadStudentInSchool } from "./scope";
import { assertDocumentTypeVisible } from "./student-document.service";

/**
 * Host-provided signed-URL minting over ONE private bucket (ADR-004). The
 * business layer decides WHO may touch WHICH path and then delegates the
 * cryptography to the host adapter (Supabase Storage in the web app). No
 * supabase-js import here — services stay framework-free.
 */
export interface StoragePort {
  /** One-time signed upload for a path in the given private bucket. */
  createSignedUploadUrl(
    bucket: string,
    path: string,
  ): Promise<{ signedUrl: string; token: string }>;
  /** Short-lived signed read URL for an existing object. */
  createSignedDownloadUrl(bucket: string, path: string, expiresInSeconds: number): Promise<string>;
  /** Server-side upload of already-rendered bytes (e.g. a generated PDF). Overwrites. */
  uploadObject(bucket: string, path: string, bytes: Uint8Array, contentType: string): Promise<void>;
}

/** Signed read URLs stay valid this long — long enough to open, too short to share. */
const DOWNLOAD_URL_TTL_SECONDS = 300;

export interface MintUploadUrlInput {
  studentId: string;
  fileName: string;
}

export interface MintedUploadUrl {
  /** Private-bucket path to persist as `storagePath` after the upload succeeds. */
  storagePath: string;
  signedUrl: string;
  token: string;
}

/**
 * Mint a one-time signed UPLOAD URL for a new student-document file. Manage
 * permission + tenant check first; the path is namespaced server-side
 * (`schoolId/studentId/uuid-fileName` — ADR-004) so a client can never choose
 * (or overwrite) another school's object.
 */
export async function mintDocumentUploadUrl(
  ctx: ServiceContext,
  storage: StoragePort,
  input: MintUploadUrlInput,
): Promise<MintedUploadUrl> {
  assertCan(ctx.user, PERMISSIONS.STUDENT_DOCUMENT_MANAGE);
  await loadStudentInSchool(ctx, input.studentId);

  const safeName = input.fileName.replace(/[^\w.-]+/g, "_").slice(-100);
  const storagePath = `${ctx.user.schoolId}/${input.studentId}/${crypto.randomUUID()}-${safeName}`;
  const { signedUrl, token } = await storage.createSignedUploadUrl(
    STORAGE_BUCKETS.STUDENT_DOCUMENTS,
    storagePath,
  );
  return { storagePath, signedUrl, token };
}

/**
 * Mint a short-lived signed READ URL for a document. Runs the full read-side
 * authz chain — permission, tenant, row scope, and the teacher document-type
 * filter ({@link assertDocumentTypeVisible}) — BEFORE any URL exists, so a
 * teacher cannot pull a hidden type (e.g. Aadhaar) by id.
 */
export async function mintDocumentDownloadUrl(
  ctx: ServiceContext,
  storage: StoragePort,
  documentId: string,
): Promise<{ url: string; type: StudentDocumentTypeKey; fileName: string }> {
  assertCan(ctx.user, PERMISSIONS.STUDENT_DOCUMENT_READ);
  const doc = await ctx.repositories.studentDocuments.findById(documentId);
  if (!doc || doc.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Document not found");
  }
  const student = await loadStudentInSchool(ctx, doc.studentId);
  await assertStudentInScope(ctx, student);
  assertDocumentTypeVisible(ctx.user, doc.type);

  const url = await storage.createSignedDownloadUrl(
    STORAGE_BUCKETS.STUDENT_DOCUMENTS,
    doc.storagePath,
    DOWNLOAD_URL_TTL_SECONDS,
  );
  return { url, type: doc.type, fileName: doc.fileName };
}
