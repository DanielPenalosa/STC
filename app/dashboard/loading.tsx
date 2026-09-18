/**
 * Instant-feeling navigation: while a page's server data loads, show this
 * lightweight skeleton instead of a blank screen. Because the layout
 * (sidebar/header) stays mounted, only this content area swaps — the
 * transition reads as smooth, never as a refresh.
 */
export default function DashboardLoading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading page">
      {/* title */}
      <div className="space-y-2">
        <div className="h-6 w-40 rounded-lg bg-slate-200" />
        <div className="h-3.5 w-64 rounded bg-slate-100" />
      </div>

      {/* stat card row */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="h-11 w-11 shrink-0 rounded-xl bg-slate-100" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-20 rounded bg-slate-100" />
              <div className="h-5 w-14 rounded bg-slate-200" />
            </div>
          </div>
        ))}
      </div>

      {/* content rows */}
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 h-4 w-32 rounded bg-slate-100" />
            <div className="space-y-2.5">
              {Array.from({ length: 5 }).map((_, j) => (
                <div key={j} className="flex items-center gap-3">
                  <div className="h-8 w-8 shrink-0 rounded-lg bg-slate-100" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-3/4 rounded bg-slate-100" />
                    <div className="h-2.5 w-1/2 rounded bg-slate-100" />
                  </div>
                  <div className="h-6 w-16 rounded-full bg-slate-100" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
