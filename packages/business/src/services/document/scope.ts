import { NotFoundError } from "@repo/core";
import type { Document, DocumentTemplate } from "@repo/db";

import type { ServiceContext } from "../../context";

export {
  recordAudit,
  isFullAccess,
  loadStudentInSchool,
  assertStudentInScope,
} from "../people/scope";
export { currentEnrollment } from "../analytics/scope";

/** Load a document, enforcing tenant ownership (404 if missing / other-school). */
export async function loadDocumentInSchool(ctx: ServiceContext, id: string): Promise<Document> {
  const doc = await ctx.repositories.documents.findById(id);
  if (!doc || doc.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Document not found");
  }
  return doc;
}

/** Load a document template, enforcing tenant ownership (404 if missing / other-school). */
export async function loadTemplateInSchool(
  ctx: ServiceContext,
  id: string,
): Promise<DocumentTemplate> {
  const tpl = await ctx.repositories.documentTemplates.findById(id);
  if (!tpl || tpl.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Document template not found");
  }
  return tpl;
}
