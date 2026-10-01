import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/data";
import { PageHeader, EmptyState } from "@/components/ui";
import MapCard from "@/components/map-card";
import { CommunityPost, type CommunityPostData } from "@/components/community-post";
import { publicPhotoUrl } from "@/lib/photo";
import type { Report } from "@/lib/types";
import type { MapPoint } from "@/components/report-map";

export default async function CommunityReportsPage() {
  const supabase = await createClient();
  const profile = await getProfile();

  // community feed = RESOLVED reports only — the transparency-facing side of
  // SCOUT: citizens browse what the city has actually fixed, then like,
  // comment and rate it. (Active work stays in Reports / Map.)
  const { data } = await supabase
    .from("reports")
    .select(
      `*, categories(name, icon, color), barangays(name),
       profiles:users!reports_user_id_fkey(full_name),
       report_photos(storage_path, kind),
       report_likes(user_id),
       report_comments(id, user_id, message, created_at),
       report_feedback(user_id, rating)`
    )
    .eq("status", "resolved")
    .eq("is_anonymous", false)
    .order("resolved_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(50);
  const reports = (data as unknown as (Report & {
    categories: { name: string; icon: string; color: string } | null;
    barangays: { name: string } | null;
    profiles: { full_name: string | null } | null;
    report_photos: { storage_path: string; kind: string }[];
    report_likes: { user_id: string }[] | null;
    report_comments: { id: string; user_id: string; message: string; created_at: string }[] | null;
    report_feedback: { user_id: string; rating: number }[] | null;
  })[]) ?? [];

  const viewerId = profile?.id ?? null;
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
    const comments = r.report_comments ?? [];
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
      resolvedAt: r.resolved_at ?? null,
      photoUrls: (r.report_photos ?? [])
        .filter((p) => p.kind === "citizen" && p.storage_path)
        .map((p) => publicPhotoUrl(p.storage_path, 640)),
      resolutionPhotoUrls: (r.report_photos ?? [])
        .filter((p) => p.kind === "resolution" && p.storage_path)
        .map((p) => publicPhotoUrl(p.storage_path, 640)),
      likes: (r.report_likes ?? []).length,
      likedByMe: viewerId
        ? (r.report_likes ?? []).some((l) => l.user_id === viewerId)
        : false,
      comments: comments
        .slice()
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((c) => ({
          id: c.id,
          reportId: r.id,
          author: "Community member",
          message: c.message,
          createdAt: c.created_at,
          mine: viewerId === c.user_id,
        })),
      ratingCount: (r.report_feedback ?? []).length,
      ratingAvg: (r.report_feedback ?? []).length
        ? (r.report_feedback ?? []).reduce((s, f) => s + f.rating, 0) /
          (r.report_feedback ?? []).length
        : 0,
      myRating: viewerId
        ? ((r.report_feedback ?? []).find((f) => f.user_id === viewerId)?.rating ?? 0)
        : 0,
      amReporter: viewerId === r.user_id,
    };
  });

  // comment author names resolved in one batch (emails hidden)
  const commenterIds = Array.from(
    new Set(reports.flatMap((r) => (r.report_comments ?? []).map((c) => c.user_id)))
  );
  if (commenterIds.length) {
    const { data: nameRows } = await supabase
      .from("users")
      .select("id, full_name")
      .in("id", commenterIds);
    const names = Object.fromEntries(
      ((nameRows as { id: string; full_name: string | null }[] | null) ?? []).map(
        (u) => [u.id, u.full_name]
      )
    );
    for (const p of posts) {
      for (const c of p.comments) {
        // comment id alone can't map back to user_id, so re-walk the raw rows
        const raw = reports.find((r) => r.id === p.id)?.report_comments ?? [];
        const match = raw.find((x) => x.id === c.id);
        const name = match ? names[match.user_id] : null;
        c.author = !name || name.includes("@") ? "Community member" : name;
      }
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader
        title="Community"
        subtitle="Resolved reports from your community — like, comment and rate them"
      />
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <MapCard points={points} height={220} />
      </div>
      {posts.length === 0 ? (
        <EmptyState
          icon="check-circle"
          title="No resolved reports yet"
          hint="Once issues are verified as fixed, they show up here for the community to celebrate."
        />
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
