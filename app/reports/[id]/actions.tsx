"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { compressImage } from "@/lib/compress";
import {
  updateReportStatus,
  addProgressNote,
  deleteMyReport,
  uploadEvidencePhoto,
  removeEvidencePhoto,
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

/* ------------------------------------------------------------------ */
/* Staff action card — rendered in the right rail, ABOVE the status    */
/* stepper. The completion submit is hard-gated: at least one evidence */
/* photo AND a completion note must exist before the report can move   */
/* to "Done" (pending admin verification).                             */
/* ------------------------------------------------------------------ */

export function StaffActions({
  reportId,
  status,
  role,
  evidence,
}: {
  reportId: string;
  status: ReportStatus;
  role: Role;
  /** resolution/evidence photos already uploaded (id + display url) */
  evidence: { id: string; url: string }[];
}) {
  const router = useRouter();
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

  async function uploadEvidence(file: File) {
    // compress on-device, then through the server action — service-role
    // storage write + catalog row, so evidence never silently vanishes
    setEvidenceBusy(true);
    setError(null);
    const res = await uploadEvidencePhoto(reportId, await compressImage(file));
    if (!res.ok) setError(res.error ?? "Upload failed");
    else router.refresh();
    setEvidenceBusy(false);
  }

  const isStaff = role === "department" || role === "barangay";
  if (!isStaff) return null;

  const canAccept = status === "assigned";
  const isWorking = status === "in_progress";
  const hasPhoto = evidence.length > 0;
  const hasNote = note.trim().length > 0;
  const canSubmit = isWorking && hasPhoto && hasNote;
  const missing: string[] = [];
  if (isWorking) {
    if (!hasPhoto) missing.push("a completion photo");
    if (!hasNote) missing.push("a completion note");
  }

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-slate-800">Actions</p>
      {error && (
        <p className="flex items-center gap-2 rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-600">
          <Icon name="alert" size="sm" /> {error}
        </p>
      )}

      <div className="space-y-3">
        {canAccept && (
          <Section
            icon="wrench"
            title="Accept this report"
            hint="Accepting moves it to In Progress"
            tint="bg-success-50 text-success-600"
          >
            <button
              onClick={() => void run("accept", () => updateReportStatus(reportId, "in_progress", "Accepted and started"))}
              disabled={busy !== null}
              className={`${btn.primary} w-full justify-center`}
            >
              {busy === "accept" ? "Accepting…" : "Accept & start processing"}
            </button>
          </Section>
        )}

        {isWorking && (
          <>
            <Section
              icon="camera"
              title="Completion photo"
              hint="Required — proof the issue was fixed"
              tint="bg-success-50 text-success-600"
            >
              <div className="flex items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">
                  <Icon name="camera" size="sm" />
                  {evidenceBusy ? "Uploading…" : hasPhoto ? "Add another" : "Upload photo"}
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
                <span
                  className={`inline-flex items-center gap-1 text-xs font-semibold ${
                    hasPhoto ? "text-success-600" : "text-slate-400"
                  }`}
                >
                  <Icon name={hasPhoto ? "check-circle" : "close"} size="sm" />
                  {hasPhoto ? `${evidence.length} uploaded` : "None yet"}
                </span>
              </div>

              {/* uploaded evidence — removable until submitted for verification */}
              {hasPhoto && (
                <div className="mt-2.5 grid grid-cols-3 gap-2">
                  {evidence.map((p) => (
                    <div
                      key={p.id}
                      className="group relative overflow-hidden rounded-lg border border-slate-200"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.url}
                        alt="evidence"
                        loading="lazy"
                        className="aspect-square w-full object-cover"
                      />
                      {isWorking && (
                        <button
                          onClick={() =>
                            void run(`rm-${p.id}`, () => removeEvidencePhoto(reportId, p.id))
                          }
                          disabled={busy !== null}
                          title="Remove this photo"
                          aria-label="Remove this photo"
                          className="press absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition hover:bg-danger-500 group-hover:opacity-100 focus:opacity-100"
                        >
                          <Icon name="close" size="sm" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section
              icon="clipboard"
              title="Completion note"
              hint="Required — what was done (reporter & admins see it)"
              tint="bg-slate-100 text-slate-500"
            >
              <textarea
                rows={2}
                className={`${inputCls} resize-none`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Replaced the broken streetlight fixture and tested the circuit…"
              />
            </Section>

            {/* progress notes stay available before submitting */}
            <button
              onClick={() => void run("note", () => addProgressNote(reportId, note || ""))}
              disabled={!note.trim() || busy !== null}
              className="w-full justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              {busy === "note" ? "Adding…" : "Add as progress note"}
            </button>

            <button
              onClick={() =>
                void run("done", () => updateReportStatus(reportId, "done", note.trim()))
              }
              disabled={!canSubmit || busy !== null}
              className={`${btn.primary} w-full justify-center`}
            >
              {busy === "done" ? "Submitting…" : "Submit as Done — for admin verification"}
            </button>
            {!canSubmit && (
              <p className="rounded-lg bg-warn-50 px-3 py-2 text-[11px] font-medium text-warn-700">
                To submit: upload {missing.includes("a completion photo") ? "a completion photo" : ""}
                {missing.includes("a completion photo") && missing.includes("a completion note") ? " and write " : missing.includes("a completion note") ? "Write " : ""}
                {missing.includes("a completion note") ? "a completion note" : ""}. An admin will verify before the report is resolved.
              </p>
            )}
          </>
        )}

        {status === "done" && (
          <p className="flex items-center gap-2 rounded-lg bg-primary-50 px-3 py-2.5 text-xs font-medium text-primary-700">
            <Icon name="clock" size="sm" />
            Submitted — waiting for admin verification. Photos are locked until then.
          </p>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Citizen delete — only while pending or after resolution             */
/* ------------------------------------------------------------------ */

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
  const [error, setError] = useState<string | null>(null);

  const isStaff = role === "department" || role === "barangay";
  const showCitizen = isOwner && !isStaff;
  if (!showCitizen) return null;

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
      <button onClick={() => void citizenDelete()} className={`${btn.danger} w-full justify-center`}>
        Delete my report
      </button>
    </section>
  );
}
