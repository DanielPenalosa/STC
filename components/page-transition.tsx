/**
 * Instant route transitions.
 *
 * The previous implementation remounted the whole page tree on every
 * pathname change (`key={pathname}`), which re-played the fade/slide
 * animation on every click — making navigation feel like a full refresh.
 *
 * Now: pages render immediately and only get a quick, non-blocking
 * opacity fade-in. No key, no remount, no layout shift — clicks feel
 * instant. Links in the sidebar/nav are prefetched by Next.js by default,
 * so the RSC payload is usually already loaded when you click.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
