/**
 * lib/ai/local/service.ts — post-submission analysis + auto-assignment.
 *
 * Runs AFTER a report is inserted (fire-and-forget from createReport):
 *   1. loads the report's first photo from storage
 *   2. runs the local pipeline (CLIP + urgency + routing)
 *   3. writes the full recommendation into ai_analysis
 *   4. AUTO-ASSIGNS EVERY REPORT — admins never pick the unit manually:
 *        1. barangay routing + GPS-detected barangay
 *        2. municipal routing + matched department
 *        3. fallback: any matched department (category default / keywords)
 *        4. fallback: the detected barangay
 *      …creating an `assignments` row (idempotent — never duplicated),
 *      stamping reports.department_id/barangay_id, marking status
 *      "assigned", and notifying the assignee staff + ALL admins.
 *   5. only when the AI has NO usable signal at all (dead analysis, no
 *      category, no GPS) → escalated to admins for review instead.
 *
 * The admin's job is oversight, not routing: they see the classification
 * and the assignee, and can re-run the analysis if it failed.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { analyzePhotoLocally, type LocalAiResult } from "./pipeline";
import {
  decideFromClientVerdict,
  type ClientAiVerdict,
} from "./decision";
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

/**
 * Rebuild a ClientAiVerdict from the report's most recent stored analysis
 * when it came from the browser — lets an admin "Re-run AI check" recover a
 * failed pipeline run even on serverless hosts (no server CLIP needed).
 */
