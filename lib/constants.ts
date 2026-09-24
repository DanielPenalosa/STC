export type Role = "citizen" | "admin" | "department" | "barangay";

export type ReportStatus =
  | "submitted"
  | "under_review"
  | "verified"
  | "assigned"
  | "in_progress"
  | "done"
  | "resolved"
  | "closed"
  | "rejected";

export type Priority = 1 | 2 | 3 | 4 | 5;

/**
 * Lifecycle v2:
 * Submitted → Under Review → Assigned → In Progress → Done → Resolved
 *                   └─ Rejected (end state)
 * "Done" = department submitted completion; admin then verifies:
 * approve → Resolved · needs revision → back to In Progress
 */
export const STATUS_FLOW: ReportStatus[] = [
  "submitted",
  "under_review",
  "assigned",
  "in_progress",
  "done",
  "resolved",
  "closed",
];

export const STATUS_LABELS: Record<ReportStatus, string> = {
  submitted: "Submitted",
  under_review: "Under Review",
  verified: "Verified",
  assigned: "Assigned",
  in_progress: "In Progress",
  done: "Pending Verification",
  resolved: "Resolved",
  closed: "Closed",
  rejected: "Rejected",
};

export const STATUS_COLORS: Record<ReportStatus, string> = {
  submitted: "bg-slate-100 text-slate-700",
  under_review: "bg-warn-100 text-warn-800",
  verified: "bg-accent-100 text-accent-800",
  assigned: "bg-primary-100 text-primary-800",
  in_progress: "bg-accent-100 text-accent-800",
  done: "bg-primary-100 text-primary-800",
  resolved: "bg-success-100 text-success-800",
  closed: "bg-slate-200 text-slate-600",
  rejected: "bg-danger-100 text-danger-800",
};

export const STATUS_DOTS: Record<ReportStatus, string> = {
  submitted: "bg-slate-400",
  under_review: "bg-warn-400",
  verified: "bg-accent-500",
  assigned: "bg-primary-600",
  in_progress: "bg-accent-500",
  done: "bg-primary-500",
  resolved: "bg-success-600",
  closed: "bg-slate-600",
  rejected: "bg-danger-500",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  1: "Normal",
  2: "Low",
  3: "Medium",
  4: "High",
  5: "Critical",
};

export const PRIORITY_COLORS: Record<Priority, string> = {
  1: "bg-slate-100 text-slate-600",
  2: "bg-sky-100 text-sky-800",
  3: "bg-warn-100 text-warn-800",
  4: "bg-danger-100 text-danger-800",
  5: "bg-danger-600 text-white",
};

/**
 * Follower-count display thresholds — FOLLOWERS NO LONGER AFFECT PRIORITY.
 * Priority is set by the AI from the photo analysis (urgency_priority);
 * kept only for showing "trending"-style engagement on the report page.
 */
export const PRIORITY_THRESHOLDS: { min: number; priority: Priority }[] = [
  { min: 20, priority: 5 },
  { min: 10, priority: 4 },
  { min: 5, priority: 3 },
  { min: 2, priority: 2 },
];

export const ROLE_LABELS: Record<Role, string> = {
  citizen: "Citizen",
  admin: "Administrator",
  department: "Department",
  barangay: "Barangay",
};

/** Category colors are stored per-row; use this as fallback palette. */
export const CATEGORY_COLORS: Record<string, string> = {
  infrastructure: "#F5E606",
  "water-sanitation": "#06ABEA",
  "electricity-utilities": "#2333A0",
  environment: "#2E8254",
  "public-safety": "#DF1B2C",
  "public-facilities": "#5c6cc9",
  other: "#64748b",
};

/** AI suggested default categories (admin-manageable in Categories page). */
export const DEFAULT_CATEGORY_SUGGESTIONS = [
  "Infrastructure",
  "Water & Sanitation",
  "Electricity & Utilities",
  "Environment",
  "Public Safety",
  "Public Facilities",
  "Other",
];

export const CONFIDENCE_THRESHOLD = 0.6; // below → manual review required
export const AI_ANALYSIS_STATUSES = [
  "pending",
  "completed",
  "low_confidence",
  "reviewed",
  "failed",
] as const;
export type AiAnalysisStatus = (typeof AI_ANALYSIS_STATUSES)[number];
