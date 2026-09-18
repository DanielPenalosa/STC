"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";

type NavItem = { href: string; label: string; icon: IconName; exact?: boolean };

/**
 * Fixed bottom navigation for phones. Shows EVERY section for the role in a
 * horizontally scrollable row (no hidden items), highlights the active tab,
 * and respects the iOS home-indicator safe area.
 */
export function MobileNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname() ?? "";

  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-navy lg:hidden">
      <div className="scrollbar-none flex overflow-x-auto">
        {items.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href ||
              (pathname.startsWith(item.href + "/") && item.href !== "/dashboard");
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-w-[4.5rem] flex-1 flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-medium transition ${
                active ? "text-white" : "text-primary-200/70 active:text-white"
              }`}
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${
                  active ? "bg-primary-600" : ""
                }`}
              >
                <Icon name={item.icon} size="md" />
              </span>
              <span className="max-w-full truncate">{item.label.split(" ")[0]}</span>
              {active && (
                <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-cyan-300" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
