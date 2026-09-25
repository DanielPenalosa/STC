"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";
import { useNotifications } from "@/components/providers";

type NavItem = { href: string; label: string; icon: IconName; exact?: boolean };

/**
 * Fixed bottom navigation for phones. Shows EVERY section for the role in a
 * horizontally scrollable row (no hidden items), highlights the active tab,
 * and respects the iOS home-indicator safe area.
 *
 * A raised center button (camera for citizens — photo-first reporting; plus
 * for staff) gives one-tap access to the submit page from anywhere.
 */
export function MobileNav({
  items,
  actionHref = "/dashboard/submit",
  actionIcon = "plus",
  actionLabel = "New report",
}: {
  items: NavItem[];
  actionHref?: string;
  actionIcon?: IconName;
  actionLabel?: string;
}) {
  const pathname = usePathname() ?? "";
  const { badges } = useNotifications();

  // split items around the middle so the FAB sits centered over the bar
  const mid = Math.ceil(items.length / 2);
  const left = items.slice(0, mid);
  const right = items.slice(mid);

  const renderItem = (item: NavItem) => {
    const active =
      item.exact
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
        <span className="relative">
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${
              active ? "bg-primary-600" : ""
            }`}
          >
            <Icon name={item.icon} size="md" />
          </span>
          {badges[item.href] > 0 && (
            <span
              className="absolute -top-0.5 -right-1.5 flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-danger-500 px-[3px] text-[8px] font-semibold leading-none text-white ring-2 ring-navy"
              aria-label={`${badges[item.href]} unread notifications`}
            >
              {badges[item.href] > 9 ? "9+" : badges[item.href]}
            </span>
          )}
        </span>
        <span className="max-w-full truncate">{item.label.split(" ")[0]}</span>
        {active && (
          <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-cyan-300" />
        )}
      </Link>
    );
  };

  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-navy lg:hidden">
      <div className="relative flex items-stretch">
        <div className="scrollbar-none flex flex-1 overflow-x-auto">
          {left.map(renderItem)}
        </div>

        {/* raised center action button — reporting is one tap away */}
        <div className="pointer-events-none relative -mt-6 flex w-16 shrink-0 justify-center">
          <Link
            href={actionHref}
            aria-label={actionLabel}
            title={actionLabel}
            className="pointer-events-auto press absolute -top-1 flex h-14 w-14 items-center justify-center rounded-full border-4 border-navy bg-primary-500 text-white shadow-lg shadow-navy/40 transition active:scale-95"
          >
            <Icon name={actionIcon} size="lg" />
          </Link>
        </div>

        <div className="scrollbar-none flex flex-1 overflow-x-auto">
          {right.map(renderItem)}
        </div>
      </div>
    </nav>
  );
}
