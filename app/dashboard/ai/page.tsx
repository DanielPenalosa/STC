import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, EmptyState, btn } from "@/components/ui";
import AiRowActions from "./row-actions";
import { CONFIDENCE_THRESHOLD } from "@/lib/constants";
import type { AiAnalysis, Report } from "@/lib/types";

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

  const pending = rows.filter((r) => r.status !== "reviewed");

  return (
    <div className="space-y-4">
      <PageHeader
        title="AI Analysis"
        subtitle="Review, accept or override AI recommendations"
      />
      <Card className="p-4 text-sm text-slate-600">
        AI results are <strong>recommendations only</strong>. Suggestions below{" "}
        {Math.round(CONFIDENCE_THRESHOLD * 100)}% confidence are flagged{" "}
        <span className="rounded bg-warn-100 px-1.5 py-0.5 text-xs font-semibold text-warn-700">low_confidence</span>{" "}
        and require manual review before assignment.
      </Card>

      {pending.length === 0 ? (
        <EmptyState icon="robot" title="No AI analyses pending review" hint="New analyses appear here as citizens submit photo reports." />
      ) : (
        <div className="space-y-3">
          {pending.map((row) => {
            const low = (row.confidence ?? 0) < CONFIDENCE_THRESHOLD;
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
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                        {row.status}
                      </span>
                    </div>
                    <Link href={`/reports/${row.report_id}`} className="mt-1 block font-semibold text-primary-700 hover:underline">
                      {row.reports?.title ?? "Report"}
                    </Link>
                    <p className="mt-1 text-sm text-slate-600">
                      Detected: <strong>{row.detected_issue ?? "—"}</strong>
                    </p>
                    <p className="text-xs text-slate-500">
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
