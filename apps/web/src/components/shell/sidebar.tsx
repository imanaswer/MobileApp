"use client";

import { signOut } from "@repo/auth";
import type { RoleKey } from "@repo/constants";
import { cn } from "@repo/ui";
import { LogOut, School } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { getSupabaseClient } from "@/src/lib/supabase/client";

import { Avatar } from "../ui";

import { visibleNavGroups } from "./nav-config";


const ROLE_LABEL: Record<RoleKey, string> = {
  SUPER_ADMIN: "Super Admin",
  OFFICE_ADMIN: "Office Admin",
  TEACHER: "Teacher",
  PARENT: "Parent",
  ACCOUNTANT: "Accountant",
};

/**
 * Fixed left sidebar (ADR-UX1 §3). Navy surface; grouped module links with the
 * canonical icons + active indicator; the signed-in user + sign-out at the
 * bottom. Collapses to icons below xl (1280px). Gating is unchanged
 * (`visibleNavGroups` reuses the same `can(role, …)` checks).
 */
export function Sidebar({ role }: { role: RoleKey }) {
  const pathname = usePathname();
  const router = useRouter();
  const groups = visibleNavGroups(role);
  // `auth.me` returns only the DB Principal (role/schoolId/status) — no display
  // name. Showing the role here; a real name needs a `name` on auth.me (future).
  const label = ROLE_LABEL[role];

  async function logout() {
    await signOut(getSupabaseClient());
    router.replace("/login");
    router.refresh();
  }

  return (
    <aside className="sticky top-0 flex h-dvh w-16 shrink-0 flex-col border-r border-navy-800 bg-navy-900 text-navy-100 xl:w-60">
      <div className="flex h-16 items-center gap-2 border-b border-navy-800 px-4">
        <School aria-hidden strokeWidth={1.75} className="size-6 shrink-0 text-white" />
        <span className="hidden truncate font-semibold text-white xl:block">Sri Gujarathi</span>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        {groups.map((group, gi) => (
          <div key={group.label || gi} className="mb-2 px-2">
            {group.label && (
              <p className="hidden px-2 py-1 text-caption font-semibold uppercase tracking-wide text-navy-300 xl:block">
                {group.label}
              </p>
            )}
            {group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium transition-colors duration-fast",
                    active ? "bg-primary-600 text-white" : "text-navy-100 hover:bg-navy-800",
                  )}
                >
                  <Icon aria-hidden strokeWidth={1.75} className="size-5 shrink-0" />
                  <span className="hidden truncate xl:block">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-navy-800 p-2">
        <div className="flex items-center gap-2 px-1 py-2">
          <Avatar name={label} size="sm" />
          <div className="hidden min-w-0 flex-1 xl:block">
            <p className="truncate text-sm font-medium text-white">{label}</p>
            <p className="truncate text-caption text-navy-300">Signed in</p>
          </div>
          <button
            type="button"
            aria-label="Sign out"
            title="Sign out"
            onClick={() => void logout()}
            className="cursor-pointer rounded-md p-2 text-navy-300 hover:bg-navy-800 hover:text-white"
          >
            <LogOut aria-hidden strokeWidth={1.75} className="size-5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
