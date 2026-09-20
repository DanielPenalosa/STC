import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyUserIdPhoto } from "@/lib/ai/dispatch";
import {
  cloudinaryConfigured,
  cloudinaryUploadPrivate,
} from "@/lib/storage/cloudinary";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

/**
 * POST /api/upload-id — uploads the citizen's ID photo.
 *
 * Storage backend follows the same environment rule as report photos:
 *   - Cloudinary (CLOUDINARY_* env set) → PRIVATE "authenticated" asset,
 *     stored under stc/ids/<userId>/ and referenced as "cld:<publicId>"
 *   - otherwise the private Supabase `verification-ids` bucket (service role)
 *
 * Access control is enforced HERE in code, never by DB policies:
 *   - a valid authenticated session is required
 *   - the file can only land under the caller's own user-id folder
 *   - size/type limits are enforced before any write
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

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "No file received." }, { status: 400 });
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

    /* ---------- storage (Cloudinary-first, Supabase fallback) ---------- */
    let path: string;
    if (cloudinaryConfigured()) {
      path = await cloudinaryUploadPrivate(file, `ids/${uid}`);
    } else {
      const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      path = `${uid}/id-card.${ext || "jpg"}`;
      const { error } = await createAdminClient()
        .storage
        .from("verification-ids")
        .upload(path, file, { contentType: file.type || "image/jpeg", upsert: true });
      if (error) throw error;
    }

    /* ---------- AI ID verification (modular pipeline) ----------
     * Best-effort: any failure leaves the account pending for manual admin
     * review — the AI assists, it never blocks or blindly approves.
     * Runs on the Next.js side when Cloudinary holds the asset (the Edge
     * Function can't read private Cloudinary URLs). */
    let aiStatus: "passed" | "needs_review" | "failed" | "unavailable" = "unavailable";
    try {
      const { data: profile } = await supabase
        .from("users")
        .select("full_name")
        .eq("id", uid)
        .maybeSingle();
      const fullName = profile?.full_name ?? "";
      if (fullName && path.startsWith("cld:")) {
        // local pipeline — fetches the private asset via signed Cloudinary URL
        const { verifyIdPhotoLocal } = await import("@/lib/ai/id-verify-local");
        const bytes = Buffer.from(await file.arrayBuffer());
        const verdict = await verifyIdPhotoLocal({
          imageBase64: bytes.toString("base64"),
          mime: file.type || "image/jpeg",
          config: { registeredFullName: fullName, requireNameMatch: true },
        });
        aiStatus = verdict.status === "passed" || verdict.status === "needs_review" || verdict.status === "failed"
          ? verdict.status
          : "needs_review";
        // persist the verdict the same way the Edge Function does
        await createAdminClient()
          .from("users")
          .update({
            id_verification_status: aiStatus,
            id_verification: {
              extracted: (verdict as { extracted?: unknown }).extracted ?? null,
              ocr_confidence: (verdict as { ocr_confidence?: number }).ocr_confidence ?? null,
              verification_score: (verdict as { verification_score?: number }).verification_score ?? null,
              reasons: (verdict as { reasons?: string[] }).reasons ?? [],
              name_match: (verdict as { nameMatch?: boolean }).nameMatch ?? null,
              id_type: (verdict as { id_type?: string | null }).id_type ?? null,
              checked_at: new Date().toISOString(),
            },
          })
          .eq("id", uid);
      } else if (fullName) {
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
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Upload failed." },
      { status: 500 }
    );
  }
}
