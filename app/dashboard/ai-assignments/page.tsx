import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { CONFIDENCE_THRESHOLD } from "@/lib/constants";
import type { AiAnalysis, Report } from "@/lib/types";

const URGENCY_STYLES: Record<string, string> = {
  critical: "bg-danger-600 text-white",
  high: "bg-danger-100 text-danger-700",
  medium: "bg-warn-100 text-warn-700",
  low: "bg-slate-100 text-slate-600",
};

/**
 * AI Auto-Assignment log — a transparency feed of every routing decision
 * the AI made on its own. The admin monitors here; there is nothing to
 * accept, override, or assign. That's the point.
 */
export default async function AiAutoAssignmentPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ai_analysis")
    .select(
      `*,
       reports(id, ref_code, title, status, categories(name, icon), barangays(name), departments(name))`
    )
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = (data as unknown as (AiAnalysis & {
    reports: Report | null;
  })[]) ?? [];

  // resolve the CURRENT assignment for every report so admins see exactly
  // where each one is routed — always the AI's doing
  const reportIds = Array.from(
    new Set(rows.map((r) => r.report_id).filter((v): v is string => Boolean(v)))
  );
  const { data: assignRows } = reportIds.length
    ? await supabase
        .from("assignments")
        .select(
          `report_id, assigned_type, department_id, barangay_id, assigned_by, accepted_at,
           departments(name), barangays(name)`
        )
        .in("report_id", reportIds)
        .order("created_at", { ascending: true })
    : { data: [] as Record<string, unknown>[] | null };
  const assignedByReport = new Map<
    string,
    { label: string; accepted: boolean }
  >();
  for (const a of (assignRows as unknown as
    | {
        report_id: string;
        assigned_type: "department" | "barangay";
        department_id: string | null;
        barangay_id: string | null;
        assigned_by: string | null;
        accepted_at: string | null;
        departments: { name: string } | null;
        barangays: { name: string } | null;
      }[]
    | null) ?? []) {
    // last assignment wins
    assignedByReport.set(a.report_id, {
      label:
        a.assigned_type === "department"
          ? a.departments?.name ?? "a department"
          : a.barangays?.name ?? "a barangay",
      accepted: Boolean(a.accepted_at),
    });
  }

  const pending = rows.filter((r) => r.status !== "reviewed");
  const autoAssigned = rows.filter((r) => r.auto_assigned).length;
  const needingAttention = rows.filter((r) => !r.auto_assigned).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="AI Auto-Assignment"
        subtitle="Every report is classified and routed automatically — this log shows how"
      />
      <Card className="p-4 text-sm text-slate-600">
        Reports are <strong>assigned automatically the moment they are submitted</strong> — the
        AI identifies the issue, picks the responsible department or barangay, and notifies the
        unit instantly. Your job here is oversight, not routing: check the decisions, and use
        <strong> Re-run AI check</strong> on a report if an analysis failed.{" "}
        {Math.round(CONFIDENCE_THRESHOLD * 100)}%+ confidence is normally required for routing;
        the pipeline falls back to the best available unit whenever the signal is weaker.{" "}
        {autoAssigned > 0 && (
          <>
            <strong>{autoAssigned}</strong> report{autoAssigned === 1 ? "" : "s"} auto-assigned
            so far.{" "}
          </>
        )}
        {needingAttention > 0 && (
          <span className="text-warn-700">
            {needingAttention} could not be routed and may need a re-run.
          </span>
        )}
      </Card>

      {pending.length === 0 ? (
        <EmptyState icon="robot" title="No AI decisions yet" hint="Every citizen submission produces an entry here automatically." />
      ) : (
        <div className="space-y-3">
          {pending.map((row) => {
            const low = (row.confidence ?? 0) < CONFIDENCE_THRESHOLD;
            const assigned = row.report_id
              ? assignedByReport.get(row.report_id) ?? null
              : null;
            return (
              <Card key={row.id} className={`p-4 ${!assigned ? "border-warn-300" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-slate-400">{row.reports?.ref_code}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        low ? "bg-warn-100 text-warn-700" : "bg-success-100 text-success-700"
                      }`}>
                        {Math.round((row.confidence ?? 0) * 100)}% confidence
                      </span>
                      {row.urgency && (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${URGENCY_STYLES[row.urgency] ?? "bg-slate-100 text-slate-600"}`}>
                          {row.urgency.toUpperCase()}
                        </span>
                      )}
                      {row.handling_level && (
                        <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-700">
                          {row.handling_level === "municipal" ? "Municipal" : "Barangay"} level
                        </span>
                      )}
                      {row.auto_assigned ? (
                        <span className="rounded-full bg-success-50 px-2 py-0.5 text-xs font-semibold text-success-700">
                          ✓ auto-assigned
                        </span>
                      ) : (
                        <span className="rounded-full bg-warn-100 px-2 py-0.5 text-xs font-semibold text-warn-700">
                          not routed
                        </span>
                      )}
                    </div>
                    <Link href={`/dashboard/reports/${row.report_id}`} className="mt-1 block font-semibold text-primary-700 hover:underline">
                      {row.reports?.title ?? "Report"}
                    </Link>
                    <p className="mt-1 text-sm text-slate-600">
                      Detected: <strong>{row.detected_issue ?? "—"}</strong>
                    </p>
                    {row.reason && (
                      <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{row.reason}</p>
                    )}
                    {assigned ? (
                      <p className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg bg-primary-50 px-2.5 py-1.5 text-xs font-semibold text-primary-700">
                        <Icon name="clipboard" size="sm" />
                        Assigned to {assigned.label}
                        {assigned.accepted
                          ? " — the unit has accepted and is working on it."
                          : " — waiting for the unit to accept."}
                      </p>
                    ) : (
                      <p className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg bg-warn-50 px-2.5 py-1.5 text-xs font-semibold text-warn-700">
                        <Icon name="alert" size="sm" />
                        No responsible unit could be resolved — open the report and use
                        &ldquo;Re-run AI check&rdquo;.
                      </p>
                    )}
                    <p className="mt-1 text-xs text-slate-500">
                      {row.reports?.categories?.name ?? "no category"} · {row.reports?.departments?.name ?? "no department"} · {row.reports?.barangays?.name ?? "no barangay"} · model {row.model_used}
                    </p>
                  </div>
                  <Link
                    href={`/dashboard/reports/${row.report_id}`}
                    className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50"
                  >
                    View report
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
