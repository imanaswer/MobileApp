import type { Principal } from "@repo/business";
import { describe, expect, it } from "vitest";

import { appRouter } from "../root";
import { createCallerFactory } from "../trpc";

const createCaller = createCallerFactory(appRouter);

/**
 * Transport-layer behaviour for the M7 reportCard router (ADR-014): route protection
 * (protectedProcedure → UNAUTHORIZED), permission gates that fail in the service
 * BEFORE any repository call (assertCan → FORBIDDEN), and Zod input validation
 * (BAD_REQUEST, before the resolver). Lifecycle rules, snapshot freeze, supersession,
 * scope, and audit are unit-tested in @repo/business (report-card.service).
 */

const superAdmin: Principal = {
  userId: "u-super",
  schoolId: "s-1",
  role: "SUPER_ADMIN",
  status: "ACTIVE",
};
const teacher: Principal = {
  userId: "u-teacher",
  schoolId: "s-1",
  role: "TEACHER",
  status: "ACTIVE",
};
const parent: Principal = { userId: "u-parent", schoolId: "s-1", role: "PARENT", status: "ACTIVE" };
const accountant: Principal = {
  userId: "u-acc",
  schoolId: "s-1",
  role: "ACCOUNTANT",
  status: "ACTIVE",
};
const disabled: Principal = { ...teacher, status: "DISABLED" };

const genInput = { enrollmentId: "e-1", kind: "ANNUAL" as const };

describe("reportCard router — route protection", () => {
  it("rejects an unauthenticated caller (UNAUTHORIZED)", async () => {
    await expect(createCaller({ user: null }).reportCard.get({ id: "rc-1" })).rejects.toMatchObject(
      {
        code: "UNAUTHORIZED",
      },
    );
  });
  it("rejects an unauthenticated mutation (UNAUTHORIZED)", async () => {
    await expect(createCaller({ user: null }).reportCard.generate(genInput)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
  it("rejects a DISABLED account (FORBIDDEN)", async () => {
    await expect(
      createCaller({ user: disabled }).reportCard.get({ id: "rc-1" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("reportCard router — permission gates (fail in the service before any repo call)", () => {
  // Lifecycle (REPORT_CARD_MANAGE) — admin-only. Teacher/parent/accountant refused at assertCan.
  it("a TEACHER cannot generate (FORBIDDEN — no report_card:manage)", async () => {
    await expect(
      createCaller({ user: teacher }).reportCard.generate(genInput),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
  it("a TEACHER cannot approve (FORBIDDEN)", async () => {
    await expect(
      createCaller({ user: teacher }).reportCard.approve({ reportCardId: "rc-1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("publish fails PRECONDITION_FAILED without storage/pdf (renderProcedure — ADR-026)", async () => {
    // publish is now render-capable (renders + stores the PDF post-commit); with no ports wired
    // it fails the precondition BEFORE the resolver, so the publish permission gate
    // (teacher/parent cannot publish) is asserted in the @repo/business report-card tests.
    await expect(
      createCaller({ user: teacher }).reportCard.publish({ reportCardId: "rc-1" }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
  it("pdfDownloadUrl fails PRECONDITION_FAILED when no StoragePort is wired", async () => {
    await expect(
      createCaller({ user: superAdmin }).reportCard.pdfDownloadUrl({ reportCardId: "rc-1" }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
  it("a PARENT cannot revoke (FORBIDDEN)", async () => {
    await expect(
      createCaller({ user: parent }).reportCard.revoke({ reportCardId: "rc-1", reason: "x" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("a PARENT cannot correct (FORBIDDEN)", async () => {
    await expect(
      createCaller({ user: parent }).reportCard.correct({ reportCardId: "rc-1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  // Remark/submit (REPORT_CARD_REMARK) — teacher capability; parent/accountant refused.
  it("a PARENT cannot draft a remark (FORBIDDEN — no report_card:remark)", async () => {
    await expect(
      createCaller({ user: parent }).reportCard.draftRemark({ reportCardId: "rc-1", remark: "ok" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("an ACCOUNTANT cannot submit (FORBIDDEN)", async () => {
    await expect(
      createCaller({ user: accountant }).reportCard.submit({ reportCardId: "rc-1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  // Reads (REPORT_CARD_READ) — held by admin/teacher/parent, NOT accountant.
  it("an ACCOUNTANT cannot read a card (FORBIDDEN — no report_card:read)", async () => {
    await expect(
      createCaller({ user: accountant }).reportCard.get({ id: "rc-1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("an ACCOUNTANT cannot list an enrollment's cards (FORBIDDEN)", async () => {
    await expect(
      createCaller({ user: accountant }).reportCard.listForEnrollment({ enrollmentId: "e-1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("reportCard router — Zod input validation (BAD_REQUEST, before the resolver)", () => {
  const c = createCaller({ user: superAdmin });

  it("rejects an invalid reportCardKind on generate", async () => {
    await expect(
      // @ts-expect-error — the invalid enum member is the point of the test
      c.reportCard.generate({ enrollmentId: "e-1", kind: "WEEKLY" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("rejects an empty enrollmentId on generate", async () => {
    await expect(c.reportCard.generate({ enrollmentId: "", kind: "ANNUAL" })).rejects.toMatchObject(
      {
        code: "BAD_REQUEST",
      },
    );
  });
  it("rejects a missing kind on generate", async () => {
    // @ts-expect-error — the missing required field is the point of the test
    await expect(c.reportCard.generate({ enrollmentId: "e-1" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
  it("rejects an invalid promotionDecision on edit", async () => {
    await expect(
      // @ts-expect-error — the invalid enum member is the point of the test
      c.reportCard.edit({ reportCardId: "rc-1", promotionDecision: "MAYBE" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("rejects an empty principalRemark on edit (optional field, but min(1) when present)", async () => {
    await expect(
      c.reportCard.edit({ reportCardId: "rc-1", principalRemark: "" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("rejects an empty remark on draftRemark", async () => {
    await expect(
      c.reportCard.draftRemark({ reportCardId: "rc-1", remark: "" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("rejects an empty reason on reopen", async () => {
    await expect(c.reportCard.reopen({ reportCardId: "rc-1", reason: "" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
  it("rejects a missing reason on revoke", async () => {
    // @ts-expect-error — the missing required field is the point of the test
    await expect(c.reportCard.revoke({ reportCardId: "rc-1" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
  it("rejects an empty reportCardId on submit", async () => {
    await expect(c.reportCard.submit({ reportCardId: "" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
  it("rejects an empty id on get", async () => {
    await expect(c.reportCard.get({ id: "" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
