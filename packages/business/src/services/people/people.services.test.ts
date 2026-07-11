import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@repo/core";
import type {
  AcademicYear,
  Class,
  Enrollment,
  Parent,
  Repositories,
  Section,
  Staff,
  Student,
  StudentDocument,
  StudentParent,
  TeacherAssignment,
  User,
} from "@repo/db";
import { createNotificationService } from "@repo/notifications";
import { describe, expect, it, vi } from "vitest";

import type { Principal } from "../../authorization";
import type { ServiceContext } from "../../context";

import {
  mintDocumentDownloadUrl,
  mintDocumentUploadUrl,
  type StoragePort,
} from "./document-storage.service";
import {
  enroll,
  listEnrollmentsByStudent,
  promote,
  sectionRoster,
  transfer,
  withdraw,
} from "./enrollment.service";
import {
  createParent,
  getParent,
  linkParent,
  listGuardians,
  listParents,
  unlinkParent,
} from "./parent.service";
import { createStaff, getStaff, listStaff } from "./staff.service";
import {
  getDocument,
  listDocuments,
  replaceDocument,
  uploadDocument,
} from "./student-document.service";
import { archiveStudent, createStudent, getStudent, listStudents } from "./student.service";

/* ---- principals ---- */

const superAdmin: Principal = {
  userId: "u-super",
  schoolId: "s-1",
  role: "SUPER_ADMIN",
  status: "ACTIVE",
};
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
const parent: Principal = { userId: "u-parent", schoolId: "s-1", role: "PARENT", status: "ACTIVE" };

/* ---- row fixtures ---- */

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const stamps = { createdAt: d("2026-01-01"), updatedAt: d("2026-01-01") };

const studentRow: Student = {
  id: "st-1",
  schoolId: "s-1",
  admissionNo: "ADM-001",
  firstName: "Asha",
  lastName: "Nair",
  dob: d("2015-06-01"),
  gender: "FEMALE",
  bloodGroup: "O+",
  nationality: "Indian",
  aadhaar: null,
  passport: null,
  address: null,
  photoPath: null,
  status: "ACTIVE",
  ...stamps,
};

const enrollmentRow: Enrollment = {
  id: "e-1",
  schoolId: "s-1",
  studentId: "st-1",
  academicYearId: "y-1",
  classId: "c-1",
  sectionId: "sec-1",
  rollNo: 7,
  status: "ACTIVE",
  ...stamps,
};

const parentRow: Parent = {
  id: "p-1",
  schoolId: "s-1",
  userId: "u-parent",
  name: "Meera Nair",
  phone: "+919999900001",
  email: null,
  occupation: null,
  address: null,
  preferredContact: "PHONE",
  ...stamps,
};

const fatherLink: StudentParent = {
  studentId: "st-1",
  parentId: "p-1",
  relationship: "FATHER",
  isPrimary: true,
  createdAt: d("2026-01-01"),
};

const staffRow: Staff = {
  id: "sf-1",
  schoolId: "s-1",
  userId: "u-teacher",
  name: "Tara Teacher",
  employeeId: "EMP-01",
  department: null,
  qualification: null,
  experienceYears: null,
  joiningDate: null,
  bio: null,
  photoPath: null,
  ...stamps,
};

const photoDoc: StudentDocument = {
  id: "doc-photo",
  schoolId: "s-1",
  studentId: "st-1",
  type: "PHOTO",
  storagePath: "s-1/st-1/uuid-photo.jpg",
  fileName: "photo.jpg",
  mimeType: "image/jpeg",
  sizeBytes: 1024,
  checksum: null,
  version: 1,
  uploadedByUserId: "u-office",
  createdAt: d("2026-01-01"),
};
const aadhaarDoc: StudentDocument = {
  ...photoDoc,
  id: "doc-aadhaar",
  type: "AADHAAR",
  storagePath: "s-1/st-1/uuid-aadhaar.pdf",
  fileName: "aadhaar.pdf",
};

