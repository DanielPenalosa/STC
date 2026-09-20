// Supabase Edge Function: analyze-report
//
// Modular pipeline (shared logic mirrors lib/ai/vision.ts):
//   Photo Upload → Image Quality Check → Problem Detection →
//   Category Classification → Department Assignment (configurable mapping) →
//   Needs-Review gating → write ai_analysis
//
// Modes:
//   { reportId }                     — full analysis, writes ai_analysis
//   { photoPath, description }       — precheck while citizen fills the form
//
// Configure secrets (Supabase dashboard → Edge Functions → Secrets):
//   OPENAI_API_KEY     = sk-...        (or AI_VISION_ENDPOINT for custom)
//   AI_VISION_ENDPOINT = https://...   (optional custom provider)
//
// Deploy:  supabase functions deploy analyze-report

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CONFIDENCE_THRESHOLD = 0.6;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type CategoryRow = { id: string; slug: string | null; name: string; default_department_id: string | null };
type Issue = {
  detected_issue: string;
  description: string;
  category_slug: string | null;
  confidence: number;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const body = await req.json();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    /* -------- precheck mode: { photoPath, description } -------- */
    if (!body.reportId && body.photoPath) {
      // signed URL works on both public and private buckets (service role)
      const photoUrl = (
        await supabase.storage.from("report-photos").createSignedUrl(body.photoPath, 600)
      ).data?.signedUrl ?? null;
      const { categories } = await loadCategories(supabase);
      const result = await runVision({ imageUrl: photoUrl, context: body.description ?? "", categories });

      let suggestedCategoryId: string | null = null;
      if (result.primary?.category_slug) {
        suggestedCategoryId =
          categories.find(
            (c) => (c.slug ?? "").toLowerCase() === result.primary!.category_slug?.toLowerCase()
          )?.id ?? null;
      }

      return new Response(
        JSON.stringify({
          ok: result.ok,
          detected_issue: result.primary?.detected_issue ?? "Unrecognized",
          description: result.primary?.description ?? null,
          suggested_category_id: suggestedCategoryId,
          confidence: result.primary?.confidence ?? 0,
          needs_review: result.needs_review_reason != null,
          needs_review_reason: result.needs_review_reason,
          secondary_issues: result.secondary.map((s) => s.detected_issue),
          model_used: result.model_used,
        }),
        { headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    /* -------- full mode: { reportId } -------- */
    const reportId = body.reportId;
    if (!reportId) throw new Error("reportId is required");

    // 1. Load report + joins
    const { data: report, error } = await supabase
      .from("reports")
      .select(
        `id, title, description, latitude, longitude, address_text,
         categories(slug, name), barangays(name), departments(slug, name)`
      )
      .eq("id", reportId)
      .single();
    if (error || !report) throw new Error("Report not found");

    const { data: photos } = await supabase
      .from("report_photos")
      .select("storage_path")
      .eq("report_id", reportId)
      .eq("kind", "citizen");
    const photoUrl = photos?.[0]
      ? (
          await supabase.storage
            .from("report-photos")
            .createSignedUrl(photos[0].storage_path, 600)
        ).data?.signedUrl ?? null
      : null;

    const { categories } = await loadCategories(supabase);
    const context =
      `Report title: ${report.title}\nDescription: ${report.description}` +
      (report.barangays?.name ? `\nBarangay: ${report.barangays.name}` : "");

    // 2. Run the vision pipeline
    const result = await runVision({ imageUrl: photoUrl, context, categories });
    const primary = result.primary;

    // 3. Resolve category + department through the CONFIGURABLE mapping
    let categoryId: string | null = null;
    let departmentId: string | null = null;
    if (primary?.category_slug) {
      const cat =
        categories.find((c) => (c.slug ?? "").toLowerCase() === primary.category_slug?.toLowerCase()) ??
        categories.find((c) => c.name.toLowerCase() === primary.category_slug?.toLowerCase());
      if (cat) {
        categoryId = cat.id;
        departmentId = cat.default_department_id; // admin-editable mapping
      }
    }

    const lowConfidence = result.needs_review_reason != null;

    const { data: inserted, error: insertError } = await supabase
      .from("ai_analysis")
      .insert({
        report_id: reportId,
        suggested_category_id: categoryId,
        suggested_department_id: lowConfidence ? null : departmentId,
        suggested_barangay_id: null, // barangay comes from GPS detection, not vision
        detected_issue: primary?.detected_issue ?? "Unrecognized — manual review",
        confidence: primary?.confidence ?? 0,
        model_used: result.model_used,
        raw_response: {
          description: primary?.description ?? null,
          secondary_issues: result.secondary.map((s) => ({
            detected_issue: s.detected_issue,
            category_slug: s.category_slug,
            confidence: s.confidence,
          })),
          quality: result.quality,
          needs_review_reason: result.needs_review_reason,
          provider: result.raw,
        },
        status: lowConfidence ? "low_confidence" : "completed",
      })
      .select("id")
      .single();
    if (insertError) throw insertError;

    // 4. Notify admins for manual review when confidence is low / quality bad
    if (lowConfidence) {
      const { data: admins } = await supabase.from("users").select("id").eq("role", "admin");
      if (admins?.length) {
        await supabase.from("notifications").insert(
          admins.map((a: { id: string }) => ({
            user_id: a.id,
            report_id: reportId,
            title: `AI review needed — ${report.title}`,
            body:
              result.needs_review_reason ??
              `Low confidence (${Math.round((primary?.confidence ?? 0) * 100)}%) — please verify manually.`,
            type: "ai_review",
          }))
        );
      }
    }

    return new Response(JSON.stringify({ ok: true, analysisId: inserted.id }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});

/* ---------------- data helpers ---------------- */

async function loadCategories(supabase: ReturnType<typeof createClient>): Promise<{
  categories: CategoryRow[];
}> {
  const { data } = await supabase
    .from("categories")
    .select("id, slug, name, default_department_id")
    .eq("is_active", true);
  return { categories: (data as unknown as CategoryRow[]) ?? [] };
}

/* ---------------- vision provider (mirrors lib/ai/vision.ts) ---------------- */

type VisionOutcome = {
  ok: boolean;
  quality: { ok: boolean; reason?: string | null } | null;
  primary: Issue | null;
  secondary: Issue[];
  model_used: string;
  needs_review_reason: string | null;
  raw: Record<string, unknown>;
};

async function runVision(input: {
  imageUrl: string | null;
  context: string;
  categories: CategoryRow[];
}): Promise<VisionOutcome> {
  const endpoint = Deno.env.get("AI_VISION_ENDPOINT");
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  const hints = input.categories.map((c) => c.slug ?? c.name.toLowerCase());

  if (!endpoint && !apiKey) {
    // No provider configured — deterministic placeholder so the pipeline
    // works end to end and admins always receive SOMETHING reviewable.
    return {
      ok: false,
      quality: null,
      primary: null,
      secondary: [],
      model_used: "unconfigured",
      needs_review_reason: "AI vision provider is not configured — manual review required.",
      raw: {},
    };
  }

  try {
    let parsed: Record<string, unknown>;
    if (endpoint) {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("AI_VISION_API_KEY") ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ imageUrl: input.imageUrl, context: input.context, categoryHints: hints }),
      });
      if (!res.ok) throw new Error(`Custom vision error ${res.status}`);
      parsed = await res.json();
    } else {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "You are a civic-issue computer-vision assistant for a community reporting system. " +
                "Analyze the photo and report ALL distinct problems you can see. " +
                "For each, pick the single best category slug from: " +
                hints.join(", ") +
                '. Also self-assess image quality. Respond JSON exactly: ' +
                '{"quality": {"ok": boolean, "reason": string|null}, ' +
                '"issues": [{"detected_issue": string, "description": string, ' +
                '"category_slug": string|null, "confidence": number 0-1}]} ' +
                "where issues[0] is the primary problem. " +
                "If the photo is blurry/too dark/blocked, set quality.ok=false with a short reason " +
                "and return an empty issues array.",
            },
            {
              role: "user",
              content: [
                { type: "text", text: input.context },
                ...(input.imageUrl ? [{ type: "image_url", image_url: { url: input.imageUrl } }] : []),
              ],
            },
          ],
        }),
      });
      if (!res.ok) throw new Error(`Vision provider error ${res.status}`);
      const json = await res.json();
      parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}");
    }

    const q = parsed.quality as { ok?: boolean; reason?: string | null } | undefined;
    const quality = q ? { ok: q.ok !== false, reason: q.reason ?? null } : null;
    const rawIssues = Array.isArray(parsed.issues) ? parsed.issues : [];
    const issues: Issue[] = rawIssues
      .map((i) => {
        const issue = i as Record<string, unknown>;
        return {
          detected_issue: String(issue.detected_issue ?? "Unrecognized"),
          description: String(issue.description ?? "").slice(0, 500),
          category_slug: issue.category_slug ? String(issue.category_slug) : null,
          confidence: Math.max(0, Math.min(1, Number(issue.confidence ?? 0))),
        };
      })
      .filter((i) => i.detected_issue);

    if (quality && !quality.ok) {
      return {
        ok: false,
        quality,
        primary: null,
        secondary: [],
        model_used: endpoint ? "custom" : "openai:gpt-4o-mini",
        needs_review_reason: `Photo quality issue (${quality.reason ?? "unknown"}) — manual review.`,
        raw: parsed,
      };
    }
    const [primary, ...secondary] = issues;
    if (!primary) {
      return {
        ok: false,
        quality,
        primary: null,
        secondary: [],
        model_used: endpoint ? "custom" : "openai:gpt-4o-mini",
        needs_review_reason: "No recognizable issue found in the photo.",
        raw: parsed,
      };
    }

    return {
      ok: true,
      quality,
      primary,
      secondary,
      model_used: endpoint ? "custom" : "openai:gpt-4o-mini",
      needs_review_reason:
        primary.confidence < CONFIDENCE_THRESHOLD ? "Low AI confidence" : null,
      raw: parsed,
    };
  } catch (e) {
    return {
      ok: false,
      quality: null,
      primary: null,
      secondary: [],
      model_used: endpoint ? "custom" : "openai:gpt-4o-mini",
      needs_review_reason: `AI unavailable: ${String(e)}`,
      raw: {},
    };
  }
}
