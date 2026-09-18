import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/data";
import { PageHeader } from "@/components/ui";
import StaffReportList from "../staff-list";
import type { Report } from "@/lib/types";

export default async function ResolvedPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const col = profile.role === "department" ? "department_id" : "barangay_id";
  const id = profile.role === "department" ? profile.department_id : profile.barangay_id;

  let query = supabase
    .from("reports")
    .select("*, categories(name, icon)")
    .in("status", ["resolved", "closed"])
    .order("created_at", { ascending: false });
  if (id) query = query.eq(col, id);
  const { data } = await query;

  return (
    <div className="space-y-4">
      <PageHeader title="Resolved" subtitle="Completed work record" />
      <StaffReportList
        reports={(data as unknown as (Report & { categories: { name: string; icon: string } | null })[]) ?? []}
        emptyText="No resolved reports yet."
      />
    </div>
  );
}
