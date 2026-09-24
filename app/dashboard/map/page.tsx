import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/data";
import { PageHeader } from "@/components/ui";
import { CITY_NAME } from "@/app/brand";
import { publicPhotoUrl } from "@/lib/photo";
import { scopeFor, applyScope } from "@/lib/scope";
import MapClient, { type MapReport } from "./map-client";
import type { ReportStatus } from "@/lib/constants";
import type { Report } from "@/lib/types";

export default async function MapPage() {
  const supabase = await createClient();
  const profile = await requireProfile();
  const scope = scopeFor(profile);

  const [reportsRes, catsRes, brgysRes] = await Promise.all([
    applyScope(
      supabase
        .from("reports")
        .select(
          `id, ref_code, title, status, priority, latitude, longitude, created_at,
         categories(id, name, icon, color), barangays(id, name),
         report_photos(storage_path, kind)`
        )
        .order("created_at", { ascending: false })
        .limit(1000),
      scope
    ),
    supabase.from("categories").select("id, name, icon").order("name"),
    supabase.from("barangays").select("id, name").order("name"),
  ]);

  const reports = ((reportsRes.data as unknown as (Report & {
    categories: { id: string; name: string; icon: string; color: string } | null;
    barangays: { id: string; name: string } | null;
    report_photos: { storage_path: string; kind: string }[] | null;
  })[]) ?? []).map((r) => {
    const photo = r.report_photos?.find((p) => p.kind === "citizen" && p.storage_path);
    return {
      id: r.id,
      ref_code: r.ref_code,
      title: r.title,
      status: r.status as ReportStatus,
      priority: r.priority,
      latitude: r.latitude,
      longitude: r.longitude,
      created_at: r.created_at,
      category_id: r.categories?.id ?? null,
      category_name: r.categories?.name ?? null,
      category_color: r.categories?.color ?? null,
      category_icon: r.categories?.icon ?? null,
      barangay_id: r.barangays?.id ?? null,
      barangay_name: r.barangays?.name ?? null,
      photo_url: photo ? publicPhotoUrl(photo.storage_path, 320) : null,
    } satisfies MapReport;
  });

  return (
    <div>
      <PageHeader
        title="Report Map"
        subtitle={
          scope.isStaff
            ? `Reports assigned to your ${scope.role} — plotted across ${CITY_NAME}`
            : `Explore report locations across ${CITY_NAME}`
        }
      />
      <MapClient
        reports={reports}
        categories={(catsRes.data as { id: string; name: string; icon: string }[]) ?? []}
        barangays={(brgysRes.data as { id: string; name: string }[]) ?? []}
      />
    </div>
  );
}
