import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  cloudinaryConfigured,
  cloudinaryUpload,
  cloudinaryUploadPrivate,
} from "@/lib/storage/cloudinary";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

/**
 * POST /api/upload-photo — multipart with `file`, `bucket`, optional `path`.
 *
 * ALL photo storage goes to Cloudinary when configured:
 *   - bucket=report-photos    → public CDN asset, returns "cld:<publicId>"
 *   - bucket=verification-ids → PRIVATE "authenticated" asset, same marker;
 *     delivery happens only via signed URLs generated in /api/photo
 *
 * Falls back to Supabase Storage (service role) when Cloudinary env vars
 * are absent, so the app works before/without Cloudinary setup.
 *
 * Access control happens HERE in code either way: a valid session is
 * required, size/type limits are enforced before any write, paths are
 * sanitized, and ID photos are namespaced under the caller's own user id.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "No file received." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "Photo must be under 10 MB." }, { status: 400 });
    }
    if (file.type && !ALLOWED.has(file.type)) {
      return NextResponse.json(
        { ok: false, error: "Photo must be a JPG, PNG, or WebP image." },
        { status: 400 }
      );
    }

    const bucket = form.get("bucket") === "verification-ids" ? "verification-ids" : "report-photos";
    const rawPath = typeof form.get("path") === "string" ? (form.get("path") as string) : "";

    if (cloudinaryConfigured()) {
      if (bucket === "verification-ids") {
        // private asset, namespaced under the caller's user id
        const storagePath = await cloudinaryUploadPrivate(file, `ids/${auth.user.id}`);
        return NextResponse.json({ ok: true, path: storagePath, backend: "cloudinary" });
      }
      const folder = rawPath
        ? rawPath.split("/").slice(0, 2).join("/")
        : `pending/${auth.user.id}`;
      const storagePath = await cloudinaryUpload(file, folder);
      return NextResponse.json({ ok: true, path: storagePath, backend: "cloudinary" });
    }

    /* ---------- Supabase fallback ---------- */
    const safePath =
      rawPath &&
      !rawPath.includes("..") &&
      !rawPath.startsWith("/") &&
      !rawPath.includes("\\") &&
      rawPath.length < 300
        ? rawPath
        : bucket === "verification-ids"
          ? `${auth.user.id}/id-${Date.now()}.jpg`
          : `pending/${Date.now()}-${(file.name || "photo").replace(/[^\w.-]/g, "_")}`;

    const adminStorage = createAdminClient().storage;
    if (bucket === "verification-ids") {
      if (!safePath.startsWith(`${auth.user.id}/`)) {
        return NextResponse.json(
          { ok: false, error: "Invalid ID path." },
          { status: 400 }
        );
      }
      const { error } = await adminStorage
        .from("verification-ids")
        .upload(safePath, file, { contentType: file.type || "image/jpeg", upsert: true });
      if (error) throw error;
      return NextResponse.json({ ok: true, path: safePath, backend: "supabase" });
    }

    const { error } = await adminStorage
      .from("report-photos")
      .upload(safePath, file, { contentType: file.type || "image/jpeg" });
    if (error) throw error;
    return NextResponse.json({ ok: true, path: safePath, backend: "supabase" });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Upload failed." },
      { status: 500 }
    );
  }
}
