# Component Inventory — School Management Portal

Component catalog for `packages/ui` (shared tokens/primitives) and app-level domain components. Complements `UI_DESIGN_SYSTEM.md` (visual spec) — this is the build checklist. Web = shadcn/ui-based; mobile = NativeWind equivalents consuming the same tokens.

> **UX-1 update (ADR-UX1):** the built component kit now lives in `apps/web/src/components/ui/*`
> and `apps/mobile/src/components/ui/*` (see `docs/DESIGN_SYSTEM.md` for the full reference). The
> web kit's living gallery is the dev-only `/design-system` route. The Tier-1 table below is the
> original plan; the shipped kit is the source of truth.

## Tier 1 — `packages/ui` primitives (shared naming, per-platform impl)

| Component | Web basis | Mobile basis | Notes | MS |
|---|---|---|---|---|
| `Button` | shadcn button | Pressable | variants/sizes/states per DS §7; loading preserves width | M1 |
| `Input`, `Textarea` | shadcn | TextInput | visible label required; error wiring per DS §8 | M1 |
| `Select`/`Combobox` | shadcn | picker sheet | searchable for long lists (students) | M2 |
| `Checkbox`, `Radio`, `Switch` | shadcn | custom | | M2 |
| `DatePicker` (IST-aware) | shadcn calendar | native sheet | calendar-date only; uses `@repo/utils` IST helpers | M2 |
| `DateRangePicker` | ↑ | ↑ | leave, reports | M5 |
| `FileUpload` | dropzone | expo-document-picker | client MIME+size validation mirrored server-side | M2 |
| `Card` | div | View | DS §10 | M1 |
| `Dialog` / `ConfirmDestructive` | shadcn dialog | bottom sheet | destructive confirm names the consequence | M1 |
| `Sheet` (side/bottom) | shadcn | gorhom/bottom-sheet or equivalent | | M2 |
| `Toast` | sonner-style | toast lib | error/rollback feedback; `aria-live` | M1 |
| `Badge` | shadcn | View | status colors only via domain map (below) | M2 |
| `Avatar` | shadcn | Image | student/staff photos, initials fallback | M2 |
| `Skeleton` | shadcn | shimmer | every list/detail loading state | M1 |
| `EmptyState` | custom | custom | illustration + primary action | M1 |
| `ErrorState` | custom | custom | message + retry | M1 |
| `Tabs`, `Accordion` | shadcn | custom | detail pages | M2 |
| `DataTable` | TanStack Table + shadcn | — (degrades to CardList) | sticky header, cursor pagination, bulk-select bar | M2 |
| `CardList` | — | FlashList | virtualized; the mobile "table" | M2 |
| `LocaleText` helpers | next-intl | i18next | + `MalayalamSafe` line-height wrapper (DS §2) | M1 |

## Tier 2 — domain components (app-level, composed from Tier 1)

