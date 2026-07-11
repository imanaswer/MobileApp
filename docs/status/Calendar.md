# Status — School Calendar

- **Status:** Implemented (M11 Steps 1–9 complete) — awaiting milestone approval.
- **Current milestone:** M11 (Announcements, Circulars & School Calendar).
- **Completion:** 100% of M11 calendar scope.
- **Spec / decision:** `docs/architecture/ADR-019-announcements-circulars-calendar.md` · `docs/milestones/M11.md` ·
  `docs/features/calendar.md`
- **Model:** `SchoolCalendarEvent` (schoolId, academicYearId, title, description?, eventType, startDate, endDate,
  isAllDay, createdByStaffId). `@db.Date` range (CHECK endDate ≥ startDate); `isAllDay` default true; FKs Restrict;
  `enum CalendarEventType` (HOLIDAY · EVENT · EXAM · MEETING · OTHER). Indexes `(startDate)`, `(eventType,startDate)`,
  `(schoolId)`, `(academicYearId)`.
- **Behaviour:** writes ride **`academic:manage`** (admin — holiday/M6.5 precedent, no new write permission),
  validated + audited in-tx; reads use **`calendar:read`** (all in-scope roles — parents hold no `academic:read`).
  Read views: `listUpcoming` (endDate ≥ today IST), `listRange`, `listByMonth` (overlap) + optional eventType/year
  filters. Calendar is school-wide (no per-user targeting). **EXAM events manual** (not synced from frozen M5).
- **Surface:** business (`services/calendar/calendar.service.ts`) · `calendar.*` tRPC router (7 procedures) · mobile
  `/calendar` (Upcoming / Month + type filter) · web `/calendar` (month grid + list + admin CRUD + **CSV export**).
- **Tests:** 8 business (create + audit, write refused for teacher/parent, range validation create+update, tenant
  404, parent read, listUpcoming filter) + 6 API transport (protection, write gate, Zod date/month) = 14. Migration
  additive + zero drift; RLS admin ALL / authenticated SELECT / anon none (Step 3). Full gate green.
- **Frozen?** No (freezes on M11 approval). Purely additive (one table + one enum, `migrate diff` zero-ALTER).
- **Known limitations:** all-day only (no clock times); EXAM events manual (no M5 sync); school-wide reads (no
  per-role/section calendar scoping).
