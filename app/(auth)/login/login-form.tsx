"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { btn } from "@/components/ui";
import { Icon } from "@/components/icons";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [gated, setGated] = useState<{ status: "pending" | "rejected"; reason: string | null } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setGated(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // admin-approval gate: pending/rejected citizens cannot enter
    const { data: prof } = await supabase
      .from("users")
      .select("role, verification_status, rejection_reason")
      .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
      .maybeSingle();
    const p = prof as { role: string; verification_status: string; rejection_reason: string | null } | null;
    if (p?.role === "citizen" && p.verification_status !== "verified") {
      await supabase.auth.signOut();
      setGated({
        status: p.verification_status === "rejected" ? "rejected" : "pending",
        reason: p.rejection_reason,
      });
      setLoading(false);
      return;
    }

    const next = params.get("next");
    router.push(next && next.startsWith("/") ? next : "/dashboard");
    router.refresh();
  }

  /* ---------- shared design tokens ---------- */
  const inputShell =
    "group flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 px-4 transition-all focus-within:border-primary-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-primary-500/10";
  const field =
    "w-full bg-transparent py-3 text-sm text-slate-800 outline-none placeholder:text-slate-400";
  const label =
    "mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400";

  if (gated) {
    return (
      <div className="rounded-3xl border border-slate-200/80 bg-white p-7 shadow-xl shadow-slate-900/5 sm:p-9">
        <span
          className={`mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl ${
            gated.status === "rejected" ? "bg-danger-50 text-danger-600" : "bg-warn-50 text-warn-600"
          }`}
        >
          <Icon name={gated.status === "rejected" ? "close" : "clock"} size="lg" />
        </span>
        <div className="text-center">
          {gated.status === "pending" ? (
            <>
              <h1 className="text-xl font-extrabold tracking-tight text-slate-900">Awaiting approval</h1>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
                Your account and ID have been received. An administrator is
                reviewing your registration — you&apos;ll be able to sign in once
                it&apos;s approved.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-xl font-extrabold tracking-tight text-slate-900">Registration not approved</h1>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
                {gated.reason ??
                  "Your registration was rejected by an administrator. Please contact the municipal office for assistance."}
              </p>
            </>
          )}
        </div>
        <Link href="/" className={`${btn.secondary} press mt-6 w-full justify-center rounded-2xl py-3`}>
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white p-7 shadow-xl shadow-slate-900/5 sm:p-9">
      {/* header with Login / Sign up switcher */}
      <div className="mb-7">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Welcome back</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
          Sign in to continue reporting community issues.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1.5">
          <span
            aria-current="page"
            className="flex items-center justify-center gap-2 rounded-xl bg-white py-2.5 text-sm font-semibold text-slate-900 shadow-md shadow-slate-900/5"
          >
            <Icon name="login" size="md" />
            Login
          </span>
          <Link
            href="/register"
            className="press flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium text-slate-500 transition hover:text-slate-700"
          >
            <Icon name="user-plus" size="md" />
            Sign up
          </Link>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        <div>
          <label className={label} htmlFor="email">Email address</label>
          <div className={inputShell}>
            <Icon name="mail" size="md" className="shrink-0 text-slate-400 transition-colors group-focus-within:text-primary-500" />
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              className={field}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
        </div>

        <div>
          <div className="flex items-end justify-between">
            <label className={label} htmlFor="password">Password</label>
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-primary-600 hover:text-primary-700"
            >
              {showPw ? "Hide" : "Show"}
            </button>
          </div>
          <div className={inputShell}>
            <Icon name="lock" size="md" className="shrink-0 text-slate-400 transition-colors group-focus-within:text-primary-500" />
            <input
              id="password"
              type={showPw ? "text" : "password"}
              required
              autoComplete="current-password"
              className={field}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
            />
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              className="shrink-0 rounded-lg p-1 text-slate-300 hover:text-slate-500"
              aria-label={showPw ? "Hide password" : "Show password"}
            >
              <Icon name={showPw ? "eye-off" : "eye"} size="md" />
            </button>
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
          className="press mt-1 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-primary-500 to-primary-700 py-3.5 text-sm font-bold text-white shadow-lg shadow-primary-600/25 transition hover:from-primary-400 hover:to-primary-600 disabled:opacity-60"
        >
          {loading ? "Signing in…" : "Sign in"}
          {!loading && <Icon name="chevron-right" size="md" />}
        </button>
      </form>

      <p className="mt-7 text-center text-sm text-slate-500">
        New citizen?{" "}
        <Link href="/register" className="font-bold text-primary-600 hover:text-primary-700 hover:underline">
          Create an account
        </Link>
      </p>

      <div className="mt-5 flex items-start gap-2.5 rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-100">
        <Icon name="shield" size="md" className="mt-0.5 shrink-0 text-slate-400" />
        <p className="text-xs leading-relaxed text-slate-500">
          Department, Barangay and Admin accounts are issued by the system
          administrator. Citizen accounts require ID verification.
        </p>
      </div>
    </div>
  );
}
