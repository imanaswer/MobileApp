import type { Principal } from "@repo/business";
import { describe, expect, it } from "vitest";

import type { Context } from "../context";
import { appRouter } from "../root";
import { createCallerFactory } from "../trpc";

const createCaller = createCallerFactory(appRouter);

const active: Principal = { userId: "u-1", schoolId: "s-1", role: "PARENT", status: "ACTIVE" };
const invited: Principal = { ...active, status: "INVITED" };
const disabled: Principal = { ...active, status: "DISABLED" };

describe("auth.me — route protection", () => {
  it("returns the principal for an ACTIVE user", async () => {
    const caller = createCaller({ user: active });
    await expect(caller.auth.me()).resolves.toEqual(active);
  });

  it("returns the principal for an INVITED user (onboarding gate allows it)", async () => {
    const caller = createCaller({ user: invited });
    await expect(caller.auth.me()).resolves.toEqual(invited);
  });

  it("rejects an unauthenticated caller (UNAUTHORIZED)", async () => {
    const caller = createCaller({ user: null } satisfies Context);
    await expect(caller.auth.me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects a DISABLED account (FORBIDDEN — mid-session revocation)", async () => {
    const caller = createCaller({ user: disabled });
    await expect(caller.auth.me()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
