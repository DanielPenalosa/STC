import { createClient } from "@/lib/supabase/server";
import { getBarangays, getDepartments } from "@/lib/data";
import { PageHeader } from "@/components/ui";
import UserManager from "./manager";
import type { Profile } from "@/lib/types";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; new?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data }, departments, barangays] = await Promise.all([
    supabase.from("users").select("*").order("created_at", { ascending: false }).limit(500),
    getDepartments(),
    getBarangays(),
  ]);
  const users = (data as unknown as Profile[]) ?? [];

  const roles = ["citizen", "department", "barangay", "admin"] as const;
  const counts = Object.fromEntries(
    roles.map((r) => [r, users.filter((u) => u.role === r).length])
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Users & Accounts"
        subtitle="Approvals, roles and access — all in one place"
      />

      <UserManager
        initial={users}
        counts={counts}
        filterRole={sp.role ?? "all"}
        openCreate={sp.new === "staff"}
        departments={departments.map((d) => ({ id: d.id, name: d.name }))}
        barangays={barangays.map((b) => ({ id: b.id, name: b.name }))}
      />
    </div>
  );
}
