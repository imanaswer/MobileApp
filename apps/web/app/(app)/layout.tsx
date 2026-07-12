import { getAuthUser } from "@repo/auth";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/src/components/shell/app-shell";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

/**
 * Protected group — requires a verified session (cookie); otherwise → /login.
 * Route protection is unchanged; the persistent shell (sidebar + top bar) is
 * added around every protected page (ADR-UX1 §3).
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const user = await getAuthUser(supabase);
  if (!user) {
    redirect("/login");
  }
  return <AppShell>{children}</AppShell>;
}
