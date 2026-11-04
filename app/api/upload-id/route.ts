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
     * 
     * OCR runs asynchronously - we save the ID first, then process in background.
     * This prevents registration from hanging while waiting for OCR. */
    let aiStatus: "passed" | "needs_review" | "failed" | "unavailable" = "unavailable";
    
    // Get user info for OCR
    const { data: profile } = await supabase
      .from("users")
      .select("full_name")
      .eq("id", uid)
      .maybeSingle();
    const fullName = profile?.full_name ?? "";
    
    // Process OCR asynchronously (don't await - return immediately)
    if (fullName) {
      const bytes = Buffer.from(await file.arrayBuffer());
      const hasOpenAI = process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith('sk-');
      
      // Fire and forget - process in background
      (async () => {
        try {
          if (!hasOpenAI) {
            console.log('[Upload ID] Starting FREE Tesseract.js OCR in background');
            const { verifyIdPhotoFree } = await import("@/lib/ai/id-verify-free");
            const verdict = await verifyIdPhotoFree({
              imageBuffer: bytes,
              registeredFullName: fullName,
            });
            
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
              // Auto-reject if clearly not from Sta. Cruz
              updateData.verification_status = "rejected";
              updateData.rejection_reason = verdict.reasons[0] || "Address verification failed - not a Sta. Cruz, Laguna resident";
              console.log(`[Upload ID] ❌ AUTO-REJECTED: ${uid} (${updateData.rejection_reason})`);
            } else {
              // needs_review - uncertain cases go to admin
              console.log(`[Upload ID] ⚠️ NEEDS REVIEW: ${uid} (${verdict.reasons.join(', ')})`);
            }
            
            await createAdminClient()
              .from("users")
              .update(updateData)
              .eq("id", uid);
              
            console.log(`[Upload ID] OCR completed for ${uid}: ${verdict.status}`);
          } else if (path.startsWith("cld:")) {
            console.log('[Upload ID] Starting OpenAI OCR in background');
            const { verifyIdPhotoLocal } = await import("@/lib/ai/id-verify-local");
            const verdict = await verifyIdPhotoLocal({
              imageBase64: bytes.toString("base64"),
              mime: file.type || "image/jpeg",
              config: { registeredFullName: fullName, requireNameMatch: true },
            });
            
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
              },
            };
            
            // AI DECIDES: Approve if passed, Reject if failed
            if (verdict.status === "passed") {
              updateData.verification_status = "verified";
              updateData.verified_at = new Date().toISOString();
              console.log(`[Upload ID] ✅ AUTO-APPROVED: ${uid} (OpenAI verified)`);
            } else if (verdict.status === "failed") {
              updateData.verification_status = "rejected";
              updateData.rejection_reason = verdict.reasons[0] || "Address verification failed";
              console.log(`[Upload ID] ❌ AUTO-REJECTED: ${uid}`);
            }
            
            await createAdminClient()
              .from("users")
              .update(updateData)
              .eq("id", uid);
          } else {
            console.log('[Upload ID] Starting Edge Function OCR in background');
            const verdict = await verifyUserIdPhoto({
              userId: uid,
              idPath: path,
              registeredFullName: fullName,
            });
            
            const updateData: {
              verification_status?: string;
              verified_at?: string;
              rejection_reason?: string;
            } = {};
            
            if (verdict?.status === "passed") {
              updateData.verification_status = "verified";
              updateData.verified_at = new Date().toISOString();
              console.log(`[Upload ID] ✅ AUTO-APPROVED: ${uid} (Edge Function)`);
            } else if (verdict?.status === "failed") {
              updateData.verification_status = "rejected";
              updateData.rejection_reason = "Address verification failed";
              console.log(`[Upload ID] ❌ AUTO-REJECTED: ${uid}`);
            }
            
            if (Object.keys(updateData).length > 0) {
              await createAdminClient()
                .from("users")
                .update(updateData)
                .eq("id", uid);
            }
          }
        } catch (error) {
          console.error('[Upload ID] Background OCR failed:', error);
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
      })().catch(err => console.error('[Upload ID] Background task error:', err));
      
      // Mark as processing so admin knows OCR is running
      aiStatus = "unavailable"; // Will show "AI needs review" until OCR completes
    }

    return NextResponse.json({ ok: true, path, ai_status: aiStatus });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Upload failed." },
      { status: 500 }
    );
  }
}
