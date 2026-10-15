/**
 * Shared "UPDATED" highlight pieces for report lists (admin Reports table and
 * the department/barangay staff worklists). Reports re-touched within the
 * window — status change, progress note, re-routing; anything that bumps
 * reports.updated_at — carry the cyan mark until the viewer opens them (see
 * the seen store in lib/report-seen.ts).
 */

/** How long after an update the cyan mark stays on a row. */
export const UPDATED_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Ignore sub-minute created_at↔updated_at jitter so untouched rows never read as updated. */
export const UPDATED_EPSILON_MS = 60_000;

/** Compact "just now" / "12m ago" / "3h ago" / "2d ago" label for the UPDATED chip. */
export function timeAgo(iso: string, nowMs: number): string {
  const diff = Math.max(0, nowMs - new Date(iso).getTime());
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * Cyan "UPDATED" pill — a barangay/department just worked this report, so it
 * rode to the top of the list (sorted by reports.updated_at).
 */
export function UpdatedChip({ ago }: { ago: string }) {
  return (
    <span
      title="Updated by a barangay or department"
      className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-accent-600 px-1.5 py-px align-middle text-[9px] font-extrabold uppercase tracking-wider text-white shadow-sm"
    >
      <span className="live-blink h-1.5 w-1.5 rounded-full bg-white" />
      Updated · {ago}
    </span>
  );
}
