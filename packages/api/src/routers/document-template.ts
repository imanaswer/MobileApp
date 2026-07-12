import {
  createServiceContext,
  createTemplate,
  listTemplates,
  updateTemplate,
} from "@repo/business";
import {
  createDocumentTemplateInput,
  listDocumentTemplatesInput,
  updateDocumentTemplateInput,
} from "@repo/validation";

import { protectedProcedure, router } from "../trpc";

/**
 * Document template procedures (M15, ADR-023 §4). Thin transport — validate then
 * delegate; the service enforces document:manage (admin-only) and in-tx audit.
 * Minimal in v1: templates label/enable which certificate types the office may
 * generate (the reserved renderer body is not authored yet).
 */
export const documentTemplateRouter = router({
  list: protectedProcedure
    .input(listDocumentTemplatesInput)
    .query(({ ctx, input }) => listTemplates(createServiceContext(ctx.user), input)),
  create: protectedProcedure
    .input(createDocumentTemplateInput)
    .mutation(({ ctx, input }) => createTemplate(createServiceContext(ctx.user), input)),
  update: protectedProcedure.input(updateDocumentTemplateInput).mutation(({ ctx, input }) => {
    const { id, ...rest } = input;
    return updateTemplate(createServiceContext(ctx.user), id, rest);
  }),
});
