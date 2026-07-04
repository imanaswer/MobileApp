# Documentation & Design Review — Findings (2026-07-04)

Full-pass review of `School_Portal_DEV_PRD.md` (v1.2), `School_Portal_PRD_v2.md`, ADR-001..009, all convention docs, and the current code state (M0 scaffold + M1 auth). Findings are ordered by severity. Each has a proposed resolution; nothing here changes product scope.

> ## ✅ Resolution status (2026-07-04, same day — Dev PRD v1.3)
> **All findings fixed in the docs.** A1 (milestones renumbered, Dev PRD §13 + PRD v2 §10), A2 (§4.4 + API_CONVENTIONS §5 rewritten to ADR-002's refinement), A3 (submissions copy fixed), B1 (`Holiday` model + §8.19), B2 (leave × mode invariant, §8.7), B3 (staff provisioning invariant, §5/§8.2), B4 (typed `SchoolSettings`, §8.19), B5 (policy-only channels, §4.6), B6 (isCurrent partial unique index), B7 (`*Path` renames + DB conventions rule), B8 (duplicate-phone import rule, §8.2), B9 (`@db.Date` decided), B10 (announcement authorship, §8.8 — client [CONFIRM §16.14] pending), B11 (teacher roster read in §5 matrix), B12 (1:1 thread comment in schema), B13 (`deregisterDevice` + token pruning, §7/§8.9).
> **Still requiring client answers** (tracked in Dev PRD §16): aided vs unaided (§16.12 — website says *unaided*, brief said *aided*), Gujarati locale (§16.13), class-teacher announcements (§16.14), working weekdays + holiday list (§16.15), plus the original §16.1–.11.
> Client identified: **Sri Gujarathi Vidhyalaya HSS, Mananchira, Kozhikode** (SGVA-managed, English-medium) — profile added to both PRDs.

---

## A. Contradictions between documents (fix the docs)

### A1 — Milestone numbering has drifted between the PRD and the code · **HIGH**
Dev PRD §13 says **M0** includes "Supabase Auth + RBAC" and **M1** = people + bulk import + academic structure. The code disagrees: `packages/db/prisma/schema.prisma` header says "**M1** adds the AUTHENTICATION foundation" and "User↔Staff and User↔Guardian relations land in **M2 (People)**"; ADR-002 has an "M1 authorization refinements" section. Every later milestone (and the payment mapping!) shifts by one depending on which numbering you believe.
**Resolution:** pick one numbering. Recommended: update Dev PRD §13 to `M0 = scaffold/CI/i18n shell`, `M1 = auth + RBAC + school setup`, `M2 = people/import/academic`, shifting the table — and re-check the payment-milestone rows with the client, since "40% deposit" is tied to M0's contents.

### A2 — Transport-layer "coarse role gate" is still documented but was removed · **HIGH**
ADR-002's M1 refinement explicitly **removed** the transport role gate (`roleProcedure`) — authorization is permission (`assertCan`) + scope (`assertScope`) in the business layer, and transport does authentication only. But Dev PRD §4.4 ("tRPC procedures apply the coarse role gate"), §7, and `API_CONVENTIONS.md` §5 ("Coarse role gate in the procedure (middleware)") still describe the old model.
**Resolution:** update Dev PRD §4.4/§7 and API_CONVENTIONS §5 to match ADR-002's refinement. The ADR is the newer, deliberate decision.

### A3 — Product PRD still says "submissions" for homework · **MEDIUM**
`School_Portal_PRD_v2.md` §6.6 heading is "Homework, notes & **submissions** (core)" and §10 M4 says "homework/**submissions**" — contradicting the distribution-only decision (Dev PRD §8.6, decision log #13).
**Resolution:** copy fix in the product PRD.

---

## B. Logic flaws & underspecified behaviour (fix before the module is built)

### B1 — No school-calendar / holiday model, but two features depend on one · **HIGH — blocks M2/M4**
Leave approval writes `Attendance(LEAVE)` "for each IST date in range **that is a school day**" (§8.7), and the absence-cutoff job must not fire on holidays. Nothing defines what a school day is: no `Holiday`/calendar table, no working-weekday setting (is Saturday a school day?). `AttendanceStatus.HOLIDAY` exists with no source of truth for when to use it.
**Resolution:** add a minimal `SchoolCalendar`/`Holiday` table (date, name, optional class-scope) + working-weekday config in typed school settings (see B4). Needed before the leave service and the absence job are written.

### B2 — Leave approval vs period-wise attendance can create contradictory rows · **HIGH if period-wise is confirmed**
Leave approval upserts `period = 0` (whole-day) rows. If the school runs period-wise (`period = 1..N`, [CONFIRM §16.4]), the unique key `[enrollmentId, date, period]` happily allows `(date, 0, LEAVE)` **and** `(date, 3, PRESENT)` to coexist — the student is simultaneously on leave and present.
**Resolution:** decide the invariant now: either (a) daily mode confirmed → non-issue; or (b) in period-wise mode the leave service upserts LEAVE into **all periods** of the day, or a day-level rule declares `period 0` authoritative and reads must treat it as overriding. Document in §8.7.

### B3 — Attendance/audit require a `Staff` row that admins may not have · **MEDIUM**
`Attendance.markedByStaffId` is a required FK to `Staff`. The RBAC matrix lets Super Admin and Office Admin mark attendance — but nothing guarantees those users have `Staff` rows (Staff is created per staff-profile import; the seed's super-admin may be a bare `User`).
**Resolution:** provisioning invariant: every `SUPER_ADMIN`/`OFFICE_ADMIN`/`TEACHER` user gets a `Staff` row (seed + import + invite flows). Add to §8.2 and the seed spec.

### B4 — `School.settings Json?` is load-bearing but untyped · **MEDIUM**
At least these live nowhere else: attendance mode (daily/period-wise), number of periods, absence-cutoff time, working weekdays. An untyped Json blob will drift.
**Resolution:** define a versioned Zod schema `SchoolSettings` in `packages/validation`; read through one accessor in `business`. List every key it owns.

### B5 — Notification "user prefs" are referenced but have no model · **MEDIUM**
§4.6 says `NotificationService` "resolves user prefs + recipients"; no `NotificationPreference` model exists, and no UI/API is scoped for managing prefs.
**Resolution:** decide: v1 = **policy-only** (event→channel matrix, no per-user prefs beyond locale) — then delete the "prefs" wording; or add a small `NotificationPreference` model. Recommended: policy-only for v1 (matches budget), note as future.

### B6 — Nothing enforces exactly one `AcademicYear.isCurrent` · **MEDIUM**
Leave resolution, enrollment, and promotion all key off "the current year". Two `isCurrent = true` rows would corrupt all three.
**Resolution:** partial unique index `ON "AcademicYear"("schoolId") WHERE "isCurrent"` — the exact idiom already established for `GuardianStudent`/`ReportCard`. Add to schema comment + migration; year-rollover service flips both rows in one transaction.

### B7 — `pdfUrl` / `attachmentUrls` should be storage **paths**, not URLs · **MEDIUM**
ADR-004: buckets are private; access is via short-lived signed URLs minted per request. Storing a *URL* invites persisting a signed (expiring) link. Field names encourage the bug.
**Resolution:** store bucket paths (`reportcards/{schoolId}/{enrollmentId}/{examId}.pdf`); mint signed URLs in the read path. Either rename to `pdfPath`/`attachmentPaths` or document the convention in DATABASE_CONVENTIONS.

### B8 — Shared guardian phone can't have two accounts · **LOW (known constraint, document it)**
`User.phone` is unique and OTP is the parent credential. Two guardians of the same child sharing one phone number → only one can have an account. Fine — but make it an explicit onboarding rule so import doesn't fail mysteriously on duplicate phones.
**Resolution:** import validation rule + a documented policy ("one login per phone number; the family account").

### B9 — `Attendance.date` type decision is still open · **LOW, but blocks the M2 migration**
DATABASE_CONVENTIONS §4 recommends `@db.Date` for calendar-date columns "confirm before the M2/M3 migrations". Unresolved.
**Resolution:** confirm `@db.Date` for `Attendance.date`, exam dates, leave from/to. It eliminates the UTC off-by-one class of bugs at the type level.

### B10 — Announcement authorship for CLASS/DIVISION scope is unassigned · **LOW**
RBAC matrix only has "Announcements (school-wide): Super Admin ✓, Office Admin ✓". Who creates `CLASS`/`DIVISION`-scoped announcements — can a class teacher? The scope enum exists; the permission doesn't.
**Resolution:** decide + add to the permissions matrix. Proposed: office/super create any scope; class teacher may announce to own division **[CONFIRM]**.

### B11 — Teachers' read access to student data is implicit · **LOW**
The matrix says only parents "view child data", but teachers obviously read their division's roster/profiles (attendance marking requires it). Never stated.
**Resolution:** covered in the new `PERMISSIONS_MATRIX.md` (`student:read:division`).

### B12 — Message threads: single `readAt` assumes strictly 1:1 · **LOW**
Fine as designed (staff↔guardian), but document that a thread is exactly two parties; a group thread would need a `MessageRead` join table.

### B13 — DeviceToken hygiene unspecified · **LOW**
Expo push receipts return `DeviceNotRegistered`; stale tokens should be pruned, and tokens deregistered on logout (§9 says clear on logout — but no API/`deregisterDevice` procedure exists in §7).
**Resolution:** add `notifications.deregisterDevice`; prune on push-receipt errors. Added to API_INVENTORY.

---

## C. Missing documents

You were right — none of the ten documents existed. All now created (this review + the ten below). Coverage before: state management had one line in CODING_STANDARDS §7/8; offline had four lines in §8.17/§9; analytics was just "PostHog + Sentry".

| Doc | File |
|---|---|
| User Flow Document | `docs/USER_FLOWS.md` |
| Navigation Map | `docs/NAVIGATION_MAP.md` |
| Screen Inventory | `docs/SCREEN_INVENTORY.md` |
| Component Inventory | `docs/COMPONENT_INVENTORY.md` |
| API Inventory (+ jobs, webhooks, notification matrix) | `docs/API_INVENTORY.md` |
| Database Relationship Diagram | `docs/DB_RELATIONSHIP_DIAGRAM.md` |
| Permissions Matrix | `docs/PERMISSIONS_MATRIX.md` |
| State Management Plan | `docs/STATE_MANAGEMENT_PLAN.md` |
| Offline Strategy | `docs/OFFLINE_STRATEGY.md` |
| Analytics & Logging Plan | `docs/ANALYTICS_LOGGING_PLAN.md` |

**Still worth writing later (recommended, not created):** bulk-import mapping spec (column formats per register — blocked on §16.6), Supabase RLS policy spec for Storage buckets (before M3 file features), release/OTA policy (EAS channels, what counts as "JS-only"), backup/DR runbook (go-live deliverable), DPDP/consent checklist (blocked on §16.9), Malayalam i18n glossary (translation consistency).

---

## D. Overall verdict

The documentation set is unusually strong — the schema-level reasoning (partial indexes, non-null sentinel, loose-ref rationale) and the layering/ADR discipline are better than most production codebases. The flaws found are (A) doc drift from live decisions, and (B) a handful of cross-feature interactions (calendar/leave/period, admin-as-staff, current-year invariant) that sit *between* module specs and therefore weren't owned by any one section. Fix A1/A2 now (cheap), resolve B1–B4 before M2 starts, and carry the rest as tracked items.
