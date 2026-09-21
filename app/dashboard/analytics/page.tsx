import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/data";
import { PageHeader } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { StatusBadge } from "@/components/ui";
import { scopeFor, applyScope } from "@/lib/scope";
import Charts from "./charts";
import type { Report } from "@/lib/types";
import type { ReportStatus } from "@/lib/constants";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const profile = await requireProfile();
  const scope = scopeFor(profile);

  const [reportsRes, usersRes] = await Promise.all([
    applyScope(
      supabase
        .from("reports")
        .select("id, status, priority, created_at, user_id, category_id, categories(name), barangays(name), departments(name)")
        .order("created_at", { ascending: false })
        .limit(1000),
      scope
    ),
    supabase
      .from("users")
      .select("id, full_name, role, is_active, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const reports = (reportsRes.data as unknown as (Report & {
    categories: { name: string } | null;
    barangays: { name: string } | null;
    departments: { name: string } | null;
  })[]) ?? [];
  const users = (usersRes.data as { id: string; full_name: string | null; role: string; is_active: boolean; created_at: string }[]) ?? [];

  const rows = reports.map((r) => ({
    status: r.status,
    priority: r.priority,
    created_at: r.created_at,
    category: r.categories?.name ?? "Other",
    barangay: r.barangays?.name ?? "Unassigned",
    department: r.departments?.name ?? "Unassigned",
    user_id: r.user_id,
  }));

  /* ===== KPI stats (reference-style cards with week-over-week deltas) ===== */
  const now = Date.now();
  const inWindow = (t: string, from: number, to: number) => {
    const ts = new Date(t).getTime();
    return ts >= from && ts < to;
  };
  const weekAgo = now - WEEK_MS;
  const twoWeeksAgo = now - 2 * WEEK_MS;

  const thisWeek = reports.filter((r) => inWindow(r.created_at, weekAgo, now + 1));
  const lastWeek = reports.filter((r) => inWindow(r.created_at, twoWeeksAgo, weekAgo));

  const activeReports = reports.filter((r) =>
    ["submitted", "under_review", "verified", "assigned", "in_progress"].includes(r.status)
  ).length;
  const activeThisWeek = thisWeek.filter((r) =>
    ["submitted", "under_review", "verified", "assigned", "in_progress"].includes(r.status)
  ).length;

  const resolvedReports = reports.filter((r) => r.status === "resolved").length;
  const resolvedThisWeek = thisWeek.filter((r) => r.status === "resolved").length;

  const activeDepartments = new Set(
    reports
      .filter((r) => r.departments?.name && r.status !== "closed")
      .map((r) => r.departments?.name)
  ).size;

  const delta = (curr: number, prev: number) =>
    prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 100);

  /* ===== Top reported issues (bar list) ===== */
  const catCounts = Object.entries(
    rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.category] = (acc[r.category] ?? 0) + 1;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]);
  const topCats = catCounts.slice(0, 4);
  const othersCount = catCounts.slice(4).reduce((s, [, c]) => s + c, 0);
  const maxCat = topCats[0]?.[1] ?? 1;

  /* ===== Recent reports list ===== */
  const recent = reports.slice(0, 5);

  /* ===== user activity feed ===== */
  const activeUsers = users.filter((u) => u.is_active).slice(0, 5);

  const unitCount = scope.isStaff ? 1 : activeDepartments;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Analytics"
        subtitle={
          scope.isStaff
            ? `Activity and key statistics for your ${scope.role}`
            : "Overview of system activity and key statistics"
        }
      />

      {/* ===== KPI cards ===== */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi
          icon="layers"
          tone="primary"
          label="Total Reports"
          value={reports.length}
          delta={delta(thisWeek.length, lastWeek.length)}
        />
        <Kpi
          icon="users"
          tone="accent"
          label="Active Reports"
          value={activeReports}
          delta={delta(activeThisWeek, activeThisWeek)}
        />
        <Kpi
          icon="building"
          tone="warn"
          label={scope.isStaff ? (scope.role === "barangay" ? "Your Barangay" : "Your Department") : "Departments"}
          value={unitCount}
          delta={null}
        />
        <Kpi
          icon="check-circle"
          tone="success"
          label="Resolved Reports"
          value={resolvedReports}
          delta={delta(resolvedThisWeek, lastWeek.filter((r) => r.status === "resolved").length)}
        />
      </div>

      {/* ===== charts row ===== */}
      <Charts reports={rows} />

      {/* ===== bottom row: issues / recent / users ===== */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Top Reported Issues */}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-bold text-slate-800">Top Reported Issues</p>
          </div>
          <div className="space-y-3 p-4">
            {topCats.map(([name, count], i) => (
              <div key={name}>
                <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                      style={{ background: `${["#2333A0", "#06ABEA", "#2E8254", "#F5E606"][i % 4]}1a` }}
                    >
                      <Icon name="tag" size="sm" />
                    </span>
                    <span className="truncate font-medium text-slate-700">{name}</span>
                  </span>
                  <span className="shrink-0 font-semibold text-slate-800">{count}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max((count / maxCat) * 100, 6)}%`,
                      background: ["#2333A0", "#06ABEA", "#2E8254", "#F5E606"][i % 4],
                    }}
                  />
                </div>
              </div>
            ))}
            {othersCount > 0 && (
              <div className="flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs">
                <span className="text-slate-400">Others ({catCounts.length - 4} categories)</span>
                <span className="font-semibold text-slate-600">{othersCount}</span>
              </div>
            )}
            {topCats.length === 0 && (
              <p className="py-4 text-center text-sm text-slate-400">No data yet.</p>
            )}
          </div>
        </section>

        {/* Recent Reports */}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-bold text-slate-800">Recent Reports</p>
            <a
              href="/dashboard/reports"
              className="text-xs font-semibold text-primary-600 hover:underline"
            >
              View All
            </a>
          </div>
          <div className="divide-y divide-slate-100">
            {recent.map((r) => (
              <a
                key={r.id}
                href={`/reports/${r.id}`}
                className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-slate-50"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                  <Icon name="file" size="sm" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-slate-800">{r.title}</p>
                  <p className="truncate text-[11px] text-slate-400">
                    {r.barangays?.name ?? "—"} ·{" "}
                    {new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </p>
                </div>
                <StatusBadge status={r.status} />
              </a>
            ))}
            {recent.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-400">No reports yet.</p>
            )}
          </div>
        </section>

        {/* User Activity */}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-bold text-slate-800">User Activity</p>
          </div>
          <div className="divide-y divide-slate-100">
            {activeUsers.map((u) => (
              <div key={u.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-extrabold text-primary-600">
                  {(u.full_name ?? "?").trim().slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-slate-800">
                    {u.full_name ?? "User"}
                  </p>
                  <p className="truncate text-[11px] text-slate-400">
                    Joined {new Date(u.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-semibold capitalize text-slate-500">
                  {u.role}
                </span>
              </div>
            ))}
            {activeUsers.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-400">No users yet.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

const KPI_TONES = {
  primary: "bg-primary-50 text-primary-600",
  accent: "bg-accent-50 text-accent-600",
  warn: "bg-warn-50 text-warn-600",
  success: "bg-success-50 text-success-600",
} as const;

function Kpi({
  icon,
  tone,
  label,
  value,
  delta,
}: {
  icon: IconName;
  tone: keyof typeof KPI_TONES;
  label: string;
  value: number;
  delta: number | null;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${KPI_TONES[tone]}`}>
        <Icon name={icon} size="lg" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-400">
          {label}
        </p>
        <p className="flex items-baseline gap-1.5">
          <span className="text-xl font-extrabold text-slate-900">{value.toLocaleString()}</span>
          {delta != null && delta !== 0 && (
            <span
              className={`text-[11px] font-semibold ${
                delta > 0 ? "text-success-600" : "text-danger-500"
              }`}
            >
              {delta > 0 ? "+" : ""}
              {delta}% vs. last month
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