| Component | Used by | Notes | MS |
|---|---|---|---|
| `StatusBadge` | attendance, leave, invoice screens | single source: domain status → token map from DS §1 (PRESENT=success, ABSENT=destructive, …) | M3 |
| `ChildSwitcher` | all parent screens | header control; drives global `activeStudentId` | M2 |
| `RoleGate` / `FlagGate` | nav, screens | render-time visibility only — server still enforces | M1 |
| `AttendanceGrid` | MOB-TEA-02, WEB-ATT-01 | mark-all-present + flip; optimistic; 40 rows fast (virtualized) | M3 |
| `AttendanceCalendar` | MOB-PAR-02 | month view + % summary | M3 |
| `MarksEntryGrid` | MOB-TEA-03, WEB-EXA-03 | cell validation vs maxTheory/maxPractical; absent toggle; conflict handling | M4 |
| `GradeScaleEditor` | WEB-SET-03 | band rows, overlap validation | M4 |
| `ReportCardViewer` | MOB-PAR-03, WEB-EXA-05 | signed-URL PDF with expiry re-fetch | M4 |
| `HomeworkComposer` / `HomeworkCard` | MOB-TEA-04, MOB-PAR-04 | attachments, due date | M5 |
| `LeaveForm` / `LeaveCard` / `LeaveDecisionSheet` | MOB-PAR-05, MOB-TEA-05 | range picker, status timeline | M5 |
| `AnnouncementComposer` (en+ml fields) / `AnnouncementCard` | WEB-ANN-01, notices | scope picker with target select | M5 |
| `MessageThread` / `MessageBubble` / `MessageInput` | MOB-MSG-01, WEB-MSG-01 | read receipts | M5 |
| `NotificationBell` + `NotificationList` | all shells | unread badge from `[userId, readAt]` | M3 |
| `ImportWizard` (Stepper, ColumnMapper, RowErrorTable) | WEB-IMP-01/02 | shared Zod row schemas drive error display | M2 |
| `PromotionWizard` | WEB-PRO-01 | dry-run diff view, per-row overrides | M2 |
| `AuditDiffViewer` | WEB-AUD-01 | beforeJson/afterJson side-by-side | M4 |
| `StudentPicker` / `DivisionPicker` | many | scope-aware (only own divisions for teachers) | M2 |
| `DashboardStatCard` | WEB-DASH-01, MOB homes | | M2 |
| `OtpInput` | MOB-AUTH-03 | 6 cells, resend timer | M1 |
| `LanguageSwitcher` | welcome, settings, web topbar | | M1 |
| `OfflineBanner` + `SyncQueueIndicator` | teacher attendance | `offline` flag (OFFLINE_STRATEGY) | flag |
| `FeeInvoiceCard` / `PaymentSheet` (Razorpay) / `ReceiptViewer` | fees screens | **flag: fees** | GL |
| `TimetableGrid` (**M9, implemented**) | WEB-TT-01..03 (`components/timetable/ui.tsx`) | periods×Mon–Sat; break rows span; click-cell→modal editor OR read-only; empty cells clickable. Also `YearSelect`, `downloadCsv`/`entriesToCsv`. Mobile read view is a plain screen (`(app)/timetable`). **No flag** (ADR-017 §4); conflict warnings via mutation errors, not client prediction | M9 |
| `NotificationBell` (**M10, implemented**) | mobile home header (`components/notifications-ui.tsx`), web dashboard header (`components/notification/ui.tsx`) | bell + unread badge (`notification.unreadCount`, `99+` cap); web adds a recent-notifications dropdown. Shared helpers `deepLinkForType` (type→destination screen) + `timeAgo`. Inbox screens = MOB-NOT-01 / WEB-NOT-01; web `/notifications` adds the admin `AnnouncementComposer`. **No flag** (ADR-018) | M10 |
| Announcements/Calendar UI (**M11, implemented**) | mobile `components/announcements-ui.tsx` (SCOPE/STATUS/EVENT_TYPE labels, `formatDate`, `AttachmentList` signed-URL download), web `src/components/announcement/ui.tsx` (labels, `pushAnnouncementFile` upload, `validateAnnouncementFile`, `kb`) | shared helpers behind the announcement console + calendar screens (MOB/WEB-ANN-01, MOB/WEB-CAL-01). Web console + calendar are page-local components (`app/(app)/announcements`, `app/(app)/calendar`); calendar CSV reuses `downloadCsv`. **No flag** (ADR-019) | M11 |
| Behaviour UI (**M12, implemented**) | mobile `components/behaviour-ui.tsx` (CATEGORY/SEVERITY/STATUS labels, `SeverityText`/`StatusText`, `Header`/`Field`/`Chip`/`Loading`) | shared helpers behind the discipline screens (MOB-BEH-01). Web console is a page-local component (`app/(app)/behaviour/page.tsx`) reusing `academic/ui` (TableShell, buttons, inputs) + `attendance/ui` `downloadCsv` for CSV export. **No flag** (ADR-020) | M12 |
| Fees UI (**M13, implemented**) | mobile `components/fees-ui.tsx` (`formatPaise` Hermes-safe ₹ grouping, `InvoiceStatusText`, `METHOD_LABEL`, `PAYMENT_METHODS`), web `src/components/fees/ui.tsx` (`formatPaise` Intl-INR, `INVOICE_STATUS_LABEL`/`INVOICE_STATUS_FILTERS`, `StoredInvoiceStatusKey`, `METHOD_LABEL`, `PAYMENT_METHODS`) | shared helpers behind the fee screens (MOB-FEE-01, WEB-FEE-05..07). Mobile screens reuse `behaviour-ui` `Header`/`Field`/`Chip`/`Loading`. Web pages are page-local (`app/(app)/fees/page.tsx` with `PaymentModal`/`ReceiptsModal`, `fees/structures/page.tsx` with `StructureModal`, `fees/receipt/[paymentId]/page.tsx`) reusing `academic/ui` (`Modal`, `TableShell`, buttons, inputs) + `attendance/ui` `downloadCsv`. **No flag** (ADR-021) | M13 |
| Analytics UI (**M14, implemented**) | web `src/components/analytics/ui.tsx` (`Panel`, `Kpi`, `AreaTrend`, `LineTrend`, `BarSeries`, `StatusPie` — Recharts, responsive, theme-aware), `dashboards.tsx` (`AdminDashboard`, `TeacherDashboard`, `ParentDashboard`), `csv.ts` (`toCsv`/`downloadCsv`, client-side export); mobile home `apps/mobile/src/app/(app)/index.tsx` gains hand-rolled `StatTile`/`StatGrid`/`PercentBar` (no chart lib) + an "At a glance" analytics overview + a recent-announcements slot | drives the role-aware dashboard (WEB-DASH-01) + mobile home over frozen M1–M13. New dependency: **`recharts`** (web only). **No flag** (ADR-022) | M14 |
| Documents UI (**M15, implemented**) | mobile `components/documents-ui.tsx` (`DOCUMENT_TYPE_LABEL`, `DOCUMENT_STATUS_LABEL`, `DocumentStatusText`, `GENERATABLE_TYPES`), web `src/components/documents/ui.tsx` (`DOCUMENT_TYPE_LABEL`, `DOCUMENT_STATUS_LABEL`, `DocumentStatusBadge`, `CERT_TYPES`, `DOCUMENT_STATUSES`, `GENERATABLE_TYPES`) | shared label/status bits behind the document screens (MOB-DOC-01, WEB-DOC-01/02). Mobile screens reuse `behaviour-ui` `Header`/`Loading` + a local `ActionButton`; web pages are page-local (`app/(app)/documents/page.tsx` with `GenerateModal`/`UploadModal`, `documents/templates/page.tsx`) reusing `academic/ui` (`Modal`, `TableShell`, buttons, inputs) + `analytics/csv` `downloadCsv` + `lib/supabase/client` `uploadToSignedUrl`. **No flag** (ADR-023) | M15 |
| Administration/Settings UI (**M16, implemented**) | **no new shared component file** — page-local only: web `app/(app)/settings/page.tsx` (`Section`, `BrandingForm`, `SchoolForm`, `SystemForm`, `ExportButton`), mobile `app/(app)/settings/index.tsx` (`Segmented`, `Card`) | drives the administration console (WEB-SET-02) + mobile settings (MOB-SET-02). Reuses `academic/ui` primitives + `analytics/csv` `downloadCsv` + `lib/supabase/client` storage (logo up/download). **No flag** (ADR-024) | M16 |
| `TrendChart` / `DistributionChart` | WEB-ANA-01 | **flag: analytics** | flag |

## Rules

1. Components are **dumb**: data via hooks calling the typed API; no business logic (CODING_STANDARDS §7/8).
2. Tokens only — no raw hex/px (DS §1–§5). Domain status colors come from `StatusBadge`'s single map; never inline.
3. Every interactive component: focus-visible, labelled, ≥44px touch target, en+ml verified (Malayalam line-height).
4. Files `PascalCase.tsx`, one component per file, colocated `*.test.tsx` for logic-bearing components (grids, wizards, forms).
5. Add a component here when it's built; this inventory is the review reference for "does it already exist?"
6. **M8 (implemented):** web `LocaleGate` (`apps/web/src/i18n/locale-gate.tsx`) + a mobile inner
   `LocaleFromProfile` wire `LocaleProvider` to `me.locale ?? "en"` (F8, wire-only). Display labels resolve
   **server-side** (DTO enrichment, ADR-016) — components render `teacherName`/`studentName`/`examName`/
   `className` etc. handed to them; they never resolve ids to names client-side (no lookup maps).
