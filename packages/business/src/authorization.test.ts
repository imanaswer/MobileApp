import { PERMISSIONS } from "@repo/constants";
import { ForbiddenError } from "@repo/core";
import { describe, expect, it } from "vitest";

import {
  assertCan,
  assertScope,
  assertSelf,
  assertSelfOrCan,
  ownsAccount,
  type Principal,
  type ScopeRule,
} from "./authorization";

const superAdmin: Principal = {
  userId: "u-super",
  schoolId: "s-1",
  role: "SUPER_ADMIN",
  status: "ACTIVE",
};
const parent: Principal = {
  userId: "u-parent",
  schoolId: "s-1",
  role: "PARENT",
  status: "ACTIVE",
};

describe("permission authorization (assertCan)", () => {
  it("allows a permitted action", () => {
    expect(() => assertCan(superAdmin, PERMISSIONS.USER_SET_ROLE)).not.toThrow();
  });
  it("throws ForbiddenError when the role lacks the permission", () => {
    expect(() => assertCan(parent, PERMISSIONS.USER_SET_ROLE)).toThrow(ForbiddenError);
  });
});

describe("scope authorization (assertScope + rules)", () => {
  it("ownsAccount allows the owner and denies others", () => {
    expect(ownsAccount(parent, { userId: "u-parent" })).toBe(true);
    expect(ownsAccount(parent, { userId: "u-other" })).toBe(false);
  });

  it("assertScope enforces an arbitrary rule (extension point)", () => {
    // A future-style scope rule, defined outside authorization.ts.
    const sameSchool: ScopeRule<{ schoolId: string }> = (principal, resource) =>
      principal.schoolId === resource.schoolId;

    expect(() => assertScope(parent, { schoolId: "s-1" }, sameSchool)).not.toThrow();
    expect(() => assertScope(parent, { schoolId: "s-2" }, sameSchool)).toThrow(ForbiddenError);
  });
});

describe("account-ownership wrappers", () => {
  it("assertSelf allows own account, denies another", () => {
    expect(() => assertSelf(parent, "u-parent")).not.toThrow();
    expect(() => assertSelf(parent, "u-other")).toThrow(ForbiddenError);
  });

  it("assertSelfOrCan allows self, allows override holder, denies otherwise", () => {
    expect(() => assertSelfOrCan(parent, "u-parent", PERMISSIONS.USER_READ)).not.toThrow();
    expect(() => assertSelfOrCan(superAdmin, "u-parent", PERMISSIONS.USER_READ)).not.toThrow();
    expect(() => assertSelfOrCan(parent, "u-other", PERMISSIONS.USER_READ)).toThrow(ForbiddenError);
  });
});
