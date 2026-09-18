// Supabase Edge Function: verify-id
//
// Modular ID-verification pipeline (mirrors lib/ai/id-verify.ts):
//   ID Upload → Image Quality Check → ID Detection → OCR →
//   Information Extraction → Validation → Name Matching →
//   Auto Approval or Manual Review
//
// Input:  { userId, idPath, registeredFullName }
// Output: { ok, status: passed|needs_review|failed, verification_score,
//           ocr_confidence, extracted, reasons, id_type }
//
// The caller (Next.js server action /api/upload-id → verify-id) persists the
// result onto users.id_verification* and auto-approves the account only when
// status = "passed" and confidence is high. This function NEVER writes to the
// users table itself — separation so a model swap can't silently grant access.
//
// Configure secrets: OPENAI_API_KEY (or AI_OCR_ENDPOINT for a custom OCR).
// Deploy: supabase functions deploy verify-id

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const AUTO_APPROVE_SCORE = 0.75;

const SUPPORTED_ID_TYPES: Record<string, string[]> = {
  philsys_national_id: ["philsys", "national id", "pambansang pagkakakilanlan"],
  drivers_license: ["driver", "lto", "license"],
  passport: ["passport", "pasaporte"],
  umid: ["umid", "unified multi-purpose"],
  philhealth: ["philhealth"],
  voters_id: ["voters", "comelec"],
  postal_id: ["postal"],
  prc_id: ["prc", "professional regulation"],
  senior_citizen_id: ["senior"],
  tin_id: ["tin", "bir"],
};
const EXPIRING_TYPES = new Set(["drivers_license", "passport", "postal_id"]);

