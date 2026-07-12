# Screen Inventory — School Management Portal

Every screen, keyed by the IDs used in `NAVIGATION_MAP.md` and `USER_FLOWS.md`. **MS** = milestone (code numbering: M1 auth, M2 people/academic, M3 attendance, M4 exams, M5 comms/leave, GL = go-live add-on). **States**: all list/detail screens implement loading (skeleton), empty (+CTA), error (+retry) per UI_DESIGN_SYSTEM §9; only extra states are noted.

## Mobile — auth (M1)

| ID | Screen | Role | Key elements / APIs | MS |
|---|---|---|---|---|
| MOB-AUTH-01 | Welcome + language | – | en/ml pick (pre-auth, device-stored) | M1 |
| MOB-AUTH-02 | Phone entry | – | Supabase OTP request; throttle feedback | M1 |
| MOB-AUTH-03 | OTP verify | – | 6-digit input, resend timer; → `auth.registerProfile` | M1 |
| MOB-AUTH-04 | Staff login | – | email+password; reset link out to Supabase | M1 |

## Mobile — parent

| ID | Screen | APIs | Notes | MS |
|---|---|---|---|---|
| MOB-PAR-01 | Home | `auth.me`, summaries | child-switcher header; cards: today's attendance, latest homework/notices, dues (flag) | M2 shell, fills per MS |
| MOB-PAR-02 | Attendance | `attendance.studentSummary` | month calendar view + %s; status colors per design system | M3 |
| MOB-PAR-03 | Marks & report cards | `exams.results`, `exams.getReportCard` | per-exam grades; PDF via signed URL (expiry-aware re-fetch) | M4 |
| MOB-PAR-04 | Homework feed | `homework.listForDivision` | cursor list; attachment viewer | M5 |
| MOB-PAR-05 | Leave | `leave.listMine`, `leave.apply` | apply = bottom sheet form (range, reason); status badges | M5 |
| MOB-PAR-06 | Fees | `fees.invoices.*`, `createOrder` | dues, Razorpay checkout, receipts; **flag: fees** | GL |
| MOB-PAR-07 | Notices | `announcements.list` | cursor feed, detail sheet | M5 |
| MOB-PAR-08 | Child profile | `profile.getStudent` | photo, class, subjects, guardians, timetable (flag) | M2 |

## Mobile — teacher (also OA/SA subset)

| ID | Screen | APIs | Notes | MS |
|---|---|---|---|---|
| MOB-TEA-01 | Home / Today | assignments, pending counts | my divisions, quick actions, pending leave badge | M2 shell |
| MOB-TEA-02 | Mark attendance | `attendance.getByDivisionDate`, `markBulk` | mark-all-present → flip; optimistic; offline banner+queue (flag); leave-badged rows | M3 |
| MOB-TEA-03 | Marks entry | `exams.getMarks`, `enterMarksBulk` | grid per division×subject; per-cell validation vs max; conflict toast | M4 |
| MOB-TEA-04 | Homework | `homework.create`, list | compose sheet with attachments (MIME/size client check) | M5 |
| MOB-TEA-05 | Leave approvals | `leave.listForApproval`, `decide` | approve/reject with note; destructive confirm on reject | M5 |
| MOB-TEA-06 | More | – | hub: messages, notices, timetable (flag), settings | M2 |

## Mobile — shared

