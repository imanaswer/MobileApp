import type { CalendarEventType, Prisma, SchoolCalendarEvent } from "@prisma/client";

import type { DbClient } from "../db-client";

export type { CalendarEventType, SchoolCalendarEvent };

export interface CreateCalendarEventInput {
  schoolId: string;
  academicYearId: string;
  title: string;
  description?: string | null;
  eventType: CalendarEventType;
  startDate: Date;
  endDate: Date;
  isAllDay?: boolean;
  createdByStaffId: string;
}

export interface UpdateCalendarEventInput {
  title?: string;
  description?: string | null;
  eventType?: CalendarEventType;
  startDate?: Date;
  endDate?: Date;
  isAllDay?: boolean;
}

/**
 * Date-range filter (all optional). `startsOnOrBefore` + `endsOnOrAfter` together
 * express overlap with a window (month / arbitrary range); `endsOnOrAfter` alone =
 * "upcoming or ongoing" (ADR-019 §1).
 */
export interface ListCalendarEventsFilter {
  academicYearId?: string;
  eventType?: CalendarEventType;
  startsOnOrBefore?: Date;
  endsOnOrAfter?: Date;
  limit?: number;
}

/**
 * Persistence for `SchoolCalendarEvent` (ADR-003, ADR-019 §1). No authorization;
 * the business layer gates writes (academic:manage) and reads (calendar:read).
 * The calendar is school-wide — no per-user targeting.
 */
export interface CalendarEventRepository {
  create(input: CreateCalendarEventInput): Promise<SchoolCalendarEvent>;
  findById(id: string): Promise<SchoolCalendarEvent | null>;
  list(schoolId: string, filter: ListCalendarEventsFilter): Promise<SchoolCalendarEvent[]>;
  update(id: string, input: UpdateCalendarEventInput): Promise<SchoolCalendarEvent>;
  delete(id: string): Promise<void>;
}

export function createCalendarEventRepository(client: DbClient): CalendarEventRepository {
  return {
    create: (input) =>
      client.schoolCalendarEvent.create({
        data: {
          schoolId: input.schoolId,
          academicYearId: input.academicYearId,
          title: input.title,
          description: input.description ?? null,
          eventType: input.eventType,
          startDate: input.startDate,
          endDate: input.endDate,
          isAllDay: input.isAllDay ?? true,
          createdByStaffId: input.createdByStaffId,
        },
      }),

    findById: (id) => client.schoolCalendarEvent.findUnique({ where: { id } }),

    list: (schoolId, filter) => {
      const where: Prisma.SchoolCalendarEventWhereInput = { schoolId };
      if (filter.academicYearId) {
        where.academicYearId = filter.academicYearId;
      }
      if (filter.eventType) {
        where.eventType = filter.eventType;
      }
      if (filter.startsOnOrBefore) {
        where.startDate = { lte: filter.startsOnOrBefore };
      }
      if (filter.endsOnOrAfter) {
        where.endDate = { gte: filter.endsOnOrAfter };
      }
      return client.schoolCalendarEvent.findMany({
        where,
        orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
        ...(filter.limit ? { take: filter.limit } : {}),
      });
    },

    update: (id, input) =>
      client.schoolCalendarEvent.update({
        where: { id },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.eventType !== undefined ? { eventType: input.eventType } : {}),
          ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
          ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
          ...(input.isAllDay !== undefined ? { isAllDay: input.isAllDay } : {}),
        },
      }),

    delete: async (id) => {
      await client.schoolCalendarEvent.delete({ where: { id } });
    },
  };
}
