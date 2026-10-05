/**
 * status_history helpers shared by every Report Timeline view.
 *
 * A single staff status update can write TWO rows: the
 * `on_report_status_change` DB trigger inserts one automatically, and the
 * server action inserts a second one carrying the staff member's note.
 * Rendering both made timelines show the same transition twice
 * ("Work Started / Work Started", "done / done"). Views should map over
 * `collapseStatusHistory(history)` instead of the raw rows.
 */

export type StatusHistoryLike = {
  to_status: string;
  note: string | null;
  created_at: string;
};

/** addProgressNote() stamps its note-only rows with this prefix. */
export const PROGRESS_NOTE_PREFIX = "Progress note: ";

/** True for note-only rows (a remark, not a status transition). */
export function isProgressNote(note: string | null): boolean {
  return (note ?? "").startsWith(PROGRESS_NOTE_PREFIX);
}

/** The remark text without the stored prefix. */
export function progressNoteText(note: string | null): string {
  return (note ?? "").replace(PROGRESS_NOTE_PREFIX, "");
}

/**
 * Merge the duplicated rows of ONE status transition (the trigger's row plus
 * the noted row the action inserts) into a single event: earliest timestamp,
 * the informative note. Note-only "Progress note" rows and genuinely separate
 * remarks are never merged — they are their own events.
 */
export function collapseStatusHistory<T extends StatusHistoryLike>(
  history: T[]
): T[] {
  const out: T[] = [];
  for (const row of history) {
    const prev = out[out.length - 1];
    const mergeable =
      prev &&
      !isProgressNote(row.note) &&
      !isProgressNote(prev.note) &&
      prev.to_status === row.to_status &&
      // two separate remarks on the same standing status stay separate events
      (!prev.note || !row.note);
    if (mergeable) {
      out[out.length - 1] = { ...prev, note: prev.note ?? row.note };
      continue;
    }
    out.push(row);
  }
  return out;
}

export type TimelineEvent = StatusHistoryLike & {
  /** note-only remark ("Progress note: …"), not a status transition */
  isNote: boolean;
  /** the entry matching the report's CURRENT status — rendered highlighted */
  current: boolean;
};

/**
 * Normalize status_history for display so a Report Timeline is always
 * accurate to the report's actual status:
 *  - starts at submission (synthetic "Created" entry at report creation time)
 *  - collapses the duplicated trigger/note rows of a single transition
 *  - keeps note-only progress remarks as their own events
 *  - marks — and, when history never recorded it, appends — the report's real
 *    current status, so the highlighted entry always matches the status badge
 */
export function buildTimeline(
  history: StatusHistoryLike[],
  status: string,
  createdAt: string
): TimelineEvent[] {
  const rows = collapseStatusHistory(history).filter(
    // the synthetic Created entry below replaces these
    (r) => r.to_status !== "submitted" || isProgressNote(r.note)
  );
  const events: TimelineEvent[] = rows.map((r) => ({
    ...r,
    isNote: isProgressNote(r.note),
    current: false,
  }));

  // anchor the timeline at creation, like the full Report Timeline card
  events.unshift({
    to_status: "submitted",
    note: null,
    created_at: createdAt,
    isNote: false,
    current: false,
  });

  let currentIdx = -1;
  for (let i = events.length - 1; i >= 0; i--) {
    if (!events[i].isNote && events[i].to_status === status) {
      currentIdx = i;
      break;
    }
  }
  if (currentIdx === -1) {
    // history never recorded the report's status — append it so the timeline
    // ends on the status shown at the top of the panel
    events.push({
      to_status: status,
      note: null,
      created_at: events[events.length - 1]?.created_at ?? createdAt,
      isNote: false,
      current: true,
    });
  } else {
    events[currentIdx].current = true;
  }

  return events;
}
