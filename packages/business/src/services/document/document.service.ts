import { PERMISSIONS, STORAGE_BUCKETS } from "@repo/constants";
import { ConflictError, ValidationError } from "@repo/core";
import type { DocumentStatus, DocumentType } from "@repo/db";
import type { DocumentDto, DocumentSnapshot, DocumentTypeKey } from "@repo/types";

import { assertCan } from "../../authorization";
import type { ServiceContext } from "../../context";
import type { StoragePort } from "../people/document-storage.service";

import { istToday, mapDocument } from "./mappers";
import {
  assertStudentInScope,
  currentEnrollment,
  isFullAccess,
  loadDocumentInSchool,
  loadStudentInSchool,
  loadTemplateInSchool,
  recordAudit,
} from "./scope";

/** Signed download URLs stay valid this long — the brief's 60s (ADR-023 §1; tighter than the 300s norm). */
const DOWNLOAD_URL_TTL_SECONDS = 60;

/** Draft origins that can still be approved or hard-deleted (ADR-023 §5). */
const DRAFT_STATUSES: readonly DocumentStatus[] = ["GENERATED", "UPLOADED"];

// ---------------------------------------------------------------------------
// Generate (metadata-first — ADR-023 §3)
// ---------------------------------------------------------------------------

export interface GenerateDocumentInput {
  studentId: string;
  type: DocumentTypeKey;
  /** Optional template to render from (its type must match). */
  templateId?: string | undefined;
  /** Caller-owned per-certificate data (purpose, validity date, …) — frozen into the snapshot. */
  fields?: Record<string, string> | undefined;
}

/**
 * Generate a certificate as a GENERATED document (ADR-023 §3). The values are FROZEN
 * into `snapshotJson` at issue time — student identity + current placement are
 * SYSTEM-SOURCED (from Student + the current Enrollment), so a later profile change
 * cannot rewrite an issued certificate (the ADR-014 snapshot philosophy). No file is
 * rendered in v1 (metadata-only); `storagePath` stays null. Admin-only. Audited.
 */
export async function generateDocument(
  ctx: ServiceContext,
  input: GenerateDocumentInput,
): Promise<DocumentDto> {
  assertCan(ctx.user, PERMISSIONS.DOCUMENT_MANAGE);
  const student = await loadStudentInSchool(ctx, input.studentId);
  if (input.templateId) {
    const tpl = await loadTemplateInSchool(ctx, input.templateId);
    if (tpl.type !== input.type) {
      throw new ValidationError("Template type does not match the document type");
    }
    if (!tpl.active) {
      throw new ConflictError("Cannot generate from an inactive template");
    }
  }

  // System-sourced placement, frozen at generate (ADR-023 §3 — driftable values only).
  const enr = await currentEnrollment(ctx, input.studentId);
  let className: string | null = null;
  let sectionName: string | null = null;
  let yearName: string | null = null;
  if (enr) {
    const [section, klass, year] = await Promise.all([
      enr.sectionId ? ctx.repositories.sections.findById(enr.sectionId) : Promise.resolve(null),
      ctx.repositories.classes.findById(enr.classId),
      ctx.repositories.academicYears.findById(enr.academicYearId),
    ]);
    sectionName = section?.name ?? null;
    className = klass?.name ?? null;
    yearName = year?.name ?? null;
  }

  const snapshot: DocumentSnapshot = {
    studentName: `${student.firstName} ${student.lastName}`,
    admissionNo: student.admissionNo,
    class: className,
    section: sectionName,
    academicYear: yearName,
    issuedOn: istToday(),
    ...(input.fields ? { fields: input.fields } : {}),
  };

  const created = await ctx.withTransaction(async (repos) => {
    const row = await repos.documents.create({
      schoolId: ctx.user.schoolId,
      studentId: input.studentId,
      type: input.type as DocumentType,
      status: "GENERATED",
      templateId: input.templateId ?? null,
      snapshotJson: snapshot as unknown as Record<string, string>,
      generatedByUserId: ctx.user.userId,
    });
    await recordAudit(ctx, repos, {
      action: "DOCUMENT_GENERATE",
      entityType: "Document",
      entityId: row.id,
      after: { type: row.type, studentId: row.studentId },
    });
    return row;
  });
  return mapDocument(created);
}

// ---------------------------------------------------------------------------
// Upload (office uploads a prepared file — ADR-023 §3, the fully-working v1 path)
// ---------------------------------------------------------------------------

export interface DocumentUploadUrlInput {
  studentId: string;
  fileName: string;
}

