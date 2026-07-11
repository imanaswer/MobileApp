# Feature — School Calendar (M11)

**Spec:** `docs/architecture/ADR-019-announcements-circulars-calendar.md` · `docs/milestones/M11.md`
**Status:** Implemented (M11) — awaiting milestone approval.

A school calendar over frozen M1–M10: holidays, events, exams, meetings — a single additive
`SchoolCalendarEvent` table. Admin-managed, read by all in-scope roles. **EXAM events are created manually**
(not synced from frozen M5 — ADR-019 deviation #5).

## Model (grain)

```
School ─1:N─ SchoolCalendarEvent   (HOLIDAY | EVENT | EXAM | MEETING | OTHER)
   schoolId, academicYearId, title, description?, eventType, startDate, endDate, isAllDay, createdByStaffId
```

- `startDate`/`endDate` are **`@db.Date`** (calendar dates, no time). CHECK: `endDate >= startDate`.
- `isAllDay` defaults `true` (M11 has no clock times — a timed-event upgrade is future-additive).
- `schoolId` loose (ADR-008); `academicYear` + `createdBy` FKs **Restrict**; `createdByStaffId` is the B3 actor.
- Indexes: `(startDate)` (upcoming), `(eventType, startDate)` (exam schedule / holidays), `(schoolId)`,
  `(academicYearId)`. `enum CalendarEventType` (HOLIDAY · EVENT · EXAM · MEETING · OTHER).

## Behaviour (ADR-019 §4)

- **Writes ride `academic:manage`** (admin-only — the holiday/M6.5 precedent; **no new `calendar:manage`**).
  Create/update/delete, each validated (`endDate >= startDate`, friendly domain errors) + audited in-tx.
- **Reads use `calendar:read`** (all in-scope roles — parents hold no `academic:read`, so this is the cross-role
  calendar read). The calendar is **school-wide** — no per-user targeting.
- Read views: `listUpcoming` (endDate ≥ today IST, soonest first), `listRange(from, to)` (overlap), `listByMonth`
  (month overlap). Optional `eventType` / `academicYearId` filters.

## Surface

- **Business:** `services/calendar/calendar.service.ts` (+ mappers).
- **API:** `calendar.*` tRPC router (7 procedures) — get, month, range, upcoming (reads); create, update, delete (admin).
- **Mobile:** `/calendar` — Upcoming / Month views with a type filter (covers "upcoming holidays" + "exam schedule").
- **Web:** `/calendar` — month grid + list + admin create/edit/delete (native `<input type="date">`) + **CSV export**.
- **Permissions:** `calendar:read` (SA/OA/T/P) + `academic:manage` (writes). Permission-only — no feature flag.

## Tests

Business (calendar.services): admin create + audit, teacher/parent write refused (`academic:manage`), range
validation (create + update), tenant 404, parent read (`calendar:read`), `listUpcoming` filter shape. API transport:
protection, write gate, Zod (inverted/malformed date, month>12). Migration additive + zero drift; RLS: admin ALL /
authenticated SELECT / anon none (Step 3, empirical).

## Known limitations

- **All-day only** — no clock-time events (future-additive; `isAllDay` reserved).
- **EXAM events are manual** — not auto-generated from M5 exams (would couple to a frozen domain; reserved).
- **School-wide reads** — no per-role/section calendar scoping in M11.
