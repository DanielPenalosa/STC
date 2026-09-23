"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { acceptAiSuggestion, overrideAi } from "@/app/actions/admin";
import { btn, inputCls } from "@/components/ui";
import { Icon } from "@/components/icons";
import { CONFIDENCE_THRESHOLD } from "@/lib/constants";

type Opt = { id: string; name: string };

/**
 * Sidebar card for the AI recommendation — accept in one tap, or expand
 * to override category / department / barangay manually.
 */
export default function AiCard({
  reportId,
  categoryId,
  departmentId,
  barangayId,
  categories,
  departments,
  barangays,
  ai,
}: {
  reportId: string;
  categoryId: string | null;
  departmentId: string | null;
  barangayId: string | null;
  categories: Opt[];
  departments: Opt[];
  barangays: Opt[];
  ai: {
    detected_issue: string | null;
    suggested_category_id: string | null;
    suggested_department_id: string | null;
    suggested_barangay_id: string | null;
    confidence: number | null;
    urgency: "low" | "medium" | "high" | "critical" | null;
    reason: string | null;
    handling_level: "barangay" | "municipal" | null;
    auto_assigned: boolean | null;
    admin_decision: string | null;
    status: string;
  };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editCat, setEditCat] = useState(ai.suggested_category_id ?? categoryId ?? "");
  const [editDept, setEditDept] = useState(ai.suggested_department_id ?? departmentId ?? "");
  const [editBrgy, setEditBrgy] = useState(ai.suggested_barangay_id ?? barangayId ?? "");

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(key);
    setError(null);
    const res = await fn();
    setBusy(null);
    if (!res.ok) setError(res.error ?? "Action failed");
    else router.refresh();
  }

  const low = (ai.confidence ?? 0) < CONFIDENCE_THRESHOLD;

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <Icon name="robot" size="md" className="text-primary-600" />
          AI pre-check
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
        {error && (
          <p className="flex items-center gap-1.5 rounded-lg bg-danger-50 px-2.5 py-1.5 text-xs text-danger-600">
            <Icon name="alert" size="sm" /> {error}
          </p>
        )}

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
            {ai.auto_assigned && (
              <span className="rounded-full bg-accent-100 px-2 py-0.5 text-[11px] font-semibold text-accent-800">
                auto-assigned
              </span>
            )}
          </div>
        )}
        {ai.reason && <p className="text-xs leading-relaxed text-slate-500">{ai.reason}</p>}

        <button
          onClick={() => void run("ai-accept", () => acceptAiSuggestion(reportId))}
          disabled={busy !== null}
          className={`${btn.primary} w-full justify-center`}
        >
          {busy === "ai-accept" ? "Applying…" : "Accept suggestion"}
        </button>

        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-slate-700">
            <Icon name="edit" size="sm" />
            Override classification manually
          </summary>
          <div className="mt-2.5 grid gap-2">
            <select className={inputCls} value={editCat} onChange={(e) => setEditCat(e.target.value)}>
              <option value="">Category…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className={inputCls} value={editDept} onChange={(e) => setEditDept(e.target.value)}>
              <option value="">Department…</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select className={inputCls} value={editBrgy} onChange={(e) => setEditBrgy(e.target.value)}>
              <option value="">Barangay…</option>
              {barangays.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <button
              onClick={() =>
                void run("ai-override", () =>
                  overrideAi(reportId, {
                    categoryId: editCat || null,
                    departmentId: editDept || null,
                    barangayId: editBrgy || null,
                  })
                )
              }
              disabled={busy !== null}
              className={`${btn.secondary} w-full justify-center`}
            >
              Save classification
            </button>
          </div>
        </details>

        <p className="text-[11px] text-slate-400">
          Recommendation only — the admin decides.{low && " Below confidence threshold: review manually."}
        </p>
      </div>
    </section>
  );
}
