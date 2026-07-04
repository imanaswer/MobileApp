import type { School } from "@prisma/client";

import type { DbClient } from "../db-client";

export type { School };

/**
 * Data-access for `School`. Single-tenant in M1+ (ADR-008): one row, created by
 * the bootstrap seed. Standalone (not part of the `Repositories` aggregate) —
 * only ops tooling needs it until multi-school features land.
 */
export interface SchoolRepository {
  findFirst(): Promise<School | null>;
  create(input: { name: string; defaultLocale?: School["defaultLocale"] }): Promise<School>;
}

export function createSchoolRepository(client: DbClient): SchoolRepository {
  return {
    findFirst: () => client.school.findFirst(),
    create: (input) => client.school.create({ data: input }),
  };
}
