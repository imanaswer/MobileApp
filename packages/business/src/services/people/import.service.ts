import { PERMISSIONS } from "@repo/constants";
import { ConflictError, ValidationError } from "@repo/core";
import type { GenderKey, ImportReportDto, StudentRelationshipKey } from "@repo/types";

import { assertCan } from "../../authorization";
import type { ServiceContext } from "../../context";

import { createParent, linkParent } from "./parent.service";
import { createStudent } from "./student.service";

/**
 * Bulk people import from CSV (PRD §8.2, ADR-027). One row = one student, with an
 * optional guardian to create-or-reuse (dedupe by phone within the school) and link.
 * Rows are processed independently — a bad row lands in the error report with its
 * line number and the rest continue (partial success by design). Repeating an
 * admission number WITHIN the file attaches further guardians to the same student;
 * an admission number already in the DB is a row error, never a silent merge.
 */

/** Fixed header set — no column-mapping UI; the web page serves a matching template. */
const STUDENT_COLUMNS = [
  "admissionNo",
  "firstName",
  "lastName",
  "dob",
  "gender",
  "bloodGroup",
  "nationality",
  "aadhaar",
  "passport",
  "address",
] as const;
const GUARDIAN_COLUMNS = [
  "guardianName",
  "guardianPhone",
  "guardianEmail",
  "guardianRelationship",
  "guardianIsPrimary",
] as const;
export const IMPORT_COLUMNS = [...STUDENT_COLUMNS, ...GUARDIAN_COLUMNS];

const GENDERS: readonly GenderKey[] = ["MALE", "FEMALE", "OTHER"];
const RELATIONSHIPS: readonly StudentRelationshipKey[] = [
  "FATHER",
  "MOTHER",
  "GUARDIAN",
  "EMERGENCY_CONTACT",
];

/** Minimal RFC-4180 parser: quoted fields, escaped quotes, CRLF/LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  // Drop rows that are entirely empty (trailing newline, blank lines).
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

export interface ImportPeopleCsvInput {
  csv: string;
  /** Validate only — full report of what WOULD happen, zero writes. */
  dryRun?: boolean | undefined;
}

/**
 * Normalize a guardian phone to E.164 so dedupe survives the register-notation mix
 * ("+91 98765 43210" / "9876543210" / "09876543210" are the SAME guardian). Assumes
 * +91 for bare 10-digit numbers (PRD: single Indian school). Unrecognized shapes are
 * returned compacted, not rejected — the row-level length validation still applies.
 */
export function normalizeGuardianPhone(raw: string): string {
  const compact = raw.replace(/[\s\-().]/g, "");
  if (/^\+\d{8,15}$/.test(compact)) return compact;
  const digits = compact.replace(/^0/, "");
  if (/^\d{10}$/.test(digits)) return `+91${digits}`;
  if (/^91\d{10}$/.test(digits)) return `+${digits}`;
  return compact;
}

interface ParsedRow {
  admissionNo: string;
  firstName: string;
  lastName: string;
  dob?: Date | undefined;
  gender?: GenderKey | undefined;
  bloodGroup?: string | undefined;
  nationality?: string | undefined;
  aadhaar?: string | undefined;
  passport?: string | undefined;
  address?: string | undefined;
  guardian?: {
    name: string;
    phone: string;
    email?: string | undefined;
    relationship: StudentRelationshipKey;
    isPrimary: boolean;
  };
}

function required(value: string | undefined, field: string, max: number): string {
  const v = (value ?? "").trim();
  if (v.length === 0) throw new ValidationError(`${field} is required`);
  if (v.length > max) throw new ValidationError(`${field} exceeds ${max} characters`);
  return v;
}

function optional(value: string | undefined, field: string, max: number): string | undefined {
  const v = (value ?? "").trim();
  if (v.length === 0) return undefined;
  if (v.length > max) throw new ValidationError(`${field} exceeds ${max} characters`);
  return v;
}

