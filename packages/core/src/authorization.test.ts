import { PERMISSIONS, ROLES } from "@repo/constants";
import { describe, expect, it } from "vitest";

import { can, canAll, canAny, getPermissions } from "./authorization";

describe("authorization policy", () => {
  it("every role can read and update its own profile (baseline)", () => {
    for (const role of ROLES) {
      expect(can(role, PERMISSIONS.PROFILE_READ_SELF)).toBe(true);
      expect(can(role, PERMISSIONS.PROFILE_UPDATE_SELF)).toBe(true);
    }
  });

  it("only SUPER_ADMIN manages users, roles, and the audit log", () => {
    const adminOnly = [
      PERMISSIONS.USER_READ,
      PERMISSIONS.USER_INVITE,
      PERMISSIONS.USER_SET_ROLE,
      PERMISSIONS.USER_DISABLE,
      PERMISSIONS.AUDIT_READ,
    ] as const;

    for (const permission of adminOnly) {
      expect(can("SUPER_ADMIN", permission)).toBe(true);
      for (const role of ROLES.filter((r) => r !== "SUPER_ADMIN")) {
        expect(can(role, permission)).toBe(false);
      }
    }
  });

  it("getPermissions returns the role's full grant", () => {
    expect(getPermissions("PARENT")).toEqual([
      PERMISSIONS.PROFILE_READ_SELF,
      PERMISSIONS.PROFILE_UPDATE_SELF,
    ]);
    expect(getPermissions("SUPER_ADMIN")).toContain(PERMISSIONS.USER_SET_ROLE);
  });

  it("canAny / canAll combine permission checks", () => {
    expect(canAny("TEACHER", [PERMISSIONS.USER_DISABLE, PERMISSIONS.PROFILE_READ_SELF])).toBe(true);
    expect(canAll("TEACHER", [PERMISSIONS.USER_DISABLE, PERMISSIONS.PROFILE_READ_SELF])).toBe(false);
    expect(canAll("SUPER_ADMIN", [PERMISSIONS.USER_DISABLE, PERMISSIONS.AUDIT_READ])).toBe(true);
  });
});
