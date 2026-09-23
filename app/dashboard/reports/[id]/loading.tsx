/**
 * Route-transition skeleton for the report detail page.
 *
 * Deliberately layout-identical to the real page (header → status strip →
 * two-column dossier) and deliberately NOT pulsing: the shell appears once
 * inside the page-enter animation, then real content replaces it in place.
 * Matching geometry is what makes navigation feel like the page "slides
 * into" the detail view instead of reloading it.
 */
export default function ReportLoading() {
  return (
    <div className="mx-auto max-w-7xl" aria-busy="true" aria-label="Loading report">
      {/* back link + title row */}
      <div className="h-4 w-28 rounded bg-slate-100" />
      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-6 w-56 max-w-full rounded bg-slate-200" />
          <div className="flex items-center gap-2">
            <div className="h-6 w-20 rounded-full bg-slate-100" />
            <div className="hidden h-3 w-36 rounded bg-slate-100 sm:block" />
          </div>
        </div>
        <div className="h-9 w-24 rounded-lg bg-slate-100" />
      </div>

      {/* status strip — full width, same position as the real card */}
      <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="h-4 w-28 rounded bg-slate-100" />
          <div className="h-3 w-16 rounded bg-slate-100" />
        </div>
        <ol className="flex items-start">
          {Array.from({ length: 7 }).map((_, i) => (
            <li key={i} className="flex min-w-0 flex-1 items-start">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={`h-6 w-6 rounded-full ${i <= 2 ? "bg-primary-100" : "bg-slate-100"}`}
                />
                <div className="h-2 w-10 rounded bg-slate-100" />
              </div>
              {i < 6 && (
                <span className="mt-3 h-0.5 flex-1 rounded bg-slate-100" />
              )}
            </li>
          ))}
        </ol>
      </div>

      {/* two-column dossier shell */}
      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[1fr_400px]">
        <div className="space-y-4">
          {/* report information card */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3 sm:px-6">
              <div className="h-4 w-36 rounded bg-slate-100" />
            </div>
            <div className="grid grid-cols-1 gap-y-4 px-4 py-4 sm:grid-cols-2 sm:px-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="h-9 w-9 shrink-0 rounded-lg bg-slate-100" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="h-2.5 w-16 rounded bg-slate-100" />
                    <div className="h-4 w-3/4 max-w-[180px] rounded bg-slate-200/80" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* description card */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3 sm:px-6">
              <div className="h-4 w-40 rounded bg-slate-100" />
            </div>
            <div className="space-y-2 px-4 py-4 sm:px-6">
              <div className="h-3 w-full rounded bg-slate-100" />
              <div className="h-3 w-11/12 rounded bg-slate-100" />
              <div className="h-3 w-2/3 rounded bg-slate-100" />
            </div>
          </div>

          {/* photos + map pair */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="h-56 rounded-xl border border-slate-200 bg-white" />
            <div className="h-56 rounded-xl border border-slate-200 bg-white" />
          </div>
        </div>

        {/* right rail */}
        <div className="hidden space-y-4 lg:block">
          <div className="h-44 rounded-xl border border-slate-200 bg-white" />
          <div className="h-36 rounded-xl border border-slate-200 bg-white" />
        </div>
      </div>
    </div>
  );
}
