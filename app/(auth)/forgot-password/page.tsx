"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { AuthLogo } from "@/components/auth-logo";
import { sendResetCode, verifyResetCode, resetPassword } from "@/app/actions/password-reset";

type Step = "email" | "code" | "password" | "done";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Step 1 — send 6-digit code
  async function onSendCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    const res = await sendResetCode(email);
    setLoading(false);
    if (!res.ok) { setError(res.error ?? "Failed to send."); return; }
    setStep("code");
  }

  // Step 2 — verify code only
  async function onVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    const res = await verifyResetCode(email, code);
    setLoading(false);
    if (!res.ok) { setError(res.error ?? "Invalid code."); return; }
    setStep("password");
  }

  // Step 3 — set new password
  async function onSetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setLoading(true);
    const res = await resetPassword(email, code, password);
    setLoading(false);
    if (!res.ok) { setError(res.error ?? "Failed."); return; }
    setStep("done");
  }

  return (
    <div className="flex flex-col items-center">
      <AuthLogo size={72} className="mb-6" />
      <div className="w-full rounded-3xl border border-slate-200/80 bg-white p-7 shadow-xl shadow-slate-900/5 sm:p-9">

        {/* ── Step 1: email ── */}
        {step === "email" && (
          <>
            <div className="mb-7">
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Forgot your password?</h1>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
                Enter your registered email — we&apos;ll send you a 6-digit code.
              </p>
            </div>
            <form onSubmit={onSendCode} className="space-y-5">
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400" htmlFor="email">
                  Email address
                </label>
                <div className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 px-4 transition-all focus-within:border-primary-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-primary-500/10">
                  <Icon name="mail" size="md" className="shrink-0 text-slate-400 transition-colors group-focus-within:text-primary-500" />
                  <input
                    id="email" type="email" required autoComplete="email"
                    className="w-full bg-transparent py-3 text-sm text-slate-800 outline-none placeholder:text-slate-400"
                    value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
              </div>
              {error && <ErrorBox message={error} />}
              <button type="submit" disabled={loading} className="press flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-primary-500 to-primary-700 py-3.5 text-sm font-bold text-white shadow-lg shadow-primary-600/25 transition hover:from-primary-400 hover:to-primary-600 disabled:opacity-60">
                {loading ? "Sending…" : "Send code"}
                {!loading && <Icon name="chevron-right" size="md" />}
              </button>
            </form>
            <p className="mt-7 text-center text-sm text-slate-500">
              Remembered it?{" "}
              <Link href="/login" className="font-bold text-primary-600 hover:underline">Back to sign in</Link>
            </p>
          </>
        )}

        {/* ── Step 2: enter code ── */}
        {step === "code" && (
          <>
            <div className="mb-7">
              <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
                <Icon name="mail" size="lg" />
              </span>
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Enter your code</h1>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
                We sent a 6-digit code to <strong>{email}</strong>. Enter it below.
              </p>
            </div>
            <form onSubmit={onVerifyCode} className="space-y-5">
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400" htmlFor="code">
                  6-digit code
                </label>
                <div className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 px-4 transition-all focus-within:border-primary-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-primary-500/10">
                  <Icon name="shield" size="md" className="shrink-0 text-slate-400 transition-colors group-focus-within:text-primary-500" />
                  <input
                    id="code" type="text" required inputMode="numeric" maxLength={6} autoComplete="one-time-code"
                    className="w-full bg-transparent py-3 text-center text-2xl font-bold tracking-[0.4em] text-slate-800 outline-none placeholder:text-slate-300 placeholder:tracking-normal placeholder:text-base placeholder:font-normal"
                    value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="000000"
                  />
                </div>
              </div>
              {error && <ErrorBox message={error} />}
              <button type="submit" disabled={loading || code.length < 6} className="press flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-primary-500 to-primary-700 py-3.5 text-sm font-bold text-white shadow-lg shadow-primary-600/25 transition hover:from-primary-400 hover:to-primary-600 disabled:opacity-60">
                {loading ? "Verifying…" : "Verify code"}
                {!loading && <Icon name="chevron-right" size="md" />}
              </button>
            </form>
            <button onClick={() => { setStep("email"); setError(null); setCode(""); }} className="mt-5 w-full text-center text-sm text-slate-500 hover:text-slate-700">
              Didn&apos;t get it? Go back and resend
            </button>
          </>
        )}

        {/* ── Step 3: new password ── */}
        {step === "password" && (
          <>
            <div className="mb-7">
              <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-success-50 text-success-600">
                <Icon name="check-circle" size="lg" />
              </span>
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Set a new password</h1>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
                Code verified. Choose a strong password of at least 8 characters.
              </p>
            </div>
            <form onSubmit={onSetPassword} className="space-y-5">
              <div>
                <div className="flex items-end justify-between">
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400" htmlFor="password">
                    New password
                  </label>
                  <button type="button" onClick={() => setShowPw(s => !s)} className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-primary-600 hover:text-primary-700">
                    {showPw ? "Hide" : "Show"}
                  </button>
                </div>
                <div className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 px-4 transition-all focus-within:border-primary-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-primary-500/10">
                  <Icon name="lock" size="md" className="shrink-0 text-slate-400 transition-colors group-focus-within:text-primary-500" />
                  <input
                    id="password" type={showPw ? "text" : "password"} required minLength={8} autoComplete="new-password"
                    className="w-full bg-transparent py-3 text-sm text-slate-800 outline-none placeholder:text-slate-400"
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400" htmlFor="confirm">
                  Confirm password
                </label>
                <div className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 px-4 transition-all focus-within:border-primary-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-primary-500/10">
                  <Icon name="shield" size="md" className="shrink-0 text-slate-400 transition-colors group-focus-within:text-primary-500" />
                  <input
                    id="confirm" type={showPw ? "text" : "password"} required autoComplete="new-password"
                    className="w-full bg-transparent py-3 text-sm text-slate-800 outline-none placeholder:text-slate-400"
                    value={confirm} onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Type it again"
                  />
                </div>
              </div>
              {error && <ErrorBox message={error} />}
              <button type="submit" disabled={loading} className="press flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-primary-500 to-primary-700 py-3.5 text-sm font-bold text-white shadow-lg shadow-primary-600/25 transition hover:from-primary-400 hover:to-primary-600 disabled:opacity-60">
                {loading ? "Saving…" : "Save new password"}
                {!loading && <Icon name="chevron-right" size="md" />}
              </button>
            </form>
          </>
        )}

        {/* ── Step 4: done ── */}
        {step === "done" && (
          <div className="text-center">
            <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-success-50 text-success-600">
              <Icon name="check-circle" size="lg" />
            </span>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900">Password updated</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
              Your new password is set. Use it to sign in.
            </p>
            <Link href="/login" className="press mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-primary-500 to-primary-700 py-3 text-sm font-bold text-white shadow-lg shadow-primary-600/25">
              Go to sign in
              <Icon name="chevron-right" size="md" />
            </Link>
          </div>
        )}

      </div>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <p className="flex items-center gap-2.5 rounded-2xl bg-danger-50 px-4 py-3 text-sm font-medium text-danger-600 ring-1 ring-danger-100">
      <Icon name="alert" size="md" className="shrink-0" />
      {message}
    </p>
  );
}
