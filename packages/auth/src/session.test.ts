import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  onAuthStateChange,
  refreshSession,
  resetPassword,
  restoreSession,
  getSession,
  signInWithOtp,
  signInWithPassword,
  signOut,
  updatePassword,
  verifyOtp,
} from "./session";

interface ErrorResult {
  error: { message: string } | null;
}

const ok: ErrorResult = { error: null };
const failure: ErrorResult = { error: { message: "auth failed" } };

/** A fake Supabase client whose `auth` methods all resolve to the given result. */
function fakeSupabase(result: ErrorResult = ok): {
  supabase: SupabaseClient;
  auth: Record<string, ReturnType<typeof vi.fn>>;
} {
  const call = (): ReturnType<typeof vi.fn> => vi.fn(async (): Promise<ErrorResult> => result);
  const auth: Record<string, ReturnType<typeof vi.fn>> = {
    signInWithPassword: call(),
    signInWithOtp: call(),
    verifyOtp: call(),
    resetPasswordForEmail: call(),
    updateUser: call(),
    signOut: call(),
    refreshSession: call(),
  };
  return { supabase: { auth } as unknown as SupabaseClient, auth };
}

describe("signInWithPassword (staff)", () => {
  it("passes the credentials through", async () => {
    const { supabase, auth } = fakeSupabase();
    await signInWithPassword(supabase, { email: "a@b.c", password: "pw" });
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "a@b.c", password: "pw" });
  });

  it("throws the Supabase error on failure", async () => {
    const { supabase } = fakeSupabase(failure);
    await expect(signInWithPassword(supabase, { email: "a@b.c", password: "x" })).rejects.toEqual(
      failure.error,
    );
  });
});

describe("signInWithOtp (parent, step 1)", () => {
  it("ALWAYS sends shouldCreateUser: false — accounts are pre-provisioned, no public signup (ADR-001, security review #1)", async () => {
    const { supabase, auth } = fakeSupabase();
    await signInWithOtp(supabase, { phone: "+911234567890" });
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      phone: "+911234567890",
      options: { shouldCreateUser: false },
    });
  });

  it("throws on failure (e.g. unknown phone / rate limited)", async () => {
    const { supabase } = fakeSupabase(failure);
    await expect(signInWithOtp(supabase, { phone: "+911234567890" })).rejects.toEqual(
      failure.error,
    );
  });
});

describe("verifyOtp (parent, step 2)", () => {
  it("verifies as an SMS OTP", async () => {
    const { supabase, auth } = fakeSupabase();
    await verifyOtp(supabase, { phone: "+911234567890", token: "123456" });
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      phone: "+911234567890",
      token: "123456",
      type: "sms",
    });
  });

  it("throws on a wrong/expired code", async () => {
    const { supabase } = fakeSupabase(failure);
    await expect(verifyOtp(supabase, { phone: "+911234567890", token: "000000" })).rejects.toEqual(
      failure.error,
    );
  });
});

describe("resetPassword / updatePassword (staff recovery)", () => {
  it("passes redirectTo only when provided", async () => {
    const { supabase, auth } = fakeSupabase();
    await resetPassword(supabase, "a@b.c", "https://app.example/update-password");
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("a@b.c", {
      redirectTo: "https://app.example/update-password",
    });

    await resetPassword(supabase, "a@b.c");
    expect(auth.resetPasswordForEmail).toHaveBeenLastCalledWith("a@b.c", undefined);
  });

  it("updatePassword sets the new password on the recovery session", async () => {
    const { supabase, auth } = fakeSupabase();
    await updatePassword(supabase, "new-password-123");
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "new-password-123" });
  });

  it("both throw on failure", async () => {
    const { supabase } = fakeSupabase(failure);
    await expect(resetPassword(supabase, "a@b.c")).rejects.toEqual(failure.error);
    await expect(updatePassword(supabase, "x")).rejects.toEqual(failure.error);
  });
});

describe("session state", () => {
  it("getSession returns the current session or null", async () => {
    const session = { access_token: "t" } as Session;
    const getSessionFn = vi.fn(async (): Promise<{ data: { session: Session | null } }> => ({
      data: { session },
    }));
    const supabase = { auth: { getSession: getSessionFn } } as unknown as SupabaseClient;
    expect(await getSession(supabase)).toBe(session);

    getSessionFn.mockResolvedValueOnce({ data: { session: null } });
    expect(await getSession(supabase)).toBeNull();
  });

  it("onAuthStateChange forwards the session and unsubscribes cleanly", () => {
    const unsubscribe = vi.fn();
    let handler: ((event: string, session: Session | null) => void) | undefined;
    const onChange = vi.fn((cb: (event: string, session: Session | null) => void) => {
      handler = cb;
      return { data: { subscription: { unsubscribe } } };
    });
    const supabase = { auth: { onAuthStateChange: onChange } } as unknown as SupabaseClient;

    const received: Array<Session | null> = [];
    const stop = onAuthStateChange(supabase, (session) => received.push(session));

    const session = { access_token: "t" } as Session;
    handler?.("SIGNED_IN", session);
    handler?.("SIGNED_OUT", null);
    expect(received).toEqual([session, null]);

    stop();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("signOut and refreshSession propagate Supabase errors", async () => {
    const { supabase } = fakeSupabase(failure);
    await expect(signOut(supabase)).rejects.toEqual(failure.error);
    await expect(refreshSession(supabase)).rejects.toEqual(failure.error);
  });

  it("restoreSession adopts stored tokens onto a fresh client (app-restart path)", async () => {
    const session = { access_token: "restored" } as Session;
    const setSession = vi.fn(async () => ({ data: { session }, error: null }));
    const supabase = { auth: { setSession } } as unknown as SupabaseClient;
    await expect(restoreSession(supabase, { accessToken: "at", refreshToken: "rt" })).resolves.toBe(
      session,
    );
    expect(setSession).toHaveBeenCalledWith({ access_token: "at", refresh_token: "rt" });
  });

  it("restoreSession throws when the tokens are rejected or yield no session", async () => {
    const rejected = {
      auth: {
        setSession: vi.fn(async () => ({ data: { session: null }, error: { message: "invalid" } })),
      },
    } as unknown as SupabaseClient;
    await expect(restoreSession(rejected, { accessToken: "x", refreshToken: "y" })).rejects.toEqual(
      { message: "invalid" },
    );

    const empty = {
      auth: { setSession: vi.fn(async () => ({ data: { session: null }, error: null })) },
    } as unknown as SupabaseClient;
    await expect(restoreSession(empty, { accessToken: "x", refreshToken: "y" })).rejects.toThrow(
      "Session could not be restored",
    );
  });

  it("signOut resolves when the session is cleared", async () => {
    const { supabase, auth } = fakeSupabase();
    await expect(signOut(supabase)).resolves.toBeUndefined();
    expect(auth.signOut).toHaveBeenCalledOnce();
  });
});
