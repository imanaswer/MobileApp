import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { getAuthUser } from "./context";

interface GetUserResult {
  data: { user: { id: string; email?: string; phone?: string } | null };
  error: { message: string } | null;
}

/** A fake Supabase client exposing only `auth.getUser`, plus the spy itself. */
function fakeSupabase(result: GetUserResult): {
  supabase: SupabaseClient;
  getUser: ReturnType<typeof vi.fn>;
} {
  const getUser = vi.fn(async (): Promise<GetUserResult> => result);
  return { supabase: { auth: { getUser } } as unknown as SupabaseClient, getUser };
}

const verified: GetUserResult = {
  data: { user: { id: "u-1", email: "a@b.c", phone: "911234567890" } },
  error: null,
};

describe("getAuthUser — identity verification seam", () => {
  it("web cookie path: verifies via getUser() with no token argument", async () => {
    const { supabase, getUser } = fakeSupabase(verified);
    const user = await getAuthUser(supabase);
    expect(getUser).toHaveBeenCalledWith();
    expect(user).toEqual({ userId: "u-1", email: "a@b.c", phone: "911234567890" });
  });

  it("mobile bearer path: passes the access token to getUser(token)", async () => {
    const { supabase, getUser } = fakeSupabase(verified);
    await getAuthUser(supabase, "jwt-token");
    expect(getUser).toHaveBeenCalledWith("jwt-token");
  });

  it("returns null when verification fails (expired/invalid token)", async () => {
    const { supabase } = fakeSupabase({ data: { user: null }, error: { message: "invalid JWT" } });
    expect(await getAuthUser(supabase, "expired")).toBeNull();
  });

  it("returns null when there is no user (unauthenticated)", async () => {
    const { supabase } = fakeSupabase({ data: { user: null }, error: null });
    expect(await getAuthUser(supabase)).toBeNull();
  });

  it("maps missing email/phone to null (phone-only parent, email-only staff)", async () => {
    const { supabase } = fakeSupabase({ data: { user: { id: "u-2" } }, error: null });
    expect(await getAuthUser(supabase)).toEqual({ userId: "u-2", email: null, phone: null });
  });

  it("carries NO role/schoolId/status — authorization data never comes from the JWT", async () => {
    const { supabase } = fakeSupabase(verified);
    const user = await getAuthUser(supabase);
    expect(Object.keys(user ?? {}).sort()).toEqual(["email", "phone", "userId"]);
  });
});
