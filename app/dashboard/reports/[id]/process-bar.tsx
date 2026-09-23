import { STATUS_FLOW, STATUS_LABELS } from "@/lib/constants";
import type { ReportStatus } from "@/lib/constants";

/**
 * The report process, made visible — reference-style stepper.
 *
 * Every step before the current one is a green check with its timestamp,
 * the current step is a bold blue dot, and everything after stays muted.
 */
export default function ProcessBar({
  status,
  dates,
  bare = false,
}: {
  status: ReportStatus;
  /** first timestamp each status was reached, keyed by status */
  dates?: Partial<Record<ReportStatus, string>>;
  /** bare = no card chrome (embed inside another card) */
  bare?: boolean;
}) {
  // Rejected isn't a step in the flow — it can happen from review onward.
  // Show the stepper frozen at Under Review with a rejected flag.
  const rejected = status === "rejected";
  const effective = rejected ? ("under_review" as ReportStatus) : status;
  const current = STATUS_FLOW.indexOf(effective);

  if (rejected) {
    return (
      <div className={bare ? "" : "rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-4"}>
        <div className="flex items-center gap-2.5 rounded-lg bg-danger-50 px-3.5 py-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-danger-600 text-white">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </span>
          <div>
            <p className="text-sm font-bold text-danger-700">Report rejected</p>
            <p className="text-xs text-danger-600/80">This report was not accepted for action. See the timeline for the reason.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={bare ? "" : "rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-4"}>
      <ol className="-mx-1 flex items-start gap-0 overflow-x-auto px-1 pb-1">
        {STATUS_FLOW.map((step, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={step} className="flex min-w-0 flex-1 items-start">
              <div className="flex min-w-0 flex-col items-center gap-1">
                {/* node */}
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition ${
                    done
                      ? "bg-success-500 text-white"
                      : active
                      ? "bg-primary-600 text-white ring-4 ring-primary-100"
                      : "border border-slate-200 bg-white text-slate-300"
                  }`}
                >
                  {done ? (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4.5 12.5l5 5 10-11" />
                    </svg>
                  ) : active ? (
                    <span className="h-2 w-2 rounded-full bg-white" />
                  ) : (
                    i + 1
                  )}
                </span>
                {/* label */}
                <span
                  className={`whitespace-nowrap text-center text-[10px] font-bold leading-tight sm:text-[11px] ${
                    active ? "text-primary-700" : done ? "text-slate-600" : "text-slate-300"
                  }`}
                >
                  {STATUS_LABELS[step]}
                </span>
                {/* timestamp — hidden on phones where 7 steps don't fit
                    horizontally; the timeline below carries the dates */}
                <span className="hidden whitespace-nowrap text-center text-[9px] leading-tight text-slate-400 sm:block">
                  {done || active ? dates?.[step] ?? "" : ""}
                </span>
              </div>
              {/* connector */}
              {i < STATUS_FLOW.length - 1 && (
                <span
                  className={`mt-3 h-0.5 flex-1 rounded ${
                    i < current ? "bg-success-400" : "bg-slate-100"
                  }`}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
