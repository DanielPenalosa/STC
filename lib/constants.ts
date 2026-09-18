export type Role = "citizen" | "admin" | "department" | "barangay";

export type ReportStatus =
  | "submitted"
  | "under_review"
  | "verified"
  | "assigned"
  | "in_progress"
  | "resolved"
  | "closed";

export type Priority = "low" | "medium" | "high";

/** Status flow: Submitted → Under Review → Verified → Assigned → In Progress → Resolved → Closed */
export const STATUS_FLOW: ReportStatus[] = [
  "submitted",
  "under_review",
  "verified",
  "assigned",
  "in_progress",
  "resolved",
  "closed",
];

export const STATUS_LABELS: Record<ReportStatus, string> = {
  submitted: "Submitted",
  under_review: "Under Review",
  verified: "Verified",
  assigned: "Assigned",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

export const STATUS_COLORS: Record<ReportStatus, string> = {
  submitted: "bg-slate-100 text-slate-700",
  under_review: "bg-warn-100 text-warn-800",
  verified: "bg-accent-100 text-accent-800",
  assigned: "bg-primary-100 text-primary-800",
  in_progress: "bg-accent-100 text-accent-800",
  resolved: "bg-success-100 text-success-800",
  closed: "bg-slate-200 text-slate-600",
};

export const STATUS_DOTS: Record<ReportStatus, string> = {
  submitted: "bg-slate-400",
  under_review: "bg-warn-400",
  verified: "bg-accent-500",
  assigned: "bg-primary-600",
  in_progress: "bg-accent-500",
  resolved: "bg-success-600",
  closed: "bg-slate-600",
};

export const PRIORITY_COLORS: Record<Priority, string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-warn-100 text-warn-800",
  high: "bg-danger-100 text-danger-800",
};

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
