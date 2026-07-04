# School Management Portal — Product PRD (v2)

**Owner:** Anaswer Ajay · **Type:** Single-school deployment (paid client) · **Status:** Approved scope

> This is the **product/context** document — the *why*, the users, the rationale, the risks. For build scope, the data model and engineering detail, the **Developer PRD (v1.3)** is the source of truth. The two are kept consistent; where they overlap, defer to the Developer PRD.

---

## 1. Summary

**The client:** **Sri Gujarathi Vidhyalaya Higher Secondary School**, Beach Rd, Mananchira, Kozhikode, Kerala 673032 — an English-medium, co-education school (~153 years) managed by the Sri Gujarati Vidhyalaya Association (SGVA), serving a Gujarati-heritage community. Website: https://www.srigujaratividhyalaya.com/. Note: the brief says *aided*, the website says *"Kerala Government recognised unaided"* — **[CONFIRM §12.11]**; this affects what the `fees` add-on may collect.

A management portal for **one school** (single-tenant) connecting three user groups — **Parents, Teachers, and the Principal/Office** (students are records, not logins) — around attendance, academics (Kerala SCERT/DHSE grading), homework, leave, communication and administration.

Delivered as a **web admin dashboard** (primary for staff/office) plus a **native mobile app** (Android & iOS, for parents and staff; parents are the primary users), on one shared backend.

**Commercial model:** a generous **core platform** plus optional **add-ons** the school can switch on. The likely contract (Recommended tier) is **core + online fee collection + WhatsApp alerts**. Other add-ons (timetable, analytics, offline) are built behind feature flags and can be enabled later with no rebuild.

---

## 2. Goals & non-goals

### Goals
- One source of truth for students, staff, classes, attendance, marks, homework and leave.
- Parents stay informed (attendance, marks, homework, notices) with near-zero-friction login.
- Teachers do daily work fast: attendance, marks, homework, leave approvals.
- Principal/office runs the school: users, academics, year-end promotion, announcements, reports.
- Bilingual (English + Malayalam), works on weak connectivity, trustworthy with minors' data.

### Non-goals (out of scope unless purchased/requested)
- Transport/bus tracking, library, hostel, biometric/RFID hardware.
- Multi-school SaaS — not built; data is namespaced so a future port isn't a rewrite.
- Public marketing website / admissions site.
- A standalone events **calendar** — covered by announcements; a true calendar would be a new paid add-on.

> Online fee collection is **not** a non-goal — it's a paid **add-on** (in the Recommended contract), not deferred work.

---

## 3. Scope — Core vs Add-ons

The product is one generous core plus modular add-ons (matches the commercial proposal).

### Core (always built — the foundation)
Auth & roles (phone OTP + email/password via Supabase Auth) · office/teacher/parent portals · web dashboard + mobile app · student/guardian/staff records · **bulk import** · classes/divisions/subjects/teacher assignments · daily attendance with auto % · exams, marks, **Kerala A+→E grades**, **printable report cards (PDF)** · homework & notes (teacher posts; parents and child read — distribution-only) · **leave requests** · announcements + teacher↔parent messaging · in-app push · English + Malayalam · audit log.

### Add-ons (feature-flagged)
| Add-on | Flag | Notes |
|---|---|---|
| Online fee collection (Razorpay) | `fees` | In Recommended tier; needs fee structure from school |
| WhatsApp alerts | `whatsapp` | In Recommended tier |
| Timetable builder | `timetable` | Optional |
| Insight dashboards | `analytics` | Optional |
| Offline attendance | `offline` | Optional |

Everything not bought is built-but-off, enabled later with no migration.

---

## 4. Users, roles & access

Five roles. Students do not log in — they are records, and the parent is the family-facing account. (The flowchart merged Parents/Students; here the family login is the parent.)

| Role | Surface | Can do |
|---|---|---|
| **Principal (Super Admin)** | Web (primary) + app | Everything; users/academics, year-end promotion, school-wide reports & announcements, audit log |
| **Office / Admin staff** | Web (primary) + app | Day-to-day admin: students/guardians, bulk import, assign classes, notices. No destructive/structural changes without Principal. |
| **Teacher** | App + web | Attendance, marks for assigned subjects, homework/notes, message guardians, view own classes. **Class Teacher** is the same account with a flag = extra rights over their division (incl. leave approval) |
| **Parent / Guardian** | App (primary) + web | Their child(ren) only; attendance, marks, homework, notices, profile; **child-switcher**; apply for the child's leave |
| **Accountant** *(with `fees`)* | Web | Fees, invoices, payments, receipts, dues |

