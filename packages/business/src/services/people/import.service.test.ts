import { ForbiddenError, ValidationError } from "@repo/core";
import type { Parent, Repositories, Student, StudentParent } from "@repo/db";
import { createNotificationService } from "@repo/notifications";
import { describe, expect, it, vi } from "vitest";

import type { Principal } from "../../authorization";
import type { ServiceContext } from "../../context";

import { importPeopleCsv, normalizeGuardianPhone, parseCsv } from "./import.service";

const officeAdmin: Principal = {
  userId: "u-office",
  schoolId: "s-1",
  role: "OFFICE_ADMIN",
  status: "ACTIVE",
};
const teacher: Principal = {
  userId: "u-teacher",
  schoolId: "s-1",
  role: "TEACHER",
  status: "ACTIVE",
};

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const stamps = { createdAt: d("2026-01-01"), updatedAt: d("2026-01-01") };

let nextId = 0;
const makeStudent = (input: { admissionNo: string; firstName: string }): Student =>
  ({
    id: `st-${++nextId}`,
    schoolId: "s-1",
    admissionNo: input.admissionNo,
    firstName: input.firstName,
    lastName: "X",
    dob: null,
    gender: null,
    bloodGroup: null,
    nationality: null,
    aadhaar: null,
    passport: null,
    address: null,
    photoPath: null,
    status: "ACTIVE",
    ...stamps,
  }) as Student;

const existingParent: Parent = {
  id: "p-existing",
  schoolId: "s-1",
  userId: null,
  name: "Meera Nair",
  phone: "+919999900001",
  email: null,
  occupation: null,
  address: null,
  preferredContact: "PHONE",
  ...stamps,
};

function makeRepos() {
  return {
    audit: { record: vi.fn(async (): Promise<void> => undefined) },
    students: {
      findById: vi.fn(async (): Promise<Student | null> =>
        makeStudent({ admissionNo: "A-0", firstName: "Any" }),
      ),
      findByAdmissionNo: vi.fn(
        async (_schoolId: string, _admissionNo: string): Promise<Student | null> => null,
      ),
      findByAadhaar: vi.fn(async (): Promise<Student | null> => null),
      create: vi.fn(async (input: { admissionNo: string; firstName: string }) =>
        makeStudent(input),
      ),
    },
    parents: {
      list: vi.fn(async (): Promise<Parent[]> => [existingParent]),
      findById: vi.fn(async (): Promise<Parent | null> => existingParent),
      create: vi.fn(async (input: { name: string; phone: string }): Promise<Parent> => ({
        ...existingParent,
        id: `p-${++nextId}`,
        name: input.name,
        phone: input.phone,
      })),
    },
    studentParents: {
      findLink: vi.fn(async (): Promise<StudentParent | null> => null),
      clearPrimary: vi.fn(async (): Promise<void> => undefined),
      create: vi.fn(
        async (input: {
          studentId: string;
          parentId: string;
          relationship: StudentParent["relationship"];
          isPrimary?: boolean;
        }): Promise<StudentParent> => ({
          studentId: input.studentId,
          parentId: input.parentId,
          relationship: input.relationship,
          isPrimary: input.isPrimary ?? false,
          createdAt: d("2026-01-01"),
        }),
      ),
    },
  };
}

function makeCtx(user: Principal, repos = makeRepos()) {
  const repositories = repos as unknown as Repositories;
  const ctx: ServiceContext = {
    user,
    repositories,
    notifications: createNotificationService([]),
    withTransaction: <T>(fn: (r: Repositories) => Promise<T>) => fn(repositories),
  };
  return { ctx, repos };
}

const HEADER =
  "admissionNo,firstName,lastName,dob,gender,guardianName,guardianPhone,guardianRelationship,guardianIsPrimary";

