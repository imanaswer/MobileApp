# Status — Timetable Management

- **Status:** Implemented (M9 Steps 1–10 complete) — awaiting milestone approval
- **Current milestone:** M9 (Timetable Management) — a new read-mostly domain over frozen M1–M8.
- **Completion:** 100% of M9 scope
- **Spec / decision:** `docs/architecture/ADR-017-timetable-management.md` · `docs/milestones/M9.md` · `docs/features/timetable.md`
- **Models:** `BellSchedule` (one per year, `@@unique(schoolId, academicYearId)`) → `Period` (numbered
  clock-time slot, `@@unique(bellScheduleId, order)`, `@db.Time`, `isBreak`, CHECK `start<end AND order>0`)
  → `TimetableEntry` (section×weekday×period → subject+teacher+room). `enum Weekday` (Mon–Sun). All FKs
  **Restrict**, no cascade.
- **Ownership:** DERIVED from `TeacherAssignment(teacher, subject, section)` at write time — **never**
  `ClassTeacherAssignment` (hard rule). No `ownerStaffId` column; `AuditLog.actorUserId` carries the actor
  (no `createdByStaffId` on the entry).
- **Conflict:** section + teacher double-booking are **structurally impossible** (two DB uniques, friendly
  business pre-checks that exclude self on update); period overlap / order clash / cross-year / no-class-on-
  break are business-layer.
- **Surface:** business (`services/timetable/*`) · `bellSchedule`/`period`/`timetable` tRPC routers (14
  procedures) · mobile read-only `/timetable` + home today-card · web admin console `/timetable` (schedule/
  grid/teachers tabs, CSV export). Managed under `timetable:manage`; read `timetable:read`. **Permission-only
  (no feature flag)** — ADR-017 §4 (no flag infrastructure exists; the ADR-013/M6 precedent).
- **Reads:** enriched server-side (subject/teacher/section names + period timing, batched — no N+1, ADR-016);
  `academicYearId` optional (defaults to the ACTIVE year — parents have no `academic:read`); teacher defaults
  to the caller (own slots only).
- **Tests:** 22 business (conflict matrix / ownership / validation / read scope / active-year) + 11 API
  transport = 33. Migration additive + zero drift (Step 2); delete-rule probes 6/6 Restrict + TeacherAssignment
  allowed (Step 3); RLS isolation proven — Teacher A ≠ Teacher B, parent ≠ other section (Step 4). Full gate green.
- **Frozen?** No (freezes on M9 approval). M1–M8 remained frozen; the change is purely additive (proven by `migrate diff`).
- **Known limitations:** one bell schedule per year (a half-day schedule is a future additive migration);
  teacher reads **own slots only**, not the full section grid (the isolation proof requires it); the web grid
  columns default to **Mon–Sat** (no working-days config in M9); deleting a `TeacherAssignment` that backs a
  timetable entry is **not** DB-blocked (derived ownership) — the orphaned entry surfaces the missing
  assignment on its next edit (business guard, not a frozen-path change).
- **Next work:** notifications on timetable changes; substitute teachers; recurring templates — all deferred.
