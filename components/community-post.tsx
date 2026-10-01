"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  toggleLike,
  addCommunityComment,
  deleteCommunityComment,
  submitFeedback,
} from "@/app/actions/reports";
import { Icon } from "@/components/icons";
import { inputCls } from "@/components/ui";
import type { CommunityComment } from "@/lib/types";

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

export type CommunityPostData = {
  id: string;
  refCode: string;
  title: string;
  description: string;
  /** the feed only lists resolved reports; kept wide to match Report */
  status: string;
  priority: number;
  authorName: string | null;
  authorInitial: string;
  categoryName: string | null;
  categoryColor: string | null;
  barangayName: string | null;
  addressText: string | null;
  createdAt: string;
  resolvedAt: string | null;
  photoUrls: string[];
  /** completion evidence uploaded by the department — shown as AFTER */
  resolutionPhotoUrls: string[];
  likes: number;
  likedByMe: boolean;
  comments: CommunityComment[];
  ratingCount: number;
  ratingAvg: number;
  /** the viewer's own star rating (0 = not rated yet) */
  myRating: number;
  amReporter: boolean;
};

export function CommunityPost({ post }: { post: CommunityPostData }) {
  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <PostHeader post={post} />
      <PostPhotos post={post} />
      <PostEngagement post={post} />
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* header: avatar · author · meta · resolved pill                      */
/* ------------------------------------------------------------------ */

function PostHeader({ post }: { post: CommunityPostData }) {
  return (
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
            {post.addressText ? ` · ${post.addressText}` : ""} ·{" "}
            Resolved {post.resolvedAt ? timeAgo(post.resolvedAt) : timeAgo(post.createdAt)}
          </span>
        </p>
      </div>
      <Link
        href={`/dashboard/reports/${post.id}`}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-success-50 px-2.5 py-1 text-[11px] font-semibold text-success-700"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-success-500" />
        Resolved
      </Link>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* photos: BEFORE (citizen) / AFTER (resolution) pairs                 */
/* ------------------------------------------------------------------ */

function PostPhotos({ post }: { post: CommunityPostData }) {
  // one citizen photo + one resolution photo, side by side — the same
  // before/after pairing the landing transparency feed uses
  const [before] = post.photoUrls;
  const [after] = post.resolutionPhotoUrls;

  return (
    <Link href={`/dashboard/reports/${post.id}`} className="block bg-slate-100">
      <div className="relative grid h-48 grid-cols-2 grid-rows-1 divide-x divide-white/40 overflow-hidden">
        {before ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={before}
            alt={`${post.title} — before`}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-50">
            <Icon name="camera" size="lg" className="text-slate-300" />
          </div>
        )}
        {after ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={after}
            alt={`${post.title} — after`}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-success-50 to-primary-50">
            <Icon name="check-circle" size="xl" className="text-success-500" />
          </div>
        )}
        {before && (
          <span className="absolute bottom-2 left-2 rounded-full bg-slate-900/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur-sm">
            Before
          </span>
        )}
        {after && (
          <span className="absolute bottom-2 left-1/2 ml-2 rounded-full bg-success-600/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur-sm">
            After
          </span>
        )}
      </div>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* body + engagement: title · rating · like · comment                  */
/* ------------------------------------------------------------------ */

function PostEngagement({ post }: { post: CommunityPostData }) {
  const router = useRouter();
  const [liked, setLiked] = useState(post.likedByMe);
  const [likeCount, setLikeCount] = useState(post.likes);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // optimistic like — flips instantly, rolls back on failure
  async function onLike() {
    if (busy) return;
    setBusy(true);
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => c + (next ? 1 : -1));
    const res = await toggleLike(post.id);
    setBusy(false);
    if (!res.ok) {
      setLiked(!next);
      setLikeCount((c) => c + (next ? -1 : 1));
      return;
    }
    if (typeof res.liked === "boolean" && res.liked !== next) {
      setLiked(res.liked);
      setLikeCount((c) => c + (res.liked ? 1 : -1));
    }
  }

  return (
    <div className="space-y-2.5 px-3.5 pb-3.5 pt-2.5">
      <div className="flex items-center gap-4 text-slate-500">
        {post.categoryName && (
          <span className="flex items-center gap-1.5 text-xs font-medium">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: post.categoryColor ?? "#94a3b8" }}
            />
            {post.categoryName}
          </span>
        )}
        {post.ratingCount > 0 && (
          <span className="flex items-center gap-1 text-xs font-semibold text-amber-600">
            <Icon name="star" size="sm" className="text-amber-500" />
            {post.ratingAvg.toFixed(1)}
            <span className="font-normal text-slate-400">({post.ratingCount})</span>
          </span>
        )}
        <span className="ml-auto font-mono text-[10px] text-slate-300">{post.refCode}</span>
      </div>

      <p className="text-sm leading-snug">
        <span className="font-semibold text-slate-800">{post.title}</span>{" "}
        <span className="text-slate-600">{post.description}</span>
      </p>

      {/* action row */}
      <div className="flex items-center gap-1 border-t border-slate-100 pt-2">
        <button
          onClick={onLike}
          aria-pressed={liked}
          aria-label={liked ? "Unlike" : "Like"}
          className={`press inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
            liked ? "bg-rose-50 text-rose-600" : "text-slate-500 hover:bg-slate-50"
          }`}
        >
          <Icon
            name="heart"
            size="md"
            className={liked ? "fill-rose-500 text-rose-500" : ""}
          />
          {likeCount > 0 ? likeCount : "Like"}
        </button>

        <button
          onClick={() => setCommentsOpen((v) => !v)}
          aria-expanded={commentsOpen}
          aria-label="Comments"
          className={`press inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
            commentsOpen ? "bg-primary-50 text-primary-700" : "text-slate-500 hover:bg-slate-50"
          }`}
        >
          <Icon name="chat" size="md" />
          {post.comments.length > 0 ? post.comments.length : "Comment"}
        </button>

        <RateToggle post={post} />

        <Link
          href={`/dashboard/reports/${post.id}`}
          className="press ml-auto inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
        >
          Details <Icon name="chevron-right" size="sm" />
        </Link>
      </div>

      {commentsOpen && (
        <CommentSection post={post} onRefresh={() => router.refresh()} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* comments: inline thread with composer                               */
/* ------------------------------------------------------------------ */

function CommentSection({
  post,
  onRefresh,
}: {
  post: CommunityPostData;
  onRefresh: () => void;
}) {
  const [items, setItems] = useState<CommunityComment[]>(post.comments);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await addCommunityComment(post.id, message);
    setBusy(false);
    if (!res.ok || !res.comment) {
      setError(res.error ?? "Failed to comment");
      return;
    }
    setItems((xs) => [...xs, res.comment!]);
    setMessage("");
    onRefresh();
  }

  async function onDelete(id: string) {
    const res = await deleteCommunityComment(id);
    if (res.ok) {
      setItems((xs) => xs.filter((c) => c.id !== id));
      onRefresh();
    }
  }

  return (
    <div className="space-y-2 rounded-lg bg-slate-50/80 p-2.5">
      <form onSubmit={onSubmit} className="flex items-start gap-2">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={1000}
          placeholder="Write a comment…"
          className={`${inputCls} flex-1 py-1.5 text-xs`}
        />
        <button
          type="submit"
          disabled={busy || !message.trim()}
          className="press inline-flex items-center gap-1 rounded-lg bg-primary-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-700 disabled:opacity-50"
        >
          <Icon name="send" size="sm" />
          {busy ? "…" : "Post"}
        </button>
      </form>
      {error && <p className="text-xs font-medium text-danger-600">{error}</p>}

      {items.map((c) => (
        <div key={c.id} className="rounded-lg border border-slate-100 bg-white px-2.5 py-2">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[11px] font-bold text-slate-700">
              {c.author}
              {c.mine && <span className="ml-1 font-normal text-slate-400">· you</span>}
            </p>
            <div className="flex shrink-0 items-center gap-1.5">
              <p className="text-[10px] text-slate-400">{timeAgo(c.createdAt)}</p>
              {c.mine && (
                <button
                  onClick={() => void onDelete(c.id)}
                  aria-label="Delete comment"
                  className="press text-slate-300 transition hover:text-danger-600"
                >
                  <Icon name="trash" size="sm" />
                </button>
              )}
            </div>
          </div>
          <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-600">
            {c.message}
          </p>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* rating: expandable 1–5 star control per user                        */
/* ------------------------------------------------------------------ */

function RateToggle({ post }: { post: CommunityPostData }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(post.myRating);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    if (busy || rating === 0) return;
    setBusy(true);
    setError(null);
    const res = await submitFeedback(post.id, rating, comment);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Failed to submit");
      return;
    }
    setSaved(true);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Rate this resolution"
        className={`press inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
          post.myRating > 0
            ? "bg-amber-50 text-amber-700"
            : "text-slate-500 hover:bg-slate-50"
        }`}
      >
        <Icon
          name="star"
          size="md"
          className={post.myRating > 0 ? "fill-amber-500 text-amber-500" : ""}
        />
        {post.myRating > 0 ? `${post.myRating}/5` : "Rate"}
      </button>

      {open && (
        <div className="rounded-lg bg-amber-50/60 p-2.5">
          <p className="text-[11px] font-bold text-slate-700">
            {post.myRating > 0 ? "Update your rating" : "How well was this resolved?"}
          </p>
          <div className="mt-1.5 flex items-center gap-1" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} star${n > 1 ? "s" : ""}`}
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(0)}
                onClick={() => setRating(n)}
                className="press transition hover:scale-110"
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill={n <= (hover || rating) ? "#f59e0b" : "none"}
                  stroke={n <= (hover || rating) ? "#f59e0b" : "#cbd5e1"}
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M12 2.5l2.95 5.98 6.6.96-4.78 4.66 1.13 6.58L12 17.57l-5.9 3.11 1.13-6.58L2.45 9.44l6.6-.96L12 2.5z" />
                </svg>
              </button>
            ))}
            {rating > 0 && (
              <span className="ml-1 text-xs font-semibold text-slate-500">
                {["", "Poor", "Fair", "Good", "Very good", "Excellent"][rating]}
              </span>
            )}
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Optional comment…"
            className={`${inputCls} mt-2 resize-none bg-white text-xs`}
          />
          {error && <p className="mt-1 text-xs font-medium text-danger-600">{error}</p>}
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => void onSubmit()}
              disabled={busy || rating === 0}
              className="press flex-1 justify-center rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-700 disabled:opacity-50"
            >
              {busy ? "Submitting…" : saved ? "Saved!" : "Submit rating"}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
