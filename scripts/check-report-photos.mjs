/**
 * One-off diagnostic: inspect report_photos rows for a report by ref code.
 * Reads keys from .env.local; prints only non-sensitive metadata.
 *
 * Usage: node scripts/check-report-photos.mjs RPT-064D7E59
 */
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const ref = process.argv[2];
if (!ref) {
  console.error("Usage: node scripts/check-report-photos.mjs <REF_CODE>");
  process.exit(1);
}

const headers = { apikey: key, Authorization: `Bearer ${key}` };

const { data: report, error: repErr } = await fetch(
  `${url}/rest/v1/reports?ref_code=eq.${encodeURIComponent(ref)}&select=id,ref_code,title,status,created_at,resolved_at`,
  { headers }
).then((r) => r.json().then((j) => ({ data: j[0] ?? null, error: r.ok ? null : j })));

if (repErr || !report) {
  console.error("Report lookup failed:", repErr ?? "not found");
  process.exit(1);
}
console.log("REPORT:", JSON.stringify(report, null, 2));

const photos = await fetch(
  `${url}/rest/v1/report_photos?report_id=eq.${report.id}&select=storage_path,kind,created_at&order=created_at.asc`,
  { headers }
).then((r) => r.json());

console.log(`PHOTOS (${Array.isArray(photos) ? photos.length : "error"}):`);
console.log(JSON.stringify(photos, null, 2));

if (Array.isArray(photos)) {
  const before = photos.find((p) => p.kind === "citizen");
  const after = photos.find((p) => p.kind === "resolution");
  console.log("\nWHAT THE AUTO-POST WOULD HAVE FOUND:");
  console.log("  photoBeforePath (kind=citizen):   ", before ? before.storage_path : "NULL  ← no 'before' photo");
  console.log("  photoAfterPath  (kind=resolution):", after ? after.storage_path : "NULL  ← no 'after' photo");
  const cld = photos.some((p) => String(p.storage_path).startsWith("cld:"));
  console.log("  paths are Cloudinary (cld:):      ", cld);
}
