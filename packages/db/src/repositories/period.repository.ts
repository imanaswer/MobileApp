import type { Period } from "@prisma/client";

import type { DbClient } from "../db-client";

export type { Period };

export interface CreatePeriodInput {
  schoolId: string;
  bellScheduleId: string;
  name: string;
  order: number;
  startTime: Date; // @db.Time — a JS Date whose time-of-day is the clock time
  endTime: Date;
  isBreak: boolean;
}

export interface UpdatePeriodInput {
  name?: string;
  order?: number;
  startTime?: Date;
  endTime?: Date;
  isBreak?: boolean;
}

/**
 * Persistence for `Period` (ADR-003, ADR-017). No authorization/business rules.
 * `order` is unique within a bell schedule (DB); `listBySchedule` returns the
 * ordered sequence. Overlap validation lives in the service (ADR-017 §2).
 */
export interface PeriodRepository {
  findById(id: string): Promise<Period | null>;
  /** Periods of a bell schedule in `order` sequence. */
  listBySchedule(bellScheduleId: string): Promise<Period[]>;
  create(input: CreatePeriodInput): Promise<Period>;
  update(id: string, input: UpdatePeriodInput): Promise<Period>;
  delete(id: string): Promise<void>;
}

export function createPeriodRepository(client: DbClient): PeriodRepository {
  return {
    findById: (id) => client.period.findUnique({ where: { id } }),
    listBySchedule: (bellScheduleId) =>
      client.period.findMany({ where: { bellScheduleId }, orderBy: { order: "asc" } }),
    create: (input) => client.period.create({ data: input }),
    update: (id, input) => client.period.update({ where: { id }, data: input }),
    delete: async (id) => {
      await client.period.delete({ where: { id } });
    },
  };
}
