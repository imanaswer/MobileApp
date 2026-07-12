"use client";

import type { RoleKey } from "@repo/constants";
import Link from "next/link";
import { useEffect } from "react";

import {
  AdminDashboard,
  ParentDashboard,
  TeacherDashboard,
} from "@/src/components/analytics/dashboards";
import { visibleNavGroups } from "@/src/components/shell/nav-config";
import { Card, EmptyState, StatusChip } from "@/src/components/ui";
import { trpc } from "@/src/trpc/react";

/**
 * Role-aware home dashboard (M14 / ADR-022, restyled ADR-UX1 §5). Resolves the DB
 * profile (`auth.me`), activates a first-time INVITED account, then renders the
 * role's live KPIs/charts + a greeting and module cards. Presentation-only — the
 * nav gating reuses `visibleNavGroups` (same `can()` checks); no new API. The
 * persistent shell now owns nav / notification bell / sign-out (removed here).
 */
const ROLE_LABEL: Record<RoleKey, string> = {
  SUPER_ADMIN: "Super Admin",
  OFFICE_ADMIN: "Office Admin",
  TEACHER: "Teacher",
  PARENT: "Parent",
  ACCOUNTANT: "Accountant",
};

// Domain accents for the module cards (the 6 accented domains; others plain).
const ACCENT: Record<
  string,
  "attendance" | "exams" | "homework" | "fees" | "calendar" | "messages"
> = {
  "/attendance/mark": "attendance",
  "/exams": "exams",
  "/homework": "homework",
  "/fees": "fees",
  "/calendar": "calendar",
  "/announcements": "messages",
};

function greeting(): string {
  const hour = Number(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: false }),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const me = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();
  const register = trpc.auth.registerProfile.useMutation({
    onSuccess: () => {
      void utils.auth.me.invalidate();
    },
  });

  useEffect(() => {
    if (me.data?.status === "INVITED" && register.isIdle) {
      register.mutate();
    }
  }, [me.data?.status, register]);

  if (me.isError) {
    return (
      <main className="mx-auto max-w-[1200px] p-6">
        <EmptyState
          title="Your account isn’t set up yet"
          message="Please contact the school office to finish activating your account."
        />
      </main>
    );
  }

  if (me.isLoading || me.data?.status !== "ACTIVE" || register.isPending) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-[1200px] items-center justify-center p-6">
        <p className="text-sm text-neutral-500">Loading…</p>
      </main>
    );
  }

  const role = me.data.role;
  const isAdmin = role === "SUPER_ADMIN" || role === "OFFICE_ADMIN";
  const modules = visibleNavGroups(role)
    .flatMap((g) => g.items)
    .filter((i) => i.href !== "/dashboard");

  return (
    <main className="mx-auto flex max-w-[1200px] flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-display font-semibold text-neutral-900">{greeting()}</h1>
        <StatusChip tone="info" label={ROLE_LABEL[role]} />
      </div>

      {isAdmin ? (
        <AdminDashboard />
      ) : role === "TEACHER" ? (
        <TeacherDashboard />
      ) : role === "PARENT" ? (
        <ParentDashboard />
      ) : null}

      {modules.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-caption font-semibold uppercase tracking-wide text-neutral-500">
            Modules
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {modules.map((m) => {
              const Icon = m.icon;
              return (
                <Link key={m.href} href={m.href}>
                  <Card
                    interactive
                    accent={ACCENT[m.href]}
                    className="flex h-full items-center gap-3 p-4"
                  >
                    <Icon aria-hidden strokeWidth={1.75} className="size-5 shrink-0 text-neutral-500" />
                    <span className="text-sm font-medium text-neutral-800">{m.label}</span>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
