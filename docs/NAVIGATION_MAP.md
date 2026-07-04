# Navigation Map — School Management Portal

Route structure for mobile (expo-router) and web (Next.js App Router), per role, plus push deep links. Screen IDs from `SCREEN_INVENTORY.md`. Tab design per `UI_DESIGN_SYSTEM.md` §12–13 (≤5 tabs, labels always shown, ≥44px targets).

## Mobile (expo-router) — `apps/mobile/src/app/`

```
app/
  (auth)/                     unauthenticated stack
    index.tsx                 welcome + language pick     MOB-AUTH-01
    phone.tsx                 parent OTP entry            MOB-AUTH-02
    otp.tsx                   OTP verify                  MOB-AUTH-03
    staff-login.tsx           staff email+password        MOB-AUTH-04
  (parent)/                   role = PARENT (guarded layout)
    (tabs)/
      home.tsx                MOB-PAR-01   Home (child header w/ switcher)
      attendance.tsx          MOB-PAR-02   child attendance
      homework.tsx            MOB-PAR-04   homework feed
      notices.tsx             MOB-PAR-07   announcements
      profile.tsx             MOB-PAR-08   child profile + settings entry
    marks/[examId].tsx        MOB-PAR-03   marks & report cards (from Home)
    leave/index.tsx           MOB-PAR-05   leave list + apply (modal)
    fees/index.tsx            MOB-PAR-06   dues + pay        (flag: fees)
    messages/[threadId].tsx   MOB-MSG-01   thread
  (teacher)/                  role = TEACHER (also OA/SA on mobile)
    (tabs)/
      home.tsx                MOB-TEA-01   today: my classes, pending approvals
      attendance.tsx          MOB-TEA-02   mark attendance
      marks.tsx               MOB-TEA-03   marks entry
      homework.tsx            MOB-TEA-04   post/list homework
      more.tsx                MOB-TEA-06   leave approvals, messages, notices, timetable, settings
    leave-approvals.tsx       MOB-TEA-05
    messages/[threadId].tsx   MOB-MSG-01
  notifications.tsx           MOB-NOT-01   notification centre (bell from any header)
  settings.tsx                MOB-SET-01   locale, account, logout
  _layout.tsx                 root: session provider, role router, push handler
```

**Role routing:** after sign-in, `_layout` reads `auth.me` → renders `(parent)` or `(teacher)` group; office/super admin on mobile get the teacher shell plus what their permissions allow (heavy admin is web-primary). Accountant is web-only.
**Child-switcher (parents):** persistent header control on all `(parent)` screens; selection is global client state (see STATE_MANAGEMENT_PLAN) — every child-scoped query keys on `activeStudentId`.
**Android back:** tabs keep independent stacks; back exits to Home tab first, then OS.

## Web (Next.js App Router) — `apps/web/app/`

```
(auth)/login                          WEB-AUTH-01 (staff login; parent OTP also works)
(dashboard)/                          shell: sidebar + topbar (locale, notifications, user)
  page                                WEB-DASH-01  role dashboard
  students, students/[id], students/import   WEB-STU-01/02, WEB-IMP-01/02
  guardians                           WEB-GUA-01
  staff, staff/[id]                   WEB-STA-01/02
  academic/(years|classes|divisions|subjects|assignments)   WEB-ACA-01..05
  enrollment, enrollment/promote      WEB-ENR-01, WEB-PRO-01
  attendance                          WEB-ATT-01 (view/mark)
  exams, exams/[id]/(subjects|marks|results)   WEB-EXA-01..04
  report-cards                        WEB-EXA-05
  homework                            WEB-HW-01
  leave                               WEB-LEA-01
  announcements                       WEB-ANN-01
  messages, messages/[threadId]       WEB-MSG-01
  audit                               WEB-AUD-01  (super admin)
  settings/(school|flags|grade-scales)  WEB-SET-01..03
  fees/(structures|invoices|dues|payments)    WEB-FEE-01..04  (flag)
  timetable                           WEB-TT-01               (flag)
  analytics                           WEB-ANA-01              (flag)
```

**Sidebar visibility** = permission-driven (client reads role + flags via `auth.me` + `flags.list`); server re-enforces on every call regardless.

| Section | SA | OA | T | AC |
|---|---|---|---|---|
| Dashboard, Announcements | ✓ | ✓ | ✓ | ✓ |
| Students/Guardians/Staff/Import, Academic, Enrollment | ✓ | ✓ | – | – |
| Attendance, Exams/Marks, Homework, Leave, Messages | ✓ | ✓(view-heavy) | ✓ (own scope) | – |
| Audit, Flags, Promotion | ✓ | – | – | – |
| Fees (`fees`) | ✓ | view | – | ✓ |
| Timetable/Analytics (flags) | ✓ | ✓ | read | – |

Parents use the app primarily; web parent view is a slim read-only subset (child pages) — post-core polish, not M-critical.

## Push deep links (notification `dataJson.link`)

| Event | Link target |
|---|---|
| Absence | `(parent)/attendance?studentId=…&date=…` |
| Homework posted | `(parent)/homework?highlight=…` |
| Marks published / report card | `(parent)/marks/[examId]` |
| Announcement | notices tab → detail sheet |
| Message | `messages/[threadId]` |
| Leave applied | `(teacher)/leave-approvals` |
| Leave decided | `(parent)/leave` |
| Fee due / receipt | `(parent)/fees` |

Rules: cold-start push → after session restore, route to link (fallback Home if scope fails). Parent links carry `studentId` → switcher auto-selects that child. All deep links re-validated server-side on data fetch (a stale/forged link shows an error state, never data).

## Guards summary

1. `(auth)` group only when signed out; signed-in users are redirected to their role group.
2. Role groups check the profile role; unknown/disabled → sign-out.
3. Flag-gated routes check `flags.list` client-side (hide) **and** the server checks per procedure (ADR-006).
4. Web middleware protects `(dashboard)` on session presence; fine-grained authz stays in the API (ADR-002).
