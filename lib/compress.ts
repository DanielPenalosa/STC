/**
 * Client-side image compression — run before any upload.
 *
 * Phone cameras produce 3–8 MB JPEGs; resized to max 1600px on the long
 * edge at quality 0.82 they land around 200–400 KB with no visible loss.
 * This is the single biggest storage/bandwidth saving in the whole pipeline,
 * regardless of whether the backend is Supabase Storage or Cloudinary.
 *
 * Uses createImageBitmap + OffscreenCanvas when available (all modern
 * browsers), with a plain <img> + canvas fallback.
 */

export type CompressOptions = {
  maxEdge?: number; // longest side in px (default 1600)
  quality?: number; // JPEG quality 0–1 (default 0.82)
  mime?: string; // output type (default image/jpeg)
};

export async function compressImage(file: File, opts: CompressOptions = {}): Promise<File> {
  const { maxEdge = 1600, quality = 0.82, mime = "image/jpeg" } = opts;

  // Don't touch GIFs (animation) or tiny files — and skip if the file is
  // already smaller than ~150 KB (compression overhead not worth it).
  if (file.type === "image/gif" || file.size < 150 * 1024) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    let blob: Blob | null = null;

    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0, w, h);
        blob = await canvas.convertToBlob({ type: mime, quality });
      }
    } else {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0, w, h);
        blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, mime, quality));
      }
    }

    bitmap.close?.();
    if (!blob || blob.size >= file.size) return file; // never make it bigger

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: mime, lastModified: Date.now() });
  } catch {
    return file; // decode failed — upload the original
  }
}
