"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { btn } from "@/components/ui";
import { Icon } from "@/components/icons";
import { CLIENT_NAME } from "@/app/brand";

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

  const inputShell =
    "flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 transition focus-within:border-primary-400 focus-within:ring-4 focus-within:ring-primary-50";

  if (gated) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-8">
        <span
          className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl ${
            gated.status === "rejected" ? "bg-danger-50 text-danger-600" : "bg-warn-50 text-warn-600"
          }`}
        >
          <Icon name={gated.status === "rejected" ? "close" : "clock"} size="lg" />
        </span>
        {gated.status === "pending" ? (
          <>
            <h1 className="text-xl font-bold text-slate-900">Awaiting approval</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              Your account and ID have been received. An administrator is
              reviewing your registration — you&apos;ll be able to sign in once
              it&apos;s approved.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold text-slate-900">Registration not approved</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              {gated.reason ??
                "Your registration was rejected by an administrator. Please contact the municipal office for assistance."}
            </p>
          </>
        )}
        <Link href="/" className={`${btn.secondary} press mt-5 w-full justify-center`}>
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-8">
      <div className="mb-6">
        <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
          <Icon name="logout" size="lg" />
        </span>
        <h1 className="text-xl font-bold text-slate-900">Welcome back</h1>
        <p className="mt-1 text-sm text-slate-500">
          Sign in to {CLIENT_NAME}&apos;s reporting system.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400" htmlFor="email">
            Email
          </label>
          <div className={inputShell}>
            <Icon name="mail" size="md" className="shrink-0 text-slate-300" />
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              className="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-slate-300"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400" htmlFor="password">
            Password
          </label>
          <div className={inputShell}>
            <Icon name="lock" size="md" className="shrink-0 text-slate-300" />
            <input
              id="password"
              type={showPw ? "text" : "password"}
              required
              autoComplete="current-password"
              className="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-slate-300"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              className="shrink-0 rounded p-1 text-slate-300 hover:text-slate-500"
              aria-label={showPw ? "Hide password" : "Show password"}
            >
              <Icon name={showPw ? "eye-off" : "eye"} size="md" />
            </button>
          </div>
        </div>

        {error && (
          <p className="flex items-center gap-2 rounded-xl bg-danger-50 px-3.5 py-2.5 text-sm text-danger-600">
            <Icon name="alert" size="md" className="shrink-0" />
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} className={`${btn.primary} press w-full py-2.5`}>
          {loading ? "Signing in…" : "Sign in"}
          {!loading && <Icon name="chevron-right" size="md" />}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        New citizen?{" "}
        <Link href="/register" className="font-semibold text-primary-600 hover:underline">
          Create an account
        </Link>
      </p>
      <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-center text-xs text-slate-400">
        Department, Barangay and Admin accounts are issued by the system administrator. Citizen accounts require ID verification.
      </p>
    </div>
  );
}