async function loadStoredBrowserVerdict(
  admin: ReturnType<typeof createAdminClient>,
  reportId: string
): Promise<ClientAiVerdict | null> {
  try {
    const { data } = await admin
      .from("ai_analysis")
      .select("model_used, confidence, detected_issue, raw_response")
      .eq("report_id", reportId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = data as
      | {
          model_used: string | null;
          confidence: number | null;
          detected_issue: string | null;
          raw_response: {
            issue_key?: string | null;
            secondary_issues?: { key: string; title: string; score: number }[] | null;
            quality?: { ok: boolean; reason?: string | null } | null;
          } | null;
        }
      | null;
    if (!row?.model_used?.startsWith("browser:")) return null;
    const raw = row.raw_response ?? {};
    return {
      issueKey: raw.issue_key ?? null,
      issueTitle: row.detected_issue ?? null,
      confidence: Math.max(0, Math.min(1, Number(row.confidence) || 0)),
      quality: raw.quality ?? { ok: true },
      unrelated: false,
      secondary: Array.isArray(raw.secondary_issues) ? raw.secondary_issues.slice(0, 3) : [],
      model_used: row.model_used.slice("browser:".length) || "clip-vit-base-patch32 (Transformers.js)",
    };
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

/**
 * Run the full post-submission AI flow for one report. Never throws.
 *
 * `clientVerdict` — the analysis the citizen's BROWSER already computed at
 * photo-pick time. Preferred whenever present: serverless hosts can't run
 * server-side CLIP at all (onnxruntime-node unavailable), and re-analyzing
 * wastes CPU even where it works. The verdict is rebuilt through the shared
 * decision core so it matches the citizen's pre-check exactly.
 */
export async function runLocalAnalysisForReport(
  reportId: string,
  clientVerdict?: ClientAiVerdict | null
): Promise<ServiceResult> {
  const empty: ServiceResult = { analysisId: null, auto_assigned: false, assigned_to: null };
  try {
    const admin = createAdminClient();

    // 1. load report + joins
    const { data: report } = await admin
      .from("reports")
      .select(
        `id, ref_code, title, description, latitude, longitude, address_text,
         category_id, barangay_id, status,
         categories(id, slug, name, default_department_id, handling_level),
         barangays(id, name)`
      )
      .eq("id", reportId)
      .maybeSingle();
    const rep = report as
      | {
          id: string;
          ref_code: string | null;
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
          barangays: { id: string; name: string } | null;
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

    // 2. run the analysis — client verdict first (no server model needed),
    // server CLIP as fallback, text-only routing when there's no photo
    let result: LocalAiResult;
    // a previous BROWSER analysis stored on this report (re-run recovery):
    // rebuild the client verdict from it so re-analysis works even on
    // serverless hosts where server CLIP cannot run
    const previous = clientVerdict ? null : await loadStoredBrowserVerdict(admin, reportId);
    const effectiveVerdict = clientVerdict ?? previous;
    if (effectiveVerdict) {
      result = decideFromClientVerdict(effectiveVerdict, {
        title: rep.title,
        description: rep.description,
        categoryHandling: rep.categories?.handling_level ?? null,
      });
    } else if (photoPath) {
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
            quality: { ok: true }, unrelated: false, analysis_failed: true,
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
        quality: { ok: true }, analysis_failed: false,
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

    // resolved regardless of level — municipal needs it as the primary
    // target, barangay routing falls back to it when no barangay was detected
    const department = pickDepartment(
      departments,
      rep.categories?.default_department_id ?? null,
      departmentHint
    );

    // prefer the AI-matched category (by slug) when the report has none —
    // the citizen form auto-fills it, but only when the match succeeded
    let categoryId = rep.categories?.id ?? null;
    if (!categoryId && result.suggestedCategorySlug) {
      const { data: cat } = await admin
        .from("categories")
        .select("id")
        .eq("slug", result.suggestedCategorySlug)
        .maybeSingle();
      if (cat?.id) categoryId = cat.id as string;
    }

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

    // 5. AUTO-ASSIGN — every report is routed by the AI the moment it is
    //    submitted; admins never choose the unit. Resolution order:
    //      1. barangay-level routing + GPS-detected barangay
    //      2. municipal-level routing + matched department
    //      3. fallback: any matched department (category default / keywords)
    //      4. fallback: the GPS-detected barangay
    //    Only a dead analysis (no verdict at all) escalates to admins.
    let assigned: ServiceResult["assigned_to"] = null;
    const brgyName = rep.barangays?.name ?? "the detected barangay";
    let assignLevel: "barangay" | "municipal" = result.routing?.level ?? "barangay";

    let target: { type: "department" | "barangay"; id: string; name: string } | null = null;
    if (assignLevel === "barangay" && rep.barangay_id) {
      target = { type: "barangay", id: rep.barangay_id, name: brgyName };
    } else if (department) {
      if (assignLevel === "barangay") assignLevel = "municipal"; // routed up: no barangay detected
      target = { type: "department", id: department.id, name: department.name };
    } else if (rep.barangay_id) {
      target = { type: "barangay", id: rep.barangay_id, name: brgyName };
    }

    // idempotency: a report can only ever have one AI assignment — re-runs
    // (admin "Re-run AI check") refresh the classification, never re-route
    const { count: existingAssignments } = await admin
      .from("assignments")
      .select("id", { count: "exact", head: true })
      .eq("report_id", reportId);

    if (target && !result.analysis_failed && !existingAssignments) {
      const isBarangay = target.type === "barangay";
      const issueTitle = result.issue?.title ?? "community issue";
      const confPct = Math.round(result.confidence * 100);
      const note = `AI auto-assignment — ${issueTitle} (${assignLevel} level, ${confPct}% confidence). ${result.urgency?.reason ?? ""}`.trim();

      const { error: assignError } = await admin.from("assignments").insert({
        report_id: reportId,
        assigned_type: isBarangay ? "barangay" : "department",
        department_id: isBarangay ? null : target.id,
        barangay_id: isBarangay ? target.id : null,
        assigned_by: null, // assigned by the AI pipeline (service role)
        note,
      });

      if (!assignError) {
        assigned = target;
        // stamp the routing on the report itself — every list/detail view
        // reads these columns to display "Assigned to X" — and bump the
        // status with the same guard as before: never override an earlier
        // human decision
        const routedPatch: Record<string, string> = {};
        if (isBarangay) routedPatch.barangay_id = target.id;
        else routedPatch.department_id = target.id;
        routedPatch.status = "assigned";
        await admin
          .from("reports")
          .update(routedPatch)
          .eq("id", reportId)
          .eq("status", "submitted"); // no-op when already verified/assigned

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
          .eq(col, target.id);
        if (staff?.length) {
          await admin.from("notifications").insert(
            (staff as { id: string }[]).map((s) => ({
              user_id: s.id,
              report_id: reportId,
              title: `New report assigned — ${rep.ref_code ?? rep.title.slice(0, 40)}`,
              body: `AI routed this ${assignLevel}-level report to you: ${issueTitle}. ${result.urgency ? `Urgency: ${result.urgency.level}.` : ""}`,
              type: "assignment",
            }))
          );
        }

        // notify ALL admins: the report was submitted and auto-assigned —
        // this is the admins' only required touchpoint (oversight, not routing)
        const { data: admins } = await admin.from("users").select("id").eq("role", "admin");
        if (admins?.length) {
          const brgyPart = rep.barangays?.name ? ` in Brgy. ${rep.barangays.name}` : "";
          const flagged = result.needs_review ? " — flagged for admin verification" : "";
          await admin.from("notifications").insert(
            (admins as { id: string }[]).map((a) => ({
              user_id: a.id,
              report_id: reportId,
              title: `Report auto-assigned — ${rep.ref_code ?? ""}`.trim(),
              body: `"${rep.title.slice(0, 80)}"${brgyPart} → ${target.name} (${confPct}% AI confidence${flagged}).`,
              type: "auto_assigned",
            }))
          );
        }
      } else {
        console.error("AI auto-assign failed:", assignError.message);
      }
    }

    // 6. no usable AI signal → escalate to admins (the ONLY case a human
    //    ever looks at routing, and even then re-running the analysis is
    //    the intended fix, not manual assignment)
    if (!assigned) {
      const reason =
        result.needs_review_reason ??
        (result.analysis_failed
          ? "The AI check could not run for this report."
          : "The AI could not identify the issue type or a responsible unit.");
      const { data: admins } = await admin.from("users").select("id").eq("role", "admin");
      if (admins?.length) {
        await admin.from("notifications").insert(
          (admins as { id: string }[]).map((a) => ({
            user_id: a.id,
            report_id: reportId,
            title: `AI review needed — ${rep.ref_code ?? rep.title.slice(0, 40)}`,
            body: `${reason} The report was NOT auto-assigned — try "Re-run AI check" on the report.`,
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
