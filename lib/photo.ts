/**
 * Client-safe photo URL helpers (no server imports — safe in both
 * server and client components).
 *
 * All photos are served by the authenticated /api/photo proxy, which reads
 * from Storage with the service role after enforcing access in code. This
 * keeps images working even when bucket policies/public flags have drifted
 * on the database.
 */
export function photoProxyUrl(bucket: "report-photos" | "verification-ids", path: string): string {
  return `/api/photo?bucket=${bucket}&path=${encodeURIComponent(path)}`;
}

/** Report photos — any signed-in user. */
export function publicPhotoUrl(path: string): string {
  return photoProxyUrl("report-photos", path);
}

/** Admin-only ID photos — the route enforces the admin role. */
export function idPhotoUrl(path: string): string {
  return photoProxyUrl("verification-ids", path);
}