> The **student** is a record, not a user — there is no student login. The parent is the family-facing account. **Class Teacher** is a designation on a Teacher, not a separate role.

**Principle:** the app supports all logged-in roles (staff + parents), but heavy admin (bulk import, timetable builder, big reports) is **web-primary**; teacher daily flows (attendance, marks, homework) are **fully mobile-capable**. Parents are the primary mobile audience.

---

## 5. Personas (short)
- **Parent (low digital literacy, Malayalam-first):** wants to know is my kid in school, the marks, the homework, what the school said. Logs in by phone OTP; reads push.
- **Class teacher:** marks attendance for 40+ in under a minute, enters term marks, posts homework, approves leave. Mid-range Android, sometimes weak wifi.
- **Office clerk:** onboards admissions, fixes data, sends circulars. Lives on the web app.
- **Principal:** wants dashboard truth (attendance %, results), approves promotions, broadcasts.

---

## 6. Functional requirements (by module)

### 6.1 Authentication & onboarding
Phone **OTP** for parents, **email/password** for staff — all via **Supabase Auth** (no self-stored passwords). Accounts pre-created at import; first sign-in activates. Recovery via Supabase reset / OTP re-login. Roles assigned by admin; no public signup.

### 6.2 People management
CRUD for students, guardians, staff. **Guardian↔student is many-to-many** (enables the child-switcher). **Bulk import (CSV/Excel)** with validation + error report. **Student lifecycle** `admitted → active → promoted / retained / transferred(TC) / dropped → alumni`, tracked **per academic year**.

### 6.3 Academic structure
Academic year, class/standard, division/section, subject (theory/practical), class-subject mapping, teacher assignments, class-teacher designation. **[CONFIRM]** subject list + practicals.

### 6.4 Attendance
Bulk "mark all present, then flip absentees". Statuses Present/Absent/Half-day/Leave/Holiday. Auto daily/monthly/term %. Absence push to guardian (configurable cutoff). Daily vs period-wise **[CONFIRM]**.

### 6.5 Exams, marks & grading (core)
Exams per term (CE + terminals) **[CONFIRM structure]**. Marks per exam-subject; theory/practical. **Configurable** grade bands (A+→E) — never hardcoded. Auto grade, totals, result, optional rank **[CONFIRM visibility]**. **Printable report-card PDFs** (core, not deferred; generated per exam today, with the data model intentionally able to support consolidated/annual cards later with no migration). Every mark edit audited.

### 6.6 Homework & notes — distribution-only (core)
Teacher posts homework/notes/files to a division/subject; parents and the child read it in the app. **Distribution-only** — no online upload (matches the common Kerala flow: child writes in the notebook, teacher checks physically). If a school specifically wants digital homework uploads with feedback, scope it as a paid add-on.

### 6.7 Communication
Announcements scoped school/class/division. Threaded teacher↔guardian messaging, scoped to their students (safeguarding). In-app notifications on everything.

### 6.8 Leave (core)
Parent/guardian applies → class teacher approves/rejects → reflected in attendance.

### 6.9 Profiles & portals
Role-aware dashboards (office, teacher, parent); parent child-switcher; the student is a record the parent views (class, subjects, guardians, attendance, marks, timetable) — no student login.

### 6.10 Reports & analytics
Attendance and results summaries for class teacher (their division) and principal (school-wide); exportable. Richer visual dashboards are the `analytics` add-on.

### 6.11 Cross-cutting
Audit log; in-app notification centre; bilingual UI; bulk operations wherever staff touch many rows.

---

## 7. Tech stack & architecture (summary)

Next.js 15 (web) + Expo (mobile), one **tRPC** API, **Supabase** (Postgres + **Auth** + Storage), **Prisma**. Notifications go through one provider abstraction — push via Expo (primary, free); SMS/WhatsApp via MSG91/Gupshup for critical alerts; the same layer also configures the OTP SMS provider. Resend for email; Razorpay for the `fees` add-on; PostHog + Sentry. Hosting on Vercel + Supabase + EAS.

