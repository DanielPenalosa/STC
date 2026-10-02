"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { rerunAiAnalysis } from "@/app/actions/admin";
import { Icon } from "@/components/icons";

/**
 * One-click repair for a report the pipeline could not route at submission
 * time (e.g. it was submitted before the after() fix deployed, or the
 * analysis died mid-flight). Re-runs the pipeline synchronously — the
 * assignment lands before the refresh, so the card flips to "auto-assigned".
 */
export default function RouteNowButton({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function route() {
    setBusy(true);
    setNote(null);
    const res = await rerunAiAnalysis(reportId);
    if (res.ok) {
      router.refresh();
    } else {
      setNote(res.error ?? "Could not re-run the routing.");
      setBusy(false);
    }
  }

  if (note) {
    return (
      <span className="shrink-0 rounded-lg bg-warn-50 px-3 py-1.5 text-xs font-semibold text-warn-700">
        {note}
      </span>
    );
  }

  return (
    <button
      onClick={route}
      disabled={busy}
      className="press shrink-0 rounded-lg border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-bold text-primary-700 shadow-sm transition hover:bg-primary-100 disabled:opacity-60"
    >
      <span className="flex items-center gap-1.5">
        <Icon name="robot" size="sm" className={busy ? "animate-pulse" : ""} />
        {busy ? "Routing…" : "Route now"}
      </span>
    </button>
  );
}
