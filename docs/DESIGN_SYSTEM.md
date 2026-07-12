# Design System Guide (UX-1 / ADR-UX1)

The shared visual language for **web** (Next.js + Tailwind) and **mobile** (Expo +
NativeWind). One token source in `packages/ui` → a Tailwind preset (web) + a mirrored
NativeWind config (mobile). Institutional, calm, accessible — a school, not a startup toy.
Full rationale + AA table: `docs/architecture/ADR-UX1-design-system.md`.

## Tokens (`packages/ui/src/tokens.ts` — the single source)

**Color** — components reference *named scale steps + roles*, never raw hex:
- `primary` (brand blue, `#2563EB`=600), `navy` (deep, headers/sidebar), `neutral`
  (warm stone gray) — full 50→950 scales.
- Semantic **triads** `success`/`warning`/`danger`/`info` — chips use `bg-{x}-50
  text-{x}-700 border-{x}-200` (always **color + label**, never color alone).
- Domain accents (card left-border/icon): `attendance` `exams` `homework` `fees`
  `calendar` `messages`.
- Roles (theme-swappable CSS vars, dark-mode seam): `bg-primary` `text-foreground` etc.

**Type** — Inter (web `next/font`, mobile `@expo-google-fonts/inter`). Scale:
`text-display` (28/34 · titles) · `text-title` (20/28 · sections) · `text-body`
(16/24) · `text-sm` (14/20 · secondary) · `text-caption` (12/16 · chips/labels).
Numbers in tables/marks/fees: `tabular-nums`.

**Spacing/shape/motion** — 4px grid (`gap-2/3/4/6`…); radii `rounded-md`(8 inputs/
buttons) `rounded-card`(12) `rounded-xl`(16 modals) `rounded-full`(chips/avatars);
motion `duration-fast`(150) `duration-base`(200) `duration-panel`(250) — no bounces.

**Icons** — lucide-react (web) / @expo/vector-icons Feather (mobile), 20px / stroke 1.75.

## Components

- **Web kit:** `apps/web/src/components/ui/*` — Button, Input/Select/DateField/
  SearchInput/Field/FormRow/FormSection, StatusChip (+`statusTone`/`titleCase`),
  Badge, Banner, Card/StatCard, Dialog/ConfirmDialog, ToastProvider/`useToast`,
  DataTable/TableToolbar, EmptyState/ErrorState, Skeleton, PageHeader, Tabs, Avatar.
  Living reference: **`/design-system`** (dev-only route).
- **Mobile kit:** `apps/mobile/src/components/ui/*` — Button, TextField/Field,
  StatusChip, Card/StatCard, Avatar, ListRow, BottomSheet/ConfirmDialog, Toast,
  ScreenScaffold, SegmentedControl, EmptyState/ErrorState, Skeleton, Banner, Badge.

## Do / Don't

| Do | Don't |
|---|---|
| Use kit components + token classes | Page-local hex, ad-hoc font sizes, one-off spacing |
| `StatusChip` for every enum (color + label) | Color-only status; raw `ENUM_VALUE` text |
| Every list has skeleton / empty / error / populated | Lone spinner; blank screen on error |
| Destructive actions via `ConfirmDialog` (names the object) | Unconfirmed deletes |
| One primary action per screen (`PageHeader` action) | Multiple competing CTAs |
| `aria-label` on icon-only buttons; visible focus rings | Icon buttons with no label; removed focus outline |
| Names + `StatusChip` + IST dates | Raw cuid / enum / timestamp in the UI |
| Money/marks right-aligned + `tabular-nums` | Left-aligned jittery numbers |

## Accessibility

All text pairings pass **WCAG AA (≥4.5:1)** — verified (ADR-UX1 §1 table). Chips pair
color with a label. Inputs are labeled; icon buttons carry `aria-label`; focus rings
are visible (`focus-visible:ring-2`). Dark mode is out of scope but the CSS-var seam is
preserved — components must not hardcode light-only assumptions.
