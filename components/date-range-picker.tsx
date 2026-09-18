"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/icons";

type Preset = { key: string; label: string };

const PRESETS: Preset[] = [
  { key: "all", label: "All time" },
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "custom", label: "Custom range…" },
];

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function labelFor(sp: URLSearchParams): string {
  const range = sp.get("range") ?? "all";
  if (range === "custom") {
    const from = sp.get("from");
    const to = sp.get("to");
    if (from && to) return `${from} → ${to}`;
    if (from) return `From ${from}`;
    if (to) return `Until ${to}`;
    return "Custom range…";
  }
  return PRESETS.find((p) => p.key === range)?.label ?? "All time";
}

/**
 * Date-range dropdown for the reports filter bar.
 * Presets (all time / today / 7d / 30d) plus a custom from–to calendar
 * range. Writes `range`, `from`, `to` into the URL and reloads — the
 * server query does the actual filtering.
 */
export default function DateRangePicker() {
  const router = useRouter();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const range = sp.get("range") ?? "all";
  const [from, setFrom] = useState(sp.get("from") ?? "");
  const [to, setTo] = useState(sp.get("to") ?? "");

  useEffect(() => {
    setFrom(sp.get("from") ?? "");
    setTo(sp.get("to") ?? "");
  }, [sp]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function apply(next: Record<string, string | null>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v == null || v === "" || (k === "range" && v === "all")) params.delete(k);
      else params.set(k, v);
    }
    if (next.range === "all") {
      params.delete("range");
      params.delete("from");
      params.delete("to");
    }
    const s = params.toString();
    router.push(`/dashboard/reports${s ? `?${s}` : ""}`);
    setOpen(false);
  }

  function pickPreset(key: string) {
    if (key === "custom") {
      // keep dropdown open; the custom inputs appear below
      apply({ range: "custom", from: from || null, to: to || null });
      return;
    }
    apply({ range: key, from: null, to: null });
  }

  const active = range !== "all";

  return (
    <div className="relative" ref={ref}>      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-sm font-medium transition ${
          active
            ? "border-primary-300 bg-primary-50 text-primary-700"
            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
        }`}>
        <Icon
          name="clock"
          size="sm"
          className={active ? "text-primary-500" : "text-slate-400"}
        />
        <span className="max-w-[140px] truncate">{labelFor(sp)}</span>
        <Icon
          name="chevron-down"
          size="sm"
          className={active ? "text-primary-400" : "text-slate-300"}
        />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1.5 w-60 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => pickPreset(p.key)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
                range === p.key
                  ? "bg-primary-50 font-semibold text-primary-700"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {p.label}
              {range === p.key && <Icon name="check-circle" size="sm" />}
            </button>
          ))}

          {range === "custom" && (
            <div className="space-y-2 border-t border-slate-100 p-2.5">
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                From
                <input
                  type="date"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => setFrom(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-normal normal-case tracking-normal text-slate-700 outline-none focus:border-primary-500"
                />
              </label>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                To
                <input
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => setTo(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-normal normal-case tracking-normal text-slate-700 outline-none focus:border-primary-500"
                />
              </label>
              <button
                onClick={() => apply({ range: "custom", from: from || null, to: to || null })}
                disabled={!from && !to}
                className="w-full rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-primary-700 disabled:opacity-50"
              >
                Apply range
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