export interface DocumentUploadUrlResult {
  /** Private-bucket path to pass back to {@link createUploadedDocument} after upload. */
  storagePath: string;
  signedUrl: string;
  token: string;
}

/**
 * Mint a one-time signed UPLOAD URL for a document file. Manage permission + tenant
 * check first; the path is namespaced server-side (`schoolId/studentId/uuid-fileName`,
 * ADR-004) so a client can never choose or overwrite another school's object.
 * (Distinct from M3's `mintDocumentUploadUrl` for student KYC docs — separate bucket.)
 */
export async function documentUploadUrl(
  ctx: ServiceContext,
  storage: StoragePort,
  input: DocumentUploadUrlInput,
): Promise<DocumentUploadUrlResult> {
  assertCan(ctx.user, PERMISSIONS.DOCUMENT_MANAGE);
  await loadStudentInSchool(ctx, input.studentId);
  const safeName = input.fileName.replace(/[^\w.-]+/g, "_").slice(-100);
  const storagePath = `${ctx.user.schoolId}/${input.studentId}/${crypto.randomUUID()}-${safeName}`;
  const { signedUrl, token } = await storage.createSignedUploadUrl(
    STORAGE_BUCKETS.DOCUMENTS,
    storagePath,
  );
  return { storagePath, signedUrl, token };
}

export interface CreateUploadedDocumentInput {
  studentId: string;
  type: DocumentTypeKey;
  storagePath: string;
  fileName: string;
  mimeType?: string | undefined;
  sizeBytes?: number | undefined;
}

/** Record an UPLOADED document after its file has been put to the signed URL. Admin-only. Audited. */
export async function createUploadedDocument(
  ctx: ServiceContext,
  input: CreateUploadedDocumentInput,
): Promise<DocumentDto> {
  assertCan(ctx.user, PERMISSIONS.DOCUMENT_MANAGE);
  await loadStudentInSchool(ctx, input.studentId);

  const created = await ctx.withTransaction(async (repos) => {
    const row = await repos.documents.create({
      schoolId: ctx.user.schoolId,
      studentId: input.studentId,
      type: input.type as DocumentType,
      status: "UPLOADED",
      storagePath: input.storagePath,
      fileName: input.fileName,
      mimeType: input.mimeType ?? null,
      sizeBytes: input.sizeBytes ?? null,
      uploadedByUserId: ctx.user.userId,
    });
    await recordAudit(ctx, repos, {
      action: "DOCUMENT_UPLOAD",
      entityType: "Document",
      entityId: row.id,
      after: { type: row.type, studentId: row.studentId },
    });
    return row;
  });
  return mapDocument(created);
}

// ---------------------------------------------------------------------------
// Lifecycle — approve / archive / delete draft
// ---------------------------------------------------------------------------

/** Approve a draft (GENERATED/UPLOADED) → APPROVED — the visibility gate (ADR-023 §5/§6). Audited. */
export async function approveDocument(ctx: ServiceContext, id: string): Promise<DocumentDto> {
  assertCan(ctx.user, PERMISSIONS.DOCUMENT_APPROVE);
  const doc = await loadDocumentInSchool(ctx, id);
  if (!DRAFT_STATUSES.includes(doc.status)) {
    throw new ConflictError("Only a draft document can be approved");
  }
  const approved = await ctx.withTransaction(async (repos) => {
    const row = await repos.documents.update(id, {
      status: "APPROVED",
      approvedByUserId: ctx.user.userId,
      approvedAt: new Date(),
    });
    await recordAudit(ctx, repos, {
      action: "DOCUMENT_APPROVE",
      entityType: "Document",
      entityId: id,
      before: { status: doc.status },
      after: { status: row.status },
    });
    return row;
  });
  return mapDocument(approved);
}

/** Archive an APPROVED document (soft-retire, terminal — ADR-023 §5). Admin-only. Audited. */
export async function archiveDocument(ctx: ServiceContext, id: string): Promise<DocumentDto> {
  assertCan(ctx.user, PERMISSIONS.DOCUMENT_MANAGE);
  const doc = await loadDocumentInSchool(ctx, id);
  if (doc.status !== "APPROVED") {
    throw new ConflictError("Only an approved document can be archived");
  }
  const archived = await ctx.withTransaction(async (repos) => {
    const row = await repos.documents.update(id, { status: "ARCHIVED", archivedAt: new Date() });
    await recordAudit(ctx, repos, {
      action: "DOCUMENT_ARCHIVE",
      entityType: "Document",
      entityId: id,
      before: { status: doc.status },
      after: { status: row.status },
    });
    return row;
  });
  return mapDocument(archived);
}

