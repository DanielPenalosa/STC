import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/data";
import { PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { scopeFor, applyScope } from "@/lib/scope";
import DateRangePicker from "@/components/date-range-picker";
import AutoSubmitSelect from "@/components/auto-submit-select";
import ReportsTable from "./table";
import type { Report } from "@/lib/types";
import type { ReportStatus } from "@/lib/constants";

const STATUS_TABS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "submitted", label: "Submitted" },
  { key: "under_review", label: "Under Review" },
  { key: "assigned", label: "Assigned" },
  { key: "in_progress", label: "In Progress" },
  { key: "done", label: "Pending Verification" },
  { key: "resolved", label: "Resolved" },
  { key: "rejected", label: "Rejected" },
  { key: "closed", label: "Closed" },
];

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    q?: string;
    category?: string;
    barangay?: string;
    priority?: string;
    range?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const profile = await requireProfile();
  const scope = scopeFor(profile);

  // guarantee the official barangay list exists before reading it
  const { ensureOfficialBarangays } = await import("@/lib/barangays-official");
  await ensureOfficialBarangays();

  let query = applyScope(
    supabase
      .from("reports")
      .select(
        `*, profiles:users!reports_user_id_fkey(full_name), categories(id, name, icon), barangays(id, name), departments(id, name),
       report_photos(storage_path, kind)`
      )
      .order("created_at", { ascending: false })
      .limit(300),
    scope
  );
  if (sp.status && sp.status !== "all") query = query.eq("status", sp.status);
  if (sp.category) query = query.eq("category_id", sp.category);
  if (sp.barangay) query = query.eq("barangay_id", sp.barangay);
  if (sp.priority) query = query.eq("priority", sp.priority);
  if (sp.q) query = query.or(`title.ilike.%${sp.q}%,ref_code.ilike.%${sp.q}%`);

  // date-range filtering (server-side)
  {
    const now = new Date();
    let gte: string | null = null;
    let lte: string | null = null;
    if (sp.range === "today") {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      gte = start.toISOString();
    } else if (sp.range === "7d" || sp.range === "30d") {
      const days = sp.range === "7d" ? 7 : 30;
      gte = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
    } else if (sp.range === "custom") {
      if (sp.from) gte = new Date(`${sp.from}T00:00:00`).toISOString();
      if (sp.to) lte = new Date(`${sp.to}T23:59:59.999`).toISOString();
    }
    if (gte) query = query.gte("created_at", gte);
    if (lte) query = query.lte("created_at", lte);
  }

  const reportsRes = await query;
  const [catsRes, brgysRes, histRes] = await Promise.all([
    supabase.from("categories").select("id, name, icon").order("name"),
    supabase.from("barangays").select("id, name").order("name"),
    supabase
      .from("status_history")
      .select("report_id, to_status, note, created_at")
      .in(
        "report_id",
        ((reportsRes.data as unknown as { id: string }[]) ?? []).map((r) => r.id)
      )
      .order("created_at"),
  ]);
  const historyByReport = new Map<
    string,
    { to_status: string; note: string | null; created_at: string }[]
  >();
  for (const h of (histRes.data as unknown as { report_id: string; to_status: string; note: string | null; created_at: string }[]) ?? []) {
    const list = historyByReport.get(h.report_id) ?? [];
    list.push({ to_status: h.to_status, note: h.note, created_at: h.created_at });
    historyByReport.set(h.report_id, list);
  }
  const reports = (reportsRes.data as unknown as (Report & {
    profiles: { full_name: string } | null;
    categories: { id: string; name: string; icon: string } | null;
    barangays: { id: string; name: string } | null;
    departments: { name: string } | null;
    report_photos: { storage_path: string; kind: string }[];
  })[]) ?? [];
  const categories = (catsRes.data as { id: string; name: string; icon: string }[]) ?? [];
  const barangays = (brgysRes.data as { id: string; name: string }[]) ?? [];

  /* ===== stat cards (over the CURRENT filter set) ===== */
  const count = (s: ReportStatus) => reports.filter((r) => r.status === s).length;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const isRecent = (r: Report) => new Date(r.created_at).getTime() >= weekAgo;
  const stat = {
    total: reports.length,
    totalNew: reports.filter(isRecent).length,
    pending: count("submitted") + count("under_review") + count("verified"),
    pendingNew: reports.filter(
      (r) =>
        ["submitted", "under_review", "verified"].includes(r.status) && isRecent(r)
    ).length,
    progress: count("assigned") + count("in_progress"),
    progressNew: reports
      .filter((r) => ["assigned", "in_progress"].includes(r.status))
      .filter(isRecent).length,
    resolved: count("resolved"),
    resolvedNew: reports.filter((r) => r.status === "resolved" && isRecent(r)).length,
    archived: count("closed"),
    archivedNew: reports.filter((r) => r.status === "closed" && isRecent(r)).length,
  };

  const qs = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { ...sp, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v && v !== "all") params.set(k, v);
    const s = params.toString();
    return `/dashboard/reports${s ? `?${s}` : ""}`;
  };
  const activeFilters =
    (sp.status && sp.status !== "all" ? 1 : 0) +
    (sp.category ? 1 : 0) +
    (sp.barangay ? 1 : 0) +
    (sp.priority ? 1 : 0) +
    (sp.q ? 1 : 0) +
    (sp.range && sp.range !== "all" ? 1 : 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reports"
        subtitle={
          scope.isStaff
            ? `Reports handled by your ${scope.role} — citizens' accounts stay hidden`
            : "View and manage all community reports submitted by citizens"
        }
        action={
          activeFilters > 0 ? (
            <a
              href="/dashboard/reports"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              <Icon name="close" size="sm" /> Clear filters
            </a>
          ) : undefined
        }
      />

      {/* ===== stat cards ===== */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <StatCard tone="primary" icon="layers" label="Total Reports" value={stat.total} newCount={stat.totalNew} />
        <StatCard tone="warn" icon="clock" label="Pending" value={stat.pending} newCount={stat.pendingNew} />
        <StatCard tone="accent" icon="wrench" label="In Progress" value={stat.progress} newCount={stat.progressNew} />
        <StatCard tone="success" icon="check-circle" label="Resolved" value={stat.resolved} newCount={stat.resolvedNew} />
        <StatCard tone="slate" icon="inbox" label="Archived" value={stat.archived} newCount={stat.archivedNew} />
      </div>

      {/* ===== compact filter row ===== */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
        <form action="/dashboard/reports" className="min-w-[170px] flex-1">
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Search report ID, incident type, or reporter…"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none transition placeholder:text-slate-300 focus:border-primary-400 focus:ring-2 focus:ring-primary-50"
          />
          {Object.entries(sp)
            .filter(([k, v]) => k !== "q" && Boolean(v))
            .map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v ?? ""} />
            ))}
        </form>
        <Suspense fallback={null}>
          <AutoSubmitSelect
            param="status"
            placeholder="All statuses"
            options={STATUS_TABS.filter((t) => t.key !== "all").map((t) => ({
              value: t.key,
              label: t.label,
            }))}
          />
          <AutoSubmitSelect
            param="category"
            placeholder="All types"
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
          />
          {!scope.isStaff && (
            <AutoSubmitSelect
              param="barangay"
              placeholder="All barangays"
              options={barangays.map((b) => ({ value: b.id, label: b.name }))}
            />
          )}
          <DateRangePicker />
        </Suspense>
      </div>

      {/* ===== status quick tabs ===== */}
      <div className="flex flex-wrap items-center gap-1.5">
        {STATUS_TABS.map((t) => (
          <a
            key={t.key}
            href={qs({ status: t.key })}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              (sp.status ?? "all") === t.key
                ? "bg-primary-600 text-white"
                : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            {t.label}
          </a>
        ))}
      </div>

      {/* ===== table + details drawer ===== */}
      <ReportsTable reports={reports} historyByReport={historyByReport} />
    </div>
  );
}

const TONES = {
  primary: { chip: "bg-primary-50 text-primary-600", delta: "text-primary-500" },
  warn: { chip: "bg-warn-50 text-warn-600", delta: "text-warn-600" },
  accent: { chip: "bg-accent-50 text-accent-600", delta: "text-accent-600" },
  success: { chip: "bg-success-50 text-success-600", delta: "text-success-600" },
  slate: { chip: "bg-slate-100 text-slate-500", delta: "text-slate-400" },
} as const;

function StatCard({
  tone,
  icon,
  label,
  value,
  newCount,
}: {
  tone: keyof typeof TONES;
  icon: "layers" | "clock" | "wrench" | "check-circle" | "inbox";
  label: string;
  value: number;
  newCount: number;
}) {
  const t = TONES[tone];
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${t.chip}`}>
        <Icon name={icon} size="lg" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-400">
          {label}
        </p>
        <p className="flex items-baseline gap-2">
          <span className="text-xl font-extrabold text-slate-900">{value}</span>
          {newCount > 0 && (
            <span className={`text-[11px] font-semibold ${t.delta}`}>+{newCount} this week</span>
          )}
        </p>
      </div>
    </div>
  );
}
