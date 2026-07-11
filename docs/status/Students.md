# Status — Students / People

- **Status:** Implemented (M3 Steps 1–10 complete, awaiting approval)
- **Current milestone:** M3 — People Management
- **Completion:** 100% of M3 scope (students, parents + links, staff profiles, enrollment, documents)
- **Dependencies:** Authentication (frozen), Academic structure (M2, frozen), private `student-documents` bucket (runbook §3b — manual provisioning pending)
- **Frozen?** Not yet (freezes on M3 approval)
- **Known issues:** document delete removes metadata only (bytes stay until storage cleanup); staff/assignment forms take a raw user id (no user-directory API).
- **Names (M8, ADR-016):** `enrollment.listByStudent` now returns `academicYearName`/`className`/`sectionName` (joined server-side inside the parent-scoped read), so parents see real year/class/section labels on mobile **without `academic:read`** — the former raw-cuid fallback is gone (F5). Staff have a `name` field; teacher pickers/lists show it.
- **Next work:** M4 — Attendance (marks against Enrollment rows). Future: bulk import, guardian invites, class-teacher flag, `promoteBulk`.
- **Spec:** M3 kickoff brief · ADR-010 · `docs/features/people-management.md`.
