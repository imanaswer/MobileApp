# UX-1 — Design System & Full Visual Overhaul — ✅ WEB COMPLETE (mobile tabs/sweep deferred)

Scope: a **presentation-layer overhaul** over frozen backend M1–M17. Behaviour-preserving —
every screen keeps its exact data, actions, gating, and routing. All styling flows from one
token source in `packages/ui`. **ADR-UX1** governs the design. Zero backend/API/schema change.

## Steps

- ✅ **1 — Foundations (ADR-UX1):** institutional color scales (brand blue + navy + warm
  neutrals), semantic triads, domain accents (WCAG AA), Inter type scale, 4px spacing, radii/
  elevation, motion tokens, lucide iconography. Implemented in `packages/ui` (web preset imports
  tokens; mobile config mirrors them). Web Inter via `next/font`.
- ✅ **2a — Web component kit:** `apps/web/src/components/ui/*` (Button, fields, StatusChip,
  Card/StatCard, Dialog/ConfirmDialog, Toast, DataTable, EmptyState/ErrorState, Skeleton,
  PageHeader, Tabs, Avatar) + dev-only `/design-system` reference. `academic/ui.tsx` re-exports
  the kit (zero import breakage).
- ✅ **2b — Mobile component kit:** `apps/mobile/src/components/ui/*` (NativeWind equivalents +
  @expo/vector-icons Feather, in lieu of lucide-react-native's native `react-native-svg`).
- ✅ **3a — Web app shell:** fixed navy sidebar (grouped, gated nav — same `can()` checks) +
  top bar; wired into `(app)/layout.tsx`.
- ✅ **3b — Mobile font/toast + web login:** Inter `useFonts` gate + ToastProvider (mobile root);
  web login re-skinned (center card). Mobile login re-skinned + global Inter (per-component).
- ✅ **4 — Screen sweep (web):** **36 `(app)` screens** migrated onto the kit (via 5 parallel
  agents), presentation-only — verified byte-identical tRPC/gating vs HEAD. Complex grids (marks
  entry, report-card detail, attendance mark) migrated safe-only (chrome/status/toasts; grid +
  keyboard logic untouched).
- ✅ **5 — Dashboard & first-run:** time-of-day greeting + role chip, module accent cards
  (reused nav gating), first-run `EmptyState`; `Kpi`/`Panel` restyled → stat-card look (propagates
  to all role dashboards). Resolved the shell/dashboard redundancy.
- ✅ **6 — QA & evidence:** contrast audit (below), design-system guide, this doc.

## Step-4 screen coverage (web)

All real `(app)` screens migrated; 4 pure `redirect()` index pages need no UI. Complex screens =
safe-only (marked *).

| Module | Screens |
|---|---|
| Academic | years, years/[id], classes, classes/[id], subjects, assignments, class-teachers |
| Timetable | grid, schedule, teachers |
| People | students, students/[id], parents, teacher-profiles |
| Fees | fees, structures, receipt/[paymentId] |
| Exams / Report cards / Homework | exams, grade-scales, exams/[examId]*, report-cards, report-cards/[id]*, homework, homework/[homeworkId] |
| Communication | announcements, behaviour, calendar, notifications |
| Documents | documents, templates |
| Attendance | corrections, holidays, leave, summary, mark* |
| Settings, Dashboard, Auth | settings, dashboard, login |

Each: kit components only · four states (skeleton/empty/error/populated) · one primary action ·
destructive behind ConfirmDialog · names + StatusChip + IST dates (no raw cuid/enum/timestamp) ·
tokens + canonical icons · toasts on mutations · labeled inputs + aria-labels on icon buttons.

## Evidence

- **Contrast (WCAG AA):** every text pairing computed — all ≥ 4.5:1 after fixing the sidebar
  group header (`navy-400`→`navy-300`, 3.64→6.48). `neutral-400` remains only on placeholder text
  (non-essential) and `aria-hidden` decorative icons (exempt). Table: ADR-UX1 §1.
- **Bundle:** First Load JS shared **103 kB**; routes ~148–153 kB. No bloat — `lucide-react` is
  per-icon (tree-shaken), Inter is self-hosted via `next/font` (no CLS/FOIT), no heavy deps added
  beyond icons + font.
- **Gate:** lint 14/14 · typecheck 14/14 · test 7/7 · web build 41/41 · mobile typecheck.

## Requires runtime verification (no device/browser in the build env)

1. **Mobile Stack→Tabs conversion** — not done; structural live-nav change, needs a device.
2. **Mobile screen sweep** — app screens still use old primitives (kit + login done); needs device.
3. **Web keyboard pass** — kit has visible focus rings + operable controls (Button/DataTable
   sortable headers/Dialog Esc); full tab-order verification on the 5 complex screens needs a browser.
4. **Mobile small-viewport pass** + on-device Inter rendering.
5. **Before/after screenshots** — not producible headless; `/design-system` (dev) is the reference.

## Deviations
- Mobile icons = @expo/vector-icons Feather (Lucide's parent), not lucide-react-native (avoids an
  unverifiable native `react-native-svg` build).
- Greeting/sidebar show the **role**, not a name — `auth.me` returns no name; a `name` field on
  auth.me is a noted future item (no-new-API rule).
- Global mobile Inter is applied per-component (RN has no font inheritance).
