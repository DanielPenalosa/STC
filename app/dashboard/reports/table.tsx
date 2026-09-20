"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, StatusBadge, PriorityBadge } from "@/components/ui";
import { Icon } from "@/components/icons";
import ExportMenu, { type ExportRow } from "@/components/export-menu";
import type { Report } from "@/lib/types";

type Row = Report & {
  profiles: { full_name: string } | null;
  categories: { id: string; name: string; icon: string } | null;
  barangays: { id: string; name: string } | null;
  departments: { name: string } | null;
  report_photos: { storage_path: string; kind: string }[];
};

export type HistoryEntry = {
  to_status: string;
  note: string | null;
  created_at: string;
};

const PAGE_SIZE = 10;

/** Client-safe photo URL — served by the authenticated /api/photo proxy. */
function photoUrl(path: string): string {
  return `/api/photo?bucket=report-photos&path=${encodeURIComponent(path)}`;
}

const STEP_LABELS: Record<string, string> = {
  submitted: "Created",
  under_review: "Assigned to Department",
  verified: "Reviewed by Admin",
  assigned: "Assigned to Department",
  in_progress: "Work Started",
  resolved: "Resolved",
  closed: "Closed",
};

const STEP_DONE: Record<string, boolean> = {
  submitted: true,
  under_review: false,
  verified: true,
  assigned: false,
  in_progress: true,
  resolved: false,
  closed: true,
};

/**
 * Reference-style reports table with a rich slide-in Report Details panel:
 * reporter information, attached photos with count, report timeline, and a
 * quick "Update status" shortcut.
 */
