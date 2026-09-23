"use client";

import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { STATUS_LABELS } from "@/lib/constants";
import type { ReportStatus } from "@/lib/constants";

const DAY = 86_400_000;

function timeAgo(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric" }).format(new Date(iso));
}

/** Hide emails: fall back to a friendly display name. */
function formatAuthor(name: string | null): string {
  if (!name || name.includes("@")) return "Community member";
  return name;
}

const STATUS_PILL: Record<ReportStatus, string> = {
  submitted: "bg-slate-100 text-slate-600",
  under_review: "bg-warn-50 text-warn-700",
  verified: "bg-primary-50 text-primary-700",
  assigned: "bg-accent-50 text-accent-700",
  in_progress: "bg-warn-50 text-warn-700",
  done: "bg-primary-50 text-primary-700",
  resolved: "bg-success-50 text-success-700",
  closed: "bg-slate-100 text-slate-500",
  rejected: "bg-danger-50 text-danger-700",
};

const STATUS_DOT: Record<ReportStatus, string> = {
  submitted: "bg-slate-400",
  under_review: "bg-warn-500",
  verified: "bg-primary-500",
  assigned: "bg-accent-500",
  in_progress: "bg-warn-500",
  done: "bg-primary-500",
  resolved: "bg-success-500",
  closed: "bg-slate-400",
  rejected: "bg-danger-500",
};

export type CommunityPostData = {
  id: string;
  refCode: string;
  title: string;
  description: string;
  status: ReportStatus;
  priority: number;
  authorName: string | null;
  authorInitial: string;
  categoryName: string | null;
  categoryColor: string | null;
  barangayName: string | null;
  addressText: string | null;
  createdAt: string;
  photoUrls: string[];
};

export function CommunityPost({ post }: { post: CommunityPostData }) {
  const [first] = post.photoUrls;
  const photos = post.photoUrls.slice(0, 3);

  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* ---------- header: avatar · author · meta · status ---------- */}
      <div className="flex items-center gap-3 px-3.5 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-sm font-bold text-primary-700">
          {post.authorInitial}
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold text-slate-800">
            {formatAuthor(post.authorName)}
          </p>
          <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-slate-400">
            <Icon name="pin" size="sm" className="shrink-0 text-slate-300" />
            <span className="truncate">
              {post.barangayName ? `Brgy. ${post.barangayName.replace(/^Barangay\s+/i, "")}` : "Barangay not set"}
              {post.addressText ? ` · ${post.addressText}` : ""} · {timeAgo(post.createdAt)}
            </span>
          </p>
        </div>
        <Link
          href={`/dashboard/reports/${post.id}`}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_PILL[post.status]}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[post.status]}`} />
          {STATUS_LABELS[post.status]}
        </Link>
      </div>

      {/* ---------- photo strip ---------- */}
      <Link href={`/dashboard/reports/${post.id}`} className="block bg-slate-100">
        {photos.length > 0 ? (
          <div className={`grid gap-px ${photos.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
            {photos.map((src, i) => (
              <div key={src} className={`relative ${photos.length === 3 && i === 0 ? "row-span-2" : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={post.title}
                  loading="lazy"
                  className={`w-full object-cover ${photos.length === 1 ? "max-h-[26rem]" : "h-48"}`}
                />
                {photos.length === 3 && i === 0 && (
                  <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    BEFORE
                  </span>
                )}
                {photos.length === 3 && i === 1 && (
                  <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    AFTER
                  </span>
                )}
                {i === 2 && photos.length === 3 ? (
                  <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    +{post.photoUrls.length - 3}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-44 items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 text-slate-300">
            <Icon name="camera" size="xl" />
          </div>
        )}
      </Link>

      {/* ---------- engagement / info bar ---------- */}
      <div className="space-y-2 px-3.5 pb-3.5 pt-2.5">
        <div className="flex items-center gap-4 text-slate-500">
          <span className="flex items-center gap-1.5 text-xs font-medium">
            <Icon name="check-circle" size="md" className={post.status === "resolved" || post.status === "closed" ? "text-success-500" : "text-slate-300"} />
            {STATUS_LABELS[post.status]}
          </span>
          {post.categoryName && (
            <span className="flex items-center gap-1.5 text-xs font-medium">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: post.categoryColor ?? "#94a3b8" }}
              />
              {post.categoryName}
            </span>
          )}
          {post.priority >= 4 && (
            <span className="flex items-center gap-1 text-xs font-semibold text-danger-600">
              <Icon name="alert" size="sm" /> Urgent
            </span>
          )}
          <span className="ml-auto font-mono text-[10px] text-slate-300">{post.refCode}</span>
        </div>

        <p className="text-sm leading-snug">
          <span className="font-semibold text-slate-800">{post.title}</span>{" "}
          <span className="text-slate-600">{post.description}</span>
        </p>
        <p className="text-[11px] text-slate-400">
          Tap the photo to view the full report and its progress
        </p>
      </div>
    </article>
  );
}
