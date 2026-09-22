/**
 * lib/ai/local/service.ts — post-submission analysis + auto-assignment.
 *
 * Runs AFTER a report is inserted (fire-and-forget from createReport):
 *   1. loads the report's first photo from storage
 *   2. runs the local pipeline (CLIP + urgency + routing)
 *   3. writes the full recommendation into ai_analysis
 *   4. AUTO-ASSIGNS:
 *        barangay level → the report's detected barangay account
 *        municipal      → the matching department (category default,
 *                         refined by keyword hints)
 *      …creating an `assignments` row exactly like admin assignReport does,
 *      marking status "assigned" and notifying the assignee staff.
 *   5. low confidence / no issue → NO auto-assign, admins notified to review
 *
 * Everything here is advisory: admins can reassign or override, and the
 * final decision is recorded on the ai_analysis row.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { analyzePhotoLocally, type LocalAiResult } from "./pipeline";
import { DEPARTMENT_KEYWORDS } from "./labels";

type DeptRow = { id: string; slug: string | null; name: string };

export type ServiceResult = {
  analysisId: string | null;
  auto_assigned: boolean;
  assigned_to: { type: "department" | "barangay"; id: string; name: string } | null;
};

/** Storage path → bytes (Supabase or Cloudinary `cld:` marker). */
async function loadPhotoBytes(
  storagePath: string
): Promise<{ bytes: Uint8Array; mime: string } | null> {
  const admin = createAdminClient();
  try {
    if (storagePath.startsWith("cld:")) {
      const cloud = process.env.CLOUDINARY_CLOUD_NAME;
      if (!cloud) return null;
      const url = `https://res.cloudinary.com/${cloud}/image/upload/f_auto,q_auto,w_1024/${storagePath.slice(4)}.jpg`;
      const res = await fetch(url);
      if (!res.ok) return null;
      return { bytes: new Uint8Array(await res.arrayBuffer()), mime: "image/jpeg" };
    }
    const { data, error } = await admin.storage
      .from("report-photos")
      .createSignedUrl(storagePath, 120);
    if (error || !data) return null;
    const res = await fetch(data.signedUrl);
    if (!res.ok) return null;
    return { bytes: new Uint8Array(await res.arrayBuffer()), mime: "image/jpeg" };
  } catch {
    return null;
  }
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/** Pick the department: category default first, then keyword hints. */
function pickDepartment(
  departments: DeptRow[],
  categoryDefaultId: string | null,
  hint: string | null
): DeptRow | null {
  if (categoryDefaultId) {
    const hit = departments.find((d) => d.id === categoryDefaultId);
    if (hit) return hit;
  }
  if (hint) {
    const bySlug = departments.find(
      (d) => (d.slug ?? slugify(d.name)).includes(hint) || hint.includes((d.slug ?? slugify(d.name)).split("-")[0])
    );
    if (bySlug) return bySlug;
    // loose fallback: match keyword hint against department names
    const byName = departments.find((d) => d.name.toLowerCase().includes(hint));
    if (byName) return byName;
  }
  return null;
}

/** Run the full post-submission AI flow for one report. Never throws. */
export async function runLocalAnalysisForReport(
  reportId: string
): Promise<ServiceResult> {
  const empty: ServiceResult = { analysisId: null, auto_assigned: false, assigned_to: null };
  try {
    const admin = createAdminClient();

    // 1. load report + joins
    const { data: report } = await admin
      .from("reports")
      .select(
        `id, title, description, latitude, longitude, address_text,
         category_id, barangay_id, status,
         categories(id, slug, name, default_department_id, handling_level)`
      )
      .eq("id", reportId)
      .maybeSingle();
    const rep = report as
      | {
          id: string;
          title: string;
          description: string;
          barangay_id: string | null;
          status: string;
          categories: {
            id: string;
            slug: string | null;
            name: string;
            default_department_id: string | null;
            handling_level: "barangay" | "municipal" | null;
          } | null;
        }
      | null;
    if (!rep) return empty;

    const { data: photos } = await admin
      .from("report_photos")
      .select("storage_path")
      .eq("report_id", reportId)
      .eq("kind", "citizen")
      .order("created_at")
      .limit(1);
    const photoPath = photos?.[0]?.storage_path ?? null;

    // 2. run the local pipeline (no photo → text-only routing, flagged for review)
    let result: LocalAiResult;
    if (photoPath) {
      const photo = await loadPhotoBytes(photoPath);
      result = photo
        ? await analyzePhotoLocally({
            imageBytes: photo.bytes,
            title: rep.title,
            description: rep.description,
            categoryHandling: rep.categories?.handling_level ?? null,
          })
        : {
            ok: false, issue: null, issueKey: null, secondary: [], confidence: 0,
            urgency: null, routing: null, suggestedCategorySlug: null,
            quality: { ok: false, reason: "unreadable" }, unrelated: false,
            needs_review: true,
            needs_review_reason: "Photo could not be loaded for AI analysis — manual review required.",
            model_used: "local:clip-vit-base-patch32",
          };
    } else {
      // text-only fallback: urgency + routing still work, vision is skipped
      const { scoreUrgency } = await import("./urgency");
      const { routeReport } = await import("./routing");
      const issue = null;
      const urgency = scoreUrgency({
        issue,
        title: rep.title,
        description: rep.description,
      });
      const routing = routeReport({
        issueKey: null,
        urgency: urgency.level,
        title: rep.title,
        description: rep.description,
        categoryHandling: rep.categories?.handling_level ?? null,
      });
      result = {
        ok: false, issue, issueKey: null, secondary: [], confidence: 0,
        urgency, routing, suggestedCategorySlug: null, unrelated: false,
        quality: { ok: true },
        needs_review: true,
        needs_review_reason: "No photo attached — AI classified from text only. Manual review required.",
        model_used: "local:rules-only",
      };
    }

    // 3. resolve category + department suggestions
    const { data: deptData } = await admin.from("departments").select("id, slug, name").eq("is_active", true);
    const departments = (deptData as DeptRow[]) ?? [];

    let departmentHint = result.routing?.departmentHint ?? null;
    if (departmentHint) {
      // refine with text keywords for better department matching
      for (const d of DEPARTMENT_KEYWORDS) {
        if (d.patterns.some((p) => p.test(`${rep.title} ${rep.description}`))) {
          departmentHint = d.departmentSlug;
          break;
        }
      }
    }

    const department = result.routing?.level === "municipal"
      ? pickDepartment(departments, rep.categories?.default_department_id ?? null, departmentHint)
      : null;

    const categoryId = rep.categories?.id ?? null;

    // 4. persist the recommendation
    const { data: inserted, error: insertError } = await admin
      .from("ai_analysis")
      .insert({
        report_id: reportId,
        suggested_category_id: categoryId,
        suggested_department_id: department?.id ?? null,
        suggested_barangay_id: rep.barangay_id, // from GPS detection
        detected_issue: result.issue?.title ?? "Unrecognized — manual review",
        confidence: result.confidence,
        urgency: result.urgency?.level ?? null,
        reason: result.urgency?.reason ?? result.needs_review_reason ?? null,
        handling_level: result.routing?.level ?? null,
        model_used: result.model_used,
        raw_response: {
          pipeline: "local-clip-zero-shot",
          issue_key: result.issueKey,
          secondary_issues: result.secondary,
          quality: result.quality,
          routing_reason: result.routing?.reason ?? null,
          needs_review_reason: result.needs_review_reason,
        },
        status: result.needs_review ? "low_confidence" : "completed",
        admin_decision: "pending",
      })
      .select("id")
      .single();
    if (insertError) {
      console.error("ai_analysis insert failed:", insertError.message);
      return empty;
    }
    const analysisId = inserted.id as string;

    // 5. auto-assign — ONLY when the AI is confident enough
    let assigned: ServiceResult["assigned_to"] = null;
    if (
      !result.needs_review &&
      result.ok &&
      result.routing?.level &&
      (result.routing.level === "barangay" ? rep.barangay_id : department)
    ) {
      const isBarangay = result.routing.level === "barangay";
      const targetId = isBarangay ? rep.barangay_id! : department!.id;
      const targetName = isBarangay ? "the detected barangay" : department!.name;
      const note = `AI auto-assignment — ${result.issue?.title ?? "issue"} (${result.routing.level} level, ${Math.round(result.confidence * 100)}% confidence). ${result.urgency?.reason ?? ""}`;

      const { error: assignError } = await admin.from("assignments").insert({
        report_id: reportId,
        assigned_type: isBarangay ? "barangay" : "department",
        department_id: isBarangay ? null : targetId,
        barangay_id: isBarangay ? targetId : null,
        assigned_by: null, // assigned by the AI pipeline (service role)
        note,
      });

      if (!assignError) {
        assigned = { type: isBarangay ? "barangay" : "department", id: targetId, name: targetName };
        await admin
          .from("reports")
          .update({ status: "assigned" })
          .eq("id", reportId)
          .eq("status", "submitted"); // never override a human's earlier decision

        // record the auto-assignment on the analysis row
        await admin
          .from("ai_analysis")
          .update({ auto_assigned: true })
          .eq("id", analysisId);

        // notify the assignee staff accounts
        const col = isBarangay ? "barangay_id" : "department_id";
        const { data: staff } = await admin
          .from("users")
          .select("id")
          .eq("role", isBarangay ? "barangay" : "department")
          .eq(col, targetId);
        if (staff?.length) {
          await admin.from("notifications").insert(
            (staff as { id: string }[]).map((s) => ({
              user_id: s.id,
              report_id: reportId,
              title: `New report assigned — ${rep.title.slice(0, 60)}`,
              body: `AI routed this ${result.routing!.level}-level report to you: ${result.issue?.title ?? "issue"}. ${result.urgency ? `Urgency: ${result.urgency.level}.` : ""}`,
              type: "assignment",
            }))
          );
        }
      } else {
        console.error("AI auto-assign failed:", assignError.message);
      }
    }

    // 6. low confidence → notify admins for manual review (never auto-assign)
    if (result.needs_review) {
      const { data: admins } = await admin.from("users").select("id").eq("role", "admin");
      if (admins?.length) {
        await admin.from("notifications").insert(
          (admins as { id: string }[]).map((a) => ({
            user_id: a.id,
            report_id: reportId,
            title: `AI review needed — ${rep.title.slice(0, 60)}`,
            body: result.needs_review_reason ?? "AI could not classify this report confidently.",
            type: "ai_review",
          }))
        );
      }
    }

    return { analysisId, auto_assigned: Boolean(assigned), assigned_to: assigned };
  } catch (e) {
    console.error("runLocalAnalysisForReport failed:", e);
    return { analysisId: null, auto_assigned: false, assigned_to: null };
  }
}
