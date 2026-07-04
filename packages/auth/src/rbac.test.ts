import { describe, expect, it } from "vitest";

import { hasRole } from "./rbac";

describe("hasRole (coarse role membership)", () => {
  it("allows a role in the allowed set", () => {
    expect(hasRole("TEACHER", ["TEACHER", "SUPER_ADMIN"])).toBe(true);
  });

  it("denies a role outside the allowed set", () => {
    expect(hasRole("PARENT", ["TEACHER", "SUPER_ADMIN"])).toBe(false);
  });

  it("denies everything for an empty allowed set", () => {
    expect(hasRole("SUPER_ADMIN", [])).toBe(false);
  });
});
