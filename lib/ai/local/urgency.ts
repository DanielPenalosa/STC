/**
 * lib/ai/local/urgency.ts — transparent urgency scoring.
 *
 * Deliberately rule-based (not a black box): every result carries a
 * human-readable reason, which matters for public-sector accountability.
 * Score inputs:
 *   1. CLIP-detected issue type (safety/health/disruption/utility signals)
 *   2. keywords in the citizen's own description ("live wire", "deep", …)
 */
import { URGENCY_KEYWORDS, type IssueLabel } from "./labels";

export type UrgencyLevel = "low" | "medium" | "high" | "critical";

export type UrgencyResult = {
  level: UrgencyLevel;
  /** 0–1, midpoint of the level band — stored for sorting/analytics */
  score: number;
  reason: string;
};

const BANDS: Record<UrgencyLevel, [number, number]> = {
  low: [0.0, 0.25],
  medium: [0.25, 0.5],
  high: [0.5, 0.75],
  critical: [0.75, 1.0],
};

export function urgencyFromScore(score: number): UrgencyLevel {
  for (const [level, [lo, hi]] of Object.entries(BANDS) as [
    UrgencyLevel,
    [number, number]
  ][]) {
    if (score >= lo && score < hi) return level;
  }
  return "critical";
}

export function scoreUrgency(input: {
  issue: IssueLabel | null;
  title: string;
  description: string;
}): UrgencyResult {
  let score = 0.18; // baseline — a filed report is worth someone's attention
  const reasons: string[] = [];

  // 1. what the photo shows
  if (input.issue) {
    const s = input.issue.signals;
    if (s.safety) {
      score += 0.22;
      reasons.push("possible safety risk");
    }
    if (s.health) {
      score += 0.14;
      reasons.push("sanitation/health concern");
    }
    if (s.disruption) {
      score += 0.12;
      reasons.push("disrupts mobility or services");
    }
    if (s.utility) {
      score += 0.12;
      reasons.push("affects core utilities");
    }
  }

  // 2. what the citizen wrote
  const text = `${input.title} ${input.description}`.toLowerCase();
  let worst: "high" | "critical" | null = null;
  for (const group of URGENCY_KEYWORDS) {
    if (group.words.some((w) => text.includes(w))) {
      reasons.push(`mentions "${group.words.find((w) => text.includes(w))}"`);
      if (group.level === "critical") worst = "critical";
      else if (worst !== "critical") worst = "high";
    }
  }
  if (worst === "critical") score = Math.max(score, 0.82);
  else if (worst === "high") score = Math.max(score, 0.58);

  score = Math.min(1, Math.max(0, score));
  const level = urgencyFromScore(score);

  return {
    level,
    score: Number(((BANDS[level][0] + BANDS[level][1]) / 2).toFixed(2)),
    reason: reasons.length
      ? `Flagged ${level} — ${reasons.slice(0, 3).join("; ")}.`
      : "Standard priority based on the reported issue type.",
  };
}
