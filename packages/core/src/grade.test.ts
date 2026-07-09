import { describe, expect, it } from "vitest";

import { bandForPercentage, computeGpa, computeMarkResult, type GradeBandInput } from "./grade";

// SCERT-like scale; top band uses a >100 sentinel so 100 lands in A+ (ADR-012 §3a).
const bands: GradeBandInput[] = [
  { id: "b-e", grade: "E", minPercent: 0, maxPercent: 35, gradePoint: 0 },
  { id: "b-b", grade: "B", minPercent: 35, maxPercent: 60, gradePoint: 2 },
  { id: "b-a", grade: "A", minPercent: 60, maxPercent: 90, gradePoint: 3 },
  { id: "b-ap", grade: "A+", minPercent: 90, maxPercent: 100.01, gradePoint: 4 },
];

describe("bandForPercentage (half-open, boundary correctness)", () => {
  it("puts a shared edge in the UPPER band and covers 0 and 100", () => {
    expect(bandForPercentage(bands, 0)?.grade).toBe("E");
    expect(bandForPercentage(bands, 35)?.grade).toBe("B"); // edge → upper
    expect(bandForPercentage(bands, 90)?.grade).toBe("A+");
    expect(bandForPercentage(bands, 100)?.grade).toBe("A+");
  });
  it("returns null for a percentage in no band (gap/misconfig)", () => {
    expect(
      bandForPercentage(
        [{ id: "x", grade: "X", minPercent: 0, maxPercent: 50, gradePoint: null }],
        75,
      ),
    ).toBeNull();
  });
});

describe("computeMarkResult", () => {
  it("computes total, 2dp percentage, and grade (theory+practical)", () => {
    const r = computeMarkResult(
      {
        theoryObtained: 80,
        practicalObtained: 15,
        isAbsent: false,
        maxTheory: 80,
        maxPractical: 20,
      },
      bands,
    );
    expect(r.totalObtained).toBe(95);
    expect(r.percentage).toBe(95);
    expect(r.gradeLetter).toBe("A+");
    expect(r.gradePoint).toBe(4);
  });

  it("rounds percentage to 2dp before band lookup (no boundary jitter)", () => {
    // 21/35 = 59.999… → 60.0 → A (not B)
    const r = computeMarkResult(
      {
        theoryObtained: 21,
        practicalObtained: 0,
        isAbsent: false,
        maxTheory: 35,
        maxPractical: null,
      },
      bands,
    );
    expect(r.percentage).toBe(60);
    expect(r.gradeLetter).toBe("A");
  });

  it("treats theory-only (null maxPractical) with denominator = maxTheory", () => {
    const r = computeMarkResult(
      {
        theoryObtained: 35,
        practicalObtained: null,
        isAbsent: false,
        maxTheory: 50,
        maxPractical: null,
      },
      bands,
    );
    expect(r.percentage).toBe(70);
    expect(r.gradeLetter).toBe("A");
  });

  it("absent → all null (no result, not a zero)", () => {
    const r = computeMarkResult(
      {
        theoryObtained: null,
        practicalObtained: null,
        isAbsent: true,
        maxTheory: 100,
        maxPractical: null,
      },
      bands,
    );
    expect(r).toEqual({
      totalObtained: null,
      percentage: null,
      gradeBandId: null,
      gradeLetter: null,
      gradePoint: null,
    });
  });

  it("non-absent percentage in no band → null band fields (caller rejects)", () => {
    const r = computeMarkResult(
      {
        theoryObtained: 40,
        practicalObtained: 0,
        isAbsent: false,
        maxTheory: 100,
        maxPractical: null,
      },
      [{ id: "only", grade: "X", minPercent: 0, maxPercent: 30, gradePoint: 1 }],
    );
    expect(r.percentage).toBe(40);
    expect(r.gradeBandId).toBeNull();
  });
});

describe("computeGpa (foundation)", () => {
  it("means available points, excludes null, null when none", () => {
    expect(computeGpa([4, 3, null])).toBe(3.5);
    expect(computeGpa([null, null])).toBeNull();
    expect(computeGpa([])).toBeNull();
  });
});
