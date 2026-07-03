/**
 * @repo/validation — shared Zod schemas reused by tRPC inputs, RHF forms, and
 * import validation (DRY — CODING_STANDARDS.md §6, API_CONVENTIONS.md §3/§8).
 * Feature schemas land here per milestone; M0 ships reusable primitives only.
 */
import { DEFAULT_PAGE_SIZE, LOCALES, MAX_PAGE_SIZE, ROLES } from "@repo/constants";
import { z } from "zod";

export { z };

/** A CUID identifier (Prisma default id format). */
export const idSchema = z.string().min(1);

/** UI locale. */
export const localeSchema = z.enum(LOCALES);

/** Cursor pagination input (the default — API_CONVENTIONS.md §8). */
export const cursorPaginationInput = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type CursorPaginationInput = z.infer<typeof cursorPaginationInput>;

/** Sort direction. */
export const sortDirSchema = z.enum(["asc", "desc"]).default("asc");

/** Role (matches the fixed ROLES set). */
export const roleSchema = z.enum(ROLES);

/* ---- auth inputs (Step 5/6 procedures) ---- */

/** `auth.updateProfile` — own non-credential fields (M1: locale). */
export const updateProfileInput = z.object({ locale: localeSchema });
export type UpdateProfileInput = z.infer<typeof updateProfileInput>;

/** `auth.setRole` — admin changes another user's role. */
export const setRoleInput = z.object({ userId: idSchema, role: roleSchema });
export type SetRoleInput = z.infer<typeof setRoleInput>;

/** A single target user id (`auth.disableUser` / `auth.enableUser`). */
export const userIdInput = z.object({ userId: idSchema });
export type UserIdInput = z.infer<typeof userIdInput>;
