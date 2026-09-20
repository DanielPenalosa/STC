import {
  verifyIdPhoto,
  type IdVerificationResult,
} from "@/lib/ai/id-verify";

/**
 * Run the ID-verification pipeline directly from the Next.js server using
 * raw image bytes — used when the ID photo lives on Cloudinary (private
 * "authenticated" assets can't be fetched by the Supabase Edge Function,
 * which only knows how to sign Supabase Storage URLs).
 *
 * The provider receives a data URL, so nothing about the asset needs to be
 * publicly reachable. Same pipeline, same gating, same result shape.
 */
export async function verifyIdPhotoLocal(input: {
  imageBase64: string;
  mime?: string;
  config: { registeredFullName: string; requireNameMatch: boolean };
}): Promise<IdVerificationResult> {
  return verifyIdPhoto({
    imageBase64: input.imageBase64,
    mime: input.mime,
    config: input.config,
  });
}
