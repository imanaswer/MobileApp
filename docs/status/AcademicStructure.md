# Status — Academic Structure

- **Status:** Implemented (M2 Steps 1–10 complete) — awaiting milestone approval
- **Current milestone:** M2 (Academic Foundation)
- **Completion:** 100% of M2 scope
- **Dependencies:** Authentication (frozen), M1.5 live Supabase (migrations applied)
- **Frozen?** No (freezes on M2 approval)
- **Known issues:** web lists paginate client-side over bounded full lists.
- **Teacher names (M8, ADR-016):** `Staff.name` now exists; the class-teacher picker + column and the
  teacher-profile directory show the teacher's **name** (employeeId secondary). Assignment forms still take
  a user id where no picker exists, but displays resolve names via `teacherName`/`StaffDto.name`.
- **Next work:** M3 — people records (Student/Guardian/Staff), enrollment,
  teacher picker, year-scoped assignments if needed. (The class-teacher concept
  shipped in **M6.5** as the dedicated `ClassTeacherAssignment` model — NOT a
  `TeacherAssignment` flag; see `docs/status/ClassTeacher.md`, ADR-015.)
- **Spec:** M2 kickoff brief · `docs/features/academic-structure.md` · `docs/milestones/M2.md`.
