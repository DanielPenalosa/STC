import { v2 as cloudinary } from "cloudinary";

/**
 * Cloudinary storage backend for REPORT photos (optional).
 *
 * Why: Supabase's free Storage tier is 1 GB; Cloudinary's is 25 GB plus a
 * CDN with on-the-fly transforms (thumbnails served at a fraction of the
 * original size).
 *
 * Design:
 *  - Activates only when CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET are all set
 *    (server env). Until then everything uses Supabase Storage unchanged.
 *  - IDs stored in the DB are prefixed "cld:<public_id>" so every reader
 *    (proxy, cards, detail page) can route to the right backend from one
 *    string — no schema change, no migration.
 *  - Uploads are eager-transformed to a display-size master (max 1600px,
 *    auto format/quality) so the stored asset is already small.
 */

export function cloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );
}

function client() {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  return cloudinary;
}

/** Upload a report photo; returns the "cld:" storage-path marker. */
export async function cloudinaryUpload(
  file: File,
  folderPath: string
): Promise<string> {
  const bytes = Buffer.from(await file.arrayBuffer());
  const safeFolder = `stc/${folderPath.replace(/[^a-zA-Z0-9/_-]/g, "")}`;
  const res = await client().uploader.upload(`data:${file.type || "image/jpeg"};base64,${bytes.toString("base64")}`, {
    folder: safeFolder,
    resource_type: "image",
    // store a display-sized master; original resolution rarely needed
    eager: [{ width: 1600, height: 1600, crop: "limit", fetch_format: "auto", quality: "auto:good" }],
    eager_async: false,
  });
  return `cld:${res.public_id}`;
}

/** Delete a Cloudinary asset (accepts "cld:<id>" or bare public_id). */
export async function cloudinaryDestroy(storagePath: string): Promise<void> {
  const id = storagePath.startsWith("cld:") ? storagePath.slice(4) : storagePath;
  if (!id) return;
  try {
    await client().uploader.destroy(id, { resource_type: "image" });
  } catch {
    // best-effort — never block report deletion on CDN cleanup
  }
}

/**
 * Upload a PRIVATE asset (citizen ID photos). Stored as "authenticated" —
 * only accessible through signed URLs we generate server-side, never via
 * the public CDN.
 */
export async function cloudinaryUploadPrivate(
  file: File,
  folderPath: string
): Promise<string> {
  const bytes = Buffer.from(await file.arrayBuffer());
  const safeFolder = `stc/${folderPath.replace(/[^a-zA-Z0-9/_-]/g, "")}`;
  const res = await client().uploader.upload(
    `data:${file.type || "image/jpeg"};base64,${bytes.toString("base64")}`,
    {
      folder: safeFolder,
      resource_type: "image",
      type: "authenticated",
      eager: [
        { width: 2000, height: 2000, crop: "limit" },
        { fetch_format: "auto", quality: "auto:good" },
      ],
      eager_async: false,
    }
  );
  return `cld:${res.public_id}`;
}

/** Time-valid signed delivery URL for a private (authenticated) asset. */
export function cloudinarySignedUrl(publicId: string, width = 1600): string {
  return client().url(publicId, {
    sign_url: true,
    type: "authenticated",
    secure: true,
    transformation: [
      { width, crop: "limit" },
      { fetch_format: "auto", quality: "auto:good" },
    ],
  });
}
