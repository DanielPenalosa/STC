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

    /* ---------- AI ID verification (synchronous, instant decision) ---------- */
    let aiStatus: "passed" | "needs_review" | "failed" | "unavailable" = "unavailable";
    
    // Get user info for OCR
    const { data: profile } = await supabase
      .from("users")
      .select("full_name")
      .eq("id", uid)
      .maybeSingle();
    const fullName = profile?.full_name ?? "";
    
    // Process OCR SYNCHRONOUSLY - wait for result before responding
    if (fullName) {
      const bytes = Buffer.from(await file.arrayBuffer());
      
      try {
        // ALWAYS use FREE Tesseract.js OCR (no API costs, works offline)
        console.log('[Upload ID] Starting FREE Tesseract.js OCR (synchronous)');
        const { verifyIdPhotoFree } = await import("@/lib/ai/id-verify-free");
        const verdict = await verifyIdPhotoFree({
          imageBuffer: bytes,
          registeredFullName: fullName,
        });
        
        aiStatus = verdict.status;
        
        const updateData: {
          id_verification_status: string;
          id_verification: Record<string, unknown>;
          verification_status?: string;
          verified_at?: string;
          rejection_reason?: string;
        } = {
          id_verification_status: verdict.status,
          id_verification: {
            extracted: verdict.extracted ?? null,
            address_validation: verdict.addressValidation ?? null,
            ocr_confidence: verdict.ocr_confidence ?? null,
            verification_score: verdict.verification_score ?? null,
            reasons: verdict.reasons ?? [],
            id_type: verdict.extracted?.id_type ?? null,
            checked_at: new Date().toISOString(),
            model: "tesseract.js-free",
          },
        };
        
        // AI DECIDES: Approve if passed, Reject if failed, Review if uncertain
        if (verdict.status === "passed") {
          updateData.verification_status = "verified";
          updateData.verified_at = new Date().toISOString();
          console.log(`[Upload ID] ✅ AUTO-APPROVED: ${uid} (Sta. Cruz resident verified)`);
        } else if (verdict.status === "failed") {
          updateData.verification_status = "rejected";
          updateData.rejection_reason = verdict.reasons[0] || "Address verification failed - not a Sta. Cruz, Laguna resident";
          console.log(`[Upload ID] ❌ AUTO-REJECTED: ${uid} (${updateData.rejection_reason})`);
        } else {
          console.log(`[Upload ID] ⚠️ NEEDS REVIEW: ${uid} (${verdict.reasons.join(', ')})`);
        }
        
        await createAdminClient()
          .from("users")
          .update(updateData)
          .eq("id", uid);
          
        console.log(`[Upload ID] OCR completed for ${uid}: ${verdict.status}`);
      } catch (error) {
        console.error('[Upload ID] OCR failed:', error);
        
        // On error, mark for manual review but don't block registration
        aiStatus = "needs_review";
        
        await createAdminClient()
          .from("users")
          .update({
            id_verification_status: "not_run",
            id_verification: {
              error: error instanceof Error ? error.message : 'OCR processing failed',
              checked_at: new Date().toISOString(),
            },
          })
          .eq("id", uid);
      }
    }

    return NextResponse.json({ ok: true, path, ai_status: aiStatus });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Upload failed." },
      { status: 500 }
    );
  }
}
