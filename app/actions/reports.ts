"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/data";
import { runAiAnalysis } from "@/lib/ai";
import { detectDuplicates } from "@/lib/ai/duplicate";
import { resolveBarangay } from "@/lib/detect-server";
import { cleanupReportPhotos } from "@/lib/storage/cleanup";
import type { Report, ReportPhoto } from "@/lib/types";
import type { ReportStatus } from "@/lib/constants";

export type ActionResult = { ok: boolean; error?: string; reportId?: string };

/* ------------------------------------------------------------------ */
/* Citizen: create report                                              */
/* ------------------------------------------------------------------ */

export type NewReportInput = {
  title: string;
  description: string;
  categoryId: string | null;
  latitude: number | null;
  longitude: number | null;
  addressText: string | null;
  photoPaths: string[]; // storage paths already uploaded client-side
  photoHashes?: string[]; // sha-256 per photo (same order) for duplicate detection
};

export async function createReport(
  input: NewReportInput
): Promise<ActionResult> {
  const supabase = await createClient();
  const profile = await requireProfile();

  // every report belongs to a verified citizen — no anonymous submissions
  if (profile.role === "citizen" && profile.verification_status !== "verified") {
    return {
      ok: false,
      error:
        "Your account is not verified yet. An admin must verify your ID before you can submit reports.",
    };
  }

  // Barangay is resolved SERVER-SIDE from GPS coordinates — the citizen
  // never selects it manually. Two passes: configured centers, then
  // OpenStreetMap reverse geocode (auto-creates unmapped barangays).
  let barangayId: string | null = null;
  if (input.latitude != null && input.longitude != null) {
    const r = await resolveBarangay(supabase, input.latitude, input.longitude);
    barangayId = r.barangayId;
  }

  const { data, error } = await supabase
    .from("reports")
    .insert({
      user_id: profile.id,
      title: input.title,
      description: input.description,
      category_id: input.categoryId,
      is_anonymous: false,
      barangay_id: barangayId,
      latitude: input.latitude,
      longitude: input.longitude,
      address_text: input.addressText,
      status: "submitted",
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  const reportId = data.id as string;

  if (input.photoPaths.length) {
    // service-role insert — the storage upload happened with the user's
    // session, but the catalog row must never silently fail on drifted
    // policies (missing rows are why admins saw reports without photos)
    const rows = input.photoPaths.map((p, i) => ({
      report_id: reportId,
      storage_path: p,
      kind: "citizen",
      ...(input.photoHashes?.[i] ? { content_hash: input.photoHashes[i] } : {}),
    }));
    const { error: photosError } = await createAdminClient()
      .from("report_photos")
      .insert(rows);
    if (photosError) console.error("report_photos insert failed:", photosError.message);
  }

  // location snapshot
  if (input.latitude != null && input.longitude != null) {
    await supabase.from("locations").insert({
      report_id: reportId,
      latitude: input.latitude,
      longitude: input.longitude,
      address_text: input.addressText,
    });
  }

  // fire-and-forget AI analysis (recommendation only)
  void runAiAnalysis(reportId);

  // fire-and-forget duplicate detection — flags the report + notifies admins
  // when it looks like a copy; never blocks the submission
  void detectDuplicates(supabase, reportId, {
    title: input.title,
    description: input.description,
    categoryId: input.categoryId,
    latitude: input.latitude,
    longitude: input.longitude,
    barangayId,
    photoHashes: input.photoHashes ?? [],
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/reports");
  return { ok: true, reportId };
}

/* ------------------------------------------------------------------ */
/* Citizen: delete own submitted report                                */
/* ------------------------------------------------------------------ */

export async function deleteMyReport(reportId: string): Promise<ActionResult> {
  const supabase = await createClient();
  // fetch ownership/status before deleting; cleanup needs the photo paths
  const { data: owned } = await supabase
    .from("reports")
    .select("id")
    .eq("id", reportId)
    .eq("status", "submitted")
    .maybeSingle();
  if (!owned) return { ok: false, error: "Report not found or already processed." };

  await cleanupReportPhotos(reportId);
  const { error } = await supabase.from("reports").delete().eq("id", reportId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/my-reports");
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

export async function getReport(reportId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reports")
    .select(
      `*,
       profiles:users!reports_user_id_fkey(full_name, phone, address),
       categories(*), barangays(*), departments(*)`
    )
    .eq("id", reportId)
    .maybeSingle();
  return (data as unknown as Report) ?? null;
}

export async function getReportExtras(reportId: string) {
  const supabase = await createClient();
  const [photos, history, assignments, analysis] = await Promise.all([
    supabase.from("report_photos").select("*").eq("report_id", reportId).order("created_at"),
    supabase.from("status_history").select("*").eq("report_id", reportId).order("created_at"),
    supabase.from("assignments").select("*").eq("report_id", reportId).order("created_at"),
    supabase.from("ai_analysis").select("*").eq("report_id", reportId).order("created_at"),
  ]);
  return {
    photos: (photos.data as unknown as ReportPhoto[]) ?? [],
    history: history.data ?? [],
    assignments: (assignments.data as unknown as import("@/lib/types").Assignment[]) ?? [],
    analysis: (analysis.data as unknown as import("@/lib/types").AiAnalysis[]) ?? [],
  };
}

/* ------------------------------------------------------------------ */
/* Staff: status updates (trigger writes history + notifies citizen)   */
/* ------------------------------------------------------------------ */

const STAFF_ALLOWED: Record<string, ReportStatus[]> = {
  admin: ["submitted", "under_review", "verified", "assigned", "in_progress", "resolved", "closed"],
  department: ["in_progress", "resolved"],
  barangay: ["in_progress", "resolved"],
};

export async function updateReportStatus(
  reportId: string,
  status: ReportStatus,
  note?: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const profile = await requireProfile();
  if (profile.role === "citizen") return { ok: false, error: "Not permitted" };

  const { data: report } = await supabase
    .from("reports")
    .select("status")
    .eq("id", reportId)
    .maybeSingle();
  const current = (report as { status?: ReportStatus } | null)?.status;
  if (current && !STAFF_ALLOWED[profile.role]?.includes(status)) {
    return { ok: false, error: "Your role cannot set this status" };
  }

  const { error } = await supabase
    .from("reports")
    .update({ status })
    .eq("id", reportId);
  if (error) return { ok: false, error: error.message };

  if (note) {
    await supabase.from("status_history").insert({
      report_id: reportId,
      to_status: status,
      changed_by: profile.id,
      note,
    });
  }

  // assignments bookkeeping
  if (status === "in_progress") {
    await supabase
      .from("assignments")
      .update({ accepted_at: new Date().toISOString() })
      .eq("report_id", reportId)
      .is("accepted_at", null);
  }
  if (status === "resolved") {
    await supabase
      .from("assignments")
      .update({ completed_at: new Date().toISOString() })
      .eq("report_id", reportId)
      .is("completed_at", null);
  }

  revalidatePath(`/reports/${reportId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Staff: progress notes + resolution evidence photos                  */
/* ------------------------------------------------------------------ */

export async function addProgressNote(
  reportId: string,
  note: string,
  newPhotoPaths: string[] = []
): Promise<ActionResult> {
  const supabase = await createClient();
  const profile = await requireProfile();
  if (profile.role === "citizen") return { ok: false, error: "Not permitted" };

  const { error } = await supabase.from("status_history").insert({
    report_id: reportId,
    to_status: "in_progress", // note-only entries keep last status semantics
    changed_by: profile.id,
    note: `Progress note: ${note}`,
  });
  if (error) return { ok: false, error: error.message };

  if (newPhotoPaths.length) {
    await supabase.from("report_photos").insert(
      newPhotoPaths.map((p) => ({
        report_id: reportId,
        storage_path: p,
        kind: "resolution",
      }))
    );
  }

  revalidatePath(`/reports/${reportId}`);
  return { ok: true };
}

export async function uploadEvidencePhoto(
  reportId: string,
  file: File
): Promise<ActionResult> {
  const supabase = await createClient();
  const profile = await requireProfile();
  if (profile.role === "citizen") return { ok: false, error: "Not permitted" };

  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${reportId}/res-${Date.now()}.${ext}`;
  // service-role write — evidence rows must never silently fail on policy drift
  const { error } = await createAdminClient()
    .storage
    .from("report-photos")
    .upload(path, file, { contentType: file.type });
  if (error) return { ok: false, error: error.message };

  const { error: rowErr } = await createAdminClient()
    .from("report_photos")
    .insert({ report_id: reportId, storage_path: path, kind: "resolution" });
  if (rowErr) console.error("report_photos insert failed:", rowErr.message);

  revalidatePath(`/reports/${reportId}`);
  return { ok: true };
}
