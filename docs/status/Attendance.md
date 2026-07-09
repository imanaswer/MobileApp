# Status — Attendance

- **Status:** Implemented (M4 Steps 1–10 complete, awaiting approval)
- **Current milestone:** M4 — Attendance Management
- **Completion:** 100% of M4 scope (session/record model, leave, corrections, holidays, compute-on-read summary)
- **Dependencies:** Authentication (frozen), Academic structure (M2, frozen), People/Enrollment (M3), a `Staff` row per marking user (REVIEW_FINDINGS B3 provisioning invariant)
- **Frozen?** Not yet (freezes on M4 approval)
- **Known issues / limitations:**
  - **Holiday = hard block, no override in M4** — an admin cannot record attendance on a holiday even for an emergency make-up day (the working-day override layer is designed-in but unbuilt, ADR-011 §9). **Needs sign-off.**
  - Daily-session teacher scope is section-level (any assignment), not class-teacher — the class-teacher flag is still deferred (M3 open item).
  - Absence-push and scheduled %-rollup jobs are out of M4 (notification/analytics milestones).
  - Subject/period attendance is schema-ready (`sessionType=SUBJECT`) but daily-first in the UI.
  - Mobile calendar is a chronological list (not a grid); `todayIst()` uses the device locale (fine for a single-tz IST school).
- **Next work:** M5 — Homework & Assignments (hangs off Enrollment/section, same patterns).
- **Spec:** M4 kickoff brief · ADR-011 · `docs/features/attendance.md`.
