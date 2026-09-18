import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/analyze — multipart/form-data with `photo` and optional
 * `description`. Proxies to the `analyze-report` Supabase Edge Function,
 * which returns a recommendation (category, department, barangay,
 * confidence). The result is advisory only; admins can accept or override.
 */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey) {
      return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 500 });
    }

    const photo = form.get("photo");
    if (!(photo instanceof File)) {
      return NextResponse.json({ ok: false, error: "photo file required" }, { status: 400 });
    }

    // Upload to a temp path so the vision service can fetch the image
    const path = `ai-temp/${Date.now()}-${photo.name}`;
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { error: upErr } = await supabase.storage
      .from("report-photos")
      .upload(path, photo, { contentType: photo.type });

    let payload: Record<string, unknown>;
    if (upErr) {
      // If storage upload fails (e.g. policy), fall back to passing the raw bytes
      payload = { fileName: photo.name, description: form.get("description") ?? "" };
    } else {
      payload = {
        photoPath: path,
        description: form.get("description") ?? "",
      };
    }

    const fnRes = await fetch(`${supabaseUrl}/functions/v1/analyze-report`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    // Clean up temp file best-effort
    if (!upErr) {
      await supabase.storage.from("report-photos").remove([path]).catch(() => {});
    }

    const json = await fnRes.json().catch(() => ({}));
    if (!fnRes.ok || json.ok === false) {
      return NextResponse.json(
        { ok: false, error: json.error ?? "AI analysis unavailable" },
        { status: 200 }
      );
    }

    return NextResponse.json({
      ok: true,
      detected_issue: json.detected_issue ?? "Unrecognized",
      suggested_category_id: json.suggested_category_id ?? null,
      confidence: json.confidence ?? 0,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "AI analysis failed" },
      { status: 200 }
    );
  }
}
