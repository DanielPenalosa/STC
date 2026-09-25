"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";
import { useNotifications } from "@/components/providers";

type NavItem = { href: string; label: string; icon: IconName; exact?: boolean };
type NavGroup = { group?: string; items: NavItem[] };

export function DashboardNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname() ?? "";
  const { badges } = useNotifications();

  return (
    <>
      {groups.map((g, gi) => (
        <div key={g.group ?? `g${gi}`}>
          {g.group && (
            <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-widest text-primary-300/60">
              {g.group}
            </p>
          )}
          <div className="space-y-0.5">
            {g.items.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname === item.href ||
                  (pathname.startsWith(item.href + "/") && item.href !== "/dashboard");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    active
                      ? "bg-primary-600 text-white shadow-sm"
                      : "text-primary-100/80 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <span className={`text-current ${active ? "text-white" : "text-primary-200/70"}`}>
                    <Icon name={item.icon} size="md" />
                  </span>
                  <span className="min-w-0 truncate">{item.label}</span>
                  {badges[item.href] > 0 && (
                    <span
                      className="ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger-500 px-1 text-[10px] font-semibold leading-none text-white"
                      aria-label={`${badges[item.href]} unread notifications`}
                    >
                      {badges[item.href] > 9 ? "9+" : badges[item.href]}
                    </span>
                  )}
                  {active && !badges[item.href] && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-white" />
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}
