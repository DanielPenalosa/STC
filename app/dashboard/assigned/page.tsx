import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/data";
import { PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import StaffReportList from "../staff-list";
import type { Report } from "@/lib/types";

/** "2d 4h" / "6h" / "<1h" — how long a report has been sitting in the inbox. */
function waitLabel(iso: string): string {
  const ms = Math.max(0, Date.now() - new Date(iso).getTime());
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return "<1h";
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export default async function AssignedPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const col = profile.role === "department" ? "department_id" : "barangay_id";
  const id = profile.role === "department" ? profile.department_id : profile.barangay_id;

  let query = supabase
    .from("reports")
    .select("*, categories(name, icon, color), barangays(name), report_photos(storage_path, kind)")
    // the inbox is *only* what the admin routed here and nobody accepted yet —
    // accepting flips the status to in_progress, so it leaves this list and
    // shows up on the Reports page instead
    .eq("status", "assigned")
    // most recently touched first — a report the unit just worked on (or an
    // admin just re-routed) bubbles to the top with the cyan "UPDATED" mark
    .order("updated_at", { ascending: false });
  if (id) query = query.eq(col, id);
  const { data } = await query;

  const reports =
    (data as unknown as (Report & {
      categories: { name: string; icon: string; color: string } | null;
      barangays: { name: string } | null;
      report_photos: { storage_path: string; kind: string }[];
    })[]) ?? [];

  const urgent = reports.filter((r) => r.priority >= 4).length;
  const oldest = reports.reduce<string | null>(
    (min, r) => (!min || r.created_at < min ? r.created_at : min),
    null
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Assigned Reports"
        subtitle={
          profile.role === "department"
            ? "Routed to your department by the administrator — accept one to start working"
            : "Routed to your barangay by the administrator — accept one to start working"
        }
      />

      {reports.length > 0 && (
        <section className="relative overflow-hidden rounded-2xl border border-primary-100 bg-primary-50/70 px-5 py-4">
          <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-primary-100/70" />
          <div className="pointer-events-none absolute -bottom-16 right-24 h-32 w-32 rounded-full bg-accent-100/40" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white shadow-sm shadow-primary-600/30">
                <Icon name="inbox" size="lg" />
              </span>
              <div className="min-w-0">
                <p className="flex flex-wrap items-baseline gap-2">
                  <span className="text-2xl font-extrabold leading-none text-slate-900">
                    {reports.length}
                  </span>
                  <span className="text-sm font-semibold text-slate-600">
                    {reports.length === 1
                      ? "report waiting for acceptance"
                      : "reports waiting for acceptance"}
                  </span>
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Accepting a report moves it out of this inbox and into Reports, where you track it
                  through to completion.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SummaryChip
                icon="alert"
                label="High priority"
                value={String(urgent)}
                tone={urgent > 0 ? "danger" : "slate"}
              />
              <SummaryChip
                icon="clock"
                label="Oldest waiting"
                value={oldest ? waitLabel(oldest) : "—"}
                tone="slate"
              />
            </div>
          </div>
        </section>
      )}

      <StaffReportList
        reports={reports}
        emptyText="No new assignments — everything routed to you has been accepted."
      />
    </div>
  );
}

function SummaryChip({
  icon,
  label,
  value,
  tone,
}: {
  icon: "alert" | "clock";
  label: string;
  value: string;
  tone: "danger" | "slate";
}) {
  const tones = {
    danger: "bg-white text-danger-600 ring-danger-200",
    slate: "bg-white text-slate-600 ring-slate-200",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${tones[tone]}`}
    >
      <Icon
        name={icon}
        size="sm"
        className={tone === "danger" ? "text-danger-500" : "text-slate-400"}
      />
      {label} <span className="text-slate-900">{value}</span>
    </span>
  );
}
