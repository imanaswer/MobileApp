import { adminCreateUser, adminFindUserId } from "@repo/auth";
import { ROLES, type RoleKey } from "@repo/constants";
import { createSchoolRepository, prisma, withTransaction } from "@repo/db";

import { adminClientFromEnv, log, parseFlags, requireEnv } from "./ops-context";

/**
 * Single-user Admin-API provisioning (M1 decision D3): create one pre-confirmed
 * auth user + INVITED `User` profile + audit row. The account activates on the
 * user's first sign-in (INVITED → ACTIVE). Idempotent per identifier.
 *
 * Usage (run after bootstrap):
 *   pnpm --filter @repo/business run provision -- --role PARENT --phone +919999900001
 *   pnpm --filter @repo/business run provision -- --role TEACHER --email t@school.example --password <pw>
 *   Optional: --locale en|ml
 */
async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const role = flags.get("role") as RoleKey | undefined;
  const email = flags.get("email")?.toLowerCase();
  const phone = flags.get("phone");
  const password = flags.get("password");
  const locale = flags.get("locale") === "ml" ? ("ML" as const) : ("EN" as const);

  if (!role || !ROLES.includes(role)) {
    throw new Error(`--role must be one of: ${ROLES.join(", ")}`);
  }
  if (!email && !phone) {
    throw new Error("Provide --email (staff) or --phone (parent, E.164 e.g. +91...)");
  }
  if (email && !password) {
    throw new Error("--password is required with --email (staff sign in with email+password)");
  }
  if (phone && !/^\+\d{8,15}$/.test(phone)) {
    throw new Error("--phone must be E.164, e.g. +919999900001");
  }

  const admin = adminClientFromEnv();
  const school = await createSchoolRepository(prisma).findFirst();
  if (!school) {
    throw new Error("No School row — run the bootstrap script first.");
  }
  // The acting admin (audit actor) is the seed super-admin.
  const actorId = await adminFindUserId(admin, {
    email: requireEnv("SEED_SUPER_ADMIN_EMAIL").toLowerCase(),
  });
  if (!actorId) {
    throw new Error("Seed super-admin not found in Supabase — run the bootstrap script first.");
  }

  let authUserId = await adminFindUserId(admin, {
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
  });
  if (authUserId) {
    log(`[provision] auth user exists: ${authUserId}`);
  } else {
    authUserId = await adminCreateUser(admin, {
      ...(email ? { email } : {}),
      ...(password ? { password } : {}),
      ...(phone ? { phone } : {}),
    });
    log(`[provision] auth user created: ${authUserId}`);
  }

  const profile = await withTransaction(async (repos) => {
    const existing = await repos.users.findById(authUserId);
    if (existing) {
      return existing;
    }
    const created = await repos.users.create({
      id: authUserId,
      schoolId: school.id,
      role,
      email: email ?? null,
      phone: phone ?? null,
      locale,
    });
    await repos.audit.record({
      schoolId: school.id,
      actorUserId: actorId,
      action: "USER_PROVISIONED",
      entityType: "User",
      entityId: authUserId,
      after: { role: created.role, status: created.status },
    });
    return created;
  });

  log(`[provision] profile: id=${profile.id} role=${profile.role} status=${profile.status}`);
}

main()
  .catch((error: unknown) => {
    console.error("[provision] failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
