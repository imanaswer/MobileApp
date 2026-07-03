import { createRepositories, prisma, type Repositories } from "@repo/db";

/**
 * Composition root for repositories — the ONLY place they are wired to the Prisma
 * singleton. `business` is the only layer permitted to import `@repo/db`, so it
 * owns this. A composition root, NOT a service locator: `createRepositories` is a
 * pure DI factory; there is no dynamic key lookup or ambient mutable registry.
 *
 * Per-request services receive `repositories` via `ServiceContext` (DI). Only the
 * pre-context auth bootstrap (`resolvePrincipal`, `activateUser`) reads it
 * directly — it BUILDS the `Principal` a `ServiceContext` carries.
 */
export const repositories: Repositories = createRepositories(prisma);
