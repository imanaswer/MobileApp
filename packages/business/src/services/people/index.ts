/**
 * People Management use-cases (M3). Student is identity-only; Enrollment owns
 * per-year placement (ADR-010). Every mutation runs permission → scope → rule
 * checks, then writes the change AND its AuditLog row in one transaction
 * (ADR-007). Reads apply row-scope (teacher → own-section, parent → own-child)
 * and, for documents, a type filter (teacher → PHOTO only).
 */
export {
  listStudents,
  getStudent,
  createStudent,
  updateStudent,
  archiveStudent,
  type CreateStudentInput,
  type UpdateStudentInput,
} from "./student.service";
export {
  listEnrollmentsByStudent,
  sectionRoster,
  enroll,
  transfer,
  withdraw,
  promote,
  type EnrollInput,
  type TransferInput,
  type PromoteInput,
} from "./enrollment.service";
export {
  listParents,
  getParent,
  createParent,
  updateParent,
  deleteParent,
  linkParent,
  unlinkParent,
  listGuardians,
  type CreateParentInput,
  type UpdateParentInput,
  type LinkParentInput,
  type UnlinkParentInput,
} from "./parent.service";
export {
  listStaff,
  getStaff,
  createStaff,
  updateStaff,
  deleteStaff,
  type CreateStaffInput,
  type UpdateStaffInput,
} from "./staff.service";
export {
  listDocuments,
  getDocument,
  uploadDocument,
  replaceDocument,
  deleteDocument,
  assertDocumentTypeVisible,
  type UploadDocumentInput,
  type ReplaceDocumentInput,
} from "./student-document.service";
