import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/ui";
import MapCard from "@/components/map-card";
import { CommunityPost, type CommunityPostData } from "@/components/community-post";
import { publicPhotoUrl } from "@/lib/photo";
import type { Report } from "@/lib/types";
import type { MapPoint } from "@/components/report-map";

export default async function CommunityReportsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reports")
    .select(
      `*, categories(name, icon, color), barangays(name),
       profiles:users!reports_user_id_fkey(full_name),
       report_photos(storage_path, kind)`
    )
    .eq("is_anonymous", false)
    .order("created_at", { ascending: false })
    .limit(50);
  const reports = (data as unknown as (Report & {
    categories: { name: string; icon: string; color: string } | null;
    barangays: { name: string } | null;
    profiles: { full_name: string | null } | null;
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

  const posts: CommunityPostData[] = reports.map((r) => {
    const authorName = r.profiles?.full_name ?? null;
    return {
      id: r.id,
      refCode: r.ref_code,
      title: r.title,
      description: r.description,
      status: r.status,
      priority: r.priority,
      authorName,
      authorInitial: (authorName?.trim()?.[0] ?? "C").toUpperCase(),
      categoryName: r.categories?.name ?? null,
      categoryColor: r.categories?.color ?? null,
      barangayName: r.barangays?.name ?? null,
      addressText: r.address_text,
      createdAt: r.created_at,
      photoUrls: (r.report_photos ?? [])
        .filter((p) => p.kind === "citizen" && p.storage_path)
        .map((p) => publicPhotoUrl(p.storage_path, 640)),
    };
  });

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader title="Community Reports" subtitle="Public issues in your community" />
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <MapCard points={points} height={220} />
      </div>
      {posts.length === 0 ? (
        <EmptyState title="No community reports yet" hint="Be the first to report an issue." />
      ) : (
        <div className="space-y-4">
          {posts.map((p) => (
            <CommunityPost key={p.id} post={p} />
          ))}
        </div>
      )}
    </div>
  );
}
