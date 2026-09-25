/**
 * Public transparency feed — resolved reports for the landing page.
 *
 * Privacy rules:
 *   • citizen identity is never selected, only barangay/department + ref + title
 *   • photos are exposed to anonymous visitors ONLY for resolved reports
 *     (see isPublicPhotoPath, enforced in /api/photo)
 */

import { createAdminClient } from "@/lib/supabase/admin";

export type PublicResolvedReport = {
  id: string;
  ref_code: string;
  title: string;
  barangay_name: string | null;
  department_name: string | null;
  /** first citizen photo (the reported state) */
  photo_before: string | null;
  /** first resolution photo uploaded in the done flow (the fixed state) */
  photo_after: string | null;
  resolved_at: string | null;
};

/** Service-role client, or null when env vars are absent (e.g. prerender). */
function adminDb() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  return createAdminClient();
}

/**
 * The most recently resolved reports (newest first, capped) plus the total
 * number of resolved reports, for the landing page transparency section.
 */
export async function getResolvedReports(
  limit = 6
): Promise<{ items: PublicResolvedReport[]; total: number }> {
  const db = adminDb();
  if (!db) return { items: [], total: 0 };

  const { data, error, count } = await db
    .from("reports")
    .select("id, ref_code, title, resolved_at, barangays(name), departments(name)", {
      count: "exact",
    })
    .eq("status", "resolved")
    .order("resolved_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    console.error("[transparency] failed to load resolved reports:", error.message);
    return { items: [], total: 0 };
  }

  const rows =
    (data as unknown as {
      id: string;
      ref_code: string;
      title: string;
      resolved_at: string | null;
      barangays: { name: string } | null;
      departments: { name: string } | null;
    }[]) ?? [];

  if (rows.length === 0) return { items: [], total: 0 };
  // Fetch the photos per report separately — embedding report_photos in
  // the same query makes PostgREST drop any report that has zero photos.
  const ids = rows.map((r) => r.id);
  const { data: photos } = await db
    .from("report_photos")
    .select("report_id, storage_path, kind, created_at")
    .in("report_id", ids)
    .order("created_at", { ascending: true });

  const before = new Map<string, string>();
  const after = new Map<string, string>();
  for (const p of (photos as { report_id: string; storage_path: string; kind: string }[]) ?? []) {
    if (p.kind === "resolution") {
      if (!after.has(p.report_id)) after.set(p.report_id, p.storage_path);
    } else if (!before.has(p.report_id)) {
      before.set(p.report_id, p.storage_path);
    }
  }

  return {
    items: rows.map((r) => ({
      id: r.id,
      ref_code: r.ref_code,
      title: r.title,
      barangay_name: r.barangays?.name ?? null,
      department_name: r.departments?.name ?? null,
      photo_before: before.get(r.id) ?? null,
      photo_after: after.get(r.id) ?? null,
      resolved_at: r.resolved_at,
    })),
    total: typeof count === "number" ? count : rows.length,
  };
}

/**
 * Gate used by /api/photo: is this storage path a photo of a RESOLVED report?
 * This is the only way an anonymous (signed-out) request may fetch a photo.
 */
export async function isPublicPhotoPath(path: string): Promise<boolean> {
  const db = adminDb();
  if (!db) return false;

  const { data: photo, error } = await db
    .from("report_photos")
    .select("report_id")
    .eq("storage_path", path)
    .limit(1);
  const reportId = (photo as { report_id: string }[] | null)?.[0]?.report_id;
  if (error || !reportId) return false;

  const { data: report } = await db
    .from("reports")
    .select("status")
    .eq("id", reportId)
    .maybeSingle();
  return (report as { status: string } | null)?.status === "resolved";
}
