import { NextResponse } from "next/server";
import { cloudinaryConfigured } from "@/lib/storage/cloudinary";

/**
 * GET /api/diag/storage — returns ONLY booleans about which storage
 * backends the running deployment has configured. No secret values,
 * no keys, no user data. Used to answer "is production actually
 * using Cloudinary?" without database or dashboard access.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    cloudinary: cloudinaryConfigured(),
    supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    serviceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  });
}
