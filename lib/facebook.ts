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
 *     Composition uses jimp (pure JS, already a dependency) and falls back
 *     to the older album-style multi-photo attach when decoding fails.
 *   - Everything is best-effort: a Facebook outage or bad token must never
 *     block the admin's approve action.
 */

import Jimp from "jimp";
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

/** "Oct 2, 2026" in the municipality's timezone, or null for missing/invalid dates. */
function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  }).format(d);
}

/** Build the public caption: what happened, where, the situation, and the dates. */
function buildCaption(input: {
  refCode: string;
  title: string;
  description: string | null;
  categoryName: string | null;
  barangayName: string | null;
  reportedAt: string | null;
  resolvedAt: string | null;
}): string {
  const brgy = input.barangayName?.replace(/^Barangay\s+/i, "") ?? null;
  const whereLine = [brgy ? `📍 Brgy. ${brgy}` : null, input.categoryName]
    .filter(Boolean)
    .join(" · ");

  const situation = (input.description ?? "").trim().replace(/\s+/g, " ");
  const situationLine = situation
    ? situation.length > 280
      ? `${situation.slice(0, 280).trimEnd()}…`
      : situation
    : null;

  const reported = formatDate(input.reportedAt);
  const resolved = formatDate(input.resolvedAt);

  const lines = [`✅ RESOLVED — ${input.title}`];
  if (whereLine) lines.push(whereLine);
  if (situationLine) lines.push("", situationLine);
  if (reported || resolved) {
    lines.push("");
    if (reported) lines.push(`📅 Reported: ${reported}`);
    if (resolved) lines.push(`🛠️ Resolved: ${resolved}`);
  }
  lines.push(
    "",
    `Ref: ${input.refCode} · SCOUT — Sta. Cruz Community Observation and Unified Triage`,
    "#SCOUT #StaCruzLaguna #Transparency"
  );
  return lines.join("\n");
}

/* ------------------------------ photo compositing ------------------------------ */

/** Side-by-side layout constants (Facebook renders large photos well up to ~2048px). */
const SIDE = 800; // each photo scaled to 800×800 (cover)
const PAD = 20; // margins + gap between the two photos
const LABEL_H = 48; // blue label band above each photo
const LABEL_BG = 0x2333a0ff; // SCOUT blue

/**
 * Download a report photo as raw bytes for compositing.
 *   - "cld:<id>" → Cloudinary CDN (forced to JPG — f_auto could return
 *     WebP, which jimp cannot decode)
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
    const [beforeImg, afterImg, font] = await Promise.all([
      Jimp.read(before),
      Jimp.read(after),
      Jimp.loadFont(Jimp.FONT_SANS_32_WHITE),
    ]);

    const W = PAD + SIDE + PAD + SIDE + PAD;
    const H = PAD + LABEL_H + SIDE + PAD;
    const canvas = new Jimp(W, H, 0xffffffff);

    const label = (text: string, x: number) => {
      for (let y = PAD; y < PAD + LABEL_H; y++) {
        for (let px = x; px < x + SIDE; px++) canvas.setPixelColor(LABEL_BG, px, y);
      }
      const w = Jimp.measureText(font, text);
      canvas.print(font, x + Math.round((SIDE - w) / 2), PAD + 7, text);
    };

    const leftX = PAD;
    const rightX = PAD + SIDE + PAD;
    const photoY = PAD + LABEL_H;

    canvas.composite(beforeImg.clone().cover(SIDE, SIDE), leftX, photoY);
    canvas.composite(afterImg.clone().cover(SIDE, SIDE), rightX, photoY);
    label("BEFORE", leftX);
    label("AFTER", rightX);

    // quality 80 keeps the composite ≈300 KB — Facebook recompresses anyway
    return await canvas.quality(80).getBufferAsync(Jimp.MIME_JPEG);
  } catch (e) {
    console.error(
      "[facebook] side-by-side composition failed:",
      e instanceof Error ? e.message : e
    );
    return null;
  }
}

/**
 * Upload image BYTES to the Page via multipart form-data (the only way to
 * post a composed image — a `url` would have to be publicly fetchable).
 * With `published: true` + caption this creates the final photo post.
 */
async function graphUploadPhoto(pageId: string, jpeg: Buffer, caption: string): Promise<string> {
  const form = new FormData();
  form.append("access_token", process.env.FACEBOOK_PAGE_ACCESS_TOKEN ?? "");
  form.append("published", "true");
  form.append("caption", caption);
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
 * Publish a resolved report to the Page.
 *
 * Format: ONE side-by-side BEFORE | AFTER image as a single photo post with
 * a caption carrying the situation (from the report description), the dates
 * reported/resolved, and the ref code. Falls back to the older album-style
 * multi-photo attach when composition fails, a plain photo when only one
 * photo exists, and a text-only status when there are none. Returns the
 * post id.
 */
export async function postResolvedReportToFacebook(input: {
  refCode: string;
  title: string;
  description: string | null;
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
  const origin = appOrigin();
  const photoUrl = (path: string, width: 640 | 960) =>
    `${origin}/api/photo?bucket=report-photos&path=${encodeURIComponent(path)}&w=${width}`;

  try {
    /* ---- preferred: one labeled BEFORE | AFTER image ---- */
    if (input.photoBeforePath && input.photoAfterPath) {
      const db = createAdminClient();
      const [beforeBytes, afterBytes] = await Promise.all([
        loadPhotoBytes(db, input.photoBeforePath),
        loadPhotoBytes(db, input.photoAfterPath),
      ]);
      if (beforeBytes && afterBytes) {
        const composed = await composeSideBySide(beforeBytes, afterBytes);
        if (composed) {
          const postId = await graphUploadPhoto(pageId, composed, caption);
          console.log(`[facebook] posted ${input.refCode} (side-by-side) → photo ${postId}`);
          return { ok: true, postId };
        }
      }
      console.warn(
        `[facebook] ${input.refCode}: compositing unavailable — falling back to album post`
      );
    }

    /* ---- fallback: album-style multi-photo attach (public URLs) ---- */
    const photoIds: string[] = [];

    // Upload each photo unpublished, then attach all of them to one feed
    // post. A single broken photo must not drop the whole album — tolerate
    // per-photo failure and post with whatever made it through.
    const tryPhoto = async (path: string | null, label: string) => {
      if (!path) return;
      const url = photoUrl(path, 960);
      try {
        const res = await graph<{ id: string }>("/me/photos", {
          url,
          published: "false",
        });
        if (res?.id) photoIds.push(res.id);
      } catch (e) {
        console.error(
          `[facebook] ${label} photo upload failed (${url}):`,
          e instanceof Error ? e.message : e
        );
      }
    };

    await tryPhoto(input.photoAfterPath, "after");
    await tryPhoto(input.photoBeforePath, "before");

    let postId: string | undefined;
    if (photoIds.length > 0) {
      // one album-style post carrying all the photos (After first)
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
