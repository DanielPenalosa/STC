import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, publicPhotoUrl } from "@/lib/data";
import { Icon, type IconName } from "@/components/icons";
import MapCard from "@/components/map-card";
import { STATUS_LABELS, ROLE_LABELS, PRIORITY_COLORS, PRIORITY_LABELS } from "@/lib/constants";
import type { ReportStatus, Priority } from "@/lib/constants";
import type { Report, ReportPhoto, Assignment, AiAnalysis } from "@/lib/types";
import ProcessBar from "./process-bar";
import ReportActions from "./actions";
import HeaderActions from "./header-actions";
import AiCard from "./ai-card";
import ActivityLog from "./timeline";
import DuplicatesCard from "./duplicates-card";
import NotesCard from "./notes-card";
import PrintButton from "./print-button";
import CopyButton from "./copy-button";
import {
  FollowButton,
  FollowupSection,
  FeedbackCard,
  VerificationCard,
} from "./engagement";
import { StaffActions } from "./actions";
import type { ReportDuplicate } from "@/lib/types";

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtShort(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const hr12 = h % 12 === 0 ? 12 : h % 12;
  const ampm = h < 12 ? "AM" : "PM";
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${hr12}:${String(d.getMinutes()).padStart(2, "0")} ${ampm}`;
}

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();
  const isStaff = profile.role !== "citizen";

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

  if (!report) notFound();

  /* reporter identity for staff accountability */
  let reporter: {
    name: string;
    phone: string | null;
    email: string | null;
    verified: string | null;
  } = {
    name: report.profiles?.full_name ?? "Citizen",
    phone: null,
    email: null,
    verified: null,
  };
  if (isStaff && report.user_id) {
    const { data: rep } = await supabase
      .from("users")
      .select("full_name, phone, email, verification_status")
      .eq("id", report.user_id)
      .maybeSingle();
    if (rep) {
      const r = rep as {
        full_name: string | null;
        phone: string | null;
        email: string | null;
        verification_status: string | null;
      };
      reporter = {
        name: r.full_name ?? reporter.name,
        phone: r.phone,
        email: r.email,
        verified: r.verification_status,
      };
    }
  }

  const [photosRes, historyRes, assignmentRes, aiRes, dupRes, followsRes, followupsRes, feedbackRes, myFollowRes] = await Promise.all([
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
    profile.role === "admin" && report.is_possible_duplicate
      ? supabase.from("report_duplicates").select("*").eq("report_id", report.id)
      : Promise.resolve({ data: [] as ReportDuplicate[] }),
    supabase.from("report_follows").select("user_id").eq("report_id", report.id),
    supabase
      .from("report_followups")
      .select("id, message, created_at, user_id")
      .eq("report_id", report.id)
      .order("created_at", { ascending: false }),
    supabase.from("report_feedback").select("rating, comment").eq("report_id", report.id).maybeSingle(),
    supabase
      .from("report_follows")
      .select("user_id")
      .eq("report_id", report.id)
      .eq("user_id", profile.id)
      .maybeSingle(),
  ]);

  /* duplicate evidence resolution (admin) */
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
  const history = (historyRes.data as unknown as {
    id: string;
    from_status: string | null;
    to_status: string;
    note: string | null;
    changed_by: string | null;
    created_at: string;
  }[]) ?? [];
  const assignments = (assignmentRes.data as unknown as Assignment[]) ?? [];
  const ai = (aiRes.data as unknown as AiAnalysis | null) ?? null;

  /* lifecycle v2 engagement data */
  const followerCount = (followsRes.data as { user_id: string }[] | null)?.length ?? 0;
  const isFollowing = Boolean(myFollowRes.data);
  const isReporter = report.user_id === profile.id;
  const followupsRaw = (followupsRes.data as unknown as { id: string; message: string; created_at: string; user_id: string }[] | null) ?? [];
  const followupAuthors = followupsRaw.length
    ? await supabase
        .from("users")
        .select("id, full_name")
        .in("id", Array.from(new Set(followupsRaw.map((f) => f.user_id))))
    : { data: [] as { id: string; full_name: string | null }[] | null };
  const followupNames = Object.fromEntries(
    ((followupAuthors.data as { id: string; full_name: string | null }[] | null) ?? []).map((u) => [u.id, u.full_name])
  );
  const followups = followupsRaw.map((f) => ({
    id: f.id,
    message: f.message,
    created_at: f.created_at,
    author: followupNames[f.user_id] ?? "Citizen",
  }));
  const feedback = (feedbackRes.data as unknown as { rating: number; comment: string | null } | null) ?? null;

  /* "by <name>" attribution for the timeline */
  const changerIds = Array.from(
    new Set(history.map((h) => h.changed_by).filter((v): v is string => Boolean(v)))
  );
  const { data: changerRows } = changerIds.length
    ? await supabase.from("users").select("id, full_name").in("id", changerIds)
    : { data: [] as { id: string; full_name: string | null }[] | null };
  const actors: Record<string, string | null> = Object.fromEntries(
    ((changerRows as { id: string; full_name: string | null }[] | null) ?? []).map((u) => [u.id, u.full_name])
  );

  /* synthetic "Created" entry so the timeline starts at creation like the reference */
  const displayHistory = [
    {
      id: "created",
      from_status: null,
      to_status: "submitted",
      note: null,
      changed_by: report.user_id,
      created_at: report.created_at,
    },
    ...history.filter((h) => h.to_status !== "submitted" || h.note),
  ];

  /* first timestamp each status was reached → stepper dates */
  const stepDates: Partial<Record<ReportStatus, string>> = {};
  for (const h of displayHistory) {
    const k = h.to_status as ReportStatus;
    if (!stepDates[k]) stepDates[k] = fmtShort(h.created_at);
  }

  const isCitizenOwner = profile.role === "citizen" && report.user_id === profile.id;
  const isLocked = report.status === "closed";
  const backHref = profile.role === "citizen" ? "/dashboard/my-reports" : "/dashboard/reports";

  /* lookups for admin assignment/override */
  const [catsRes, deptsRes, brgysRes] = await Promise.all([
    supabase.from("categories").select("id, name").order("name"),
    supabase.from("departments").select("id, name").order("name"),
    supabase.from("barangays").select("id, name").order("name"),
  ]);
  const categories = (catsRes.data as { id: string; name: string }[]) ?? [];
  const departments = (deptsRes.data as { id: string; name: string }[]) ?? [];
  const barangays = (brgysRes.data as { id: string; name: string }[]) ?? [];

  const lastAssignment = assignments[assignments.length - 1];
  const assignedTo = lastAssignment
    ? lastAssignment.assigned_type === "department"
      ? report.departments?.name
      : report.barangays?.name
    : report.departments?.name ?? null;

  const hasCoords = report.latitude != null && report.longitude != null;
  const mapPoint = hasCoords
    ? [
        {
          id: report.id,
          lat: report.latitude!,
          lng: report.longitude!,
          label: report.title,
          color: report.categories?.color ?? "#2333A0",
        },
      ]
    : [];

  return (
    <div className="mx-auto max-w-7xl">
      {/* ================= header ================= */}
      <Link
        href={backHref}
        className="press inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"
      >
        <Icon name="arrow-left" size="sm" /> Back to {profile.role === "citizen" ? "My Reports" : "Reports"}
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
            Report #{report.ref_code}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
            <StatusPill status={report.status} />
            <span className="text-slate-400">·</span>
            <span className="text-slate-500">Submitted {fmtShort(report.created_at)}</span>
            {report.title && (
              <span className="hidden truncate text-slate-400 sm:inline">· {report.title}</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {profile.role === "admin" && (
            <HeaderActions
              reportId={report.id}
              status={report.status}
              priority={report.priority}
              departments={departments}
              barangays={barangays}
              hasAssignment={assignments.length > 0}
              assignedToName={
                report.departments?.name ?? report.barangays?.name ?? assignedTo
              }
            />
          )}
          <PrintButton />
          {!isStaff && (
            <FollowButton
              reportId={report.id}
              initialFollowing={isFollowing}
              followers={followerCount}
              isReporter={isReporter}
            />
          )}
        </div>
      </div>

      {/* locked banner */}
      {isLocked && (
        <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm font-medium text-success-700">
          <Icon name="shield" size="md" />
          This report is closed and locked. No further status updates can be made.
        </div>
      )}

      {/* duplicate-review card (admin, when flagged) */}
      {profile.role === "admin" && duplicates.length > 0 && (
        <div className="mt-3">
          <DuplicatesCard reportId={report.id} evidence={duplicates} similar={similar} />
        </div>
      )}

      {/* ================= two-column dossier ================= */}
      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[1fr_400px]">
        {/* ============ left column ============ */}
        <div className="space-y-4">
          {/* report information */}
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <CardHeader icon="file" title="Report Information" />
            <div className="grid gap-x-6 gap-y-5 px-4 py-5 sm:grid-cols-2 sm:px-6">
              <InfoTile icon="file" label="Report ID">
                <span className="font-mono">{report.ref_code}</span>
              </InfoTile>
              <InfoTile icon="pin" label="Barangay">
                {report.barangays?.name ?? "Routing pending"}
              </InfoTile>
              <InfoTile icon="tag" label="Category" tint={report.categories?.color}>
                {report.categories?.name ?? "Uncategorized"}
              </InfoTile>
              {isStaff && (
                <InfoTile icon="user" label="Reporter">
                  <span className="flex flex-wrap items-center gap-1.5">
                    {reporter.name}
                    {reporter.verified === "verified" && <VerifiedBadge />}
                  </span>
                </InfoTile>
              )}
              <InfoTile icon="alert" label="Priority">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${PRIORITY_COLORS[report.priority]}`}
                >
                  {report.priority >= 4 && <Icon name="alert" size="sm" />}
                  {PRIORITY_LABELS[report.priority]}
                </span>
              </InfoTile>
              <InfoTile icon="clock" label="Date & Time">
                {fmtShort(report.created_at)}
              </InfoTile>
              <InfoTile icon="pin" label="Location" className="sm:col-span-2">
                {report.address_text || report.barangays?.name
                  ? [report.address_text, report.barangays?.name && `Brgy. ${report.barangays.name}`, "Santa Cruz, Laguna"]
                      .filter(Boolean)
                      .join(", ")
                  : "Not provided"}
                {hasCoords && (
                  <a
                    href={`https://www.google.com/maps?q=${report.latitude},${report.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-primary-600 hover:underline"
                  >
                    View on Map <Icon name="link" size="sm" />
                  </a>
                )}
              </InfoTile>
            </div>
          </section>

          {/* description */}
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <CardHeader icon="file" title="Report Description" />
            <p className="whitespace-pre-wrap px-4 py-4 text-sm leading-relaxed text-slate-700 sm:px-6">
              {report.description || "—"}
            </p>
          </section>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* attached photos */}
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between px-4 py-3 sm:px-5">
                <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
                  <Icon name="camera" size="md" className="text-primary-600" />
                  Attached Photos
                </p>
                <span className="text-[11px] font-medium text-slate-400">
                  {photos.length} photo{photos.length === 1 ? "" : "s"}
                </span>
              </div>
              {photos.length === 0 ? (
                <p className="px-4 pb-5 text-xs text-slate-400 sm:px-5">No photos attached.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2 px-4 pb-4 sm:grid-cols-2 sm:px-5">
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
                        src={publicPhotoUrl(p.storage_path, 640)}
                        alt={p.caption ?? "report photo"}
                        loading="lazy"
                        className="aspect-[4/3] w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                      />
                      {p.kind === "resolution" && (
                        <span className="absolute left-2 top-2 rounded-full bg-success-500 px-2 py-0.5 text-[10px] font-bold text-white shadow">
                          Evidence
                        </span>
                      )}
                    </a>
                  ))}
                </div>
              )}
            </section>

            {/* location mini-map */}
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <CardHeader icon="pin" title="Location" />
              <div className="px-4 pb-4 sm:px-5">
                {hasCoords ? (
                  <>
                    <div className="overflow-hidden rounded-lg border border-slate-100">
                      <MapCard points={mapPoint} height={180} />
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 font-mono text-xs text-slate-600">
                        {report.latitude!.toFixed(5)}, {report.longitude!.toFixed(5)}
                        <CopyButton text={`${report.latitude},${report.longitude}`} />
                      </span>
                      <a
                        href={`https://www.google.com/maps?q=${report.latitude},${report.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50"
                      >
                        Open in Maps <Icon name="link" size="sm" />
                      </a>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-slate-400">No GPS coordinates on this report.</p>
                )}
              </div>
            </section>
          </div>

          {/* citizen delete (own report, pending/resolved) */}
          <ReportActions
            reportId={report.id}
            status={report.status}
            role={profile.role}
            isOwner={isCitizenOwner}
          />
        </div>

        {/* ============ right rail ============ */}
        <div className="space-y-4">
          {/* staff/admin action card — pinned above the status stepper */}
          {(profile.role === "department" || profile.role === "barangay") && (
            <StaffActions
              reportId={report.id}
              status={report.status}
              role={profile.role}
              evidence={photos
                .filter((p) => p.kind === "resolution")
                .map((p) => ({ id: p.id, url: publicPhotoUrl(p.storage_path, 320) }))}
            />
          )}

          {/* admin verification panel — report marked Done by the department */}
          {profile.role === "admin" && report.status === "done" && (
            <VerificationCard
              reportId={report.id}
              completionPhotos={photos
                .filter((p) => p.kind === "resolution")
                .map((p) => ({ id: p.id, url: publicPhotoUrl(p.storage_path, 640) }))}
            />
          )}

          {/* current status stepper */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-800">
              <Icon name="check-circle" size="md" className="text-primary-600" />
              Current Status
            </p>
            <ProcessBar status={report.status} dates={stepDates} bare />
          </section>

          {/* report details */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800">
              <Icon name="layers" size="md" className="text-primary-600" />
              Report Details
            </p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5">
              <div>
                <dt className="text-xs text-slate-400">Sector</dt>
                <dd className="mt-0.5 text-[13px] font-semibold text-slate-700">
                  {report.categories?.name ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Assigned Department</dt>
                <dd className="mt-0.5 text-[13px] font-semibold text-slate-700">
                  {report.departments?.name ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Priority</dt>
                <dd className="mt-0.5">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${PRIORITY_COLORS[report.priority as Priority]}`}
                  >
                    {PRIORITY_LABELS[report.priority as Priority]}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Assigned To</dt>
                <dd className="mt-0.5 text-[13px] font-semibold text-slate-700">
                  {assignedTo ?? "—"}
                </dd>
              </div>
            </dl>
          </section>

          {/* reporter information (staff only) */}
          {isStaff && (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800">
                <Icon name="user" size="md" className="text-primary-600" />
                Reporter Information
              </p>
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-600 text-sm font-bold text-white">
                  {(reporter.name?.trim()?.[0] ?? "C").toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-slate-800">
                    <span className="truncate">{reporter.name}</span>
                    {reporter.verified === "verified" && <VerifiedBadge />}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                    <Icon name="smartphone" size="sm" className="text-slate-300" />
                    {reporter.phone ?? "No phone"}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-slate-500">
                    <Icon name="mail" size="sm" className="shrink-0 text-slate-300" />
                    <span className="truncate">{reporter.email ?? "No email"}</span>
                  </p>
                </div>
                {profile.role === "admin" && (
                  <Link
                    href="/dashboard/users"
                    className="press inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 shadow-sm hover:bg-slate-50"
                  >
                    View Profile <Icon name="link" size="sm" />
                  </Link>
                )}
              </div>
            </section>
          )}

          {/* timeline */}
          <ActivityLog history={displayHistory} actors={actors as Record<string, string | undefined>} reporterName={reporter.name} />

          {/* follow-ups (reporter can nudge; everyone relevant sees the thread) */}
          <FollowupSection
            reportId={report.id}
            canPost={isReporter}
            items={followups}
          />

          {/* reporter's rating — opens after resolution */}
          {isReporter && report.status === "resolved" && (
            <FeedbackCard reportId={report.id} existing={feedback} />
          )}
          {feedback && (!isReporter || report.status !== "resolved") && (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <Icon name="sparkles" size="md" className="text-primary-600" />
                Citizen Feedback
              </p>
              <div className="mt-2 flex items-center gap-1">
                {Array.from({ length: 5 }, (_, i) => (
                  <span key={i} className={i < feedback.rating ? "text-amber-500" : "text-slate-200"}>★</span>
                ))}
                <span className="ml-1 text-xs font-bold text-slate-600">{feedback.rating}/5</span>
              </div>
              {feedback.comment && (
                <p className="mt-1 text-[13px] italic text-slate-500">“{feedback.comment}”</p>
              )}
            </section>
          )}

          {/* notes / remarks */}
          <NotesCard
            reportId={report.id}
            canNote={isStaff}
          />

          {/* AI pre-check (admin) */}
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

          {/* meta */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <dl className="space-y-1.5 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-400">Role view</dt>
                <dd className="font-medium text-slate-600">{ROLE_LABELS[profile.role]}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-400">Visibility</dt>
                <dd className="font-medium text-slate-600">
                  {report.is_anonymous ? "Anonymous" : "Public"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-400">Last update</dt>
                <dd className="font-medium text-slate-600">
                  {new Date(report.updated_at).toLocaleDateString()}
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}

/* ---------------- helpers ---------------- */

function CardHeader({ icon, title }: { icon: IconName; title: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 sm:px-6">
      <Icon name={icon} size="md" className="text-primary-600" />
      <p className="text-sm font-bold text-slate-800">{title}</p>
    </div>
  );
}

function InfoTile({
  icon,
  label,
  children,
  tint,
  className = "",
}: {
  icon: IconName;
  label: string;
  children: React.ReactNode;
  tint?: string | null;
  className?: string;
}) {
  return (
    <div className={`flex items-start gap-3 ${className}`}>
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{ background: tint ? `${tint}1a` : "#f1f5f9", color: tint ?? "#64748b" }}
      >
        <Icon name={icon} size="md" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-slate-400">{label}</p>
        <div className="mt-0.5 text-sm font-semibold text-slate-700">{children}</div>
      </div>
    </div>
  );
}

function VerifiedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-[10px] font-bold text-success-700">
      <Icon name="shield" size="sm" /> Verified Citizen
    </span>
  );
}

function StatusPill({ status }: { status: keyof typeof STATUS_LABELS }) {
  const colors: Record<string, string> = {
    submitted: "bg-warn-50 text-warn-700",
    under_review: "bg-warn-50 text-warn-700",
    verified: "bg-accent-50 text-accent-600",
    assigned: "bg-primary-50 text-primary-700",
    in_progress: "bg-accent-50 text-accent-600",
    resolved: "bg-success-50 text-success-600",
    closed: "bg-slate-800 text-white",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${colors[status] ?? "bg-slate-100 text-slate-600"}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {STATUS_LABELS[status]}
    </span>
  );
}
