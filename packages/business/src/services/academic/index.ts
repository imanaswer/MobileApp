/**
 * Academic-structure use-cases (M2). Each mutation runs permission + rule checks,
 * then writes the change AND its AuditLog row in one transaction (ADR-007).
 * Routers (Step 5) import these functions directly, as the M1 auth router does.
 */
export {
  listAcademicYears,
  getAcademicYear,
  createAcademicYear,
  updateAcademicYear,
  deleteAcademicYear,
  type CreateAcademicYearInput,
  type UpdateAcademicYearInput,
} from "./academic-year.service";
export {
  listAcademicTerms,
  getAcademicTerm,
  createAcademicTerm,
  updateAcademicTerm,
  deleteAcademicTerm,
  type CreateAcademicTermInput,
  type UpdateAcademicTermInput,
} from "./academic-term.service";
export {
  listClasses,
  getClass,
  createClass,
  updateClass,
  deleteClass,
  type CreateClassInput,
  type UpdateClassInput,
} from "./class.service";
export {
  listSections,
  getSection,
  createSection,
  updateSection,
  deleteSection,
  type CreateSectionInput,
  type UpdateSectionInput,
} from "./section.service";
export {
  listSubjects,
  getSubject,
  createSubject,
  updateSubject,
  deleteSubject,
  type CreateSubjectInput,
  type UpdateSubjectInput,
} from "./subject.service";
export {
  listTeacherAssignments,
  getTeacherAssignment,
  createTeacherAssignment,
  deleteTeacherAssignment,
  type CreateTeacherAssignmentInput,
  type ListTeacherAssignmentsFilter,
} from "./teacher-assignment.service";
