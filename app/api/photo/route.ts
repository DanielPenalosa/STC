import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/photo?path=<storage-path>&bucket=report-photos|verification-ids
 *
 * Policy-independent photo serving. Reads from Supabase Storage with the
 * service role AFTER enforcing access in code, so images render even when
 * bucket policies/public flags have drifted on the database (the cause of
 * "photos don't appear" reports).
 *
 * Access rules (mirroring the intended policies):
 *   - report-photos      → any signed-in user (community browsing)
 *   - verification-ids   → admins only (sensitive ID documents)
 */
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
  if (!auth.user) return new NextResponse("Unauthorized", { status: 401 });

  if (bucket === "verification-ids") {
    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", auth.user.id)
      .maybeSingle();
    if (profile?.role !== "admin") {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

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
