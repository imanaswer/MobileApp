"use client";

import type { ReactNode } from "react";

import { ToastProvider } from "../ui";

import { Sidebar } from "./sidebar";

import { NotificationBell } from "@/src/components/notification/ui";
import { trpc } from "@/src/trpc/react";

/**
 * App shell (ADR-UX1 §3) — fixed sidebar + top bar around every protected page.
 * Resolves the role via `auth.me` (same query the dashboard uses; tRPC dedupes)
 * to build the gated nav. Mounts the ToastProvider so any mutation can toast.
 * Presentation only — route protection stays in the server `(app)` layout.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const me = trpc.auth.me.useQuery();
  const role = me.data?.role;

  return (
    <ToastProvider>
      <div className="flex min-h-dvh bg-neutral-50">
        {role ? <Sidebar role={role} /> : <div className="w-16 shrink-0 bg-navy-900 xl:w-60" />}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 items-center justify-between border-b border-neutral-200 bg-white px-6">
            <Breadcrumb />
            <NotificationBell />
          </header>
          {/* Bare content slot — pages keep their own <main>/padding until Step 4
              migrates them onto PageHeader. Avoids double-wrapping existing screens. */}
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </div>
    </ToastProvider>
  );
}

function Breadcrumb() {
  return <span className="text-sm text-neutral-500">School Portal</span>;
}
