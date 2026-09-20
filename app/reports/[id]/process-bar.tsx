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
  const current = STATUS_FLOW.indexOf(status);

  return (
    <div className={bare ? "" : "rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-4"}>
      <ol className="flex items-start gap-0 overflow-x-auto pb-1">
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
                {/* timestamp */}
                <span className="whitespace-nowrap text-center text-[9px] leading-tight text-slate-400">
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
