import { PERMISSIONS } from "@repo/constants";
import { ForbiddenError, NotFoundError } from "@repo/core";
import type { StudentDocument } from "@repo/db";
import type { StudentDocumentDto, StudentDocumentTypeKey } from "@repo/types";

import type { Principal } from "../../authorization";
import { assertCan } from "../../authorization";
import type { ServiceContext } from "../../context";

import { mapStudentDocument } from "./mappers";
import { assertStudentInScope, loadStudentInSchool, recordAudit } from "./scope";

/**
 * DOCUMENT VISIBILITY (business-layer authorization; RLS is unchanged). Teachers
 * see ONLY these types; admins and a child's own parent see everything. Single
 * source of truth — widen the set here to change the rule.
 * See docs/PERMISSIONS_MATRIX.md "Student document visibility".
 */
const TEACHER_VISIBLE_TYPES: ReadonlySet<StudentDocumentTypeKey> = new Set(["PHOTO"]);

/**
 * Whether a principal may see a document of this type. TEACHERS are limited to
 * {@link TEACHER_VISIBLE_TYPES}; everyone else who reaches the row (admins,
 * own-child parents — WHO is already enforced by scope/RLS) sees all types.
 *
 * ponytail: the future signed-URL mint path (Step 6/8) MUST call this before
 * returning a URL, or a teacher could pull a hidden type (e.g. Aadhaar) by id.
 */
export function assertDocumentTypeVisible(
  principal: Principal,
  type: StudentDocumentTypeKey,
): void {
  if (principal.role === "TEACHER" && !TEACHER_VISIBLE_TYPES.has(type)) {
    throw new ForbiddenError("Not permitted to view this document type");
  }
}

export interface UploadDocumentInput {
  studentId: string;
  type: StudentDocumentTypeKey;
  storagePath: string;
  fileName: string;
  mimeType?: string | undefined;
  sizeBytes?: number | undefined;
  checksum?: string | undefined;
}

export interface ReplaceDocumentInput {
  storagePath: string;
  fileName: string;
  mimeType?: string | undefined;
  sizeBytes?: number | undefined;
  checksum?: string | undefined;
}

/** List a student's documents, filtered to the types the actor may see. */
export async function listDocuments(
  ctx: ServiceContext,
  studentId: string,
): Promise<StudentDocumentDto[]> {
  assertCan(ctx.user, PERMISSIONS.STUDENT_DOCUMENT_READ);
  const student = await loadStudentInSchool(ctx, studentId);
  await assertStudentInScope(ctx, student);

  const rows = await ctx.repositories.studentDocuments.listByStudent(studentId);
  return rows
    .filter((r) => canSeeType(ctx.user, r.type))
    .map(mapStudentDocument);
}

export async function getDocument(ctx: ServiceContext, id: string): Promise<StudentDocumentDto> {
  assertCan(ctx.user, PERMISSIONS.STUDENT_DOCUMENT_READ);
  const doc = await loadDocumentInSchool(ctx, id);
  const student = await loadStudentInSchool(ctx, doc.studentId);
  await assertStudentInScope(ctx, student);
  assertDocumentTypeVisible(ctx.user, doc.type);
  return mapStudentDocument(doc);
}

export async function uploadDocument(
  ctx: ServiceContext,
  input: UploadDocumentInput,
): Promise<StudentDocumentDto> {
  assertCan(ctx.user, PERMISSIONS.STUDENT_DOCUMENT_MANAGE);
  await loadStudentInSchool(ctx, input.studentId);

  return ctx.withTransaction(async (repos) => {
    const created = await repos.studentDocuments.create({
      schoolId: ctx.user.schoolId,
      studentId: input.studentId,
      type: input.type,
      storagePath: input.storagePath,
      fileName: input.fileName,
      ...(input.mimeType !== undefined ? { mimeType: input.mimeType } : {}),
      ...(input.sizeBytes !== undefined ? { sizeBytes: input.sizeBytes } : {}),
      ...(input.checksum !== undefined ? { checksum: input.checksum } : {}),
      uploadedByUserId: ctx.user.userId,
    });
    await recordAudit(ctx, repos, {
      action: "STUDENT_DOCUMENT_UPLOAD",
      entityType: "StudentDocument",
      entityId: created.id,
      after: { studentId: created.studentId, type: created.type, version: created.version },
    });
    return mapStudentDocument(created);
  });
}

/** Replace a document's file, bumping the version (versioning-ready metadata). */
export async function replaceDocument(
  ctx: ServiceContext,
  id: string,
  input: ReplaceDocumentInput,
): Promise<StudentDocumentDto> {
  assertCan(ctx.user, PERMISSIONS.STUDENT_DOCUMENT_MANAGE);
  const before = await loadDocumentInSchool(ctx, id);

  return ctx.withTransaction(async (repos) => {
    const after = await repos.studentDocuments.update(id, {
      storagePath: input.storagePath,
      fileName: input.fileName,
      mimeType: input.mimeType ?? null,
      sizeBytes: input.sizeBytes ?? null,
      checksum: input.checksum ?? null,
      version: before.version + 1,
      uploadedByUserId: ctx.user.userId,
    });
    await recordAudit(ctx, repos, {
      action: "STUDENT_DOCUMENT_REPLACE",
      entityType: "StudentDocument",
      entityId: id,
      before: { version: before.version },
      after: { version: after.version },
    });
    return mapStudentDocument(after);
  });
}

export async function deleteDocument(ctx: ServiceContext, id: string): Promise<void> {
  assertCan(ctx.user, PERMISSIONS.STUDENT_DOCUMENT_MANAGE);
  const before = await loadDocumentInSchool(ctx, id);
  await ctx.withTransaction(async (repos) => {
    await repos.studentDocuments.delete(id);
    await recordAudit(ctx, repos, {
      action: "STUDENT_DOCUMENT_DELETE",
      entityType: "StudentDocument",
      entityId: id,
      before: { studentId: before.studentId, type: before.type },
    });
  });
}

function canSeeType(principal: Principal, type: StudentDocumentTypeKey): boolean {
  return principal.role !== "TEACHER" || TEACHER_VISIBLE_TYPES.has(type);
}

async function loadDocumentInSchool(ctx: ServiceContext, id: string): Promise<StudentDocument> {
  const doc = await ctx.repositories.studentDocuments.findById(id);
  if (!doc || doc.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Document not found");
  }
  return doc;
}
