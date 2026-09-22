/**
 * Scroll-triggered reveal.
 *
 * A tiny client component that wraps its children in a container and adds
 * `.is-visible` to it (and to each `.reveal` child, staggered via CSS) the
 * first time it enters the viewport.
 *
 * Uses a rAF-throttled scroll/resize check instead of IntersectionObserver so
 * elements are also revealed when they're already ABOVE the viewport — e.g.
 * after an anchor-link jump (#faq) or a fast programmatic scroll, where an
 * element can skip past the viewport without ever intersecting it.
 *
 * Usage:
 *   <Reveal className="grid gap-4 sm:grid-cols-3 reveal-group">
 *     <Card className="reveal" /> ...
 *   </Reveal>
 */
"use client";

import { useEffect, useRef } from "react";

export function Reveal({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const targets: HTMLElement[] = [
      root,
      ...Array.from(root.querySelectorAll<HTMLElement>(".reveal")),
    ];
    let pending = targets.length;

    const show = (el: HTMLElement) => {
      if (el.classList.contains("is-visible")) return;
      el.classList.add("is-visible");
      pending--;
    };

    const check = () => {
      const line = window.innerHeight * 0.92; // reveal slightly before fully in view
      for (const el of targets) {
        if (el.classList.contains("is-visible")) continue;
        if (el.getBoundingClientRect().top < line) show(el);
      }
      if (pending <= 0) {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
      }
    };

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        check();
      });
    };

    check(); // reveal anything already in/above the viewport on mount
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
