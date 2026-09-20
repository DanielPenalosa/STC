"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { addProgressNote } from "@/app/actions/reports";
import { Icon } from "@/components/icons";
import { btn } from "@/components/ui";
/**
 * Notes & Remarks — staff-only quick note card at the bottom of the detail
 * page (mirrors the reference layout). Notes land in the activity log via
 * the existing addProgressNote action.
 */
export default function NotesCard({
  reportId,
  canNote,
}: {
  reportId: string;
  canNote: boolean;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (!canNote) return null;

  async function submit() {
    if (!note.trim()) return;
    setBusy(true);
    setError(null);
    const res = await addProgressNote(reportId, note);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Failed to add note");
      return;
    }
    setNote("");
    router.refresh();
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
        <Icon name="clipboard" size="md" className="text-primary-600" />
        Notes / Remarks
      </p>
      {error && (
        <p className="mt-2 flex items-center gap-2 rounded-lg bg-danger-50 px-3 py-2 text-xs text-danger-600">
          <Icon name="alert" size="sm" /> {error}
        </p>
      )}
      <div className="mt-3 flex items-end gap-2">
        <textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a note or remark…"
          className="min-h-[42px] w-full resize-y rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition placeholder:text-slate-300 focus:border-primary-400 focus:ring-4 focus:ring-primary-50"
        />
        <button
          onClick={() => void submit()}
          disabled={!note.trim() || busy}
          className={`${btn.primary} shrink-0`}
        >
          {busy ? "Adding…" : "Add Note"}
        </button>
      </div>
    </section>
  );
}