| ID | Screen | APIs | MS |
|---|---|---|---|
| MOB-MSG-01 | Message thread | `messages.*` | M5 |
| MOB-NOT-01 | Notification inbox (**M10, implemented**) | home-header bell + unread badge (`notification.unreadCount`); `(app)/notifications` list (`notification.list`, pull-to-refresh) — tap = markRead + deep-link (`actionUrl` → e.g. `/announcements/:id`, else type default), per-row archive, mark-all-read | M10 |
| MOB-ANN-01 | Announcements (**M11, implemented**) | `(app)/announcements` feed (`announcement.list`, published+targeted) + detail (`get`, attachment downloads); authors get a Drafts tab + create/edit draft (`create`/`update`); permission-gated home nav | M11 |
| MOB-CAL-01 | School calendar (**M11, implemented**) | `(app)/calendar` — Upcoming (`calendar.upcoming`) / Month (`calendar.month`) with a type filter (covers upcoming holidays + exam schedule); read-only (`calendar:read`) | M11 |
| MOB-BEH-01 | Behaviour (**M12, implemented**) | student profile → *Behaviour incidents* (`behaviour.listByStudent`) + *Record incident* (`create`); `(app)/behaviour` teacher referrals (`listByTeacher`); `(app)/behaviour/[id]` detail + resolve/close; parent `(app)/behaviour/children` → child history; BEHAVIOUR notification deep-links to `/behaviour/:id` | M12 |
| MOB-FEE-01 | Fees (**M13, implemented**) | `(app)/fees` student picker (role-scoped); `(app)/fees/student/[studentId]` ledger + **outstanding dues** (`fee.listInvoicesByStudent`); `(app)/fees/invoices/[id]` invoice detail + payment history (`payment.listByInvoice`) + **admin quick payment entry** (`payment.record`); `(app)/fees/receipt/[paymentId]` receipt (`payment.receipt`). Parent **view-only** (no gateway); INVOICE_ISSUED/PAYMENT_RECEIVED notifications deep-link to `/fees/invoices/:id` | M13 |
| MOB-DOC-01 | Documents (**M15, implemented**) | `(app)/documents` student picker (role-scoped); `(app)/documents/student/[studentId]` document center — **grouped by type** (`document.listStudentDocuments`; teacher own-section / parent own-child **APPROVED-only**), **Open** = 60s signed URL (`document.downloadUrl` → `Linking`); admin (`document:manage`/`approve`) **Generate** (type chips → snapshot), **Approve**/**Archive**/**Delete draft** per row. Upload is web-only (no mobile file picker). Permission-gated home nav | M15 |
| MOB-SET-01 | Settings | locale → `profile.update`; logout (token dereg) | M1 |

## Web — auth & shell

| ID | Screen | Role | Notes | MS |
|---|---|---|---|---|
| WEB-AUTH-01 | Login | – | staff primary; parent OTP supported | M1 |
| WEB-DASH-01 | Dashboard | all staff | role cards: attendance today, pending leave, recent imports, dues (flag) | M2+ |

## Web — people & academic (M2)

| ID | Screen | Notes |
|---|---|---|
| WEB-STU-01/02 | Students list / detail | table (cursor, filters class/division/status); detail tabs: profile, guardians, enrollment, attendance, marks, fees(flag) |
| WEB-GUA-01 | Guardians | link/invite; per-student primary flag |
| WEB-STA-01/02 | Staff list / detail | assignments editor (division, subject, class-teacher flag) |
| WEB-IMP-01/02 | Import wizard / job status | template download, mapping, preview errors, partial-commit report (F3) |
| WEB-ACA-01..05 | Years, classes, divisions, subjects, assignments | year setCurrent = destructive confirm (B6) |
| WEB-ENR-01 | Enrollment | per-division roster, rollNo, transfer/drop |
| WEB-PRO-01 | Promotion wizard | year-end bulk; dry-run preview; overrides; destructive confirm (F11) |

## Web — attendance/exams (M3–M4)

| ID | Screen | Notes |
|---|---|---|
| WEB-ATT-01 | Attendance | division/date grid, mark or correct (audited); summaries export |
| WEB-EXA-01 | Exams list/create | category, dates |
| WEB-EXA-02 | Exam subjects | max marks/pass per ClassSubject |
| WEB-EXA-03 | Marks entry | web grid twin of MOB-TEA-03 |
| WEB-EXA-04 | Results | division results, grade distribution, publish (`exams.publishResults`, v1.3) |
| WEB-EXA-05 | Report cards | generate (bulk per division), regenerate, download |
| WEB-SET-03 | Grade scales | bands editor (A+→E, min/max %, points) — seeded SCERT default |

## Web — comms, ops, add-ons

