/**
 * One-off smoke test: reproduce the side-by-side BEFORE|AFTER composition
 * from lib/facebook.ts against the REAL photos of a report, and write the
 * result to a temp file. Verifies both storage download paths (Cloudinary
 * + Supabase) and the sharp compositing — no Facebook call is made.
 *
 * The label bands are re-rendered here from the same SVG source that
 * produced the base64 PNGs embedded in lib/facebook.ts, so the output
 * matches what the live pipeline builds.
 *
 * Usage: node scripts/test-sidebyside.mjs RPT-064D7E59
 */
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

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
  console.error("Usage: node scripts/test-sidebyside.mjs <REF_CODE>");
  process.exit(1);
}

const headers = { apikey: key, Authorization: `Bearer ${key}` };

// same layout constants as lib/facebook.ts
const SIDE = 800;
const PAD = 20;
const LABEL_H = 72;
const PHOTO_JPEG = { quality: 82 };

/** Same SVG source that generated the embedded label PNGs. */
async function labelBuffer(text) {
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIDE}" height="${LABEL_H}">` +
      `<rect width="100%" height="100%" fill="#2333a0"/>` +
      `<text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" ` +
      `font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="40" ` +
      `font-weight="bold" letter-spacing="6" fill="#ffffff">${text}</text>` +
    `</svg>`
  );
  return sharp(svg).png().toBuffer();
}

async function loadPhotoBytes(storagePath) {
  if (storagePath.startsWith("cld:")) {
    const cloud = env.CLOUDINARY_CLOUD_NAME;
    if (!cloud) throw new Error("CLOUDINARY_CLOUD_NAME missing");
    const dl = `https://res.cloudinary.com/${cloud}/image/upload/f_jpg,q_auto,w_960/${encodeURIComponent(storagePath.slice(4))}.jpg`;
    const res = await fetch(dl);
    if (!res.ok) throw new Error(`Cloudinary fetch ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  const res = await fetch(
    `${url}/storage/v1/object/report-photos/${encodeURIComponent(storagePath)}`,
    { headers }
  );
  if (!res.ok) throw new Error(`Supabase download ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const { data: report } = await fetch(
  `${url}/rest/v1/reports?ref_code=eq.${encodeURIComponent(ref)}&select=id,ref_code,title,created_at,resolved_at`,
  { headers }
).then((r) => r.json().then((j) => ({ data: j[0] ?? null })));

if (!report) {
  console.error("Report not found:", ref);
  process.exit(1);
}
console.log("REPORT:", report.ref_code, "-", report.title);

const photos = await fetch(
  `${url}/rest/v1/report_photos?report_id=eq.${report.id}&select=storage_path,kind,created_at&order=created_at.asc`,
  { headers }
).then((r) => r.json());

const before = photos.find((p) => p.kind === "citizen");
const after = photos.find((p) => p.kind === "resolution");
if (!before || !after) {
  console.error("Need one citizen (before) and one resolution (after) photo.");
  process.exit(1);
}
console.log("BEFORE path:", before.storage_path);
console.log("AFTER  path:", after.storage_path);

const t0 = Date.now();
const [beforeBytes, afterBytes] = await Promise.all([
  loadPhotoBytes(before.storage_path),
  loadPhotoBytes(after.storage_path),
]);
console.log(`downloaded: before=${beforeBytes.length}B after=${afterBytes.length}B in ${Date.now() - t0}ms`);

const [left, right, beforeLabel, afterLabel] = await Promise.all([
  sharp(beforeBytes).resize(SIDE, SIDE, { fit: "cover" }).jpeg(PHOTO_JPEG).toBuffer(),
  sharp(afterBytes).resize(SIDE, SIDE, { fit: "cover" }).jpeg(PHOTO_JPEG).toBuffer(),
  labelBuffer("BEFORE"),
  labelBuffer("AFTER"),
]);

const W = PAD + SIDE + PAD + SIDE + PAD;
const H = PAD + LABEL_H + SIDE + PAD;
const out = await sharp({
  create: { width: W, height: H, channels: 3, background: { r: 255, g: 255, b: 255 } },
})
  .composite([
    { input: beforeLabel, left: PAD, top: PAD },
    { input: afterLabel, left: PAD + SIDE + PAD, top: PAD },
    { input: left, left: PAD, top: PAD + LABEL_H },
    { input: right, left: PAD + SIDE + PAD, top: PAD + LABEL_H },
  ])
  .jpeg(PHOTO_JPEG)
  .toBuffer();

const outPath = new URL("../.sidebyside-test.jpg", import.meta.url);
writeFileSync(outPath, out);
console.log(`COMPOSED: ${W}x${H}, ${(out.length / 1024).toFixed(0)} KB, ${Date.now() - t0}ms total`);
console.log("WROTE:", outPath.pathname.replace(/^\/([A-Za-z]:)/, "$1"));
