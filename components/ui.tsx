import Link from "next/link";
import {
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
} from "@/lib/constants";
import type { Priority, ReportStatus } from "@/lib/constants";
import { Icon, type IconName } from "@/components/icons";

export function StatusBadge({ status }: { status: ReportStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${PRIORITY_COLORS[priority]}`}
    >
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export const btn = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition disabled:opacity-50",
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition disabled:opacity-50",
  danger:
    "inline-flex items-center justify-center gap-2 rounded-lg border border-danger-200 bg-danger-50 px-4 py-2 text-sm font-semibold text-danger-600 hover:bg-danger-100 transition disabled:opacity-50",
};

export const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100";

export const labelCls = "mb-1 block text-sm font-medium text-slate-700";

export function EmptyState({
  icon = "inbox",
  title,
  hint,
}: {
  icon?: IconName;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/60 px-6 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-50 text-slate-300">
        <Icon name={icon} size="xl" />
      </span>
      <p className="mt-3 font-medium text-slate-700">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  accent = "text-slate-900",
  href,
  icon,
}: {
  label: string;
  value: number | string;
  accent?: string;
  href?: string;
  icon?: IconName;
}) {
  const body = (
    <Card className="hover-lift p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
          <p className={`mt-1 text-2xl font-bold ${accent}`}>{value}</p>
        </div>
        {icon && (
          <span className="shrink-0 rounded-lg bg-slate-50 p-2 text-slate-400">
            <Icon name={icon} size="md" />
          </span>
        )}
      </div>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function ReportCard({
  id,
  refCode,
  title,
  status,
  priority,
  categoryName,
  barangayName,
  createdAt,
  photoUrl,
}: {
  id: string;
  refCode: string;
  title: string;
  status: ReportStatus;
  priority: Priority;
  categoryName?: string | null;
  barangayName?: string | null;
  createdAt: string;
  photoUrl?: string | null;
}) {
  return (
    <Link
      href={`/reports/${id}`}
      className="hover-lift block rounded-xl border border-slate-200 bg-white"
    >
      <div className="flex gap-3 p-3">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={title}
            className="h-20 w-20 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-300">
            <Icon name="camera" size="lg" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-mono text-xs text-slate-400">{refCode}</span>
            <StatusBadge status={status} />
          </div>
          <p className="mt-1 line-clamp-2 font-semibold text-slate-800">{title}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {[categoryName, barangayName, new Date(createdAt).toLocaleDateString()].filter(Boolean).join(" · ")}
          </p>
          {priority >= 4 && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-danger-50 px-2 py-0.5 text-[11px] font-semibold text-danger-600">
              <Icon name="alert" size="sm" /> High Priority
            </span>
          )}
        </div>
        <span className="self-center text-slate-300">
          <Icon name="chevron-right" size="md" />
        </span>
      </div>
    </Link>
  );
}
