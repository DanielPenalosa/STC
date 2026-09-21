import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cloudinaryDestroy } from "@/lib/storage/cloudinary";

/**
 * DELETE /api/delete-photo — removes a photo the SIGNED-IN USER uploaded
 * during the current session but hasn't submitted yet (paths under
 * `pending/<uid>/` on Cloudinary or Supabase). This keeps abandoned
 * uploads from becoming orphaned storage.
 *
 * Security: the path MUST live inside `pending/<auth.uid()>/` — no one can
 * delete other users' files, and ID photos under `ids/` are untouched.
 */
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const path = req.nextUrl.searchParams.get("path") ?? "";
  if (!path) {
    return NextResponse.json({ ok: false, error: "Missing path" }, { status: 400 });
  }

  const ownPrefix = `pending/${auth.user.id}/`;

  // Cloudinary ids arrive as "cld:<public id>"; strip the marker
  const isCld = path.startsWith("cld:");
  const raw = isCld ? path.slice(4) : path;

  if (!raw.startsWith(ownPrefix)) {
    return NextResponse.json(
      { ok: false, error: "Can only delete your own pending photos" },
      { status: 403 }
    );
  }

  try {
    if (isCld) {
      await cloudinaryDestroy(raw);
    } else {
      const { error } = await supabase.storage.from("report-photos").remove([raw]);
      if (error) console.warn("storage remove failed:", error.message);
    }
  } catch (e) {
    console.warn("pending-photo cleanup error:", e);
    // best-effort: report success so the UI isn't blocked by a CDN hiccup
  }

  return NextResponse.json({ ok: true });
}
