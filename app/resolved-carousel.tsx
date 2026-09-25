"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { publicPhotoUrl } from "@/lib/photo";
import { CITY_NAME } from "./brand";
import type { PublicResolvedReport } from "@/lib/transparency";

/**
 * Landing transparency carousel — one resolved report at a time with
 * prev/next arrows and a horizontal slide between cards, so the feed
 * takes a single card's height instead of a full grid. Wraps around at
 * both ends; dots jump straight to a card (same pattern as HeroShowcase).
 */

function Slide({ r }: { r: PublicResolvedReport }) {
  return (
    <article className="w-full shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {/* grid-rows-1 + overflow-hidden: pins the row to h-44 so tall
          photos are cropped, not bled past the card */}
      <div className="relative grid h-44 grid-cols-2 grid-rows-1 divide-x divide-white/40 overflow-hidden">
        {r.photo_before ? (
          <img
            src={publicPhotoUrl(r.photo_before, 320)}
            alt={`${r.title} — before`}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-50">
            <Icon name="camera" size="lg" className="text-slate-300" />
          </div>
        )}
        {r.photo_after ? (
          <img
            src={publicPhotoUrl(r.photo_after, 320)}
            alt={`${r.title} — after`}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-success-50 to-primary-50">
            <Icon name="check-circle" size="xl" className="text-success-500" />
          </div>
        )}
        {r.photo_before && (
          <span className="absolute bottom-2 left-2 rounded-full bg-slate-900/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur-sm">
            Before
          </span>
        )}
        {r.photo_after && (
          <span className="absolute bottom-2 left-1/2 ml-2 rounded-full bg-success-600/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur-sm">
            After
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2.5 py-1 text-[11px] font-bold text-success-700 ring-1 ring-success-100">
            <Icon name="check-circle" size="sm" strokeWidth={2.4} />
            Resolved
          </span>
          <span className="text-[11px] font-semibold text-slate-400">{r.ref_code}</span>
        </div>

        <h3 className="mt-3 font-bold text-slate-900">{r.title}</h3>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
          <Icon name="pin" size="sm" className="shrink-0 text-slate-400" />
          {r.barangay_name ?? r.department_name ?? CITY_NAME}
        </p>

        {r.resolved_at && (
          <p className="mt-3 flex items-center gap-1.5 border-t border-slate-100 pt-3 text-xs text-slate-400">
            <Icon name="calendar" size="sm" className="shrink-0" />
            Resolved{" "}
            {new Date(r.resolved_at).toLocaleDateString("en-PH", {
              month: "short",
              day: "numeric",
              year: "numeric",
              timeZone: "Asia/Manila",
            })}
          </p>
        )}
      </div>
    </article>
  );
}

export default function ResolvedCarousel({ items }: { items: PublicResolvedReport[] }) {
  const [idx, setIdx] = useState(0);
  if (items.length === 0) return null;

  const many = items.length > 1;
  const go = (d: number) => setIdx((i) => (i + d + items.length) % items.length);

  return (
    <div className="reveal mx-auto mt-8 max-w-3xl">
      <div className="flex items-center gap-3 sm:gap-4">
        {many && (
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Previous resolved report"
            className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
          >
            <Icon name="chevron-right" size="md" className="rotate-180" />
          </button>
        )}

        <div className="min-w-0 flex-1 overflow-hidden">
          <div
            className="flex transition-transform duration-500 ease-out motion-reduce:transition-none"
            style={{ transform: `translateX(-${idx * 100}%)` }}
          >
            {items.map((r) => (
              <Slide key={r.id} r={r} />
            ))}
          </div>
        </div>

        {many && (
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Next resolved report"
            className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
          >
            <Icon name="chevron-right" size="md" />
          </button>
        )}
      </div>

      {many && (
        <div className="mt-5 flex items-center justify-center gap-1.5">
          {items.map((it, i) => (
            <button
              key={it.id}
              type="button"
              onClick={() => setIdx(i)}
              aria-label={`Show resolved report ${i + 1} of ${items.length}`}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === idx ? "w-6 bg-primary-600" : "w-2 bg-slate-200 hover:bg-slate-300"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
