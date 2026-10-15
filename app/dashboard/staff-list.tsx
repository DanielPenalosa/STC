"use client";

import Link from "next/link";
import { Card, StatusBadge, PriorityBadge } from "@/components/ui";
import { Icon } from "@/components/icons";
import type { Report } from "@/lib/types";
import { useSeenUpdates } from "@/lib/report-seen";
import {
  UPDATED_WINDOW_MS,
  UPDATED_EPSILON_MS,
  timeAgo,
  UpdatedChip,
} from "@/components/updated-chip";

type Row = Report & { categories: { name: string; icon: string } | null };

/**
 * Staff unit worklist (Assigned / In Progress / Resolved) for the
 * department and barangay dashboards. The pages sort by reports.updated_at,
 * so anything the unit — or another role — just worked on surfaces at the
 * top with a cyan "UPDATED" mark. Rows link straight to the detail page,
 * where MarkReportSeen stamps the version as seen (clearing this mark) and
 * drops the viewer's notification badges.
 */
export default function StaffReportList({
  reports,
  emptyText,
}: {
  reports: Row[];
  emptyText: string;
}) {
  const seen = useSeenUpdates();
  const now = Date.now();

  if (reports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/50 px-6 py-14 text-center">
        <span className="text-success-400"><Icon name="check-circle" size="xl" /></span>
        <p className="mt-3 font-medium text-slate-700">{emptyText}</p>
      </div>
    );
  }

  /** Re-touched within the window and not yet opened at that version. */
  const isUpdated = (r: Row) => {
    const stamp = seen[r.id];
    if (stamp && new Date(stamp).getTime() >= new Date(r.updated_at).getTime())
      return false;
    return (
      new Date(r.updated_at).getTime() -
        new Date(r.created_at).getTime() >
        UPDATED_EPSILON_MS &&
      now - new Date(r.updated_at).getTime() < UPDATED_WINDOW_MS
    );
  };

  return (
    <Card className="divide-y divide-slate-100">
      {reports.map((r) => {
        const updated = isUpdated(r);
        return (
          <Link
            key={r.id}
            href={`/dashboard/reports/${r.id}`}
            className={`flex items-center justify-between gap-3 p-4 hover:bg-slate-50 ${
              updated ? "bg-accent-50/70" : ""
            }`}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {r.title}
                {updated && <UpdatedChip ago={timeAgo(r.updated_at, now)} />}
              </p>
              <p className="text-xs text-slate-400">
                {r.ref_code} · {r.categories?.name ?? "—"} ·{" "}
                {new Date(r.created_at).toLocaleDateString()}
                {updated && (
                  <span className="ml-1 font-semibold text-accent-600">
                    · updated {timeAgo(r.updated_at, now)}
                  </span>
                )}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <PriorityBadge priority={r.priority} />
              <StatusBadge status={r.status} />
            </div>
          </Link>
        );
      })}
    </Card>
  );
}
