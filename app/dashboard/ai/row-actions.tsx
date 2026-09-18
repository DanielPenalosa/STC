"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { acceptAiSuggestion, markAiReviewed } from "@/app/actions/admin";
import { btn } from "@/components/ui";

export default function AiRowActions({
  reportId,
  confidence,
}: {
  reportId: string;
  confidence: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res.ok) router.refresh();
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <Link href={`/reports/${reportId}`} className="text-xs font-semibold text-primary-600 hover:underline">
        Open
      </Link>
      <button
        onClick={() => void act(() => acceptAiSuggestion(reportId))}
        disabled={busy}
        className={btn.primary}
      >
        Accept
      </button>
      <button
        onClick={() => void act(() => markAiReviewed(reportId))}
        disabled={busy}
        className={btn.secondary}
      >
        Mark reviewed
      </button>
    </div>
  );
}
