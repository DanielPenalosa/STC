import type { SupabaseClient } from "@supabase/supabase-js";
import { detectBarangay, reverseGeocode } from "@/lib/geo";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Barangay } from "@/lib/types";

export type BarangayResolution =
  | { barangayId: string; barangayName: string; source: "center"; distanceKm: number }
  | { barangayId: string; barangayName: string; source: "geocoded" | "geocoded_new"; displayName: string | null }
  | { barangayId: null; source: "outside"; placeName: string | null; locality: string | null };

const stripBrgyPrefix = (s: string) =>
  s.toLowerCase().replace(/^brgy\.?\s*|^barangay\s*/i, "").trim();

/**
 * Two-pass barangay resolution, shared by /api/detect-barangay and
 * createReport so the client preview and the server-side routing always
 * agree:
 *
 *  1. Nearest configured barangay center within MAX_DISTANCE_KM
 *  2. OpenStreetMap reverse geocode — works anywhere, auto-creating a
 *     barangay row the first time an unmapped area is reported
 *
 * `client` is the regular (RLS) server client used for reads. The rare
 * auto-create insert uses the service-role client because citizens are not
 * allowed to insert barangay rows under RLS — this helper is server-only and
 * both call sites require an authenticated user before invoking it.
 */
export async function resolveBarangay(
  client: SupabaseClient,
  lat: number,
  lng: number
): Promise<BarangayResolution> {
  const { data: brgyData } = await client
    .from("barangays")
    .select("*")
    .eq("is_active", true);
  const barangays = (brgyData as unknown as Barangay[]) ?? [];

  /* pass 1 — configured centers */
  const hit = detectBarangay(lat, lng, barangays);
  if (hit) {
    return {
      barangayId: hit.barangay.id,
      barangayName: hit.barangay.name,
      source: "center",
      distanceKm: hit.distanceKm,
    };
  }

  /* pass 2 — reverse geocode (works anywhere on the map) */
  const place = await reverseGeocode(lat, lng);
  const detectedName = place?.barangayName ?? null;

  if (detectedName) {
    const existing = barangays.find(
      (b) => stripBrgyPrefix(b.name) === stripBrgyPrefix(detectedName)
    );
    if (existing) {
      return {
        barangayId: existing.id,
        barangayName: existing.name,
        source: "geocoded",
        displayName: place?.displayName ?? null,
      };
    }

    const admin = createAdminClient();
    const { data: created, error } = await admin
      .from("barangays")
      .insert({
        name:
          detectedName.startsWith("Barangay") || detectedName.startsWith("Brgy")
            ? detectedName
            : `Barangay ${detectedName}`,
        description: place?.localityName
          ? `Auto-detected from GPS reports in ${place.localityName}.`
          : "Auto-detected from GPS reports.",
        is_active: true,
      })
      .select("id, name")
      .single();

    if (!error && created) {
      return {
        barangayId: created.id,
        barangayName: created.name,
        source: "geocoded_new",
        displayName: place?.displayName ?? null,
      };
    }
  }

  /* nothing matched — still return a readable place name */
  return {
    barangayId: null,
    source: "outside",
    placeName: place?.displayName ?? null,
    locality: place?.localityName ?? null,
  };
}