const yearRow: AcademicYear = {
  id: "y-1",
  schoolId: "s-1",
  name: "2026-27",
  startDate: d("2026-06-01"),
  endDate: d("2027-03-31"),
  status: "ACTIVE",
  ...stamps,
};
const classRow: Class = { id: "c-1", schoolId: "s-1", name: "Class 5", sortOrder: 5, ...stamps };
const sectionRow: Section = { id: "sec-1", classId: "c-1", name: "A", ...stamps };
const assignmentRow: TeacherAssignment = {
  id: "a-1",
  schoolId: "s-1",
  teacherId: "u-teacher",
  subjectId: "sub-1",
  sectionId: "sec-1",
  ...stamps,
};
const teacherUser: User = {
  id: "u-teacher",
  schoolId: "s-1",
  role: "TEACHER",
  status: "ACTIVE",
  phone: null,
  email: "t@school.example",
  locale: "EN",
  lastLoginAt: null,
  ...stamps,
};

/** Fully mocked, happy-path repository aggregate; tests override per case. */
function makeRepos() {
  return {
    users: {
      findById: vi.fn(async (): Promise<User | null> => teacherUser),
      create: vi.fn(),
      activate: vi.fn(),
      touchLastLogin: vi.fn(),
      setRole: vi.fn(),
      setStatus: vi.fn(),
      updateLocale: vi.fn(),
    },
    audit: { record: vi.fn(async (): Promise<void> => undefined) },
    academicYears: {
      list: vi.fn(async (): Promise<AcademicYear[]> => [yearRow]),
      findById: vi.fn(async (): Promise<AcademicYear | null> => yearRow),
      findByName: vi.fn(async (): Promise<AcademicYear | null> => null),
      findActive: vi.fn(async (): Promise<AcademicYear | null> => yearRow),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    classes: {
      list: vi.fn(async (): Promise<Class[]> => [classRow]),
      findById: vi.fn(async (): Promise<Class | null> => classRow),
      findByName: vi.fn(async (): Promise<Class | null> => null),
      hasSections: vi.fn(async (): Promise<boolean> => false),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    sections: {
      listByClass: vi.fn(async (): Promise<Section[]> => [sectionRow]),
      findById: vi.fn(async (): Promise<Section | null> => sectionRow),
      findByName: vi.fn(async (): Promise<Section | null> => null),
      hasAssignments: vi.fn(async (): Promise<boolean> => false),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    teacherAssignments: {
      list: vi.fn(async (): Promise<TeacherAssignment[]> => [assignmentRow]),
      findById: vi.fn(async (): Promise<TeacherAssignment | null> => assignmentRow),
      findByTriple: vi.fn(async (): Promise<TeacherAssignment | null> => null),
      create: vi.fn(),
      delete: vi.fn(),
    },
    students: {
      list: vi.fn(async (): Promise<Student[]> => [studentRow]),
      listByIds: vi.fn(async (): Promise<Student[]> => [studentRow]),
      findById: vi.fn(async (): Promise<Student | null> => studentRow),
      findByAdmissionNo: vi.fn(async (): Promise<Student | null> => null),
      findByAadhaar: vi.fn(async (): Promise<Student | null> => null),
      create: vi.fn(async (): Promise<Student> => studentRow),
      update: vi.fn(async (): Promise<Student> => ({ ...studentRow, status: "ARCHIVED" })),
    },
    enrollments: {
      listByStudent: vi.fn(async (): Promise<Enrollment[]> => [enrollmentRow]),
      listBySection: vi.fn(async (): Promise<Enrollment[]> => [enrollmentRow]),
      findById: vi.fn(async (): Promise<Enrollment | null> => enrollmentRow),
      findByStudentYear: vi.fn(async (): Promise<Enrollment | null> => null),
      findRollNoConflict: vi.fn(async (): Promise<Enrollment | null> => null),
      studentIdsInSections: vi.fn(async (): Promise<string[]> => ["st-1"]),
      create: vi.fn(async (): Promise<Enrollment> => enrollmentRow),
      update: vi.fn(async (): Promise<Enrollment> => enrollmentRow),
    },
    parents: {
      list: vi.fn(async (): Promise<Parent[]> => [parentRow]),
      findById: vi.fn(async (): Promise<Parent | null> => parentRow),
      findByUserId: vi.fn(async (): Promise<Parent | null> => parentRow),
      create: vi.fn(async (): Promise<Parent> => parentRow),
      update: vi.fn(async (): Promise<Parent> => parentRow),
      delete: vi.fn(async (): Promise<void> => undefined),
    },
    studentParents: {
      listByStudent: vi.fn(async (): Promise<StudentParent[]> => [fatherLink]),
      listByParent: vi.fn(async (): Promise<StudentParent[]> => [fatherLink]),
      findLink: vi.fn(async (): Promise<StudentParent | null> => null),
      studentIdsForParent: vi.fn(async (): Promise<string[]> => ["st-1"]),
      create: vi.fn(async (): Promise<StudentParent> => fatherLink),
      clearPrimary: vi.fn(async (): Promise<void> => undefined),
      delete: vi.fn(async (): Promise<void> => undefined),
    },
    staff: {
      list: vi.fn(async (): Promise<Staff[]> => [staffRow]),
      findById: vi.fn(async (): Promise<Staff | null> => staffRow),
      findByUserId: vi.fn(async (): Promise<Staff | null> => null),
      findByEmployeeId: vi.fn(async (): Promise<Staff | null> => null),
      create: vi.fn(async (): Promise<Staff> => staffRow),
      update: vi.fn(async (): Promise<Staff> => staffRow),
      delete: vi.fn(async (): Promise<void> => undefined),
    },
    studentDocuments: {
      listByStudent: vi.fn(async (): Promise<StudentDocument[]> => [photoDoc, aadhaarDoc]),
      findById: vi.fn(async (): Promise<StudentDocument | null> => photoDoc),
      create: vi.fn(async (): Promise<StudentDocument> => photoDoc),
      update: vi.fn(async (): Promise<StudentDocument> => ({ ...photoDoc, version: 2 })),
      delete: vi.fn(async (): Promise<void> => undefined),
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

function makeStorage(): StoragePort & {
  createSignedUploadUrl: ReturnType<typeof vi.fn>;
  createSignedDownloadUrl: ReturnType<typeof vi.fn>;
} {
  return {
    createSignedUploadUrl: vi.fn(async () => ({ signedUrl: "https://upload", token: "tok" })),
    createSignedDownloadUrl: vi.fn(async () => "https://download"),
  };
}

const newStudent = { admissionNo: "ADM-002", firstName: "Ravi", lastName: "Menon" };

/* ---- student — identity rules & row scope ---- */

describe("student — identity rules", () => {
  it("creates a student (OFFICE_ADMIN) and audits in-tx", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    const dto = await createStudent(ctx, newStudent);
    expect(dto).toMatchObject({ admissionNo: "ADM-001", status: "ACTIVE" });
    expect(repos.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "STUDENT_CREATE", entityType: "Student" }),
    );
  });

  it("rejects a duplicate admission number in the school (ConflictError)", async () => {
    const { ctx, repos } = makeCtx(superAdmin);
    repos.students.findByAdmissionNo.mockResolvedValueOnce(studentRow);
    await expect(createStudent(ctx, newStudent)).rejects.toThrow(ConflictError);
    expect(repos.students.create).not.toHaveBeenCalled();
  });

  it("rejects a duplicate Aadhaar (ConflictError)", async () => {
    const { ctx, repos } = makeCtx(superAdmin);
    repos.students.findByAadhaar.mockResolvedValueOnce({ ...studentRow, id: "st-9" });
    await expect(createStudent(ctx, { ...newStudent, aadhaar: "123456789012" })).rejects.toThrow(
      ConflictError,
    );
  });

  it("archives (lifecycle, not delete) with before/after audit", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    const dto = await archiveStudent(ctx, "st-1");
    expect(dto.status).toBe("ARCHIVED");
    expect(repos.students.update).toHaveBeenCalledWith("st-1", { status: "ARCHIVED" });
    expect(repos.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "STUDENT_ARCHIVE",
        before: { status: "ACTIVE" },
        after: { status: "ARCHIVED" },
      }),
    );
  });

  it("denies a TEACHER student mutations (ForbiddenError)", async () => {
    const { ctx, repos } = makeCtx(teacher);
    await expect(createStudent(ctx, newStudent)).rejects.toThrow(ForbiddenError);
    expect(repos.students.create).not.toHaveBeenCalled();
  });

  it("hides a student of another school (NotFoundError — no tenant leak)", async () => {
    const { ctx, repos } = makeCtx(superAdmin);
    repos.students.findById.mockResolvedValueOnce({ ...studentRow, schoolId: "s-other" });
    await expect(getStudent(ctx, "st-1")).rejects.toThrow(NotFoundError);
  });

  it("TEACHER list is scoped to own sections in the active year (listByIds, never list)", async () => {
    const { ctx, repos } = makeCtx(teacher);
    await listStudents(ctx);
    expect(repos.enrollments.studentIdsInSections).toHaveBeenCalledWith(["sec-1"], "y-1");
    expect(repos.students.listByIds).toHaveBeenCalledWith(["st-1"], undefined);
    expect(repos.students.list).not.toHaveBeenCalled();
  });

  it("TEACHER cannot read a student from another section (ForbiddenError)", async () => {
    const { ctx, repos } = makeCtx(teacher);
    repos.students.findById.mockResolvedValueOnce({ ...studentRow, id: "st-other" });
    await expect(getStudent(ctx, "st-other")).rejects.toThrow(ForbiddenError);
  });

  it("PARENT with multiple children sees exactly their children", async () => {
    const { ctx, repos } = makeCtx(parent);
    repos.studentParents.studentIdsForParent.mockResolvedValueOnce(["st-1", "st-2"]);
    await listStudents(ctx);
    expect(repos.students.listByIds).toHaveBeenCalledWith(["st-1", "st-2"], undefined);
    expect(repos.students.list).not.toHaveBeenCalled();
  });

  it("PARENT cannot read another family's child (ForbiddenError)", async () => {
    const { ctx, repos } = makeCtx(parent);
    repos.students.findById.mockResolvedValueOnce({ ...studentRow, id: "st-strange" });
    await expect(getStudent(ctx, "st-strange")).rejects.toThrow(ForbiddenError);
  });
});

