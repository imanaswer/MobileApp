import {
  adminDeleteUser,
  createHeadlessClient,
  getAuthUser,
  getSession,
  refreshSession,
  restoreSession,
  signInWithOtp,
  signInWithPassword,
  signOut,
  verifyOtp,
} from "@repo/auth";
import { pingDatabase, prisma } from "@repo/db";

import { activateUser, createServiceContext, resolvePrincipal } from "../src/index";

import { adminClientFromEnv, log, requireEnv } from "./ops-context";

/**
 * Live authentication verification — the evidence run for the infrastructure
 * milestone. Executes the real flows against the configured Supabase project
 * and prints PASS/FAIL per check (exit 1 if any fail). Prerequisites: migrations
 * applied, bootstrap + parent provisioning run, dashboard configured per
 * docs/RUNBOOK_SUPABASE_SETUP.md (signups disabled, phone + test OTP set).
 */

interface CheckResult {
  name: string;
  pass: boolean;
  detail: string;
}
const results: CheckResult[] = [];

async function check(name: string, fn: () => Promise<string>): Promise<void> {
  try {
    results.push({ name, pass: true, detail: await fn() });
  } catch (error) {
    results.push({
      name,
      pass: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

async function main(): Promise<void> {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const adminEmail = requireEnv("SEED_SUPER_ADMIN_EMAIL").toLowerCase();
  const adminPassword = requireEnv("SEED_SUPER_ADMIN_PASSWORD");
  const testPhone = requireEnv("TEST_OTP_PHONE");
  const testOtp = requireEnv("TEST_OTP_CODE");

  await check("database-connectivity", async () => {
    if (!(await pingDatabase())) {
      throw new Error("pingDatabase returned false");
    }
    return "Prisma connected to the Supabase Postgres pooler";
  });

  await check("public-signup-disabled", async () => {
    // Authoritative: the live GoTrue settings must say signups are off …
    const settingsResponse = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: anonKey },
    });
    const settings = (await settingsResponse.json()) as { disable_signup?: boolean };
    // … and a behavioral probe must be rejected (raw fetch — the app has no signup path).
    const response = await fetch(`${url}/auth/v1/signup`, {
      method: "POST",
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `signup.probe.${Date.now()}@gmail.com`,
        password: "Probe-123456!x",
      }),
    });
    if (response.ok) {
      // Don't leave the stray probe account behind.
      const created = (await response.json()) as { user?: { id?: string }; id?: string };
      const strayId = created.user?.id ?? created.id;
      if (strayId) {
        await adminDeleteUser(adminClientFromEnv(), strayId);
      }
      throw new Error(
        "signup succeeded — 'Allow new users to sign up' is still ON (probe user deleted)",
      );
    }
    if (settings.disable_signup !== true) {
      throw new Error(
        "signup probe rejected, but settings report disable_signup=false — turn signups OFF",
      );
    }
    const body = (await response.json()) as { error_code?: string; msg?: string };
    return `settings.disable_signup=true; probe rejected (${response.status} ${body.error_code ?? body.msg ?? ""})`.trim();
  });

  await check("otp-rejects-unknown-phone", async () => {
    const probe = createHeadlessClient(url, anonKey);
    try {
      await signInWithOtp(probe, { phone: "+911111111111" });
      throw new Error("OTP request for an unprovisioned phone was accepted");
    } catch (error) {
      if (error instanceof Error && error.message.includes("was accepted")) {
        throw error;
      }
      return `rejected as expected (${error instanceof Error ? error.message : String(error)})`;
    }
  });

  // ---- staff email+password flow (seed super-admin) ----
  const staff = createHeadlessClient(url, anonKey);
  let staffUserId = "";
  await check("email-login", async () => {
    await signInWithPassword(staff, { email: adminEmail, password: adminPassword });
    const identity = await getAuthUser(staff);
    if (!identity) {
      throw new Error("no verified identity after sign-in");
    }
    staffUserId = identity.userId;
    return `signed in as ${adminEmail} (uid ${staffUserId})`;
  });

  await check("super-admin-bootstrap", async () => {
    const principal = await resolvePrincipal(staffUserId);
    if (!principal) {
      throw new Error("no User profile for the seed super-admin — run bootstrap");
    }
    if (principal.role !== "SUPER_ADMIN") {
      throw new Error(`expected SUPER_ADMIN, got ${principal.role}`);
    }
    return `Principal: role=${principal.role} status=${principal.status} school=${principal.schoolId}`;
  });

  await check("activation-flow", async () => {
    const before = await resolvePrincipal(staffUserId);
    if (!before) {
      throw new Error("principal missing");
    }
    const activated = await activateUser(createServiceContext(before));
    if (activated.status !== "ACTIVE") {
      throw new Error(`expected ACTIVE after activation, got ${activated.status}`);
    }
    const again = await activateUser(createServiceContext(activated));
    return `status ${before.status} → ACTIVE (idempotent re-run: ${again.status})`;
  });

  await check("session-restoration", async () => {
    const session = await getSession(staff);
    if (!session) {
      throw new Error("no session to restore");
    }
    const fresh = createHeadlessClient(url, anonKey);
    await restoreSession(fresh, {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
    });
    const identity = await getAuthUser(fresh);
    if (identity?.userId !== staffUserId) {
      throw new Error("restored session resolves to a different identity");
    }
    return "stored tokens adopted by a fresh client; identity verified server-side";
  });

  await check("token-refresh", async () => {
    const before = await getSession(staff);
    await refreshSession(staff);
    const after = await getSession(staff);
    if (!after) {
      throw new Error("no session after refresh");
    }
    return before?.access_token === after.access_token
      ? "session valid after refresh (token unchanged)"
      : "access token rotated";
  });

  await check("logout", async () => {
    await signOut(staff);
    const session = await getSession(staff);
    if (session) {
      throw new Error("session survived signOut");
    }
    return "session cleared";
  });

  // ---- parent phone-OTP flow (test OTP number) ----
  const parent = createHeadlessClient(url, anonKey);
  let parentUserId = "";
  await check("otp-login", async () => {
    await signInWithOtp(parent, { phone: testPhone });
    await verifyOtp(parent, { phone: testPhone, token: testOtp });
    const identity = await getAuthUser(parent);
    if (!identity) {
      throw new Error("no verified identity after OTP verification");
    }
    parentUserId = identity.userId;
    return `OTP verified for ${testPhone} (uid ${parentUserId})`;
  });

  await check("parent-provisioning", async () => {
    const principal = await resolvePrincipal(parentUserId);
    if (!principal) {
      throw new Error("no User profile for the test parent — run the provision script");
    }
    if (principal.role !== "PARENT") {
      throw new Error(`expected PARENT, got ${principal.role}`);
    }
    const activated = await activateUser(createServiceContext(principal));
    return `Principal role=PARENT; activation status=${activated.status}`;
  });

  const failed = results.filter((result) => !result.pass);
  log("");
  log("=== verify-auth results ===");
  for (const result of results) {
    log(`${result.pass ? "PASS" : "FAIL"}  ${result.name} — ${result.detail}`);
  }
  log(`=== ${results.length - failed.length}/${results.length} checks passed ===`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error: unknown) => {
    console.error("[verify-auth] failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
