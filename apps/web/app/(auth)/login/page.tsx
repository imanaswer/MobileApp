"use client";

import { signInWithOtp, signInWithPassword, verifyOtp } from "@repo/auth";
import { cn } from "@repo/ui";
import { School } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Card, Input } from "@/src/components/ui";
import { getSupabaseClient } from "@/src/lib/supabase/client";

type Mode = "staff" | "parent";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("staff");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [code, setCode] = useState("");

  async function run(action: () => Promise<void>, navigate: boolean): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      await action();
      if (navigate) {
        // The browser client set the session cookie; refresh so the server sees it.
        router.replace("/dashboard");
        router.refresh();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: React.FormEvent): void {
    e.preventDefault();
    const supabase = getSupabaseClient();
    if (mode === "staff") {
      void run(() => signInWithPassword(supabase, { email: email.trim(), password }), true);
    } else if (!otpSent) {
      void run(async () => {
        await signInWithOtp(supabase, { phone: phone.trim() });
        setOtpSent(true);
      }, false);
    } else {
      void run(() => verifyOtp(supabase, { phone: phone.trim(), token: code.trim() }), true);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-neutral-50 p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-navy-700">
            <School aria-hidden strokeWidth={1.75} className="size-7 text-white" />
          </span>
          <h1 className="text-display font-semibold text-neutral-900">Sri Gujarathi Vidhyalaya</h1>
          <p className="text-sm text-neutral-500">School Portal — sign in to continue</p>
        </div>

        <Card className="flex flex-col gap-5">
          <div className="flex rounded-md border border-neutral-300 bg-neutral-100 p-1">
            {(["staff", "parent"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  "h-9 flex-1 rounded font-medium capitalize transition-colors duration-fast",
                  mode === m ? "bg-white text-primary-700 shadow-sm" : "text-neutral-500",
                )}
              >
                {m}
              </button>
            ))}
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            {mode === "staff" ? (
              <>
                <Input
                  label="Email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <Input
                  label="Password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <Link href="/forgot-password" className="-mt-1 text-sm text-primary-700">
                  Forgot password?
                </Link>
                <Button type="submit" loading={busy}>
                  Sign in
                </Button>
              </>
            ) : (
              <>
                <Input
                  label="Phone number"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={otpSent}
                  required
                />
                {otpSent ? (
                  <Input
                    label="Verification code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                  />
                ) : null}
                <Button type="submit" loading={busy}>
                  {otpSent ? "Verify code" : "Send code"}
                </Button>
              </>
            )}

            {error ? (
              <p className="text-sm text-danger-600" role="alert">
                {error}
              </p>
            ) : null}
          </form>
        </Card>
      </div>
    </main>
  );
}
