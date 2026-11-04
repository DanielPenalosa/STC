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
  console.log('[Upload ID] Request received');
  
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    
    console.log('[Upload ID] User ID:', uid);
    
    if (!uid) {
      return NextResponse.json(
        { ok: false, error: "Session not ready — please try again." },
        { status: 401 }
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    
    console.log('[Upload ID] File received:', file instanceof File ? file.name : 'NO FILE');
    
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
    console.log('[Upload ID] Starting storage upload...');
    let path: string;
    if (cloudinaryConfigured()) {
      console.log('[Upload ID] Using Cloudinary storage');
      path = await cloudinaryUploadPrivate(file, `ids/${uid}`);
      console.log('[Upload ID] Cloudinary path:', path);
    } else {
      console.log('[Upload ID] Using Supabase storage');
      const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      path = `${uid}/id-card.${ext || "jpg"}`;
      const { error } = await createAdminClient()
        .storage
        .from("verification-ids")
        .upload(path, file, { contentType: file.type || "image/jpeg", upsert: true });
      if (error) {
        console.error('[Upload ID] Supabase storage error:', error);
        throw error;
      }
      console.log('[Upload ID] Supabase path:', path);
    }

    /* ---------- NO AI - INSTANT UPLOAD, MANUAL ADMIN REVIEW ---------- */
    console.log('[Upload ID] Photo uploaded successfully - marking for admin review');
    
    // SKIP AI COMPLETELY - just mark as pending for admin review
    // This makes registration instant and never hangs
    const aiStatus: "passed" | "needs_review" | "failed" | "unavailable" = "needs_review";
    
    try {
      // Just update that ID was uploaded, admin will review manually
      await createAdminClient()
        .from("users")
        .update({
          id_verification_status: "needs_review",
          id_verification: {
            uploaded_at: new Date().toISOString(),
            note: "Waiting for admin review - AI verification disabled for stability",
          },
        })
        .eq("id", uid);
      
      console.log(`[Upload ID] ✓ ID photo saved for ${uid} - admin will review`);
    } catch (error) {
      console.error('[Upload ID] Database update failed:', error);
      // Don't fail the upload just because DB update failed
    }

    console.log('[Upload ID] Returning response with status:', aiStatus);
    return NextResponse.json({ ok: true, path, ai_status: aiStatus });
  } catch (err) {
    console.error('[Upload ID] CRITICAL ERROR:', err);
    console.error('[Upload ID] Error stack:', err instanceof Error ? err.stack : 'No stack');
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Upload failed." },
      { status: 500 }
    );
  }
}
