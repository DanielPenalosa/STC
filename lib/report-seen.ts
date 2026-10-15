/**
 * "Seen" tracking for the Reports-list UPDATED highlight.
 *
 * Remembers, per device (localStorage), the newest reports.updated_at the
 * current user has already opened for each report. The list compares that
 * stamp against each row's updated_at, so the cyan highlight disappears the
 * moment a report is clicked/opened — and comes back automatically when a
 * barangay/department updates it again (a strictly newer updated_at).
 *
 * localStorage is per device, not per account; on a shared workstation the
 * last viewer's stamps apply, which matches how these stations are used.
 * All helpers are SSR-safe no-ops and fail soft when storage is blocked.
 */
import { useEffect, useState } from "react";

const SEEN_KEY = "scout:seen-report-updates";
const MAX_SEEN = 200;

/**
 * Reactive view of the seen store: starts empty (SSR-safe) and loads the
 * persisted stamps after mount, so highlights can dismiss across reloads.
 */
export function useSeenUpdates(): Record<string, string> {
  const [seen, setSeen] = useState<Record<string, string>>({});
  useEffect(() => setSeen(readSeenUpdates()), []);
  return seen;
}

export function readSeenUpdates(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    // corrupt JSON or blocked storage — treat as "nothing seen yet"
    return {};
  }
}

export function rememberSeenUpdate(reportId: string, updatedAt: string): void {
  if (typeof window === "undefined") return;
  try {
    const next = { ...readSeenUpdates(), [reportId]: updatedAt };
    // keep only the most recent stamps so the store never bloats
    const trimmed = Object.fromEntries(
      Object.entries(next)
        .sort((a, b) => (a[1] < b[1] ? 1 : -1))
        .slice(0, MAX_SEEN)
    );
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(trimmed));
  } catch {
    // storage full/private mode — highlight simply persists until reopened
  }
}
