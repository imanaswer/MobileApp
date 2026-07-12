import { PERMISSIONS } from "@repo/constants";
import type { DocumentType } from "@repo/db";
import type { DocumentTemplateDto, DocumentTypeKey } from "@repo/types";

import { assertCan } from "../../authorization";
import type { ServiceContext } from "../../context";

import { mapTemplate } from "./mappers";
import { loadTemplateInSchool, recordAudit } from "./scope";

export interface CreateTemplateInput {
  type: DocumentTypeKey;
  name: string;
}

/** Create a certificate template (ADR-023 §4). Admin-only. Audited. */
export async function createTemplate(
  ctx: ServiceContext,
  input: CreateTemplateInput,
): Promise<DocumentTemplateDto> {
  assertCan(ctx.user, PERMISSIONS.DOCUMENT_MANAGE);
  const created = await ctx.withTransaction(async (repos) => {
    const row = await repos.documentTemplates.create({
      schoolId: ctx.user.schoolId,
      type: input.type as DocumentType,
      name: input.name,
    });
    await recordAudit(ctx, repos, {
      action: "DOCUMENT_TEMPLATE_CREATE",
      entityType: "DocumentTemplate",
      entityId: row.id,
      after: { type: row.type, name: row.name },
    });
    return row;
  });
  return mapTemplate(created);
}

export interface UpdateTemplateInput {
  name?: string | undefined;
  active?: boolean | undefined;
}

/** Rename / (de)activate a template (ADR-023 §4). Admin-only. Audited. */
export async function updateTemplate(
  ctx: ServiceContext,
  id: string,
  input: UpdateTemplateInput,
): Promise<DocumentTemplateDto> {
  assertCan(ctx.user, PERMISSIONS.DOCUMENT_MANAGE);
  await loadTemplateInSchool(ctx, id);
  const updated = await ctx.withTransaction(async (repos) => {
    const row = await repos.documentTemplates.update(id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    });
    await recordAudit(ctx, repos, {
      action: "DOCUMENT_TEMPLATE_UPDATE",
      entityType: "DocumentTemplate",
      entityId: id,
      after: { name: row.name, active: row.active },
    });
    return row;
  });
  return mapTemplate(updated);
}

/** List templates (ADR-023 §4) — the admin picker. Admin-only. */
export async function listTemplates(
  ctx: ServiceContext,
  filter: { type?: DocumentTypeKey | undefined; active?: boolean | undefined } = {},
): Promise<DocumentTemplateDto[]> {
  assertCan(ctx.user, PERMISSIONS.DOCUMENT_MANAGE);
  const rows = await ctx.repositories.documentTemplates.list(ctx.user.schoolId, {
    ...(filter.type ? { type: filter.type as DocumentType } : {}),
    ...(filter.active !== undefined ? { active: filter.active } : {}),
  });
  return rows.map(mapTemplate);
}
