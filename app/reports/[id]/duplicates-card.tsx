"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { dismissDuplicateFlag, markAsDuplicate } from "@/app/actions/admin";
import { Icon } from "@/components/icons";

type Evidence = {
  id: string;
  similar_report_id: string;
  signal: "photo" | "text" | "location" | "category";
  score: number;
  details: Record<string, unknown>;
};

const SIGNAL_LABELS: Record<Evidence["signal"], string> = {
  photo: "Identical photo",
  text: "Similar description",
  location: "Same spot",
  category: "Same category",
};

function detailText(signal: Evidence["signal"], details: Record<string, unknown>): string | null {
  switch (signal) {
    case "photo":
      return `${details.shared_hashes ?? 0} matching photo${Number(details.shared_hashes ?? 0) === 1 ? "" : "s"}`;
    case "location":
      return details.distance_m != null ? `${details.distance_m} m apart` : null;
    case "text":
      return Array.isArray(details.shared_tokens) && details.shared_tokens.length
        ? `shared: ${(details.shared_tokens as string[]).slice(0, 4).join(", ")}`
        : null;
    default:
      return null;
  }
}

/**
 * Admin card shown when a report is flagged as a possible duplicate.
 * Lists the evidence, links the suspected original, and offers
 * Dismiss (distinct issue) / Mark duplicate (close the copy).
 */
export default function DuplicatesCard({
  reportId,
  evidence,
  similar,
}: {
  reportId: string;
  evidence: Evidence[];
  similar: Record<
    string,
    { ref_code: string; title: string; status: string }
  >;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // group evidence by the suspected original
  const groups = new Map<string, Evidence[]>();
  for (const e of evidence) {
    const list = groups.get(e.similar_report_id) ?? [];
    list.push(e);
    groups.set(e.similar_report_id, list);
  }

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) setError(res.error ?? "Action failed");
    else router.refresh();
  }

  if (!groups.size) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-warn-300 bg-warn-50/60 shadow-sm">
      <div className="flex items-center gap-2 border-b border-warn-200 px-4 py-3 sm:px-5">
        <Icon name="alert" size="md" className="text-warn-600" />
        <p className="text-sm font-bold text-warn-800">
          Possible duplicate
        </p>
        <span className="ml-auto text-[11px] font-medium text-warn-600">
          AI-similarity flagged this report
        </span>
      </div>

      <div className="divide-y divide-warn-100">
        {Array.from(groups.entries()).map(([otherId, evs]) => {
          const other = similar[otherId];
          const top = Math.max(...evs.map((e) => e.score));
          return (
            <div key={otherId} className="px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/reports/${otherId}`}
                  className="font-mono text-xs font-bold text-primary-600 hover:underline"
                >
                  {other?.ref_code ?? "Report"}
                </Link>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700">
                  {other?.title ?? "(deleted)"}
                </span>
                <span className="rounded-full bg-warn-100 px-2 py-0.5 text-[11px] font-bold text-warn-700">
                  {Math.round(top * 100)}% match
                </span>
              </div>
              <ul className="mt-2 space-y-1">
                {evs.map((e) => (
                  <li key={e.id} className="flex items-center gap-1.5 text-xs text-slate-600">
                    <Icon name="check-circle" size="sm" className="shrink-0 text-warn-500" />
                    <span className="font-semibold">{SIGNAL_LABELS[e.signal]}</span>
                    {detailText(e.signal, e.details) && (
                      <span className="text-slate-400">· {detailText(e.signal, e.details)}</span>
                    )}
                  </li>
                ))}
              </ul>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button
                  disabled={busy}
                  onClick={() => void run(() => dismissDuplicateFlag(reportId))}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  <Icon name="check-circle" size="sm" /> Not a duplicate
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    if (confirm(`Close this report as a duplicate of ${other?.ref_code ?? "the original"}? The reporter keeps visibility of the original.`))
                      void run(() => markAsDuplicate(reportId, otherId));
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-warn-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-warn-700 disabled:opacity-50"
                >
                  <Icon name="close" size="sm" /> Mark as duplicate
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <p className="border-t border-warn-200 px-4 py-2 text-xs text-danger-600 sm:px-5">{error}</p>
      )}
    </section>
  );
}
