import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Icon, type IconName } from "@/components/icons";
import type { Profile, Report } from "@/lib/types";
import { Card, ReportCard } from "@/components/ui";
import { CITY_NAME } from "@/app/brand";

export default async function CitizenHome({ profile }: { profile: Profile }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reports")
    .select(
      `*, categories(name, icon), barangays(name),
       report_photos(storage_path, kind)`
    )
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(3);
  const reports = (data as unknown as (Report & {
    categories: { name: string; icon: string } | null;
    barangays: { name: string } | null;
    report_photos: { storage_path: string; kind: string }[];
  })[]) ?? [];

  const photoUrl = (r: (typeof reports)[number]) => {
    const p = r.report_photos?.find((x) => x.kind === "citizen");
    return p ? `/api/photo?bucket=report-photos&path=${encodeURIComponent(p.storage_path)}` : null;
  };

  const active = reports.filter(
    (r) => !["resolved", "closed"].includes(r.status)
  ).length;

  const firstName = (profile.full_name ?? "Citizen").split(" ")[0];

  const QUICK: { href: string; icon: IconName; label: string; sub?: string }[] = [
    { href: "/dashboard/my-reports", icon: "file", label: "My Reports", sub: `${active} active` },
    { href: "/dashboard/community", icon: "map", label: "Community", sub: "Explore map" },
  ];

  return (
    <div className="mx-auto max-w-lg space-y-6">
      {/* greeting + primary action */}
      <section className="page-enter">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
          Welcome back
        </p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">
          {firstName}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Help make {CITY_NAME} better, one report at a time.
        </p>

        <Link
          href="/dashboard/submit"
          className="press mt-4 flex items-center gap-3 rounded-2xl bg-slate-900 p-4 text-white shadow-lg shadow-slate-900/15 transition hover:bg-slate-800"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
            <Icon name="camera" size="lg" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold">Report an issue</span>
            <span className="block text-xs text-slate-400">
              Snap a photo — AI does the rest
            </span>
          </span>
          <Icon name="chevron-right" size="md" className="shrink-0 text-slate-400" />
        </Link>
      </section>

      {/* quick stats */}
      <section className="grid grid-cols-2 gap-3">
        {QUICK.map((q) => (
          <Link key={q.href} href={q.href} className="group">
            <Card className="hover-lift p-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                <Icon name={q.icon} size="md" />
              </span>
              <p className="mt-2.5 text-sm font-bold text-slate-800">{q.label}</p>
              <p className="text-xs capitalize text-slate-400">{q.sub}</p>
            </Card>
          </Link>
        ))}
      </section>

      {/* recent reports */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">
            Recent reports
          </h2>
          {reports.length > 0 && (
            <Link
              href="/dashboard/my-reports"
              className="inline-flex items-center gap-0.5 text-xs font-semibold text-primary-600 hover:underline"
            >
              View all <Icon name="chevron-right" size="sm" />
            </Link>
          )}
        </div>

        {reports.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 px-6 py-10 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-50 text-slate-300">
              <Icon name="file" size="xl" />
            </span>
            <p className="mt-3 text-sm font-medium text-slate-600">
              No reports yet
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              Your submitted reports and their status will appear here.
            </p>
            <Link
              href="/dashboard/submit"
              className="press mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-xs font-bold text-white hover:bg-primary-700"
            >
              <Icon name="plus" size="sm" />
              Submit your first report
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((r) => (
              <ReportCard
                key={r.id}
                id={r.id}
                refCode={r.ref_code}
                title={r.title}
                status={r.status}
                priority={r.priority}
                categoryName={r.categories?.name}
                barangayName={r.barangays?.name}
                createdAt={r.created_at}
                photoUrl={photoUrl(r)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
