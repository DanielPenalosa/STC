import type { Barangay } from "@/lib/types";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * lib/barangays-official.ts — the 26 official barangays of Sta. Cruz,
 * Laguna, with their OpenStreetMap administrative-boundary centroids
 * (fetched 2026-09-24). Single source of truth for:
 *   - self-seeding the barangays table, so every barangay dropdown in the
 *     app defaults to the full official list whether or not the SQL
 *     migration has been run
 *   - GPS → barangay matching fallbacks (centers)
 * Admins can still adjust centers/contacts in Admin → Barangays; seeding
 * only fills what is missing and never overwrites edits.
 */

export type OfficialBarangay = {
  name: string;
  center_lat: number;
  center_lng: number;
};

export const OFFICIAL_BARANGAYS: OfficialBarangay[] = [
  { name: "Alipit",              center_lat: 14.2239907, center_lng: 121.4051150 },
  { name: "Bagumbayan",          center_lat: 14.2686089, center_lng: 121.3985825 },
  { name: "Bubukal",             center_lat: 14.2566665, center_lng: 121.3992795 },
  { name: "Calios",              center_lat: 14.2747526, center_lng: 121.4048705 },
  { name: "Duhat",               center_lat: 14.2532985, center_lng: 121.3827166 },
  { name: "Gatid",               center_lat: 14.2604341, center_lng: 121.3835914 },
  { name: "Jasaan",              center_lat: 14.2236530, center_lng: 121.3946862 },
  { name: "Labuin",              center_lat: 14.2503574, center_lng: 121.4007365 },
  { name: "Malinao",             center_lat: 14.2328929, center_lng: 121.3968810 },
  { name: "Oogong",              center_lat: 14.2263504, center_lng: 121.4004829 },
  { name: "Pagsawitan",          center_lat: 14.2657906, center_lng: 121.4265403 },
  { name: "Palasan",             center_lat: 14.2575625, center_lng: 121.4189780 },
  { name: "Patimbao",            center_lat: 14.2701853, center_lng: 121.4182901 },
  { name: "Poblacion I",         center_lat: 14.2771152, center_lng: 121.4178920 },
  { name: "Poblacion II",        center_lat: 14.2798998, center_lng: 121.4163868 },
  { name: "Poblacion III",       center_lat: 14.2824529, center_lng: 121.4151018 },
  { name: "Poblacion IV",        center_lat: 14.2850061, center_lng: 121.4151012 },
  { name: "Poblacion V",         center_lat: 14.2857996, center_lng: 121.4128725 },
  { name: "San Jose",            center_lat: 14.2373329, center_lng: 121.4037511 },
  { name: "San Juan",            center_lat: 14.2438713, center_lng: 121.4069612 },
  { name: "San Pablo Norte",     center_lat: 14.2903531, center_lng: 121.4130607 },
  { name: "San Pablo Sur",       center_lat: 14.2828568, center_lng: 121.4169772 },
  { name: "Santisima Cruz",      center_lat: 14.2907196, center_lng: 121.4093518 },
  { name: "Santo Angel Central", center_lat: 14.2852811, center_lng: 121.4089991 },
  { name: "Santo Angel Norte",   center_lat: 14.2884953, center_lng: 121.4062354 },
  { name: "Santo Angel Sur",     center_lat: 14.2824262, center_lng: 121.4108895 },
];

/**
 * Ensure every official barangay row exists. Called from getBarangays()
 * (i.e. every page that renders a barangay dropdown) so the list is never
 * empty or partial. Idempotent and gentle:
 *   - inserts missing rows only (on conflict do nothing)
 *   - fills NULL centers, never overwrites admin-tuned values
 *   - deactivates leftover [BARANGAY N] placeholder rows
 * Uses the service-role client: dropdown rendering must not depend on the
 * signed-in user's write permissions. Failures are swallowed — a seeding
 * hiccup must never break the page that asked for the list.
 */
/** Process-level flag: seeding is idempotent, so one success per server
 * process is enough — later calls become no-ops (zero extra DB traffic). */
let seeded = false;

export async function ensureOfficialBarangays(): Promise<void> {
  if (seeded) return;
  try {
    const admin = createAdminClient();

    // 1. insert any missing official rows (existing rows untouched)
    const { error } = await admin
      .from("barangays")
      .upsert(
        OFFICIAL_BARANGAYS.map((b) => ({
          name: b.name,
          description: "Official barangay of Sta. Cruz, Laguna",
          center_lat: b.center_lat,
          center_lng: b.center_lng,
          is_active: true,
        })),
        { onConflict: "name", ignoreDuplicates: true }
      );
    if (error) return; // policy/transient failure — page still renders

    // 2. fill centers only where NULL (admin-tuned values stay)
    const { data: rows } = await admin
      .from("barangays")
      .select("id, name, center_lat")
      .in("name", OFFICIAL_BARANGAYS.map((b) => b.name))
      .is("center_lat", null);
    const centerless = (rows as { id: string; name: string }[] | null) ?? [];
    await Promise.all(
      centerless.map((row) => {
        const b = OFFICIAL_BARANGAYS.find((x) => x.name === row.name);
        return b
          ? admin
              .from("barangays")
              .update({ center_lat: b.center_lat, center_lng: b.center_lng })
              .eq("id", row.id)
          : Promise.resolve();
      })
    );

    // 3. deactivate leftover [BARANGAY N] placeholders so they stop showing
    await admin
      .from("barangays")
      .update({ is_active: false })
      .like("name", "[BARANGAY %");

    seeded = true;
  } catch {
    // never let seeding break the page
  }
}
