import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, StatCard, StatusBadge, PriorityBadge } from "@/components/ui";
import { Icon } from "@/components/icons";
import MapCard from "@/components/map-card";
import { publicPhotoUrl } from "@/lib/data";
import type { ReportStatus } from "@/lib/constants";
import type { Report } from "@/lib/types";
import type { MapPoint } from "@/components/report-map";

const OPEN_STATUSES: ReportStatus[] = [
  "submitted",
  "under_review",
  "verified",
  "assigned",
  "in_progress",
];

export default async function AdminDashboard() {
  const supabase = await createClient();

  const [reportsRes, usersRes, aiRes] = await Promise.all([
    supabase
      .from("reports")
      .select(
        `*, categories(name, icon, color), barangays(name), departments(name, color),
         report_photos(storage_path, kind)`
      )
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("users").select("id, role, is_active, verification_status"),
    supabase
      .from("ai_analysis")
      .select("id, report_id, confidence, status")
      .in("status", ["pending", "completed", "low_confidence"])
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const reports = (reportsRes.data as unknown as (Report & {
    categories: { name: string; icon: string; color: string } | null;
    barangays: { name: string } | null;
    departments: { name: string; color: string } | null;
    report_photos: { storage_path: string; kind: string }[];
  })[]) ?? [];
  const users = (usersRes.data as { id: string; role: string; is_active: boolean; verification_status: string }[]) ?? [];
  const aiPending = (aiRes.data as { id: string; report_id: string; confidence: number | null; status: string }[]) ?? [];
  const pendingVerification = users.filter(
    (u) => u.role === "citizen" && u.verification_status === "pending"
  ).length;

  const count = (s: ReportStatus) => reports.filter((r) => r.status === s).length;
  const pending = count("submitted") + count("under_review") + count("verified");
  const inProgress = count("assigned") + count("in_progress");
  const resolved = count("resolved") + count("closed");
  const highPriority = reports.filter(
    (r) => r.priority === "high" && OPEN_STATUSES.includes(r.status)
  ).length;
  const unassigned = reports.filter(
    (r) => !r.department_id && !r.barangay_id && OPEN_STATUSES.includes(r.status)
  );
  const lowConfAi = aiPending.filter((a) => (a.confidence ?? 0) < 0.6 || a.status === "low_confidence");
  const staffCount = users.filter((u) => u.role !== "citizen" && u.is_active).length;

  /* breakdowns */
  const byCategory = new Map<string, { name: string; color: string; icon: string; n: number }>();
  const byBarangay = new Map<string, { n: number; open: number }>();
  const byDepartment = new Map<string, { n: number; open: number }>();
  for (const r of reports) {
    if (r.categories) {
      const k = r.categories.name;
      const e = byCategory.get(k) ?? { name: k, color: r.categories.color, icon: r.categories.icon, n: 0 };
      e.n += 1;
      byCategory.set(k, e);
    }
    if (r.barangays) {
      const e = byBarangay.get(r.barangays.name) ?? { n: 0, open: 0 };
      e.n += 1;
      if (OPEN_STATUSES.includes(r.status)) e.open += 1;
      byBarangay.set(r.barangays.name, e);
    }
    if (r.departments) {
      const e = byDepartment.get(r.departments.name) ?? { n: 0, open: 0 };
      e.n += 1;
      if (OPEN_STATUSES.includes(r.status)) e.open += 1;
      byDepartment.set(r.departments.name, e);
    }
  }
  const catList = [...byCategory.values()].sort((a, b) => b.n - a.n);
  const maxCat = catList[0]?.n ?? 1;

  const points: MapPoint[] = reports
    .filter((r) => r.latitude != null && r.longitude != null && OPEN_STATUSES.includes(r.status))
    .map((r) => ({
      id: r.id,
      lat: r.latitude!,
      lng: r.longitude!,
      label: r.title,
      color: r.categories?.color ?? "#2333A0",
    }));

  /* simple SLA: open reports older than 7 days */
  const WEEK = 7 * 24 * 3600 * 1000;
  const aging = reports.filter(
    (r) => OPEN_STATUSES.includes(r.status) && Date.now() - new Date(r.created_at).getTime() > WEEK
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="System-wide overview"
        action={
          <div className="flex gap-2">
            <Link
              href="/dashboard/reports?status=submitted"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Review queue ({count("submitted")})
            </Link>
            <Link
              href="/dashboard/users?new=staff"
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
            >
              + Create staff account
            </Link>
          </div>
        }
      />

      {/* needs attention */}
      {(unassigned.length > 0 || lowConfAi.length > 0 || highPriority > 0 || aging.length > 0 || pendingVerification > 0) && (
        <Card className="border-warn-200 bg-warn-50/60 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-warn-800">
            <Icon name="alert" size="md" />
            Needs attention
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {highPriority > 0 && (
              <Link href="/dashboard/reports?status=all" className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm text-warn-900 shadow-sm hover:shadow">
                <span className="text-danger-500"><Icon name="alert" size="lg" /></span>
                <span><strong>{highPriority}</strong> high-priority open</span>
              </Link>
            )}
            {unassigned.length > 0 && (
              <Link href="/dashboard/reports?status=verified" className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm text-warn-900 shadow-sm hover:shadow">
                <span className="text-primary-500"><Icon name="inbox" size="lg" /></span>
                <span><strong>{unassigned.length}</strong> awaiting assignment</span>
              </Link>
            )}
            {lowConfAi.length > 0 && (
              <Link href="/dashboard/ai" className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm text-warn-900 shadow-sm hover:shadow">
                <span className="text-primary-500"><Icon name="robot" size="lg" /></span>
                <span><strong>{lowConfAi.length}</strong> AI low-confidence reviews</span>
              </Link>
            )}
            {aging.length > 0 && (
              <Link href="/dashboard/reports?status=in_progress" className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm text-warn-900 shadow-sm hover:shadow">
                <span className="text-warn-500"><Icon name="clock" size="lg" /></span>
                <span><strong>{aging.length}</strong> open &gt; 7 days</span>
              </Link>
            )}
            {pendingVerification > 0 && (
              <Link href="/dashboard/users" className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm text-warn-900 shadow-sm hover:shadow">
                <span className="text-primary-500"><Icon name="shield" size="lg" /></span>
                <span><strong>{pendingVerification}</strong> registration{pendingVerification === 1 ? "" : "s"} awaiting approval</span>
              </Link>
            )}
          </div>
        </Card>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total Reports" value={reports.length} href="/dashboard/reports" />
        <StatCard label="Pending" value={pending} accent="text-warn-600" href="/dashboard/reports?status=submitted" />
        <StatCard label="In Progress" value={inProgress} accent="text-accent-600" href="/dashboard/reports?status=in_progress" />
        <StatCard label="Resolved" value={resolved} accent="text-success-600" href="/dashboard/reports?status=resolved" />
        <StatCard label="High Priority" value={highPriority} accent="text-danger-600" href="/dashboard/reports" />
        <StatCard label="Active Staff" value={staffCount} accent="text-primary-600" href="/dashboard/users" />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* map */}
        <Card className="overflow-hidden lg:col-span-3">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold">Open reports map</p>
            <span className="text-xs text-slate-400">{points.length} with location</span>
          </div>
          <MapCard points={points} height={320} />
        </Card>

        {/* by category */}
        <Card className="p-4 lg:col-span-2">
          <p className="text-sm font-semibold">Reports by category</p>
          <div className="mt-3 space-y-2.5">
            {catList.length === 0 && <p className="text-sm text-slate-400">No data yet.</p>}
            {catList.map((c) => (
              <div key={c.name} className="flex items-center gap-3">
                <span className="w-6 text-center">{c.icon}</span>
                <span className="w-36 truncate text-sm text-slate-600">{c.name}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full" style={{ width: `${(c.n / maxCat) * 100}%`, background: c.color }} />
                </div>
                <span className="w-8 text-right text-sm font-semibold">{c.n}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* by barangay */}
        <Card className="p-4">
          <p className="text-sm font-semibold">Reports by barangay</p>
          <div className="mt-2 space-y-1.5">
            {[...byBarangay.entries()].sort((a, b) => b[1].n - a[1].n).map(([name, v]) => (
              <div key={name} className="flex items-center justify-between text-sm">
                <span className="truncate text-slate-600"><span className="mr-1.5 inline-block text-slate-300"><Icon name="home" size="sm" /></span>{name}</span>
                <span className="shrink-0 text-slate-400">
                  <strong className="text-slate-700">{v.n}</strong> total · <strong className="text-warn-600">{v.open}</strong> open
                </span>
              </div>
            ))}
            {byBarangay.size === 0 && <p className="text-sm text-slate-400">No data yet.</p>}
          </div>
        </Card>

        {/* by department */}
        <Card className="p-4">
          <p className="text-sm font-semibold">Reports by department</p>
          <div className="mt-2 space-y-1.5">
            {[...byDepartment.entries()].sort((a, b) => b[1].n - a[1].n).map(([name, v]) => (
              <div key={name} className="flex items-center justify-between text-sm">
                <span className="truncate text-slate-600"><span className="mr-1.5 inline-block text-slate-300"><Icon name="building" size="sm" /></span>{name}</span>
                <span className="shrink-0 text-slate-400">
                  <strong className="text-slate-700">{v.n}</strong> total · <strong className="text-accent-600">{v.open}</strong> open
                </span>
              </div>
            ))}
            {byDepartment.size === 0 && <p className="text-sm text-slate-400">No data yet.</p>}
          </div>
        </Card>
      </div>

      {/* recent reports */}
      <Card>
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold">Recent reports</p>
          <Link href="/dashboard/reports" className="text-xs font-semibold text-primary-600 hover:underline">
            View all →
          </Link>
        </div>
        <div className="divide-y divide-slate-100">
          {reports.slice(0, 8).map((r) => (
            <Link key={r.id} href={`/reports/${r.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
              {(() => {
                const p = r.report_photos?.find((x) => x.kind === "citizen");
                return p ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={publicPhotoUrl(p.storage_path)} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                ) : (                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                            <Icon name="camera" size="md" />
                          </span>
                );
              })()}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{r.title}</p>
                <p className="text-xs text-slate-400">
                  {r.ref_code} · {r.categories?.name ?? "—"} · {r.barangays?.name ?? "—"} ·{" "}
                  {new Date(r.created_at).toLocaleString()}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {r.priority === "high" && <PriorityBadge priority={r.priority} />}
                <StatusBadge status={r.status} />
              </div>
            </Link>
          ))}
          {reports.length === 0 && <p className="p-6 text-center text-sm text-slate-400">No reports yet.</p>}
        </div>
      </Card>
    </div>
  );
}
