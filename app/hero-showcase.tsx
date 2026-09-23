"use client";

import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/icons";

/**
 * Landing hero showcase — auto-advances through the app's core moments
 * (snap → AI pre-check → auto-assign → live tracking) inside the same
 * "live report card" frame, so visitors see the product in motion without
 * a single real photo asset. Auto-next every ~4.5s with a progress bar;
 * the dots let impatient visitors jump to a specific screen, and the
 * animation respects prefers-reduced-motion via the existing utility CSS.
 */

type Slide = {
  key: string;
  chip: string;
  chipCls: string;
  title: string;
  place: string;
  ref: string;
  /** icon shown big in the media area */
  icon: IconName;
  /** gradient wash behind the icon */
  wash: string;
  iconColor: string;
  progressLabel: string;
  progressPct: number;
  progressCls: string;
  timeline: { label: string; done: boolean }[];
};

const SLIDES: Slide[] = [
  {
    key: "snap",
    chip: "Step 1 · Snap",
    chipCls: "bg-primary-50 text-primary-700 ring-1 ring-primary-100",
    title: "Broken streetlight",
    place: "Brgy. Sampaguita, near the plaza",
    ref: "#0427",
    icon: "camera",
    wash: "from-primary-50 to-accent-50",
    iconColor: "text-primary-500",
    progressLabel: "Report submitted",
    progressPct: 25,
    progressCls: "from-primary-500 to-accent-500",
    timeline: [
      { label: "Photo taken & uploaded", done: true },
      { label: "AI pre-check running…", done: false },
      { label: "Auto-assigned to a unit", done: false },
      { label: "Marked resolved", done: false },
    ],
  },
  {
    key: "ai",
    chip: "Step 2 · AI pre-check",
    chipCls: "bg-accent-50 text-accent-600 ring-1 ring-accent-100",
    title: "Broken streetlight",
    place: "Brgy. Sampaguita, near the plaza",
    ref: "#0427",
    icon: "robot",
    wash: "from-accent-50 to-primary-50",
    iconColor: "text-accent-500",
    progressLabel: "AI detected the issue",
    progressPct: 50,
    progressCls: "from-accent-500 to-primary-500",
    timeline: [
      { label: "Photo taken & uploaded", done: true },
      { label: "Recognized: streetlight outage (94%)", done: true },
      { label: "Category & urgency set automatically", done: true },
      { label: "Marked resolved", done: false },
    ],
  },
  {
    key: "assign",
    chip: "Step 3 · Auto-assigned",
    chipCls: "bg-success-50 text-success-700 ring-1 ring-success-100",
    title: "Broken streetlight",
    place: "Brgy. Sampaguita, near the plaza",
    ref: "#0427",
    icon: "clipboard",
    wash: "from-success-50 to-primary-50",
    iconColor: "text-success-600",
    progressLabel: "Routed to City Engineering",
    progressPct: 75,
    progressCls: "from-success-500 to-primary-500",
    timeline: [
      { label: "Photo taken & uploaded", done: true },
      { label: "Recognized: streetlight outage (94%)", done: true },
      { label: "Assigned to City Engineering", done: true },
      { label: "Marked resolved", done: false },
    ],
  },
  {
    key: "resolved",
    chip: "Step 4 · Resolved",
    chipCls: "bg-success-50 text-success-700 ring-1 ring-success-100",
    title: "Broken streetlight",
    place: "Brgy. Sampaguita, near the plaza",
    ref: "#0427",
    icon: "check-circle",
    wash: "from-success-50 to-primary-50",
    iconColor: "text-success-600",
    progressLabel: "Resolved & verified",
    progressPct: 100,
    progressCls: "from-success-500 to-success-400",
    timeline: [
      { label: "Photo taken & uploaded", done: true },
      { label: "Recognized: streetlight outage (94%)", done: true },
      { label: "Assigned to City Engineering", done: true },
      { label: "Marked resolved", done: true },
    ],
  },
];

const SLIDE_MS = 4500;

