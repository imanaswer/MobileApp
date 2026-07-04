import { describe, expect, it } from "vitest";

import { DomainError, ForbiddenError, NotFoundError, UnauthorizedError } from "./index";

describe("domain error primitives", () => {
  it("carry stable machine-readable codes (the API layer maps on these)", () => {
    expect(new UnauthorizedError().code).toBe("UNAUTHORIZED");
    expect(new ForbiddenError().code).toBe("FORBIDDEN");
    expect(new NotFoundError().code).toBe("NOT_FOUND");
  });

  it("are all instanceof DomainError and Error (catchable at the boundary)", () => {
    for (const error of [new UnauthorizedError(), new ForbiddenError(), new NotFoundError()]) {
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toBeInstanceOf(Error);
    }
  });

  it("preserve a custom message and the underlying cause", () => {
    const cause = new Error("db down");
    const error = new ForbiddenError("Missing permission: user:set_role", { cause });
    expect(error.message).toBe("Missing permission: user:set_role");
    expect(error.cause).toBe(cause);
  });

  it("provide safe default messages (no sensitive detail leaked)", () => {
    expect(new UnauthorizedError().message).toBe("Not authenticated");
    expect(new ForbiddenError().message).toBe("Forbidden");
    expect(new NotFoundError().message).toBe("Not found");
  });
});
