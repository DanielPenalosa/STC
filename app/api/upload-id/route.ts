import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyUserIdPhoto } from "@/lib/ai/dispatch";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

/**
 * POST /api/upload-id — uploads the citizen's ID photo to the PRIVATE
 * `verification-ids` bucket from the server.
 *
 * The write itself uses the service-role client AFTER the caller's session is
 * verified, so registration no longer depends on any storage RLS policy being
 * present on the deployment (missing/drifted policies caused "new row
 * violates row-level security policy"). Security is enforced HERE, in code:
 *   - a valid authenticated session is required
 *   - the file can only land under the caller's own user-id folder
 *   - size/type limits are enforced before any write
 *
 * Files are namespaced under the caller's user-id folder and upserted, so
 * re-registering/retaking the photo overwrites the previous one.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) {
      return NextResponse.json(
        { ok: false, error: "Session not ready — please try again." },
        { status: 401 }
      );
    }
    const adminStorage = createAdminClient().storage;

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "No file received." },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: "ID photo must be under 8 MB." },
        { status: 400 }
      );
    }
    if (file.type && !ALLOWED.has(file.type)) {
      return NextResponse.json(
        { ok: false, error: "ID photo must be a JPG, PNG, or WebP image." },
        { status: 400 }
      );
    }

    const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${uid}/id-card.${ext || "jpg"}`;

    // service-role write — RLS-independent; access control happened above
    const { error } = await adminStorage
      .from("verification-ids")
      .upload(path, file, { contentType: file.type || "image/jpeg", upsert: true });
    if (error) throw error;

    /* ---------- AI ID verification (modular pipeline) ----------
     * Best-effort: any failure leaves the account pending for manual admin
     * review — the AI assists, it never blocks or blindly approves. */
    let aiStatus: "passed" | "needs_review" | "failed" | "unavailable" = "unavailable";
    try {
      const { data: profile } = await supabase
        .from("users")
        .select("full_name")
        .eq("id", uid)
        .maybeSingle();
      const fullName = profile?.full_name ?? "";
      if (fullName) {
        const verdict = await verifyUserIdPhoto({
          userId: uid,
          idPath: path,
          registeredFullName: fullName,
        });
        aiStatus = verdict?.status ?? "unavailable";
      }
    } catch {
      aiStatus = "unavailable";
    }

    return NextResponse.json({ ok: true, path, ai_status: aiStatus });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Upload failed" },
      { status: 500 }
    );
  }
}
