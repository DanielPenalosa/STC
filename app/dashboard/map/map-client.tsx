"use client";

import { useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Icon } from "@/components/icons";
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
  priority: string;
  latitude: number | null;
  longitude: number | null;
  category_name: string | null;
  category_color: string | null;
  category_icon: string | null;
  barangay_name: string | null;
};

const LEGEND: { key: string; label: string; color: string }[] = [
  { key: "submitted", label: "Pending", color: "#64748b" },
  { key: "under_review", label: "Under Review", color: "#F5E606" },
  { key: "verified", label: "Verified", color: "#06ABEA" },
  { key: "assigned", label: "Assigned", color: "#2333A0" },
  { key: "in_progress", label: "In Progress", color: "#06ABEA" },
  { key: "resolved", label: "Resolved", color: "#2E8254" },
  { key: "closed", label: "Closed", color: "#334155" },
];

const statusColor = (s: string) =>
  LEGEND.find((l) => l.key === s)?.color ?? "#2333A0";

export default function MapClient({
  reports,
  categories,
  barangays,
}: {
  reports: MapReport[];
  categories: { id: string; name: string; icon: string }[];
  barangays: { id: string; name: string }[];
}) {
  const [status, setStatus] = useState("all");
  const [barangay, setBarangay] = useState("all");
  const [category, setCategory] = useState("all");
  const [layer, setLayer] = useState<"street" | "satellite">("street");
  const [cluster, setCluster] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const handleRef = useRef<FullMapHandle | null>(null);

  const filtered = useMemo(
    () =>
      reports.filter(
        (r) =>
          r.latitude != null &&
          r.longitude != null &&
          (status === "all" || r.status === status) &&
          (barangay === "all" || r.barangay_name === barangay) &&
          (category === "all" || r.category_name === category)
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
  }));

  /* statistics (computed from ALL reports, like the reference) */
  const stats = useMemo(() => {
    const byStatus = new Map<string, number>();
    for (const r of reports) byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
    return [...byStatus.entries()].sort((a, b) => b[1] - a[1]);
  }, [reports]);

  const selectCls =
    "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary-400 focus:outline-none";

  return (
    <div className="space-y-3">
      {/* filter bar */}
      <div className="space-y-2">
        {/* primary selects — full-width rows on phones */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:flex lg:flex-wrap">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${selectCls} w-full lg:w-auto`}>
            <option value="all">Status · All</option>
            {LEGEND.map((l) => (
              <option key={l.key} value={l.key}>{l.label}</option>
            ))}
          </select>
          <select value={barangay} onChange={(e) => setBarangay(e.target.value)} className={`${selectCls} w-full lg:w-auto`}>
            <option value="all">Barangay · All</option>
            {barangays.map((b) => (
              <option key={b.id} value={b.name}>{b.name}</option>
            ))}
          </select>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={`${selectCls} w-full lg:w-auto`}>
            <option value="all">Category · All</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* view controls — full-width equal buttons on phones */}
        <div className="grid grid-cols-3 gap-2 lg:ml-auto lg:flex lg:w-auto">
          <button
            onClick={() => setLayer((l) => (l === "street" ? "satellite" : "street"))}
            className="press inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50"
          >
            <Icon name={layer === "street" ? "layers" : "globe"} size="sm" />
            {layer === "street" ? "Street" : "Satellite"}
          </button>
          <button
            onClick={() => handleRef.current?.fitAll()}
            className="press inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50"
          >
            <Icon name="crosshair" size="sm" />
            Center
          </button>
          <button
            onClick={() => setCluster((c) => !c)}
            className={`press inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold shadow-sm transition ${
              cluster
                ? "bg-royal text-white hover:bg-navy"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Icon name="grid" size="sm" />
            Cluster
          </button>
        </div>
      </div>

      {/* map + side panel */}
      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        <div className="relative h-[55vh] min-h-[340px] overflow-hidden rounded-xl border border-slate-200 shadow-sm sm:h-[65vh] lg:h-[70vh]">
          <FullReportMap
            points={points}
            layer={layer}
            cluster={cluster}
            onReady={(h) => (handleRef.current = h)}
          />

          {/* statistics overlay */}
          <div className="map-stats-card-sm absolute left-3 top-3 z-[500] w-52 rounded-xl border border-slate-100 bg-white/95 p-3.5 shadow-lg backdrop-blur">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Map Statistics</p>
            <p className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">{reports.length}</p>
            <p className="-mt-0.5 text-[11px] text-slate-400">Total Reports</p>
            <div className="hide-sm mt-2.5 space-y-1 border-t border-slate-100 pt-2.5">
              {stats.map(([s, n]) => (
                <div key={s} className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5 capitalize text-slate-600">
                    <span className="h-2 w-2 rounded-full" style={{ background: statusColor(s) }} />
                    {s.replace(/_/g, " ")}
                  </span>
                  <span className="font-semibold text-slate-700">{n}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* right panel: legend + list */}
        <div className="flex max-h-[60vh] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:max-h-[70vh]">
          <div className="border-b border-slate-100 p-3">
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {LEGEND.map((l) => (
                <span key={l.key} className="flex items-center gap-1 text-[11px] text-slate-500">
                  <span className="h-2 w-2 rounded-full" style={{ background: l.color }} />
                  {l.label}
                </span>
              ))}
            </div>
          </div>
          <div className="border-b border-slate-100 px-4 py-2.5">
            <p className="text-sm font-semibold">{filtered.length} report{filtered.length === 1 ? "" : "s"} shown</p>
          </div>
          <div className="flex-1 divide-y divide-slate-100 overflow-y-auto">
            {filtered.map((r) => (
              <button
                key={r.id}
                onMouseEnter={() => setSelected(r.id)}
                onFocus={() => setSelected(r.id)}
                onClick={() => window.open(`/reports/${r.id}`, "_self")}
                className={`press flex w-full items-start gap-2.5 px-4 py-3 text-left hover:bg-slate-50 ${
                  selected === r.id ? "bg-primary-50/70" : ""
                }`}
              >
                <span
                  className="mt-1.5 h-3 w-3 shrink-0 rounded-full border border-white shadow"
                  style={{ background: r.category_color ?? statusColor(r.status) }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-800">{r.title}</span>
                  <span className="block text-xs text-slate-400">Brgy. {r.barangay_name ?? "—"}</span>
                </span>
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
                  style={{
                    background: `${statusColor(r.status)}22`,
                    color: statusColor(r.status),
                  }}
                >
                  {r.status.replace(/_/g, " ")}
                </span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="p-6 text-center text-sm text-slate-400">
                No reports match the filters.
              </p>
            )}
          </div>
        </div>
      </div>

      <p className="hidden items-center gap-1.5 text-xs text-slate-400 sm:flex">
        <Icon name="pin" size="sm" />
        Click a cluster to zoom in · hover a report on the right to locate it · click a marker to open the report.
      </p>
    </div>
  );
}
