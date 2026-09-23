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
import { clipClassify } from "./clip";
import { ISSUE_LABELS, type IssueLabel } from "./labels";
import { decideFromClipScores, type VerdictResult } from "./decision";

export { ISSUE_LABELS };
export type { UrgencyResult } from "./urgency";
export type { RoutingDecision } from "./routing";

export type LocalAiResult = VerdictResult;

function failedResult(error: string, model: string): LocalAiResult {
  return {
    ok: false,
    issue: null,
    issueKey: null,
    secondary: [],
    confidence: 0,
    urgency: null,
    routing: null,
    suggestedCategorySlug: null,
    quality: { ok: true }, // the photo was NOT judged bad — the analysis failed
    unrelated: false,
    analysis_failed: true,
    needs_review: true,
    needs_review_reason: `AI analysis is temporarily unavailable (${error}) — a staff member will review the photo manually.`,
    model_used: model,
  };
}

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

  if (clip.outcome === "failed") {
    return failedResult(clip.error, clip.model);
  }
  if (clip.outcome === "quality") {
    return decideFromClipScores({
      results: [],
      confidence: 0,
      quality: clip.quality,
    });
  }

  // one shared decision core — the browser classifier runs the exact same
  // rules, so the citizen's pre-check and the server's post-submission
  // analysis can never disagree
  return decideFromClipScores({
    results: clip.results.map((r) => ({ key: r.key, score: r.score })),
    confidence: clip.confidence,
    quality: clip.quality,
    title: input.title,
    description: input.description,
    categoryHandling: input.categoryHandling,
  });
}
