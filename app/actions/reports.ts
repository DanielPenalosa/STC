"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/data";
import { runAiAnalysis } from "@/lib/ai";
import { detectDuplicates } from "@/lib/ai/duplicate";
import { resolveBarangay } from "@/lib/detect-server";
import { cleanupReportPhotos, cleanupReportPhoto } from "@/lib/storage/cleanup";
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
  /**
   * Analysis the citizen's browser computed at photo-pick time (CLIP WASM).
   * The post-submission pipeline rebuilds its verdict from this instead of
   * re-running server CLIP, which serverless hosts can't do. Shape-checked
   * and clamped server-side — never trusted blindly.
   */
  aiVerdict?: {
    issueKey: string | null;
    issueTitle: string | null;
    confidence: number;
    quality: { ok: boolean; reason?: string | null };
    unrelated: boolean;
    secondary?: { key: string; title: string; score: number }[];
    model_used: string;
  } | null;
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

  // photo evidence is mandatory — at least one successfully uploaded photo
  if (!input.photoPaths.length) {
    return {
      ok: false,
      error: "A photo is required before a report can be submitted.",
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
    // service-role insert — the catalog row must never silently fail.
    // content_hash is written in a SECOND pass because older databases
    // may not have that column yet; a failure there must not lose the
    // photo reference itself (that's why admins saw photo-less reports)
    const rows = input.photoPaths.map((p) => ({
      report_id: reportId,
      storage_path: p,
      kind: "citizen",
    }));
    const { error: photosError } = await createAdminClient()
      .from("report_photos")
      .insert(rows);
    if (photosError) {
      console.error("report_photos insert failed:", photosError.message);
    } else if (input.photoHashes?.length) {
      const { error: hashError } = await createAdminClient()
        .from("report_photos")
        .update({ content_hash: input.photoHashes[0] })
        .eq("report_id", reportId)
        .eq("kind", "citizen")
        .in("storage_path", input.photoPaths);
      if (hashError) console.warn("content_hash skipped:", hashError.message);
    }
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

  // fire-and-forget AI analysis (recommendation only) — prefer the verdict
  // computed in the citizen's browser; sanitize before it crosses the boundary
  const v = input.aiVerdict;
  const clientVerdict =
    v && typeof v === "object" && typeof v.model_used === "string"
      ? {
          issueKey:
            typeof v.issueKey === "string" && v.issueKey.length < 64
              ? v.issueKey
              : null,
          issueTitle:
            typeof v.issueTitle === "string" && v.issueTitle.length < 120
              ? v.issueTitle
              : null,
          confidence: Math.max(0, Math.min(1, Number(v.confidence) || 0)),
          quality: {
            ok: Boolean(v.quality?.ok),
            reason:
              typeof v.quality?.reason === "string" && v.quality.reason.length < 32
                ? v.quality.reason
                : null,
          },
          unrelated: Boolean(v.unrelated),
          secondary: Array.isArray(v.secondary)
            ? v.secondary.slice(0, 3).map((s) => ({
                key: String(s?.key ?? "").slice(0, 64),
                title: String(s?.title ?? "").slice(0, 120),
                score: Math.max(0, Math.min(1, Number(s?.score) || 0)),
              }))
            : [],
          model_used: v.model_used.slice(0, 120),
        }
      : null;
  void runAiAnalysis(reportId, clientVerdict);

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
/* Citizen: delete own report — only while Pending (submitted/         */
/* under_review) or after Resolved                                     */
/* ------------------------------------------------------------------ */

export async function deleteMyReport(reportId: string): Promise<ActionResult> {
  const supabase = await createClient();
  // fetch ownership/status before deleting; cleanup needs the photo paths
  const { data: owned } = await supabase
    .from("reports")
    .select("id, status")
    .eq("id", reportId)
    .maybeSingle();
  const row = owned as { id: string; status: string } | null;
  if (!row) return { ok: false, error: "Report not found." };
  if (!"submitted,under_review,resolved".split(",").includes(row.status)) {
    return {
      ok: false,
      error: "Reports can only be deleted while pending review or after being resolved.",
    };
  }

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

/** Allowed transitions per role (lifecycle v2). */
const STAFF_ALLOWED: Record<string, ReportStatus[]> = {
  admin: [
    "under_review", "assigned", "in_progress", "done", "resolved", "closed", "rejected",
  ],
  // dept/barangay: accept work → in progress; submit completion → done.
  // Only admin can resolve (verification step) or reject.
  department: ["in_progress", "done"],
  barangay: ["in_progress", "done"],
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

  // lifecycle gate: a department/barangay may only submit completion
  // ("done") when completion evidence exists — at least one resolution
  // photo AND a note explaining what was done.
  if (status === "done" && (profile.role === "department" || profile.role === "barangay")) {
    const { count } = await supabase
      .from("report_photos")
      .select("id", { count: "exact", head: true })
      .eq("report_id", reportId)
      .eq("kind", "resolution");
    if (!count) {
      return { ok: false, error: "Upload a completion photo before submitting." };
    }
    if (!note?.trim()) {
      return { ok: false, error: "Add a completion note before submitting." };
    }
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
  if (status === "done" || status === "resolved") {
    await supabase
      .from("assignments")
      .update({ completed_at: new Date().toISOString() })
      .eq("report_id", reportId)
      .is("completed_at", null);
  }

  revalidatePath(`/dashboard/reports/${reportId}`);
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

  revalidatePath(`/dashboard/reports/${reportId}`);
  return { ok: true };
}

/**
 * Staff: remove an evidence photo they uploaded BEFORE submitting the
 * report as Done. Once the completion is submitted (status done), photos
 * are locked — admin verification needs the evidence intact.
 */
export async function removeEvidencePhoto(
  reportId: string,
  photoId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const profile = await requireProfile();
  if (profile.role !== "department" && profile.role !== "barangay") {
    return { ok: false, error: "Not permitted" };
  }

  const { data: report } = await supabase
    .from("reports")
    .select("status")
    .eq("id", reportId)
    .maybeSingle();
  const status = (report as { status?: ReportStatus } | null)?.status;
  if (status !== "in_progress" && status !== "assigned") {
    return { ok: false, error: "Photos are locked once the work is submitted for verification." };
  }

  const { data: photo } = await supabase
    .from("report_photos")
    .select("id, storage_path")
    .eq("id", photoId)
    .eq("report_id", reportId)
    .eq("kind", "resolution")
    .maybeSingle();
  const row = photo as { id: string; storage_path: string } | null;
  if (!row) return { ok: false, error: "Photo not found." };

  // remove the asset, then the catalog row
  await cleanupReportPhoto(row.storage_path);
  const { error } = await supabase.from("report_photos").delete().eq("id", photoId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/dashboard/reports/${reportId}`);
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

  revalidatePath(`/dashboard/reports/${reportId}`);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Citizen: follow / unfollow a report (boosts its priority)           */
/* ------------------------------------------------------------------ */

export async function toggleFollow(
  reportId: string
): Promise<ActionResult & { following?: boolean }> {
  const supabase = await createClient();
  const profile = await requireProfile();

  const { data: existing } = await supabase
    .from("report_follows")
    .select("user_id")
    .eq("report_id", reportId)
    .eq("user_id", profile.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("report_follows")
      .delete()
      .eq("report_id", reportId)
      .eq("user_id", profile.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/dashboard/reports/${reportId}`);
    return { ok: true, following: false };
  }

  const { error } = await supabase
    .from("report_follows")
    .insert({ report_id: reportId, user_id: profile.id });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/dashboard/reports/${reportId}`);
  return { ok: true, following: true };
}

/* ------------------------------------------------------------------ */
/* Citizen: follow up own report — alerts admins at any status         */
/* ------------------------------------------------------------------ */

export async function addFollowup(
  reportId: string,
  message: string
): Promise<ActionResult> {
  const trimmed = message.trim();
  if (!trimmed) return { ok: false, error: "Write a message first." };
  if (trimmed.length > 1000) return { ok: false, error: "Keep it under 1000 characters." };

  const supabase = await createClient();
  const profile = await requireProfile();

  const { data: owned } = await supabase
    .from("reports")
    .select("id, user_id")
    .eq("id", reportId)
    .maybeSingle();
  const report = owned as { id: string; user_id: string } | null;
  if (!report || report.user_id !== profile.id) {
    return { ok: false, error: "Only the reporter can follow up." };
  }

  // the DB trigger alerts every admin
  const { error } = await supabase.from("report_followups").insert({
    report_id: reportId,
    user_id: profile.id,
    message: trimmed,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/dashboard/reports/${reportId}`);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Citizen: rate a resolved report (1–5 stars + comment)               */
/* ------------------------------------------------------------------ */

export async function submitFeedback(
  reportId: string,
  rating: number,
  comment: string
): Promise<ActionResult> {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: "Pick a rating from 1 to 5 stars." };
  }

  const supabase = await createClient();
  const profile = await requireProfile();

  const { data: owned } = await supabase
    .from("reports")
    .select("id, user_id, status")
    .eq("id", reportId)
    .maybeSingle();
  const report = owned as { id: string; user_id: string; status: string } | null;
  if (!report || report.user_id !== profile.id) {
    return { ok: false, error: "Only the reporter can leave feedback." };
  }
  if (report.status !== "resolved") {
    return { ok: false, error: "Feedback opens once the report is resolved." };
  }

  // RLS double-checks resolved+owner; the trigger alerts admins
  const { error } = await supabase.from("report_feedback").insert({
    report_id: reportId,
    user_id: profile.id,
    rating,
    comment: comment.trim() || null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/dashboard/reports/${reportId}`);
  return { ok: true };
}
