import { adminCreateUser, adminFindUserId } from "@repo/auth";
import { createSchoolRepository, prisma, withTransaction } from "@repo/db";

import { adminClientFromEnv, log, requireEnv } from "./ops-context";

/**
 * Bootstrap a new school deployment (run once per environment, idempotent):
 *   1. Create the School row (single-tenant, ADR-008) if none exists.
 *   2. Create the super-admin Supabase auth user via the Admin API (ADR-001:
 *      pre-provisioned, no public signup).
 *   3. Create the SUPER_ADMIN `User` profile (INVITED — activated on first
 *      sign-in like every account) + `USER_PROVISIONED` audit row, atomically.
 *
 * Env: SEED_SCHOOL_NAME, SEED_SUPER_ADMIN_EMAIL, SEED_SUPER_ADMIN_PASSWORD
 * (+ Supabase/DB vars). Usage: pnpm --filter @repo/business run bootstrap
 */
async function main(): Promise<void> {
  const schoolName = requireEnv("SEED_SCHOOL_NAME");
  const email = requireEnv("SEED_SUPER_ADMIN_EMAIL").toLowerCase();
  const password = requireEnv("SEED_SUPER_ADMIN_PASSWORD");
  if (password.length < 10) {
    throw new Error(
      "SEED_SUPER_ADMIN_PASSWORD must be at least 10 characters (security review §4).",
    );
  }
  const admin = adminClientFromEnv();
  const schools = createSchoolRepository(prisma);

  const school = (await schools.findFirst()) ?? (await schools.create({ name: schoolName }));
  log(`[bootstrap] school: ${school.name} (${school.id})`);

  let authUserId = await adminFindUserId(admin, { email });
  if (authUserId) {
    log(`[bootstrap] auth user exists: ${authUserId}`);
  } else {
    authUserId = await adminCreateUser(admin, { email, password });
    log(`[bootstrap] auth user created: ${authUserId}`);
  }

  const profile = await withTransaction(async (repos) => {
    const existing = await repos.users.findById(authUserId);
    if (existing) {
      return existing;
    }
    const created = await repos.users.create({
      id: authUserId,
      schoolId: school.id,
      role: "SUPER_ADMIN",
      email,
    });
    await repos.audit.record({
      schoolId: school.id,
      actorUserId: authUserId, // bootstrap is self-provisioned; later invites use the acting admin
      action: "USER_PROVISIONED",
      entityType: "User",
      entityId: authUserId,
      after: { role: created.role, status: created.status },
    });
    return created;
  });

  log(`[bootstrap] profile: role=${profile.role} status=${profile.status}`);
  log(
    "[bootstrap] done — sign in with the seed email/password; first sign-in activates the account.",
  );
}

main()
  .catch((error: unknown) => {
    console.error("[bootstrap] failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
