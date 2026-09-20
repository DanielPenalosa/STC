import { Card } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { STATUS_LABELS } from "@/lib/constants";

const STEP_ICONS: Record<string, IconName> = {
  submitted: "send",
  under_review: "search",
  verified: "shield",
  assigned: "clipboard",
  in_progress: "wrench",
  resolved: "check-circle",
  closed: "close",
};

const STEP_ACCENTS: Record<string, string> = {
  submitted: "text-primary-500",
  under_review: "text-warn-500",
  verified: "text-accent-500",
  assigned: "text-primary-500",
  in_progress: "text-accent-500",
  resolved: "text-success-500",
  closed: "text-slate-500",
};

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmt(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const hr12 = h % 12 === 0 ? 12 : h % 12;
  const ampm = h < 12 ? "AM" : "PM";
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${hr12}:${String(d.getMinutes()).padStart(2, "0")} ${ampm}`;
}

type HistoryEntry = {
  id: string;
  from_status: string | null;
  to_status: string;
  note: string | null;
  changed_by: string | null;
  created_at: string;
};

const LABELS: Record<string, string> = {
  submitted: "Created",
  assigned: "Assigned to Department",
  in_progress: "Status Updated",
};

/**
 * Report Timeline — reference-style: bold event label, timestamp under it,
 * "by <name>" on the right, rail-connected status dots.
 */
export default function ActivityLog({
  history,
  actors,
  reporterName,
}: {
  history: HistoryEntry[];
  actors?: Record<string, string | undefined>;
  reporterName?: string;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <Icon name="clock" size="md" className="text-primary-600" />
          Report Timeline
        </p>
        <span className="text-[11px] font-medium text-slate-400">
          {history.length} event{history.length === 1 ? "" : "s"}
        </span>
      </div>

      {history.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-slate-400">
          No activity yet — updates appear here as staff process the report.
        </p>
      ) : (
        <ol className="max-h-[360px] space-y-0 overflow-y-auto px-4 py-3">
          {history.map((h, i) => {
            const isNote = (h.note ?? "").startsWith("Progress note: ");
            const label = isNote
              ? "Progress Note"
              : LABELS[h.to_status] ??
                STATUS_LABELS[h.to_status as keyof typeof STATUS_LABELS] ??
                h.to_status;
            const noteText = isNote ? (h.note ?? "").replace(/^Progress note: /, "") : h.note;
            const by = h.changed_by
              ? (actors?.[h.changed_by] ??
                (h.changed_by && h.id === "created" ? reporterName : undefined) ??
                (h.id === "created" ? reporterName : "Admin"))
              : "System";
            const chip = h.to_status === "in_progress" && !isNote ? "In Progress" : null;

            return (
              <li key={h.id} className="relative flex gap-3 pb-4 last:pb-0">
                {/* rail */}
                {i < history.length - 1 && (
                  <span className="absolute left-[9px] top-5 h-full w-px bg-slate-100" aria-hidden="true" />
                )}
                <span
                  className={`relative z-10 mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full border-2 border-white bg-slate-100 ${
                    STEP_ACCENTS[h.to_status] ?? "text-slate-400"
                  }`}
                >
                  <Icon
                    name={isNote ? "clipboard" : STEP_ICONS[h.to_status] ?? "file"}
                    size="sm"
                    strokeWidth={2.2}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-[13px] font-bold text-slate-800">{label}</p>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {chip && (
                        <span className="rounded-full bg-warn-50 px-2 py-0.5 text-[10px] font-bold text-warn-700">
                          {chip}
                        </span>
                      )}
                      <span className="text-[11px] text-slate-400">by {by}</span>
                    </span>
                  </div>
                  <time className="block text-[11px] text-slate-400">{fmt(h.created_at)}</time>
                  {noteText && (
                    <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-slate-500">
                      {noteText}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
