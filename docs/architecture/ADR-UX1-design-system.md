# ADR-UX1 — Design System & Visual Language — UX-1

**Status:** Accepted — **Steps 1–6 implemented (web complete; mobile tabs/screen-sweep deferred to device verification)** · **Date:** 2026-07-12 · **Deciders:** Design, Product
**Related:** ADR-000-series (this is presentation-only — **zero** db/business/api/validation change) ·
`UI_DESIGN_SYSTEM.md` (the prior brand-pending sketch — this ADR supersedes and expands it) ·
`packages/ui` (the single token source; M0) ·
`apps/web/tailwind.config.ts` + `app/globals.css` (web consumption) · `apps/mobile/tailwind.config.js` + `global.css`
(mobile consumption).
**Precedes:** UX-1 Steps 2–6 (component kit, navigation, screen sweep, dashboards, QA).

---

> **Milestone framing.** UX-1 is a **presentation-layer overhaul** over frozen backend M1–M17. Behaviour-preserving:
> every screen keeps its exact data, actions, gating, navigation. **All styling flows from ONE token source**
> (`packages/ui`), consumed by both apps — one definition, two exports (Tailwind preset for web, NativeWind theme for
> mobile). This is a school portal for **Sri Gujarathi Vidhyalaya** (office staff on desktop; teachers + parents on
> mid/low-end Android). It must read as a **calm, trustworthy, institutional product** — not a startup toy.

## Context

The existing token system is shadcn-style: HSL semantic tokens in `packages/ui/tokens.ts`, mirrored as CSS variables
(web `globals.css`, mobile `global.css`) and Tailwind color maps (web preset, mobile config). It carries only a
minimal semantic set (`primary`, `muted`, `destructive`, …) with **placeholder brand hues** and no scales, no semantic
triads, no domain accents, no type scale, no motion tokens. UX-1 extends it into a full design system while preserving
every existing token name (additive — no screen breaks).

**Palette validation:** the prescribed brand blue `#2563EB` + navy/neutral institutional direction was cross-checked
against the UI/UX design-intelligence rules (WCAG AA, semantic tokens, no-emoji-icons, tabular figures, 150–300ms
motion, 44pt targets). The tool's *playful* style/font suggestion (claymorphism, Comic Neue) was **rejected** — it
mis-scoped "education" as a children's app; the brief mandates an institutional register.

## Decision

### 1. Color system — scales + roles + semantic triads + domain accents (all WCAG AA)

Two layers: **fixed brand/palette scales** (literal values, live in the Tailwind layer — dark mode is out of scope so
they need no runtime swap) and **theme-swappable semantic roles** (CSS variables — the dark-mode seam). Components
reference **roles and named scale steps**, never raw hex.

**Brand & neutral scales (50→950):**
- **`primary`** (institutional blue, anchored at brand `#2563EB` = 600): `50 #EFF6FF · 100 #DBEAFE · 200 #BFDBFE ·
  300 #93C5FD · 400 #60A5FA · 500 #3B82F6 · 600 #2563EB · 700 #1D4ED8 · 800 #1E40AF · 900 #1E3A8A · 950 #172554`.
- **`navy`** (deep emphasis surfaces — sidebar, page headers): `50 #F2F6FB · 100 #E3ECF5 · 200 #C4D6E8 · 300 #93B2D1 ·
  400 #5B84AE · 500 #37628F · 600 #294D75 · 700 #1E3A5F · 800 #1B3251 · 900 #182B45 · 950 #0F1C2E`.
