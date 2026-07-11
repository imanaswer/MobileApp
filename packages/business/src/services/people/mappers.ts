import type { Enrollment, Parent, Staff, Student, StudentDocument, StudentParent } from "@repo/db";
import type {
  EnrollmentDto,
  IsoUtcString,
  IstDateString,
  ParentDto,
  StaffDto,
  StudentDocumentDto,
  StudentDto,
  StudentParentDto,
} from "@repo/types";

/** @db.Date → YYYY-MM-DD IST string (or null). */
function toIstDate(date: Date | null): IstDateString | null {
  return date ? (date.toISOString().slice(0, 10) as IstDateString) : null;
}

/** timestamp → UTC ISO string (rendered to IST at the edge). */
function toIso(date: Date): IsoUtcString {
  return date.toISOString() as IsoUtcString;
}

export function mapStudent(r: Student): StudentDto {
  return {
    id: r.id,
    schoolId: r.schoolId,
    admissionNo: r.admissionNo,
    firstName: r.firstName,
    lastName: r.lastName,
    dob: toIstDate(r.dob),
    gender: r.gender,
    bloodGroup: r.bloodGroup,
    nationality: r.nationality,
    aadhaar: r.aadhaar,
    passport: r.passport,
    address: r.address,
    photoPath: r.photoPath,
    status: r.status,
  };
}

export function mapEnrollment(r: Enrollment): EnrollmentDto {
  return {
    id: r.id,
    schoolId: r.schoolId,
    studentId: r.studentId,
    academicYearId: r.academicYearId,
    classId: r.classId,
    sectionId: r.sectionId,
    rollNo: r.rollNo,
    status: r.status,
  };
}

export function mapParent(r: Parent): ParentDto {
  return {
    id: r.id,
    schoolId: r.schoolId,
    userId: r.userId,
    name: r.name,
    phone: r.phone,
    email: r.email,
    occupation: r.occupation,
    address: r.address,
    preferredContact: r.preferredContact,
  };
}

export function mapStudentParent(r: StudentParent): StudentParentDto {
  return {
    studentId: r.studentId,
    parentId: r.parentId,
    relationship: r.relationship,
    isPrimary: r.isPrimary,
  };
}

export function mapStaff(r: Staff): StaffDto {
  return {
    id: r.id,
    schoolId: r.schoolId,
    userId: r.userId,
    name: r.name,
    employeeId: r.employeeId,
    department: r.department,
    qualification: r.qualification,
    experienceYears: r.experienceYears,
    joiningDate: toIstDate(r.joiningDate),
    bio: r.bio,
    photoPath: r.photoPath,
  };
}

export function mapStudentDocument(r: StudentDocument): StudentDocumentDto {
  return {
    id: r.id,
    schoolId: r.schoolId,
    studentId: r.studentId,
    type: r.type,
    storagePath: r.storagePath,
    fileName: r.fileName,
    mimeType: r.mimeType,
    sizeBytes: r.sizeBytes,
    checksum: r.checksum,
    version: r.version,
    uploadedByUserId: r.uploadedByUserId,
    uploadedAt: toIso(r.createdAt),
  };
}
