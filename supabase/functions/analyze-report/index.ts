// Supabase Edge Function: analyze-report
//
// Receives { reportId } (and/or { photoUrls, description, categoryId }).
// 1. Loads the report, its photos and location context.
// 2. Calls a computer-vision model to detect the issue in the photo.
// 3. Combines photo + description + category + location to suggest
//    category / department / barangay.
// 4. Writes the recommendation into `ai_analysis` (recommendations ONLY —
//    admins accept or override; low confidence is flagged for manual review).
//
// Configure secrets (Supabase dashboard → Edge Functions → Secrets):
//   AI_VISION_PROVIDER = "openai" | "custom"
//   OPENAI_API_KEY     = sk-...          (if provider = openai)
//   AI_VISION_ENDPOINT = https://...     (if provider = custom)
//   AI_VISION_API_KEY  = ...             (if provider = custom)
//
// Deploy:  supabase functions deploy analyze-report

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const LOW_CONFIDENCE = 0.6;

type Suggestion = {
  detected_issue: string;
  confidence: number;
  suggested_category_slug: string | null;
  suggested_department_slug: string | null;
  suggested_barangay_name: string | null;
  model_used: string;
  raw_response: Record<string, unknown>;
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const body = await req.json();

    /* -------- precheck mode: { photoPath, description } --------
     * Called from POST /api/analyze while a citizen is filling the submit
     * form. Runs the vision model and returns the suggestion WITHOUT
     * writing to ai_analysis. */
    if (!body.reportId && body.photoPath) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const photoUrl = supabase.storage
        .from("report-photos")
        .getPublicUrl(body.photoPath).data.publicUrl;
      const suggestion = await analyzePhoto(photoUrl, {
        title: "",
        description: body.description ?? "",
      });

      let suggestedCategoryId: string | null = null;
      if (suggestion.suggested_category_slug) {
        const { data: cat } = await supabase
          .from("categories")
          .select("id")
          .eq("slug", suggestion.suggested_category_slug)
          .maybeSingle();
        suggestedCategoryId = cat?.id ?? null;
      }

      return new Response(
        JSON.stringify({
          ok: true,
          detected_issue: suggestion.detected_issue,
          suggested_category_id: suggestedCategoryId,
          confidence: suggestion.confidence,
          model_used: suggestion.model_used,
        }),
        { headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    /* -------- full mode: { reportId } -------- */
    const reportId = body.reportId;
    if (!reportId) throw new Error("reportId is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

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
      ? supabase.storage.from("report-photos").getPublicUrl(photos[0].storage_path).data.publicUrl
      : null;

    // 2. Ask the vision model
    const suggestion = await analyzePhoto(photoUrl, report);

    // 3. Resolve slugs/names to UUIDs
    const [category, department, barangay] = await Promise.all([
      suggestion.suggested_category_slug
        ? supabase.from("categories").select("id").eq("slug", suggestion.suggested_category_slug).maybeSingle()
        : Promise.resolve({ data: null }),
      suggestion.suggested_department_slug
        ? supabase.from("departments").select("id").eq("slug", suggestion.suggested_department_slug).maybeSingle()
        : Promise.resolve({ data: null }),
      suggestion.suggested_barangay_name
        ? supabase.from("barangays").select("id").eq("name", suggestion.suggested_barangay_name).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const lowConfidence = (suggestion.confidence ?? 0) < LOW_CONFIDENCE;

    const { data: inserted, error: insertError } = await supabase
      .from("ai_analysis")
      .insert({
        report_id: reportId,
        suggested_category_id: category?.data?.id ?? null,
        suggested_department_id: department?.data?.id ?? null,
        suggested_barangay_id: barangay?.data?.id ?? null,
        detected_issue: suggestion.detected_issue,
        confidence: suggestion.confidence,
        model_used: suggestion.model_used,
        raw_response: suggestion.raw_response,
        status: lowConfidence ? "low_confidence" : "completed",
      })
      .select("id")
      .single();
    if (insertError) throw insertError;

    // Notify admins for manual review when confidence is low
    if (lowConfidence) {
      const { data: admins } = await supabase
        .from("users").select("id").eq("role", "admin");
      if (admins?.length) {
        await supabase.from("notifications").insert(
          admins.map((a: { id: string }) => ({
            user_id: a.id,
            report_id: reportId,
            title: `AI review needed — ${report.title}`,
            body: `Low confidence (${Math.round((suggestion.confidence ?? 0) * 100)}%) — please verify manually.`,
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

/* ---------------- vision provider ---------------- */

async function analyzePhoto(
  photoUrl: string | null,
  report: Record<string, any>
): Promise<Suggestion> {
  const provider = Deno.env.get("AI_VISION_PROVIDER") ?? "openai";

  const categories = [
    "infrastructure", "water-sanitation", "electricity-utilities",
    "environment", "public-safety", "public-facilities", "other",
  ];

  if (provider === "openai" && Deno.env.get("OPENAI_API_KEY")) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a civic-issue computer-vision assistant for a community reporting system. " +
              "Classify the uploaded photo and context into exactly one category slug from: " +
              categories.join(", ") +
              '. Respond JSON: {"detected_issue": string, "confidence": 0-1, ' +
              '"suggested_category_slug": string|null, "notes": string}',
          },
          {
            role: "user",
            content: [
              { type: "text", text: `Report title: ${report.title}\nDescription: ${report.description}` },
              ...(photoUrl
                ? [{ type: "image_url", image_url: { url: photoUrl } }]
                : []),
            ],
          },
        ],
      }),
    });
    const json = await res.json();
    const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}");
    return {
      detected_issue: parsed.detected_issue ?? "Unrecognized",
      confidence: Number(parsed.confidence ?? 0),
      suggested_category_slug: parsed.suggested_category_slug ?? null,
      suggested_department_slug: mapDepartment(parsed.suggested_category_slug),
      suggested_barangay_name: null,
      model_used: "gpt-4o-mini",
      raw_response: parsed,
    };
  }

  if (provider === "custom" && Deno.env.get("AI_VISION_ENDPOINT")) {
    const res = await fetch(Deno.env.get("AI_VISION_ENDPOINT")!, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("AI_VISION_API_KEY") ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ photoUrl, report }),
    });
    const parsed = await res.json();
    return {
      detected_issue: parsed.detected_issue ?? "Unrecognized",
      confidence: Number(parsed.confidence ?? 0),
      suggested_category_slug: parsed.suggested_category_slug ?? null,
      suggested_department_slug: parsed.suggested_department_slug ?? mapDepartment(parsed.suggested_category_slug),
      suggested_barangay_name: parsed.suggested_barangay_name ?? null,
      model_used: parsed.model_used ?? "custom-vision",
      raw_response: parsed,
    };
  }

  // No provider configured — heuristic placeholder so the pipeline works end
  // to end. Replace with a real CV service when the client finalizes one.
  const text = `${report.title} ${report.description}`.toLowerCase();
  const rules: Array<[RegExp, string, string, number]> = [
    [/leak|pipe|plumb/, "Water Leakage", "water-sanitation", 0.72],
    [/flood|baha/, "Flooding", "water-sanitation", 0.7],
    [/garbage|trash|basura|dump/, "Improper Garbage Disposal", "environment", 0.68],
    [/pothole|road damage|crack/, "Damaged Road / Pothole", "infrastructure", 0.66],
    [/street ?light|lamp post/, "Broken Streetlight", "electricity-utilities", 0.65],
    [/tree|branch/, "Fallen Tree", "environment", 0.6],
    [/fire|smoke/, "Fire Hazard", "public-safety", 0.62],
  ];
  for (const [re, issue, slug, conf] of rules) {
    if (re.test(text)) {
      return {
        detected_issue: issue,
        confidence: conf,
        suggested_category_slug: slug,
        suggested_department_slug: mapDepartment(slug),
        suggested_barangay_name: null,
        model_used: "keyword-heuristic",
        raw_response: { source: "keyword-heuristic", text },
      };
    }
  }
  return {
    detected_issue: "Unclassified — manual review",
    confidence: 0.3,
    suggested_category_slug: "other",
    suggested_department_slug: null,
    suggested_barangay_name: null,
    model_used: "keyword-heuristic",
    raw_response: { source: "keyword-heuristic", text },
  };
}

function mapDepartment(categorySlug: string | null): string | null {
  const map: Record<string, string> = {
    "water-sanitation": "water-sanitation",
    infrastructure: "engineering",
    "electricity-utilities": "utilities",
    environment: "environment",
    "public-safety": "public-safety",
    "public-facilities": "engineering",
  };
  return categorySlug ? map[categorySlug] ?? null : null;
}
