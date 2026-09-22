/**
 * lib/ai/local/pipeline.ts — one shared pipeline used by BOTH the
 * pre-submission check (/api/analyze) and the post-submission analysis.
 *
 *   image bytes ─→ CLIP zero-shot ─→ primary issue + confidence
 *        + title/description ─→ urgency score (transparent rules)
 *        + category handling_level ─→ barangay/municipal routing
 *
 * All outputs are recommendations. Never throws.
 */
import { clipClassify, type ClipScored } from "./clip";
import { ISSUE_LABELS, categorySlugForIssue, type IssueLabel } from "./labels";
import { scoreUrgency, type UrgencyResult } from "./urgency";
import { routeReport, type RoutingDecision } from "./routing";
import { CONFIDENCE_THRESHOLD } from "@/lib/ai/vision";

export { ISSUE_LABELS };
export type { UrgencyResult, RoutingDecision };

export type LocalAiResult = {
  ok: boolean;
  /** primary detected issue (null → needs review) */
  issue: IssueLabel | null;
  /** CLIP prompt-key of the primary issue */
  issueKey: string | null;
  /** secondary issues spotted in the same photo */
  secondary: { key: string; title: string; score: number }[];
  confidence: number;
  urgency: UrgencyResult | null;
  routing: RoutingDecision | null;
  /** categories.slug matching the detected issue — form auto-fill */
  suggestedCategorySlug: string | null;
  quality: { ok: boolean; reason?: string | null };
  /** photo has nothing to do with civic issues (selfie, food, screenshot…) */
  unrelated: boolean;
  needs_review: boolean;
  needs_review_reason: string | null;
  model_used: string;
};

/** Run the local pipeline on raw image bytes. */
export async function analyzePhotoLocally(input: {
  imageBytes: Uint8Array;
  title?: string;
  description?: string;
  categoryHandling?: "barangay" | "municipal" | null;
}): Promise<LocalAiResult> {
  const labels = ISSUE_LABELS.map((l) => ({
    key: l.key,
    prompt: l.prompt,
  }));
  const UNRELATED_KEY = "unrelated_content";

  const clip = await clipClassify(input.imageBytes, labels);

  if (!clip) {
    return {
      ok: false,
      issue: null,
      issueKey: null,
      secondary: [],
      confidence: 0,
      urgency: null,
      routing: null,
      suggestedCategorySlug: null,
      quality: { ok: false, reason: "undecodable" },
      unrelated: false,
      needs_review: true,
      needs_review_reason:
        "Photo could not be analyzed locally — flagged for manual review.",
      model_used: "local:clip-vit-base-patch32",
    };
  }

  // quality gate — mirror the vision.ts behavior
  if (!clip.quality.ok) {
    const reason =
      clip.quality.reason === "too_blurry"
        ? "Photo appears blurry — please retake it or submit for manual review."
        : clip.quality.reason === "too_dark"
          ? "Photo is too dark to analyze reliably."
          : "Photo quality is too low for reliable analysis.";
    return {
      ok: false,
      issue: null,
      issueKey: null,
      secondary: [],
      confidence: 0,
      urgency: null,
      routing: null,
      suggestedCategorySlug: null,
      quality: clip.quality,
      unrelated: false,
      needs_review: true,
      needs_review_reason: reason,
      model_used: clip.model,
    };
  }

  const best: ClipScored | undefined = clip.results[0];

  // off-topic gate — an "unrelated_content" prompt clearly beating every
  // civic label means the photo isn't about infrastructure at all
  const bestUnrelated = Math.max(
    0,
    ...clip.results.filter((r) => r.key === UNRELATED_KEY).map((r) => r.score)
  );
  const bestCivic = Math.max(
    0,
    ...clip.results
      .filter((r) => r.key !== UNRELATED_KEY && r.key !== "no_issue")
      .map((r) => r.score)
  );
  if (bestUnrelated > 0.15 && bestUnrelated > bestCivic * 1.2) {
    return {
      ok: false,
      issue: null,
      issueKey: null,
      secondary: [],
      confidence: Number(bestUnrelated.toFixed(3)),
      urgency: null,
      routing: null,
      suggestedCategorySlug: null,
      quality: clip.quality,
      unrelated: true,
      needs_review: true,
      needs_review_reason:
        "The photo doesn't appear to show a community infrastructure issue — please upload a photo of the actual problem.",
      model_used: clip.model,
    };
  }

  // "no_issue" winning, or everything below threshold → needs review
  const meaningful = clip.results.filter(
    (r) => r.key !== "no_issue" && r.key !== UNRELATED_KEY && r.score > 0.12
  );
  const primary =
    best && best.key !== "no_issue" && best.score > CONFIDENCE_THRESHOLD * 0.5
      ? ISSUE_LABELS.find((l) => l.key === best.key) ?? null
      : null;

  const secondary = meaningful
    .filter((r) => r.key !== best?.key)
    .slice(0, 3)
    .map((r) => {
      const label = ISSUE_LABELS.find((l) => l.key === r.key);
      return { key: r.key, title: label?.title ?? r.key, score: Number(r.score.toFixed(3)) };
    });

  const confidence = primary ? clip.confidence : Math.min(clip.confidence, 0.45);
  const needsReview =
    !primary || confidence < CONFIDENCE_THRESHOLD || best?.key === "no_issue";

  const urgency = scoreUrgency({
    issue: primary,
    title: input.title ?? "",
    description: input.description ?? "",
  });

  const routing = routeReport({
    issueKey: primary?.key ?? null,
    urgency: urgency.level,
    title: input.title ?? "",
    description: input.description ?? "",
    categoryHandling: input.categoryHandling ?? null,
  });

  return {
    ok: Boolean(primary),
    issue: primary,
    issueKey: primary?.key ?? null,
    secondary,
    confidence,
    urgency,
    routing,
    suggestedCategorySlug: categorySlugForIssue(primary?.key),
    quality: clip.quality,
    unrelated: false,
    needs_review: needsReview,
    needs_review_reason: needsReview
      ? primary
        ? `Low confidence (${Math.round(confidence * 100)}%) — please verify the classification.`
        : "No clear civic issue detected in the photo — manual review recommended."
      : null,
    model_used: clip.model,
  };
}
