# ADR-019 — Announcements, Circulars & School Calendar — M11

**Status:** Accepted — **M11 implemented (Steps 1–9; awaiting milestone approval)** · **Date:** 2026-07-12 · design approved 2026-07-11 with two adjustments (teachers **draft-only**, admins publish; `CUSTOM` scope **dropped**) · **Deciders:** Architecture, Product
**Related:** ADR-002 (business layer is the authorization gate; routers thin) · ADR-003 (repositories; Prisma only in `packages/db`) ·
ADR-004 (private storage bucket; signed-on-read after authz) · ADR-007 (AuditLog in-transaction) · ADR-008 (loose `schoolId`) ·
ADR-011 (Holiday under `academic:manage`; the working-day calendar this calendar generalises) ·
ADR-015 (`ClassTeacherAssignment`) · **ADR-018 (M10 — the in-app `Notification`/`NotificationRecipient` layer this milestone _optionally emits into_)** ·
DATABASE_CONVENTIONS (enums, Restrict, loose `schoolId`, `@db.Date`, `Announcement.targetId` anticipated at line 18, in-tx audit) ·
PERMISSIONS_MATRIX (`academic:manage` for calendar writes — holiday precedent; `announcement:send` M10 kept frozen) · CODING_STANDARDS §1/§4 (DTOs, layering)
**Precedes:** M11 (Announcements, Circulars & School Calendar) — this ADR fixes the design; Steps 2–9 execute it.

---

> **Milestone framing.** M11 introduces **persistent school communication** over frozen M1–M10: an `Announcement`
> record with a **DRAFT→PUBLISHED→ARCHIVED** lifecycle, file `AnnouncementAttachment`s, and a `SchoolCalendarEvent`
> (holidays / events / exams / meetings). It is **purely additive** — three new tables, three new enums, one new
> private storage bucket, and (per the freeze rule) **zero change to any frozen M1–M10 business service or table**
> (proven by `prisma migrate diff` at Step 2; the FK back-relations added to frozen `School`/`AcademicYear`/`Section`/
> `Staff`/`User` models emit **no SQL column**, so the diff stays zero-ALTER). **No chat, replies, comments, reactions,
> push, SMS, WhatsApp or email** — an announcement _may optionally_ fan out an **M10** in-app `Notification` on publish,
> and that is the only delivery M11 does.

## Context

