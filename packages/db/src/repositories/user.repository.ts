import type { User } from "@prisma/client";

import type { DbClient } from "../db-client";

export type { User };

/** Fields needed to provision a new (INVITED) account. `id` is the Supabase auth UID. */
export interface CreateUserInput {
  id: string;
  schoolId: string;
  role: User["role"];
  email?: string | null;
  phone?: string | null;
  locale?: User["locale"];
}

/**
 * Data-access boundary for `User` (ADR-003). Pure persistence — NO authorization
 * logic (that lives in the business layer). Returns Prisma rows for the business
 * layer to map. Works inside or outside a transaction via {@link DbClient}.
 */
export interface UserRepository {
  findById(id: string): Promise<User | null>;
  create(input: CreateUserInput): Promise<User>;
  /** INVITED/… → ACTIVE and stamp lastLoginAt in one write (activation). */
  activate(id: string): Promise<User>;
  /** Update lastLoginAt for an already-active sign-in. */
  touchLastLogin(id: string): Promise<User>;
  setRole(id: string, role: User["role"]): Promise<User>;
  setStatus(id: string, status: User["status"]): Promise<User>;
  updateLocale(id: string, locale: User["locale"]): Promise<User>;
  /** All users in a school, optionally narrowed by role(s)/status — announcement fan-out (M10). */
  listBySchool(
    schoolId: string,
    filter?: { roles?: User["role"][]; status?: User["status"] },
  ): Promise<User[]>;
}

export function createUserRepository(client: DbClient): UserRepository {
  return {
    findById: (id) => client.user.findUnique({ where: { id } }),
    create: (input) => client.user.create({ data: input }),
    activate: (id) =>
      client.user.update({ where: { id }, data: { status: "ACTIVE", lastLoginAt: new Date() } }),
    touchLastLogin: (id) =>
      client.user.update({ where: { id }, data: { lastLoginAt: new Date() } }),
    setRole: (id, role) => client.user.update({ where: { id }, data: { role } }),
    setStatus: (id, status) => client.user.update({ where: { id }, data: { status } }),
    updateLocale: (id, locale) => client.user.update({ where: { id }, data: { locale } }),
    listBySchool: (schoolId, filter) =>
      client.user.findMany({
        where: {
          schoolId,
          ...(filter?.roles ? { role: { in: filter.roles } } : {}),
          ...(filter?.status ? { status: filter.status } : {}),
        },
      }),
  };
}
