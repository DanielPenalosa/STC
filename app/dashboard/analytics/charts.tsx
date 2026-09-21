"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";

export type AnalyticsRow = {
  status: string;
  priority: number;
  created_at: string;
  category: string;
  barangay: string;
  department: string;
  user_id: string;
};

const DEPT_COLORS = ["#2333A0", "#06ABEA", "#2E8254", "#F5E606", "#DF1B2C", "#5c6cc9", "#94a3b8", "#030B65"];

/** Soft blue tooltip matching the reference style. */
const TOOLTIP_STYLE = {
  borderRadius: 10,
  border: "1px solid #e2e8f0",
  boxShadow: "0 4px 12px rgb(0 0 0 / 0.08)",
  fontSize: 12,
  padding: "6px 10px",
};

/**
 * Charts for the reference-style analytics layout:
 *  - Reports Overview: 7-day smooth area chart
 *  - Reports by Department: donut + color-dot legend with counts & percentages
 */
export default function Charts({ reports }: { reports: AnalyticsRow[] }) {
  /* 7-day trend */
  const days: { day: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({
      day: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      count: reports.filter((r) => r.created_at.slice(0, 10) === key).length,
    });
  }

  /* by department (top 7 + Other) */
  const deptCounts = reports.reduce<Record<string, number>>((acc, r) => {
    acc[r.department] = (acc[r.department] ?? 0) + 1;
    return acc;
  }, {});
  const deptEntries = Object.entries(deptCounts).sort((a, b) => b[1] - a[1]);
  const top = deptEntries.slice(0, 7);
  const otherCount = deptEntries.slice(7).reduce((s, [, c]) => s + c, 0);
  const deptData = [
    ...top.map(([department, count]) => ({ department, count })),
    ...(otherCount > 0 ? [{ department: "Other", count: otherCount }] : []),
  ];
  const deptTotal = deptData.reduce((s, d) => s + d.count, 0) || 1;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* ===== Reports Overview — area chart ===== */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <p className="text-sm font-bold text-slate-800">Reports Overview</p>
            <p className="text-[11px] text-slate-400">Total reports submitted over the last 7 days</p>
          </div>
          <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
            Daily
          </span>
        </div>
        <div className="p-3 pr-4">
          <ResponsiveContainer width="100%" height={230}>
            <AreaChart data={days} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2333A0" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#2333A0" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ stroke: "#c7d2fe" }} />
              <Area
                type="monotone"
                dataKey="count"
                stroke="#2333A0"
                strokeWidth={2.2}
                fill="url(#areaFill)"
                dot={{ r: 2.5, fill: "#2333A0", strokeWidth: 0 }}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ===== Reports by Department — donut + legend ===== */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-bold text-slate-800">Reports by Department</p>
        </div>
        <div className="flex flex-col items-center gap-2 p-4 sm:flex-row sm:gap-4">
          <div className="relative h-44 w-44 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={deptData}
                  dataKey="count"
                  nameKey="department"
                  innerRadius={54}
                  outerRadius={82}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {deptData.map((_, i) => (
                    <Cell key={i} fill={DEPT_COLORS[i % DEPT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
            {/* center total */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-xl font-extrabold text-slate-900">{deptTotal}</p>
              <p className="text-[10px] font-medium text-slate-400">Total Reports</p>
            </div>
          </div>
          {/* legend list */}
          <ul className="w-full min-w-0 flex-1 space-y-1.5">
            {deptData.map((d, i) => {
              const pct = Math.round((d.count / deptTotal) * 100);
              return (
                <li key={d.department} className="flex items-center gap-2 text-xs">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: DEPT_COLORS[i % DEPT_COLORS.length] }}
                  />
                  <span className="min-w-0 flex-1 truncate text-slate-600">{d.department}</span>
                  <span className="font-semibold text-slate-800">{d.count}</span>
                  <span className="w-9 text-right text-[11px] text-slate-400">{pct}%</span>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </div>
  );
}
