import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, publicPhotoUrl } from "@/lib/data";
import { Icon } from "@/components/icons";
import { STATUS_COLORS, STATUS_LABELS, ROLE_LABELS, PRIORITY_COLORS } from "@/lib/constants";
import type { Report, ReportPhoto, Assignment, AiAnalysis } from "@/lib/types";
import ProcessBar from "./process-bar";
import ReportActions from "./actions";
import HeaderActions from "./header-actions";
import AiCard from "./ai-card";
import ActivityLog from "./timeline";
import DuplicatesCard from "./duplicates-card";
import type { ReportDuplicate } from "@/lib/types";

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data } = await supabase
    .from("reports")
    .select(
      `*,
       profiles:users!reports_user_id_fkey(full_name),
       categories(id, name, icon, color),
       barangays(id, name),
       departments(id, name, color)`
    )
    .eq("id", id)
    .maybeSingle();

  const report = data as unknown as (Report & {
    profiles: { full_name: string } | null;
    categories: { id: string; name: string; icon: string; color: string } | null;
    barangays: { id: string; name: string } | null;
    departments: { id: string; name: string; color: string } | null;
  }) | null;

  // reporter identity for staff accountability (admin/staff only get the
  // verified status; the profile query above joins through the FK)
  let reporterVerified: string | null = null;
  if (profile.role !== "citizen" && report && report.user_id) {
    const { data: rep } = await supabase
      .from("users")
      .select("full_name, phone, verification_status")
      .eq("id", report.user_id)
      .maybeSingle();
    if (rep) {
      reporterVerified =
        (rep as { verification_status?: string }).verification_status ?? null;
    }
  }

  if (!report) notFound();

  const [photosRes, historyRes, assignmentRes, aiRes, dupRes] = await Promise.all([
    supabase.from("report_photos").select("*").eq("report_id", report.id).order("created_at"),
    supabase.from("status_history").select("*").eq("report_id", report.id).order("created_at"),
    supabase.from("assignments").select("*").eq("report_id", report.id).order("created_at"),
    supabase
      .from("ai_analysis")
      .select("*")
      .eq("report_id", report.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // duplicate evidence (admins only — RLS restricts the table to admins +
    // report viewers, but the card is an admin triage tool)
    profile.role === "admin" && report.is_possible_duplicate
      ? supabase.from("report_duplicates").select("*").eq("report_id", report.id)
      : Promise.resolve({ data: [] as ReportDuplicate[] }),
  ]);

  // resolve the suspected originals for display
  let duplicates: ReportDuplicate[] = [];
  let similar: Record<string, { ref_code: string; title: string; status: string }> = {};
  if (profile.role === "admin" && Array.isArray(dupRes.data) && dupRes.data.length) {
    duplicates = dupRes.data as unknown as ReportDuplicate[];
    const ids = Array.from(new Set(duplicates.map((d) => d.similar_report_id)));
    const { data: simRows } = await supabase
      .from("reports")
      .select("id, ref_code, title, status")
      .in("id", ids);
    similar = Object.fromEntries(
      ((simRows as unknown as { id: string; ref_code: string; title: string; status: string }[]) ?? []).map(
        (r) => [r.id, { ref_code: r.ref_code, title: r.title, status: r.status }]
      )
    );
  }

  const photos = (photosRes.data as unknown as ReportPhoto[]) ?? [];
  const history = (historyRes.data as unknown as { id: string; from_status: string | null; to_status: string; note: string | null; created_at: string }[]) ?? [];
  const assignments = (assignmentRes.data as unknown as Assignment[]) ?? [];
  const ai = (aiRes.data as unknown as AiAnalysis | null) ?? null;

  const isCitizenOwner = profile.role === "citizen" && report.user_id === profile.id;
  const isLocked = report.status === "closed";
  const backHref =
    profile.role === "citizen" ? "/dashboard/my-reports" : "/dashboard/reports";

  // lookups for admin assignment/override
  const [catsRes, deptsRes, brgysRes] = await Promise.all([
    supabase.from("categories").select("id, name").order("name"),
    supabase.from("departments").select("id, name").order("name"),
    supabase.from("barangays").select("id, name").order("name"),
  ]);
  const categories = (catsRes.data as { id: string; name: string }[]) ?? [];
  const departments = (deptsRes.data as { id: string; name: string }[]) ?? [];
  const barangays = (brgysRes.data as { id: string; name: string }[]) ?? [];

  const assignedTo =
    assignments.length > 0
      ? assignments[assignments.length - 1].assigned_type === "department"
        ? report.departments?.name
        : report.barangays?.name
      : report.departments?.name ?? null;

  return (
    <div className="mx-auto max-w-6xl">
      {/* ================= header ================= */}
      <div className="mb-4 flex items-center gap-3">
        <Link
          href={backHref}
          className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50 hover:text-slate-800"
          aria-label="Back"
        >
          <Icon name="arrow-left" size="md" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] tracking-wide text-slate-400">
            {report.ref_code}
          </p>
          <h1 className="truncate text-base font-bold leading-snug text-slate-900 sm:text-xl">
            {report.title}
          </h1>
        </div>
      </div>

      {/* status pills (left) + admin quick actions (right) on one line */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <StatusPill status={report.status} />
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${PRIORITY_COLORS[report.priority]}`}
        >
          {report.priority === "high" && <Icon name="alert" size="sm" />}
          {report.priority === "high" ? "High priority" : `${report.priority} priority`}
        </span>
        {assignedTo && (
          <span
            className="inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold"
            style={{
              background: `${report.departments?.color ?? "#2333A0"}18`,
              color: report.departments?.color ?? "#2333A0",
            }}
          >
            <Icon
              name={assignments[assignments.length - 1]?.assigned_type === "barangay" ? "home" : "building"}
              size="sm"
              className="shrink-0"
            />
            <span className="truncate">{assignedTo}</span>
          </span>
        )}

        <div className="flex-1" />

        {/* admin quick actions — same line as the pills, right-aligned */}
        {profile.role === "admin" && (
          <HeaderActions
            reportId={report.id}
            status={report.status}
            priority={report.priority}
            departments={departments}
            barangays={barangays}
            hasAssignment={assignments.length > 0}
          />
        )}
      </div>

      {/* locked banner */}
      {isLocked && (
        <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm font-medium text-success-700">
          <Icon name="shield" size="md" />
          This report is closed and locked. No further status updates can be made.
        </div>
      )}

      {/* duplicate-review card (admin, when flagged) */}
      {profile.role === "admin" && duplicates.length > 0 && (
        <div className="mb-4">
          <DuplicatesCard reportId={report.id} evidence={duplicates} similar={similar} />
        </div>
      )}

      {/* ============ the report process — always visible ============ */}
      <ProcessBar status={report.status} />

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px]">
        {/* ============ main column ============ */}
        <div className="space-y-4">
          {/* report information */}
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
              <p className="text-sm font-bold text-slate-800">Report information</p>
            </div>
            <dl className="grid gap-x-6 gap-y-3 px-4 py-4 sm:grid-cols-[150px_1fr] sm:px-5">
              <InfoRow icon="tag" label="Category">
                <span className="inline-flex items-center gap-2">
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-md"
                    style={{ background: `${report.categories?.color ?? "#64748b"}1a` }}
                  >
                    <Icon name="tag" size="sm" />
                  </span>
                  {report.categories?.name ?? "Uncategorized"}
                </span>
              </InfoRow>
              <InfoRow icon="pin" label="Barangay">
                {report.barangays ? `Brgy. ${report.barangays.name}` : "Routing pending"}
              </InfoRow>
              <InfoRow icon="pin" label="Location">
                {report.latitude != null && report.longitude != null ? (
                  <a
                    href={`https://www.google.com/maps?q=${report.latitude},${report.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 font-mono text-[13px] text-primary-600 hover:underline"
                  >
                    {report.latitude.toFixed(5)}, {report.longitude.toFixed(5)}
                    <Icon name="link" size="sm" />
                  </a>
                ) : (
                  <span className="text-slate-400">Not provided</span>
                )}
              </InfoRow>
              {report.address_text && (
                <InfoRow icon="map" label="Address">
                  {report.address_text}
                </InfoRow>
              )}
              <InfoRow icon="user" label="Reporter">
                <span className="flex flex-wrap items-center gap-1.5">
                  {report.profiles?.full_name ?? "Citizen"}
                  {profile.role !== "citizen" && reporterVerified === "verified" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-[10px] font-bold text-success-700">
                      <Icon name="shield" size="sm" /> Verified resident
                    </span>
                  )}
                  {profile.role !== "citizen" && reporterVerified === "pending" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-warn-50 px-2 py-0.5 text-[10px] font-bold text-warn-800">
                      <Icon name="clock" size="sm" /> Verification pending
                    </span>
                  )}
                </span>
              </InfoRow>
              <InfoRow icon="clock" label="Submitted">
                {new Date(report.created_at).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </InfoRow>
            </dl>
            <div className="border-t border-slate-100 px-4 py-4 sm:px-5">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                Description
              </p>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                {report.description || "—"}
              </p>
            </div>
          </section>

          {/* photos */}
          {photos.length > 0 && (
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5">
                <p className="text-sm font-bold text-slate-800">
                  {photos.some((p) => p.kind === "resolution") ? "Photos" : "Submitted photos"}
                </p>
                <span className="text-[11px] font-medium text-slate-400">
                  {photos.filter((p) => p.kind === "resolution").length > 0 &&
                    `${photos.filter((p) => p.kind === "resolution").length} evidence · `}
                  {photos.filter((p) => p.kind === "citizen").length} from reporter
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
                {photos.map((p) => (
                  <a
                    key={p.id}
                    href={publicPhotoUrl(p.storage_path)}
                    target="_blank"
                    rel="noreferrer"
                    className="hover-lift group relative block overflow-hidden rounded-lg border border-slate-200"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={publicPhotoUrl(p.storage_path)}
                      alt={p.caption ?? "report photo"}
                      className="aspect-[4/3] w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                    />
                    {p.kind === "resolution" && (
                      <span className="absolute left-2 top-2 rounded-full bg-success-500 px-2 py-0.5 text-[10px] font-bold text-white shadow">
                        Evidence
                      </span>
                    )}
                    <span className="absolute inset-0 flex items-center justify-center bg-slate-900/0 opacity-0 transition group-hover:bg-slate-900/25 group-hover:opacity-100">
                      <span className="rounded-full bg-white/90 p-2 text-slate-700 shadow">
                        <Icon name="eye" size="md" />
                      </span>
                    </span>
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* role actions (staff work tools + citizen delete; admin triage lives in the header) */}
          <ReportActions
            reportId={report.id}
            status={report.status}
            role={profile.role}
            isOwner={isCitizenOwner}
          />
        </div>

        {/* ============ sidebar ============ */}
        <div className="space-y-4">
          <ActivityLog history={history} />

          {/* AI pre-check with accept/override controls (admin only) */}
          {ai && profile.role === "admin" && (
            <AiCard
              reportId={report.id}
              categoryId={report.categories?.id ?? null}
              departmentId={report.departments?.id ?? null}
              barangayId={report.barangays?.id ?? null}
              categories={categories}
              departments={departments}
              barangays={barangays}
              ai={{
                detected_issue: ai.detected_issue,
                suggested_category_id: ai.suggested_category_id,
                suggested_department_id: ai.suggested_department_id,
                suggested_barangay_id: ai.suggested_barangay_id,
                confidence: ai.confidence,
                status: ai.status,
              }}
            />
          )}

          {/* meta card */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <p className="mb-3 text-sm font-bold text-slate-800">Details</p>
            <dl className="space-y-2 text-sm">
              <MetaRow label="Role view" value={ROLE_LABELS[profile.role]} />
              <MetaRow
                label="Visibility"
                value={report.is_anonymous ? "Anonymous" : "Public"}
              />
              <MetaRow
                label="Last update"
                value={new Date(report.updated_at).toLocaleDateString()}
              />
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: keyof typeof STATUS_LABELS }) {
  const colors: Record<string, string> = {
    submitted: "bg-slate-100 text-slate-600",
    under_review: "bg-warn-50 text-warn-700",
    verified: "bg-accent-50 text-accent-600",
    assigned: "bg-primary-50 text-primary-700",
    in_progress: "bg-accent-50 text-accent-600",
    resolved: "bg-success-50 text-success-600",
    closed: "bg-slate-800 text-white",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${colors[status] ?? "bg-slate-100 text-slate-600"}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {STATUS_LABELS[status]}
    </span>
  );
}

function InfoRow({
  icon,
  label,
  children,
}: {
  icon: "tag" | "pin" | "map" | "user" | "clock" | "link";
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="flex items-center gap-2 text-sm text-slate-400">
        <Icon name={icon} size="sm" />
        {label}
      </dt>
      <dd className="text-sm font-medium text-slate-700">{children}</dd>
    </>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-slate-400">{label}</dt>
      <dd className="font-medium text-slate-600">{value}</dd>
    </div>
  );
}