export default function ReportsTable({
  reports,
  historyByReport,
}: {
  reports: Row[];
  historyByReport: Map<string, HistoryEntry[]>;
}) {
  const [page, setPage] = useState(1);
  const [active, setActive] = useState<Row | null>(null);

  const totalPages = Math.max(1, Math.ceil(reports.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const rows = reports.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const showingFrom = reports.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(safePage * PAGE_SIZE, reports.length);

  const exportRows: ExportRow[] = reports.map((r) => ({
    ref: r.ref_code,
    title: r.title,
    category: r.categories?.name ?? "—",
    barangay: r.barangays?.name ?? "—",
    department: r.departments?.name ?? "—",
    status: r.status,
    priority: r.priority,
    date: new Date(r.created_at).toLocaleDateString(),
  }));

  return (
    <>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-bold text-slate-800">All Reports</p>
          <ExportMenu rows={exportRows} />
        </div>

        {/* desktop table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2.5 font-semibold">#</th>
                <th className="px-3 py-2.5 font-semibold">Report ID</th>
                <th className="px-3 py-2.5 font-semibold">Type</th>
                <th className="px-3 py-2.5 font-semibold">Location</th>
                <th className="px-3 py-2.5 font-semibold">Reporter</th>
                <th className="px-3 py-2.5 font-semibold">Date &amp; Time</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r, i) => (
                <tr
                  key={r.id}
                  onClick={() => setActive(r)}
                  className={`cursor-pointer transition-colors hover:bg-primary-50/40 ${
                    active?.id === r.id ? "bg-primary-50/60" : ""
                  }`}
                >
                  <td className="px-3 py-2.5 text-xs text-slate-300">
                    {(safePage - 1) * PAGE_SIZE + i + 1}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="font-mono text-xs font-semibold text-primary-700">
                      {r.ref_code}
                    </span>
                    <span className="block max-w-[220px] truncate text-xs text-slate-500">
                      {r.title}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-600">
                    {r.categories?.name ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-600">
                    {r.barangays?.name ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-600">
                    {r.profiles?.full_name ?? "Citizen"}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-400">
                    {new Date(r.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                    <span className="block text-[10px]">
                      {new Date(r.created_at).toLocaleTimeString(undefined, {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={r.status} />
                    {r.priority === "high" && (
                      <span className="ml-1 inline-block align-middle">
                        <PriorityBadge priority={r.priority} />
                      </span>
                    )}
                    {r.is_possible_duplicate && (
                      <span
                        className="ml-1 inline-block align-middle"
                        title="Possible duplicate — review before triaging"
                      >
                        <span className="inline-flex items-center gap-1 rounded-full bg-warn-50 px-2 py-0.5 text-[10px] font-bold text-warn-700 ring-1 ring-warn-200">
                          <Icon name="alert" size="sm" /> dup?
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`View ${r.ref_code}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActive(r);
                      }}
                      onKeyDown={(e) => e.key === "Enter" && setActive(r)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 transition hover:bg-primary-50 hover:text-primary-600"
                    >
                      <Icon name="eye" size="sm" />
                    </span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">
                    No reports match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* mobile cards */}
        <div className="divide-y divide-slate-100 md:hidden">
          {rows.map((r) => (
            <button
              key={r.id}
              onClick={() => setActive(r)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left"
            >
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[11px] font-semibold text-primary-700">{r.ref_code}</p>
                <p className="truncate text-sm font-medium text-slate-800">{r.title}</p>
                <p className="truncate text-xs text-slate-400">
                  {r.categories?.name ?? "—"} · {r.barangays?.name ?? "—"} ·{" "}
                  {new Date(r.created_at).toLocaleDateString()}
                </p>
              </div>
              <StatusBadge status={r.status} />
              <Icon name="chevron-right" size="sm" className="shrink-0 text-slate-300" />
            </button>
          ))}
          {rows.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-slate-400">
              No reports match the current filters.
            </p>
          )}
        </div>

        {/* pagination */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2.5">
          <p className="text-xs text-slate-400">
            Showing <span className="font-semibold text-slate-600">{showingFrom}–{showingTo}</span> of{" "}
            <span className="font-semibold text-slate-600">{reports.length}</span> reports
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <PageBtn disabled={safePage === 1} onClick={() => setPage(safePage - 1)} label="‹" />
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                .map((p, idx, arr) => (
                  <span key={p} className="flex items-center">
                    {idx > 0 && arr[idx - 1] !== p - 1 && (
                      <span className="px-1 text-xs text-slate-300">…</span>
                    )}
                    <PageBtn active={p === safePage} onClick={() => setPage(p)} label={String(p)} />
                  </span>
                ))}
              <PageBtn
                disabled={safePage === totalPages}
                onClick={() => setPage(safePage + 1)}
                label="›"
              />
            </div>
          )}
        </div>
      </Card>

      {/* ===== Report Details drawer (reference layout) ===== */}
      {active && (
        <div className="fixed inset-0 z-[80] flex justify-end">
          <div
            className="absolute inset-0 bg-slate-900/25"
            onClick={() => setActive(null)}
          />
          <aside className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl">
            {/* header */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-3.5">
              <p className="text-sm font-bold text-slate-900">Report Details</p>
              <button
                onClick={() => setActive(null)}
                aria-label="Close"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <Icon name="close" size="md" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              {/* ref + status */}
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-sm font-bold text-primary-700">{active.ref_code}</p>
                <div className="flex items-center gap-1.5">
                  {active.is_possible_duplicate && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-warn-50 px-2 py-0.5 text-[10px] font-bold text-warn-700 ring-1 ring-warn-200">
                      <Icon name="alert" size="sm" /> Possible duplicate
                    </span>
                  )}
                  <StatusBadge status={active.status} />
                </div>
              </div>

              {/* location + map link */}
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                  <Icon name="pin" size="sm" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {active.address_text || active.barangays?.name || "Location pending"}
                  </p>
                  {active.latitude != null && active.longitude != null && (
                    <a
                      href={`https://www.google.com/maps?q=${active.latitude},${active.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline"
                    >
                      <Icon name="pin" size="sm" />
                      {active.latitude.toFixed(5)}, {active.longitude.toFixed(5)} · View on Map
                    </a>
                  )}
                </div>
              </div>

              {/* reporter information */}
              <section className="rounded-xl border border-slate-200 p-3.5">
                <p className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <Icon name="user" size="sm" className="text-slate-400" />
                  Reporter Information
                </p>
                <p className="text-sm font-semibold text-slate-800">
                  {active.profiles?.full_name ?? "Citizen"}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {new Date(active.created_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                  {" · "}
                  {active.barangays?.name ?? "—"}
                </p>
              </section>

              {/* report description */}
              <section>
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <Icon name="file" size="sm" className="text-slate-400" />
                  Report Description
                </p>
                <p className="whitespace-pre-wrap rounded-xl bg-slate-50/80 p-3 text-sm leading-relaxed text-slate-600">
                  {active.description || "—"}
                </p>
              </section>

              {/* attached photos */}
              {active.report_photos?.length > 0 && (
                <section>
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                    <Icon name="camera" size="sm" className="text-slate-400" />
                    Attached Photos
                  </p>
                  <div className="flex items-center gap-2">
                    <a
                      href={photoUrl(active.report_photos[0].storage_path)}
                      target="_blank"
                      rel="noreferrer"
                      className="group relative block h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photoUrl(active.report_photos[0].storage_path)}
                        alt=""
                        className="h-full w-full object-cover transition group-hover:scale-105"
                      />
                    </a>
                    {active.report_photos.length > 1 && (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
                        <Icon name="camera" size="sm" />
                        +{active.report_photos.length - 1} more
                      </span>
                    )}
                  </div>
                </section>
              )}

              {/* report timeline */}
              <section>
                <p className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <Icon name="clock" size="sm" className="text-slate-400" />
                  Report Timeline
                </p>
                <Timeline history={historyByReport.get(active.id) ?? []} status={active.status} />
              </section>

              {/* actions */}
              <div className="flex gap-2 border-t border-slate-100 pt-4">
                <Link
                  href={`/reports/${active.id}`}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-700"
                >
                  <Icon name="edit" size="sm" />
                  Update Status
                </Link>
                <button
                  onClick={() => setActive(null)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

/** Compact vertical timeline from status_history (fallback: current status). */
function Timeline({
  history,
  status,
}: {
  history: HistoryEntry[];
  status: string;
}) {
  const entries =
    history.length > 0
      ? history
      : [{ to_status: status, note: null, created_at: new Date().toISOString() }];

  return (
    <ol className="space-y-0">
      {entries.map((h, i) => {
        const last = i === entries.length - 1;
        return (
          <li key={`${h.to_status}-${h.created_at}`} className="relative flex gap-3 pb-3.5 last:pb-0">
            {!last && (
              <span className="absolute left-[7px] top-4 h-full w-px bg-slate-100" aria-hidden="true" />
            )}
            <span
              className={`relative z-10 mt-0.5 h-[15px] w-[15px] shrink-0 rounded-full border-2 ${
                last ? "border-primary-600 bg-white" : "border-slate-300 bg-white"
              }`}
            >
              {last && <span className="absolute inset-[2px] rounded-full bg-primary-600" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className={`truncate text-[13px] font-semibold ${last ? "text-slate-800" : "text-slate-500"}`}>
                  {STEP_LABELS[h.to_status] ?? h.to_status}
                </p>
                <time className="shrink-0 text-[10px] text-slate-400">
                  {new Date(h.created_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                  ,{" "}
                  {new Date(h.created_at).toLocaleTimeString(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </time>
              </div>
              {h.note && (
                <p className="mt-0.5 truncate text-[11px] text-slate-400">by {h.note}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function PageBtn({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`h-7 min-w-7 rounded-lg px-1.5 text-xs font-semibold transition disabled:opacity-40 ${
        active
          ? "bg-primary-600 text-white"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
      }`}
    >
      {label}
    </button>
  );
}
