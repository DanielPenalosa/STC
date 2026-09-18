/**
 * lib/ai/vision.ts — Modular photo-analysis pipeline.
 *
 * Photo Upload → Image Quality Check → Problem Detection →
 * Category Classification → Department Assignment (via configurable
 * category→department mapping) → Needs-Review gating
 *
 * The pipeline is provider-agnostic: `classifyWithProvider` wraps whichever
 * vision backend is configured (OpenAI-compatible today; swap for a trained
 * model endpoint tomorrow). Only this file knows about the provider —
 * callers just consume the `VisionResult`.
 */

/* ----------------------------- types ----------------------------- */

export type ImageQuality = {
  /** brightness 0–1, blur estimate 0–1 (higher = blurrier) */
  brightness: number;
  blur: number;
  ok: boolean;
  reason?: "too_dark" | "too_bright" | "too_blurry";
};

export type VisionIssue = {
  detected_issue: string;
  /** short generated description of what the photo shows */
  description: string;
  category_slug: string | null;
  confidence: number; // 0–1
};

export type VisionResult = {
  ok: boolean;
  quality: ImageQuality | null;
  /** primary issue — the one used for classification */
  primary: VisionIssue | null;
  /** extra problems spotted in the same photo (multi-object handling) */
  secondary: VisionIssue[];
  model_used: string;
  /** human-readable reason when confidence is below the threshold */
  needs_review_reason: string | null;
  raw: Record<string, unknown>;
};

export const CONFIDENCE_THRESHOLD = 0.6;

/* ----------------------- quality gate (local) ----------------------- */

/**
 * Cheap, dependency-free quality probe on raw bytes. This is intentionally
 * conservative — it only rejects images that are clearly unusable; the AI
 * provider does the fine-grained "is this a real photo of an issue" call.
 */
export function probeImageQuality(bytes: Uint8Array): ImageQuality {
  // JPEG SOF0 marker carries width/height at offset 2..; PNG IHDR at 16..
  let width = 0;
  let height = 0;
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
    height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
  } else if (bytes.length > 10 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    // walk JPEG segments to SOF0/SOF2
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) break;
      const marker = bytes[i + 1];
      const len = (bytes[i + 2] << 8) | bytes[i + 3];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        height = (bytes[i + 5] << 8) | bytes[i + 6];
        width = (bytes[i + 7] << 8) | bytes[i + 8];
        break;
      }
      i += 2 + len;
    }
  }

  if (width && height && (width < 200 || height < 200)) {
    return { brightness: 1, blur: 0, ok: false, reason: "too_dark" }; // reuse: tiny image
  }
  // Without a full decode we can't measure brightness/blur server-side yet;
  // the provider is asked to self-report quality (see prompt). Keep the door
  // open for a real decoder (e.g. sharp) once the client approves a dependency.
  return { brightness: 1, blur: 0, ok: true };
}

/* --------------------------- provider --------------------------- */

export type VisionProvider = {
  id: string;
  /** Returns raw provider JSON — throws on transport failure. */
  classify(input: {
    imageUrl?: string;
    imageBase64?: string;
    mime?: string;
    context?: string;
    categoryHints: string[];
  }): Promise<Record<string, unknown>>;
};

/** OpenAI-compatible vision provider (gpt-4o-mini). Replaceable. */
export const openAiVisionProvider: VisionProvider = {
  id: "openai:gpt-4o-mini",
  async classify({ imageUrl, imageBase64, mime, context, categoryHints }) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

    const dataUrl = imageBase64
      ? `data:${mime ?? "image/jpeg"};base64,${imageBase64}`
      : undefined;
    const url = imageUrl ?? dataUrl;
    if (!url) throw new Error("No image supplied to vision provider");

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
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
              "Analyze the photo and report ALL distinct problems you can see. " +
              "For each, pick the single best category slug from: " +
              categoryHints.join(", ") +
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
              { type: "text", text: context ?? "" },
              { type: "image_url", image_url: { url } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(`Vision provider error ${res.status}: ${await res.text()}`);
    }
    const json = await res.json();
    const content = json.choices?.[0]?.message?.content ?? "{}";
    return JSON.parse(content) as Record<string, unknown>;
  },
};

