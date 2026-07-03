import type { LocaleCode } from "@repo/constants";
import type { User } from "@repo/db";
import type { UserProfile } from "@repo/types";

import type { Principal } from "../authorization";

// UI locales are lowercase (BCP47); the DB `Locale` enum is uppercase.
const TO_APP_LOCALE: Record<"EN" | "ML", LocaleCode> = { EN: "en", ML: "ml" };
export const TO_DB_LOCALE: Record<LocaleCode, "EN" | "ML"> = { en: "EN", ml: "ML" };

/**
 * Map a DB `User` row to the authoritative authorization `Principal`. Role,
 * schoolId, and status come ONLY from the database row (never a JWT/client claim
 * — ADR-002). Prisma's enums are structurally identical to the constants unions.
 */
export function mapUserToPrincipal(user: User): Principal {
  return {
    userId: user.id,
    schoolId: user.schoolId,
    role: user.role,
    status: user.status,
  };
}

/** Map a DB `User` row to the public profile DTO returned by the API. */
export function mapUserToProfile(user: User): UserProfile {
  return {
    userId: user.id,
    role: user.role,
    status: user.status,
    locale: TO_APP_LOCALE[user.locale],
    email: user.email,
    phone: user.phone,
  };
}
