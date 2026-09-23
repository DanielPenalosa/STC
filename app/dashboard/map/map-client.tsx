"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Icon, type IconName } from "@/components/icons";
import { STATUS_LABELS } from "@/lib/constants";
import type { FullMapHandle, FullMapPoint } from "@/components/full-report-map";
import type { ReportStatus } from "@/lib/constants";

const FullReportMap = dynamic(() => import("@/components/full-report-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-slate-100 text-sm text-slate-400">
      Loading map…
    </div>
  ),
});

export type MapReport = {
  id: string;
  ref_code: string;
  title: string;
  status: ReportStatus;
  priority: number;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  category_id: string | null;
  category_name: string | null;
  category_color: string | null;
  category_icon: string | null;
  barangay_id: string | null;
  barangay_name: string | null;
  photo_url: string | null;
};

const STATUS_LEGEND: { key: ReportStatus; label: string; color: string }[] = [
  { key: "submitted", label: "Pending", color: "#94a3b8" },
  { key: "under_review", label: "Under Review", color: "#F5E606" },
  { key: "verified", label: "Verified", color: "#06ABEA" },
  { key: "assigned", label: "Assigned", color: "#2333A0" },
  { key: "in_progress", label: "In Progress", color: "#eab308" },
  { key: "done", label: "Pending Verification", color: "#5c6cc9" },
  { key: "resolved", label: "Resolved", color: "#2E8254" },
  { key: "closed", label: "Closed", color: "#334155" },
  { key: "rejected", label: "Rejected", color: "#DF1B2C" },
];

const statusColor = (s: string) =>
  STATUS_LEGEND.find((l) => l.key === s)?.color ?? "#2333A0";

function timeAgo(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric" }).format(new Date(iso));
}

const STATUS_TILE: Record<ReportStatus, { bg: string; text: string }> = {
  submitted: { bg: "bg-slate-100", text: "text-slate-600" },
  under_review: { bg: "bg-warn-50", text: "text-warn-700" },
  verified: { bg: "bg-accent-50", text: "text-accent-700" },
  assigned: { bg: "bg-primary-50", text: "text-primary-700" },
  in_progress: { bg: "bg-warn-50", text: "text-warn-700" },
  done: { bg: "bg-primary-50", text: "text-primary-700" },
  resolved: { bg: "bg-success-50", text: "text-success-700" },
  closed: { bg: "bg-slate-100", text: "text-slate-500" },
  rejected: { bg: "bg-danger-50", text: "text-danger-700" },
};