**Why one tRPC API:** with multiple roles, an audit log and money in the `fees` add-on, authorization and business logic belong in one auditable place shared by web and mobile. **Authorization is enforced in the application (tRPC + business services); Supabase RLS is defense-in-depth** for Storage and direct access — it is not the primary gate (Prisma's privileged connection bypasses RLS). Full detail in the Developer PRD §4.4.

---

## 8. Non-functional requirements
- **Security & privacy (minors / DPDP Act):** least-privilege RBAC, scoped access, audit trail, encryption at rest/in transit, retention + deletion, no public student directory, guardian consent. **[CONFIRM client stance]**
- **Connectivity:** caches read data and queues attendance offline (offline add-on).
- **Localization:** every string translatable; per-user language; Malayalam typography tested.
- **Performance:** attendance for a 40+ class feels instant; optimistic UI.
- **Accessibility:** large tap targets, high contrast.
- **Availability:** managed services, daily backups.
- **Time:** IST throughout.

---

## 9. Notifications strategy

| Event | Channel |
|---|---|
| New marks / homework / notice / message | In-app push (free) |
| Student marked absent | Push + SMS/WhatsApp (cutoff; WhatsApp via `whatsapp`) |
| Fee due / overdue *(`fees`)* | Push + SMS/WhatsApp |
| OTP / account | SMS (via Supabase Auth provider) |

Default to push (free); spend on SMS/WhatsApp only for high-value events.

---

## 10. Roadmap / milestones (mapped to payment stages)

*(Renumbered 2026-07 to match the codebase — Dev PRD §13 has the authoritative table with payment gates.)*

1. **M0:** monorepo scaffold, CI, bilingual shell (shipped).
2. **M1 (deposit):** schema foundation, Supabase Auth + roles, school setup, feature flags.
3. **M2:** people + bulk import + academic structure + enrollment + school calendar/settings.
4. **M3:** attendance + push + scheduled absence job.
5. **M4:** exams, marks, grades, report-card PDFs, audit viewer.
6. **M5:** homework/notes, leave, announcements, messaging.
7. **M6 (testing payment):** profiles/portals polish, offline attendance, dashboards, QA on staging.
8. **Go-live (final payment):** contracted add-ons (fees + WhatsApp), data import, deployment, app-store submission, training.

---

## 11. Risks
- **Adoption by low-literacy parents** → OTP login, Malayalam-first UI, push over email.
- **Bad/missing import data** → strong validation + guided import + fix-it queue.
- **Grade-rule mismatch with the board** → configurable grade scale; verify SCERT/DHSE bands + term structure before M3.
- **Scope creep (fees details, calendar, transport)** → core/add-on boundaries above; calendar and others are separate paid work.
- **Marks disputes** → audit log from day one.

---

## 12. Open questions / assumptions to confirm
1. **Scale:** students / staff / classes (sizing + import effort)?
2. **Academic structure:** terms and exams per term (CE + terminals); theory/practical split?
3. **Grading:** seed the **official SCERT/DHSE grade bands**? Is **rank** shown or hidden?
4. **Attendance:** daily or period-wise? Staff attendance in v1?
5. **Existing data:** format of the student register for import?
6. **Fee structure** (for the `fees` add-on): heads, amounts, schedules?
7. **Branding:** the school's logo, colours and **domain** (the proposal used a clean light identity — the school's own brand, not Game Ground's).
8. **Apple/Google developer accounts:** school's or vendor's?
9. **Privacy:** written data-privacy/consent policy for minors (DPDP)?
10. **Final tier:** confirms which add-on flags ship ON.
11. **Aided vs unaided:** brief says aided; website says unaided — determines the `fees` scope.
12. **Gujarati (`gu`) UI language:** wanted as a later add-on for the Gujarati-heritage community? (v1 = en + ml.)
13. **School-day pattern:** working weekdays + holiday list for the calendar (Dev PRD §8.19).

---

*Product companion to the Developer PRD (v1.3). Keep both aligned as §12 answers land.*
