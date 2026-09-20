"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/compress";
import {
  updateReportStatus,
  addProgressNote,
  deleteMyReport,
  uploadEvidencePhoto,
} from "@/app/actions/reports";
import { btn, inputCls } from "@/components/ui";
import { Icon } from "@/components/icons";
import type { Role, ReportStatus } from "@/lib/constants";

/** A labeled action group — keeps the card scannable. */
function Section({
  icon,
  title,
  hint,
  children,
  tint = "bg-slate-50 text-slate-500",
}: {
  icon: "clipboard" | "wrench" | "camera";
  title: string;
  hint?: string;
  children: React.ReactNode;
  tint?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-3.5">
      <div className="mb-2.5 flex items-center gap-2.5">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tint}`}>
          <Icon name={icon} size="sm" />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-slate-700">{title}</p>
          {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

/**
 * Inline action sections for department/barangay staff (work tools) and
 * the reporting citizen (delete while fresh).
 *
 * All admin controls live elsewhere: triage/priority/assign in the
 * header action bar, AI accept/override in the sidebar AI card.
 */
export default function ReportActions({
  reportId,
  status,
  role,
  isOwner,
}: {
  reportId: string;
  status: ReportStatus;
  role: Role;
  isOwner: boolean;
}) {
  const router = useRouter();
  const supabase = createClient(); // still used for browser auth checks
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [evidenceBusy, setEvidenceBusy] = useState(false);

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(key);
    setError(null);
    const res = await fn();
    setBusy(null);
    if (!res.ok) setError(res.error ?? "Action failed");
    else router.refresh();
  }

  const isStaff = role === "department" || role === "barangay";
  const canAccept = isStaff && status === "assigned";
  const canResolve = isStaff && status === "in_progress";
  const showCitizen = isOwner && status === "submitted";

  if (!isStaff && !showCitizen) return null;

  async function uploadEvidence(file: File) {
    // compress on-device, then through the server action — service-role
    // storage write + catalog row, so evidence never silently vanishes on
    // drifted DB policies
    setEvidenceBusy(true);
    setError(null);
    const res = await uploadEvidencePhoto(reportId, await compressImage(file));
    if (!res.ok) setError(res.error ?? "Upload failed");
    else router.refresh();
    setEvidenceBusy(false);
  }

  async function citizenDelete() {
    if (!confirm("Delete this report? This cannot be undone.")) return;
    const res = await deleteMyReport(reportId);
    if (res.ok) router.push("/dashboard/my-reports");
    else setError(res.error ?? "Delete failed");
  }

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-slate-800">Actions</p>
      {error && (
        <p className="flex items-center gap-2 rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-600">
          <Icon name="alert" size="sm" /> {error}
        </p>
      )}

      {isStaff && (
        <div className="space-y-3">
          <Section
            icon="wrench"
            title="Work this report"
            hint={canAccept ? "Accepting moves it to In Progress" : canResolve ? "Add evidence, then mark resolved" : "Updates appear in the activity log"}
            tint="bg-success-50 text-success-600"
          >
            <div className="flex flex-wrap gap-2">
              {canAccept && (
                <button onClick={() => void run("accept", () => updateReportStatus(reportId, "in_progress", "Accepted and started"))} disabled={busy !== null} className={btn.primary}>
                  Accept &amp; start processing
                </button>
              )}
              {canResolve && (
                <button onClick={() => void run("resolve", () => updateReportStatus(reportId, "resolved", note || "Marked resolved"))} disabled={busy !== null} className={btn.primary}>
                  Mark resolved
                </button>
              )}
            </div>
          </Section>

          <Section
            icon="clipboard"
            title="Progress note"
            hint="Visible to the reporter and admins"
            tint="bg-slate-100 text-slate-500"
          >
            <textarea rows={2} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Crew dispatched, materials requested…" />
            <button
              onClick={() => void run("note", () => addProgressNote(reportId, note))}
              disabled={!note.trim() || busy !== null}
              className={`${btn.secondary} mt-2`}
            >
              Add note
            </button>
          </Section>

          <Section
            icon="camera"
            title="Resolution evidence"
            hint="Photo proving the issue was fixed"
            tint="bg-success-50 text-success-600"
          >
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">
              <Icon name="camera" size="sm" />
              {evidenceBusy ? "Uploading…" : "Upload photo"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadEvidence(f);
                }}
              />
            </label>
          </Section>
        </div>
      )}

      {showCitizen && (
        <button onClick={() => void citizenDelete()} className={btn.danger}>
          Delete my report
        </button>
      )}
    </section>
  );
}