| ID | Screen | Notes | MS |
|---|---|---|---|
| WEB-HW-01 | Homework | list/post per division | M5 |
| WEB-LEA-01 | Leave admin view | school-wide list, filters | M5 |
| WEB-ANN-01 | Announcements | compose (en+ml fields), scope picker | M5 |
| WEB-MSG-01 | Messages | thread list + pane | M5 |
| WEB-AUD-01 | Audit viewer | super admin; filters entity/actor/date; before/after diff | M4 |
| WEB-SET-01 | School settings | branding, locale default, typed settings (attendance mode, cutoff, working days — B4), holiday calendar (B1) | M2/M3 |
| WEB-SET-02 | Feature flags | super admin toggle (audited) | M1 |
| ~~WEB-FEE-01..04 (flag: fees; Razorpay; receipt PDFs)~~ | **SUPERSEDED** by WEB-FEE-05..07 below (M13/ADR-021 — permission-only, no flag, no gateway) | — | — |
| WEB-TT-01..03 | Timetable console (**M9, implemented**) | admin (`timetable:manage`): (01) bell schedule & period CRUD; (02) section grid = periods×Mon–Sat, click-cell→modal (drag-free), conflict warnings, CSV; (03) teacher read view + CSV. Year/class/section filters. **No flag** (ADR-017 §4) | M9 |
| WEB-NOT-01 | Notifications (**M10, implemented**) | dashboard-header bell + unread badge + recent-notifications dropdown; `/notifications` page — inbox (mark read + deep-link, archive, mark-all-read) + admin announcement composer (`announcement:send`): bulk whole-school or one section, priority, recipient-count confirmation | M10 |
| WEB-ANN-01 | Announcement console (**M11, implemented**) | `/announcements` — Drafts/Published/Archive tabs + scope filter; composer creates/edits drafts (admin full scope + class/section pickers; teacher own sections), **attachment upload/remove/download** (DRAFT), lifecycle (publish/archive admin-only, delete author draft). `announcement:read`/`manage`/`draft`. **No flag** | M11 |
| WEB-CAL-01 | Calendar management (**M11, implemented**) | `/calendar` — month grid + event list + type filter; admin (`academic:manage`) create/edit/delete (native date inputs); **CSV export** (`calendar:read`). **No flag** | M11 |
| WEB-BEH-01 | Behaviour console (**M12, implemented**) | `/behaviour` — admin (`behaviour:manage`) list with student/teacher/severity/status filters, resolve/close per row, **CSV export** of the filtered view. Leave admin approve/reject is the existing `/attendance/leave` (now auto-notifies via the repointed `leave.decide`). **No flag** | M12 |
| WEB-FEE-05 | Fees console (**M13, implemented**) | `/fees` — admin (`fee:manage`): **generate** (structure + class→section + due date, shows created/skipped), **filters** academic year/class/section/status, per-row Issue/**Record payment**/Cancel/Receipts, **outstanding total**, **CSV export** (student ledger / outstanding report). **No flag** | M13 |
| WEB-FEE-06 | Fee structures (**M13, implemented**) | `/fees/structures` — admin (`fee:manage`) create/edit named per-year templates + component lines (₹→paise), (de)activate; edits affect future invoices only (snapshot) | M13 |
| WEB-FEE-07 | Receipt (**M13, implemented**) | `/fees/receipt/[paymentId]` — printable receipt (`window.print()` → PDF), render-on-demand from payment + invoice (no stored PDF); scope-gated | M13 |
| WEB-DOC-01 | Documents console (**M15, implemented**) | `/documents` — admin (`document:manage`): school-wide table (`document.list`) with **filters** student/type/status, **Generate** modal (snapshot frozen server-side), **Upload** modal (mint→`uploadToSignedUrl`→`createUploaded`), **approval workflow** (Approve/Archive/Delete draft), **Preview** (60s signed URL → `window.open`), **CSV export**. Teacher/parent (`document:read`) get a read-only student view (APPROVED-only, Download). **No flag** | M15 |
| WEB-DOC-02 | Document templates (**M15, implemented**) | `/documents/templates` — admin (`document:manage`) create/rename/(de)activate per-type certificate templates (minimal v1; reserved renderer body not authored) | M15 |
| WEB-ANA-01 | Analytics | attendance trends, result distribution | flag |

## Cross-cutting screen requirements

