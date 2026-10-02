/**
 * Facebook Page auto-posting for resolved reports (optional integration).
 *
 * When a report is approved as Resolved, SCOUT publishes a BEFORE | AFTER
 * post to the municipality's Facebook Page — transparency where the
 * community actually is.
 *
 * How it works (Graph API / Pages API):
 *   - Requires a PAGE access token with `pages_manage_posts` +
 *     `pages_read_engagement`, held by a Page admin. Page tokens minted from
 *     a long-lived user token DO NOT EXPIRE while the app stays installed.
 *   - Preferred format: both photos are composited server-side into ONE
 *     side-by-side image (BEFORE | AFTER, labeled) and published as a single
 *     photo post with the caption — Facebook renders it as one clean card.
 *     Composition uses sharp with PRE-RENDERED label bands embedded in the
 *     bundle (no runtime font files — serverless bundles drop those, which
 *     silently broke the labeled posts before). Falls back to individually
 *     labeled photos attached as one album-style post.
 *   - Everything is best-effort: a Facebook outage or bad token must never
 *     block the admin's approve action.
 */

import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

const GRAPH_VERSION = "v21.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** Absolute origin used to build public photo URLs Facebook can fetch. */
export function appOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_ORIGIN ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000")
  );
}

export function facebookConfigured(): boolean {
  return Boolean(process.env.FACEBOOK_PAGE_ACCESS_TOKEN && process.env.FACEBOOK_PAGE_ID);
}

/**
 * POST to the Graph API. Uses form-urlencoded — the format the Pages API
 * documentation specifies. (A JSON body works for simple fields but Graph
 * silently ignores bracketed keys like attached_media[0], dropping photos
 * without any error.)
 */
async function graph<T>(path: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      ...params,
      access_token: process.env.FACEBOOK_PAGE_ACCESS_TOKEN ?? "",
    }),
    // don't hang the resolve action on a slow Graph call
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json()) as { error?: { message?: string } };
  if (!res.ok || json.error) {
    throw new Error(json.error?.message ?? `Graph API error ${res.status}`);
  }
  return json as T;
}

/** Validate the token + page id, returning the Page's name and link. */
export async function getFacebookPageInfo(): Promise<{
  ok: boolean;
  name?: string;
  link?: string;
  error?: string;
}> {
  if (!facebookConfigured()) return { ok: false, error: "Facebook not configured" };
  try {
    const res = await fetch(
      `${GRAPH}/${process.env.FACEBOOK_PAGE_ID}?fields=name,link&access_token=${process.env.FACEBOOK_PAGE_ACCESS_TOKEN}`,
      { signal: AbortSignal.timeout(10_000) }
    );
    const json = (await res.json()) as {
      name?: string;
      link?: string;
      error?: { message?: string };
    };
    if (!res.ok || json.error) {
      return { ok: false, error: json.error?.message ?? `Graph API error ${res.status}` };
    }
    return { ok: true, name: json.name, link: json.link };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Connection failed" };
  }
}

/* ------------------------------ caption ------------------------------ */

const MANILA_DATE = new Intl.DateTimeFormat("en-PH", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "Asia/Manila",
});
const MANILA_TIME = new Intl.DateTimeFormat("en-PH", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Manila",
});

