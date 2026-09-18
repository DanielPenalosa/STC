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
  submitted: "text-slate-400",
  under_review: "text-warn-500",
  verified: "text-accent-500",
  assigned: "text-primary-500",
  in_progress: "text-accent-500",
  resolved: "text-success-500",
  closed: "text-slate-500",
};

type HistoryEntry = {
  id: string;
  from_status: string | null;
  to_status: string;
  note: string | null;
  created_at: string;
};

/**
 * Activity log — what actually happened, newest last.
 *
 * Unlike the old timeline it shows only real events from `status_history`
 * (status changes + staff progress notes). No "pending" placeholder rows:
 * where the report *is* is already shown by the ProcessBar above; this
 * card answers *what has been done so far and by whom*.
 */
export default function ActivityLog({ history }: { history: HistoryEntry[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <p className="text-sm font-bold text-slate-800">Activity</p>
        <span className="text-[11px] font-medium text-slate-400">
          {history.length} update{history.length === 1 ? "" : "s"}
        </span>
      </div>

      {history.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-slate-400">
          No activity yet — updates appear here as staff process the report.
        </p>
      ) : (
        <ol className="max-h-[320px] space-y-0 overflow-y-auto px-4 py-3">
          {history.map((h, i) => {
            const isNote = (h.note ?? "").startsWith("Progress note: ");
            const label = isNote ? "Progress note" : STATUS_LABELS[h.to_status as keyof typeof STATUS_LABELS] ?? h.to_status;
            const noteText = isNote ? (h.note ?? "").replace(/^Progress note: /, "") : h.note;
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
                    <p className="truncate text-[13px] font-semibold text-slate-700">
                      {label}
                    </p>
                    <time className="shrink-0 text-[11px] text-slate-400">
                      {new Date(h.created_at).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
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
