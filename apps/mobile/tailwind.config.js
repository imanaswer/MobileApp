/**
 * NativeWind config. Semantic ROLE colors mirror the `--token` CSS variables in
 * global.css; the fixed brand/neutral/semantic SCALES + domain accents + type
 * scale mirror `packages/ui/src/tokens.ts` — the reference-of-truth (this JS
 * config can't import the TS token source; ADR-UX1 §6 — keep in sync).
 */

// --- mirror of packages/ui tokens (ADR-UX1 §1) ---
const palette = {
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
};
const domainAccent = {
  attendance: "#0D9488",
  exams: "#7C3AED",
  homework: "#EA580C",
  fees: "#16A34A",
  calendar: "#0891B2",
  messages: "#DB2777",
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        primary: {
          ...palette.primary,
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        navy: palette.navy,
        neutral: palette.neutral,
        success: { ...palette.success, DEFAULT: palette.success[600] },
        warning: { ...palette.warning, DEFAULT: palette.warning[600] },
        danger: palette.danger,
        info: { ...palette.info, DEFAULT: palette.info[600] },
        attendance: domainAccent.attendance,
        exams: domainAccent.exams,
        homework: domainAccent.homework,
        fees: domainAccent.fees,
        calendar: domainAccent.calendar,
        messages: domainAccent.messages,
        border: "hsl(var(--border))",
      },
      // Inter (loaded via @expo-google-fonts/inter in _layout). `font-sans` → Inter.
      fontFamily: { sans: ["Inter_400Regular"] },
      // `secondary` omitted — collides with the color; use `text-sm` (14/20).
      fontSize: {
        display: ["28px", "34px"],
        title: ["20px", "28px"],
        body: ["16px", "24px"],
        caption: ["12px", "16px"],
      },
      borderRadius: { xl: "16px", card: "12px" },
    },
  },
  plugins: [],
};