/* ---- enrollment — lifecycle (ADR-010) ---- */

describe("enrollment — lifecycle (ADR-010)", () => {
  const enrollInput = { studentId: "st-1", academicYearId: "y-1", classId: "c-1" };

  it("enrolls with a section → ACTIVE, audits ENROLLMENT_CREATE", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    await enroll(ctx, { ...enrollInput, sectionId: "sec-1", rollNo: 12 });
    expect(repos.enrollments.create).toHaveBeenCalledWith(
      expect.objectContaining({ sectionId: "sec-1", rollNo: 12, status: "ACTIVE" }),
    );
    expect(repos.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ENROLLMENT_CREATE" }),
    );
  });

  it("enrolls without a section → ADMITTED (unplaced)", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    await enroll(ctx, enrollInput);
    expect(repos.enrollments.create).toHaveBeenCalledWith(
      expect.objectContaining({ sectionId: null, rollNo: null, status: "ADMITTED" }),
    );
  });

  it("rejects a duplicate enrollment for the same year (ConflictError)", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    repos.enrollments.findByStudentYear.mockResolvedValueOnce(enrollmentRow);
    await expect(enroll(ctx, enrollInput)).rejects.toThrow(ConflictError);
    expect(repos.enrollments.create).not.toHaveBeenCalled();
  });

  it("rejects enrolling an ARCHIVED student (ValidationError)", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    repos.students.findById.mockResolvedValueOnce({ ...studentRow, status: "ARCHIVED" });
    await expect(enroll(ctx, enrollInput)).rejects.toThrow(ValidationError);
  });

  it("rejects a roll number without a section (ValidationError)", async () => {
    const { ctx } = makeCtx(officeAdmin);
    await expect(enroll(ctx, { ...enrollInput, rollNo: 3 })).rejects.toThrow(ValidationError);
  });

  it("rejects a taken roll number in the section+year (ConflictError)", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    repos.enrollments.findRollNoConflict.mockResolvedValueOnce(enrollmentRow);
    await expect(enroll(ctx, { ...enrollInput, sectionId: "sec-1", rollNo: 7 })).rejects.toThrow(
      ConflictError,
    );
  });

  it("rejects a section that belongs to a different class (ValidationError)", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    repos.sections.findById.mockResolvedValueOnce({ ...sectionRow, classId: "c-9" });
    await expect(enroll(ctx, { ...enrollInput, sectionId: "sec-1" })).rejects.toThrow(
      ValidationError,
    );
  });

  it("transfer mutates the SAME row in place — never a second enrollment (ADR-010 §5)", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    repos.sections.findById.mockResolvedValueOnce({ ...sectionRow, id: "sec-2" });
    await transfer(ctx, { enrollmentId: "e-1", toSectionId: "sec-2", rollNo: 4 });
    expect(repos.enrollments.update).toHaveBeenCalledWith("e-1", {
      sectionId: "sec-2",
      rollNo: 4,
      status: "ACTIVE",
    });
    expect(repos.enrollments.create).not.toHaveBeenCalled();
    expect(repos.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ENROLLMENT_TRANSFER" }),
    );
  });

  it("transfer clears the roll number when no new one is given (per-section numbers)", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    repos.sections.findById.mockResolvedValueOnce({ ...sectionRow, id: "sec-2" });
    await transfer(ctx, { enrollmentId: "e-1", toSectionId: "sec-2" });
    expect(repos.enrollments.update).toHaveBeenCalledWith(
      "e-1",
      expect.objectContaining({ rollNo: null }),
    );
  });

  it("rejects an invalid transfer to a section of another class (ValidationError)", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    repos.sections.findById.mockResolvedValueOnce({ ...sectionRow, id: "sec-9", classId: "c-9" });
    await expect(transfer(ctx, { enrollmentId: "e-1", toSectionId: "sec-9" })).rejects.toThrow(
      ValidationError,
    );
    expect(repos.enrollments.update).not.toHaveBeenCalled();
  });

  it("promote creates a NEW row and marks the source PROMOTED — source never re-pointed", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    repos.academicYears.findById.mockResolvedValueOnce({ ...yearRow, id: "y-2" });
    repos.classes.findById.mockResolvedValueOnce({ ...classRow, id: "c-2" });
    await promote(ctx, { enrollmentId: "e-1", targetAcademicYearId: "y-2", toClassId: "c-2" });
    expect(repos.enrollments.create).toHaveBeenCalledWith(
      expect.objectContaining({ academicYearId: "y-2", classId: "c-2", status: "ADMITTED" }),
    );
    expect(repos.enrollments.update).toHaveBeenCalledWith("e-1", { status: "PROMOTED" });
    expect(repos.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ENROLLMENT_PROMOTE" }),
    );
  });

  it("promoting into the same class marks the source RETAINED", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    repos.academicYears.findById.mockResolvedValueOnce({ ...yearRow, id: "y-2" });
    await promote(ctx, { enrollmentId: "e-1", targetAcademicYearId: "y-2", toClassId: "c-1" });
    expect(repos.enrollments.update).toHaveBeenCalledWith("e-1", { status: "RETAINED" });
    expect(repos.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ENROLLMENT_RETAIN" }),
    );
  });

  it("rejects an invalid promotion into the SAME academic year (ValidationError)", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    await expect(
      promote(ctx, { enrollmentId: "e-1", targetAcademicYearId: "y-1", toClassId: "c-2" }),
    ).rejects.toThrow(ValidationError);
    expect(repos.enrollments.create).not.toHaveBeenCalled();
  });

  it("rejects promotion when the target year already has an enrollment (ConflictError)", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    repos.academicYears.findById.mockResolvedValueOnce({ ...yearRow, id: "y-2" });
    repos.classes.findById.mockResolvedValueOnce({ ...classRow, id: "c-2" });
    repos.enrollments.findByStudentYear.mockResolvedValueOnce({ ...enrollmentRow, id: "e-2" });
    await expect(
      promote(ctx, { enrollmentId: "e-1", targetAcademicYearId: "y-2", toClassId: "c-2" }),
    ).rejects.toThrow(ConflictError);
  });

  it("withdraw drops the enrollment AND withdraws the student in one transaction (two audits)", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    repos.enrollments.update.mockResolvedValueOnce({ ...enrollmentRow, status: "DROPPED" });
    await withdraw(ctx, "e-1");
    expect(repos.enrollments.update).toHaveBeenCalledWith("e-1", { status: "DROPPED" });
    expect(repos.students.update).toHaveBeenCalledWith("st-1", { status: "WITHDRAWN" });
    expect(repos.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ENROLLMENT_WITHDRAW" }),
    );
    expect(repos.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "STUDENT_WITHDRAW" }),
    );
  });

  it("TEACHER can read the roster of a section they teach (enriched with studentName)", async () => {
    const { ctx } = makeCtx(teacher);
    const roster = await sectionRoster(ctx, { academicYearId: "y-1", sectionId: "sec-1" });
    expect(roster).toHaveLength(1);
    expect(roster[0]!.studentName).toBe("Asha Nair");
  });

  it("enrollment history is enriched with year/class/section names (parent-safe, no academic:read)", async () => {
    const { ctx } = makeCtx(parent);
    const history = await listEnrollmentsByStudent(ctx, "st-1");
    expect(history[0]!.academicYearName).toBe("2026-27");
    expect(history[0]!.className).toBe("Class 5");
    expect(history[0]!.sectionName).toBe("A");
  });

  it("TEACHER cannot read another section's roster (ForbiddenError)", async () => {
    const { ctx, repos } = makeCtx(teacher);
    await expect(
      sectionRoster(ctx, { academicYearId: "y-1", sectionId: "sec-other" }),
    ).rejects.toThrow(ForbiddenError);
    expect(repos.enrollments.listBySection).not.toHaveBeenCalled();
  });

  it("PARENT cannot read section rosters at all (ForbiddenError)", async () => {
    const { ctx } = makeCtx(parent);
    await expect(sectionRoster(ctx, { academicYearId: "y-1", sectionId: "sec-1" })).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("TEACHER cannot mutate enrollments (ForbiddenError)", async () => {
    const { ctx, repos } = makeCtx(teacher);
    await expect(enroll(ctx, enrollInput)).rejects.toThrow(ForbiddenError);
    expect(repos.enrollments.create).not.toHaveBeenCalled();
  });
});

