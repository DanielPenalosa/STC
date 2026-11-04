/**
 * lib/ai/id-verify.ts — Modular ID-verification pipeline.
 *
 * ID Upload → Image Quality Check → ID Detection → OCR →
 * Information Extraction → Validation → Name/Information Matching →
 * Auto Approval or Manual Review
 *
 * Provider-agnostic: the OCR/extraction step wraps any vision+OCR backend.
 * Today that's an OpenAI-compatible model with vision (it both detects the
 * document type and extracts fields); swap `getOcrProvider` for Textract/
 * Vision API/a trained model later without touching callers.
 */

export type IdQuality = {
  ok: boolean;
  reason?: "too_blurry" | "too_dark" | "glare" | "cropped";
};

export type ExtractedId = {
  /** normalized ID type, e.g. "philsys_national_id" */
  id_type: string | null;
  full_name: string | null;
  date_of_birth: string | null;
  id_number: string | null;
  address: string | null;
  expiration_date: string | null;
};

export type AddressValidation = {
  isStaCruz: boolean;
  barangayFound: string | null;
  confidence: "high" | "medium" | "low";
  reason: string;
};

export type IdVerificationResult = {
  ok: boolean;
  /** "not_id" means the model could not find a document in the image */
  detected: boolean;
  quality: IdQuality | null;
  extracted: ExtractedId | null;
  addressValidation: AddressValidation | null;
  /** 0–1 — model's confidence in the extraction */
  ocr_confidence: number;
  /** 0–1 — overall verification score after validation + name matching */
  verification_score: number;
  /** machine-checkable outcome */
  status: "passed" | "needs_review" | "failed";
  /** human-readable reasons for review/rejection (shown to admins) */
  reasons: string[];
  model_used: string;
  raw: Record<string, unknown>;
};

export type NameMatchInput = {
  registeredFullName: string;
  extractedFullName: string | null;
};

/* ------------------------- supported ID types ------------------------- */

