# Status — Announcements & Circulars

- **Status:** Implemented (M11 Steps 1–9 complete) — awaiting milestone approval.
- **Current milestone:** M11 (Announcements, Circulars & School Calendar) — persistent communication over frozen M1–M10.
- **Completion:** 100% of M11 announcement scope.
- **Spec / decision:** `docs/architecture/ADR-019-announcements-circulars-calendar.md` · `docs/milestones/M11.md` ·
  `docs/features/announcements.md`
- **Models:** `Announcement` (schoolId, academicYearId, title, body, status, scope, targetId?, publishedAt?,
  createdByStaffId; DRAFT→PUBLISHED→ARCHIVED; CHECK publishedAt⟺PUBLISHED/ARCHIVED) → `AnnouncementAttachment`
  (path, fileName, sizeBytes, uploadedByStaffId — no schoolId). Enums `AnnouncementStatus` (3), `AnnouncementScope`
  (5, no CUSTOM). All FKs **Restrict**; indexes `(status,publishedAt)`, `(scope,status)`, `(schoolId)`,
  `(academicYearId)`, `(announcementId)`.
- **Lifecycle:** admins (`announcement:manage`, any scope) + teachers (`announcement:draft`, own SECTION/CLASS)
  author drafts; **publish/archive admin-only**; published content immutable; DRAFT-only hard delete (attachments +
  row in one Restrict-tx). Every mutation audited in-tx.
- **Publish → notify:** optional, post-commit, best-effort M10 `Notification(type=ANNOUNCEMENT,
  actionUrl=/announcements/:id)` via `createBulkNotification` (reuses M10; `notify:false` = silent). Recipients from
  scope: WHOLE_SCHOOL/TEACHERS/PARENTS = school roles; SECTION/CLASS = enrollment + assignment (reuses M10 helpers).
- **Visibility:** business-resolved targeting (admin all; teacher own-drafts + targeted published; parent targeted
  published) pushed into the repo WHERE for pagination; get/downloadUrl load-then-assert (404). RLS is **coarse**
  defense-in-depth (admin ALL / authenticated published-only / anon none) — the app is `service_role`/BYPASSRLS.
- **Surface:** business (`services/announcement/*`) · `announcement.*` tRPC router (11 procedures) · mobile
  `/announcements` feed + detail + create/edit draft (deep-link from notifications) · web `/announcements` console
  (Drafts/Published/Archive tabs + scope filter + composer + attachment uploads). **Permission-only (no flag).**
- **Tests:** 28 business (lifecycle, author gate, publish emit + notify:false, targeting incl. CLASS, attachments,
  storage) + 7 API transport = 35. **List WHERE-clause proven empirically** (seeded psql — parent feed excludes
  other-section/class/drafts; teacher sees own drafts only). Migration additive + zero drift (Step 2); RLS isolation
  proven (Step 3). Full gate green (lint/typecheck/test 35/35, db:validate, mobile typecheck, web build 35/35 pages).
- **Frozen?** No (freezes on M11 approval). M1–M10 remained frozen; purely additive (Announcement +
  AnnouncementAttachment tables + 2 enums, proven by `migrate diff` zero-ALTER). One disclosed touch of the M10
  mobile inbox (`open()` prefers `actionUrl`) for announcement deep-linking (ADR-018-deviation-#4 style).
- **Known limitations:** no CUSTOM (hand-picked) audience; published content immutable (no correction/versioning);
  per-user targeting is business-only (coarse RLS); mobile admin authoring limited to whole-school/teachers/parents
  (SECTION/CLASS targeting web-only); `announcement-attachments` bucket provisioning + byte round-trip is a runbook
  step; deleted-draft storage bytes orphaned (M3 posture).