/* ---- parent — records, links, scope ---- */

describe("parent — records and links", () => {
  it("creates a parent and audits", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    repos.parents.findByUserId.mockResolvedValueOnce(null);
    await createParent(ctx, { name: "Meera Nair", phone: "+919999900001" });
    expect(repos.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PARENT_CREATE" }),
    );
  });

  it("rejects linking a user who already has a parent record (ConflictError)", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    repos.parents.findByUserId.mockResolvedValueOnce(parentRow);
    await expect(
      createParent(ctx, { userId: "u-parent", name: "Dup", phone: "1234" }),
    ).rejects.toThrow(ConflictError);
  });

  it("links a parent as primary — clears the previous primary first (single primary)", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    await linkParent(ctx, {
      studentId: "st-1",
      parentId: "p-1",
      relationship: "GUARDIAN",
      isPrimary: true,
    });
    expect(repos.studentParents.clearPrimary).toHaveBeenCalledWith("st-1");
    expect(repos.studentParents.create).toHaveBeenCalledWith(
      expect.objectContaining({ relationship: "GUARDIAN", isPrimary: true }),
    );
    expect(repos.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "STUDENT_PARENT_LINK" }),
    );
  });

  it("rejects a duplicate (student, parent, relationship) link (ConflictError)", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    repos.studentParents.findLink.mockResolvedValueOnce(fatherLink);
    await expect(
      linkParent(ctx, { studentId: "st-1", parentId: "p-1", relationship: "FATHER" }),
    ).rejects.toThrow(ConflictError);
    expect(repos.studentParents.create).not.toHaveBeenCalled();
  });

  it("unlinking a missing link is NotFound (not a silent no-op)", async () => {
    const { ctx } = makeCtx(officeAdmin);
    await expect(
      unlinkParent(ctx, { studentId: "st-1", parentId: "p-1", relationship: "MOTHER" }),
    ).rejects.toThrow(NotFoundError);
  });

  it("a student can hold multiple guardians (multiple relationships listed)", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    repos.studentParents.listByStudent.mockResolvedValueOnce([
      fatherLink,
      { ...fatherLink, parentId: "p-2", relationship: "GUARDIAN", isPrimary: false },
    ]);
    const guardians = await listGuardians(ctx, "st-1");
    expect(guardians).toHaveLength(2);
    expect(guardians.map((g) => g.relationship)).toEqual(["FATHER", "GUARDIAN"]);
  });

  it("PARENT role lists only their own record", async () => {
    const { ctx, repos } = makeCtx(parent);
    const rows = await listParents(ctx);
    expect(rows).toHaveLength(1);
    expect(repos.parents.findByUserId).toHaveBeenCalledWith("u-parent");
    expect(repos.parents.list).not.toHaveBeenCalled();
  });

  it("PARENT cannot read another parent's record (ForbiddenError)", async () => {
    const { ctx, repos } = makeCtx(parent);
    repos.parents.findById.mockResolvedValueOnce({ ...parentRow, id: "p-2", userId: "u-other" });
    await expect(getParent(ctx, "p-2")).rejects.toThrow(ForbiddenError);
  });

  it("TEACHER cannot manage parent links (ForbiddenError)", async () => {
    const { ctx } = makeCtx(teacher);
    await expect(
      linkParent(ctx, { studentId: "st-1", parentId: "p-1", relationship: "FATHER" }),
    ).rejects.toThrow(ForbiddenError);
  });
});

