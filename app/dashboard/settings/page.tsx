import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/data";
import { PageHeader, Card } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { Logo } from "@/app/brand";
import { getBranding } from "@/lib/branding";
import { facebookConfigured } from "@/lib/facebook";
import SettingsForm from "./form";
import FacebookCard from "./facebook-card";
import SystemStatus from "./system-status";

/**
 * Settings is shared by admin and staff:
 *  - admin: full system configuration (branding form)
 *  - department/barangay: read-only account & unit information
 */
export default async function SettingsPage() {
  const [supabase, profile, branding] = await Promise.all([
    createClient(),
    requireProfile(),
    getBranding(),
  ]);
  const { data } = await supabase.from("app_settings").select("*");
  const settings = (data as { key: string; value: string | null }[]) ?? [];
  const isAdmin = profile.role === "admin";
  const fbEnv = facebookConfigured();

  const unitLabel = profile.role === "department" ? "Department" : "Barangay";
  const rows: { icon: IconName; label: string; value: string }[] = [
    { icon: "user", label: "Name", value: profile.full_name ?? "—" },
    { icon: "inbox", label: "Account type", value: unitLabel },
    { icon: "mail", label: "Phone", value: profile.phone ?? "—" },
    { icon: "shield", label: "Status", value: profile.is_active ? "Active" : "Suspended" },
    { icon: "calendar", label: "Member since", value: new Date(profile.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Settings"
        subtitle={
          isAdmin
            ? "Branding, integrations and system health — all in one place"
            : `Your ${unitLabel.toLowerCase()} account information`
        }
      />

      {/* ---------- identity card ---------- */}
      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-3.5">
          <Logo size={40} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-slate-800">
              {branding.clientName}
            </p>
            <p className="truncate text-xs text-slate-400">
              {branding.cityName} · {branding.tagline}
            </p>
          </div>
          <span className="shrink-0 text-[11px] font-medium text-slate-400">
            Your account
          </span>
        </div>
        <div className="divide-y divide-slate-50">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-3 px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                <Icon name={r.icon} size="md" />
              </span>
              <p className="min-w-0 flex-1 truncate text-xs font-medium uppercase tracking-wide text-slate-400">
                {r.label}
              </p>
              <p className="max-w-[55%] truncate text-sm font-semibold text-slate-800">
                {r.value}
              </p>
            </div>
          ))}
        </div>
      </Card>

      {isAdmin ? (
        <>
          {/* configure → integrate → diagnose → account */}
          <SettingsForm initial={settings} />
          <FacebookCard autoPost={branding.autoPost} configured={fbEnv} />
          <SystemStatus autoPost={branding.autoPost} />
        </>
      ) : (
        <p className="px-1 text-xs text-slate-400">
          System configuration is managed by the administrator. Contact them for
          changes to branding or your unit&apos;s details.
        </p>
      )}
    </div>
  );
}
