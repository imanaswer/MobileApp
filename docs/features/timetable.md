# Feature — Timetable Management (M9)

**Spec:** `docs/architecture/ADR-017-timetable-management.md` · `docs/milestones/M9.md`
**Status:** Implemented (M9) — awaiting milestone approval.

The weekly class timetable for an Indian school: a per-year **bell schedule** of numbered clock-time
**periods**, and **timetable entries** that map each section's weekday slots to a subject taught by a
teacher in a room. Read views for teachers (own slots), parents (child's section), and admins (any
section / any teacher).

## Model (grain)

```
AcademicYear ──1:1── BellSchedule ──1:N── Period
                                            │ periodId
Section ─┐                                  │
Subject ─┼──▶ TimetableEntry ───────────────┘
User(teacher) ─┘   weekday (Weekday enum), room?
```

- **BellSchedule** — the year's day structure. **Exactly one per year** (`@@unique(schoolId, academicYearId)`).
- **Period** — a numbered slot (`order` unique per schedule, `startTime`/`endTime` `@db.Time`, `isBreak`).
  CHECK `startTime < endTime AND order > 0`.
- **TimetableEntry** — one weekly slot. `teacherId → User` (RLS `auth.uid()`), `academicYearId` denormalized
  for the read paths. **Two uniques** make section/teacher double-booking structurally impossible.
- All FKs **Restrict** (no cascade); every mutation writes **AuditLog** in the same transaction.

## Rules (all business-layer unless a DB constraint)

| Rule | Enforcement |
|---|---|
| No section double-booking / duplicate period / one subject+teacher per slot | DB unique `(sectionId, weekday, periodId)` + friendly pre-check |
| No teacher double-booking | DB unique `(teacherId, weekday, periodId)` + friendly pre-check |
| No overlapping periods | `PeriodService` time-range check |
| **Ownership** — teacher teaches this subject in this section | `teacherAssignments.findByTriple` — **never** `ClassTeacherAssignment` |
| Period belongs to the entry's year's bell schedule | cross-year service invariant |
| No class on a break period | `period.isBreak` rejected |
| Update excludes self | conflict pre-check ignores the edited row |

## Surface

- **Business:** `packages/business/src/services/timetable/` — `bell-schedule.service`, `period.service`,
  `timetable.service`, `scope`, `mappers` (clock-time + IST weekday + enrichment). Reads are enriched
  server-side (subject/teacher/section names + period timing) and **batched** (no N+1, ADR-016).
- **API:** `bellSchedule.*` (getForYear/create/update), `period.*` (list/create/update/delete),
  `timetable.*` (createEntry/updateEntry/deleteEntry/bySection/byTeacher/forParent/today). Reads default
  `academicYearId` to the ACTIVE year (parents have no `academic:read`); teacher defaults to caller.
- **Mobile:** read-only `/timetable` (teacher own / parent child-section, weekday-grouped) + home
  "Today's schedule" card. Gated on `TIMETABLE_READ`.
- **Web:** admin console `/timetable` (`TIMETABLE_MANAGE`) — bell schedule & period CRUD, section grid
  editor (drag-free, conflict warnings), teacher read view, CSV export, year/class/section/teacher filters.

## Authorization

Permission-only (no feature flag — ADR-017 §4). `timetable:manage` → SA/OA; `timetable:read` → SA/OA +
teacher (own slots) + parent (own child's section). RLS is defense-in-depth: admin ALL; teacher own
(`teacherId = auth.uid()`); parent child's section (`is_my_child_section`); anon none; BellSchedule/Period
are read-only reference for any authenticated user.

## Out of scope

Notifications, substitute teachers, recurring/template timetables, exam timetable, multiple bell schedules
per year, working-days config, teacher whole-section-grid read.
