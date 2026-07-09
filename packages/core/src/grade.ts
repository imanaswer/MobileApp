/**
 * Central grade computation (ADR-012 §3). The ONE place a mark becomes a
 * grade — pure and framework-free so "no duplicated grading logic" is
 * structurally enforced (core cannot reach a DB shortcut). Called only at LOCK
 * (MarkService); the result is snapshotted onto the Mark and never recomputed.
 */

/** A percent band → letter (+ optional GPA point). Half-open [minPercent, maxPercent). */
export interface GradeBandInput {
  id: string;
  grade: string;
  minPercent: number;
  maxPercent: number;
  gradePoint: number | null;
}

export interface MarkComputeInput {
  theoryObtained: number | null;
  practicalObtained: number | null;
  isAbsent: boolean;
  maxTheory: number;
  maxPractical: number | null;
}

export interface MarkResult {
  totalObtained: number | null;
  percentage: number | null;
  gradeBandId: string | null;
  gradeLetter: string | null;
  gradePoint: number | null;
}

/** Round to 2 decimals — applied to percentage BEFORE band lookup so float jitter
 *  near a boundary (79.999…) cannot flip a grade (ADR-012 §3a). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** The band a percentage falls in (half-open [min, max)); null if none — a gap the
 *  caller treats as a misconfigured scale (LOCK rejects, except for absent marks). */
export function bandForPercentage(
  bands: readonly GradeBandInput[],
  percentage: number,
): GradeBandInput | null {
  return bands.find((b) => percentage >= b.minPercent && percentage < b.maxPercent) ?? null;
}

/**
 * Compute a mark's frozen result. Absent = "no result" (all null — policy-neutral;
 * it does NOT assert a zero, so GPA excludes it). Otherwise: total = theory +
 * practical over maxTheory + (maxPractical ?? 0), percentage rounded to 2dp, then
 * the band. A non-absent percentage that finds NO band returns null band fields —
 * the caller rejects that as a scale gap.
 */
export function computeMarkResult(
  input: MarkComputeInput,
  bands: readonly GradeBandInput[],
): MarkResult {
  if (input.isAbsent) {
    return {
      totalObtained: null,
      percentage: null,
      gradeBandId: null,
      gradeLetter: null,
      gradePoint: null,
    };
  }
  const total = (input.theoryObtained ?? 0) + (input.practicalObtained ?? 0);
  const denominator = input.maxTheory + (input.maxPractical ?? 0);
  const percentage = denominator > 0 ? round2((total / denominator) * 100) : 0;
  const band = bandForPercentage(bands, percentage);
  return {
    totalObtained: total,
    percentage,
    gradeBandId: band?.id ?? null,
    gradeLetter: band?.grade ?? null,
    gradePoint: band?.gradePoint ?? null,
  };
}

/**
 * GPA foundation (ADR-012 §4): mean of available grade points from Mark snapshots.
 * Null points (absent marks, or a scale without points) are excluded; null if none
 * are available — GPA degrades to "not available", never crashes.
 */
export function computeGpa(gradePoints: readonly (number | null)[]): number | null {
  const points = gradePoints.filter((p): p is number => p !== null);
  if (points.length === 0) {
    return null;
  }
  return round2(points.reduce((sum, p) => sum + p, 0) / points.length);
}
