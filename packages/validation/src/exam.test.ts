import { describe, expect, it } from "vitest";

import {
  createAssessmentInput,
  createExamInput,
  createGradeScaleInput,
  saveMarksInput,
  unlockRegisterInput,
} from "./index";

/** M5 exam input schemas — shape/edge validation (business rules live in services). */

describe("createExamInput", () => {
  const base = { academicYearId: "y-1", name: "Half Yearly", type: "HALF_YEARLY" as const };

  it("accepts a minimal valid exam", () => {
    expect(createExamInput.safeParse(base).success).toBe(true);
  });
  it("rejects an unknown exam type", () => {
    expect(createExamInput.safeParse({ ...base, type: "NOPE" }).success).toBe(false);
  });
  it("rejects an empty name", () => {
    expect(createExamInput.safeParse({ ...base, name: "" }).success).toBe(false);
  });
  it("rejects an impossible start date", () => {
    expect(createExamInput.safeParse({ ...base, startDate: "2026-02-30" }).success).toBe(false);
  });
});

describe("saveMarksInput", () => {
  const base = { assessmentId: "as-1", sectionId: "sec-1" };

  it("accepts nullable/omitted obtained values", () => {
    expect(
      saveMarksInput.safeParse({
        ...base,
        marks: [{ enrollmentId: "e-1", theoryObtained: null, isAbsent: true }],
      }).success,
    ).toBe(true);
  });
  it("rejects an empty marks array", () => {
    expect(saveMarksInput.safeParse({ ...base, marks: [] }).success).toBe(false);
  });
  it("rejects a negative obtained mark", () => {
    expect(
      saveMarksInput.safeParse({ ...base, marks: [{ enrollmentId: "e-1", theoryObtained: -1 }] })
        .success,
    ).toBe(false);
  });
});

describe("createAssessmentInput", () => {
  const base = { examId: "ex-1", subjectId: "sub-1", maxTheory: 80, passMark: 30 };

  it("accepts a theory-only assessment (maxPractical omitted)", () => {
    expect(createAssessmentInput.safeParse(base).success).toBe(true);
  });
  it("accepts a null maxPractical", () => {
    expect(createAssessmentInput.safeParse({ ...base, maxPractical: null }).success).toBe(true);
  });
  it("rejects a negative maximum", () => {
    expect(createAssessmentInput.safeParse({ ...base, maxTheory: -5 }).success).toBe(false);
  });
});

describe("unlockRegisterInput", () => {
  it("accepts a non-empty reason", () => {
    expect(
      unlockRegisterInput.safeParse({ examSectionId: "es-1", reason: "fix a typo" }).success,
    ).toBe(true);
  });
  it("rejects a whitespace-only reason", () => {
    expect(unlockRegisterInput.safeParse({ examSectionId: "es-1", reason: "   " }).success).toBe(
      false,
    );
  });
  it("rejects a reason over 500 chars", () => {
    expect(
      unlockRegisterInput.safeParse({ examSectionId: "es-1", reason: "x".repeat(501) }).success,
    ).toBe(false);
  });
});

describe("createGradeScaleInput", () => {
  const band = { grade: "A", minPercent: 0, maxPercent: 100 };

  it("accepts a scale with at least one band", () => {
    expect(
      createGradeScaleInput.safeParse({ name: "S", isDefault: true, bands: [band] }).success,
    ).toBe(true);
  });
  it("rejects no bands", () => {
    expect(
      createGradeScaleInput.safeParse({ name: "S", isDefault: false, bands: [] }).success,
    ).toBe(false);
  });
  it("rejects a grade label over 10 chars", () => {
    expect(
      createGradeScaleInput.safeParse({
        name: "S",
        isDefault: false,
        bands: [{ ...band, grade: "OVERLONGGRADE" }],
      }).success,
    ).toBe(false);
  });
  it("rejects a negative minPercent", () => {
    expect(
      createGradeScaleInput.safeParse({
        name: "S",
        isDefault: false,
        bands: [{ ...band, minPercent: -1 }],
      }).success,
    ).toBe(false);
  });
});