export default function MapClient({
  reports,
  categories,
  barangays,
}: {
  reports: MapReport[];
  categories: { id: string; name: string; icon: string }[];
  barangays: { id: string; name: string }[];
}) {
  const [category, setCategory] = useState("all");
  const [barangay, setBarangay] = useState("all");
  const [status, setStatus] = useState("all");
  const [layer, setLayer] = useState<"street" | "satellite">("street");
  const [cluster, setCluster] = useState(true);
  const [hover, setHover] = useState<string | null>(null);
  const handleRef = useRef<FullMapHandle | null>(null);

  const filtered = useMemo(
    () =>
      reports.filter(
        (r) =>
          r.latitude != null &&
          r.longitude != null &&
          (status === "all" || r.status === status) &&
          (barangay === "all" || r.barangay_id === barangay) &&
          (category === "all" || r.category_id === category)
      ),
    [reports, status, barangay, category]
  );

  const points: FullMapPoint[] = filtered.map((r) => ({
    id: r.id,
    lat: r.latitude!,
    lng: r.longitude!,
    label: r.title,
    color: r.category_color ?? statusColor(r.status),
    status: r.status,
    barangay: r.barangay_name ?? undefined,
    photoUrl: r.photo_url,
  }));

  /* category totals for the bottom cards (like the reference) */
  const categoryStats = useMemo(() => {
    const m = new Map<string, { name: string; color: string; n: number }>();
    for (const r of reports) {
      if (!r.category_name) continue;
      const e = m.get(r.category_name) ?? {
        name: r.category_name,
        color: r.category_color ?? "#2333A0",
        n: 0,
      };
      e.n += 1;
      m.set(r.category_name, e);
    }
    return [...m.values()].sort((a, b) => b.n - a.n).slice(0, 5);
  }, [reports]);

  function reset() {
    setCategory("all");
    setBarangay("all");
    setStatus("all");
  }

  function locate(r: MapReport) {
    setHover(r.id);
    if (r.latitude != null && r.longitude != null) {
      handleRef.current?.flyTo(r.latitude, r.longitude, 17);
    }
  }

  const selectCls =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-primary-400 focus:outline-none";

  const recent = filtered.slice(0, 6);

  return (
    <div className="space-y-4">
      {/* ===== toolbar: map/satellite + center + cluster ===== */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <button
            onClick={() => setLayer("street")}
            className={`press inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold transition ${
              layer === "street" ? "bg-royal text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Icon name="map" size="sm" /> Map
          </button>
          <button
            onClick={() => setLayer("satellite")}
            className={`press inline-flex items-center gap-1.5 border-l border-slate-200 px-3.5 py-2 text-sm font-semibold transition ${
              layer === "satellite" ? "bg-royal text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Icon name="globe" size="sm" /> Satellite
          </button>
        </div>

        <button
          onClick={() => handleRef.current?.fitAll()}
          className="press inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50"
          title="Fit all reports"
        >
          <Icon name="crosshair" size="sm" /> Center
        </button>
        <button
          onClick={() => setCluster((c) => !c)}
          className={`press inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold shadow-sm transition ${
            cluster
              ? "bg-royal text-white hover:bg-navy"
              : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          <Icon name="grid" size="sm" /> Cluster
        </button>
        <span className="ml-auto hidden text-xs text-slate-400 sm:block">
          {filtered.length} of {reports.length} reports shown
        </span>
      </div>

      {/* ===== map + right sidebar (reference layout) ===== */}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* --- map card --- */}
        <div className="space-y-4">
          <div className="relative h-[52vh] min-h-[340px] overflow-hidden rounded-xl border border-slate-200 shadow-sm sm:h-[62vh]">
            <FullReportMap
              points={points}
              layer={layer}
              cluster={cluster}
              onReady={(h) => (handleRef.current = h)}
            />
          </div>

          {/* --- category stat cards (bottom of map, like reference) --- */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            {categoryStats.map((c) => (
              <button
                key={c.name}
                onClick={() => setCategory(category === c.name ? "all" : c.name)}
                className={`press flex items-center gap-2.5 rounded-xl border bg-white px-3 py-2.5 text-left shadow-sm transition hover:shadow-md ${
                  category === c.name ? "border-primary-300 ring-2 ring-primary-100" : "border-slate-200"
                }`}
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white"
                  style={{ background: c.color }}
                >
                  <Icon name="pin" size="sm" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-medium text-slate-500">{c.name}</span>
                  <span className="block text-lg font-extrabold leading-tight text-slate-900">{c.n}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* --- right sidebar: filters + recent reports --- */}
        <div className="space-y-4">
          {/* filters */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <Icon name="grid" size="md" className="text-primary-600" />
              Report Filters
            </p>
            <div className="mt-3 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Category</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectCls}>
                  <option value="all">All Categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Barangay</label>
                <select value={barangay} onChange={(e) => setBarangay(e.target.value)} className={selectCls}>
                  <option value="all">All Barangays</option>
                  {barangays.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
                  <option value="all">All Status</option>
                  {STATUS_LEGEND.map((l) => (
                    <option key={l.key} value={l.key}>{l.label}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => {
                  /* filtering is instant; button kept for familiarity */
                }}
                className="press w-full rounded-lg bg-navy py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-royal"
              >
                Apply Filters
              </button>
              <button
                onClick={reset}
                className="press flex w-full items-center justify-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-600"
              >
                <Icon name="close" size="sm" /> Reset
              </button>
            </div>
          </div>

          {/* recent reports */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
              <p className="text-sm font-bold text-slate-800">Recent Reports</p>
              <Link href="/dashboard/reports" className="text-xs font-semibold text-primary-600 hover:underline">
                View All
              </Link>
            </div>
            <div className="max-h-[340px] divide-y divide-slate-50 overflow-y-auto">
              {recent.map((r) => {
                const tile = STATUS_TILE[r.status];
                return (
                  <Link
                    key={r.id}
                    href={`/dashboard/reports/${r.id}`}
                    onMouseEnter={() => locate(r)}
                    className="flex items-center gap-2.5 px-4 py-2.5 transition hover:bg-slate-50"
                  >
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white"
                      style={{ background: r.category_color ?? statusColor(r.status) }}
                    >
                      <Icon name="pin" size="sm" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-slate-800">{r.title}</span>
                      <span className="block truncate text-[11px] text-slate-400">
                        {r.barangay_name ?? "—"} · {timeAgo(r.created_at)}
                      </span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${tile.bg} ${tile.text}`}>
                      {STATUS_LABELS[r.status]}
                    </span>
                  </Link>
                );
              })}
              {recent.length === 0 && (
                <p className="p-6 text-center text-sm text-slate-400">No reports match.</p>
              )}
            </div>
          </div>

          {/* status legend */}
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
            <div className="flex flex-wrap gap-x-3 gap-y-1.5">
              {STATUS_LEGEND.map((l) => (
                <span key={l.key} className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  <span className="h-2 w-2 rounded-full" style={{ background: l.color }} />
                  {l.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
