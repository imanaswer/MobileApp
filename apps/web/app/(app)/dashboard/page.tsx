"use client";

import { signOut } from "@repo/auth";
import { PERMISSIONS } from "@repo/constants";
import { can } from "@repo/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import {
  AdminDashboard,
  ParentDashboard,
  TeacherDashboard,
} from "@/src/components/analytics/dashboards";
import { NotificationBell } from "@/src/components/notification/ui";
import { getSupabaseClient } from "@/src/lib/supabase/client";
import { trpc } from "@/src/trpc/react";

/**
 * Role-aware analytics dashboard (M14, ADR-022). Resolves the DB profile (`auth.me`),
 * activates a first-time INVITED account, then renders live KPIs + charts for the role
 * (admin / teacher / parent) over frozen data — read-only, computed on demand. Quick
 * links to the feature areas follow. No new API; charts are Recharts (ADR-022 §7).
 */
export default function DashboardPage() {
  const router = useRouter();
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

  async function handleLogout() {
    await signOut(getSupabaseClient());
    router.replace("/login");
    router.refresh();
  }

  if (me.isError) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
        <p className="text-center text-destructive">
          Your account isn’t set up yet. Please contact the school office.
        </p>
      </main>
    );
  }

  if (me.isLoading || me.data?.status !== "ACTIVE" || register.isPending) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p className="text-muted-foreground">Loading…</p>
      </main>
    );
  }

  const role = me.data.role;
  const isAdmin = role === "SUPER_ADMIN" || role === "OFFICE_ADMIN";

  const links: { href: string; label: string; show: boolean }[] = [
    {
      href: "/academic/years",
      label: "Academic structure",
      show: can(role, PERMISSIONS.ACADEMIC_READ),
    },
    { href: "/people/students", label: "People", show: can(role, PERMISSIONS.STUDENT_READ) },
    { href: "/attendance/mark", label: "Attendance", show: can(role, PERMISSIONS.ATTENDANCE_READ) },
    { href: "/exams", label: "Examinations", show: can(role, PERMISSIONS.EXAM_MANAGE) },
    { href: "/homework", label: "Homework", show: can(role, PERMISSIONS.HOMEWORK_READ) },
    { href: "/timetable", label: "Timetable", show: can(role, PERMISSIONS.TIMETABLE_MANAGE) },
    {
      href: "/announcements",
      label: "Announcements",
      show: can(role, PERMISSIONS.ANNOUNCEMENT_READ),
    },
    { href: "/calendar", label: "School calendar", show: can(role, PERMISSIONS.CALENDAR_READ) },
    {
      href: "/behaviour",
      label: "Behaviour & discipline",
      show: can(role, PERMISSIONS.BEHAVIOUR_MANAGE),
    },
    { href: "/fees", label: "Fees & payments", show: can(role, PERMISSIONS.FEE_MANAGE) },
    {
      href: "/documents",
      label: "Documents & certificates",
      show: can(role, PERMISSIONS.DOCUMENT_READ),
    },
  ];

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold text-foreground">School Portal</h1>
          <p className="text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{role}</span>
          </p>
        </div>
        <NotificationBell />
      </div>

      {isAdmin ? (
        <AdminDashboard />
      ) : role === "TEACHER" ? (
        <TeacherDashboard />
      ) : role === "PARENT" ? (
        <ParentDashboard />
      ) : null}

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-medium text-muted-foreground">Quick links</h2>
        <div className="flex flex-wrap gap-2">
          {links
            .filter((l) => l.show)
            .map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="min-h-11 rounded-md border border-border px-4 py-2 font-medium text-foreground hover:bg-background"
              >
                {l.label}
              </Link>
            ))}
        </div>
      </section>

      <button
        type="button"
        onClick={() => void handleLogout()}
        className="min-h-11 self-start rounded-md border border-border px-4 py-2 font-medium text-foreground"
      >
        Log out
      </button>
    </main>
  );
}
