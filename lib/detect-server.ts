import type { SupabaseClient } from "@supabase/supabase-js";
import { detectBarangay, reverseGeocode } from "@/lib/geo";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Barangay } from "@/lib/types";

export type BarangayResolution =
  | { barangayId: string; barangayName: string; source: "center"; distanceKm: number }
  | { barangayId: string; barangayName: string; source: "geocoded" | "geocoded_new"; displayName: string | null }
  | { barangayId: null; source: "outside"; placeName: string | null; locality: string | null };

const normalizeName = (s: string) =>
  s
    .toLowerCase()
    .replace(/^brgy\.?\s*|^barangay\s*/i, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Names match ignoring "Brgy." prefixes, punctuation, case and extra words. */
function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // tolerate compound labels: DB "Barangay San Diego" vs OSM "San Diego,
  // Santa Cruz" — but avoid tiny fragments causing false hits
  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na];
  return short.length >= 4 && long.includes(short);
}

/**
 * Barangay resolution, shared by /api/detect-barangay and createReport so
 * the client preview and the server-side routing always agree.
 *
 * Pass 1 — OpenStreetMap reverse geocode (AUTHORITATIVE): asks what real
 *    place sits at the coordinates, then matches it against the configured
 *    barangays by name. This respects actual boundaries — an incorrectly
 *    placed center point can no longer hijack the result.
 * Pass 2 — nearest configured center within MAX_DISTANCE_KM, used only when
 *    the geocoder is unreachable (offline, timeout, rate-limited).
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

  /* pass 1 — reverse geocode: real barangay boundaries */
  const place = await reverseGeocode(lat, lng);
  const detectedName = place?.barangayName ?? null;

  if (detectedName) {
    const existing = barangays.find((b) => namesMatch(b.name, detectedName));
    if (existing) {
      return {
        barangayId: existing.id,
        barangayName: existing.name,
        source: "geocoded",
        displayName: place?.displayName ?? null,
      };
    }

    // never seen this area before — auto-create the barangay row so the
    // report still routes somewhere real
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

  /* pass 2 — fallback: nearest configured center (geocoder unavailable) */
  const hit = detectBarangay(lat, lng, barangays);
  if (hit) {
    return {
      barangayId: hit.barangay.id,
      barangayName: hit.barangay.name,
      source: "center",
      distanceKm: hit.distanceKm,
    };
  }

  /* nothing matched — still return a readable place name */
  return {
    barangayId: null,
    source: "outside",
    placeName: place?.displayName ?? null,
    locality: place?.localityName ?? null,
  };
}
