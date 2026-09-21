import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/data";
import { PageHeader, Card } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { Logo, CLIENT_NAME, CITY_NAME, TAGLINE } from "@/app/brand";
import SettingsForm from "./form";

/**
 * Settings is shared by admin and staff:
 *  - admin: full system configuration (branding form)
 *  - department/barangay: read-only account & unit information
 */
export default async function SettingsPage() {
  const [supabase, profile] = await Promise.all([createClient(), requireProfile()]);
  const { data } = await supabase.from("app_settings").select("*");
  const settings = (data as { key: string; value: string | null }[]) ?? [];
  const isAdmin = profile.role === "admin";

  const unitLabel = profile.role === "department" ? "Department" : "Barangay";
  const rows: { icon: IconName; label: string; value: string }[] = [
    { icon: "user", label: "Name", value: profile.full_name ?? "—" },
    { icon: "inbox", label: "Account type", value: unitLabel },
    { icon: "mail", label: "Phone", value: profile.phone ?? "—" },
    { icon: "shield", label: "Status", value: profile.is_active ? "Active" : "Suspended" },
    { icon: "calendar", label: "Member since", value: new Date(profile.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) },
  ];

  return (
    <div className="max-w-xl space-y-4">
      <PageHeader
        title="Settings"
        subtitle={
          isAdmin
            ? "System-wide configuration (rebrand once the client is finalized)"
            : `Your ${unitLabel.toLowerCase()} account information`
        }
      />

      {/* ---------- identity card ---------- */}
      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-3.5">
          <Logo size={40} />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-800">{CLIENT_NAME}</p>
            <p className="truncate text-xs text-slate-400">
              {CITY_NAME} · {TAGLINE}
            </p>
          </div>
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
          <Card className="p-4 text-sm text-slate-600">
            The logo is served from <code className="rounded bg-slate-100 px-1">public/logo.png</code> — replace
            that file (or set <code className="rounded bg-slate-100 px-1">NEXT_PUBLIC_LOGO_URL</code> in{" "}
            <code className="rounded bg-slate-100 px-1">.env.local</code>) and every screen updates.
          </Card>
          <SettingsForm initial={settings} />
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
