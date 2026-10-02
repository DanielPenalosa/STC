"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/icons";
import { AuthLogo } from "@/components/auth-logo";

/**
 * Forgot password — sends a Supabase recovery email. The link in the email
 * carries a one-time code back to /reset-password, where the user sets the
 * new password.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    // always show the sent state — never reveal whether an email exists
    if (!error) setSent(true);
    else setError(error.message);
  }

  return (
    <div className="flex flex-col items-center">
      <AuthLogo size={72} className="mb-6" />
      <div className="w-full rounded-3xl border border-slate-200/80 bg-white p-7 shadow-xl shadow-slate-900/5 sm:p-9">
        {sent ? (
          <div className="text-center">
            <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
              <Icon name="mail" size="lg" />
            </span>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900">Check your email</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
              If an account exists for <strong>{email}</strong>, a password
              reset link is on its way. Open it and set your new password.
            </p>
            <Link
              href="/login"
              className="press mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              <Icon name="arrow-left" size="md" />
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-7">
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Forgot your password?</h1>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
                Enter the email you registered with — we&apos;ll send you a link
                to set a new one.
              </p>
            </div>

            <form onSubmit={onSubmit} className="space-y-5">
              <div>
                <label
                  className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
                  htmlFor="email"
                >
                  Email address
                </label>
                <div className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 px-4 transition-all focus-within:border-primary-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-primary-500/10">
                  <Icon name="mail" size="md" className="shrink-0 text-slate-400 transition-colors group-focus-within:text-primary-500" />
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    className="w-full bg-transparent py-3 text-sm text-slate-800 outline-none placeholder:text-slate-400"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
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
                {loading ? "Sending…" : "Send reset link"}
                {!loading && <Icon name="chevron-right" size="md" />}
              </button>
            </form>

            <p className="mt-7 text-center text-sm text-slate-500">
              Remembered it?{" "}
              <Link href="/login" className="font-bold text-primary-600 hover:text-primary-700 hover:underline">
                Back to sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