/* ---- staff — employment profile ---- */

describe("staff — employment profile", () => {
  const newStaff = { userId: "u-teacher", name: "Nate New", employeeId: "EMP-02" };

  it("creates a profile and audits", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    await createStaff(ctx, newStaff);
    expect(repos.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "STAFF_CREATE" }),
    );
  });

  it("rejects a second profile for the same user (ConflictError)", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    repos.staff.findByUserId.mockResolvedValueOnce(staffRow);
    await expect(createStaff(ctx, newStaff)).rejects.toThrow(ConflictError);
  });

  it("rejects a duplicate employee id in the school (ConflictError)", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    repos.staff.findByEmployeeId.mockResolvedValueOnce(staffRow);
    await expect(createStaff(ctx, newStaff)).rejects.toThrow(ConflictError);
  });

  it("TEACHER lists only their own profile", async () => {
    const { ctx, repos } = makeCtx(teacher);
    repos.staff.findByUserId.mockResolvedValueOnce(staffRow);
    const rows = await listStaff(ctx);
    expect(rows).toHaveLength(1);
    expect(repos.staff.list).not.toHaveBeenCalled();
  });

  it("TEACHER cannot read another teacher's profile (ForbiddenError)", async () => {
    const { ctx, repos } = makeCtx(teacher);
    repos.staff.findById.mockResolvedValueOnce({ ...staffRow, userId: "u-other" });
    await expect(getStaff(ctx, "sf-1")).rejects.toThrow(ForbiddenError);
  });
});

