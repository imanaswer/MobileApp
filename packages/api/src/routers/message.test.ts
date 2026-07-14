import type { Principal } from "@repo/business";
import { describe, expect, it } from "vitest";

import { appRouter } from "../root";
import { createCallerFactory } from "../trpc";

const createCaller = createCallerFactory(appRouter);

/**
 * Transport-layer behaviour for the M18 message router: route protection, the
 * permission gates that fail in the service BEFORE any repository call (assertCan →
 * FORBIDDEN), and Zod input validation (BAD_REQUEST, before the resolver). Party
 * scope, the lastMessageAt bump, and notification are unit-tested in @repo/business.
 */
const teacher: Principal = {
  userId: "u-teacher",
  schoolId: "s-1",
  role: "TEACHER",
  status: "ACTIVE",
};
const admin: Principal = {
  userId: "u-admin",
  schoolId: "s-1",
  role: "OFFICE_ADMIN",
  status: "ACTIVE",
};
const disabled: Principal = { ...teacher, status: "DISABLED" };

describe("message router — route protection", () => {
  it("rejects an unauthenticated caller (UNAUTHORIZED)", async () => {
    await expect(createCaller({ user: null }).message.listThreads({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
  it("rejects a DISABLED account (FORBIDDEN)", async () => {
    await expect(createCaller({ user: disabled }).message.listThreads({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("message router — permission gates (before any repo call)", () => {
  it("an admin (no message:read) cannot list threads (FORBIDDEN)", async () => {
    await expect(createCaller({ user: admin }).message.listThreads({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
  it("an admin (no message:send) cannot open a thread (FORBIDDEN)", async () => {
    await expect(
      createCaller({ user: admin }).message.createThread({ studentId: "st-1", otherUserId: "u-1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("message router — Zod validation (BAD_REQUEST, before the resolver)", () => {
  it("rejects send with an empty body", async () => {
    await expect(
      createCaller({ user: teacher }).message.send({ threadId: "th-1", body: "" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("rejects createThread without a counterparty", async () => {
    await expect(
      createCaller({ user: teacher }).message.createThread({ studentId: "st-1" } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
