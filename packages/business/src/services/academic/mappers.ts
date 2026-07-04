import type {
  AcademicTerm,
  AcademicYear,
  Class,
  Section,
  Subject,
  TeacherAssignment,
} from "@repo/db";
import type {
  AcademicTermDto,
  AcademicYearDto,
  ClassDto,
  IstDateString,
  SectionDto,
  SubjectDto,
  TeacherAssignmentDto,
} from "@repo/types";

/** @db.Date row value → YYYY-MM-DD IST calendar string (stored date-only at UTC midnight). */
function toIstDate(date: Date): IstDateString {
  return date.toISOString().slice(0, 10) as IstDateString;
}

export function mapAcademicYear(row: AcademicYear): AcademicYearDto {
  return {
    id: row.id,
    schoolId: row.schoolId,
    name: row.name,
    startDate: toIstDate(row.startDate),
    endDate: toIstDate(row.endDate),
    status: row.status,
  };
}

export function mapAcademicTerm(row: AcademicTerm): AcademicTermDto {
  return {
    id: row.id,
    academicYearId: row.academicYearId,
    name: row.name,
    startDate: toIstDate(row.startDate),
    endDate: toIstDate(row.endDate),
  };
}

export function mapClass(row: Class): ClassDto {
  return { id: row.id, schoolId: row.schoolId, name: row.name, sortOrder: row.sortOrder };
}

export function mapSection(row: Section): SectionDto {
  return { id: row.id, classId: row.classId, name: row.name };
}

export function mapSubject(row: Subject): SubjectDto {
  return { id: row.id, schoolId: row.schoolId, name: row.name };
}

export function mapTeacherAssignment(row: TeacherAssignment): TeacherAssignmentDto {
  return {
    id: row.id,
    schoolId: row.schoolId,
    teacherId: row.teacherId,
    subjectId: row.subjectId,
    sectionId: row.sectionId,
  };
}
