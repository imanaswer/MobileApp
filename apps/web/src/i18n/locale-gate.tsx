"use client";

import { LocaleProvider } from "@repo/i18n";
import type { ReactNode } from "react";

import { trpc } from "@/src/trpc/react";

/**
 * Wire LocaleProvider to the signed-in user's locale (M8, F8). Reads `auth.me`
 * (client-side, inside the tRPC provider) and falls back to "en" until loaded or
 * when signed out. Catalog translation is a later milestone — this only wires the seam.
 */
export function LocaleGate({ children }: { children: ReactNode }) {
  const me = trpc.auth.me.useQuery();
  return <LocaleProvider locale={me.data?.locale ?? "en"}>{children}</LocaleProvider>;
}
