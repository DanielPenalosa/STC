/**
 * Client-safe photo URL helpers (no server imports — safe in both
 * server and client components).
 *
 * All photos are served by the authenticated /api/photo proxy, which routes
 * by path marker: "cld:" paths come from Cloudinary's CDN (with on-the-fly
 * resizing), everything else from Supabase Storage via service role. Access
 * is enforced in the route, so database policy drift can't expose or hide
 * photos.
 */
export function photoProxyUrl(
  bucket: "report-photos" | "verification-ids",
  path: string,
  width?: 160 | 320 | 640 | 960 | 1600
): string {
  const w = width ? `&w=${width}` : "";
  return `/api/photo?bucket=${bucket}&path=${encodeURIComponent(path)}${w}`;
}

/** Report photos — any signed-in user. `width` gives CDN-sized thumbnails. */
export function publicPhotoUrl(
  path: string,
  width?: 160 | 320 | 640 | 960 | 1600
): string {
  return photoProxyUrl("report-photos", path, width);
}

/** Admin-only ID photos — the route enforces the admin role. */
export function idPhotoUrl(path: string): string {
  return photoProxyUrl("verification-ids", path);
}
