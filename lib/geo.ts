import type { Barangay } from "@/lib/types";

/**
 * Barangay detection from GPS coordinates.
 *
 * Each barangay row can store `center_lat` / `center_lng` (editable in
 * Admin → Barangays). When the citizen's GPS fix falls inside a barangay's
 * configured radius, that barangay is used. Otherwise the nearest center
 * within `MAX_DISTANCE_KM` wins; `null` means "outside known barangays".
 */

export const MAX_DISTANCE_KM = 10;

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance between two lat/lng pairs, in kilometers. */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

export type DetectedBarangay = {
  barangay: Barangay;
  /** Straight-line distance from the GPS fix to the barangay center, in km. */
  distanceKm: number;
  /** True when the fix fell within the barangay's configured radius. */
  withinRadius: boolean;
};

/* ------------------------------------------------------------------ */
/* Reverse geocoding — resolve ANY coordinates to a place name          */
/* ------------------------------------------------------------------ */

export type GeoPlace = {
  /** e.g. "Barangay San Isidro" or "Brgy. Ilaya IV" */
  barangayName: string | null;
  /** Larger area fallback: city / municipality / town */
  localityName: string | null;
  /** Human-readable one-liner (road, neighborhood, …) */
  displayName: string | null;
};

/**
 * Ask OpenStreetMap's free Nominatim service what place sits at (lat, lng).
 * Used as a fallback when the coordinates don't match any configured
 * barangay center, so citizens get a real location name wherever they are.
 *
 * Must be called server-side (route handlers / server actions) —
 * Nominatim blocks browser-originated calls (CORS + usage policy).
 * Fails soft: returns nulls on any error/timeout so reporting never blocks.
 */
export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<GeoPlace | null> {
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
    `&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}` +
    `&zoom=16&addressdetails=1`;

  try {
    const res = await fetch(url, {
      headers: {
        // Nominatim requires a descriptive User-Agent
        "User-Agent": "SmartCommunityReporting/1.0 (local-gov reporting system)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(5000), // never hang the request
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      display_name?: string;
      address?: Record<string, string>;
    };
    const a = json.address ?? {};
    // Philippine OSM data uses "suburb" or "city_district" for barangays;
    // other regions use "neighbourhood" / "quarter".
    const rawBrgy =
      a.suburb ?? a.city_district ?? a.neighbourhood ?? a.quarter ?? null;
    const locality =
      a.city ?? a.municipality ?? a.town ?? a.village ?? a.county ?? null;
    return {
      barangayName: rawBrgy,
      localityName: locality,
      displayName: json.display_name?.split(",").slice(0, 3).join(", ").trim() ?? null,
    };
  } catch {
    return null; // offline / rate-limited / timeout — fail soft
  }
}

/**
 * Pick the barangay whose center is closest to the given coordinates.
 * Returns null when there are no candidates within `MAX_DISTANCE_KM`.
 */
export function detectBarangay(
  lat: number,
  lng: number,
  barangays: Barangay[]
): DetectedBarangay | null {
  let best: { barangay: Barangay; distanceKm: number } | null = null;

  for (const b of barangays) {
    if (b.center_lat == null || b.center_lng == null) continue;
    const d = haversineKm(lat, lng, b.center_lat, b.center_lng);
    if (!best || d < best.distanceKm) best = { barangay: b, distanceKm: d };
  }

  if (!best || best.distanceKm > MAX_DISTANCE_KM) return null;
  return {
    barangay: best.barangay,
    distanceKm: best.distanceKm,
    withinRadius: false,
  };
}
