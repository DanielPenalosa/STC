"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/compress";
import { registerCitizen, saveIdPhotoPath } from "@/app/actions/auth";
import { btn } from "@/components/ui";
import { Icon } from "@/components/icons";
import { CLIENT_NAME } from "@/app/brand";

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [idFile, setIdFile] = useState<File | null>(null);
  const [idPreview, setIdPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);
  const [awaitingApproval, setAwaitingApproval] = useState(false);
  const [aiApproved, setAiApproved] = useState(false);

  // keep the chosen ID photo between submit attempts
  useEffect(() => {
    return () => {
      if (idPreview) URL.revokeObjectURL(idPreview);
    };
  }, [idPreview]);

  function onIdFile(f: File | null) {
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) {
      setError("ID photo must be under 8 MB.");
      return;
    }
    setError(null);
    setIdFile(f);
    setIdPreview(URL.createObjectURL(f));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!idFile) {
      setError("Attach a photo of your ID to verify residency.");
      return;
    }
    setLoading(true);
    setError(null);

    const reg = await registerCitizen({
      fullName,
      phone,
      email,
      password,
    });
    if (!reg.ok) {
      setError(reg.error ?? "Registration failed");
      setLoading(false);
      return;
    }

    // email confirmation is enabled — the photo upload needs a session, so
    // ask the citizen to confirm their email first, then sign in
    if (reg.emailConfirmationRequired) {
      setError(null);
      setLoading(false);
      setConfirmSent(true);
      return;
    }

    // Upload the ID via the server route /api/upload-id, which stores it in
    // the private bucket under the caller's own folder. This avoids depending
    // on storage RLS policies being present on the live deployment.
    try {
      const fd = new FormData();
      // gentle client-side compression — OCR needs legibility, so keep
      // quality high; still typically halves the upload size
      fd.append("file", await compressImage(idFile, { maxEdge: 2000, quality: 0.9 }));
      const upRes = await fetch("/api/upload-id", { method: "POST", body: fd });
      const upJson = await upRes.json().catch(() => null);
      if (!upRes.ok || !upJson?.ok) {
        throw new Error(upJson?.error ?? "Upload failed");
      }
      const path: string = upJson.path;

      const saved = await saveIdPhotoPath(path);
      if (!saved.ok) throw new Error(saved.error ?? "Could not save the ID reference.");

      // AI pre-verified the ID during upload — surface the instant-approval
      // outcome (the account itself stays gated until the admin is notified)
      if (upJson.ai_status === "passed") setAiApproved(true);

      // approval flow: sign the fresh session out — the citizen cannot enter
      // the app until an admin approves the registration
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch (err) {
      const supabase = createClient();
      await supabase.auth.signOut();
      setError(
        `Account created, but the ID photo failed to upload (${err instanceof Error ? err.message : "unknown error"}). Contact the administrator to complete your registration.`
      );
      setLoading(false);
      return;
    }

    setLoading(false);
    setAwaitingApproval(true);
  }

  const inputShell =
    "flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 transition focus-within:border-primary-400 focus-within:ring-4 focus-within:ring-primary-50";
  const field =
    "w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-slate-300";
  const label =
    "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400";

  if (confirmSent) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-sm sm:p-8">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
          <Icon name="mail" size="lg" />
        </span>
        <h1 className="text-xl font-bold text-slate-900">Confirm your email</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          We sent a confirmation link to <strong>{email}</strong>. Open it,
          then sign in — your ID will be reviewed for approval.
        </p>
        <Link href="/login" className={`${btn.primary} press mt-5 w-full justify-center`}>
          Go to sign in
        </Link>
        <p className="mt-4 text-xs leading-relaxed text-slate-400">
          Tired of this step? An admin can disable email confirmation under
          Supabase → Authentication → Sign In / Providers → Email.
        </p>
      </div>
    );
  }

  if (awaitingApproval) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-sm sm:p-8">
        <span
          className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl ${
            aiApproved ? "bg-success-50 text-success-600" : "bg-warn-50 text-warn-600"
          }`}
        >
          <Icon name={aiApproved ? "check-circle" : "clock"} size="lg" />
        </span>
        <h1 className="text-xl font-bold text-slate-900">Registration submitted</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          {aiApproved
            ? "Your ID passed the automated verification check. An administrator gets a fast-track notification — you can sign in once they approve it."
            : "Your account and ID photo were received. An administrator will review your registration — you can sign in once it's approved."}
        </p>
        <Link href="/" className={`${btn.primary} press mt-5 w-full justify-center`}>
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-8">
      <div className="mb-6">
        <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
          <Icon name="shield" size="lg" />
        </span>
        <h1 className="text-xl font-bold text-slate-900">Create your account</h1>
        <p className="mt-1 text-sm text-slate-500">
          Join {CLIENT_NAME}&apos;s reporting system. A valid ID is required to
          verify you as a resident.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className={label} htmlFor="fullName">Full name</label>
          <div className={inputShell}>
            <Icon name="user" size="md" className="shrink-0 text-slate-300" />
            <input id="fullName" required autoComplete="name" className={field}
              value={fullName} onChange={(e) => setFullName(e.target.value)}
              placeholder="Juan dela Cruz" />
          </div>
        </div>

        <div>
          <label className={label} htmlFor="phone">Mobile number</label>
          <div className={inputShell}>
            <Icon name="smartphone" size="md" className="shrink-0 text-slate-300" />
            <input id="phone" type="tel" autoComplete="tel" className={field}
              value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="+63 9XX XXX XXXX" />
          </div>
        </div>

        <div>
          <label className={label} htmlFor="email">Email</label>
          <div className={inputShell}>
            <Icon name="mail" size="md" className="shrink-0 text-slate-300" />
            <input id="email" type="email" required autoComplete="email" className={field}
              value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com" />
          </div>
        </div>

        <div>
          <label className={label} htmlFor="password">Password</label>
          <div className={inputShell}>
            <Icon name="lock" size="md" className="shrink-0 text-slate-300" />
            <input id="password" type={showPw ? "text" : "password"} required minLength={8}
              autoComplete="new-password" className={field}
              value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters" />
            <button type="button" onClick={() => setShowPw((s) => !s)}
              className="shrink-0 rounded p-1 text-slate-300 hover:text-slate-500"
              aria-label={showPw ? "Hide password" : "Show password"}>
              <Icon name={showPw ? "eye-off" : "eye"} size="md" />
            </button>
          </div>
        </div>

        {/* ---------- ID verification ---------- */}
        <div className="rounded-xl border border-primary-100 bg-primary-50/50 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-primary-800">
            <Icon name="shield" size="md" />
            Resident verification
          </p>
          <p className="mt-1 text-xs leading-relaxed text-primary-700/80">
            To keep reports authentic, every citizen uploads one photo of a
            valid government-issued or locally recognized ID. Only
            administrators can view it, and it is never shown publicly.
          </p>

          <div className="mt-3">
            <label className={label} htmlFor="idPhoto">Photo of your valid ID</label>
            <label
              htmlFor="idPhoto"
              className="press flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-slate-200 bg-white px-3.5 py-3 transition hover:border-primary-300"
            >
              {idPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={idPreview} alt="ID preview" className="h-12 w-12 rounded-lg object-cover" />
              ) : (
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400">
                  <Icon name="camera" size="lg" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-600">
                  {idFile ? idFile.name : "Upload ID photo"}
                </span>
                <span className="block text-xs text-slate-400">
                  JPG or PNG · clear, all corners visible · max 8 MB
                </span>
              </span>
              {idFile && <Icon name="check-circle" size="md" className="shrink-0 text-success-500" />}
              <input
                id="idPhoto"
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => onIdFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        </div>

        {error && (
          <p className="flex items-start gap-2 rounded-xl bg-danger-50 px-3.5 py-2.5 text-sm leading-relaxed text-danger-600">
            <Icon name="alert" size="md" className="mt-0.5 shrink-0" />
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} className={`${btn.primary} press w-full py-2.5`}>
          {loading ? "Creating account…" : "Create account"}
          {!loading && <Icon name="chevron-right" size="md" />}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-primary-600 hover:underline">
          Sign in
        </Link>
      </p>
      <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-center text-xs leading-relaxed text-slate-400">
        After registering, an administrator approves your account before you
        can sign in. You&apos;ll be notified of the decision.
      </p>
    </div>
  );
}
