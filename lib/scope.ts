import type { Profile } from "@/lib/types";

/**
 * Jurisdiction helpers for staff (department / barangay) accounts.
 *
 * RLS already hard-enforces that a staff member can only SELECT reports
 * assigned to their unit — these helpers exist so the UI *also* filters
 * explicitly (defense in depth + accurate counts) and so citizens/admin
 * paths can share the same page components.
 */
export type StaffScope = {
  /** "department_id" | "barangay_id" for staff, null for admin/citizen */
  col: "department_id" | "barangay_id" | null;
  /** The profile's unit id, null for admin/citizen */
  id: string | null;
  role: Profile["role"];
  isStaff: boolean;
  /** Human label of the unit, e.g. "Engineering" / "Brgy. San Jose" */
  label: string;
};

export function scopeFor(
  profile: Profile,
  unitName?: string | null
): StaffScope {
  const isStaff = profile.role === "department" || profile.role === "barangay";
  const col = isStaff
    ? profile.role === "department"
      ? ("department_id" as const)
      : ("barangay_id" as const)
    : null;
  const id = isStaff
    ? profile.role === "department"
      ? profile.department_id
      : profile.barangay_id
    : null;
  const label =
    unitName ??
    (profile.role === "department" ? "Your department" : "Your barangay");

  return { col, id, role: profile.role, isStaff, label };
}

/** Apply the staff filter to a Supabase query builder (no-op for admin). */
export function applyScope<T extends { eq: (c: string, v: string) => T }>(
  query: T,
  scope: StaffScope
): T {
  if (scope.col && scope.id) return query.eq(scope.col, scope.id);
  return query;
}
