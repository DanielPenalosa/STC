import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Report } from "@/lib/types";
import { Card, PageHeader, StatCard, StatusBadge } from "@/components/ui";

export default async function StaffDashboard({ profile }: { profile: Profile }) {
  const supabase = await createClient();
  const col = profile.role === "department" ? "department_id" : "barangay_id";
  const id = profile.role === "department" ? profile.department_id : profile.barangay_id;

  let query = supabase
    .from("reports")
    .select("id, ref_code, title, status, priority, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (id) query = query.eq(col, id);

  const { data } = await query;
  const reports = (data as Pick<Report, "id" | "ref_code" | "title" | "status" | "priority" | "created_at">[]) ?? [];

  const assigned = reports.filter((r) => r.status === "assigned").length;
  const inProgress = reports.filter((r) => r.status === "in_progress").length;
  const resolved = reports.filter((r) => ["resolved", "closed"].includes(r.status)).length;
  const high = reports.filter((r) => r.priority === "high" && !["resolved", "closed"].includes(r.status)).length;

  const roleLabel = profile.role === "department" ? "Department" : "Barangay";

  return (
    <div>
      <PageHeader title={`${roleLabel} Dashboard`} subtitle="Reports assigned to your unit" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Newly Assigned" value={assigned} href="/dashboard/assigned" />
        <StatCard label="In Progress" value={inProgress} accent="text-accent-600" href="/dashboard/in-progress" />
        <StatCard label="Resolved" value={resolved} accent="text-success-600" href="/dashboard/resolved" />
        <StatCard label="High Priority" value={high} accent="text-danger-600" href="/dashboard/assigned" />
      </div>

      <h2 className="mb-3 mt-6 font-bold text-slate-800">Latest assigned reports</h2>
      <Card className="divide-y divide-slate-100">
        {reports.length === 0 && (
          <p className="p-6 text-center text-sm text-slate-500">No reports assigned yet.</p>
        )}
        {reports.slice(0, 8).map((r) => (
          <Link
            key={r.id}
            href={`/reports/${r.id}`}
            className="flex items-center justify-between gap-3 p-4 hover:bg-slate-50"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{r.title}</p>
              <p className="text-xs text-slate-400">
                {r.ref_code} · {new Date(r.created_at).toLocaleDateString()}
              </p>
            </div>
            <StatusBadge status={r.status} />
          </Link>
        ))}
      </Card>
    </div>
  );
}