/** "October 2, 2026 at 3:45 PM" in the municipality's timezone, or null for missing/invalid dates. */
function formatDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${MANILA_DATE.format(d)} at ${MANILA_TIME.format(d)}`;
}

/**
 * Build the public caption in the formal register of a municipal page:
 * a public-advisory heading, what was resolved and where, and the exact
 * date AND time (Asia/Manila) the report was received and resolved.
 * Deliberately does NOT quote the report description — internal remarks
 * stay out of the public post.
 */
function buildCaption(input: {
  refCode: string;
  title: string;
  categoryName: string | null;
  barangayName: string | null;
  reportedAt: string | null;
  resolvedAt: string | null;
}): string {
  const brgy = input.barangayName?.replace(/^Barangay\s+/i, "") ?? null;
  const whereLine = brgy ? `Brgy. ${brgy}, Sta. Cruz, Laguna` : "Sta. Cruz, Laguna";

  const reported = formatDateTime(input.reportedAt);
  const resolved = formatDateTime(input.resolvedAt);

  const lines = [
    "📢 PUBLIC ADVISORY — REPORT RESOLVED",
    "",
    "The Municipal Government of Sta. Cruz, Laguna, through the SCOUT response system, informs the public that the following concern has been verified and acted upon:",
    "",
    `📌 ${input.title}`,
    `📍 ${whereLine}`,
  ];
  if (input.categoryName) lines.push(`🗂️ Concern: ${input.categoryName}`);
  if (reported || resolved) {
    lines.push("");
    if (reported) lines.push(`🗓️ Date Reported: ${reported}`);
    if (resolved) lines.push(`✅ Date Resolved: ${resolved}`);
  }
  lines.push(
    "",
    `🔖 Reference No.: ${input.refCode}`,
    "",
    "Maraming salamat po sa patuloy na pakikilahok ng ating mga mamamayan. Ipaalam agad sa SCOUT ang anumang isyu sa inyong pamayanan.",
    "",
    "#SCOUT #StaCruzLaguna #SerbisyongPubliko #Transparency"
  );
  return lines.join("\n");
}

/* ------------------------------ photo compositing ------------------------------ */

/** Side-by-side layout constants (Facebook renders large photos well up to ~2048px). */
const SIDE = 800; // each photo scaled to 800×800 (cover)
const PAD = 20; // margins + gap between the two photos
const LABEL_H = 72; // blue label band above each photo
const PHOTO_JPEG = { quality: 82 } as const;

/**
 * Pre-rendered 800×72 label bands, embedded as base64 PNG so they ship
 * inside the serverless bundle. (Text rendering with runtime font files
 * broke on Vercel — node_modules assets the bundler doesn't trace are
 * absent at runtime, so every labeled post silently fell back to plain
 * photos.) The bands were generated with sharp from an SVG source; see
 * scripts/test-sidebyside.mjs for the same geometry rendered live.
 */
const LABEL_PNGS: Record<"BEFORE" | "AFTER", string> = {
  BEFORE:
    "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",
  AFTER:
    "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",
};

function labelBuffer(text: "BEFORE" | "AFTER"): Buffer {
  return Buffer.from(LABEL_PNGS[text], "base64");
}

/**
 * Download a report photo as raw bytes for compositing.
 *   - "cld:<id>" → Cloudinary CDN (forced to JPG — f_auto could return WebP)
 *   - anything else → Supabase Storage via the service role
 * Never throws; null means "skip this photo".
 */
async function loadPhotoBytes(db: SupabaseClient, storagePath: string): Promise<Buffer | null> {
  try {
    if (storagePath.startsWith("cld:")) {
      const cloud = process.env.CLOUDINARY_CLOUD_NAME;
      if (!cloud) return null;
      const url = `https://res.cloudinary.com/${cloud}/image/upload/f_jpg,q_auto,w_960/${encodeURIComponent(storagePath.slice(4))}.jpg`;
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    }
    const { data, error } = await db.storage.from("report-photos").download(storagePath);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Composite BEFORE (left) and AFTER (right) into one labeled side-by-side
 * JPEG — the single image that goes out to the Page. Returns null when
 * either photo can't be decoded; the caller then falls back to the album
 * style so a post still happens.
 */
