import { prisma } from "./client";
import type { DbClient } from "./db-client";
import {
  createAcademicTermRepository,
  type AcademicTermRepository,
} from "./repositories/academic-term.repository";
import {
  createAcademicYearRepository,
  type AcademicYearRepository,
} from "./repositories/academic-year.repository";
import {
  createAssessmentRepository,
  type AssessmentRepository,
} from "./repositories/assessment.repository";
import {
  createAttendanceCorrectionRepository,
  type AttendanceCorrectionRepository,
} from "./repositories/attendance-correction.repository";
import {
  createAttendanceRecordRepository,
  type AttendanceRecordRepository,
} from "./repositories/attendance-record.repository";
import {
  createAttendanceSessionRepository,
  type AttendanceSessionRepository,
} from "./repositories/attendance-session.repository";
import { createAuditLogRepository, type AuditLogRepository } from "./repositories/audit.repository";
import { createClassRepository, type ClassRepository } from "./repositories/class.repository";
import {
  createEnrollmentRepository,
  type EnrollmentRepository,
} from "./repositories/enrollment.repository";
import {
  createExamSectionRepository,
  type ExamSectionRepository,
} from "./repositories/exam-section.repository";
import { createExamRepository, type ExamRepository } from "./repositories/exam.repository";
import {
  createGradeScaleRepository,
  type GradeScaleRepository,
} from "./repositories/grade-scale.repository";
import { createHolidayRepository, type HolidayRepository } from "./repositories/holiday.repository";
import {
  createLeaveRequestRepository,
  type LeaveRequestRepository,
} from "./repositories/leave-request.repository";
import { createMarkRepository, type MarkRepository } from "./repositories/mark.repository";
import { createParentRepository, type ParentRepository } from "./repositories/parent.repository";
import { createSectionRepository, type SectionRepository } from "./repositories/section.repository";
import { createStaffRepository, type StaffRepository } from "./repositories/staff.repository";
import {
  createStudentDocumentRepository,
  type StudentDocumentRepository,
} from "./repositories/student-document.repository";
import {
  createStudentParentRepository,
  type StudentParentRepository,
} from "./repositories/student-parent.repository";
import { createStudentRepository, type StudentRepository } from "./repositories/student.repository";
import { createSubjectRepository, type SubjectRepository } from "./repositories/subject.repository";
import {
  createTeacherAssignmentRepository,
  type TeacherAssignmentRepository,
} from "./repositories/teacher-assignment.repository";
import { createUserRepository, type UserRepository } from "./repositories/user.repository";

/**
 * Repository composition (ADR-003). `createRepositories` is a pure DI factory —
 * given a client, it builds the repository set — NOT a global service locator.
 * The composition root (`@repo/business`) calls it once with the Prisma singleton;
 * `withTransaction` calls it per-transaction with the transaction client.
 */
export * from "./repositories/user.repository";
export * from "./repositories/audit.repository";
export * from "./repositories/school.repository";
export * from "./repositories/academic-year.repository";
export * from "./repositories/academic-term.repository";
export * from "./repositories/class.repository";
export * from "./repositories/section.repository";
export * from "./repositories/subject.repository";
export * from "./repositories/teacher-assignment.repository";
export * from "./repositories/student.repository";
export * from "./repositories/enrollment.repository";
export * from "./repositories/parent.repository";
export * from "./repositories/student-parent.repository";
export * from "./repositories/staff.repository";
export * from "./repositories/student-document.repository";
export * from "./repositories/attendance-session.repository";
export * from "./repositories/attendance-record.repository";
export * from "./repositories/leave-request.repository";
export * from "./repositories/attendance-correction.repository";
export * from "./repositories/holiday.repository";
export * from "./repositories/exam.repository";
export * from "./repositories/assessment.repository";
export * from "./repositories/exam-section.repository";
export * from "./repositories/mark.repository";
export * from "./repositories/grade-scale.repository";
export type { DbClient } from "./db-client";

/** Aggregate of repositories injected into services via `ServiceContext`. */
export interface Repositories {
  users: UserRepository;
  audit: AuditLogRepository;
  academicYears: AcademicYearRepository;
  academicTerms: AcademicTermRepository;
  classes: ClassRepository;
  sections: SectionRepository;
  subjects: SubjectRepository;
  teacherAssignments: TeacherAssignmentRepository;
  students: StudentRepository;
  enrollments: EnrollmentRepository;
  parents: ParentRepository;
  studentParents: StudentParentRepository;
  staff: StaffRepository;
  studentDocuments: StudentDocumentRepository;
  attendanceSessions: AttendanceSessionRepository;
  attendanceRecords: AttendanceRecordRepository;
  leaveRequests: LeaveRequestRepository;
  attendanceCorrections: AttendanceCorrectionRepository;
  holidays: HolidayRepository;
  exams: ExamRepository;
  assessments: AssessmentRepository;
  examSections: ExamSectionRepository;
  marks: MarkRepository;
  gradeScales: GradeScaleRepository;
}

export function createRepositories(client: DbClient): Repositories {
  return {
    users: createUserRepository(client),
    audit: createAuditLogRepository(client),
    academicYears: createAcademicYearRepository(client),
    academicTerms: createAcademicTermRepository(client),
    classes: createClassRepository(client),
    sections: createSectionRepository(client),
    subjects: createSubjectRepository(client),
    teacherAssignments: createTeacherAssignmentRepository(client),
    students: createStudentRepository(client),
    enrollments: createEnrollmentRepository(client),
    parents: createParentRepository(client),
    studentParents: createStudentParentRepository(client),
    staff: createStaffRepository(client),
    studentDocuments: createStudentDocumentRepository(client),
    attendanceSessions: createAttendanceSessionRepository(client),
    attendanceRecords: createAttendanceRecordRepository(client),
    leaveRequests: createLeaveRequestRepository(client),
    attendanceCorrections: createAttendanceCorrectionRepository(client),
    holidays: createHolidayRepository(client),
    exams: createExamRepository(client),
    assessments: createAssessmentRepository(client),
    examSections: createExamSectionRepository(client),
    marks: createMarkRepository(client),
    gradeScales: createGradeScaleRepository(client),
  };
}

/**
 * Unit of work: run `fn` inside a single DB transaction with repositories bound
 * to the transaction client, so a mutation and its `AuditLog` row commit
 * atomically (DATABASE_CONVENTIONS §11). No Prisma is exposed outside `db`.
 */
export function withTransaction<T>(fn: (repos: Repositories) => Promise<T>): Promise<T> {
  return prisma.$transaction((tx) => fn(createRepositories(tx)));
}
