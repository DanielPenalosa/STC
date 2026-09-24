"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { setReportStatus, setPriority, rejectReport } from "@/app/actions/admin";
import { btn } from "@/components/ui";
import { Icon } from "@/components/icons";
import { PRIORITY_LABELS } from "@/lib/constants";
import type { ReportStatus, Priority } from "@/lib/constants";

type Opt = { id: string; name: string };

function Menu({
  label,
  icon,
  tone,
  children,
  align = "right",
}: {
  label: string;
  icon: "clipboard" | "alert";
  tone: "primary" | "danger" | "secondary";
  children: (close: () => void) => React.ReactNode;
  align?: "right" | "left";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toneCls =
    tone === "primary"
      ? btn.primary
      : tone === "danger"
      ? btn.danger
      : btn.secondary;

  return (
    <div className="relative" ref={ref}>
      <button className={toneCls} onClick={() => setOpen((v) => !v)}>
        <Icon name={icon} size="sm" />
        {label}
        <Icon name="chevron-down" size="sm" className="opacity-70" />
      </button>
      {open && (
        <div
          className={`absolute z-30 mt-1.5 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-lg ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/**
 * Admin action bar, pinned to the top-right of the report header —
 * always findable without scrolling (like the reference design).
 *
 * The AI already routed this report automatically — the admin never
 * assigns units. Buttons appear only when meaningful:
 *  - Verify / Reject: while the report is submitted or under review
 *  - Priority: after verification (the AI's auto-assigned priority can be tuned)
 *  - Already-routed reports show the waiting note instead of an Assign menu
 */
export default function HeaderActions({
  reportId,
  status,
  priority,
  departments,
  barangays,
  hasAssignment,
  assignedToName,
}: {
  reportId: string;
  status: ReportStatus;
  priority: Priority;
  departments: Opt[];
  barangays: Opt[];
  hasAssignment: boolean;
  /** display name of the assigned unit (for the waiting note) */
  assignedToName?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  /* strict lifecycle gating:
     - submitted/under_review → Verify + Reject ONLY
     - verified/assigned → Priority + waiting note (the AI does the routing) */
  const canTriage = status === "submitted" || status === "under_review";
  const canAssign = status === "verified" || status === "assigned";

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(key);
    setError(null);
    const res = await fn();
    setBusy(null);
    if (res.ok) router.refresh();
    else setError(res.error ?? "Action failed");
  }

  return (
    <div className="relative flex flex-wrap items-center justify-end gap-2">
      {error && (
        <p className="absolute right-0 top-full z-20 mt-1 max-w-xs rounded-lg bg-danger-50 px-3 py-1.5 text-xs text-danger-600 shadow">
          {error}
        </p>
      )}

      {/* — Priority (set by the AI from the photo analysis; admin may tune) — */}
      {canAssign && (
      <Menu label="Priority" icon="alert" tone="secondary">
        {(close) => (
          <div className="space-y-0.5">
            {([1, 2, 3, 4, 5] as Priority[]).map((p) => (
              <button
                key={p}
                onClick={() => {
                  close();
                  if (p !== priority) void run(`pri-${p}`, () => setPriority(reportId, p));
                }}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
                  p === priority
                    ? "bg-primary-50 font-semibold text-primary-700"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span>
                  {PRIORITY_LABELS[p]} <span className="text-xs text-slate-400">· P{p}</span>
                </span>
                {p === priority && <Icon name="check-circle" size="sm" />}
              </button>
            ))}
          </div>
        )}
      </Menu>
      )}

      {/* — assigned reminder note (replaces the old manual-assign menu) — */}
      {hasAssignment && status !== "in_progress" && (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary-50 px-3 py-2 text-xs font-medium text-primary-700">
          <Icon name="clock" size="sm" />
          Assigned to {assignedToName ?? "a unit"} — please wait for them to accept and work on it.
        </span>
      )}

      {/* — Verify — */}
      {canTriage && (
        <button
          onClick={() => void run("verify", () => setReportStatus(reportId, "verified", "Verified by admin"))}
          disabled={busy !== null}
          className={btn.primary}
        >
          {busy === "verify" ? "Verifying…" : "Verify"}
        </button>
      )}

      {/* — Reject (ends the lifecycle during review) — */}
      {canTriage && (
        <Menu label="Reject" icon="alert" tone="danger">
          {(close) => (
            <div className="space-y-2">
              <p className="px-1 text-[11px] leading-snug text-slate-500">
                The reporter is notified with your reason. This ends the report.
              </p>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={2}
                maxLength={300}
                placeholder="Reason (required) — e.g. duplicate of RPT-…"
                className="w-full resize-none rounded-lg border border-slate-300 px-2.5 py-2 text-sm outline-none focus:border-danger-400 focus:ring-2 focus:ring-danger-50"
              />
              <button
                onClick={() => {
                  close();
                  void run("reject", () => rejectReport(reportId, rejectReason));
                }}
                disabled={!rejectReason.trim() || busy !== null}
                className={`${btn.danger} w-full justify-center`}
              >
                {busy === "reject" ? "Rejecting…" : "Confirm reject"}
              </button>
            </div>
          )}
        </Menu>
      )}

    </div>
  );
}
