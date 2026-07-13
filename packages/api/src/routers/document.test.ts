import type { Principal } from "@repo/business";
import { describe, expect, it } from "vitest";

import { appRouter } from "../root";
import { createCallerFactory } from "../trpc";

const createCaller = createCallerFactory(appRouter);

/**
 * Transport-layer behaviour for the M15 document routers (ADR-023): route protection,
 * the permission matrix that fails in the service BEFORE any repository call
 * (assertCan(document:*) → FORBIDDEN), the storage precondition (storageProcedure →
 * PRECONDITION_FAILED when no StoragePort is wired), and Zod validation (BAD_REQUEST,
 * before the resolver). Lifecycle, scope, snapshot, the APPROVED-only gate and audit
 * are unit-tested in @repo/business (document.service).
 */
// Minimal fakes so a render-gated route (generate) reaches Zod validation without real ports.
const fakePorts = {
  storage: {
    createSignedUploadUrl: async () => ({ signedUrl: "u", token: "t" }),
    createSignedDownloadUrl: async () => "https://x",
    uploadObject: async () => undefined,
  },
  pdf: {
    renderCertificate: async () => new Uint8Array([37, 80, 68, 70]),
    renderReportCard: async () => new Uint8Array([37, 80, 68, 70]),
  },
};

const admin: Principal = { userId: "u-a", schoolId: "s-1", role: "OFFICE_ADMIN", status: "ACTIVE" };
const teacher: Principal = { userId: "u-t", schoolId: "s-1", role: "TEACHER", status: "ACTIVE" };
const parent: Principal = { userId: "u-p", schoolId: "s-1", role: "PARENT", status: "ACTIVE" };
const disabled: Principal = { ...admin, status: "DISABLED" };

describe("document router — route protection", () => {
  it("rejects an unauthenticated caller (UNAUTHORIZED)", async () => {
    await expect(
      createCaller({ user: null }).document.listStudentDocuments({ studentId: "st-1" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("rejects a DISABLED account (FORBIDDEN)", async () => {
    await expect(createCaller({ user: disabled }).document.list({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("document router — permission matrix (before any repo call)", () => {
  // NB generate is now a renderProcedure (ADR-026): with no storage/pdf wired it fails the
  // precondition BEFORE the resolver, so the generate permission matrix (teacher/parent
  // cannot generate) is asserted in the @repo/business document.service tests instead.
  it("a TEACHER cannot approve (FORBIDDEN — approve-only)", async () => {
    await expect(
      createCaller({ user: teacher }).document.approve({ id: "doc-1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("a PARENT cannot approve (FORBIDDEN)", async () => {
    await expect(
      createCaller({ user: parent }).document.approve({ id: "doc-1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("a TEACHER cannot archive (FORBIDDEN — manage-only)", async () => {
    await expect(
      createCaller({ user: teacher }).document.archive({ id: "doc-1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("a TEACHER cannot delete a draft (FORBIDDEN — manage-only)", async () => {
    await expect(
      createCaller({ user: teacher }).document.deleteDraft({ id: "doc-1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("a TEACHER cannot open the admin console (FORBIDDEN — manage-only)", async () => {
    await expect(createCaller({ user: teacher }).document.list({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
  it("a PARENT cannot record an uploaded document (FORBIDDEN — manage-only)", async () => {
    await expect(
      createCaller({ user: parent }).document.createUploaded({
        studentId: "st-1",
        type: "OTHER",
        storagePath: "p/x",
        fileName: "f.pdf",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("document router — storage precondition (storage/render procedure)", () => {
  it("generate fails PRECONDITION_FAILED when no storage/pdf is wired (renderProcedure)", async () => {
    await expect(
      createCaller({ user: admin }).document.generate({
        studentId: "st-1",
        type: "BONAFIDE_CERTIFICATE",
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
  it("uploadUrl fails PRECONDITION_FAILED when no StoragePort is wired", async () => {
    await expect(
      createCaller({ user: admin }).document.uploadUrl({ studentId: "st-1", fileName: "f.pdf" }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
  it("downloadUrl fails PRECONDITION_FAILED when no StoragePort is wired", async () => {
    await expect(
      createCaller({ user: admin }).document.downloadUrl({ id: "doc-1" }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});

describe("document router — Zod validation (BAD_REQUEST, before the resolver)", () => {
  it("rejects generate with a missing studentId", async () => {
    await expect(
      // @ts-expect-error — deliberately omitting studentId
      createCaller({ user: admin, ...fakePorts }).document.generate({
        type: "BONAFIDE_CERTIFICATE",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("rejects generate with an unknown type", async () => {
    await expect(
      // @ts-expect-error — not a DocumentType
      createCaller({ user: admin, ...fakePorts }).document.generate({
        studentId: "st-1",
        type: "NOPE",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("documentTemplate router — permission matrix + validation", () => {
  it("a TEACHER cannot create a template (FORBIDDEN — manage-only)", async () => {
    await expect(
      createCaller({ user: teacher }).documentTemplate.create({
        type: "BONAFIDE_CERTIFICATE",
        name: "Bonafide",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("a TEACHER cannot list templates (FORBIDDEN — manage-only)", async () => {
    await expect(createCaller({ user: teacher }).documentTemplate.list({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
  it("rejects create with an empty name (BAD_REQUEST)", async () => {
    await expect(
      createCaller({ user: admin }).documentTemplate.create({
        type: "BONAFIDE_CERTIFICATE",
        name: "",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
