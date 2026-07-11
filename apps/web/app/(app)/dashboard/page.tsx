"use client";

import { signOut } from "@repo/auth";
import { PERMISSIONS } from "@repo/constants";
import { can } from "@repo/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { NotificationBell } from "@/src/components/notification/ui";
import { getSupabaseClient } from "@/src/lib/supabase/client";
import { trpc } from "@/src/trpc/react";

/**
 * Dashboard placeholder. Resolves the DB profile (`auth.me`), activates a
 * first-time INVITED account (`auth.registerProfile`), shows the role, and logs
 * out. No CRUD — feature screens arrive in later milestones.
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

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold text-foreground">School Portal</h1>
          <p className="text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{me.data.role}</span>. Your
            dashboard appears here once features are enabled.
          </p>
        </div>
        <NotificationBell />
      </div>
      {can(me.data.role, PERMISSIONS.ACADEMIC_READ) ? (
        <Link
          href="/academic/years"
          className="min-h-11 self-start rounded-md border border-border px-4 py-2 font-medium text-foreground"
        >
          Academic structure
        </Link>
      ) : null}
      {can(me.data.role, PERMISSIONS.STUDENT_READ) ? (
        <Link
          href="/people/students"
          className="min-h-11 self-start rounded-md border border-border px-4 py-2 font-medium text-foreground"
        >
          People
        </Link>
      ) : null}
      {can(me.data.role, PERMISSIONS.ATTENDANCE_READ) ? (
        <Link
          href="/attendance/mark"
          className="min-h-11 self-start rounded-md border border-border px-4 py-2 font-medium text-foreground"
        >
          Attendance
        </Link>
      ) : null}
      {can(me.data.role, PERMISSIONS.EXAM_MANAGE) ? (
        <Link
          href="/exams"
          className="min-h-11 self-start rounded-md border border-border px-4 py-2 font-medium text-foreground"
        >
          Examinations
        </Link>
      ) : null}
      {can(me.data.role, PERMISSIONS.HOMEWORK_READ) ? (
        <Link
          href="/homework"
          className="min-h-11 self-start rounded-md border border-border px-4 py-2 font-medium text-foreground"
        >
          Homework
        </Link>
      ) : null}
      {can(me.data.role, PERMISSIONS.TIMETABLE_MANAGE) ? (
        <Link
          href="/timetable"
          className="min-h-11 self-start rounded-md border border-border px-4 py-2 font-medium text-foreground"
        >
          Timetable
        </Link>
      ) : null}
      {can(me.data.role, PERMISSIONS.ANNOUNCEMENT_READ) ? (
        <Link
          href="/announcements"
          className="min-h-11 self-start rounded-md border border-border px-4 py-2 font-medium text-foreground"
        >
          Announcements
        </Link>
      ) : null}
      {can(me.data.role, PERMISSIONS.CALENDAR_READ) ? (
        <Link
          href="/calendar"
          className="min-h-11 self-start rounded-md border border-border px-4 py-2 font-medium text-foreground"
        >
          School calendar
        </Link>
      ) : null}
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
