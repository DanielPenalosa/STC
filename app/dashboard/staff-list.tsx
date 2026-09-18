import Link from "next/link";
import { Card, EmptyState, StatusBadge, PriorityBadge } from "@/components/ui";
import { Icon } from "@/components/icons";
import type { Report } from "@/lib/types";

type Row = Report & { categories: { name: string; icon: string } | null };

export default function StaffReportList({
  reports,
  emptyText,
}: {
  reports: Row[];
  emptyText: string;
}) {
  if (reports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/50 px-6 py-14 text-center">
        <span className="text-success-400"><Icon name="check-circle" size="xl" /></span>
        <p className="mt-3 font-medium text-slate-700">{emptyText}</p>
      </div>
    );
  }
  return (
    <Card className="divide-y divide-slate-100">
      {reports.map((r) => (
        <Link key={r.id} href={`/reports/${r.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-slate-50">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{r.title}</p>
            <p className="text-xs text-slate-400">
              {r.ref_code} · {r.categories?.name ?? "—"} · {new Date(r.created_at).toLocaleDateString()}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <PriorityBadge priority={r.priority} />
            <StatusBadge status={r.status} />
          </div>
        </Link>
      ))}
    </Card>
  );
}
