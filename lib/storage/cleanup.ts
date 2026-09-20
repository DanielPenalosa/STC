import { createAdminClient } from "@/lib/supabase/admin";
import { cloudinaryDestroy } from "@/lib/storage/cloudinary";

/**
 * Remove every photo belonging to a report from its storage backend
 * (Cloudinary assets destroyed, Supabase objects deleted). Best-effort —
 * a CDN/storage hiccup must never block a report deletion; orphans can be
 * swept later. Call BEFORE the report row is deleted (photo rows cascade).
 */
export async function cleanupReportPhotos(reportId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: photos } = await admin
      .from("report_photos")
      .select("storage_path")
      .eq("report_id", reportId);

    const paths = (photos ?? []).map((p) => p.storage_path as string);
    if (paths.length === 0) return;

    const cldPaths = paths.filter((p) => p.startsWith("cld:"));
    const sbPaths = paths.filter((p) => !p.startsWith("cld:"));

    await Promise.all([
      ...cldPaths.map((p) => cloudinaryDestroy(p)),
      ...(sbPaths.length
        ? [
            admin.storage
              .from("report-photos")
              .remove(sbPaths)
              .catch(() => {}),
          ]
        : []),
    ]);
  } catch {
    // never block deletion on cleanup
  }
}
