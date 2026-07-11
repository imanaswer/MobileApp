import { ForbiddenError, NotFoundError, ValidationError } from "@repo/core";
import type { Repositories, SchoolCalendarEvent, Staff } from "@repo/db";
import { createNotificationService } from "@repo/notifications";
import { describe, expect, it, vi } from "vitest";

import type { Principal } from "../../authorization";
import type { ServiceContext } from "../../context";

import {
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendarEvent,
  listUpcomingCalendar,
  updateCalendarEvent,
} from "./calendar.service";

const admin: Principal = {
  userId: "u-admin",
  schoolId: "s-1",
  role: "OFFICE_ADMIN",
  status: "ACTIVE",
};
const teacher: Principal = {
  userId: "u-teacher",
  schoolId: "s-1",
  role: "TEACHER",
  status: "ACTIVE",
};
const parent: Principal = { userId: "u-parent", schoolId: "s-1", role: "PARENT", status: "ACTIVE" };

const d = new Date("2026-01-02T00:00:00.000Z");
const event: SchoolCalendarEvent = {
  id: "ev-1",
  schoolId: "s-1",
  academicYearId: "y-1",
  title: "Diwali",
  description: null,
  eventType: "HOLIDAY",
  startDate: new Date("2026-11-08T00:00:00.000Z"),
  endDate: new Date("2026-11-10T00:00:00.000Z"),
  isAllDay: true,
  createdByStaffId: "stf-admin",
  createdAt: d,
  updatedAt: d,
};

function makeRepos() {
  return {
    audit: { record: vi.fn(async (): Promise<void> => undefined) },
    calendarEvents: {
      create: vi.fn(async () => event),
      findById: vi.fn(async () => event),
      update: vi.fn(async () => event),
      delete: vi.fn(async (): Promise<void> => undefined),
      list: vi.fn(async (): Promise<SchoolCalendarEvent[]> => [event]),
    },
    staff: { findByUserId: vi.fn(async (): Promise<Staff> => ({ id: "stf-admin" }) as Staff) },
    academicYears: { findActive: vi.fn(async () => ({ id: "y-1" })) },
  };
}

function makeCtx(user: Principal, repos = makeRepos()) {
  const repositories = repos as unknown as Repositories;
  const ctx: ServiceContext = {
    user,
    repositories,
    notifications: createNotificationService([]),
    withTransaction: <T>(fn: (r: Repositories) => Promise<T>) => fn(repositories),
  };
  return { ctx, repos };
}

describe("createCalendarEvent", () => {
  it("admin creates an event + audits", async () => {
    const { ctx, repos } = makeCtx(admin);
    await createCalendarEvent(ctx, {
      title: "Diwali",
      eventType: "HOLIDAY",
      startDate: "2026-11-08",
      endDate: "2026-11-10",
    });
    expect(repos.calendarEvents.create).toHaveBeenCalled();
    expect(repos.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "CALENDAR_EVENT_CREATE" }),
    );
  });

  it("teacher CANNOT create (Forbidden — academic:manage)", async () => {
    const { ctx } = makeCtx(teacher);
    await expect(
      createCalendarEvent(ctx, {
        title: "x",
        eventType: "EVENT",
        startDate: "2026-01-01",
        endDate: "2026-01-01",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects endDate before startDate (ValidationError)", async () => {
    const { ctx } = makeCtx(admin);
    await expect(
      createCalendarEvent(ctx, {
        title: "x",
        eventType: "EVENT",
        startDate: "2026-01-10",
        endDate: "2026-01-09",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("update / delete / read", () => {
  it("admin updates an event", async () => {
    const { ctx, repos } = makeCtx(admin);
    await updateCalendarEvent(ctx, "ev-1", { title: "Deepavali" });
    expect(repos.calendarEvents.update).toHaveBeenCalled();
  });

  it("update rejects an inverted range (ValidationError)", async () => {
    const { ctx } = makeCtx(admin);
    await expect(
      updateCalendarEvent(ctx, "ev-1", { startDate: "2026-11-20" }), // after existing endDate
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("delete 404s an event from another school", async () => {
    const repos = makeRepos();
    repos.calendarEvents.findById = vi.fn(async () => ({ ...event, schoolId: "s-OTHER" }));
    const { ctx } = makeCtx(admin, repos);
    await expect(deleteCalendarEvent(ctx, "ev-1")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("parent can READ the calendar (calendar:read)", async () => {
    const { ctx } = makeCtx(parent);
    expect((await getCalendarEvent(ctx, "ev-1")).id).toBe("ev-1");
  });

  it("listUpcoming filters by endDate >= today, soonest first", async () => {
    const { ctx, repos } = makeCtx(parent);
    await listUpcomingCalendar(ctx, 10);
    expect(repos.calendarEvents.list).toHaveBeenCalledWith(
      "s-1",
      expect.objectContaining({ endsOnOrAfter: expect.any(Date), limit: 10 }),
    );
  });
});