1. Every screen: strings via `packages/i18n` (en+ml), WCAG AA, ≥44px targets, IST dates.
2. Tables degrade to card lists on mobile widths (UI_DESIGN_SYSTEM §9).
3. Signed-URL consumers (PDFs, attachments, photos) handle expiry by re-fetching, never caching URLs (ADR-004).
4. Flag-gated screens hidden when off; direct navigation shows a "not enabled" state (server returns FORBIDDEN).
5. Destructive actions (promote, drop, disable, reject, regenerate) use the confirm-dialog pattern naming the consequence.
6. **M8 (implemented):** the mobile **Home** (`(app)/index.tsx`) is now a scrollable role-aware dashboard —
   greeting + today-context (a teacher's sections / a parent's children) + permission-gated nav cards (F1/F7);
   the M0 placeholder is gone. Report-card / class-teacher / student-profile screens now render **names**
   (Staff.name + server-enriched exam/term/student/class/section names), not raw ids (F2–F5).
7. **M9 (implemented):** mobile **`(app)/timetable/index.tsx`** — read-only weekly timetable (teacher own
   slots / parent child's section, weekday-grouped, enriched DTO — no id lookups); the Home dashboard gains a
   **"Today's schedule"** card + Timetable nav, gated on `timetable:read`. Web timetable console = WEB-TT-01..03
   above (admin `timetable:manage`).
8. **M10 (implemented):** a notification bell + unread badge in the mobile home header and the web dashboard
   header (every role — `notification:manage_own`); MOB-NOT-01 / WEB-NOT-01 above are the inboxes. Tapping a
   notification marks it read and deep-links to the destination screen (by type — mobile routes are studentId-
   keyed, so it routes to the section, not the raw entity). Admins compose announcements on WEB-NOT-01.
9. **M11 (implemented):** persistent Announcements (MOB-ANN-01 / WEB-ANN-01) + School calendar (MOB-CAL-01 /
   WEB-CAL-01), gated on `announcement:read` / `calendar:read` in the home/dashboard nav. Announcement
   notifications now deep-link to `/announcements/:id` (the M10 inbox prefers the event `actionUrl`). Authoring:
   teachers draft (own sections), admins publish; web is the full console (attachment uploads, class/section
   targeting), mobile is lighter.
10. **M12 (implemented):** Student discipline (MOB-BEH-01 / WEB-BEH-01), gated on `behaviour:read`/`record`/`manage`
    in the home/dashboard nav. Teachers record from a student's profile (behaviour tab); admins run the web console
    (filters + resolve/close + CSV); parents view their child's history. BEHAVIOUR notifications deep-link to
    `/behaviour/:id`; LEAVE notifications deep-link to `/attendance/leave` (the M4 leave screens are reused — parent
    apply/history + admin approve/reject, which now auto-notifies the parent). The brief's leave/behaviour **calendar
    view is deferred** (M11 calendar covers calendar needs; not in the M12 DoD).
11. **M13 (implemented):** Fees & payments (MOB-FEE-01 / WEB-FEE-05..07), gated on `fee:read`/`fee:manage` +
    `payment:record`/`payment:read` in the home/dashboard nav. Admins run the web console (generate, issue, record,
    cancel, receipts, CSV) + manage structures; the office records payments (cash/UPI/cheque — **no online gateway**).
    **Parents are view-only** — ledger, outstanding dues and receipts (no "Pay Now" button). INVOICE_ISSUED /
    PAYMENT_RECEIVED notifications deep-link to `/fees/invoices/:id`. Receipts render on demand (print → PDF; no stored
    file). **Refunds + concessions deferred**; OVERDUE is compute-on-read.
12. **M14 (implemented):** the web **Dashboard** (WEB-DASH-01, `(app)/dashboard`) changed from a **placeholder**
    (role + nav links) to a **real role-aware analytics dashboard** — KPIs + charts (Recharts) + client-side CSV
    export + quick links; the INVITED-activation flow is preserved. The mobile **Home** (`(app)/index.tsx`) gained
    an analytics **"At a glance"** overview + a recent-announcements slot (same screen — no new route). Read-only
    over frozen M1–M13; **no new permission** (each panel reuses its domain read + scope; school-wide panels are
    admin-only); **no new screens/routes**. **No flag** (ADR-022).
