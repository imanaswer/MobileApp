# Feature — Announcements & Circulars (M11)

**Spec:** `docs/architecture/ADR-019-announcements-circulars-calendar.md` · `docs/milestones/M11.md`
**Status:** Implemented (M11) — awaiting milestone approval.

Persistent school communication over frozen M1–M10: an `Announcement` with a **DRAFT→PUBLISHED→ARCHIVED**
lifecycle, file `AnnouncementAttachment`s (private bucket, signed-on-read), and a scoped audience. On publish an
announcement **optionally** emits an M10 `Notification(type=ANNOUNCEMENT)` — the only delivery M11 does.
**No chat / replies / comments / reactions / push / SMS / email.**

## Model (grain)

```
School ─1:N─ Announcement ─1:N─ AnnouncementAttachment   (path in announcement-attachments bucket)
                 │  status DRAFT→PUBLISHED→ARCHIVED
                 │  scope + targetId?   (WHO sees it — business-resolved)
                 └─(publish, optional)→ M10 Notification(type=ANNOUNCEMENT, actionUrl=/announcements/:id)
```

- **Announcement** — `schoolId` (loose, ADR-008), `academicYearId`, `title`, `body`, `status`, `scope`,
  `targetId?` (loose polymorphic — Class id for CLASS / Section id for SECTION; DATABASE_CONVENTIONS §2 line 18),
  `publishedAt?`, `createdByStaffId` (B3 actor). CHECK: `publishedAt NOT NULL ⟺ status IN (PUBLISHED, ARCHIVED)`.
- **AnnouncementAttachment** — `path` (private bucket, signed on read; ADR-004), `fileName`, `sizeBytes`,
  `uploadedByStaffId`. No `schoolId` — tenant checks go via the parent announcement.
- All FKs **Restrict** (brief). Indexes: `(status, publishedAt)`, `(scope, status)`, `(schoolId)`,
  `(academicYearId)`, attachment `(announcementId)`.
- `enum AnnouncementStatus` (DRAFT · PUBLISHED · ARCHIVED) · `enum AnnouncementScope` (WHOLE_SCHOOL · CLASS ·
  SECTION · TEACHERS · PARENTS — **no `CUSTOM`**; a hand-picked audience is future-additive with its recipient table).

## Lifecycle & authoring (ADR-019 §3/§4/§7)

- **Authors:** admins (`announcement:manage`, any scope) + teachers (`announcement:draft`, own SECTION/CLASS only —
  the `report_card:remark` shape). **Publish + archive are admin-only.** A teacher's draft waits for an admin to publish.
- `create` → DRAFT · `update` edits a DRAFT (published content is **immutable**) · `publish` DRAFT→PUBLISHED (stamps
  `publishedAt`, publish-once) · `archive` PUBLISHED→ARCHIVED (the soft delete) · `delete` hard-deletes a **DRAFT only**
  (removes its attachments then the row in one Restrict-tx; storage bytes left, M3 posture).
- Attachments add/remove only while DRAFT; upload is mint-signed-URL → push → persist (ADR-004).
- Every mutation writes **AuditLog in the same transaction** (ADR-007).

## Publish → optional notification (reuse M10)

`publish(id, { notify = true })` flips status + audits in-tx, then **after commit, best-effort**, resolves recipients
from `(scope, targetId)` and calls the M10 `createBulkNotification` (one `Notification(type=ANNOUNCEMENT,
actionUrl=/announcements/:id)` + N recipients). A notify failure is caught+logged, never fails the committed publish
(ADR-018 §3 posture). `notify:false` publishes silently.

## Visibility (ADR-019 §5/§6)

Per-user targeting is a **business-layer filter** (RLS is coarse defense-in-depth — admin ALL / authenticated
published-only / anon none; no recipient table to make per-user RLS cheap):

| Viewer | Sees |
|---|---|
| Admin | all statuses |
| Teacher | own DRAFTs + PUBLISHED where targeted (WHOLE_SCHOOL / TEACHERS / a section-class they teach) |
| Parent | PUBLISHED where targeted (WHOLE_SCHOOL / PARENTS / their children's section-class) |

The feed query pushes the targeting predicate into the repo `WHERE` (correct pagination); `get()` and `downloadUrl`
load-then-assert the same targeting (404, never leaking existence — the R4 attachment-leak guard).

## Surface

- **Business:** `services/announcement/*` (announcement.service, attachment.service, recipients, scope, mappers).
- **API:** `announcement.*` tRPC router (11 procedures) — list/get, create/update/publish/archive/delete,
  attachment upload-url/add/download-url/remove.
- **Mobile:** `/announcements` feed + detail (attachment downloads) + create/edit draft; deep-link from notifications.
- **Web:** `/announcements` console — Drafts/Published/Archive tabs + scope filter + composer with attachment uploads.
- **Permissions:** `announcement:read` (all roles), `announcement:manage` (SA/OA), `announcement:draft` (TEACHER).
  **Permission-only — no feature flag.** M10's `announcement:send` stays separate/frozen.

## Tests

Business (announcement.services): lifecycle (create/update/publish/archive/delete guards), author gate (teacher
scoped, parent refused), publish emit + `notify:false`, **targeting** (get/downloadUrl parent-excluded-from-other-
section/class), attachments, storage mint. API transport: protection + permission gates (before any repo call) + Zod.
**List WHERE-clause proven empirically** (seeded psql, rolled back — parent feed excludes other-section/class/drafts).

## Known limitations

- **No `CUSTOM` (hand-picked) audience** — future-additive with an `AnnouncementRecipient` table.
- **Published content is immutable** — no in-place correction/versioning (edit before publishing).
- **Per-user targeting is business-only** — RLS is coarse (the app is `service_role`/BYPASSRLS); the business filter +
  tests carry confidentiality.
- **Mobile authoring is lighter than web** — admins compose whole-school/teachers/parents on mobile; SECTION/CLASS
  admin targeting is web-only (teachers compose SECTION drafts for their own sections on both).
- **Bucket provisioning** (`announcement-attachments`) + the byte upload→download round-trip is a runbook step (no
  bucket in CI).
- **Deleted-draft storage bytes are orphaned** (metadata-only delete, the M3/homework posture).
