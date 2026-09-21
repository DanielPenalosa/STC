import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, StatusBadge } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { CITY_NAME } from "@/app/brand";
import { scopeFor, applyScope } from "@/lib/scope";
import type { ReportStatus } from "@/lib/constants";
import type { Report } from "@/lib/types";
import type { Profile } from "@/lib/types";

const OPEN_STATUSES: ReportStatus[] = [
  "submitted",
  "under_review",
  "verified",
  "assigned",
  "in_progress",
];

const DAY = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* ---------------- tiny chart helpers (pure SVG, no deps) ---------------- */

function dayKey(t: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date(t));
}

function dayLabel(key: string): string {
  const [, m, d] = key.split("-").map(Number);
  return `${MONTHS[(m ?? 1) - 1]} ${d}`;
}

function pct(cur: number, prev: number): number {
  if (prev === 0) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 100);
}

/** Smooth area sparkline for the stat cards. */
function Sparkline({ values, stroke, fill }: { values: number[]; stroke: string; fill: string }) {
  const w = 100, h = 30, max = Math.max(...values, 1);
  const pts = values.map((v, i) => ({
    x: (i / Math.max(values.length - 1, 1)) * w,
    y: h - 3 - (v / max) * (h - 8),
  }));
  if (pts.length < 2) return null;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const mx = (pts[i - 1].x + pts[i].x) / 2;
    d += ` C ${mx} ${pts[i - 1].y}, ${mx} ${pts[i].y}, ${pts[i].x} ${pts[i].y}`;
  }
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-9 w-20" aria-hidden>
      <path d={`${d} L ${w} ${h} L 0 ${h} Z`} fill={fill} />
      <path d={d} fill="none" stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
    </svg>
  );
}

/** Donut chart with center total. */
function Donut({ segments, total }: { segments: { value: number; color: string }[]; total: number }) {
  const R = 15.9155; // circumference = 100
  let offset = 25;
  return (
    <svg viewBox="0 0 42 42" className="h-44 w-44 shrink-0" aria-hidden>
      <circle cx="21" cy="21" r={R} fill="none" stroke="#f1f5f9" strokeWidth="5.5" />
      {segments.map((s, i) => {
        const dash = total > 0 ? (s.value / total) * 100 : 0;
        const el = (
          <circle
            key={i}
            cx="21"
            cy="21"
            r={R}
            fill="none"
            stroke={s.color}
            strokeWidth="5.5"
            strokeDasharray={`${dash} ${100 - dash}`}
            strokeDashoffset={offset}
            strokeLinecap="butt"
          />
        );
        offset -= dash;
        return el;
      })}
      <text x="21" y="20.5" textAnchor="middle" className="fill-slate-900" style={{ fontSize: 6.5, fontWeight: 800 }}>
        {total}
      </text>
      <text x="21" y="26.5" textAnchor="middle" className="fill-slate-400" style={{ fontSize: 3.2 }}>
        total reports
      </text>
    </svg>
  );
}

/* ---------------- page ---------------- */

