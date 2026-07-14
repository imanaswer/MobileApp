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
  createAnnouncementAttachmentRepository,
  type AnnouncementAttachmentRepository,
} from "./repositories/announcement-attachment.repository";
import {
  createAnnouncementRepository,
  type AnnouncementRepository,
} from "./repositories/announcement.repository";
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
import {
  createBehaviourIncidentRepository,
  type BehaviourIncidentRepository,
} from "./repositories/behaviour-incident.repository";
import {
  createBellScheduleRepository,
  type BellScheduleRepository,
} from "./repositories/bell-schedule.repository";
import {
  createBrandingSettingsRepository,
  type BrandingSettingsRepository,
} from "./repositories/branding-settings.repository";
import {
  createCalendarEventRepository,
  type CalendarEventRepository,
} from "./repositories/calendar-event.repository";
import {
  createClassTeacherAssignmentRepository,
  type ClassTeacherAssignmentRepository,
} from "./repositories/class-teacher-assignment.repository";
import { createClassRepository, type ClassRepository } from "./repositories/class.repository";
import {
  createDeviceTokenRepository,
  type DeviceTokenRepository,
} from "./repositories/device-token.repository";
import {
  createDocumentTemplateRepository,
  type DocumentTemplateRepository,
} from "./repositories/document-template.repository";
import {
  createDocumentRepository,
  type DocumentRepository,
} from "./repositories/document.repository";
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
  createFeeStructureRepository,
  type FeeStructureRepository,
} from "./repositories/fee-structure.repository";
import {
  createGradeScaleRepository,
  type GradeScaleRepository,
} from "./repositories/grade-scale.repository";
import { createHolidayRepository, type HolidayRepository } from "./repositories/holiday.repository";
import {
  createHomeworkAttachmentRepository,
  type HomeworkAttachmentRepository,
} from "./repositories/homework-attachment.repository";
import {
  createHomeworkFeedbackRepository,
  type HomeworkFeedbackRepository,
} from "./repositories/homework-feedback.repository";
import {
  createHomeworkSubmissionRepository,
  type HomeworkSubmissionRepository,
} from "./repositories/homework-submission.repository";
import {
  createHomeworkRepository,
  type HomeworkRepository,
} from "./repositories/homework.repository";
import { createInvoiceRepository, type InvoiceRepository } from "./repositories/invoice.repository";
import {
  createLeaveRequestRepository,
  type LeaveRequestRepository,
} from "./repositories/leave-request.repository";
import { createMarkRepository, type MarkRepository } from "./repositories/mark.repository";
import { createMessageRepository, type MessageRepository } from "./repositories/message.repository";
import {
  createNotificationRecipientRepository,
  type NotificationRecipientRepository,
} from "./repositories/notification-recipient.repository";
import {
  createNotificationRepository,
  type NotificationRepository,
} from "./repositories/notification.repository";
import { createParentRepository, type ParentRepository } from "./repositories/parent.repository";
import { createPaymentRepository, type PaymentRepository } from "./repositories/payment.repository";
import { createPeriodRepository, type PeriodRepository } from "./repositories/period.repository";
import {
  createReportCardRepository,
  type ReportCardRepository,
} from "./repositories/report-card.repository";
import {
  createSchoolSettingsRepository,
  type SchoolSettingsRepository,
} from "./repositories/school-settings.repository";
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
  createSubmissionAttachmentRepository,
  type SubmissionAttachmentRepository,
} from "./repositories/submission-attachment.repository";
import {
  createSystemSettingsRepository,
  type SystemSettingsRepository,
} from "./repositories/system-settings.repository";
import {
  createTeacherAssignmentRepository,
  type TeacherAssignmentRepository,
} from "./repositories/teacher-assignment.repository";
import {
  createTimetableEntryRepository,
  type TimetableEntryRepository,
} from "./repositories/timetable-entry.repository";
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
export * from "./repositories/class-teacher-assignment.repository";
export * from "./repositories/document.repository";
export * from "./repositories/document-template.repository";
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
export * from "./repositories/homework.repository";
export * from "./repositories/homework-attachment.repository";
export * from "./repositories/homework-submission.repository";
export * from "./repositories/submission-attachment.repository";
export * from "./repositories/homework-feedback.repository";
export * from "./repositories/report-card.repository";
export * from "./repositories/bell-schedule.repository";
export * from "./repositories/period.repository";
export * from "./repositories/timetable-entry.repository";
export * from "./repositories/notification.repository";
export * from "./repositories/notification-recipient.repository";
export * from "./repositories/device-token.repository";
export * from "./repositories/announcement.repository";
export * from "./repositories/announcement-attachment.repository";
export * from "./repositories/calendar-event.repository";
export * from "./repositories/behaviour-incident.repository";
export * from "./repositories/message.repository";
export * from "./repositories/fee-structure.repository";
export * from "./repositories/invoice.repository";
export * from "./repositories/payment.repository";
export * from "./repositories/branding-settings.repository";
export * from "./repositories/school-settings.repository";
export * from "./repositories/system-settings.repository";
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
  classTeacherAssignments: ClassTeacherAssignmentRepository;
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
  homework: HomeworkRepository;
  homeworkAttachments: HomeworkAttachmentRepository;
  homeworkSubmissions: HomeworkSubmissionRepository;
  submissionAttachments: SubmissionAttachmentRepository;
  homeworkFeedback: HomeworkFeedbackRepository;
  reportCards: ReportCardRepository;
  bellSchedules: BellScheduleRepository;
  periods: PeriodRepository;
  timetableEntries: TimetableEntryRepository;
  notifications: NotificationRepository;
  notificationRecipients: NotificationRecipientRepository;
  deviceTokens: DeviceTokenRepository;
  announcements: AnnouncementRepository;
  announcementAttachments: AnnouncementAttachmentRepository;
  calendarEvents: CalendarEventRepository;
  behaviourIncidents: BehaviourIncidentRepository;
  messages: MessageRepository;
  feeStructures: FeeStructureRepository;
  invoices: InvoiceRepository;
  payments: PaymentRepository;
  documents: DocumentRepository;
  documentTemplates: DocumentTemplateRepository;
  brandingSettings: BrandingSettingsRepository;
  schoolSettings: SchoolSettingsRepository;
  systemSettings: SystemSettingsRepository;
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
    classTeacherAssignments: createClassTeacherAssignmentRepository(client),
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
    homework: createHomeworkRepository(client),
    homeworkAttachments: createHomeworkAttachmentRepository(client),
    homeworkSubmissions: createHomeworkSubmissionRepository(client),
    submissionAttachments: createSubmissionAttachmentRepository(client),
    homeworkFeedback: createHomeworkFeedbackRepository(client),
    reportCards: createReportCardRepository(client),
    bellSchedules: createBellScheduleRepository(client),
    periods: createPeriodRepository(client),
    timetableEntries: createTimetableEntryRepository(client),
    notifications: createNotificationRepository(client),
    notificationRecipients: createNotificationRecipientRepository(client),
    deviceTokens: createDeviceTokenRepository(client),
    announcements: createAnnouncementRepository(client),
    announcementAttachments: createAnnouncementAttachmentRepository(client),
    calendarEvents: createCalendarEventRepository(client),
    behaviourIncidents: createBehaviourIncidentRepository(client),
    messages: createMessageRepository(client),
    feeStructures: createFeeStructureRepository(client),
    invoices: createInvoiceRepository(client),
    payments: createPaymentRepository(client),
    documents: createDocumentRepository(client),
    documentTemplates: createDocumentTemplateRepository(client),
    brandingSettings: createBrandingSettingsRepository(client),
    schoolSettings: createSchoolSettingsRepository(client),
    systemSettings: createSystemSettingsRepository(client),
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
