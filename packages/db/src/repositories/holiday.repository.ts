import type { Holiday } from "@prisma/client";

import type { DbClient } from "../db-client";

export type { Holiday };

export type HolidayTypeKey = "NATIONAL" | "SCHOOL" | "FESTIVAL" | "EMERGENCY_CLOSURE";

export interface CreateHolidayInput {
  schoolId: string;
  academicYearId: string;
  date: Date;
  name: string;
  type: HolidayTypeKey;
}

export interface UpdateHolidayInput {
  name?: string | undefined;
  type?: HolidayTypeKey | undefined;
}

/** Persistence for `Holiday` (ADR-003, ADR-011). No authorization/business rules. */
export interface HolidayRepository {
  findById(id: string): Promise<Holiday | null>;
  findByYearAndDate(academicYearId: string, date: Date): Promise<Holiday | null>;
  listByYear(academicYearId: string): Promise<Holiday[]>;
  /** Holiday dates within [from, to] for a year (school-day resolution). */
  listDatesInRange(academicYearId: string, from: Date, to: Date): Promise<Date[]>;
  create(input: CreateHolidayInput): Promise<Holiday>;
  update(id: string, data: UpdateHolidayInput): Promise<Holiday>;
  delete(id: string): Promise<void>;
}

export function createHolidayRepository(client: DbClient): HolidayRepository {
  return {
    findById: (id) => client.holiday.findUnique({ where: { id } }),
    findByYearAndDate: (academicYearId, date) =>
      client.holiday.findUnique({
        where: { academicYearId_date: { academicYearId, date } },
      }),
    listByYear: (academicYearId) =>
      client.holiday.findMany({ where: { academicYearId }, orderBy: { date: "asc" } }),
    listDatesInRange: async (academicYearId, from, to) => {
      const rows = await client.holiday.findMany({
        where: { academicYearId, date: { gte: from, lte: to } },
        select: { date: true },
        orderBy: { date: "asc" },
      });
      return rows.map((r) => r.date);
    },
    create: (input) => client.holiday.create({ data: input }),
    update: (id, data) =>
      client.holiday.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.type !== undefined ? { type: data.type } : {}),
        },
      }),
    delete: async (id) => {
      await client.holiday.delete({ where: { id } });
    },
  };
}
