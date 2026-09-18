import type { Priority, ReportStatus, Role } from "@/lib/constants";

/* ---------- database row types ---------- */

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  address: string | null;
  role: Role;
  department_id: string | null;
  barangay_id: string | null;
  id_photo_path: string | null;
  verification_status: "pending" | "verified" | "rejected";
  verified_at: string | null;
  verified_by: string | null;
  rejection_reason: string | null;
  id_verification_status: "not_run" | "processing" | "passed" | "needs_review" | "failed" | null;
  id_verification: {
    extracted?: {
      id_type: string | null;
      full_name: string | null;
      date_of_birth: string | null;
      id_number: string | null;
      address: string | null;
      expiration_date: string | null;
    } | null;
    ocr_confidence?: number;
    verification_score?: number;
    reasons?: string[];
    name_match?: { matched: boolean; score: number };
    id_type?: string | null;
    model_used?: string;
    checked_at?: string;
  } | null;
  id_verified_at: string | null;
  is_active: boolean;
  created_at: string;
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  icon: string;
  is_active: boolean;
  default_department_id: string | null;
};

export type Barangay = {
  id: string;
  name: string;
  description: string | null;
  captain_name: string | null;
  contact_number: string | null;
  center_lat: number | null;
  center_lng: number | null;
  is_active: boolean;
};

export type Department = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  head_name: string | null;
  contact_number: string | null;
  color: string;
  is_active: boolean;
};

export type Report = {
  id: string;
  ref_code: string;
  user_id: string;
  category_id: string | null;
  title: string;
  description: string;
  status: ReportStatus;
  priority: Priority;
  is_anonymous: boolean;
  barangay_id: string | null;
  department_id: string | null;
  latitude: number | null;
  longitude: number | null;
  address_text: string | null;
  created_at: string;
  updated_at: string;
  // joined helpers
  profiles?: Profile | null;
  categories?: Category | null;
  barangays?: Barangay | null;
  departments?: Department | null;
};

export type ReportPhoto = {
  id: string;
  report_id: string;
  storage_path: string;
  kind: "citizen" | "resolution";
  caption: string | null;
  created_at: string;
};

export type Assignment = {
  id: string;
  report_id: string;
  assigned_type: "department" | "barangay";
  department_id: string | null;
  barangay_id: string | null;
  assigned_by: string | null;
  note: string | null;
  accepted_at: string | null;
  completed_at: string | null;
  created_at: string;
};

export type StatusHistory = {
  id: string;
  report_id: string;
  from_status: string | null;
  to_status: ReportStatus;
  changed_by: string | null;
  note: string | null;
  created_at: string;
};

export type Notification = {
  id: string;
  user_id: string;
  report_id: string | null;
  title: string;
  body: string;
  type: string;
  is_read: boolean;
  created_at: string;
};

export type AiAnalysis = {
  id: string;
  report_id: string | null;
  suggested_category_id: string | null;
  suggested_department_id: string | null;
  suggested_barangay_id: string | null;
  detected_issue: string | null;
  confidence: number | null;
  model_used: string;
  raw_response: Record<string, unknown>;
  status: "pending" | "completed" | "low_confidence" | "reviewed" | "failed";
  created_at: string;
};

export type AuditLog = {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

export type AppSetting = {
  key: string;
  value: string | null;
};

/* ---------- AI analysis result (from /api/analyze) ---------- */

export type AiSuggestion = {
  detected_issue: string | null;
  suggested_category_id: string | null;
  suggested_department_id: string | null;
  suggested_barangay_id: string | null;
  confidence: number | null;
  model_used: string;
  raw_response: Record<string, unknown>;
  status: "completed" | "low_confidence" | "failed";
};
