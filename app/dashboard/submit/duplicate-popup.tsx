"use client";

import { useState } from "react";
import Link from "next/link";
import { btn } from "@/components/ui";
import { Icon } from "@/components/icons";
import { STATUS_LABELS } from "@/lib/constants";

export type DupCandidate = {
  reportId: string;
  refCode: string | null;
  title: string;
  status: string;
  distanceM: number | null;
  /** 0–1 combined similarity (server signals + browser ML image match) */
  score: number;
  signals: { signal: string; score: number }[];
  photoUrl: string | null;
  createdAt: string;
};

const STATUS_CHIP: Record<string, string> = {
  submitted: "bg-warn-50 text-warn-700",
  under_review: "bg-warn-50 text-warn-700",
  verified: "bg-accent-50 text-accent-600",
  assigned: "bg-primary-50 text-primary-700",
  in_progress: "bg-accent-50 text-accent-600",
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const hr12 = h % 12 === 0 ? 12 : h % 12;
  const ampm = h < 12 ? "AM" : "PM";
  return `${d.getMonth() + 1}/${d.getDate()} ${hr12}:${String(d.getMinutes()).padStart(2, "0")} ${ampm}`;
}

function distanceLabel(m: number | null): string {
  if (m == null) return "same area";
  if (m < 1000) return `${m} m away`;
  return `${(m / 1000).toFixed(1)} km away`;
}

function signalChip(s: { signal: string; score: number }): string {
  switch (s.signal) {
    case "ai_image":
      return `Looks like the same scene (${Math.round(s.score * 100)}%)`;
    case "photo":
      return "Identical photo";
    case "text":
      return "Similar description";
    case "location":
      return "Very close location";
    case "category":
      return "Same category";
    default:
      return s.signal;
  }
}

/**
 * Pre-submission duplicate warning. Pops up when the AI finds the citizen's
 * concern is likely already reported nearby — shows the existing report's
 * reference number, live status, distance and its photo, and lets them
 * review it before choosing: "View existing report" (navigates there) or
 * "It's a different issue — submit anyway".
 */
export default function DuplicatePopup({
  candidate,
  onContinue,
  onCancel,
}: {
  candidate: DupCandidate;
  /** the citizen chose to submit anyway */
  onContinue: () => void;
  /** the citizen wants out (review/edit the existing report) */
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-[2px] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Similar report already exists"
    >
      <div className="animate-[page-in_.28s_ease-out] max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        {/* header */}
        <div className="flex items-start gap-3 border-b border-warn-100 bg-warn-50/70 px-5 py-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warn-100 text-warn-600">
            <Icon name="alert" size="lg" />
          </span>
          <div className="min-w-0">
            <p className="text-base font-extrabold leading-snug text-slate-900">
              This concern may already be reported
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
              Our AI found an active report nearby that looks very similar
              ({Math.round(candidate.score * 100)}% match). Adding it again can
              slow the fix down.
            </p>
          </div>
        </div>

        {/* the existing report */}
        <div className="space-y-3 px-5 py-4">
          <div className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            {candidate.photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={candidate.photoUrl}
                alt="Existing report photo"
                className="h-20 w-20 shrink-0 rounded-lg border border-slate-200 object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[11px] text-slate-400">
                  {candidate.refCode ?? "Report"}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    STATUS_CHIP[candidate.status] ?? "bg-slate-100 text-slate-600"
                  }`}
                >
                  {STATUS_LABELS[candidate.status as keyof typeof STATUS_LABELS] ?? candidate.status}
                </span>
              </div>
              <p className="mt-0.5 line-clamp-2 text-sm font-semibold text-slate-800">
                {candidate.title}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {distanceLabel(candidate.distanceM)} · reported {fmtDate(candidate.createdAt)}
              </p>
            </div>
          </div>

          {/* why the AI thinks it's a match */}
          <div className="flex flex-wrap gap-1.5">
            {candidate.signals
              .slice()
              .sort((a, b) => b.score - a.score)
              .map((s) => (
                <span
                  key={s.signal}
                  className="rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-semibold text-primary-700"
                >
                  {signalChip(s)}
                </span>
              ))}
          </div>

          <p className="text-xs leading-relaxed text-slate-500">
            You can follow the existing report to get updates — it&apos;s
            already being worked on. If your photo shows a{" "}
            <span className="font-semibold text-slate-700">different problem</span>{" "}
            (or the same problem somewhere else), it&apos;s fine to file it.
          </p>

          <Link
            href={`/dashboard/reports/${candidate.reportId}`}
            onClick={() => setBusy(true)}
            className={`${btn.secondary} press w-full justify-center`}
          >
            <Icon name="eye" size="sm" />
            View the existing report
          </Link>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onCancel}
              className={`${btn.secondary} press justify-center`}
            >
              Go back and review
            </button>
            <button
              type="button"
              onClick={() => {
                setBusy(true);
                onContinue();
              }}
              disabled={busy}
              className={`${btn.primary} press justify-center`}
            >
              {busy ? "Submitting…" : "Submit anyway"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
