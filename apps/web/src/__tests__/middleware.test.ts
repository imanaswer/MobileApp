import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { middleware, config } from "../../middleware";

interface CookieMethods {
  getAll: () => Array<{ name: string; value: string }>;
  setAll: (cookies: Array<{ name: string; value: string; options?: object }>) => void;
}

const { createServerClient, getUser } = vi.hoisted(() => {
  const getUser = vi.fn(async (): Promise<{ data: { user: null }; error: null }> => ({
    data: { user: null },
    error: null,
  }));
  const createServerClient = vi.fn(() => ({ auth: { getUser } }));
  return { createServerClient, getUser };
});

vi.mock("@repo/auth", () => ({ createServerClient }));
vi.mock("@/src/env", () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  },
}));

function lastCookieMethods(): CookieMethods {
  const call = createServerClient.mock.calls.at(-1) as unknown[];
  return call[2] as CookieMethods;
}

describe("web middleware — session refresh on navigation", () => {
  it("verifies the session via getUser() on every matched request (token rotation trigger)", async () => {
    getUser.mockClear();
    await middleware(new NextRequest("http://localhost:3000/dashboard"));
    expect(createServerClient).toHaveBeenCalledWith(
      "https://test.supabase.co",
      "anon-key",
      expect.anything(),
    );
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it("exposes the request cookies to the Supabase client (getAll)", async () => {
    const request = new NextRequest("http://localhost:3000/dashboard", {
      headers: { cookie: "sb-auth=stale-token" },
    });
    await middleware(request);
    expect(lastCookieMethods().getAll()).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "sb-auth", value: "stale-token" })]),
    );
  });

  it("writes rotated tokens onto BOTH the request (for downstream SSR) and the response (Set-Cookie)", async () => {
    // Simulate Supabase rotating the token during getUser(): it calls the
    // injected setAll, which the middleware must propagate to its response.
    getUser.mockImplementationOnce(async () => {
      lastCookieMethods().setAll([
        { name: "sb-auth", value: "rotated-token", options: { path: "/" } },
      ]);
      return { data: { user: null }, error: null };
    });

    const request = new NextRequest("http://localhost:3000/dashboard", {
      headers: { cookie: "sb-auth=stale-token" },
    });
    const response = await middleware(request);

    expect(request.cookies.get("sb-auth")?.value).toBe("rotated-token");
    expect(response.cookies.get("sb-auth")?.value).toBe("rotated-token");
  });

  it("matcher skips static assets and the API (which authenticates itself)", () => {
    const [pattern] = config.matcher;
    expect(pattern).toContain("_next/static");
    expect(pattern).toContain("api");
  });
});
