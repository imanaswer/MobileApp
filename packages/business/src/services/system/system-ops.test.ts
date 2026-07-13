import { ForbiddenError } from "@repo/core";
import { describe, expect, it, vi } from "vitest";

import type { Principal } from "../../authorization";
import type { ServiceContext } from "../../context";
import type { StoragePort } from "../people/document-storage.service";

import { exportAuditLog, verifyStorage } from "./system-ops";

const principal = (role: Principal["role"]): Principal => ({
  userId: "u1",
  schoolId: "s1",
  role,
  status: "ACTIVE",
});

/** Minimal ServiceContext — the ops functions only touch user + repositories.audit. */
const ctxFor = (role: Principal["role"], auditList = vi.fn()) =>
  ({
    user: principal(role),
    repositories: { audit: { list: auditList } },
  }) as unknown as ServiceContext;

describe("system ops — permission gating (system:manage is SUPER_ADMIN only)", () => {
  it("rejects OFFICE_ADMIN (not granted, unlike settings:manage)", async () => {
    const storage = {} as StoragePort;
    await expect(verifyStorage(ctxFor("OFFICE_ADMIN"), storage)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(() => exportAuditLog(ctxFor("OFFICE_ADMIN"), { limit: 10 })).toThrow(ForbiddenError);
  });

  it("rejects TEACHER and PARENT", () => {
    expect(() => exportAuditLog(ctxFor("TEACHER"), { limit: 10 })).toThrow(ForbiddenError);
    expect(() => exportAuditLog(ctxFor("PARENT"), { limit: 10 })).toThrow(ForbiddenError);
  });
});

describe("exportAuditLog (SUPER_ADMIN)", () => {
  it("reads tenant-scoped audit rows via the repository", () => {
    const list = vi.fn().mockReturnValue([]);
    exportAuditLog(ctxFor("SUPER_ADMIN", list), { limit: 50 });
    expect(list).toHaveBeenCalledWith("s1", { limit: 50 });
  });
});

describe("verifyStorage (SUPER_ADMIN)", () => {
  it("reports each bucket, marking an unreachable one ok:false", async () => {
    const storage: StoragePort = {
      createSignedUploadUrl: vi.fn(async (bucket: string) => {
        if (bucket === "branding") throw new Error("bucket missing");
        return { signedUrl: "u", token: "t" };
      }),
      createSignedDownloadUrl: vi.fn(),
      uploadObject: vi.fn(async () => undefined),
    };
    const result = await verifyStorage(ctxFor("SUPER_ADMIN"), storage);
    const branding = result.find((r) => r.bucket === "branding");
    expect(branding).toMatchObject({ ok: false, error: "bucket missing" });
    expect(result.filter((r) => r.ok).length).toBe(result.length - 1);
    expect(result.length).toBeGreaterThanOrEqual(5); // the 5 private buckets
  });
});
