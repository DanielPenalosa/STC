import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/data";
import { PageHeader, ReportCard, EmptyState } from "@/components/ui";
import { publicPhotoUrl } from "@/lib/data";
import type { Report } from "@/lib/types";
import MyReportsControls from "./controls";

export default async function MyReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const profile = await requireProfile();
  const supabase = await createClient();
  let query = supabase
    .from("reports")
    .select(
      `*, categories(name, icon), barangays(name),
       report_photos(storage_path, kind)`
    )
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (sp.status && sp.status !== "all") {
    query = query.eq("status", sp.status);
  }
  const { data } = await query;
  const reports = (data as unknown as (Report & {
    categories: { name: string; icon: string } | null;
    barangays: { name: string } | null;
    report_photos: { storage_path: string; kind: string }[];
  })[]) ?? [];

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader
        title="My Reports"
        subtitle={`${reports.length} ${reports.length === 1 ? "report" : "reports"}${(sp.status ?? "all") !== "all" ? " · filtered" : ""}`}
      />
      <MyReportsControls current={sp.status ?? "all"} />
      {reports.length === 0 ? (
        <EmptyState
          icon="file"
          title="No reports here yet"
          hint="Submitted reports appear here with their live status."
        />
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
