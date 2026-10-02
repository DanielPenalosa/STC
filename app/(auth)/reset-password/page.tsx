"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/icons";
import { AuthLogo } from "@/components/auth-logo";

/**
 * Reset password — the landing target of Supabase's recovery email. The
 * URL carries a one-time recovery code (#access_token=...&refresh_token=...
 * or ?code=... depending on the flow). Both flavors are detected below;
 * exchanging the code sets the session, then the new password is saved.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [status, setStatus] = useState<"verifying" | "ready" | "invalid" | "done">("verifying");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const verified = useRef(false);

  // Detect the recovery token. With the default "implicit" flow it arrives
  // in the URL fragment (#access_token=…); with PKCE it arrives as ?code=….
  function detectToken(): { type: "fragment" | "code"; value: string } | null {
    if (typeof window === "undefined") return null;
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const at = hash.get("access_token");
    if (at) return { type: "fragment", value: at };
    const code = new URLSearchParams(window.location.search).get("code");
    if (code) return { type: "code", value: code };
    return null;
  }

  async function ensureSession(): Promise<boolean> {
    if (verified.current) return true;
    const token = detectToken();
    if (!token) return false;
    const supabase = createClient();
    try {
      if (token.type === "code") {
        const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
        if (error) throw error;
      } else {
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const { error } = await supabase.auth.setSession({
          access_token: token.value,
          refresh_token: hash.get("refresh_token") ?? "",
        });
        if (error) throw error;
      }
      // clean tokens out of the address bar
      window.history.replaceState({}, "", window.location.pathname);
      verified.current = true;
      return true;
    } catch (e) {
      console.error("[reset-password] token exchange failed:", e);
      return false;
    }
  }

  // Verify the recovery token once on mount; the form only shows for
  // valid links.
  useEffect(() => {
    let cancelled = false;
    ensureSession().then((ok) => {
      if (!cancelled) setStatus(ok ? "ready" : "invalid");
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setStatus("done");
  }

  return (
    <div className="flex flex-col items-center">
      <AuthLogo size={72} className="mb-6" />
      <div className="w-full rounded-3xl border border-slate-200/80 bg-white p-7 shadow-xl shadow-slate-900/5 sm:p-9">
        {status === "verifying" && (
          <div className="flex flex-col items-center py-6 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
              <Icon name="clock" size="lg" />
            </span>
            <h1 className="mt-5 text-xl font-extrabold tracking-tight text-slate-900">Verifying link…</h1>
            <p className="mt-2 text-sm text-slate-500">One moment — checking your reset link.</p>
          </div>
        )}

        {status === "invalid" && (
          <div className="text-center">
            <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-50 text-danger-600">
              <Icon name="alert" size="lg" />
            </span>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900">Link expired or invalid</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
              Reset links are single-use and expire after a while. Request a
              fresh one and try again.
            </p>
            <Link
              href="/forgot-password"
              className="press mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-primary-500 to-primary-700 py-3 text-sm font-bold text-white shadow-lg shadow-primary-600/25"
            >
              Send a new link
            </Link>
            <Link href="/login" className="mt-4 block text-center text-sm font-bold text-primary-600 hover:underline">
              Back to sign in
            </Link>
          </div>
        )}

        {status === "done" && (
          <div className="text-center">
            <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-success-50 text-success-600">
              <Icon name="check-circle" size="lg" />
            </span>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900">Password updated</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
              Your new password is set. Use it to sign in.
            </p>
            <button
              type="button"
              onClick={() => router.push("/login")}
              className="press mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-primary-500 to-primary-700 py-3 text-sm font-bold text-white shadow-lg shadow-primary-600/25"
            >
              Go to sign in
              <Icon name="chevron-right" size="md" />
            </button>
          </div>
        )}

        {status === "ready" && (
          <>
            <div className="mb-7">
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Set a new password</h1>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
                Choose a strong password of at least 8 characters.
              </p>
            </div>

            <form onSubmit={onSubmit} className="space-y-5">
              <div>
                <div className="flex items-end justify-between">
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400" htmlFor="password">
                    New password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPw((s) => !s)}
                    className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-primary-600 hover:text-primary-700"
                  >
                    {showPw ? "Hide" : "Show"}
                  </button>
                </div>
                <div className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 px-4 transition-all focus-within:border-primary-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-primary-500/10">
                  <Icon name="lock" size="md" className="shrink-0 text-slate-400 transition-colors group-focus-within:text-primary-500" />
                  <input
                    id="password"
                    type={showPw ? "text" : "password"}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="w-full bg-transparent py-3 text-sm text-slate-800 outline-none placeholder:text-slate-400"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400" htmlFor="confirm">
                  Confirm new password
                </label>
                <div className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 px-4 transition-all focus-within:border-primary-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-primary-500/10">
                  <Icon name="shield" size="md" className="shrink-0 text-slate-400 transition-colors group-focus-within:text-primary-500" />
                  <input
                    id="confirm"
                    type={showPw ? "text" : "password"}
                    required
                    autoComplete="new-password"
                    className="w-full bg-transparent py-3 text-sm text-slate-800 outline-none placeholder:text-slate-400"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Type it again"
                  />
                </div>
              </div>

              {error && (
                <p className="flex items-center gap-2.5 rounded-2xl bg-danger-50 px-4 py-3 text-sm font-medium text-danger-600 ring-1 ring-danger-100">
                  <Icon name="alert" size="md" className="shrink-0" />
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="press flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-primary-500 to-primary-700 py-3.5 text-sm font-bold text-white shadow-lg shadow-primary-600/25 transition hover:from-primary-400 hover:to-primary-600 disabled:opacity-60"
              >
                {loading ? "Saving…" : "Save new password"}
                {!loading && <Icon name="chevron-right" size="md" />}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