async function composeSideBySide(before: Buffer, after: Buffer): Promise<Buffer | null> {
  try {
    const [left, right] = await Promise.all([
      sharp(before).resize(SIDE, SIDE, { fit: "cover" }).jpeg(PHOTO_JPEG).toBuffer(),
      sharp(after).resize(SIDE, SIDE, { fit: "cover" }).jpeg(PHOTO_JPEG).toBuffer(),
    ]);

    const W = PAD + SIDE + PAD + SIDE + PAD;
    const H = PAD + LABEL_H + SIDE + PAD;

    // quality 82 keeps the composite ≈300 KB — Facebook recompresses anyway
    return await sharp({
      create: { width: W, height: H, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .composite([
        { input: labelBuffer("BEFORE"), left: PAD, top: PAD },
        { input: labelBuffer("AFTER"), left: PAD + SIDE + PAD, top: PAD },
        { input: left, left: PAD, top: PAD + LABEL_H },
        { input: right, left: PAD + SIDE + PAD, top: PAD + LABEL_H },
      ])
      .jpeg(PHOTO_JPEG)
      .toBuffer();
  } catch (e) {
    console.error(
      "[facebook] side-by-side composition failed:",
      e instanceof Error ? e.message : e
    );
    return null;
  }
}

/**
 * Stamp the same blue BEFORE/AFTER band onto a SINGLE photo for the
 * album-style fallback, so both photos stay identifiable even when the
 * side-by-side composite can't be built. Returns null on decode failure.
 */
async function labelSinglePhoto(bytes: Buffer, text: "BEFORE" | "AFTER"): Promise<Buffer | null> {
  try {
    const W = PAD + SIDE + PAD;
    const H = PAD + LABEL_H + SIDE + PAD;
    const photo = await sharp(bytes).resize(SIDE, SIDE, { fit: "cover" }).jpeg(PHOTO_JPEG).toBuffer();
    return await sharp({
      create: { width: W, height: H, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .composite([
        { input: labelBuffer(text), left: PAD, top: PAD },
        { input: photo, left: PAD, top: PAD + LABEL_H },
      ])
      .jpeg(PHOTO_JPEG)
      .toBuffer();
  } catch (e) {
    console.error(
      "[facebook] single-photo labeling failed:",
      e instanceof Error ? e.message : e
    );
    return null;
  }
}

/**
 * Upload image BYTES to the Page via multipart form-data (the only way to
 * post a composed image — a `url` would have to be publicly fetchable).
 * Default (`published: true` + caption) creates the final photo post;
 * `published: false` uploads a hidden photo whose id can be attached to a
 * feed post with attached_media.
 */
async function graphUploadPhotoOnce(
  pageId: string,
  jpeg: Buffer,
  opts: { caption?: string; published?: boolean }
): Promise<string> {
  const form = new FormData();
  form.append("access_token", process.env.FACEBOOK_PAGE_ACCESS_TOKEN ?? "");
  form.append("published", opts.published === false ? "false" : "true");
  if (opts.caption) form.append("caption", opts.caption);
  form.append(
    "source",
    new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }),
    "scout-report.jpg"
  );

  const res = await fetch(`${GRAPH}/${pageId}/photos`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await res.json()) as { id?: string; error?: { message?: string } };
  if (!res.ok || json.error || !json.id) {
    throw new Error(json.error?.message ?? `Graph API error ${res.status}`);
  }
  return json.id;
}

/**
 * Upload with retries — Graph occasionally 4xx/5xx-transiently drops one
 * photo of a pair, which is how the BEFORE photo went missing from a live
 * post. Backs off 1s, 2s before giving up on the photo.
 */
async function graphUploadPhoto(
  pageId: string,
  jpeg: Buffer,
  opts: { caption?: string; published?: boolean } = {}
): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await graphUploadPhotoOnce(pageId, jpeg, opts);
    } catch (e) {
      lastErr = e;
      console.warn(
        `[facebook] photo upload attempt ${attempt}/3 failed:`,
        e instanceof Error ? e.message : e
      );
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }
  throw lastErr;
}

/**
 * Publish a resolved report to the Page.
 *
 * Format: ONE side-by-side BEFORE | AFTER image as a single photo post with
 * the formal advisory caption (dates + times, ref code — no quoted remarks).
 * Falls back to an album-style post of individually labeled photos when
 * composition fails, and to unlabeled photos when even labeling fails.
 * Every photo gets three upload attempts before it may be skipped. Returns
 * the post id.
 */
export async function postResolvedReportToFacebook(input: {
  refCode: string;
  title: string;
  categoryName: string | null;
  barangayName: string | null;
  reportedAt: string | null;
  resolvedAt: string | null;
  photoBeforePath: string | null;
  photoAfterPath: string | null;
}): Promise<{ ok: boolean; postId?: string; error?: string }> {
  if (!facebookConfigured()) {
    return { ok: false, error: "Facebook not configured" };
  }
  const pageId = process.env.FACEBOOK_PAGE_ID as string;
  const caption = buildCaption(input);
  const db = createAdminClient();

  try {
    /* ---- preferred: one labeled BEFORE | AFTER image ---- */
    if (input.photoBeforePath && input.photoAfterPath) {
      const [beforeBytes, afterBytes] = await Promise.all([
        loadPhotoBytes(db, input.photoBeforePath),
        loadPhotoBytes(db, input.photoAfterPath),
      ]);
      if (beforeBytes && afterBytes) {
        const composed = await composeSideBySide(beforeBytes, afterBytes);
        if (composed) {
          const postId = await graphUploadPhoto(pageId, composed, { caption });
          console.log(`[facebook] posted ${input.refCode} (side-by-side) → photo ${postId}`);
          return { ok: true, postId };
        }
      }
      console.warn(
        `[facebook] ${input.refCode}: compositing unavailable — falling back to album post`
      );
    }

    /* ---- fallback: album-style multi-photo attach, BEFORE first ---- */
    const photoIds: string[] = [];

    // Label each photo when it can be decoded; otherwise upload the raw
    // bytes unlabeled (Facebook decodes formats sharp may not). A photo is
    // only ever skipped after three failed upload attempts.
    const tryPhoto = async (path: string | null, label: "BEFORE" | "AFTER") => {
      if (!path) return;
      const bytes = await loadPhotoBytes(db, path);
      if (!bytes) {
        console.error(`[facebook] ${label} photo download failed (${path}) — skipped`);
        return;
      }
      const labeled = await labelSinglePhoto(bytes, label);
      try {
        const photoId = await graphUploadPhoto(pageId, labeled ?? bytes, { published: false });
        photoIds.push(photoId);
        if (!labeled) {
          console.warn(`[facebook] ${label} photo posted unlabeled (decode failed)`);
        }
      } catch (e) {
        console.error(
          `[facebook] ${label} photo upload failed after retries:`,
          e instanceof Error ? e.message : e
        );
      }
    };

    await tryPhoto(input.photoBeforePath, "BEFORE");
    await tryPhoto(input.photoAfterPath, "AFTER");

    let postId: string | undefined;
    if (photoIds.length > 0) {
      // one album-style post carrying all the photos (Before first)
      const res = await graph<{ id: string }>("/me/feed", {
        message: caption,
        ...Object.fromEntries(
          photoIds.map((id, i) => [
            `attached_media[${i}]`,
            JSON.stringify({ media_fbid: id }),
          ])
        ),
      });
      postId = res.id;
    } else {
      // no photos at all → plain text status post
      const res = await graph<{ id: string }>("/me/feed", { message: caption });
      postId = res.id;
    }

    console.log(
      `[facebook] posted ${input.refCode} (${photoIds.length} photo(s)) → post ${postId ?? "?"}`
    );
    return { ok: true, postId };
  } catch (e) {
    console.error(
      `[facebook] auto-post failed for ${input.refCode}:`,
      e instanceof Error ? e.message : e
    );
    return { ok: false, error: e instanceof Error ? e.message : "Facebook post failed" };
  }
}
