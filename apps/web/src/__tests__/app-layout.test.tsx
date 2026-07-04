import { getAuthUser } from "@repo/auth";
import { redirect } from "next/navigation";
import { describe, expect, it, vi } from "vitest";

import AppLayout from "../../app/(app)/layout";

vi.mock("@repo/auth", () => ({ getAuthUser: vi.fn() }));
vi.mock("@/src/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({})),
}));
vi.mock("next/navigation", () => ({
  // Mirror Next's real behavior: redirect() throws and never returns.
  redirect: vi.fn((url: string): never => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

describe("(app) protected layout — web route protection", () => {
  it("redirects an unauthenticated visitor to /login", async () => {
    vi.mocked(getAuthUser).mockResolvedValueOnce(null);
    await expect(AppLayout({ children: "secret" })).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("renders children for a verified session", async () => {
    vi.mocked(getAuthUser).mockResolvedValueOnce({
      userId: "u-1",
      email: "a@b.c",
      phone: null,
    });
    const element = await AppLayout({ children: "secret" });
    expect(element.props.children).toBe("secret");
  });
});
