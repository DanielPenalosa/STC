/**
 * lib/ai/local/routing.ts — barangay vs municipal routing.
 *
 * Rule-based and admin-configurable (accountability > cleverness):
 *   1. each category row carries handling_level ('barangay'|'municipal')
 *      — admins control the default per category
 *   2. keyword overrides catch clear municipal signals (power lines, major
 *      flooding, roads) and barangay-scale signals (litter, vandalism)
 *   3. municipal reports are routed to the department configured on the
 *      category (default_department_id), refined by keyword hints
 */
import { DEPARTMENT_KEYWORDS } from "./labels";
import type { UrgencyLevel } from "./urgency";

export type HandlingLevel = "barangay" | "municipal";

export type RoutingDecision = {
  level: HandlingLevel;
  reason: string;
  /** slug hint for department matching, municipal only */
  departmentHint: string | null;
};

/** Issues that are almost always municipal responsibilities. */
const MUNICIPAL_SIGNALS: { pattern: RegExp; why: string; hint: string }[] = [
  { pattern: /exposed_wires|traffic_signal|water_leak/, why: "utility infrastructure", hint: "utilities" },
  { pattern: /flooding/, why: "flood response", hint: "disaster" },
  { pattern: /road_damage/, why: "road infrastructure", hint: "engineering" },
  { pattern: /fallen_tree/, why: "heavy debris clearing", hint: "environment" },
];

/** Issues that are typically handled at barangay level. */
const BARANGAY_SIGNALS: { pattern: RegExp; why: string }[] = [
  { pattern: /garbage|graffiti_vandalism|stray_animals/, why: "community-level upkeep" },
];

export function routeReport(input: {
  issueKey: string | null;
  urgency: UrgencyLevel;
  title: string;
  description: string;
  categoryHandling: HandlingLevel | null; // from categories.handling_level
}): RoutingDecision {
  const text = `${input.title} ${input.description}`.toLowerCase();
  const reasons: string[] = [];

  // urgency escalator — high/critical issues rise to municipal coordination
  // even when the category default is barangay (admin can still override)
  const escalated = input.urgency === "high" || input.urgency === "critical";

  // 1. category default (admin-controlled)
  let level: HandlingLevel | null = input.categoryHandling ?? null;
  if (level) reasons.push(`category default: ${level}`);

  // 2. municipal issue signals
  let hint: string | null = null;
  if (input.issueKey) {
    for (const sig of MUNICIPAL_SIGNALS) {
      if (sig.pattern.test(input.issueKey)) {
        level = "municipal";
        hint = sig.hint;
        reasons.push(`${sig.why} is a municipal responsibility`);
        break;
      }
    }
    for (const sig of BARANGAY_SIGNALS) {
      if (sig.pattern.test(input.issueKey)) {
        if (!level) level = "barangay";
        reasons.push(`${sig.why} is usually handled by the barangay`);
        break;
      }
    }
  }

  // 3. text signals — utilities language anywhere in the report
  if (/live wire|power line|electrical|transformer|water main|pipe/i.test(text)) {
    level = "municipal";
    hint = hint ?? "utilities";
    reasons.push("utility infrastructure mentioned");
  }

  // 4. urgency escalation
  if (escalated && level !== "municipal") {
    level = "municipal";
    reasons.push(`${input.urgency} urgency needs municipal coordination`);
  }

  if (!level) {
    level = "barangay";
    reasons.push("default: barangay first response");
  }

  // department keyword refinement
  if (level === "municipal" && !hint) {
    for (const d of DEPARTMENT_KEYWORDS) {
      if (d.patterns.some((p) => p.test(text))) {
        hint = d.departmentSlug;
        break;
      }
    }
  }

  return {
    level,
    reason: `Routed to ${level} — ${reasons.slice(0, 3).join("; ")}.`,
    departmentHint: level === "municipal" ? hint : null,
  };
}
