import { prisma } from "./client";
import type { DbClient } from "./db-client";
import { createAuditLogRepository, type AuditLogRepository } from "./repositories/audit.repository";
import { createUserRepository, type UserRepository } from "./repositories/user.repository";

/**
 * Repository composition (ADR-003). `createRepositories` is a pure DI factory —
 * given a client, it builds the repository set — NOT a global service locator.
 * The composition root (`@repo/business`) calls it once with the Prisma singleton;
 * `withTransaction` calls it per-transaction with the transaction client.
 */
export * from "./repositories/user.repository";
export * from "./repositories/audit.repository";
export * from "./repositories/school.repository";
export type { DbClient } from "./db-client";

/** Aggregate of repositories injected into services via `ServiceContext`. */
export interface Repositories {
  users: UserRepository;
  audit: AuditLogRepository;
}

export function createRepositories(client: DbClient): Repositories {
  return {
    users: createUserRepository(client),
    audit: createAuditLogRepository(client),
  };
}

/**
 * Unit of work: run `fn` inside a single DB transaction with repositories bound
 * to the transaction client, so a mutation and its `AuditLog` row commit
 * atomically (DATABASE_CONVENTIONS §11). No Prisma is exposed outside `db`.
 */
export function withTransaction<T>(fn: (repos: Repositories) => Promise<T>): Promise<T> {
  return prisma.$transaction((tx) => fn(createRepositories(tx)));
}