/** Mirrors istDateSchema: YYYY-MM-DD that round-trips (rejects 2026-02-30). */
function parseDob(value: string | undefined): Date | undefined {
  const v = (value ?? "").trim();
  if (v.length === 0) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new ValidationError("dob must be YYYY-MM-DD");
  const d = new Date(`${v}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) {
    throw new ValidationError(`dob "${v}" is not a real date`);
  }
  return d;
}

function parseRow(cells: readonly string[], col: Map<string, number>): ParsedRow {
  const get = (name: string) => cells[col.get(name) ?? -1];

  const aadhaar = optional(get("aadhaar"), "aadhaar", 12);
  if (aadhaar && !/^\d{12}$/.test(aadhaar)) {
    throw new ValidationError("aadhaar must be 12 digits");
  }
  const genderRaw = optional(get("gender"), "gender", 20)?.toUpperCase();
  if (genderRaw && !GENDERS.includes(genderRaw as GenderKey)) {
    throw new ValidationError(`gender must be one of ${GENDERS.join(", ")}`);
  }

  const row: ParsedRow = {
    admissionNo: required(get("admissionNo"), "admissionNo", 60),
    firstName: required(get("firstName"), "firstName", 120),
    lastName: required(get("lastName"), "lastName", 120),
    dob: parseDob(get("dob")),
    gender: genderRaw as GenderKey | undefined,
    bloodGroup: optional(get("bloodGroup"), "bloodGroup", 10),
    nationality: optional(get("nationality"), "nationality", 60),
    aadhaar,
    passport: optional(get("passport"), "passport", 20),
    address: optional(get("address"), "address", 500),
  };

  const hasGuardian = GUARDIAN_COLUMNS.some((c) => (get(c) ?? "").trim().length > 0);
  if (hasGuardian) {
    const relRaw = optional(get("guardianRelationship"), "guardianRelationship", 30)?.toUpperCase();
    if (relRaw && !RELATIONSHIPS.includes(relRaw as StudentRelationshipKey)) {
      throw new ValidationError(`guardianRelationship must be one of ${RELATIONSHIPS.join(", ")}`);
    }
    const primaryRaw = optional(get("guardianIsPrimary"), "guardianIsPrimary", 10)?.toLowerCase();
    if (primaryRaw && !["true", "false", "yes", "no", "1", "0"].includes(primaryRaw)) {
      throw new ValidationError("guardianIsPrimary must be true or false");
    }
    row.guardian = {
      name: required(get("guardianName"), "guardianName", 120),
      phone: normalizeGuardianPhone(required(get("guardianPhone"), "guardianPhone", 20)),
      email: optional(get("guardianEmail"), "guardianEmail", 254),
      relationship: (relRaw as StudentRelationshipKey | undefined) ?? "GUARDIAN",
      isPrimary: primaryRaw !== undefined && ["true", "yes", "1"].includes(primaryRaw),
    };
    if (row.guardian.phone.length < 3) throw new ValidationError("guardianPhone is too short");
  }

  return row;
}

export async function importPeopleCsv(
  ctx: ServiceContext,
  input: ImportPeopleCsvInput,
): Promise<ImportReportDto> {
  // Both asserted upfront so an unauthorized caller gets a clean 403 before any work.
  assertCan(ctx.user, PERMISSIONS.STUDENT_MANAGE);
  assertCan(ctx.user, PERMISSIONS.PARENT_MANAGE);

  const rows = parseCsv(input.csv);
  if (rows.length < 2) {
    throw new ValidationError("CSV must have a header row and at least one data row");
  }

  const header = rows[0]!.map((h) => h.trim());
  const col = new Map<string, number>();
  const known = new Map(IMPORT_COLUMNS.map((c) => [c.toLowerCase(), c]));
  header.forEach((h, i) => {
    const canonical = known.get(h.toLowerCase());
    if (!canonical) throw new ValidationError(`Unknown column "${h}"`);
    col.set(canonical, i);
  });
  for (const req of ["admissionNo", "firstName", "lastName"]) {
    if (!col.has(req)) throw new ValidationError(`Missing required column "${req}"`);
  }

  // Guardian dedupe by phone: one list() upfront beats a query per row at school scale.
  // Keys are normalized so mixed notations in the DB still match a normalized row.
  // ponytail: whole-roster in memory; page it if a school ever has >10^5 guardians.
  const existingParents = await ctx.repositories.parents.list(ctx.user.schoolId);
  const parentIdByPhone = new Map(
    existingParents.map((p) => [normalizeGuardianPhone(p.phone), p.id]),
  );

  const report: ImportReportDto = {
    dryRun: input.dryRun === true,
    totalRows: rows.length - 1,
    studentsCreated: 0,
    guardiansCreated: 0,
    guardiansLinked: 0,
    errors: [],
  };

  // Row validation runs standalone, BEFORE any write — so a dry run can return the
  // full report, and a half-bad file is visible without half-importing.
  const parsed: { line: number; row: ParsedRow }[] = [];
  for (let i = 1; i < rows.length; i++) {
    const line = i + 1; // 1-based, counting the header
    try {
      parsed.push({ line, row: parseRow(rows[i]!, col) });
    } catch (e) {
      report.errors.push({ row: line, message: e instanceof Error ? e.message : String(e) });
    }
  }

  if (report.dryRun) {
    // Counts = what a commit WOULD do; the admission-number DB conflict is checked
    // here explicitly (a real run hits it inside createStudent).
    const admissionSeen = new Set<string>();
    const phoneSeen = new Set(parentIdByPhone.keys());
    for (const { line, row } of parsed) {
      try {
        if (!admissionSeen.has(row.admissionNo)) {
          const dup = await ctx.repositories.students.findByAdmissionNo(
            ctx.user.schoolId,
            row.admissionNo,
          );
          if (dup) {
            throw new ConflictError(`Admission number "${row.admissionNo}" is already in use`);
          }
          admissionSeen.add(row.admissionNo);
          report.studentsCreated++;
        }
        if (row.guardian) {
          if (!phoneSeen.has(row.guardian.phone)) {
            phoneSeen.add(row.guardian.phone);
            report.guardiansCreated++;
          }
          report.guardiansLinked++;
        }
      } catch (e) {
        report.errors.push({ row: line, message: e instanceof Error ? e.message : String(e) });
      }
    }
    report.errors.sort((a, b) => a.row - b.row);
    return report;
  }

  // Repeated admission numbers within the file = extra guardian rows for that student.
  const studentIdByAdmissionNo = new Map<string, string>();

  for (const { line, row } of parsed) {
    try {
      let studentId = studentIdByAdmissionNo.get(row.admissionNo);
      if (!studentId) {
        const { guardian: _guardian, ...studentInput } = row;
        const student = await createStudent(ctx, studentInput);
        studentId = student.id;
        studentIdByAdmissionNo.set(row.admissionNo, studentId);
        report.studentsCreated++;
      }

      if (row.guardian) {
        let parentId = parentIdByPhone.get(row.guardian.phone);
        if (!parentId) {
          const created = await createParent(ctx, {
            name: row.guardian.name,
            phone: row.guardian.phone,
            email: row.guardian.email,
          });
          parentId = created.id;
          parentIdByPhone.set(row.guardian.phone, parentId);
          report.guardiansCreated++;
        }
        await linkParent(ctx, {
          studentId,
          parentId,
          relationship: row.guardian.relationship,
          isPrimary: row.guardian.isPrimary,
        });
        report.guardiansLinked++;
      }
    } catch (e) {
      report.errors.push({ row: line, message: e instanceof Error ? e.message : String(e) });
    }
  }

  report.errors.sort((a, b) => a.row - b.row);
  return report;
}
