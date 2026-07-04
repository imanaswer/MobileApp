import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { adminCreateUser, adminDeleteUser, adminFindUserId } from "./admin";

interface FakeAuthUser {
  id: string;
  email?: string;
  phone?: string;
}

function fakeAdmin(overrides: Record<string, ReturnType<typeof vi.fn>>): SupabaseClient {
  return { auth: { admin: overrides } } as unknown as SupabaseClient;
}

describe("adminCreateUser", () => {
  it("creates a pre-confirmed email+password user (staff) and returns the UID", async () => {
    const createUser = vi.fn(async (): Promise<{ data: { user: FakeAuthUser }; error: null }> => ({
      data: { user: { id: "uid-1" } },
      error: null,
    }));
    const uid = await adminCreateUser(fakeAdmin({ createUser }), {
      email: "staff@school.example",
      password: "long-password-123",
    });
    expect(uid).toBe("uid-1");
    expect(createUser).toHaveBeenCalledWith({
      email: "staff@school.example",
      email_confirm: true,
      password: "long-password-123",
    });
  });

  it("creates a pre-confirmed phone user (parent) — no password", async () => {
    const createUser = vi.fn(async (): Promise<{ data: { user: FakeAuthUser }; error: null }> => ({
      data: { user: { id: "uid-2" } },
      error: null,
    }));
    await adminCreateUser(fakeAdmin({ createUser }), { phone: "+919999900001" });
    expect(createUser).toHaveBeenCalledWith({ phone: "+919999900001", phone_confirm: true });
  });

  it("throws the Supabase error on failure (e.g. duplicate identifier)", async () => {
    const error = { message: "User already registered" };
    const createUser = vi.fn(async () => ({ data: { user: null }, error }));
    await expect(
      adminCreateUser(fakeAdmin({ createUser }), { email: "dup@school.example" }),
    ).rejects.toEqual(error);
  });
});

describe("adminFindUserId", () => {
  const pageOf = (users: FakeAuthUser[]): { data: { users: FakeAuthUser[] }; error: null } => ({
    data: { users },
    error: null,
  });

  it("finds a user by email (case-insensitive)", async () => {
    const listUsers = vi.fn(async () => pageOf([{ id: "uid-1", email: "Staff@School.example" }]));
    const found = await adminFindUserId(fakeAdmin({ listUsers }), {
      email: "staff@school.example",
    });
    expect(found).toBe("uid-1");
  });

  it("finds a user by phone, tolerating the stripped leading + (Supabase format)", async () => {
    const listUsers = vi.fn(async () => pageOf([{ id: "uid-2", phone: "919999900001" }]));
    const found = await adminFindUserId(fakeAdmin({ listUsers }), { phone: "+919999900001" });
    expect(found).toBe("uid-2");
  });

  it("returns null when no user matches (end of listing)", async () => {
    const listUsers = vi.fn(async () => pageOf([{ id: "uid-3", email: "other@school.example" }]));
    expect(await adminFindUserId(fakeAdmin({ listUsers }), { email: "ghost@x.y" })).toBeNull();
  });

  it("pages through full pages until a match or the listing ends", async () => {
    const fullPage = Array.from({ length: 200 }, (_, i) => ({ id: `u-${i}`, email: `u${i}@x.y` }));
    const listUsers = vi
      .fn()
      .mockResolvedValueOnce(pageOf(fullPage))
      .mockResolvedValueOnce(pageOf([{ id: "uid-target", email: "target@x.y" }]));
    const found = await adminFindUserId(fakeAdmin({ listUsers }), { email: "target@x.y" });
    expect(found).toBe("uid-target");
    expect(listUsers).toHaveBeenCalledTimes(2);
    expect(listUsers).toHaveBeenLastCalledWith({ page: 2, perPage: 200 });
  });
});

describe("adminDeleteUser", () => {
  it("deletes by id and throws on failure", async () => {
    const deleteUser = vi.fn(async (): Promise<{ error: null }> => ({ error: null }));
    await adminDeleteUser(fakeAdmin({ deleteUser }), "uid-1");
    expect(deleteUser).toHaveBeenCalledWith("uid-1");

    const error = { message: "not found" };
    const failing = vi.fn(async () => ({ error }));
    await expect(adminDeleteUser(fakeAdmin({ deleteUser: failing }), "ghost")).rejects.toEqual(
      error,
    );
  });
});