M10 (ADR-018) shipped the **ephemeral** notification layer: an immutable `Notification` event + explicit per-user
`NotificationRecipient` copies, plus a **send-only** `createAnnouncement` admin action that fabricates a
`Notification(type=ANNOUNCEMENT)` with resolved recipients — deliberately **no `Announcement` table** (ADR-018
alternative #5: "an announcement is just a notification"). M11 needs the thing M10 explicitly declined: **persistent,
editable, attach­able school communication with its own lifecycle** — a circular you draft, revise, publish, and later
archive; a parent-facing feed; a searchable console. That is a document, not an event.

Four facts constrain the design:

1. **M10's `announcement:send` / `createAnnouncement` are frozen and stay untouched.** M11 does **not** deprecate or
   edit them. M10 remains the "quick blast" (a notification with no persistent record); M11's `Announcement` is the
   **system of record**. On publish, M11 **reuses the M10 emit path** (`packages/business/src/services/notification/`,
   the canonical `*AndNotify` composition, ADR-018 §3) to _optionally_ push a `Notification(type=ANNOUNCEMENT,
   actionUrl=/announcements/:id)` — resolve-once, store-explicitly, best-effort, post-commit. No new notification type.
2. **Recipient/visibility resolution already exists** — `enrollments.listBySection` (+ `studentParents`) for a section's
   parents, `teacherAssignments` for a section's teachers, `people` for whole-school. M11 reuses these both to resolve
   the optional notification fan-out **and** to filter the announcement feed by scope at list time.
3. **`@db.Date` calendar columns, a private bucket, and the `academic:manage`-gated calendar are house idioms.**
   Holidays (ADR-011) already live under `academic:manage` and a cross-role `holiday:read`; the school calendar
   generalises that working-day calendar. Storage follows ADR-004 (path stored, signed on read after authz).
4. **DATABASE_CONVENTIONS line 18 already anticipates `Announcement.targetId`** as an intentionally-loose polymorphic
   scalar — so a scoped announcement's target is a documented convention, not a deviation.

## Decision

### 1. Three additive models + three enums

```
School ─1:N─ Announcement ─1:N─ AnnouncementAttachment   (path in private bucket, signed-on-read)
                 │  status DRAFT→PUBLISHED→ARCHIVED
                 │  scope + targetId?  (WHO sees it — resolved in business)
                 └─(publish, optional)→ M10 Notification(type=ANNOUNCEMENT, actionUrl=/announcements/:id)

School ─1:N─ SchoolCalendarEvent   (HOLIDAY|EVENT|EXAM|MEETING|OTHER; @db.Date range)
```

**`Announcement`** — `id, schoolId (loose, ADR-008), academicYearId, title, body, status AnnouncementStatus
@default(DRAFT), scope AnnouncementScope, targetId String? (loose polymorphic — §3), publishedAt DateTime?,
createdByStaffId (B3 actor → Staff, Restrict), createdAt, updatedAt`. FKs `academicYear`/`createdBy` **Restrict**.

**`AnnouncementAttachment`** — `id, announcementId, path (PRIVATE bucket path, signed-on-read — ADR-004; keeps the
brief's field name over the `*Path` convention as it is unambiguous), fileName, sizeBytes Int, uploadedByStaffId
(→ Staff, Restrict), createdAt`. FK `announcement` **Restrict** (per brief — "Restrict FKs"; not Cascade, see §6).

**`SchoolCalendarEvent`** — `id, schoolId (loose), academicYearId, title, description String?, eventType
CalendarEventType, startDate @db.Date, endDate @db.Date, isAllDay Boolean @default(true), createdByStaffId
(→ Staff, Restrict), createdAt, updatedAt`. FK `academicYear`/`createdBy` **Restrict**.

**`enum AnnouncementStatus { DRAFT PUBLISHED ARCHIVED }`** — the lifecycle (§4).
**`enum AnnouncementScope { WHOLE_SCHOOL CLASS SECTION TEACHERS PARENTS }`** — audience (§3). **`CUSTOM` dropped**
(Step-1 approval): an arbitrary recipient list needs an `AnnouncementRecipient` table the brief doesn't list; the
enum value **and** that table are future-additive together when an explicit-recipient feature is actually needed.
**`enum CalendarEventType { HOLIDAY EVENT EXAM MEETING OTHER }`** — event kind.

**Indexes (per brief):** `Announcement[status, publishedAt]` (the published feed), `Announcement[scope, status]`
(scoped-feed filter); `SchoolCalendarEvent[startDate]` (upcoming), `SchoolCalendarEvent[eventType, startDate]`
(exam schedule / holidays). Plus `[schoolId]` on both and `[announcementId]` on the attachment (FK read path).

**CHECKs (raw SQL in the migration, mirrored by schema comments — DATABASE_CONVENTIONS §3):**
`Announcement`: `status='PUBLISHED' ⟹ publishedAt IS NOT NULL` (and DRAFT ⟹ `publishedAt IS NULL`);
`SchoolCalendarEvent`: `endDate >= startDate`.

### 2. `targetId` — a loose polymorphic scope target (no `CUSTOM` audience in M11)

`scope` alone is meaningless for `CLASS`/`SECTION`. `targetId` holds **`classLevelId`** (scope=CLASS) or **`sectionId`**
(scope=SECTION); it is **NULL** for `WHOLE_SCHOOL`/`TEACHERS`/`PARENTS`. This is the loose polymorphic ref
**DATABASE_CONVENTIONS line 18 already names** — annotated inline, no FK. A business `assertScopeTarget` validates the
`(scope, targetId)` pair (target required-and-exists for CLASS/SECTION; must be NULL otherwise).

**No `CUSTOM` audience in M11** (Step-1 approval, deviation #2) — the five shipped scopes all resolve from existing
enrollment/assignment/people data; an explicit hand-picked recipient list is deferred with the `AnnouncementRecipient`
table it would require.

### 3. Publication + optional notification (reuse M10 — the canonical `*AndNotify` pattern)

- **`create`** makes a `DRAFT` (title/body/scope/targetId; attachments added while DRAFT). **`update`** edits a DRAFT
  only — **published content is immutable** (a correction is out of scope; edit before publishing). Teachers may create
  and edit drafts for **their own sections** (`announcement:draft`, §7); **publishing is admin-only**.
- **`publish(id, { notify })`** (`announcement:manage` — **SA/OA only**) flips DRAFT→PUBLISHED, stamps `publishedAt`,
  writes AuditLog **in the same tx**. A teacher's draft therefore waits for an admin to publish it (the admin feed shows
  every DRAFT). Then,
  **after commit, best-effort**, if `notify` (author's choice, default **true**): resolve recipients from `(scope,
  targetId)` via the reused M10/enrollment services and call the **existing M10 emit** (`createBulk` → one
  `Notification(type=ANNOUNCEMENT, actionUrl=/announcements/:id)` + N `NotificationRecipient` rows, audited). A
  notification-write failure is caught+logged, never fails the committed publish — identical to ADR-018 §3.
- **No new business logic in any frozen file.** The M11 `publishAnnouncement` composition lives in the new
  `services/announcement/` domain and _calls_ the frozen M10 emit; M10's `announcement.service.ts` is untouched.
- **Re-publish is impossible** (publish requires DRAFT; PUBLISHED/ARCHIVED reject it) — so a client retry can't
  double-fan-out. This is stricter than M10's re-publish-emits-again (ADR-018 #5): an announcement publishes **once**.

### 4. Lifecycle & deletion policy

`DRAFT ──publish──▶ PUBLISHED ──archive──▶ ARCHIVED` (forward-only; no un-archive in M11 — reserved).

- **`archive()`** = PUBLISHED→ARCHIVED — the **soft delete** for published communication (drops out of the active feed,
  survives for history/audit). Never a hard delete of a published announcement (it carried a real message + audit).
- **`delete()`** = hard delete, **DRAFT only** (the M6/M7 "DRAFT-only delete" R5 analog — an unpublished draft has no
  audience/history). Because all FKs are **Restrict** (brief), the service deletes the announcement's
  `AnnouncementAttachment` rows **and** the announcement in **one tx** (+ AuditLog), then best-effort removes the
  storage objects after commit. No Cascade is used (brief), so cleanup is service-orchestrated.
- **Attachments:** `add`/`remove` while **DRAFT** only (published attachments are frozen with the message).
- **Calendar events:** full CRUD; delete is a plain hard delete (no lifecycle — a calendar entry carries no audience
  state), audited.

### 5. Recipient resolution & visibility (business-resolved; RLS is coarse defense-in-depth)

| Scope | Notification recipients (publish) / feed audience (list) | Reused services |
|---|---|---|
| `WHOLE_SCHOOL` | every active parent + teacher of the school | `people` |
| `CLASS` (targetId=classLevelId) | parents + assigned teachers of every section in the class | `enrollments`/`teacherAssignments` per section |
| `SECTION` (targetId=sectionId) | that section's parents + assigned teachers | `enrollments.listBySection` + `teacherAssignments` |
| `TEACHERS` | every active teacher | `people` |
| `PARENTS` | every active parent | `people` |

**Feed visibility (business, at list time):** admin → all statuses; **teacher** → own DRAFTs (createdBy) + PUBLISHED
announcements they are targeted by (`WHOLE_SCHOOL`, `TEACHERS`, or a `CLASS`/`SECTION` they hold a `TeacherAssignment`
for); **parent** → PUBLISHED announcements they are targeted by (`WHOLE_SCHOOL`, `PARENTS`, or a `CLASS`/`SECTION` of
their children via `Enrollment`). There are **no student logins**, so "students: none" (brief Step 3) holds trivially.

### 6. RLS (Step 3) — coarse; per-user targeting lives in the business layer

M10 got cheap `EXISTS(recipient WHERE userId=auth.uid())` RLS **because it materialised recipient rows**. M11's
`Announcement` has **no recipient table** (brief lists three tables, none a recipient — §2), so per-user "visible if
targeted" in RLS would mean joining `Enrollment`/`TeacherAssignment` inside every policy — expensive, and the app reaches
these tables as **`service_role` (BYPASSRLS)** anyway, so it buys nothing over the business gate. Per the whole
codebase's stance (RLS = defense-in-depth; business is the real gate):

| Table | Admin | Teacher / Parent | Anon |
|---|---|---|---|
| `Announcement` | ALL | **SELECT published only** (`status='PUBLISHED'`) | none |
| `AnnouncementAttachment` | ALL | SELECT iff its announcement is PUBLISHED | none |
| `SchoolCalendarEvent` | ALL | **SELECT** (read-only reference) | none |

**"Visible if targeted" is delivered by business + coarse RLS, not RLS alone** (deviation #3). Isolation proofs
(Step 3, rolled back): **anon denied** on all three; **draft hidden** from teacher/parent; **admin sees all**; the
per-user _targeting_ narrowing is a **business-layer test** (Step 8), not an RLS proof.

### 7. Permissions (the minimum the new surfaces force; every grant justified)

The hard rule is "no permission changes unless **absolutely required**." Four grants are genuinely new — the
`manage`/`draft`/`read` split **mirrors the M7 report-card precedent** (`report_card:manage` admin lifecycle +
`report_card:remark` scoped teacher authoring + `report_card:read`):

- **`announcement:read`** (`ANNOUNCEMENT_READ`) — SA/OA/T/P. The persistent parent/teacher feed M10 never had (M10's
  read was the inbox). Row scope (§5) in the service. *Required — no existing permission covers a published-announcement
  feed.*
- **`announcement:manage`** (`ANNOUNCEMENT_MANAGE`) — **SA/OA only**, any scope. The full lifecycle:
  create/update/**publish**/archive/delete + attachments. `announcement:send` (M10) stays frozen and separate.
- **`announcement:draft`** (`ANNOUNCEMENT_DRAFT`) — **TEACHER only**, scoped to own sections (`TeacherAssignment`; a
  teacher drafts only `SECTION`/`CLASS` announcements targeting sections/classes they teach — never WHOLE_SCHOOL/
  TEACHERS/PARENTS). Create/update/delete **DRAFT** + attachments; **no publish, no archive** (admins publish — Step-1
  approval). Exactly the `report_card:remark` shape: every teacher holds it, the scope predicate narrows it, and it
  stops short of the admin lifecycle action.
- **`calendar:read`** (`CALENDAR_READ`) — SA/OA/T/P. **Parents hold no `academic:read`** (verified in
  `permissions.ts`), and `holiday:read` is semantically holiday-only; a full school calendar (events/exams/meetings)
  needs its own cross-role read. *Required.*
- **Calendar writes reuse `academic:manage`** (admin-only) — the **holiday (ADR-011) and class-teacher (M6.5)
  precedent** of riding `academic:manage` rather than minting a `calendar:manage`. **No new write permission.**
- **No feature flag** — communication is core (the ADR-013/M6, ADR-017/M9, ADR-018/M10 precedent; no flag infra).

### 8. Storage (ADR-004)

A new **private** bucket `announcement-attachments`. `AnnouncementAttachment.path` stores the bucket path (never a URL);
`downloadUrl` mints a short-lived signed URL **after** an `announcement:read` + scope check; `add` validates size/MIME in
the business layer and uploads via a signed upload URL (the M3/M6 `StoragePort` pattern). Bucket provisioning is a
runbook step (like `homework-files`) — the byte round-trip is a manual check CI can't run.

## Deviations from the literal brief (flagged for veto at STOP)

1. **No `Announcement`/`Notification` merge — M11 is a new persistent domain; M10 stays frozen.** M11 `publish`
   _optionally_ emits an M10 notification (§3). Editorially: the PERMISSIONS_MATRIX note that M10 "superseded"
   `announcement:read` is itself now superseded — M11 revives a real, persistent `announcement:read`.
2. **No `CUSTOM` scope in M11** (Step-1 approval) — dropped from the enum; an explicit hand-picked audience ships later
   with the `AnnouncementRecipient` table it needs. The five shipped scopes resolve from existing data.
3. **"Published visible if targeted" (Step 3 RLS) is business + coarse RLS, not RLS alone** — no recipient table to make
   per-user RLS targeting cheap; targeting is a service filter (§5/§6), matching the codebase's defense-in-depth stance.
4. **Teachers draft, admins publish** (§7, Step-1 approval) — `announcement:draft` (teacher, own-section, DRAFT-only) +
   `announcement:manage` (admin, full lifecycle incl. publish). Brief Step 6 gives teachers Create/Edit-draft; publish
   is held back to admins, so a teacher's draft is admin-reviewed by virtue of needing an admin to publish it.
5. **Calendar `eventType=EXAM` is a manually-created event, NOT synced from frozen M5 exams** — auto-sync would couple a
   new domain to a frozen one for little gain (advisor). M5→calendar sync is reserved as future-additive.

## Alternatives considered

1. **Extend M10's `Notification(type=ANNOUNCEMENT)` instead of a new table.** Rejected — M10 events are immutable and
   ephemeral; M11 needs a draftable, editable, attachable, archivable **document** with its own feed. ADR-018 alt-#5
   ("no Announcement table") was correct _for M10's ephemeral send_ and is explicitly superseded here.
2. **Materialise an `AnnouncementRecipient` table** (M10-style) to get cheap per-user RLS + a stored audience. Rejected
   — the brief lists three tables (none a recipient); the optional M10 fan-out **already** materialises per-user rows
   when notification is wanted, and feed targeting is a cheap indexed business filter. A recipient table is the
   over-engineering trap (YAGNI) — it ships only if/when a hand-picked (`CUSTOM`) audience is actually needed.
3. **A dedicated `calendar:manage` write permission.** Rejected — holidays/class-teacher already ride `academic:manage`;
   a school calendar is the same admin remit. Reuse keeps the "no permission unless required" rule (one fewer grant).
4. **Cascade `AnnouncementAttachment → Announcement`** (composition idiom, DATABASE_CONVENTIONS §7). Rejected for M11 —
   the brief says **Restrict FKs**; DRAFT-only delete is rare and service-orchestrated in one tx, so structural cascade
   buys nothing and would break the all-Restrict freeze proof shape.
5. **Auto-generate calendar EXAM events from M5 `Exam`.** Rejected (deviation #5) — couples to a frozen domain.

## Consequences

- (+) **Purely additive** — three tables + three enums + one bucket; every frozen M1–M10 **service and table untouched**
  (proven by `migrate diff` at Step 2; back-relation fields emit no columns).
- (+) **Persistent communication with a clean lifecycle** — draft, publish-once, archive; attachments; a scoped feed.
- (+) **Reuses M10 for delivery** — the optional publish fan-out is the canonical `*AndNotify` path, no new notification
  type, no new emit infrastructure.
- (+) **Minimal permission surface** — three genuinely-new grants, calendar writes reuse `academic:manage`, no flag.
- (−) **Per-user announcement targeting is business-only** (deviation #3) — RLS is coarse; the business gate + tests
  carry correctness (the codebase's standing posture).
- (−) **Hand-picked (`CUSTOM`) audiences and M5→calendar sync are not shipped** (deviations #2/#5) — future-additive.
- (−) **Published announcements are immutable** (no correction/version in M11) — edit before publish; a correction
  feature is future-additive.

## STOP — Step 1 boundary — ✅ APPROVED 2026-07-11

Step 1 approved with two adjustments, now folded in: **teachers draft-only, admins publish** (`announcement:draft` +
`announcement:manage`, §7); **`CUSTOM` scope dropped** from the enum (§1/§2). The other decisions stand as designed:
three tables/enums + loose polymorphic `targetId` (§1/§2); DRAFT hard-delete / PUBLISHED archive-only / one Restrict-tx
cleanup (§4); publish _optionally_ emits an M10 `Notification(type=ANNOUNCEMENT)`, default notify=true, publish-once (§3);
coarse RLS (admin ALL / published-SELECT / anon none) with targeting in the business layer, and calendar `EXAM` events
manual not M5-synced (§6). **Proceeding to Step 2 — additive migration + `migrate diff` proof.**