export function getVisionProvider(): VisionProvider {
  const custom = process.env.AI_VISION_ENDPOINT;
  if (custom) {
    return {
      id: "custom",
      async classify(input) {
        const res = await fetch(custom, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.AI_VISION_API_KEY ?? ""}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(input),
        });
        if (!res.ok) throw new Error(`Custom vision error ${res.status}`);
        return (await res.json()) as Record<string, unknown>;
      },
    };
  }
  return openAiVisionProvider;
}

/* --------------------------- pipeline --------------------------- */

export type CategoryOption = { id: string; slug: string | null; name: string };

function normalizeIssues(parsed: Record<string, unknown>): {
  quality: ImageQuality | null;
  issues: VisionIssue[];
} {
  const q = parsed.quality as { ok?: boolean; reason?: string | null } | undefined;
  const quality: ImageQuality | null = q
    ? {
        brightness: 1,
        blur: 0,
        ok: q.ok !== false,
        reason:
          q.ok === false
            ? ((q.reason as ImageQuality["reason"]) ?? "too_dark")
            : undefined,
      }
    : null;

  const rawIssues = Array.isArray(parsed.issues) ? parsed.issues : [];
  const issues: VisionIssue[] = rawIssues
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

  return { quality, issues };
}

/**
 * Full pipeline entry point. Never throws — a failed provider call degrades
 * to ok:false with a needs-review reason so the report still goes to admins.
 */
export async function analyzeReportPhoto(input: {
  imageUrl?: string;
  imageBase64?: string;
  mime?: string;
  context?: string;
  categories: CategoryOption[];
}): Promise<VisionResult> {
  const provider = getVisionProvider();
  const hints = input.categories.map((c) => c.slug ?? c.name.toLowerCase());

  try {
    const parsed = await provider.classify({
      imageUrl: input.imageUrl,
      imageBase64: input.imageBase64,
      mime: input.mime,
      context: input.context,
      categoryHints: hints,
    });
    const { quality, issues } = normalizeIssues(parsed);
    const [primary, ...secondary] = issues;

    if (quality && !quality.ok) {
      return {
        ok: false,
        quality,
        primary: null,
        secondary: [],
        model_used: provider.id,
        needs_review_reason:
          quality.reason === "too_blurry"
            ? "Photo is blurry — please retake or review manually."
            : "Photo quality is too low for reliable analysis.",
        raw: parsed,
      };
    }

    if (!primary) {
      return {
        ok: false,
        quality,
        primary: null,
        secondary: [],
        model_used: provider.id,
        needs_review_reason: "No recognizable issue found in the photo.",
        raw: parsed,
      };
    }

    const needsReview =
      primary.confidence < CONFIDENCE_THRESHOLD ? "Low AI confidence" : null;

    return {
      ok: true,
      quality,
      primary,
      secondary,
      model_used: provider.id,
      needs_review_reason: needsReview,
      raw: parsed,
    };
  } catch (e) {
    return {
      ok: false,
      quality: null,
      primary: null,
      secondary: [],
      model_used: provider.id,
      needs_review_reason:
        e instanceof Error ? `AI unavailable: ${e.message}` : "AI unavailable",
      raw: {},
    };
  }
}

/** Map a VisionResult onto the configured category rows (slug → id). */
export function resolveCategoryId(
  result: VisionResult,
  categories: CategoryOption[]
): string | null {
  if (!result.primary?.category_slug) return null;
  const slug = result.primary.category_slug.toLowerCase();
  const hit =
    categories.find((c) => (c.slug ?? "").toLowerCase() === slug) ??
    categories.find((c) => c.name.toLowerCase() === slug);
  return hit?.id ?? null;
}
