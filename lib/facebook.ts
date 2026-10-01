/**
 * Facebook Page auto-posting for resolved reports (optional integration).
 *
 * When a report is approved as Resolved, SCOUT can publish a BEFORE/AFTER
 * photo post to the municipality's Facebook Page — transparency where the
 * community actually is.
 *
 * How it works (Graph API / Pages API):
 *   - Requires a PAGE access token with `pages_manage_posts` +
 *     `pages_read_engagement`, held by a Page admin. Page tokens minted from
 *     a long-lived user token DO NOT EXPIRE while the app stays installed.
 *   - A photo post is one call: POST /{page-id}/photos with `url` (a PUBLIC
 *     image URL Facebook's servers fetch themselves) + `caption`. Photos of
 *     resolved reports are exactly the set /api/photo serves to anonymous
 *     visitors, so the proxy URL works as `url`.
 *   - Everything is best-effort: a Facebook outage or bad token must never
 *     block the admin's approve action.
 */

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

async function graph<T>(path: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...params, access_token: process.env.FACEBOOK_PAGE_ACCESS_TOKEN }),
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

/**
 * Publish a resolved report to the Page: BEFORE and AFTER photos + caption.
 * Photos are attached as unpublished to one shared post — Facebook renders
 * them as a single album-style post. Returns the post id / permalink.
 */
export async function postResolvedReportToFacebook(input: {
  refCode: string;
  title: string;
  categoryName: string | null;
  barangayName: string | null;
  resolvedAt: string | null;
  photoBeforePath: string | null;
  photoAfterPath: string | null;
}): Promise<{ ok: boolean; postId?: string; error?: string }> {
  if (!facebookConfigured()) {
    return { ok: false, error: "Facebook not configured" };
  }
  const origin = appOrigin();
  const photoUrl = (path: string, width: 640 | 960) =>
    `${origin}/api/photo?bucket=report-photos&path=${encodeURIComponent(path)}&w=${width}`;

  const where = input.barangayName ? ` in Brgy. ${input.barangayName.replace(/^Barangay\s+/i, "")}` : "";
  const caption = [
    `✅ RESOLVED — ${input.title}${where}`,
    "",
    `Ref: ${input.refCode} · Reported through SCOUT (${input.categoryName ?? "Community Report"})`,
    "Before → After: the issue as reported, and the site after the fix.",
    "",
    "#SCOUT #StaCruzLaguna #Transparency",
  ].join("\n");

  try {
    const photoIds: string[] = [];
    const after = input.photoAfterPath
      ? await graph<{ id: string }>("/me/photos", {
          url: photoUrl(input.photoAfterPath, 960),
          published: "false",
        })
      : null;
    if (after?.id) photoIds.push(after.id);

    const before = input.photoBeforePath
      ? await graph<{ id: string }>("/me/photos", {
          url: photoUrl(input.photoBeforePath, 960),
          published: "false",
        })
      : null;
    if (before?.id) photoIds.push(before.id);

    let postId: string | undefined;
    if (photoIds.length > 0) {
      // one album-style post carrying all the photos (After first)
      const res = await graph<{ id: string }>("/me/feed", {
        message: caption,
        ...Object.fromEntries(photoIds.map((id, i) => [`attached_media[${i}]`, JSON.stringify({ media_fbid: id })])),
      });
      postId = res.id;
    } else {
      // no photos at all → plain text status post
      const res = await graph<{ id: string }>("/me/feed", { message: caption });
      postId = res.id;
    }

    return { ok: true, postId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Facebook post failed" };
  }
}
