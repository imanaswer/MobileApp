import { ThemeProvider } from "@repo/ui";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";

import { LocaleGate } from "@/src/i18n/locale-gate";
import { TRPCProvider } from "@/src/trpc/react";

import "./globals.css";

// Inter is the one typeface (ADR-UX1 §2). Exposed as `--font-sans`, which the
// Tailwind `font-sans` family resolves to; `swap` avoids invisible text (FOIT).
const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "School Portal",
  description: "School Management Portal",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">
        <TRPCProvider>
          <ThemeProvider>
            <LocaleGate>{children}</LocaleGate>
          </ThemeProvider>
        </TRPCProvider>
      </body>
    </html>
  );
}
