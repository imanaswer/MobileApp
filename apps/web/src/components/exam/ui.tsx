"use client";

import type { ExamSectionStatusKey, ExamTypeKey } from "@repo/types";

/** Exam types in register order (ADR-012). */
export const EXAM_TYPES: readonly ExamTypeKey[] = [
  "UNIT_TEST",
  "MONTHLY",
  "MID_TERM",
  "HALF_YEARLY",
  "MODEL",
  "ANNUAL",
  "PRACTICAL",
  "CUSTOM",
];

export const EXAM_TYPE_LABEL: Record<ExamTypeKey, string> = {
  UNIT_TEST: "Unit test",
  MONTHLY: "Monthly",
  MID_TERM: "Mid term",
  HALF_YEARLY: "Half yearly",
  MODEL: "Model",
  ANNUAL: "Annual",
  PRACTICAL: "Practical",
  CUSTOM: "Custom",
};

export const REGISTER_STATUS_LABEL: Record<ExamSectionStatusKey | "NONE", string> = {
  NONE: "Not started",
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  LOCKED: "Locked",
};