type Extracted = {
  id_type: string | null;
  full_name: string | null;
  date_of_birth: string | null;
  id_number: string | null;
  address: string | null;
  expiration_date: string | null;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const body = await req.json();
    const { userId, idPath, registeredFullName } = body as {
      userId?: string;
      idPath?: string;
      registeredFullName?: string;
    };
    if (!userId || !idPath || !registeredFullName) {
      return new Response(
        JSON.stringify({ ok: false, error: "userId, idPath and registeredFullName are required" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // private bucket → short-lived signed URL for the vision model
    const { data: signed, error: signErr } = await supabase.storage
      .from("verification-ids")
      .createSignedUrl(idPath, 120);
    if (signErr || !signed) throw signErr ?? new Error("Could not read ID photo");

    const result = await verifyId({
      imageUrl: signed.signedUrl,
      registeredFullName,
    });

    // persist the AI verdict (service role bypasses the guard trigger)
    const { error: upErr } = await supabase
      .from("users")
      .update({
        id_verification_status: result.status,
        id_verification: {
          extracted: result.extracted,
          ocr_confidence: result.ocr_confidence,
          verification_score: result.verification_score,
          reasons: result.reasons,
          name_match: result.nameMatch,
          id_type: result.idType,
          model_used: result.model_used,
          checked_at: new Date().toISOString(),
        },
        id_verified_at: new Date().toISOString(),
      })
      .eq("id", userId);
    if (upErr) throw upErr;

    return new Response(
      JSON.stringify({
        ok: result.status !== "failed",
        status: result.status,
        verification_score: result.verification_score,
        ocr_confidence: result.ocr_confidence,
        extracted: result.extracted,
        reasons: result.reasons,
        id_type: result.idType,
      }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});

/* ---------------- OCR / extraction provider ---------------- */

async function verifyId(input: {
  imageUrl: string;
  registeredFullName: string;
}): Promise<{
  status: "passed" | "needs_review" | "failed";
  verification_score: number;
  ocr_confidence: number;
  extracted: Extracted | null;
  reasons: string[];
  nameMatch: { matched: boolean; score: number };
  idType: string | null;
  model_used: string;
}> {
  const endpoint = Deno.env.get("AI_OCR_ENDPOINT");
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  const reasons: string[] = [];

  if (!endpoint && !apiKey) {
    return {
      status: "needs_review",
      verification_score: 0,
      ocr_confidence: 0,
      extracted: null,
      reasons: ["AI verification service is not configured — manual review required."],
      nameMatch: { matched: false, score: 0 },
      idType: null,
      model_used: "unconfigured",
    };
  }

  let parsed: Record<string, unknown>;
  try {
    if (endpoint) {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("AI_OCR_API_KEY") ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(`Custom OCR error ${res.status}`);
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
                "You are an ID document verification assistant. Examine the image: " +
                "(1) decide whether it contains a photo of an identification document; " +
                "(2) assess capture quality (blur, darkness, glare, cropping); " +
                "(3) if an ID is present, OCR its fields. " +
                "Supported ID types: " + Object.keys(SUPPORTED_ID_TYPES).join(", ") + ". " +
                'Respond JSON exactly: {"detected": boolean, ' +
                '"quality": {"ok": boolean, "reason": string|null}, ' +
                '"id_type": string|null, "full_name": string|null, ' +
                '"date_of_birth": string|null (YYYY-MM-DD), "id_number": string|null, ' +
                '"address": string|null, "expiration_date": string|null (YYYY-MM-DD), ' +
                '"ocr_confidence": number 0-1}. ' +
                "Never invent field values — use null when unreadable.",
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Registered full name: ${input.registeredFullName}`,
                },
                { type: "image_url", image_url: { url: input.imageUrl } },
              ],
            },
          ],
        }),
      });
      if (!res.ok) throw new Error(`OCR provider error ${res.status}`);
      const json = await res.json();
      parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}");
    }
  } catch (e) {
    return {
      status: "needs_review",
      verification_score: 0,
      ocr_confidence: 0,
      extracted: null,
      reasons: [`Verification service unavailable: ${String(e)}`],
      nameMatch: { matched: false, score: 0 },
      idType: null,
      model_used: endpoint ? "custom" : "openai:gpt-4o-mini",
    };
  }

  const detected = parsed.detected === true;
  const q = parsed.quality as { ok?: boolean; reason?: string | null } | undefined;
  const quality = q ? { ok: q.ok !== false, reason: q.reason ?? null } : null;

  const extracted: Extracted = {
    id_type: parsed.id_type ? String(parsed.id_type) : null,
    full_name: parsed.full_name ? String(parsed.full_name) : null,
    date_of_birth: parsed.date_of_birth ? String(parsed.date_of_birth) : null,
    id_number: parsed.id_number ? String(parsed.id_number) : null,
    address: parsed.address ? String(parsed.address) : null,
    expiration_date: parsed.expiration_date ? String(parsed.expiration_date) : null,
  };
  const ocrConfidence = Math.max(0, Math.min(1, Number(parsed.ocr_confidence ?? 0)));

  if (!detected) {
    return {
      status: "failed",
      verification_score: 0,
      ocr_confidence: ocrConfidence,
      extracted,
      reasons: ["No ID document detected in the image."],
      nameMatch: { matched: false, score: 0 },
      idType: null,
      model_used: endpoint ? "custom" : "openai:gpt-4o-mini",
    };
  }

  /* ---------- validation rules ---------- */
  if (quality && !quality.ok) {
    reasons.push(
      quality.reason === "glare"
        ? "Glare covers part of the ID."
        : quality.reason === "cropped"
        ? "ID is cropped — all corners must be visible."
        : quality.reason === "too_dark"
        ? "Photo is too dark."
        : "Photo is blurry — retake with a steady camera."
    );
  }

  const typeKey = Object.keys(SUPPORTED_ID_TYPES).find((k) => k === extracted.id_type);
  if (!typeKey) {
    reasons.push(
      extracted.id_type
        ? `Unsupported ID type: "${extracted.id_type}".`
        : "ID type could not be determined."
    );
  }

  if (!extracted.full_name) reasons.push("Full name is not readable on the ID.");
  if (!extracted.id_number) reasons.push("ID number is not readable.");

  if (extracted.expiration_date && typeKey && EXPIRING_TYPES.has(typeKey)) {
    const exp = new Date(extracted.expiration_date);
    if (!Number.isNaN(exp.getTime()) && exp.getTime() < Date.now()) {
      reasons.push("ID has expired.");
    }
  }

  const nameMatch = fuzzyNameMatch(input.registeredFullName, extracted.full_name);
  if (!nameMatch.matched) {
    reasons.push("Name on the ID does not match the registered name.");
  }

  /* ---------- scoring ---------- */
  let score = ocrConfidence;
  if (typeKey) score += 0.05;
  if (extracted.full_name && extracted.id_number) score += 0.05;
  if (nameMatch.matched) score += 0.1;
  if (quality && !quality.ok) score -= 0.2;
  score = Math.max(0, Math.min(1, score));

  const nameMismatch = reasons.some((r) => r.startsWith("Name on the ID"));
  const status: "passed" | "needs_review" | "failed" =
    reasons.length === 0 && score >= AUTO_APPROVE_SCORE
      ? "passed"
      : nameMismatch
      ? "needs_review" // a human must look at name mismatches — never auto-approve
      : reasons.length > 0
      ? "needs_review"
      : "needs_review";

  if (status === "needs_review" && reasons.length === 0) {
    reasons.push("Verification score below auto-approval threshold.");
  }

  return {
    status,
    verification_score: score,
    ocr_confidence: ocrConfidence,
    extracted,
    reasons,
    nameMatch,
    idType: typeKey ?? extracted.id_type,
    model_used: endpoint ? "custom" : "openai:gpt-4o-mini",
  };
}

/* ---------------- fuzzy name matching (mirrors lib/ai/id-verify.ts) ---------------- */

function norm(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[n];
}

function fuzzyNameMatch(registered: string, extracted: string | null): { matched: boolean; score: number } {
  if (!extracted) return { matched: false, score: 0 };
  const reg = norm(registered);
  const ext = norm(extracted);
  if (!reg.length || !ext.length) return { matched: false, score: 0 };

  let hits = 0;
  for (const rt of reg) {
    if (ext.includes(rt)) {
      hits++;
      continue;
    }
    const near = ext.some((et) => Math.abs(et.length - rt.length) <= 2 && levenshtein(et, rt) <= 1);
    if (near) hits++;
  }
  const score = hits / reg.length;
  return { matched: score >= 0.6, score };
}
