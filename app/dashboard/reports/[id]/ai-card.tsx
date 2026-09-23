"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { rerunAiAnalysis } from "@/app/actions/admin";
import { btn } from "@/components/ui";
import { Icon } from "@/components/icons";
import { CONFIDENCE_THRESHOLD } from "@/lib/constants";

/**
 * Sidebar card for the AI's automatic classification + routing decision.
 * READ-ONLY by design: the AI assigns the unit the moment the report is
 * submitted, so there is nothing to "accept". The only admin action is
 * re-running the analysis if it failed.
 */
export default function AiCard({
  reportId,
  ai,
}: {
  reportId: string;
  ai: {
    detected_issue: string | null;
    confidence: number | null;
    urgency: "low" | "medium" | "high" | "critical" | null;
    reason: string | null;
    handling_level: "barangay" | "municipal" | null;
    auto_assigned: boolean | null;
    status: string;
  };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function rerun() {
    setBusy(true);
    setNote(null);
    const res = await rerunAiAnalysis(reportId);
    setBusy(false);
    // the pipeline is async — tell the admin to check back in a moment
    if (res.ok) setNote("Re-analysis started — refresh in a few seconds.");
    else setNote(res.error ?? "Could not start the re-analysis.");
  }

  const low = (ai.confidence ?? 0) < CONFIDENCE_THRESHOLD;

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <Icon name="robot" size="md" className="text-primary-600" />
          AI Auto-Assignment
        </p>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
            low ? "bg-warn-50 text-warn-700" : "bg-primary-50 text-primary-700"
          }`}
        >
          {Math.round((ai.confidence ?? 0) * 100)}%
        </span>
      </div>

      <div className="space-y-2.5 px-4 py-3 text-sm text-slate-600">
        <p>
          Detected: <strong>{ai.detected_issue ?? "—"}</strong>
        </p>

        {(ai.urgency || ai.handling_level) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {ai.urgency && (
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  ai.urgency === "critical"
                    ? "bg-danger-600 text-white"
                    : ai.urgency === "high"
                      ? "bg-danger-100 text-danger-700"
                      : ai.urgency === "medium"
                        ? "bg-warn-100 text-warn-700"
                        : "bg-slate-100 text-slate-600"
                }`}
              >
                Urgency: {ai.urgency}
              </span>
            )}
            {ai.handling_level && (
              <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-semibold text-primary-700">
                {ai.handling_level === "municipal" ? "Municipal" : "Barangay"} level
              </span>
            )}
            {ai.auto_assigned ? (
              <span className="rounded-full bg-success-50 px-2 py-0.5 text-[11px] font-semibold text-success-700">
                ✓ Auto-assigned
              </span>
            ) : (
              <span className="rounded-full bg-warn-50 px-2 py-0.5 text-[11px] font-semibold text-warn-700">
                Not assigned — needs re-run
              </span>
            )}
          </div>
        )}
        {ai.reason && <p className="text-xs leading-relaxed text-slate-500">{ai.reason}</p>}

        {note && (
          <p className="rounded-lg bg-primary-50 px-2.5 py-1.5 text-xs text-primary-700">{note}</p>
        )}

        {!ai.auto_assigned && (
          <button onClick={rerun} disabled={busy} className={`${btn.primary} w-full justify-center`}>
            {busy ? "Re-analyzing…" : "Re-run AI check"}
          </button>
        )}

        <p className="text-[11px] leading-relaxed text-slate-400">
          This classification and its routing were decided automatically by the AI when the report
          was submitted — no manual assignment needed. The responsible unit was notified instantly.
        </p>
      </div>
    </section>
  );
}
