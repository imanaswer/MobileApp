# User Flow Document — School Management Portal

End-to-end flows for every core journey. Format per flow: **Actor · Trigger · Preconditions → Steps → Alternate/error paths → Side effects** (notifications per API_INVENTORY matrix; audit per ADR-007). Screens referenced by ID from `SCREEN_INVENTORY.md`.

---

## F1 — Parent onboarding & first sign-in
**Actor:** Parent/Guardian · **Trigger:** school shares "download the app" after import · **Pre:** Guardian + User rows pre-created (INVITED) via import/invite; phone number on file.

1. Open app → `MOB-AUTH-01` welcome → choose language (en/ml) → enter phone.
2. Supabase sends OTP (SMS via configured provider) → enter OTP → JWT issued.
3. App calls `auth.registerProfile` (idempotent) → profile INVITED→ACTIVE; device registered (`notifications.registerDevice`).
4. Land on Parent Home (`MOB-PAR-01`); if >1 linked child, child-switcher defaults to first.

**Alternates:** phone not on file → "contact school office" screen (no self-signup). OTP throttled by Supabase → wait state. Re-login = same OTP flow (recovery).
**Side effects:** audit (profile activation), lastLoginAt.

## F2 — Staff onboarding (teacher/office/accountant)
**Actor:** Staff · **Pre:** Staff + User pre-created (INVITED) with email; invite email (Resend) with temporary/reset link.

1. Staff opens web `WEB-AUTH-01` (or app) → email + password (set via Supabase reset link on first use).
2. Sign-in → `auth.registerProfile` → ACTIVE → role-aware dashboard.

**Alternates:** forgotten password → Supabase reset email. Disabled account → blocked when Principal is built (status ≠ ACTIVE).

## F3 — Bulk import (students + guardians)
**Actor:** Office Admin/Super Admin · **Surface:** web only.

1. `WEB-IMP-01`: download template → upload CSV/Excel → column mapping UI.
2. Client-side pre-validation (shared Zod row schema) → preview with per-row errors.
3. Submit `students.bulkImport` → ImportJob created; batches processed in transactions; partial success allowed.
4. `WEB-IMP-02` job status: totals, error-report download (fix → re-upload only failed rows).

**Alternates:** duplicate admissionNo/phone → row-level errors (B8: one login per phone — duplicate guardian phones flagged, not fatal to other rows).
**Side effects:** ImportJob row; created Users are INVITED (parents activate via F1).

## F4 — Teacher marks daily attendance
**Actor:** Teacher · **Pre:** TeacherAssignment for division; today is a school day (calendar, B1) · **Target:** 40 students < 60s.

1. `MOB-TEA-02`: division (+period if period-wise) preselected for today → roster loads (cached).
2. "Mark all present" → tap to flip absentees (optimistic UI) → Save.
3. `attendance.markBulk` upserts on `[enrollmentId, date, period]`.

**Alternates:** re-save same day → upsert updates, never duplicates; each change audited. Offline (`offline` flag) → queued, replayed on reconnect (OFFLINE_STRATEGY). Student on approved leave → row already LEAVE; teacher sees badge, can override (audited).
**Side effects:** audit per changed row. Absence pushes are sent by the **cutoff job**, not the save.

## F5 — Absence notification (scheduled)
**Actor:** system (cron) · **Trigger:** daily at configured cutoff (SchoolSettings).

1. Job queries today's ABSENT (IST date), skips holidays, excludes already-notified.
2. `NotificationService.send(ABSENCE)` per student → guardians: push + in-app; SMS/WhatsApp per policy/flags.

**Idempotent:** once per student per day; re-run safe.

## F6 — Marks entry → report card
**Actor:** Teacher (own subjects) then Class Teacher/Office.

1. Office defines Exam + ExamSubjects (maxTheory/practical, passMark) — `WEB-EXA-01`.
2. Teacher `MOB-TEA-03`/`WEB-EXA-02`: division × subject grid → enter theory/practical or absent → save `exams.enterMarksBulk` (bulk, per-cell validation vs max marks).
3. Grades auto-assigned from GradeScale bands; results/rank per [CONFIRM §16.3].
4. Publish (**PROPOSED** `exams.publishResults` — parents notified) → generate report cards (`exams.generateReportCard`, PDF per student, upsert per ADR-009) → parent views/downloads via signed URL.

**Alternates:** concurrent edit → `updatedAt` conflict → CONFLICT surfaced, no silent overwrite. Mark edit after publish → audited; consider re-publish rules [CONFIRM].
**Side effects:** every mark write/edit audited; publish notifies.

## F7 — Leave request lifecycle
**Actor:** Parent applies; Class Teacher decides.

1. Parent `MOB-PAR-05`: child (switcher) → date range + reason → `leave.apply`.
2. Class teacher notified → `MOB-TEA-05` approval list → approve/reject (+note).
3. On APPROVE: service resolves current ACTIVE enrollment (none → clear error, approval blocked); verifies approver is class teacher of that division; upserts Attendance LEAVE per school day (B1 calendar; B2 period rule); audit; notify parent.
4. Cancellation (`leave.cancel`, PROPOSED): parent cancels PENDING; APPROVED cancellation reverts LEAVE rows (audited).

**Alternates:** overlapping existing leave → validation error. Range spans holiday → holidays skipped.

## F8 — Homework distribution
1. Teacher `MOB-TEA-04`: division (+subject) → title/body/attachments (MIME+size validated; stored as private paths) → `homework.create`.
2. Division guardians get push → parent `MOB-PAR-04` reads; attachments open via signed URLs.

No submission flow (distribution-only, §8.6).

## F9 — Announcements
1. Office/Super `WEB-ANN-01`: compose (en and/or ml) → scope SCHOOL/CLASS/DIVISION (+target) → publish.
2. Audience resolved from scope → in-app + push; recipients read in `MOB-*-notices`.

**[CONFIRM B10]:** class-teacher division announcements.

## F10 — Teacher↔Parent messaging
1. Teacher opens thread from a student context (`messages.createThread` — only for own students; thread is 1:1 staff↔guardian, optional student tag).
2. Either party sends (`messages.send`) → other notified → read receipts via `markRead` (optimistic).

**Guard:** parents cannot initiate; teachers cannot reach non-assigned guardians.

## F11 — Year-end promotion
**Actor:** Super Admin · **Surface:** web.

1. `WEB-PRO-01`: pick source year/classes → review roster → per-student overrides (RETAINED/TRANSFERRED/DROPPED).
2. Dry-run preview (recommended) → confirm (destructive dialog) → `enrollment.promoteBulk` in transaction: sets old enrollment statuses, creates new-year enrollments.
3. Audit every transition. New year's setCurrent flip is its own step (B6).

## F12 — Fee payment (`fees` flag)
1. Office/Accountant defines FeeStructure/items → invoices generated per student.
2. Parent `MOB-PAR-06`: dues → pay → `fees.createOrder` → Razorpay checkout (SDK) → `fees.verifyPayment` (HMAC) + webhook reconciliation (idempotent by orderId).
3. Receipt PDF; invoice status recomputed (PARTIAL/PAID); office dues view updates.

**Alternates:** payment failed/abandoned → order stays CREATED; retry creates new order. Webhook before verify → same idempotent path.

## F13 — Locale switch
Any user, any time (`MOB-SET-01`/web user menu): en ⇄ ml → persisted to `User.locale` → whole UI re-renders; notifications thereafter localized.

## F14 — Logout / device hygiene
Logout → deregister device token (B13), clear query cache + session. Disabled mid-session → next request builds Principal, sees DISABLED, forces sign-out.
