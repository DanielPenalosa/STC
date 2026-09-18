"use client";

import { usePathname } from "next/navigation";

/**
 * Re-mounts its children on every route change so the CSS `page-enter`
 * animation plays again — giving a smooth fade/slide between pages.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-enter">
      {children}
    </div>
  );
}
