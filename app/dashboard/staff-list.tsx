"use client";

import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { PriorityBadge } from "@/components/ui";
import { publicPhotoUrl } from "@/lib/photo";
import type { Report } from "@/lib/types";
import { useSeenUpdates } from "@/lib/report-seen";
import {
  UPDATED_WINDOW_MS,
  UPDATED_EPSILON_MS,
  timeAgo,
  UpdatedChip,
} from "@/components/updated-chip";

type Row = Report & {
  categories: { name: string; icon: string; color: string } | null;
  barangays: { name: string } | null;
  report_photos: { storage_path: string; kind: string }[];
};

/**
 * The department / barangay assignment inbox. Each row is a report the admin
 * routed to the unit that nobody has accepted yet (status "assigned"); opening
 * it is how the unit reviews and accepts. The page sorts by reports.updated_at,
 * so anything re-routed or re-touched surfaces at the top with the cyan
 * "UPDATED" mark, and MarkReportSeen clears that mark once it is opened.
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
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success-50 text-success-500">
          <Icon name="check-circle" size="xl" />
        </span>
        <p className="mt-3 font-medium text-slate-700">{emptyText}</p>
        <p className="mt-1 text-sm text-slate-500">
          New assignments from the administrator will appear here.
        </p>
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

  const railColor = (priority: number) =>
    priority >= 4 ? "bg-danger-500" : priority === 3 ? "bg-warn-400" : "bg-primary-500";

  return (
    <ul className="space-y-2.5">
      {reports.map((r) => {
        const updated = isUpdated(r);
        const photo =
          r.report_photos?.find((p) => p.kind !== "resolution") ?? r.report_photos?.[0];
        const place = r.address_text || r.barangays?.name || null;
        return (
          <li key={r.id}>
            <Link
              href={`/dashboard/reports/${r.id}`}
              className={`hover-lift group relative flex gap-3 overflow-hidden rounded-xl border p-3.5 shadow-sm transition sm:gap-4 sm:p-4 ${
                updated
                  ? "border-accent-200 bg-accent-50/60"
                  : "border-slate-200 bg-white hover:border-primary-200"
              }`}
            >
              {/* priority rail */}
              <span
                aria-hidden
                className={`absolute inset-y-0 left-0 w-1 ${railColor(r.priority)}`}
              />

              {/* photo thumbnail, or the category glyph when there is none */}
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={publicPhotoUrl(photo.storage_path, 160)}
                  alt=""
                  loading="lazy"
                  className="h-16 w-16 shrink-0 rounded-lg border border-slate-200 object-cover sm:h-[72px] sm:w-[72px]"
                />
              ) : (
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-300 sm:h-[72px] sm:w-[72px]">
                  <Icon name={(r.categories?.icon as IconName) ?? "camera"} size="lg" />
                </span>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[11px] font-semibold tracking-tight text-slate-400">
                    {r.ref_code}
                  </span>
                  <PriorityBadge priority={r.priority} />
                  {updated && <UpdatedChip ago={timeAgo(r.updated_at, now)} />}
                </div>
                <p className="mt-1 truncate text-sm font-bold text-slate-800">{r.title}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <Icon name="tag" size="sm" className="text-slate-300" />
                    {r.categories?.name ?? "Uncategorized"}
                  </span>
                  {place && (
                    <span className="inline-flex min-w-0 items-center gap-1">
                      <Icon name="pin" size="sm" className="shrink-0 text-slate-300" />
                      <span className="truncate">{place}</span>
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <Icon name="clock" size="sm" className="text-slate-300" />
                    Waiting {timeAgo(r.created_at, now).replace(" ago", "")}
                  </span>
                </p>
              </div>

              <div className="flex shrink-0 flex-col items-end justify-center gap-1">
                <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1 text-[11px] font-bold text-primary-700 transition group-hover:bg-primary-600 group-hover:text-white">
                  Review
                  <Icon name="chevron-right" size="sm" />
                </span>
                <span className="hidden text-[10px] font-medium text-slate-400 sm:block">
                  Accept to start
                </span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
