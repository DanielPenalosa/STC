import { NextResponse } from "next/server";
import { analyzePhotoLocally } from "@/lib/ai/local/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/analyze — multipart/form-data with `photo` and optional
 * `description`/`title`.
 *
 * PRE-SUBMISSION check shown to the citizen before they submit:
 *   { problem, urgency, confidence, reason } — from the 100% free LOCAL
 *   CLIP zero-shot model (no external API, no cost).
 *
 * The result is advisory only; the citizen can still adjust the category,
 * and every report is analyzed again after submission for routing.
 */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const photo = form.get("photo");
    if (!(photo instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "photo file required" },
        { status: 400 }
      );
    }

    const bytes = new Uint8Array(await photo.arrayBuffer());
    const title = String(form.get("title") ?? "");
    const description = String(form.get("description") ?? "");
    const categoryHandling =
      form.get("categoryHandling") === "barangay" ||
      form.get("categoryHandling") === "municipal"
        ? (String(form.get("categoryHandling")) as "barangay" | "municipal")
        : null;

    const result = await analyzePhotoLocally({
      imageBytes: bytes,
      title,
      description,
      categoryHandling,
    });

    return NextResponse.json({
      ok: result.ok,
      detected_issue: result.issue?.title ?? "Unrecognized",
      urgency: result.urgency?.level ?? null,
      urgency_reason: result.urgency?.reason ?? null,
      confidence: result.confidence,
      reason: result.urgency?.reason ?? result.needs_review_reason ?? null,
      suggested_category_key: result.issueKey,
      secondary_issues: result.secondary.map((s) => s.title),
      needs_review: result.needs_review,
      needs_review_reason: result.needs_review_reason,
      quality: result.quality,
      // true when the photo shows nothing related to civic issues
      unrelated: result.unrelated,
      model_used: result.model_used,
      // routing suggestion for the "Assigned to" row — advisory only
      suggested_level: result.routing?.level ?? null,
      suggested_department: result.routing?.departmentHint ?? null,
      routing_reason: result.routing?.reason ?? null,
      // categories.slug matching the detected issue — the citizen form
      // uses this to auto-fill the category picker
      suggested_category_slug: result.suggestedCategorySlug,
      // extra signal for the UI: what else the model saw, with scores
      alternatives: result.secondary,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "AI analysis failed" },
      { status: 200 }
    );
  }
}
