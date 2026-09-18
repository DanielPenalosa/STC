import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import MapClient, { type MapReport } from "./map-client";
import type { ReportStatus } from "@/lib/constants";
import type { Report } from "@/lib/types";

export default async function MapPage() {
  const supabase = await createClient();
  const [reportsRes, catsRes, brgysRes] = await Promise.all([
    supabase
      .from("reports")
      .select(
        `id, ref_code, title, status, priority, latitude, longitude,
         categories(name, icon, color), barangays(name)`
      )
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase.from("categories").select("id, name, icon").order("name"),
    supabase.from("barangays").select("id, name").order("name"),
  ]);

  const reports = ((reportsRes.data as unknown as (Report & {
    categories: { name: string; icon: string; color: string } | null;
    barangays: { name: string } | null;
  })[]) ?? []).map(
    (r): MapReport => ({
      id: r.id,
      ref_code: r.ref_code,
      title: r.title,
      status: r.status as ReportStatus,
      priority: r.priority,
      latitude: r.latitude,
      longitude: r.longitude,
      category_name: r.categories?.name ?? null,
      category_color: r.categories?.color ?? null,
      category_icon: r.categories?.icon ?? null,
      barangay_name: r.barangays?.name ?? null,
    })
  );

  return (
    <div>
      <PageHeader
        title="Report Map"
        subtitle="Explore report locations across [CITY/MUNICIPALITY]"
      />
      <MapClient
        reports={reports}
        categories={(catsRes.data as { id: string; name: string; icon: string }[]) ?? []}
        barangays={(brgysRes.data as { id: string; name: string }[]) ?? []}
      />
    </div>
  );
}
