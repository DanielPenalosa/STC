"use client";

import Link from "next/link";
import type { ReportStatus } from "@/lib/constants";

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "submitted", label: "Submitted" },
  { key: "under_review", label: "Under Review" },
  { key: "verified", label: "Verified" },
  { key: "assigned", label: "Assigned" },
  { key: "in_progress", label: "In Progress" },
  { key: "resolved", label: "Resolved" },
  { key: "closed", label: "Closed" },
];

export default function MyReportsControls({ current }: { current: string }) {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {FILTERS.map((f) => (
        <Link
          key={f.key}
          href={`/dashboard/my-reports?status=${f.key}`}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
            current === f.key
              ? "bg-primary-600 text-white"
              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          {f.label}
        </Link>
      ))}
    </div>
  );
}
