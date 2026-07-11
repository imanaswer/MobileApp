# Status — Class Teacher Management

- **Status:** Implemented (M6.5 Steps 1–10 complete) — awaiting milestone approval
- **Current milestone:** M6.5 (Class Teacher Management) — introduced to supply the
  architectural dependency report cards (M7/ADR-014) need; **not** part of report cards.
- **Completion:** 100% of M6.5 scope
- **Spec / decision:** `docs/architecture/ADR-015-class-teacher-assignment.md` · `docs/milestones/M6.5.md`
- **Model:** `ClassTeacherAssignment` — the CURRENT holder of a `(academicYear × section)`
  slot → ONE teacher. Dedicated model, **not** a `TeacherAssignment.isClassTeacher` flag
  (a teacher may teach several subjects in a section, and a class teacher may teach none).
  `teacherId → User` (matches TeacherAssignment + RLS `auth.uid()`), `createdByStaffId → Staff`
  (B3 actor), `assignedAt` = when the current teacher took the slot. `@@unique(academicYearId, sectionId)`.
- **Lifecycle:** Assign · Replace (in-place update, never a 2nd row — ADR-010 §5) · Remove · Get.
  History = per-year rows (cross-year) + `AuditLog` before/after (within-year replacement). No `endedAt`, no `isActive`.
- **Surface:** business (`class-teacher.service.ts`) · `classTeacher` tRPC router (get/assign/replace/remove) ·
  web management page (`academic/class-teachers`, teacher picker reuses `teacherProfile.list`) ·
  mobile read-only display (`academic/class-teachers`). Managed under `academic:manage`; read `academic:read`.
- **Tests:** 21 business + 11 API transport = 32; RLS isolation proven (admin ALL / teacher own /
  parent+anon none / teacher-write denied); DB invariants proven (unique blocks 2nd row, FK RESTRICT,
  in-place replace). Full gate 35/35.
- **Frozen?** No (freezes on M6.5 approval). `TeacherAssignment` remained frozen; change is purely additive.
- **Teacher display name:** RESOLVED in **M8 (ADR-016)** — `Staff.name` now exists; `ClassTeacherAssignmentDto`
  carries `teacherName` (joined server-side), so the class-teacher table + picker show the teacher's name
  (employeeId secondary), not a raw id.
- **Known limitations:** the `classTeacher` scope is not yet wired into M4 leave/correction DECIDE (those
  stay admin-only, unchanged).
- **Next work:** M7 report cards consume `assertClassTeacherOfEnrollment` for teacher-remark authorship.
