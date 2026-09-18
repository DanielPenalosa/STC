import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveBarangay } from "@/lib/detect-server";

/**
 * POST /api/detect-barangay  { lat, lng }
 *
 * Resolves GPS coordinates to a barangay in two passes (see lib/detect-server):
 *  1. Nearest configured barangay center (within 10 km)
 *  2. Reverse geocode via OpenStreetMap — works ANYWHERE, even for
 *     barangays the admin hasn't mapped yet (auto-created on first hit)
 *
 * Used by the citizen submit flow — citizens never pick a barangay manually.
 */
export async function POST(req: Request) {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  let body: { lat?: number; lng?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ ok: false, error: "Invalid coordinates" }, { status: 400 });
  }

  const r = await resolveBarangay(supabase, lat, lng);

  if (r.barangayId) {
    return NextResponse.json({
      ok: true,
      barangay_id: r.barangayId,
      barangay_name: r.barangayName,
      distance_km:
        r.source === "center" ? Math.round(r.distanceKm * 1000) / 1000 : null,
      source: r.source,
      display_name: r.source !== "center" ? r.displayName : undefined,
    });
  }

  if (r.source === "outside") {
    return NextResponse.json({
      ok: true,
      reason: "outside",
      place_name: r.placeName,
      locality: r.locality,
    });
  }

  return NextResponse.json({ ok: true, reason: "outside", place_name: null, locality: null });
}