/* ---- documents — metadata + type visibility + signed URLs ---- */

describe("student documents — visibility and storage", () => {
  it("TEACHER sees only PHOTO documents in a list (type filter)", async () => {
    const { ctx } = makeCtx(teacher);
    const docs = await listDocuments(ctx, "st-1");
    expect(docs.map((d2) => d2.type)).toEqual(["PHOTO"]);
  });

  it("PARENT of the child sees every type", async () => {
    const { ctx } = makeCtx(parent);
    const docs = await listDocuments(ctx, "st-1");
    expect(docs.map((d2) => d2.type)).toEqual(["PHOTO", "AADHAAR"]);
  });

  it("TEACHER cannot fetch a hidden type by id (ForbiddenError)", async () => {
    const { ctx, repos } = makeCtx(teacher);
    repos.studentDocuments.findById.mockResolvedValueOnce(aadhaarDoc);
    await expect(getDocument(ctx, "doc-aadhaar")).rejects.toThrow(ForbiddenError);
  });

  it("upload records the actor and audits", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    await uploadDocument(ctx, {
      studentId: "st-1",
      type: "PHOTO",
      storagePath: "s-1/st-1/x.jpg",
      fileName: "x.jpg",
    });
    expect(repos.studentDocuments.create).toHaveBeenCalledWith(
      expect.objectContaining({ uploadedByUserId: "u-office" }),
    );
    expect(repos.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "STUDENT_DOCUMENT_UPLOAD" }),
    );
  });

  it("replace bumps the version (versioning-ready metadata)", async () => {
    const { ctx, repos } = makeCtx(officeAdmin);
    const dto = await replaceDocument(ctx, "doc-photo", {
      storagePath: "s-1/st-1/y.jpg",
      fileName: "y.jpg",
    });
    expect(repos.studentDocuments.update).toHaveBeenCalledWith(
      "doc-photo",
      expect.objectContaining({ version: 2 }),
    );
    expect(dto.version).toBe(2);
  });

  it("mints an upload URL with a server-chosen, school-namespaced path (ADR-004)", async () => {
    const { ctx } = makeCtx(officeAdmin);
    const storage = makeStorage();
    const minted = await mintDocumentUploadUrl(ctx, storage, {
      studentId: "st-1",
      fileName: "birth cert.pdf",
    });
    expect(minted.storagePath).toMatch(/^s-1\/st-1\//);
    expect(storage.createSignedUploadUrl).toHaveBeenCalledWith(
      "student-documents",
      minted.storagePath,
    );
  });

  it("TEACHER cannot mint upload URLs (ForbiddenError, storage untouched)", async () => {
    const { ctx } = makeCtx(teacher);
    const storage = makeStorage();
    await expect(
      mintDocumentUploadUrl(ctx, storage, { studentId: "st-1", fileName: "x.jpg" }),
    ).rejects.toThrow(ForbiddenError);
    expect(storage.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("download-URL mint re-checks type visibility BEFORE any URL exists (teacher + AADHAAR)", async () => {
    const { ctx, repos } = makeCtx(teacher);
    repos.studentDocuments.findById.mockResolvedValueOnce(aadhaarDoc);
    const storage = makeStorage();
    await expect(mintDocumentDownloadUrl(ctx, storage, "doc-aadhaar")).rejects.toThrow(
      ForbiddenError,
    );
    expect(storage.createSignedDownloadUrl).not.toHaveBeenCalled();
  });

  it("mints a short-lived download URL for an authorized reader", async () => {
    const { ctx } = makeCtx(superAdmin);
    const storage = makeStorage();
    const result = await mintDocumentDownloadUrl(ctx, storage, "doc-photo");
    expect(result).toMatchObject({ url: "https://download", fileName: "photo.jpg" });
    expect(storage.createSignedDownloadUrl).toHaveBeenCalledWith(
      "student-documents",
      photoDoc.storagePath,
      300,
    );
  });

  it("PARENT cannot list another family's documents (ForbiddenError)", async () => {
    const { ctx, repos } = makeCtx(parent);
    repos.students.findById.mockResolvedValueOnce({ ...studentRow, id: "st-strange" });
    await expect(listDocuments(ctx, "st-strange")).rejects.toThrow(ForbiddenError);
  });
});
