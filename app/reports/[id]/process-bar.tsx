import { STATUS_FLOW, STATUS_LABELS } from "@/lib/constants";
import type { ReportStatus } from "@/lib/constants";

/**
 * The report process, made visible.
 *
 * Horizontal stepper showing all seven steps of the lifecycle:
 * Submitted → Under Review → Verified → Assigned → In Progress → Resolved → Closed
 *
 * Every step before the current one is "done", the current step is
 * highlighted, and everything after stays muted — so a citizen or staff
 * member can tell at a glance where the report is in the process.
 */
export default function ProcessBar({ status }: { status: ReportStatus }) {
  const current = STATUS_FLOW.indexOf(status);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-4">
      <ol className="flex items-start gap-0 overflow-x-auto pb-1">
        {STATUS_FLOW.map((step, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={step} className="flex min-w-0 flex-1 items-start">
              <div className="flex min-w-0 flex-col items-center gap-1.5">
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
                  ) : (
                    i + 1
                  )}
                </span>
                {/* label */}
                <span
                  className={`whitespace-nowrap text-center text-[10px] font-semibold leading-tight sm:text-[11px] ${
                    active ? "text-primary-700" : done ? "text-slate-500" : "text-slate-300"
                  }`}
                >
                  {STATUS_LABELS[step]}
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
