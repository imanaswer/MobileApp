import {
  createCalendarEvent,
  createServiceContext,
  deleteCalendarEvent,
  getCalendarEvent,
  listCalendarMonth,
  listCalendarRange,
  listUpcomingCalendar,
  updateCalendarEvent,
} from "@repo/business";
import {
  createCalendarEventInput,
  idInput,
  listCalendarMonthInput,
  listCalendarRangeInput,
  listUpcomingCalendarInput,
  updateCalendarEventInput,
} from "@repo/validation";

import { protectedProcedure, router } from "../trpc";

/**
 * School-calendar procedures (M11, ADR-019). Thin transport only — validate then
 * delegate. Writes gate on academic:manage (admin); reads on calendar:read (all
 * in-scope roles). The calendar is school-wide (no per-user targeting). Every
 * mutation writes AuditLog in-transaction. No logic, no role strings, no Prisma.
 */
export const calendarRouter = router({
  /* ---- reads (calendar:read) ---- */
  get: protectedProcedure
    .input(idInput)
    .query(({ ctx, input }) => getCalendarEvent(createServiceContext(ctx.user), input.id)),
  /** Events overlapping a month (month view). */
  month: protectedProcedure.input(listCalendarMonthInput).query(({ ctx, input }) =>
    listCalendarMonth(createServiceContext(ctx.user), input.year, input.month, {
      academicYearId: input.academicYearId,
      eventType: input.eventType,
    }),
  ),
  /** Events overlapping an arbitrary [from, to] range. */
  range: protectedProcedure.input(listCalendarRangeInput).query(({ ctx, input }) =>
    listCalendarRange(createServiceContext(ctx.user), input.from, input.to, {
      academicYearId: input.academicYearId,
      eventType: input.eventType,
    }),
  ),
  /** Upcoming/ongoing events, soonest first. */
  upcoming: protectedProcedure.input(listUpcomingCalendarInput).query(({ ctx, input }) =>
    listUpcomingCalendar(createServiceContext(ctx.user), input.limit, {
      academicYearId: input.academicYearId,
      eventType: input.eventType,
    }),
  ),

  /* ---- writes (academic:manage) ---- */
  create: protectedProcedure
    .input(createCalendarEventInput)
    .mutation(({ ctx, input }) => createCalendarEvent(createServiceContext(ctx.user), input)),
  update: protectedProcedure.input(updateCalendarEventInput).mutation(({ ctx, input }) => {
    const { id, ...rest } = input;
    return updateCalendarEvent(createServiceContext(ctx.user), id, rest);
  }),
  delete: protectedProcedure
    .input(idInput)
    .mutation(({ ctx, input }) => deleteCalendarEvent(createServiceContext(ctx.user), input.id)),
});
