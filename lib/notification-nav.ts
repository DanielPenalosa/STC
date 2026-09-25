import type { Notification } from "@/lib/types";

/**
 * Map a notification to the dashboard page whose badge it counts toward.
 * Returns null for non-report notifications (they count on nothing).
 * Mirrors the per-role nav in app/dashboard/layout.tsx. Client-safe pure
 * function — lives outside app/actions because "use server" files may
 * only export async functions.
 */
export function navKeyForNotification(
  n: Notification,
  role: string
): string | null {
  if (!n.report_id) {
    // account events: registrations count on the Users menu (admin only)
    return role === "admin" && n.type === "registration" ? "/dashboard/users" : null;
  }
  switch (n.type) {
    case "assignment": // staff: new work in the unit inbox
      return role === "citizen" ? null : "/dashboard/assigned";
    case "new_report": // admin oversight
    case "verify":
      return role === "admin" ? "/dashboard/reports" : null;
    case "ai_review":
    case "auto_assigned":
      return role === "admin" ? "/dashboard/ai-assignments" : null;
    default:
      // status_change / revision / feedback → unit reports lists
      return role === "citizen" ? "/dashboard/my-reports" : "/dashboard/reports";
  }
}
