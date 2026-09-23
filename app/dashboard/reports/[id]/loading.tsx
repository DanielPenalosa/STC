/** Skeleton for the full report page — matches its 2-column layout. */
export default function ReportLoading() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse space-y-4" aria-busy="true" aria-label="Loading report">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-slate-200" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 w-24 rounded bg-slate-100" />
          <div className="h-5 w-2/3 rounded bg-slate-200" />
        </div>
      </div>

      <div className="flex gap-2">
        <div className="h-8 w-24 rounded-full bg-slate-100" />
        <div className="h-8 w-28 rounded-full bg-slate-100" />
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3.5">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="h-6 w-6 rounded-full bg-slate-100" />
            <div className="h-2 w-12 rounded bg-slate-100" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="h-3 w-20 rounded bg-slate-100" />
                  <div className="h-4 w-32 rounded bg-slate-200" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="h-64 rounded-xl border border-slate-200 bg-white" />
      </div>
    </div>
  );
}