describe("parseCsv", () => {
  it("handles quoted commas, escaped quotes, and CRLF", () => {
    expect(parseCsv('a,"b,c",d\r\n"say ""hi""",2,3\n')).toEqual([
      ["a", "b,c", "d"],
      ['say "hi"', "2", "3"],
    ]);
  });

  it("treats a mid-cell quote as a literal character (RFC 4180)", () => {
    expect(parseCsv('ab"c,2\n')).toEqual([['ab"c', "2"]]);
  });

  it("skips blank lines", () => {
    expect(parseCsv("a,b\n\n1,2\n  ,\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("normalizeGuardianPhone", () => {
  it("normalizes register notations to one E.164 form", () => {
    expect(normalizeGuardianPhone("+91 98765 43210")).toBe("+919876543210");
    expect(normalizeGuardianPhone("9876543210")).toBe("+919876543210");
    expect(normalizeGuardianPhone("09876543210")).toBe("+919876543210");
    expect(normalizeGuardianPhone("919876543210")).toBe("+919876543210");
    expect(normalizeGuardianPhone("98765-43210")).toBe("+919876543210");
  });

  it("keeps unrecognized shapes compacted, not rejected", () => {
    expect(normalizeGuardianPhone("12345")).toBe("12345");
    expect(normalizeGuardianPhone("+1 555 0100 200")).toBe("+15550100200");
  });
});

describe("importPeopleCsv (ADR-027)", () => {
  it("dedupes guardians across mixed phone notations (one create, both linked)", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    const csv = [
      HEADER,
      "A-1,Asha,Nair,,,Raj Nair,98765 43210,FATHER,",
      "A-2,Bini,Nair,,,Raj Nair,09876543210,FATHER,",
    ].join("\n");

    const report = await importPeopleCsv(ctx, { csv });

    expect(report.guardiansCreated).toBe(1);
    expect(report.guardiansLinked).toBe(2);
    expect(repos.parents.create).toHaveBeenCalledTimes(1);
    expect(repos.parents.create).toHaveBeenCalledWith(
      expect.objectContaining({ phone: "+919876543210" }),
    );
  });

  it("dryRun reports would-create counts and DB conflicts with ZERO writes", async () => {
    const repos = makeRepos();
    // A-9 already exists in the DB — dry run must surface it as a row error.
    repos.students.findByAdmissionNo.mockImplementation(
      async (_schoolId: string, admissionNo: string) =>
        admissionNo === "A-9" ? makeStudent({ admissionNo: "A-9", firstName: "Dup" }) : null,
    );
    const { ctx } = makeCtx(officeAdmin, repos);
    const csv = [
      HEADER,
      "A-1,Asha,Nair,,,Meera Nair,+91 99999 00001,MOTHER,true", // existing guardian → reuse
      "A-2,Bini,Thomas,,,Tom Thomas,+919999900002,FATHER,", // new guardian
      "A-9,Dup,Row,,,,,,", // admissionNo already in DB
      "A-3,Bad,Dob,2026-02-30,,,,,", // row validation error
    ].join("\n");

    const report = await importPeopleCsv(ctx, { csv, dryRun: true });

    expect(report).toMatchObject({
      dryRun: true,
      totalRows: 4,
      studentsCreated: 2,
      guardiansCreated: 1,
      guardiansLinked: 2,
    });
    expect(report.errors.map((e) => e.row)).toEqual([4, 5]);
    expect(repos.students.create).not.toHaveBeenCalled();
    expect(repos.parents.create).not.toHaveBeenCalled();
    expect(repos.studentParents.create).not.toHaveBeenCalled();
  });

  it("creates students, reuses guardians by phone, links, and reports counts", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    const csv = [
      HEADER,
      "A-1,Asha,Nair,2015-06-01,FEMALE,Meera Nair,+919999900001,MOTHER,true", // existing guardian phone → reuse
      "A-2,Bini,Thomas,,,Tom Thomas,+919999900002,FATHER,", // new guardian
      "A-3,Chris,Paul,,,,,,", // no guardian
    ].join("\n");

    const report = await importPeopleCsv(ctx, { csv });

    expect(report).toMatchObject({
      totalRows: 3,
      studentsCreated: 3,
      guardiansCreated: 1,
      guardiansLinked: 2,
      errors: [],
    });
    expect(repos.parents.create).toHaveBeenCalledTimes(1);
    expect(repos.studentParents.create).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: "p-existing", relationship: "MOTHER", isPrimary: true }),
    );
  });

  it("a repeated admissionNo within the file adds a second guardian to the same student", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    const csv = [
      HEADER,
      "A-1,Asha,Nair,,,Meera Nair,+919999900001,MOTHER,true",
      "A-1,Asha,Nair,,,Raj Nair,+919999900009,FATHER,",
    ].join("\n");

    const report = await importPeopleCsv(ctx, { csv });

    expect(report.studentsCreated).toBe(1);
    expect(report.guardiansLinked).toBe(2);
    expect(repos.students.create).toHaveBeenCalledTimes(1);
  });

  it("bad rows land in the error report with line numbers; good rows still import", async () => {
    const { ctx } = makeCtx(officeAdmin);
    const csv = [
      HEADER,
      ",Missing,AdmissionNo,,,,,,", // line 2: no admissionNo
      "A-2,Bad,Dob,2026-02-30,,,,,", // line 3: impossible date
      "A-3,Bad,Gender,,PURPLE,,,,", // line 4: bad enum
      "A-4,Good,Row,,,,,,", // line 5: fine
    ].join("\n");

    const report = await importPeopleCsv(ctx, { csv });

    expect(report.studentsCreated).toBe(1);
    expect(report.errors.map((e) => e.row)).toEqual([2, 3, 4]);
    expect(report.errors[0]!.message).toContain("admissionNo");
  });

  it("a service conflict (duplicate admissionNo in DB) is a row error, not a merge", async () => {
    const repos = makeRepos();
    repos.students.findByAdmissionNo.mockResolvedValueOnce(
      makeStudent({ admissionNo: "A-1", firstName: "Dup" }),
    );
    const { ctx } = makeCtx(officeAdmin, repos);

    const report = await importPeopleCsv(ctx, {
      csv: [HEADER, "A-1,Asha,Nair,,,,,,"].join("\n"),
    });

    expect(report.studentsCreated).toBe(0);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]!.message).toContain("already in use");
  });

  it("rejects unknown and missing columns up front", async () => {
    const { ctx } = makeCtx(officeAdmin);
    await expect(
      importPeopleCsv(ctx, { csv: "admissionNo,firstName,lastName,favouriteColour\nA-1,A,B,red" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(importPeopleCsv(ctx, { csv: "firstName,lastName\nA,B" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("refuses a caller without people-manage permissions", async () => {
    const { ctx } = makeCtx(teacher);
    await expect(importPeopleCsv(ctx, { csv: `${HEADER}\nA-1,A,B,,,,,,` })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
