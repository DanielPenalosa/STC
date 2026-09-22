/**
 * lib/ai/local/labels.ts — the zero-shot vocabulary.
 *
 * CLIP compares the photo against plain-English prompts. Each label maps to:
 *   - a canonical issue key (persisted in ai_analysis.raw_response)
 *   - urgency signals used by lib/ai/local/urgency.ts
 *
 * This is the only file you touch to teach the free model new problem types —
 * no retraining, no API, no cost. Admin-managed categories are matched to
 * these keys fuzzily at runtime (see matchCategory).
 */

export type IssueLabel = {
  key: string;
  /** prompt shown to CLIP — descriptive scene language works best */
  prompt: string;
  /** human phrase for the citizen UI, e.g. "Road damage" */
  title: string;
  /** urgency heuristics consumed by the scorer */
  signals: {
    safety?: boolean; // risk of injury
    health?: boolean; // sanitation / disease vector
    disruption?: boolean; // blocks mobility / services
    utility?: boolean; // core services (water/power)
  };
  /** slug of the categories row this issue maps to (auto-fill) */
  categorySlug: string;
};

export const ISSUE_LABELS: IssueLabel[] = [
  {
    key: "road_damage",
    title: "Road damage",
    prompt: "a large pothole or broken road surface damage",
    signals: { safety: true, disruption: true },
    categorySlug: "infrastructure",
  },
  {
    key: "flooding",
    title: "Flooding",
    prompt: "a flooded street with deep standing floodwater",
    signals: { safety: true, health: true, disruption: true },
    categorySlug: "water-sanitation",
  },
  {
    key: "fallen_tree",
    title: "Fallen tree / debris",
    prompt: "a large fallen tree branch or storm debris blocking the way",
    signals: { safety: true, disruption: true },
    categorySlug: "environment",
  },
  {
    key: "exposed_wires",
    title: "Fallen or exposed power lines",
    prompt: "fallen or dangling electrical power lines and exposed wires",
    signals: { safety: true, utility: true },
    categorySlug: "electricity-utilities",
  },
  {
    key: "water_leak",
    title: "Water leak / pipe break",
    prompt: "a burst water pipe or leaking water main gushing water",
    signals: { utility: true, disruption: true },
    categorySlug: "water-sanitation",
  },
  {
    key: "broken_streetlight",
    title: "Broken streetlight",
    prompt: "a broken or dark streetlight lamp post at nighttime",
    signals: { safety: true },
    categorySlug: "electricity-utilities",
  },
  {
    key: "garbage",
    title: "Garbage / illegal dumping",
    prompt: "piles of garbage and trash bags illegally dumped in public",
    signals: { health: true },
    categorySlug: "environment",
  },
  {
    key: "blocked_drainage",
    title: "Clogged drainage",
    prompt: "a storm drain clogged with debris and dirty water overflowing",
    signals: { health: true, disruption: true },
    categorySlug: "water-sanitation",
  },
  {
    key: "broken_infrastructure",
    title: "Damaged public facility",
    prompt: "a broken or damaged public facility like a collapsed fence or destroyed bench",
    signals: { safety: true },
    categorySlug: "public-facilities",
  },
  {
    key: "graffiti_vandalism",
    title: "Vandalism",
    prompt: "graffiti vandalism sprayed on a public wall",
    signals: {},
    categorySlug: "public-safety",
  },
  {
    key: "stray_animals",
    title: "Stray animals",
    prompt: "stray dogs loose on a public street",
    signals: { safety: true },
    categorySlug: "public-safety",
  },
  {
    key: "traffic_signal",
    title: "Broken traffic signal / sign",
    prompt: "a broken or knocked-down traffic sign or traffic light",
    signals: { safety: true, disruption: true },
    categorySlug: "public-safety",
  },
  {
    key: "sidewalk_damage",
    title: "Sidewalk damage",
    prompt: "a cracked broken sidewalk with uneven pavement",
    signals: { safety: true },
    categorySlug: "infrastructure",
  },
  {
    key: "no_issue",
    title: "No visible issue",
    prompt: "an ordinary clean street scene with no problems",
    signals: {},
    categorySlug: "other",
  },

  // ---- off-topic detector (shared key "unrelated_content") ----------------
  // Not a civic issue type: these prompts catch photos that have nothing to
  // do with public infrastructure (selfies, food, pets, screenshots…). The
  // pipeline flags the photo as UNRELATED when one of these clearly beats
  // every civic label — the citizen is asked to upload a real photo instead.
  {
    key: "unrelated_content",
    title: "Unrelated photo",
    prompt: "a close-up selfie portrait of a person's face",
    signals: {},
    categorySlug: "other",
  },
  {
    key: "unrelated_content",
    title: "Unrelated photo",
    prompt: "food and drinks on a dining table at home",
    signals: {},
    categorySlug: "other",
  },
  {
    key: "unrelated_content",
    title: "Unrelated photo",
    prompt: "a pet cat or dog inside a house",
    signals: {},
    categorySlug: "other",
  },
  {
    key: "unrelated_content",
    title: "Unrelated photo",
    prompt: "a screenshot of text on a phone or computer screen",
    signals: {},
    categorySlug: "other",
  },
];

/** Category slug for an issue key — used to auto-fill the citizen form. */
export function categorySlugForIssue(
  key: string | null | undefined
): string | null {
  if (!key) return null;
  return ISSUE_LABELS.find((l) => l.key === key)?.categorySlug ?? null;
}

/** Keywords used to upgrade urgency from the citizen's own description. */
export const URGENCY_KEYWORDS: {
  words: string[];
  level: "high" | "critical";
}[] = [
  { words: ["live wire", "sparking", "electrocution", "electrocuted"], level: "critical" },
  { words: ["open manhole", "sinkhole", "collapse", "collapsed"], level: "critical" },
  { words: ["fire", "burning", "smoke"], level: "critical" },
  { words: ["deep", "huge", "massive", "dangerous", "child", "accident", "hit"], level: "high" },
  { words: ["flood", "raging", "rising", "overflowing", "rushing"], level: "high" },
  { words: ["sewage", "septic", "contaminated", "dengue", "mosquito"], level: "high" },
  { words: ["night", "dark", "unlit", "cannot see"], level: "high" },
  { words: ["blocked", "cannot pass", "trapped", "stranded"], level: "high" },
];

/** Department-routing keywords (used for municipal-level reports). */
export const DEPARTMENT_KEYWORDS: {
  patterns: RegExp[];
  departmentSlug: string;
}[] = [
  {
    // Engineering / roads / public works
    departmentSlug: "engineering",
    patterns: [/road/i, /pothole/i, /bridge/i, /drainage/i, /sidewalk/i, /flood control/i, /canal/i],
  },
  {
    departmentSlug: "environment",
    patterns: [/garbage/i, /trash/i, /waste/i, /dumping/i, /tree/i, /estero/i, /pollution/i, /sewage/i],
  },
  {
    // Disaster risk reduction
    departmentSlug: "disaster",
    patterns: [/flood/i, /landslide/i, /typhoon/i, /storm/i, /earthquake/i, /evacuat/i, /raging/i, /emergency/i],
  },
  {
    departmentSlug: "utilities",
    patterns: [/water/i, /pipe/i, /leak/i, /electric/i, /power/i, /streetlight/i, /post/i, /wire/i, /brownout/i],
  },
  {
    departmentSlug: "public-safety",
    patterns: [/stray/i, /dog/i, /danger/i, /safety/i, /signal/i, /traffic/i, /sign/i, /crime/i],
  },
];
