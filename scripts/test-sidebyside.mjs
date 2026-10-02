/**
 * One-off smoke test: reproduce the side-by-side BEFORE|AFTER composition
 * from lib/facebook.ts against the REAL photos of a report, and write the
 * result to a temp file. Verifies both storage download paths (Cloudinary
 * + Supabase) and the jimp compositing — no Facebook call is made.
 *
 * Usage: node scripts/test-sidebyside.mjs RPT-064D7E59
 */
import { readFileSync, writeFileSync } from "node:fs";

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
const LABEL_H = 48;
const LABEL_BG = 0x2333a0ff;

const { createRequire } = await import("node:module");
const require = createRequire(import.meta.url);
const Jimp = require("jimp");

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

const [beforeImg, afterImg, font] = await Promise.all([
  Jimp.read(beforeBytes),
  Jimp.read(afterBytes),
  Jimp.loadFont(Jimp.FONT_SANS_32_WHITE),
]);

const W = PAD + SIDE + PAD + SIDE + PAD;
const H = PAD + LABEL_H + SIDE + PAD;
const canvas = new Jimp(W, H, 0xffffffff);

const label = (text, x) => {
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

const out = await canvas.quality(80).getBufferAsync(Jimp.MIME_JPEG);
const outPath = new URL("../.sidebyside-test.jpg", import.meta.url);
writeFileSync(outPath, out);
console.log(`COMPOSED: ${W}x${H}, ${(out.length / 1024).toFixed(0)} KB, ${Date.now() - t0}ms total`);
console.log("WROTE:", outPath.pathname.replace(/^\/([A-Za-z]:)/, "$1"));