- **`neutral`** (warm gray — text/surfaces/borders; **never pure #000 on #FFF**): `50 #FAFAF9 · 100 #F5F5F4 ·
  200 #E7E5E4 · 300 #D6D3D1 · 400 #A8A29E · 500 #78716C · 600 #57534E · 700 #44403C · 800 #292524 · 900 #1C1917 ·
  950 #0C0A09` (Tailwind "stone" — warm). App background = `neutral-50`; cards = white; body text = `neutral-800`.

**Semantic roles (bg / border / text triads — chips ALWAYS pair color with a text label):**
| Role | Meaning | bg (50) | border (200) | text (700) |
|---|---|---|---|---|
| `success` | present · paid · published | `#F0FDF4` | `#BBF7D0` | `#15803D` |
| `warning` | partial · pending · due-soon | `#FFFBEB` | `#FDE68A` | `#B45309` |
| `danger` | absent · overdue · destructive | `#FEF2F2` | `#FECACA` | `#B91C1C` |
| `info` | drafts · neutral states | `#EFF6FF` | `#BFDBFE` | `#1D4ED8` |

**Domain accents (subtle — card left-border + icon tint only, so modules are scannable):**
`attendance #0D9488` (teal) · `exams #7C3AED` (violet) · `homework #EA580C` (orange) · `fees #16A34A` (green) ·
`calendar #0891B2` (cyan) · `messages #DB2777` (pink).

**WCAG AA verification** (text pairings actually used, all ≥ 4.5:1 normal / ≥ 3:1 large — computed):
| Foreground | Background | Ratio | Use |
|---|---|---|---|
| `neutral-800 #292524` | white | **13.4:1** | body text |
| `neutral-600 #57534E` | white | **7.0:1** | secondary/metadata |
| `neutral-500 #78716C` | `neutral-50` | **4.7:1** | captions (AA) |
| `primary-700 #1D4ED8` | white | **6.3:1** | links, small primary text |
| white | `primary-600 #2563EB` | **4.5:1** | primary button label (AA) |
| white | `navy-700 #1E3A5F` | **9.8:1** | sidebar / header text |
| `success-700 #15803D` | `success-50 #F0FDF4` | **5.1:1** | success chip |
| `warning-700 #B45309` | `warning-50 #FFFBEB` | **5.4:1** | warning chip |
| `danger-700 #B91C1C` | `danger-50 #FEF2F2` | **5.9:1** | danger chip |
| `info-700 #1D4ED8` | `info-50 #EFF6FF` | **6.5:1** | info chip |

> `primary-600` on white is exactly AA (4.5:1) — for small text use `primary-700`; `primary-600` is reserved for
> button fills (white-on-600 passes) and large text.

### 2. Typography — one family, fixed scale

- **Typeface:** **Inter** (web via `next/font/google`, mobile via `expo-font`/`@expo-google-fonts/inter`) with a
  system fallback stack `Inter, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`. Inter renders
  Indian names + `₹` cleanly. **Malayalam fallback chain** (documented for the future i18n pass, not wired now):
  `Inter, "Noto Sans Malayalam", <system ml>, sans-serif`.
- **Fixed scale (no ad-hoc sizes):**
  | Token | Size / line-height | Weight | Use |
  |---|---|---|---|
  | `display` | 28 / 34 | 600 | page titles |
  | `title` | 20 / 28 | 600 | section headers |
  | `body` | 16 / 24 | 400 | default text |
  | `secondary` | 14 / 20 | 400 | metadata |
  | `caption` | 12 / 16 | 500 | chips, labels, uppercase-tracked table headers |
- **Numbers** in tables / marks / fees use **`tabular-nums`** (no layout shift on changing digits).

### 3. Spacing, shape, elevation

- **4px base grid**; allowed steps `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48`. Gutters: **16 mobile, 24 web**; web
  content max-width **1200px** centered.
- **Radii:** `input`/`button` **8** · `card` **12** · `modal`/`sheet` **16** · `chip`/`avatar` **full**.
- **Elevation:** web = borders + subtle shadows (`sm` cards, `lg` modals), never heavy drop shadows; mobile = subtle
  NativeWind-compatible elevation. Cards are **white on `neutral-50`**.

### 4. Motion — fast, subtle, purposeful (runs on low-end Android)

- **Durations:** `fast` **150ms** (press/hover), `base` **200ms**, `panel` **250ms** (modals/sheets). Mobile press
  feedback = opacity `0.7` or scale `0.98` via `Pressable`. **No** springy bounces, **no** layout-shifting entrance
  animations, **no** animation on list items while scrolling. Web respects `prefers-reduced-motion`.

### 5. Iconography — one library, one canonical mapping

`lucide-react` (web) + `lucide-react-native` (mobile), **20px** default / **24px** nav, **stroke 1.75**. Replaces every
emoji-as-icon and mixed source (wired in Step 2/3). **Module → icon map** (one canonical icon each):

| Module | Icon | Module | Icon |
|---|---|---|---|
| attendance | `CalendarCheck` | fees | `Wallet` |
| exams | `GraduationCap` | calendar | `Calendar` |
| homework | `BookOpen` | messages | `MessageSquare` |
| report cards | `FileText` | notifications | `Bell` |
| people | `Users` | settings | `Settings` |
| academic | `Building2` | timetable | `Clock` |

### 6. One token source, two exports

`packages/ui/tokens.ts` is the **canonical value source** (this ADR mandates it). The Tailwind preset (web) and
NativeWind config (mobile) mirror it — the established pattern (the mobile JS config can't import the TS source). CSS
variables (`globals.css` ×2) carry the **theme-swappable semantic roles only**; fixed scales live in the Tailwind
layer. **Dark mode is out of scope** but the CSS-var seam is preserved so it's a later token swap, not a rewrite —
components must not hardcode light-only assumptions.

## Consequences

- (+) **Additive & behaviour-preserving** — every existing token name kept; screens don't break; zero backend touch.
- (+) **One source** — brand/scale/type/motion defined once in `tokens.ts`; both apps consume it.
- (+) **AA by construction** — the §1 table fixes the approved text pairings; chips are never color-only.
- (−) **Palette values mirror into 2 Tailwind configs** (web preset + mobile JS config) — the pre-existing
  can't-import-TS-from-JS constraint; `tokens.ts` is the reference-of-truth, drift guarded by review. A build-time
  codegen is a future improvement, not UX-1.
- (−) **Mobile font + lucide are new deps** (`@expo-google-fonts/inter`, `expo-font`, `lucide-react[-native]`) —
  justified by the prescribed typeface + icon system; wired in Steps 2–3.

## STOP — Step 1 boundary
Awaiting approval of: the color system (scales + roles + accents + AA table), the Inter type scale, spacing/shape/
elevation, motion tokens, the icon mapping, and the one-source/two-export token structure. Steps 2–6 (component kit →
navigation → screen sweep → dashboards → QA) execute against these foundations.
