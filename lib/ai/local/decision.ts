/**
 * lib/ai/local/decision.ts — the decision core of the AI pipeline, shared
 * by the SERVER pipeline (lib/ai/local/pipeline.ts) and the BROWSER
 * classifier (lib/ai/local/browser-clip.ts).
 *
 * Input: CLIP's scored labels + measured image quality.
 * Output: one LocalAiResult-shaped verdict (issue, confidence, urgency,
 * routing, needs-review). Pure TypeScript — no Node APIs, no imports from
 * server-only modules — so the exact same rules run on both sides and
 * citizen/admin UIs always agree.
 */
import { ISSUE_LABELS, categorySlugForIssue, type IssueLabel } from "./labels";
import { scoreUrgency, type UrgencyResult } from "./urgency";
import { routeReport, type RoutingDecision } from "./routing";
import { CONFIDENCE_THRESHOLD } from "@/lib/ai/vision";

export type VerdictInput = {
  /** CLIP scores, sorted best-first (any order works — it re-sorts) */
  results: { key: string; score: number }[];
  /** how "sure" the winning distribution is, 0–1 (from clipClassify) */
  confidence: number;
  quality: { ok: boolean; reason?: string | null };
  title?: string;
  description?: string;
  categoryHandling?: "barangay" | "municipal" | null;
};

/** Same shape as LocalAiResult (structurally identical). */
export type VerdictResult = {
  ok: boolean;
  issue: IssueLabel | null;
  issueKey: string | null;
  secondary: { key: string; title: string; score: number }[];
  confidence: number;
  urgency: UrgencyResult | null;
  routing: RoutingDecision | null;
  suggestedCategorySlug: string | null;
  quality: { ok: boolean; reason?: string | null };
  unrelated: boolean;
  analysis_failed: boolean;
  needs_review: boolean;
  needs_review_reason: string | null;
  model_used: string;
};

const UNRELATED_KEY = "unrelated_content";

/** Turn raw CLIP scores into the full verdict (never throws). */
export function decideFromClipScores(input: VerdictInput): VerdictResult {
  const model = "local:clip-vit-base-patch32";
  const results = [...input.results]
    .map((r) => ({ ...r, score: Math.max(0, Math.min(1, r.score)) }))
    .sort((a, b) => b.score - a.score);

  // quality gate — the PHOTO was judged unusable (dark/blurry/blown out)
  if (!input.quality.ok) {
    const reason =
      input.quality.reason === "too_blurry"
        ? "Photo appears blurry — please retake it or submit for manual review."
        : input.quality.reason === "too_dark"
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
      quality: input.quality,
      unrelated: false,
      analysis_failed: false,
      needs_review: true,
      needs_review_reason: reason,
      model_used: model,
    };
  }

  const best = results[0];

  // off-topic gate — an "unrelated_content" prompt clearly beating every
  // civic label means the photo isn't about infrastructure at all
  const bestUnrelated = Math.max(
    0,
    ...results.filter((r) => r.key === UNRELATED_KEY).map((r) => r.score)
  );
  const bestCivic = Math.max(
    0,
    ...results
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
      quality: input.quality,
      unrelated: true,
      analysis_failed: false,
      needs_review: true,
      needs_review_reason:
        "The photo doesn't appear to show a community infrastructure issue — please upload a photo of the actual problem.",
      model_used: model,
    };
  }

  // "no_issue" winning, or everything far below the winner → needs review.
  // CLIP's multi-label scores on real phone photos are soft: genuine issues
  // often land at 0.2–0.5 while unrelated prompts soak up probability mass.
  const meaningful = results.filter(
    (r) => r.key !== "no_issue" && r.key !== UNRELATED_KEY && r.score > 0.08
  );
  const primary =
    best &&
    best.key !== "no_issue" &&
    best.key !== UNRELATED_KEY &&
    best.score > 0.15
      ? ISSUE_LABELS.find((l) => l.key === best.key) ?? null
      : null;

  const secondary = meaningful
    .filter((r) => r.key !== best?.key)
    .slice(0, 3)
    .map((r) => {
      const label = ISSUE_LABELS.find((l) => l.key === r.key);
      return { key: r.key, title: label?.title ?? r.key, score: Number(r.score.toFixed(3)) };
    });

  // Recompute confidence the same way clipClassify does, so server and
  // browser always agree even if the caller passes a raw distribution.
  const top = results[0]?.score ?? 0;
  const second = results[1]?.score ?? 0;
  const clipConfidence =
    input.confidence > 0
      ? input.confidence
      : Math.max(top, Math.min(1, top / (top + second + 0.05)));

  const confidence = primary ? clipConfidence : Math.min(clipConfidence, 0.45);
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
    quality: input.quality,
    unrelated: false,
    analysis_failed: false,
    needs_review: needsReview,
    needs_review_reason: needsReview
      ? primary
        ? `Low confidence (${Math.round(confidence * 100)}%) — please verify the classification.`
        : "No clear civic issue detected in the photo — manual review recommended."
      : null,
    model_used: model,
  };
}
