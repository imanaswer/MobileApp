/**
 * Design tokens (UI_DESIGN_SYSTEM.md). The single source of truth consumed by
 * the Tailwind preset (web) and NativeWind (mobile). Colors are HSL channels so
 * web can wrap them as `hsl(var(--token))`. Brand hues are placeholders pending
 * §16.7 — only `primary` changes when branding lands.
 */
export const colorTokens = {
  background: "0 0% 100%",
  foreground: "222 47% 11%",
  card: "0 0% 100%",
  cardForeground: "222 47% 11%",
  primary: "221 83% 53%",
  primaryForeground: "0 0% 100%",
  secondary: "210 40% 96%",
  secondaryForeground: "222 47% 11%",
  muted: "210 40% 96%",
  mutedForeground: "215 16% 47%",
  accent: "210 40% 96%",
  accentForeground: "222 47% 11%",
  destructive: "0 84% 60%",
  destructiveForeground: "0 0% 100%",
  success: "142 71% 45%",
  warning: "38 92% 50%",
  info: "221 83% 53%",
  border: "214 32% 91%",
  input: "214 32% 91%",
  ring: "221 83% 53%",
} as const;

/** 4px base spacing scale. */
export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

/**
 * Full brand + neutral + semantic + domain-accent scales (ADR-UX1 §1). Fixed
 * values (dark mode is out of scope, so no runtime swap needed) — the Tailwind
 * layer (web preset + mobile config) consumes these; components reference named
 * steps (`bg-primary-600`, `text-neutral-800`), never raw hex. This object is the
 * reference-of-truth; the mobile JS config mirrors it (can't import TS — ADR §6).
 */
export const palette = {
  // Institutional blue — brand #2563EB is 600.
  primary: {
    50: "#EFF6FF",
    100: "#DBEAFE",
    200: "#BFDBFE",
    300: "#93C5FD",
    400: "#60A5FA",
    500: "#3B82F6",
    600: "#2563EB",
    700: "#1D4ED8",
    800: "#1E40AF",
    900: "#1E3A8A",
    950: "#172554",
  },
  // Deep navy — emphasis surfaces (sidebar, page headers).
  navy: {
    50: "#F2F6FB",
    100: "#E3ECF5",
    200: "#C4D6E8",
    300: "#93B2D1",
    400: "#5B84AE",
    500: "#37628F",
    600: "#294D75",
    700: "#1E3A5F",
    800: "#1B3251",
    900: "#182B45",
    950: "#0F1C2E",
  },
  // Warm gray (stone) — text/surfaces/borders. Never pure #000/#FFF.
  neutral: {
    50: "#FAFAF9",
    100: "#F5F5F4",
    200: "#E7E5E4",
    300: "#D6D3D1",
    400: "#A8A29E",
    500: "#78716C",
    600: "#57534E",
    700: "#44403C",
    800: "#292524",
    900: "#1C1917",
    950: "#0C0A09",
  },
  success: {
    50: "#F0FDF4",
    100: "#DCFCE7",
    200: "#BBF7D0",
    500: "#22C55E",
    600: "#16A34A",
    700: "#15803D",
  },
  warning: {
    50: "#FFFBEB",
    100: "#FEF3C7",
    200: "#FDE68A",
    500: "#F59E0B",
    600: "#D97706",
    700: "#B45309",
  },
  danger: {
    50: "#FEF2F2",
    100: "#FEE2E2",
    200: "#FECACA",
    500: "#EF4444",
    600: "#DC2626",
    700: "#B91C1C",
  },
  info: {
    50: "#EFF6FF",
    100: "#DBEAFE",
    200: "#BFDBFE",
    500: "#3B82F6",
    600: "#2563EB",
    700: "#1D4ED8",
  },
} as const;

/** Domain accents (subtle — card left-border + icon tint so modules are scannable). */
export const domainAccent = {
  attendance: "#0D9488",
  exams: "#7C3AED",
  homework: "#EA580C",
  fees: "#16A34A",
  calendar: "#0891B2",
  messages: "#DB2777",
} as const;

/** Fixed type scale (ADR-UX1 §2) — size/lineHeight in px, weight numeric. */
export const typography = {
  display: { size: 28, lineHeight: 34, weight: 600 },
  title: { size: 20, lineHeight: 28, weight: 600 },
  body: { size: 16, lineHeight: 24, weight: 400 },
  secondary: { size: 14, lineHeight: 20, weight: 400 },
  caption: { size: 12, lineHeight: 16, weight: 500 },
} as const;

/** Inter with a system fallback (ADR-UX1 §2). ml = future i18n fallback chain. */
export const fontFamily = {
  sans: 'Inter, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  ml: 'Inter, "Noto Sans Malayalam", sans-serif',
} as const;

/** Motion durations in ms (ADR-UX1 §4) — fast, subtle; low-end Android. */
export const motion = { fast: 150, base: 200, panel: 250 } as const;

/** Border radius scale (px). `xl` (16) = modals/sheets (ADR-UX1 §3). */
export const radius = { sm: 4, md: 8, lg: 12, xl: 16, full: 9999 } as const;

/** Typography scale (px). */
export const fontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  "2xl": 24,
  "3xl": 30,
  "4xl": 36,
} as const;

export const tokens = {
  color: colorTokens,
  palette,
  domainAccent,
  spacing,
  radius,
  fontSize,
  typography,
  fontFamily,
  motion,
} as const;

export type Tokens = typeof tokens;
