"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  toggleFollow,
  addFollowup,
  submitFeedback,
} from "@/app/actions/reports";
import {
  approveCompletion,
  requestRevision,
} from "@/app/actions/admin";
import { btn, inputCls } from "@/components/ui";
import { Icon } from "@/components/icons";

/* ------------------------------------------------------------------ */
/* Follow / Unfollow — other citizens follow along for updates         */
/* ------------------------------------------------------------------ */

export function FollowButton({
  reportId,
  initialFollowing,
  followers,
  isReporter,
}: {
  reportId: string;
  initialFollowing: boolean;
  followers: number;
  isReporter: boolean;
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [count, setCount] = useState(followers);
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    const res = await toggleFollow(reportId);
    setBusy(false);
    if (res.ok) {
      setFollowing(Boolean(res.following));
      setCount((c) => c + (res.following ? 1 : -1));
      router.refresh();
    }
  }

  return (
    <button
      onClick={onClick}
      disabled={busy || isReporter}
      title={
        isReporter
          ? "You authored this report — you're automatically following it"
          : following
          ? "Unfollow this report"
          : "Follow to get updates on this report"
      }
      className={`press inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold shadow-sm transition ${
        following
          ? "border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      } disabled:opacity-60`}
    >
      <Icon name="bell" size="sm" />
      {following ? "Following" : "Follow"}
      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
        {count}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Follow-ups — the reporter can nudge admins at any time              */
/* ------------------------------------------------------------------ */

export function FollowupSection({
  reportId,
  canPost,
  items,
}: {
  reportId: string;
  canPost: boolean;
  items: { id: string; message: string; created_at: string; author: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await addFollowup(reportId, message);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Failed to send");
      return;
    }
    setMessage("");
    setOpen(false);
    router.refresh();
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <Icon name="mail" size="md" className="text-primary-600" />
          Follow-ups
          {items.length > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
              {items.length}
            </span>
          )}
        </p>
        {canPost && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="press rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 shadow-sm hover:bg-slate-50"
          >
            {open ? "Cancel" : "Add follow-up"}
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-400">
        {canPost
          ? "Nudge the office handling your report — admins are alerted instantly."
          : "Follow-up messages from the reporter appear here."}
      </p>

      {open && (
        <form onSubmit={onSubmit} className="mt-3 space-y-2">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Add details, ask about progress…"
            className={`${inputCls} resize-none`}
          />
          {error && <p className="text-xs font-medium text-danger-600">{error}</p>}
          <button type="submit" disabled={busy || !message.trim()} className={`${btn.primary} w-full justify-center`}>
            {busy ? "Sending…" : "Send follow-up"}
          </button>
        </form>
      )}

      <div className="mt-3 space-y-2.5">
        {items.length === 0 && !open && (
          <p className="rounded-lg bg-slate-50 px-3 py-3 text-center text-xs text-slate-400">
            No follow-ups yet.
          </p>
        )}
        {items.map((f) => (
          <div key={f.id} className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-xs font-bold text-slate-700">{f.author}</p>
              <p className="shrink-0 text-[10px] text-slate-400">
                {new Date(f.created_at).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-600">{f.message}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Star rating — reporter rates a resolved report                      */
/* ------------------------------------------------------------------ */

export function FeedbackCard({
  reportId,
  existing,
}: {
  reportId: string;
  existing: { rating: number; comment: string | null } | null;
}) {
  const router = useRouter();
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState(existing?.comment ?? "");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(Boolean(existing));
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await submitFeedback(reportId, rating, comment);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Failed to submit");
      return;
    }
    setDone(true);
    router.refresh();
  }

  if (done) {
    return (
      <section className="rounded-xl border border-success-200 bg-success-50/60 p-4 shadow-sm">
        <p className="flex items-center gap-2 text-sm font-bold text-success-700">
          <Icon name="check-circle" size="md" />
          Feedback received — thank you!
        </p>
        <div className="mt-2 flex items-center gap-1">
          {Array.from({ length: 5 }, (_, i) => (
            <Star key={i} filled={i < (existing?.rating ?? rating)} />
          ))}
        </div>
        {existing?.comment && (
          <p className="mt-1.5 text-[13px] text-success-800/80">“{existing.comment}”</p>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
        <Icon name="sparkles" size="md" className="text-primary-600" />
        Rate this resolution
      </p>
      <p className="mt-1 text-xs text-slate-400">
        Your feedback helps the office improve. This goes straight to the administrator.
      </p>
      <form onSubmit={onSubmit} className="mt-3 space-y-3">
        <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              onClick={() => setRating(n)}
              className="press transition hover:scale-110"
            >
              <Star filled={n <= (hover || rating)} />
            </button>
          ))}
          {rating > 0 && (
            <span className="ml-1 text-xs font-semibold text-slate-500">
              {["", "Poor", "Fair", "Good", "Very good", "Excellent"][rating]}
            </span>
          )}
        </div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="Optional comment…"
          className={`${inputCls} resize-none`}
        />
        {error && <p className="text-xs font-medium text-danger-600">{error}</p>}
        <button type="submit" disabled={busy || rating === 0} className={`${btn.primary} w-full justify-center`}>
          {busy ? "Submitting…" : "Submit feedback"}
        </button>
      </form>
    </section>
  );
}

function Star({ filled }: { filled: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill={filled ? "#f59e0b" : "none"}
      stroke={filled ? "#f59e0b" : "#cbd5e1"}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 2.5l2.95 5.98 6.6.96-4.78 4.66 1.13 6.58L12 17.57l-5.9 3.11 1.13-6.58L2.45 9.44l6.6-.96L12 2.5z" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Admin verification panel — approve or send back a "Done" report.    */
/* Calls the server actions directly (server components can't pass     */
/* function props to client components, so no onApprove/onRevise).     */
/* ------------------------------------------------------------------ */

export function VerificationCard({
  reportId,
  completionPhotos = [],
}: {
  reportId: string;
  /** completion/evidence photos submitted by the department */
  completionPhotos?: { id: string; url: string }[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "approve" | "revise">("idle");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: "approve" | "revise") {
    setBusy(true);
    setError(null);
    const res =
      action === "approve"
        ? await approveCompletion(reportId, note.trim() || undefined)
        : await requestRevision(reportId, note.trim());
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Action failed");
      return;
    }
    setMode("idle");
    router.refresh();
  }

  return (
    <section className="rounded-xl border border-primary-200 bg-primary-50/50 p-4 shadow-sm">
      <p className="flex items-center gap-2 text-sm font-bold text-primary-800">
        <Icon name="shield" size="md" />
        Completion verification needed
      </p>
      <p className="mt-1 text-xs leading-relaxed text-primary-700/80">
        The department marked this report <strong>Done</strong> with a completion photo.
        Approve to resolve it (the reporter and followers are notified), or send it back
        for revision.
      </p>

      {/* completion evidence — the proof the work was done */}
      {completionPhotos.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-primary-700/70">
            Completion photo{completionPhotos.length > 1 ? "s" : ""} ({completionPhotos.length})
          </p>
          <div className="grid grid-cols-3 gap-2">
            {completionPhotos.map((p) => (
              <a
                key={p.id}
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="group relative overflow-hidden rounded-lg border border-primary-100"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt="completion evidence"
                  loading="lazy"
                  className="aspect-square w-full object-cover transition duration-300 group-hover:scale-[1.04]"
                />
              </a>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-primary-600/60">Click a photo to view full size.</p>
        </div>
      )}

      {mode === "idle" ? (
        <div className="mt-3 flex gap-2">
          <button onClick={() => setMode("approve")} className={`${btn.primary} flex-1 justify-center`}>
            Approve &amp; Resolve
          </button>
          <button
            onClick={() => setMode("revise")}
            className="flex-1 justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50"
          >
            Needs Revision
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-semibold text-primary-800">
            {mode === "approve" ? "Optional note to the citizen:" : "What needs fixing? (required)"}
          </p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={500}
            className={`${inputCls} resize-none`}
            placeholder={mode === "approve" ? "e.g. Great news — the road has been patched!" : "e.g. The photo doesn't show the repaired section…"}
          />
          {error && <p className="text-xs font-medium text-danger-600">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => void run(mode)}
              disabled={busy || (mode === "revise" && !note.trim())}
              className={`${btn.primary} flex-1 justify-center`}
            >
              {busy ? "Working…" : mode === "approve" ? "Confirm Resolve" : "Send back"}
            </button>
            <button
              onClick={() => {
                setMode("idle");
                setError(null);
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
