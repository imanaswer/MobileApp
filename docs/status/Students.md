# Status — Students / People

- **Status:** Implemented (M3 Steps 1–10 complete, awaiting approval)
- **Current milestone:** M3 — People Management
- **Completion:** 100% of M3 scope (students, parents + links, staff profiles, enrollment, documents)
- **Dependencies:** Authentication (frozen), Academic structure (M2, frozen), private `student-documents` bucket (runbook §3b — manual provisioning pending)
- **Frozen?** Not yet (freezes on M3 approval)
- **Known issues:** document delete removes metadata only (bytes stay until storage cleanup); staff/assignment forms take a raw user id (no user-directory API); parents see raw ids for class/section names on mobile (no `academic:read`)
- **Next work:** M4 — Attendance (marks against Enrollment rows). Future: bulk import, guardian invites, class-teacher flag, `promoteBulk`.
- **Spec:** M3 kickoff brief · ADR-010 · `docs/features/people-management.md`.
