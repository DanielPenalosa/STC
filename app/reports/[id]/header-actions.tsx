"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { setReportStatus, setPriority, assignReport } from "@/app/actions/admin";
import { btn } from "@/components/ui";
import { Icon } from "@/components/icons";
import type { ReportStatus, Priority } from "@/lib/constants";

type Opt = { id: string; name: string };

/** Small dropdown menu used for Assign and Priority in the header. */
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
 * Buttons appear only when meaningful:
 *  - Verify / Reject: while the report is submitted or under review
 *  - Assign: ONLY before an assignment exists — a routed report cannot
 *    be re-routed from here (keeps the accountability chain clean)
 *  - Priority: any time
 */
export default function HeaderActions({
  reportId,
  status,
  priority,
  departments,
  barangays,
  hasAssignment,
}: {
  reportId: string;
  status: ReportStatus;
  priority: Priority;
  departments: Opt[];
  barangays: Opt[];
  hasAssignment: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assignType, setAssignType] = useState<"department" | "barangay">("department");
  const [target, setTarget] = useState("");

  const opts = assignType === "department" ? departments : barangays;
  const canTriage = status === "submitted" || status === "under_review";

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

      {/* — Assign (only before routing) — */}
      {!hasAssignment && canTriage && (
        <Menu label="Assign" icon="clipboard" tone="primary">
          {(close) => (
            <div className="space-y-2">
              <div className="flex gap-1.5">
                {(["department", "barangay"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setAssignType(t);
                      setTarget("");
                    }}
                    className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold capitalize transition ${
                      assignType === t
                        ? "bg-primary-50 text-primary-700 ring-1 ring-primary-200"
                        : "bg-slate-50 text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <select
                className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                <option value="">— Select {assignType} —</option>
                {opts.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
              <button
                onClick={() => {
                  close();
                  void run("assign", () => assignReport(reportId, assignType, target));
                }}
                disabled={!target || busy !== null}
                className={`${btn.primary} w-full justify-center`}
              >
                {busy === "assign" ? "Assigning…" : "Assign & notify"}
              </button>
            </div>
          )}
        </Menu>
      )}

      {/* — Priority — */}
      <Menu label="Priority" icon="alert" tone="secondary">
        {(close) => (
          <div className="space-y-0.5">
            {(["low", "medium", "high"] as Priority[]).map((p) => (
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
                <span className="capitalize">{p}</span>
                {p === priority && <Icon name="check-circle" size="sm" />}
              </button>
            ))}
          </div>
        )}
      </Menu>

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

      {/* — Reject — */}
      {canTriage && (
        <button
          onClick={() => {
            if (!confirm("Reject and close this report? The reporter will be notified.")) return;
            void run("reject", () => setReportStatus(reportId, "closed", "Rejected / closed by admin"));
          }}
          disabled={busy !== null}
          className={btn.danger}
        >
          Reject
        </button>
      )}
    </div>
  );
}
