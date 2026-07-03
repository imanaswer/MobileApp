/**
 * @repo/core — pure, framework-agnostic domain logic ONLY (no Prisma, no tRPC,
 * no React). Feature rules (grade calc, attendance %, promotion) land here in
 * later milestones. M0 ships only the domain-error primitive. ADR-002/003.
 */

/**
 * Base class for domain rule violations. The API layer maps these to tRPC
 * errors (API_CONVENTIONS.md §6). Carries a stable, machine-readable `code`.
 */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "DomainError";
  }
}

/** Authentication failure — no valid/active principal. Maps to tRPC UNAUTHORIZED. */
export class UnauthorizedError extends DomainError {
  constructor(message = "Not authenticated", options?: { cause?: unknown }) {
    super("UNAUTHORIZED", message, options);
    this.name = "UnauthorizedError";
  }
}

/** Authorization failure — authenticated but not permitted. Maps to tRPC FORBIDDEN. */
export class ForbiddenError extends DomainError {
  constructor(message = "Forbidden", options?: { cause?: unknown }) {
    super("FORBIDDEN", message, options);
    this.name = "ForbiddenError";
  }
}

/** The requested entity does not exist. Maps to tRPC NOT_FOUND. */
export class NotFoundError extends DomainError {
  constructor(message = "Not found", options?: { cause?: unknown }) {
    super("NOT_FOUND", message, options);
    this.name = "NotFoundError";
  }
}

export { can, canAny, canAll, getPermissions } from "./authorization";