/**
 * Hard-delete a DRAFT document (GENERATED/UPLOADED only — ADR-023 §5). Approved/archived
 * docs carry issued-record value and are never deleted. Admin-only. Audited.
 * ponytail: an UPLOADED draft's bucket object is left orphaned — StoragePort has no
 * delete; add StoragePort.deleteObject if orphan cleanup ever matters (drafts are rare).
 */
export async function deleteDraftDocument(ctx: ServiceContext, id: string): Promise<void> {
  assertCan(ctx.user, PERMISSIONS.DOCUMENT_MANAGE);
  const doc = await loadDocumentInSchool(ctx, id);
  if (!DRAFT_STATUSES.includes(doc.status)) {
    throw new ConflictError("Only a draft document can be deleted");
  }
  await ctx.withTransaction(async (repos) => {
    await repos.documents.delete(id);
    await recordAudit(ctx, repos, {
      action: "DOCUMENT_DELETE",
      entityType: "Document",
      entityId: id,
      before: { type: doc.type, status: doc.status },
    });
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Mint a short-lived (60s) signed READ URL for a document (ADR-023 §1). Full read-side
 * authz first: permission, tenant, scope, and the APPROVED-only gate for non-admins —
 * before any URL exists. A metadata-only GENERATED doc (no file yet) is a clear conflict.
 */
export async function documentDownloadUrl(
  ctx: ServiceContext,
  storage: StoragePort,
  id: string,
): Promise<{ url: string; fileName: string }> {
  assertCan(ctx.user, PERMISSIONS.DOCUMENT_READ);
  const doc = await loadDocumentInSchool(ctx, id);
  if (!isFullAccess(ctx)) {
    const student = await loadStudentInSchool(ctx, doc.studentId);
    await assertStudentInScope(ctx, student);
    if (doc.status !== "APPROVED") {
      // Don't leak a draft/archived doc's existence to a non-admin reader.
      throw new ConflictError("Document not available");
    }
  }
  if (!doc.storagePath) {
    throw new ConflictError("This document has no downloadable file yet");
  }
  const url = await storage.createSignedDownloadUrl(
    STORAGE_BUCKETS.DOCUMENTS,
    doc.storagePath,
    DOWNLOAD_URL_TTL_SECONDS,
  );
  return { url, fileName: doc.fileName ?? "document" };
}

export interface ListDocumentsInput {
  studentId?: string | undefined;
  type?: DocumentTypeKey | undefined;
  status?: DocumentStatus | undefined;
  limit?: number | undefined;
}

/** The admin document CONSOLE (ADR-023 §6) — school-wide, filterable. Admin-only (document:manage). */
export async function listSchoolDocuments(
  ctx: ServiceContext,
  input: ListDocumentsInput = {},
): Promise<DocumentDto[]> {
  assertCan(ctx.user, PERMISSIONS.DOCUMENT_MANAGE);
  const rows = await ctx.repositories.documents.list(ctx.user.schoolId, {
    limit: Math.min(Math.max(input.limit ?? 100, 1), 200),
    ...(input.studentId ? { studentId: input.studentId } : {}),
    ...(input.type ? { type: input.type as DocumentType } : {}),
    ...(input.status ? { status: input.status } : {}),
  });
  return rows.map(mapDocument);
}

export interface ListStudentDocumentsInput {
  type?: DocumentTypeKey | undefined;
  status?: DocumentStatus | undefined;
}

/**
 * A student's documents (ADR-023 §6) — admin: all; teacher (own-section) / parent
 * (own-child): APPROVED only. The status narrowing for non-admins is forced here
 * (RLS is the coarser belt-and-braces).
 */
export async function listStudentDocuments(
  ctx: ServiceContext,
  studentId: string,
  input: ListStudentDocumentsInput = {},
): Promise<DocumentDto[]> {
  assertCan(ctx.user, PERMISSIONS.DOCUMENT_READ);
  const student = await loadStudentInSchool(ctx, studentId);
  const full = isFullAccess(ctx);
  if (!full) {
    await assertStudentInScope(ctx, student);
  }
  const rows = await ctx.repositories.documents.listByStudent(studentId, {
    ...(input.type ? { type: input.type as DocumentType } : {}),
    // non-admins: APPROVED only, always (ignore any requested status).
    ...(full ? (input.status ? { status: input.status } : {}) : { status: "APPROVED" }),
  });
  return rows.map(mapDocument);
}