export default async function AdminDashboard({ profile }: { profile: Profile }) {
  const supabase = await createClient();
  const scope = scopeFor(profile);

  const [reportsRes, usersRes, deptRes] = await Promise.all([
    applyScope(
      supabase
        .from("reports")
        .select(
          `*, categories(name, icon, color), barangays(name), departments(name, color),
         report_photos(storage_path, kind)`
        )
        .order("created_at", { ascending: false })
        .limit(500),
      scope
    ),
    // staff RLS: only citizens in their jurisdiction are readable; admins see all.
    supabase.from("users").select("id, role, is_active, verification_status, created_at"),
    supabase.from("departments").select("id", { count: "exact", head: true }),
  ]);

  const reports = (reportsRes.data as unknown as (Report & {
    categories: { name: string; icon: string; color: string } | null;
    barangays: { name: string } | null;
    departments: { name: string; color: string } | null;
    report_photos: { storage_path: string; kind: string }[];
  })[]) ?? [];
  const users =
    (usersRes.data as { id: string; role: string; is_active: boolean; verification_status: string; created_at: string | null }[]) ??
    [];
  const deptCount = scope.isStaff ? 1 : (deptRes.count ?? 0);

  /* ----- time-aware greeting (Philippine time) ----- */
  const now = Date.now();
  const hour = Number(
    new Intl.DateTimeFormat("en-PH", { hour: "numeric", hour12: false, timeZone: "Asia/Manila" }).format(now)
  );
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = (profile.full_name ?? "Admin").split(" ")[0] || "Admin";
  const dateLabel = new Intl.DateTimeFormat("en-PH", {
    weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "Asia/Manila",
  }).format(now);
  const timeLabel = new Intl.DateTimeFormat("en-PH", {
    hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Manila",
  }).format(now);

  /* ----- 7-day windows (last vs prior week) ----- */
  const keys14 = Array.from({ length: 14 }, (_, i) => dayKey(now - (13 - i) * DAY));
  const last7 = keys14.slice(7);
  const prev7 = keys14.slice(0, 7);
  const reportsOn = (k: string) => reports.filter((r) => dayKey(new Date(r.created_at).getTime()) === k).length;
  const signupsOn = (k: string) =>
    users.filter((u) => u.created_at && dayKey(new Date(u.created_at).getTime()) === k).length;
  const last7Reports = last7.reduce((a, k) => a + reportsOn(k), 0);
  const prev7Reports = prev7.reduce((a, k) => a + reportsOn(k), 0);
  const last7Signups = last7.reduce((a, k) => a + signupsOn(k), 0);
  const prev7Signups = prev7.reduce((a, k) => a + signupsOn(k), 0);

  /* ----- KPIs (admin sees system-wide; staff see their unit) ----- */
  const totalReports = reports.length;
  const activeUsers = scope.isStaff
    ? users.filter((u) => u.is_active && u.role === "citizen").length
    : users.filter((u) => u.is_active).length;
  const pendingAccounts = users.filter((u) => u.role === "citizen" && u.verification_status === "pending").length;

  /* ----- quick actions ----- */
  const actions: { icon: IconName; title: string; desc: string; href: string }[] =
    scope.isStaff
      ? [
          { icon: "file", title: "View All Reports", desc: `Reports handled by your ${profile.role}`, href: "/dashboard/reports" },
          { icon: "inbox", title: "Newly Assigned", desc: "Accept and start processing", href: "/dashboard/assigned" },
          { icon: "wrench", title: "In Progress", desc: "Reports you're currently working on", href: "/dashboard/in-progress" },
          { icon: "check-circle", title: "Resolved", desc: "Completed work history", href: "/dashboard/resolved" },
        ]
      : [
          { icon: "file", title: "View All Reports", desc: "Check and manage submitted reports", href: "/dashboard/reports" },
          { icon: "robot", title: "Review AI Recommendations", desc: "Accept or override AI classification", href: "/dashboard/ai" },
          { icon: "users", title: "Manage Users", desc: "Approvals, roles and account status", href: "/dashboard/users" },
          { icon: "settings", title: "System Settings", desc: "Configure system preferences", href: "/dashboard/settings" },
        ];
  const reportsTrend = pct(last7Reports, prev7Reports);
  const usersTrend = pct(last7Signups, prev7Signups);
  const pendingTrend = pct(last7Signups, prev7Signups);

  /* ----- category donut ----- */
  const byCategory = new Map<string, { name: string; color: string; n: number }>();
  for (const r of reports) {
    if (!r.categories) continue;
    const e = byCategory.get(r.categories.name) ?? { name: r.categories.name, color: r.categories.color || "#94a3b8", n: 0 };
    e.n += 1;
    byCategory.set(r.categories.name, e);
  }
  const sortedCats = [...byCategory.values()].sort((a, b) => b.n - a.n);
  const topCats = sortedCats.slice(0, 5);
  const othersCount = sortedCats.slice(5).reduce((a, c) => a + c.n, 0);
  const donutSegments = [
    ...topCats.map((c) => ({ value: c.n, color: c.color })),
    ...(othersCount > 0 ? [{ value: othersCount, color: "#cbd5e1" }] : []),
  ];

  /* ----- 7-day area chart ----- */
  const perDay = last7.map((k) => reportsOn(k));
  const chartMax = Math.max(...perDay, 4);
  const CW = 560, CH = 170, PAD = 6;
  const chartPts = perDay.map((v, i) => ({
    x: PAD + (i / (perDay.length - 1)) * (CW - PAD * 2),
    y: CH - 10 - (v / chartMax) * (CH - 26),
  }));
  let areaPath = `M ${chartPts[0].x} ${chartPts[0].y}`;
  for (let i = 1; i < chartPts.length; i++) {
    const mx = (chartPts[i - 1].x + chartPts[i].x) / 2;
    areaPath += ` C ${mx} ${chartPts[i - 1].y}, ${mx} ${chartPts[i].y}, ${chartPts[i].x} ${chartPts[i].y}`;
  }
  const gridLines = [0.25, 0.5, 0.75, 1].map((f) => CH - 10 - f * (CH - 26));

  return (
    <div className="space-y-5">
      {/* ---------- greeting header ---------- */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">{greeting},</p>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{firstName}</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {scope.isStaff
              ? `Here's what's happening in your ${profile.role} today.`
              : `Here's what's happening in ${CITY_NAME} today.`}
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 shadow-sm">
            <Icon name="calendar" size="md" className="text-primary-600" />
            <div className="leading-tight">
              <p className="text-xs font-semibold text-slate-800">{dateLabel}</p>
              <p className="text-[10px] text-slate-400">Today</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 shadow-sm">
            <Icon name="clock" size="md" className="text-primary-600" />
            <div className="leading-tight">
              <p className="text-xs font-semibold text-slate-800">{timeLabel}</p>
              <p className="text-[10px] text-slate-400">Philippine Standard Time</p>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- KPI cards ---------- */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 transition hover:shadow-md">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                <Icon name="file" size="md" />
              </span>
              <div>
                <p className="text-xs text-slate-400">Total Reports</p>
                <p className="text-xl font-extrabold text-slate-900">{totalReports}</p>
              </div>
            </div>
            <Sparkline values={[...prev7.map(reportsOn), ...last7.map(reportsOn)]} stroke="#0a5ef5" fill="#eef6ff" />
          </div>
          <p className={`mt-1.5 flex items-center gap-1 text-[11px] ${reportsTrend >= 0 ? "text-success-600" : "text-danger-500"}`}>
            <Icon name={reportsTrend >= 0 ? "trend-up" : "trend-down"} size="sm" />
            {reportsTrend >= 0 ? "+" : ""}{reportsTrend}% <span className="text-slate-400">up from last 7 days</span>
          </p>
        </Card>
        {/* activeUsers for staff counts citizens in jurisdiction; admins see all users */}

        <Card className="p-4 transition hover:shadow-md">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-success-50 text-success-600">
                <Icon name="users" size="md" />
              </span>
              <div>
                <p className="text-xs text-slate-400">Active Users</p>
                <p className="text-xl font-extrabold text-slate-900">{activeUsers.toLocaleString()}</p>
              </div>
            </div>
            <Sparkline values={[...prev7.map(signupsOn), ...last7.map(signupsOn)]} stroke="#2E8254" fill="#e7f4ec" />
          </div>
          <p className={`mt-1.5 flex items-center gap-1 text-[11px] ${usersTrend >= 0 ? "text-success-600" : "text-danger-500"}`}>
            <Icon name={usersTrend >= 0 ? "trend-up" : "trend-down"} size="sm" />
            {usersTrend >= 0 ? "+" : ""}{usersTrend}% <span className="text-slate-400">new sign-ups this week</span>
          </p>
        </Card>

        <Card className="p-4 transition hover:shadow-md">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-50 text-accent-600">
                <Icon name="building" size="md" />
              </span>
              <div>
                <p className="text-xs text-slate-400">Departments</p>
                <p className="text-xl font-extrabold text-slate-900">{deptCount}</p>
              </div>
            </div>
            <Sparkline values={[...prev7.map(reportsOn), ...last7.map(reportsOn)]} stroke="#06ABEA" fill="#e6f7fe" />
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400">handling city-wide concerns</p>
        </Card>

        <Card className="p-4 transition hover:shadow-md">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-warn-50 text-warn-600">
                <Icon name="shield" size="md" />
              </span>
              <div>
                <p className="text-xs text-slate-400">Pending Accounts</p>
                <p className="text-xl font-extrabold text-slate-900">{pendingAccounts}</p>
              </div>
            </div>
            <Sparkline values={[...prev7.map(signupsOn), ...last7.map(signupsOn)]} stroke="#d97706" fill="#fef3c7" />
          </div>
          <p className={`mt-1.5 flex items-center gap-1 text-[11px] ${pendingTrend >= 0 ? "text-warn-600" : "text-success-600"}`}>
            <Icon name={pendingTrend >= 0 ? "trend-up" : "trend-down"} size="sm" />
            {pendingTrend >= 0 ? "+" : ""}{pendingTrend}% <span className="text-slate-400">registration pace</span>
          </p>
        </Card>
      </div>

      {/* ---------- overview chart + donut ---------- */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="p-4 lg:col-span-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-slate-800">Reports Overview</p>
              <p className="text-xs text-slate-400">
                {last7Reports} report{last7Reports === 1 ? "" : "s"} submitted over the last 7 days
              </p>
            </div>
            <span className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-500">
              Last 7 days
            </span>
          </div>
          <div className="mt-3">
            <svg viewBox={`0 0 ${CW} ${CH}`} preserveAspectRatio="none" className="h-44 w-full" aria-hidden>
              <defs>
                <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0a5ef5" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="#0a5ef5" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              {gridLines.map((y) => (
                <line key={y} x1={PAD} x2={CW - PAD} y1={y} y2={y} stroke="#f1f5f9" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              ))}
              <path d={`${areaPath} L ${chartPts[chartPts.length - 1].x} ${CH} L ${chartPts[0].x} ${CH} Z`} fill="url(#areaFill)" />
              <path d={areaPath} fill="none" stroke="#0a5ef5" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
            </svg>
            <div className="mt-1.5 flex justify-between px-1 text-[10px] text-slate-400">
              {last7.map((k) => (
                <span key={k}>{dayLabel(k)}</span>
              ))}
            </div>
          </div>
        </Card>

        <Card className="p-4 lg:col-span-2">
          <p className="text-sm font-bold text-slate-800">Report Categories</p>
          {sortedCats.length === 0 ? (
            <p className="mt-8 text-center text-sm text-slate-400">No reports yet.</p>
          ) : (
            <div className="mt-3 flex items-center gap-4">
              <Donut segments={donutSegments} total={totalReports} />
              <ul className="min-w-0 flex-1 space-y-2">
                {topCats.map((c) => (
                  <li key={c.name} className="flex items-center gap-2 text-xs">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
                    <span className="min-w-0 flex-1 truncate text-slate-600">{c.name}</span>
                    <span className="font-semibold text-slate-800">{c.n}</span>
                    <span className="w-9 text-right text-slate-400">
                      {totalReports ? Math.round((c.n / totalReports) * 100) : 0}%
                    </span>
                  </li>
                ))}
                {othersCount > 0 && (
                  <li className="flex items-center gap-2 text-xs">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-slate-300" />
                    <span className="min-w-0 flex-1 truncate text-slate-600">Others</span>
                    <span className="font-semibold text-slate-800">{othersCount}</span>
                    <span className="w-9 text-right text-slate-400">
                      {totalReports ? Math.round((othersCount / totalReports) * 100) : 0}%
                    </span>
                  </li>
                )}
              </ul>
            </div>
          )}
        </Card>
      </div>

      {/* ---------- recent reports + quick actions ---------- */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="overflow-hidden lg:col-span-3">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-bold text-slate-800">Recent Reports</p>
            <Link
              href={scope.isStaff ? "/dashboard/assigned" : "/dashboard/reports"}
              className="text-xs font-semibold text-primary-600 hover:underline"
            >
              View All
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2.5 font-semibold">ID</th>
                  <th className="px-2 py-2.5 font-semibold">Title</th>
                  <th className="px-2 py-2.5 font-semibold">Category</th>
                  <th className="px-2 py-2.5 font-semibold">Location</th>
                  <th className="px-2 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {reports.slice(0, 6).map((r) => (
                  <tr key={r.id} className="transition hover:bg-slate-50/70">
                    <td className="px-4 py-2.5">
                      <Link href={`/reports/${r.id}`} className="font-mono text-xs font-semibold text-primary-600 hover:underline">
                        {r.ref_code}
                      </Link>
                    </td>
                    <td className="max-w-[180px] truncate px-2 py-2.5">
                      <Link href={`/reports/${r.id}`} className="font-medium text-slate-700 hover:text-primary-600">
                        {r.title}
                      </Link>
                    </td>
                    <td className="px-2 py-2.5 text-xs text-slate-500">{r.categories?.name ?? "—"}</td>
                    <td className="px-2 py-2.5 text-xs text-slate-500">{r.barangays?.name ?? "—"}</td>
                    <td className="px-2 py-2.5"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-2.5 text-right text-xs text-slate-400">
                      {new Intl.DateTimeFormat("en-PH", {
                        month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
                      }).format(new Date(r.created_at))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {reports.length === 0 && (
              <p className="p-6 text-center text-sm text-slate-400">No reports yet.</p>
            )}
          </div>
        </Card>

        <Card className="p-4 lg:col-span-2">
          <p className="text-sm font-bold text-slate-800">Quick Actions</p>
          <div className="mt-3 space-y-2">
            {actions.map((a) => (
              <Link
                key={a.title}
                href={a.href}
                className="group flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5 transition hover:border-primary-100 hover:bg-primary-50/40"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600 transition group-hover:bg-primary-100">
                  <Icon name={a.icon} size="md" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-800">{a.title}</span>
                  <span className="block truncate text-[11px] text-slate-400">{a.desc}</span>
                </span>
                <Icon name="chevron-right" size="sm" className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-primary-500" />
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
