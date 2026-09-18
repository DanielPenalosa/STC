import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/data";
import { RealtimeProvider } from "@/components/providers";
import { NotificationBell } from "@/components/notification-bell";
import { Logo, CLIENT_SHORT_NAME } from "@/app/brand";
import { ROLE_LABELS } from "@/lib/constants";
import type { Role } from "@/lib/constants";
import { DashboardNav } from "@/components/dashboard-nav";
import { PageTransition } from "@/components/page-transition";
import { MobileNav } from "@/components/mobile-nav";
import { Icon } from "@/components/icons";
import type { IconName } from "@/components/icons";

/* ------------------------- nav definitions per role ------------------------- */

type NavItem = { href: string; label: string; icon: IconName; exact?: boolean };
type NavGroup = { group?: string; items: NavItem[] };

const NAV: Record<Role, NavGroup[]> = {
  citizen: [
    {
      items: [
        { href: "/dashboard", label: "Home", icon: "home", exact: true },
        { href: "/dashboard/community", label: "Community", icon: "map" },
        { href: "/dashboard/my-reports", label: "My Reports", icon: "file" },
        { href: "/dashboard/notifications", label: "Notifications", icon: "bell" },
        { href: "/dashboard/profile", label: "Profile", icon: "user" },
      ],
    },
  ],
  admin: [
    {
      group: "Overview",
      items: [
        { href: "/dashboard", label: "Dashboard", icon: "grid", exact: true },
        { href: "/dashboard/map", label: "Report Map", icon: "map" },
        { href: "/dashboard/analytics", label: "Analytics", icon: "chart" },
      ],
    },
    {
      group: "Operations",
      items: [
        { href: "/dashboard/reports", label: "Reports", icon: "file" },
        { href: "/dashboard/ai", label: "AI Analysis", icon: "robot" },
      ],
    },
    {
      group: "Configuration",
      items: [
        { href: "/dashboard/categories", label: "Categories", icon: "layers" },
        { href: "/dashboard/barangays", label: "Barangays", icon: "home" },
        { href: "/dashboard/departments", label: "Departments", icon: "building" },
      ],
    },
    {
      group: "Administration",
      items: [
        { href: "/dashboard/users", label: "Users & Accounts", icon: "users" },
        { href: "/dashboard/settings", label: "Settings", icon: "settings" },
      ],
    },
  ],
  department: [
    {
      items: [
        { href: "/dashboard", label: "Dashboard", icon: "grid", exact: true },
        { href: "/dashboard/assigned", label: "Assigned", icon: "inbox" },
        { href: "/dashboard/in-progress", label: "In Progress", icon: "wrench" },
        { href: "/dashboard/resolved", label: "Resolved", icon: "check-circle" },
      ],
    },
  ],
  barangay: [
    {
      items: [
        { href: "/dashboard", label: "Dashboard", icon: "grid", exact: true },
        { href: "/dashboard/assigned", label: "Assigned", icon: "inbox" },
        { href: "/dashboard/in-progress", label: "In Progress", icon: "wrench" },
        { href: "/dashboard/resolved", label: "Resolved", icon: "check-circle" },
      ],
    },
  ],
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const nav = NAV[profile.role] ?? NAV.citizen;
  const flatNav = nav.flatMap((g) => g.items);

  return (
    <RealtimeProvider userId={profile.id} initialNotifications={[]}>
      <div className="flex min-h-screen">
        {/* ---------- desktop sidebar (≥lg) ---------- */}
        <aside
          className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-navy bg-cover bg-center lg:flex"
          style={{ backgroundImage: "url('/blue-bg.jpg')" }}
        >
          <Link
            href="/dashboard"
            className="flex h-[65px] items-center gap-2.5 border-b border-white/10 px-5"
          >
            <Logo size={34} />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-white">{CLIENT_SHORT_NAME}</p>
              <p className="truncate text-[11px] text-primary-200">
                {ROLE_LABELS[profile.role]}
              </p>
            </div>
          </Link>
          <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
            <DashboardNav groups={nav} />
          </nav>
          <div className="safe-bottom border-t border-white/10 p-3">
            <div className="mb-2 px-3 text-xs text-primary-200/80">
              Signed in as{" "}
              <span className="font-semibold text-white/90">
                {profile.full_name ?? "User"}
              </span>
            </div>
            <form action="/auth/signout" method="post">
              <button className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-red-300 transition hover:bg-white/10 hover:text-red-200">
                Sign out
              </button>
            </form>
          </div>
        </aside>

        {/* ---------- main column ---------- */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* top bar — aligned to the sidebar brand row height */}
          <header
            className="safe-top sticky top-0 z-40 flex h-[65px] items-center justify-between border-b border-white/10 bg-navy bg-cover bg-center px-4 lg:justify-end lg:px-6"
            style={{ backgroundImage: "url('/blue-bg.jpg')" }}
          >
            <Link href="/dashboard" className="flex items-center gap-2 lg:hidden">
              <Logo size={28} />
              <span className="text-sm font-bold text-white">{CLIENT_SHORT_NAME}</span>
            </Link>
            <div className="flex items-center gap-1.5">
              <NotificationBell />
              <form action="/auth/signout" method="post">
                <button
                  className="rounded-full p-2 text-primary-100 transition hover:bg-white/10 hover:text-white"
                  title="Sign out"
                  aria-label="Sign out"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                </button>
              </form>
            </div>
          </header>

          <main className="flex-1 p-4 pb-28 lg:p-6 lg:pb-10">
            {/* citizen verification gate */}
            {profile.role === "citizen" &&
              profile.verification_status !== "verified" && (
                <div className="mb-4 flex items-start gap-3 rounded-xl border border-warn-200 bg-warn-50/70 px-4 py-3 text-sm text-warn-800">
                  <Icon name="shield" size="md" className="mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold">
                      {profile.verification_status === "rejected"
                        ? "ID verification unsuccessful"
                        : "ID verification pending"}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-warn-700">
                      {profile.verification_status === "rejected" && profile.rejection_reason
                        ? `${profile.rejection_reason} — contact the administrator to resolve this.`
                        : "An administrator is reviewing the ID you submitted. You can browse reports; submitting is unlocked once verified."}
                    </p>
                  </div>
                </div>
              )}
            <PageTransition>{children}</PageTransition>
          </main>

          {/* ---------- mobile bottom nav (all items, scrollable) ---------- */}
          <MobileNav
            items={flatNav}
            actionIcon={profile.role === "citizen" ? "camera" : "plus"}
            actionLabel={
              profile.role === "citizen" ? "Report an issue" : "New report"
            }
          />
        </div>
      </div>
    </RealtimeProvider>
  );
}
