import type { Config } from "tailwindcss";

import { domainAccent, motion, palette, typography } from "./tokens";

/**
 * Shared Tailwind preset (ADR-UX1 §6). Semantic ROLES stay CSS variables (the
 * dark-mode seam, declared in globals.css); fixed brand/neutral/semantic SCALES
 * + domain accents + the type scale + motion come from `@repo/ui` tokens (the
 * single source). Web extends this preset; the mobile NativeWind JS config mirrors
 * the same token values (can't import TS). `bg-primary` = themeable role;
 * `bg-primary-600` = fixed scale step.
 */
export const uiPreset = {
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        // Role (CSS var) + full scale (fixed) coexist on the same name.
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
        success: { ...palette.success, DEFAULT: "hsl(var(--success))" },
        warning: { ...palette.warning, DEFAULT: "hsl(var(--warning))" },
        danger: palette.danger,
        info: { ...palette.info, DEFAULT: "hsl(var(--info))" },
        // Domain accents (card left-border + icon tint).
        attendance: domainAccent.attendance,
        exams: domainAccent.exams,
        homework: domainAccent.homework,
        fees: domainAccent.fees,
        calendar: domainAccent.calendar,
        messages: domainAccent.messages,
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
      },
      // Web loads Inter via next/font as `--font-sans`; mobile applies
      // `fontFamily.sans` through expo-font (Step 2/3). Fallbacks match tokens.
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "-apple-system",
          '"Segoe UI"',
          "Roboto",
          '"Helvetica Neue"',
          "Arial",
          "sans-serif",
        ],
      },
      // `secondary` (14/20) is omitted — it collides with the `secondary` color
      // and equals Tailwind's default `text-sm`; use `text-sm` for that role.
      fontSize: {
        display: [`${typography.display.size}px`, `${typography.display.lineHeight}px`],
        title: [`${typography.title.size}px`, `${typography.title.lineHeight}px`],
        body: [`${typography.body.size}px`, `${typography.body.lineHeight}px`],
        caption: [`${typography.caption.size}px`, `${typography.caption.lineHeight}px`],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "16px",
        card: "12px",
      },
      transitionDuration: {
        fast: `${motion.fast}ms`,
        base: `${motion.base}ms`,
        panel: `${motion.panel}ms`,
      },
    },
  },
} satisfies Partial<Config>;

export default uiPreset;
