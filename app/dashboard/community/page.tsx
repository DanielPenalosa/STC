import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, ReportCard, EmptyState } from "@/components/ui";
import MapCard from "@/components/map-card";
import { publicPhotoUrl } from "@/lib/data";
import type { Report } from "@/lib/types";
import type { MapPoint } from "@/components/report-map";
import { CATEGORY_COLORS } from "@/lib/constants";

export default async function CommunityReportsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reports")
    .select(
      `*, categories(name, icon, color), barangays(name),
       report_photos(storage_path, kind)`
    )
    .eq("is_anonymous", false)
    .order("created_at", { ascending: false })
    .limit(50);
  const reports = (data as unknown as (Report & {
    categories: { name: string; icon: string; color: string } | null;
    barangays: { name: string } | null;
    report_photos: { storage_path: string; kind: string }[];
  })[]) ?? [];

  const points: MapPoint[] = reports
    .filter((r) => r.latitude != null && r.longitude != null)
    .map((r) => ({
      id: r.id,
      lat: r.latitude!,
      lng: r.longitude!,
      label: r.title,
      color: r.categories?.color ?? "#2333A0",
    }));

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader title="Community Reports" subtitle="Public issues in your community" />
      <Card className="overflow-hidden">
        <MapCard points={points} height={240} />
      </Card>
      {reports.length === 0 ? (
        <EmptyState title="No community reports yet" hint="Be the first to report an issue." />
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <ReportCard
              key={r.id}
              id={r.id}
              refCode={r.ref_code}
              title={r.title}
              status={r.status}
              priority={r.priority}
              categoryName={r.categories?.name}
              barangayName={r.barangays?.name}
              createdAt={r.created_at}
              photoUrl={
                r.report_photos?.find((p) => p.kind === "citizen")
                  ? publicPhotoUrl(r.report_photos.find((p) => p.kind === "citizen")!.storage_path)
                  : null
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
