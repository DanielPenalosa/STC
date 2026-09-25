import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cloudinaryConfigured, cloudinarySignedUrl } from "@/lib/storage/cloudinary";
import { isPublicPhotoPath } from "@/lib/transparency";

/**
 * GET /api/photo?path=<storage-path>&bucket=report-photos|verification-ids
 *
 * Unified photo delivery across both backends, routed by path marker:
 *   - "cld:<publicId>" → Cloudinary:
 *       · report-photos    → public CDN with auto format/quality (+ &w=)
 *       · verification-ids → PRIVATE asset served via a short-signed URL
 *   - anything else    → Supabase Storage via service role
 *
 * Access is enforced in code BEFORE any read, so missing/drifted bucket
 * policies on the database can never expose or hide photos:
 *   - report-photos    → any signed-in user (community browsing), plus
 *                        anonymous visitors when the photo belongs to a
 *                        RESOLVED report (public transparency feed)
 *   - verification-ids → admins only (sensitive ID documents)
 */
const VALID_WIDTHS = [160, 320, 640, 960, 1600];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path") ?? "";
  const bucket =
    searchParams.get("bucket") === "verification-ids"
      ? "verification-ids"
      : "report-photos";

  if (!path || path.includes("..") || path.startsWith("/") || path.includes("\\")) {
    return new NextResponse("Invalid path", { status: 400 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  // Anonymous visitors may only see photos of RESOLVED reports — the exact
  // set the public transparency feed shows. Everything else needs a session.
  if (!auth.user) {
    if (bucket !== "report-photos" || !(await isPublicPhotoPath(path))) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
  }

  if (bucket === "verification-ids") {
    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", auth.user!.id)
      .maybeSingle();
    if (profile?.role !== "admin") {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  /* ---------- Cloudinary-backed assets ---------- */
  if (path.startsWith("cld:")) {
    if (!cloudinaryConfigured()) return new NextResponse("Not found", { status: 404 });
    const publicId = path.slice(4);
    if (!publicId || publicId.includes("..")) {
      return new NextResponse("Invalid path", { status: 400 });
    }

    if (bucket === "verification-ids") {
      // private asset — redirect to a signed, time-limited CDN URL
      const wRaw = Number(searchParams.get("w") ?? 0);
      const width = VALID_WIDTHS.includes(wRaw) ? wRaw : 1600;
      const signed = cloudinarySignedUrl(publicId, width);
      return NextResponse.redirect(signed, 302);
    }

    const wRaw = Number(searchParams.get("w") ?? 0);
    const width = VALID_WIDTHS.includes(wRaw) ? wRaw : 1600;
    const url = `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/f_auto,q_auto,w_${width}/${encodeURIComponent(publicId)}.jpg`;
    const upstream = await fetch(url, { cache: "no-store" });
    if (!upstream.ok) return new NextResponse("Not found", { status: 404 });
    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
        // CDN assets are immutable per transform — safe to cache hard
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  /* ---------- Supabase Storage ---------- */
  const { data, error } = await createAdminClient()
    .storage
    .from(bucket)
    .download(path);
  if (error || !data) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(data, {
    headers: {
      "Content-Type": data.type || "image/jpeg",
      // private: may contain sensitive photos; browsers may cache locally
      "Cache-Control": "private, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
