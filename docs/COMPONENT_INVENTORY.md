# Component Inventory — School Management Portal

Component catalog for `packages/ui` (shared tokens/primitives) and app-level domain components. Complements `UI_DESIGN_SYSTEM.md` (visual spec) — this is the build checklist. Web = shadcn/ui-based; mobile = NativeWind equivalents consuming the same tokens.

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
| `TimetableGrid` (builder + read views) | WEB-TT-01, mobile read | clash highlighting | flag |
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