export const SUPPORTED_ID_TYPES: Record<string, string[]> = {
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

/** IDs that must not be expired to count as valid. */
const EXPIRING_TYPES = new Set(["drivers_license", "passport", "postal_id"]);

/* --------------------------- name matching --------------------------- */

/**
 * Official barangays of Sta. Cruz, Laguna (26 total).
 */
const STA_CRUZ_BARANGAYS = [
  "Alipit", "Bagumbayan", "Bubukal", "Calios", "Duhat", "Gatid",
  "Jasaan", "Labuin", "Malinao", "Oogong", "Pagsawitan", "Palasan",
  "Patimbao", "Poblacion I", "Poblacion II", "Poblacion III",
  "Poblacion IV", "Poblacion V", "San Jose", "San Juan",
  "San Pablo Norte", "San Pablo Sur", "Santisima Cruz",
  "Santo Angel Central", "Santo Angel Norte", "Santo Angel Sur"
];

/**
 * Validate if an address belongs to Sta. Cruz, Laguna.
 * Checks for municipality name + province + barangay match.
 */
export function validateStaCruzAddress(address: string | null): AddressValidation {
  if (!address || address.trim().length === 0) {
    return {
      isStaCruz: false,
      barangayFound: null,
      confidence: "low",
      reason: "Address field is empty or unreadable"
    };
  }

  const norm = address.toLowerCase()
    .replace(/\./g, "")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Check for Santa Cruz / Sta Cruz variations
  const hasStaCruz = /\b(sta\s*cruz|santa\s+cruz)\b/i.test(address);
  
  // Check for Laguna province
  const hasLaguna = /\blaguna\b/i.test(address);
  
  // Check for explicit OTHER municipalities/provinces that would disqualify
  const otherMunicipalities = [
    "manila", "quezon city", "calamba", "los banos", "bay", "biñan",
    "cabuyao", "san pedro", "pagsanjan", "lumban", "cavite", "batangas",
    "rizal", "bulacan", "pampanga", "tarlac", "nueva ecija", "zambales"
  ];
  
  const hasOtherLocation = otherMunicipalities.some(loc => 
    new RegExp(`\\b${loc}\\b`, "i").test(address)
  );

  // If clearly from another location, reject
  if (hasOtherLocation && !hasStaCruz) {
    return {
      isStaCruz: false,
      barangayFound: null,
      confidence: "high",
      reason: `Address belongs to another municipality/province: ${address}`
    };
  }

  // Check for barangay match
  let matchedBarangay: string | null = null;
  for (const brgy of STA_CRUZ_BARANGAYS) {
    const pattern = new RegExp(`\\b${brgy.replace(/\s+/g, "\\s*")}\\b`, "i");
    if (pattern.test(address)) {
      matchedBarangay = brgy;
      break;
    }
    // Also check for common variations like "Brgy." prefix
    if (new RegExp(`\\bbrgy\\.?\\s*${brgy.replace(/\s+/g, "\\s*")}\\b`, "i").test(address)) {
      matchedBarangay = brgy;
      break;
    }
  }

  // High confidence: Has Sta Cruz + Laguna + valid barangay
  if (hasStaCruz && hasLaguna && matchedBarangay) {
    return {
      isStaCruz: true,
      barangayFound: matchedBarangay,
      confidence: "high",
      reason: `Verified Sta. Cruz, Laguna address with barangay ${matchedBarangay}`
    };
  }

  // HIGH confidence: Has Sta Cruz + Laguna (barangay optional for approval)
  if (hasStaCruz && hasLaguna) {
    return {
      isStaCruz: true,
      barangayFound: matchedBarangay,
      confidence: "high", // Changed from medium to high
      reason: matchedBarangay 
        ? `Verified Sta. Cruz, Laguna with barangay ${matchedBarangay}`
        : "Verified Sta. Cruz, Laguna address"
    };
  }

  // HIGH confidence: Has valid barangay (implies Sta. Cruz)
  if (matchedBarangay && !hasOtherLocation) {
    return {
      isStaCruz: true,
      barangayFound: matchedBarangay,
      confidence: "high", // Changed from medium to high
      reason: `Verified barangay ${matchedBarangay} (official Sta. Cruz barangay)`
    };
  }

  // MEDIUM confidence: Has Sta Cruz but no Laguna (could be another Santa Cruz)
  if (hasStaCruz && !hasLaguna && !hasOtherLocation) {
    return {
      isStaCruz: true, // Changed from false - assume it's the right one
      barangayFound: matchedBarangay,
      confidence: "medium", // Keep as medium for review
      reason: "Address mentions 'Santa Cruz' - assuming Sta. Cruz, Laguna"
    };
  }

  // Default: unclear
  return {
    isStaCruz: false,
    barangayFound: matchedBarangay,
    confidence: "low",
    reason: "Cannot verify if address belongs to Sta. Cruz, Laguna"
  };
}

/**
 * Fuzzy first/last-name match tolerant to OCR noise: tokenizes both names,
 * requires the majority of registered-name tokens to appear in the
 * extracted name (order-insensitive), and tolerates single-character
 * differences (Levenshtein ≤ 1 per token).
 */
export function namesMatch({ registeredFullName, extractedFullName }: NameMatchInput): {
  matched: boolean;
  score: number;
} {
  if (!extractedFullName) return { matched: false, score: 0 };

  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1);

  const reg = norm(registeredFullName);
  const ext = norm(extractedFullName);
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

/* ----------------------------- provider ----------------------------- */

export type OcrProvider = {
  id: string;
  extract(input: {
    imageUrl?: string;
    imageBase64?: string;
    mime?: string;
    supportedTypes: string[];
  }): Promise<Record<string, unknown>>;
};

export const openAiOcrProvider: OcrProvider = {
  id: "openai:gpt-4o-mini-ocr",
  async extract({ imageUrl, imageBase64, mime, supportedTypes }) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

    const url = imageUrl ?? (imageBase64 ? `data:${mime ?? "image/jpeg"};base64,${imageBase64}` : undefined);
    if (!url) throw new Error("No image supplied to OCR provider");

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
              "Supported ID types: " + supportedTypes.join(", ") + ". " +
              'Respond JSON exactly: {"detected": boolean, ' +
              '"quality": {"ok": boolean, "reason": string|null}, ' +
              '"id_type": string|null, "full_name": string|null, ' +
              '"date_of_birth": string|null (YYYY-MM-DD), "id_number": string|null, ' +
              '"address": string|null, "expiration_date": string|null (YYYY-MM-DD), ' +
              '"ocr_confidence": number 0-1}. ' +
              "Never invent field values — use null when unreadable.",
          },
          { role: "user", content: [{ type: "image_url", image_url: { url } }] },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OCR provider error ${res.status}: ${await res.text()}`);
    const json = await res.json();
    return JSON.parse(json.choices?.[0]?.message?.content ?? "{}") as Record<string, unknown>;
  },
};

export function getOcrProvider(): OcrProvider {
  const custom = process.env.AI_OCR_ENDPOINT;
  if (custom) {
    return {
      id: "custom",
      async extract(input) {
        const res = await fetch(custom, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.AI_OCR_API_KEY ?? ""}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(input),
        });
        if (!res.ok) throw new Error(`Custom OCR error ${res.status}`);
        return (await res.json()) as Record<string, unknown>;
      },
    };
  }
  return openAiOcrProvider;
}

/* ----------------------------- pipeline ----------------------------- */

const AUTO_APPROVE_SCORE = 0.75;

export type IdVerificationConfig = {
  /** full name the citizen registered with */
  registeredFullName: string;
  /** require the extracted name to match the registered name */
  requireNameMatch: boolean;
};

/**
 * Full ID-verification pipeline entry point. Never throws — failures degrade
 * to status:"needs_review" so a human always gets the final say.
 */
export async function verifyIdPhoto(input: {
  imageUrl?: string;
  imageBase64?: string;
  mime?: string;
  config: IdVerificationConfig;
}): Promise<IdVerificationResult> {
  const provider = getOcrProvider();
  const reasons: string[] = [];

  try {
    const parsed = await provider.extract({
      imageUrl: input.imageUrl,
      imageBase64: input.imageBase64,
      mime: input.mime,
      supportedTypes: Object.keys(SUPPORTED_ID_TYPES),
    });

    const detected = parsed.detected === true;
    const q = parsed.quality as { ok?: boolean; reason?: string | null } | undefined;
    const quality: IdQuality | null = q
      ? {
          ok: q.ok !== false,
          reason: (q.reason as IdQuality["reason"]) ?? undefined,
        }
      : null;

    const extracted: ExtractedId = {
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
        ok: false,
        detected: false,
        quality,
        extracted,
        addressValidation: null,
        ocr_confidence: ocrConfidence,
        verification_score: 0,
        status: "failed",
        reasons: ["No ID document detected in the image — upload a clear photo of your ID."],
        model_used: provider.id,
        raw: parsed,
      };
    }

    /* ---------- validation rules ---------- */

    // address validation for Sta. Cruz, Laguna residency
    const addressValidation = validateStaCruzAddress(extracted.address);
    
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

    // unrecognized / unsupported ID type
    const typeKey = Object.keys(SUPPORTED_ID_TYPES).find(
      (k) => k === extracted.id_type
    );
    if (!typeKey) {
      reasons.push(
        extracted.id_type
          ? `Unsupported ID type: "${extracted.id_type}".`
          : "ID type could not be determined."
      );
    }

    // required fields readable
    if (!extracted.full_name) reasons.push("Full name is not readable on the ID.");
    if (!extracted.id_number) reasons.push("ID number is not readable.");

    // expiration check for expiring types
    if (extracted.expiration_date && typeKey && EXPIRING_TYPES.has(typeKey)) {
      const exp = new Date(extracted.expiration_date);
      if (!Number.isNaN(exp.getTime()) && exp.getTime() < Date.now()) {
        reasons.push("ID has expired.");
      }
    }

    // name match against registration
    const nameMatch = namesMatch({
      registeredFullName: input.config.registeredFullName,
      extractedFullName: extracted.full_name,
    });
    if (input.config.requireNameMatch && !nameMatch.matched) {
      reasons.push("Name on the ID does not match the registered name.");
    }

    // address residency check
    if (!addressValidation.isStaCruz) {
      if (addressValidation.confidence === "high") {
        // Clearly from another location - auto-reject
        reasons.push(`Address verification failed: ${addressValidation.reason}`);
      } else if (addressValidation.confidence === "medium" || addressValidation.confidence === "low") {
        // Unclear - needs manual review
        reasons.push(`Address needs verification: ${addressValidation.reason}`);
      }
    } else if (addressValidation.confidence === "medium") {
      // Likely Sta. Cruz but not certain - flag for review
      reasons.push(`Address verification uncertain: ${addressValidation.reason}`);
    }

    /* ---------- scoring ---------- */
    let score = ocrConfidence;
    if (typeKey) score += 0.05;
    if (extracted.full_name && extracted.id_number) score += 0.05;
    if (nameMatch.matched) score += 0.1;
    if (addressValidation.isStaCruz && addressValidation.confidence === "high") score += 0.15;
    else if (addressValidation.isStaCruz && addressValidation.confidence === "medium") score += 0.05;
    if (quality && !quality.ok) score -= 0.2;
    if (!addressValidation.isStaCruz && addressValidation.confidence === "high") score -= 0.3; // Clear non-resident
    score = Math.max(0, Math.min(1, score));

    // Determine status based on validation results
    let status: IdVerificationResult["status"];
    
    // Auto-reject if clearly from another location
    if (!addressValidation.isStaCruz && addressValidation.confidence === "high") {
      status = "failed";
    }
    // Auto-approve only if: no issues, high score, verified Sta. Cruz resident
    else if (
      reasons.length === 0 && 
      score >= AUTO_APPROVE_SCORE && 
      addressValidation.isStaCruz && 
      addressValidation.confidence === "high"
    ) {
      status = "passed";
    }
    // Everything else needs manual review
    else {
      status = "needs_review";
    }

    if (status === "needs_review" && reasons.length === 0) {
      reasons.push("Verification score below auto-approval threshold.");
    }

    return {
      ok: true, // the pipeline ran; "needs_review" still routes to a human
      detected: true,
      quality,
      extracted,
      addressValidation,
      ocr_confidence: ocrConfidence,
      verification_score: score,
      status,
      reasons,
      model_used: provider.id,
      raw: parsed,
    };
  } catch (e) {
    return {
      ok: false,
      detected: false,
      quality: null,
      extracted: null,
      addressValidation: null,
      ocr_confidence: 0,
      verification_score: 0,
      status: "needs_review",
      reasons: [
        e instanceof Error
          ? `Verification service unavailable: ${e.message}`
          : "Verification service unavailable",
      ],
      model_used: provider.id,
      raw: {},
    };
  }
}
