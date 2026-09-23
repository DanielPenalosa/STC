"use client";

import { Icon } from "@/components/icons";

/** Print button — client-side window.print() (server components can't pass handlers). */
export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="press hidden h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50 sm:inline-flex"
      title="Print this report"
    >
      <Icon name="file" size="sm" /> Print
    </button>
  );
}