export default function HeroShowcase() {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (paused) return;
    timer.current = setInterval(() => {
      setIdx((i) => (i + 1) % SLIDES.length);
    }, SLIDE_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [paused]);

  const s = SLIDES[idx];

  return (
    <div
      className="float-slow relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
    >
      {/* radar ping behind the card */}
      <span className="ping-ring absolute left-1/2 top-6 -ml-10 h-20 w-20 rounded-full border-2 border-primary-400/60" aria-hidden />
      <span
        className="ping-ring absolute left-1/2 top-6 -ml-10 h-20 w-20 rounded-full border-2 border-primary-300/50"
        style={{ animationDelay: "1.3s" }}
        aria-hidden
      />

      <div className="relative rounded-3xl border border-slate-200/80 bg-white p-5 shadow-2xl shadow-slate-900/10 sm:p-6">
        {/* card header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="live-blink absolute inline-flex h-full w-full rounded-full bg-success-500" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success-600" />
            </span>
            <span className="text-[11px] font-bold uppercase tracking-widest text-success-700">
              Live
            </span>
            <span
              key={s.key}
              className={`animate-[page-in_.3s_ease-out] ml-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${s.chipCls}`}
            >
              {s.chip}
            </span>
          </div>
          <span className="text-[11px] font-semibold text-slate-400">{s.ref}</span>
        </div>

        {/* media area — swaps with a soft crossfade each slide */}
        <div
          key={s.key}
          className={`animate-[page-in_.45s_ease-out] mt-4 flex h-36 items-center justify-center rounded-2xl border border-dashed border-primary-200 bg-gradient-to-br ${s.wash}`}
        >
          <Icon name={s.icon} size="xl" className={`${s.iconColor} drop-shadow-sm`} />
        </div>

        {/* body */}
        <div className="mt-4 flex items-start justify-between gap-3">
          <div>
            <p className="font-bold text-slate-900">{s.title}</p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
              <Icon name="pin" size="sm" className="text-slate-400" />
              {s.place}
            </p>
          </div>
          <span
            key={s.key}
            className={`animate-[page-in_.3s_ease-out] shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${s.chipCls}`}
          >
            {s.chip.split("· ")[1] ?? s.chip}
          </span>
        </div>

        {/* progress */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
            <span>{s.progressLabel}</span>
            <span>{s.progressPct === 100 ? "Complete" : `${s.progressPct}%`}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              key={`${s.key}-bar`}
              className={`h-full rounded-full bg-gradient-to-r transition-[width] duration-700 ease-out ${s.progressCls}`}
              style={{ width: `${s.progressPct}%` }}
            />
          </div>
        </div>

        {/* timeline */}
        <div className="mt-5 space-y-2.5 border-t border-slate-100 pt-4">
          {s.timeline.map((row) => (
            <div key={row.label} className="flex items-center gap-2.5 text-xs">
              <span
                className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full ${
                  row.done
                    ? "bg-success-100 text-success-700"
                    : "border border-dashed border-slate-300 text-slate-300"
                }`}
              >
                {row.done && <Icon name="check-circle" size="sm" strokeWidth={2.4} />}
              </span>
              <span className={row.done ? "text-slate-600" : "text-slate-400"}>
                {row.label}
              </span>
            </div>
          ))}
        </div>

        {/* auto-next progress + dots */}
        <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
          <div className="flex items-center gap-1.5">
            {SLIDES.map((sl, i) => (
              <button
                key={sl.key}
                type="button"
                onClick={() => setIdx(i)}
                aria-label={`Show step ${i + 1}: ${sl.chip}`}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === idx
                    ? "w-6 bg-primary-600"
                    : "w-2 bg-slate-200 hover:bg-slate-300"
                }`}
              />
            ))}
          </div>
          {!paused && (
            <span className="hero-showcase-timer overflow-hidden h-1 w-16 rounded-full bg-slate-100">
              <span
                key={`timer-${idx}`}
                className="block h-full rounded-full bg-primary-200"
                style={{
                  animation: `bar-fill-x ${SLIDE_MS}ms linear forwards`,
                }}
              />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
