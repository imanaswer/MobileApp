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
| MOB-NOT-01 | Notification centre | `notifications.list/markRead` | M3 |
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
| WEB-FEE-01..04 | Fee structures / invoices / dues / payments | **flag: fees**; receipt PDFs | GL |
| WEB-TT-01 | Timetable builder | division×day×period grid; clash detection; publish | flag |
| WEB-ANA-01 | Analytics | attendance trends, result distribution | flag |

## Cross-cutting screen requirements

1. Every screen: strings via `packages/i18n` (en+ml), WCAG AA, ≥44px targets, IST dates.
2. Tables degrade to card lists on mobile widths (UI_DESIGN_SYSTEM §9).
3. Signed-URL consumers (PDFs, attachments, photos) handle expiry by re-fetching, never caching URLs (ADR-004).
4. Flag-gated screens hidden when off; direct navigation shows a "not enabled" state (server returns FORBIDDEN).
5. Destructive actions (promote, drop, disable, reject, regenerate) use the confirm-dialog pattern naming the consequence.
