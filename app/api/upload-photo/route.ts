import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

/**
 * POST /api/upload-photo — multipart with `file` and optional `path`.
 * Stores a report photo in the `report-photos` bucket using the service
 * role after verifying the caller's session. Access control happens HERE
 * in code, so a missing/drifted storage policy on the database can never
 * make a citizen's photo vanish between upload and admin review.
 *
 * Path safety: if provided, must be a plain relative path with no `..`,
 * leading slash, or backslashes; otherwise one is generated.
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

    const rawPath = typeof form.get("path") === "string" ? (form.get("path") as string) : "";
    const safePath =
      rawPath &&
      !rawPath.includes("..") &&
      !rawPath.startsWith("/") &&
      !rawPath.includes("\\") &&
      rawPath.length < 300
        ? rawPath
        : `pending/${Date.now()}-${(file.name || "photo").replace(/[^\w.-]/g, "_")}`;

    const { error } = await createAdminClient()
      .storage
      .from("report-photos")
      .upload(safePath, file, { contentType: file.type || "image/jpeg" });
    if (error) throw error;

    return NextResponse.json({ ok: true, path: safePath });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Upload failed." },
      { status: 500 }
    );
  }
}
