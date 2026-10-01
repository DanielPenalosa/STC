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

    if (photoIds.length < 2 && (input.photoAfterPath || input.photoBeforePath)) {
      console.warn(
        `[facebook] posting with ${photoIds.length}/2 photo(s) for ${input.refCode}`
      );
    }

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
