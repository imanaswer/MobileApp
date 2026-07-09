# Status — Exams, Marks & Grades

- **Status:** M5 shipped (Examination & Assessment) — awaiting approval
- **Current milestone:** M5 (ADR-012, extends ADR-011) — see `docs/milestones/M5.md`
- **Completion:** exams / assessments / registers / marks / grades / GPA-foundation = done; report-card PDFs + promotion + CGPA-across-years = later milestones
- **Dependencies:** Authentication (frozen), People (Enrollment is the mark key), academic structure (Subject/Section/TeacherAssignment), Attendance (ADR-011 patterns reused)
- **Frozen?** No (freezes on approval)
- **Delivered:** `Exam → Assessment → ExamSection (register) → Mark` on Enrollment; forward-only `DRAFT→SUBMITTED→LOCKED` lock per register + `publish` per exam (parents never see a partial); central grade compute (`@repo/core/grade`) **snapshotted at lock**; configurable `GradeScale`/`GradeBand` (percent bands, nullable gradePoint, non-overlap `EXCLUDE`); GPA from snapshots only. 4 routers / 21 procedures; RLS defense-in-depth; teacher mobile mark-entry + parent results; admin web console (dashboard, assessment CRUD, marks grid, lock/unlock, publish with R3 count, grade-scale management, CSV).
- **Known issues / deferred:** report cards (`ReportCard.examId` optional + partial unique, ADR-009) not built; publish sends **no notification** (M5 excludes notifications); GPA is active-year (CGPA-across-years is foundation-only); exam attempts/re-exams design-compatible but not built.
- **Spec:** Dev PRD v1.3 §8.5 + **ADR-012** (source of truth; naming diverges from PRD — `Assessment` not `ExamSubject`, `ExamType` enum, `maxPractical` nullable).
