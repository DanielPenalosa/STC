import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import AiRowActions from "./row-actions";
import { CONFIDENCE_THRESHOLD } from "@/lib/constants";
import type { AiAnalysis, Report } from "@/lib/types";

const URGENCY_STYLES: Record<string, string> = {
  critical: "bg-danger-600 text-white",
  high: "bg-danger-100 text-danger-700",
  medium: "bg-warn-100 text-warn-700",
  low: "bg-slate-100 text-slate-600",
};

export default async function AiAnalysisPage() {
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

  // resolve the CURRENT assignment for every queued report so admins see
  // exactly where each one is already routed (AI or human — indistinguishable
  // by design: the truth of "who owns it" matters, not who wrote it)
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
    { label: string; accepted: boolean; auto: boolean }
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
      auto: a.assigned_by == null,
    });
  }

  const pending = rows.filter((r) => r.status !== "reviewed");
  const autoAssigned = rows.filter((r) => r.auto_assigned).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="AI Analysis"
        subtitle="Review, accept or override AI recommendations"
      />
      <Card className="p-4 text-sm text-slate-600">
        AI results are <strong>recommendations only</strong> — produced by a
        100% free, fully local model (CLIP zero-shot, no external API).
        Suggestions below{" "}
        {Math.round(CONFIDENCE_THRESHOLD * 100)}% confidence are flagged{" "}
        <span className="rounded bg-warn-100 px-1.5 py-0.5 text-xs font-semibold text-warn-700">low_confidence</span>{" "}
        and are never auto-assigned. {autoAssigned > 0 && (
          <>Currently <strong>{autoAssigned}</strong> recommendation{autoAssigned === 1 ? "" : "s"} auto-assigned pending your review.</>
        )}
      </Card>

      {pending.length === 0 ? (
        <EmptyState icon="robot" title="No AI analyses pending review" hint="New analyses appear here as citizens submit photo reports." />
      ) : (
        <div className="space-y-3">
          {pending.map((row) => {
            const low = (row.confidence ?? 0) < CONFIDENCE_THRESHOLD;
            const assigned = row.report_id
              ? assignedByReport.get(row.report_id) ?? null
              : null;
            return (
              <Card key={row.id} className={`p-4 ${low ? "border-warn-300" : ""}`}>
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
                      {row.auto_assigned && (
                        <span className="rounded-full bg-accent-100 px-2 py-0.5 text-xs font-semibold text-accent-800">
                          auto-assigned
                        </span>
                      )}
                      {row.status === "low_confidence" && (
                        <span className="rounded-full bg-warn-100 px-2 py-0.5 text-xs font-semibold text-warn-700">
                          needs review
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
                    {assigned && (
                      <p className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg bg-primary-50 px-2.5 py-1.5 text-xs font-semibold text-primary-700">
                        <Icon name="clipboard" size="sm" />
                        Already assigned to {assigned.label}
                        {assigned.accepted
                          ? " — the unit has accepted and is working on it."
                          : " — waiting for the unit to accept. No action needed unless you want to re-route."}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-slate-500">
                      Suggests: {row.reports?.categories?.name ?? "no category"} · {row.reports?.departments?.name ?? "no department"} · {row.reports?.barangays?.name ?? "no barangay"} · model {row.model_used}
                    </p>
                  </div>
                  <AiRowActions reportId={row.report_id!} confidence={row.confidence ?? 0} />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
