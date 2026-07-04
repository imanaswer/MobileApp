# Current Milestone

**M1 — Authentication & User Profiles**

## Current Step

**Steps 1–11 complete — milestone awaiting user sign-off.** Do not begin M2.

## Scope (M1)

Authentication · Authorization · User Profiles · Session management.
Roles: SUPER_ADMIN, OFFICE_ADMIN, TEACHER, PARENT, ACCOUNTANT (students don't log in; class-teacher is an assignment, not a role).

## Out of scope

Students, attendance, classes, exams, homework, fees, notifications delivery, and any CRUD for school entities — those are M2+.

## Deliverables (remaining)

None — Steps 1–11 delivered. Validation: typecheck 14/14 · lint 14/14 · tests 7 suites / 80 total · web build.

## Stop conditions

M1 is code-complete. **Stop and wait for approval** before M2 or milestone archival (M0-style tag).

## Milestone-level blockers (go-live, not code)

Provisioning (Supabase Admin API) + seed super-admin + SMS provider pending before real sign-in/OTP; Supabase dashboard security checklist (`docs/SECURITY_REVIEW_M1.md`) to apply at provisioning.
Source of truth: **Dev PRD v1.3**.
