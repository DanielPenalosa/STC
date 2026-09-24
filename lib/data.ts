import { createClient as createSb } from "@/lib/supabase/server";
import { CITY_NAME, CLIENT_NAME, TAGLINE } from "@/app/brand";
import type {
  Barangay,
  Category,
  Department,
  Profile,
} from "@/lib/types";

/** Current authenticated user's profile (or null). */
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createSb();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("id", auth.user.id)
    .maybeSingle();
  return (data as unknown as Profile) ?? null;
}

export async function requireProfile(): Promise<Profile> {
  const p = await getProfile();
  if (!p) throw new Error("Not signed in");
  return p;
}

export async function getCategories(): Promise<Category[]> {
  const supabase = await createSb();
  const { data } = await supabase
    .from("categories")
    .select("*")
    .order("name");
  return (data as unknown as Category[]) ?? [];
}

export async function getBarangays(): Promise<Barangay[]> {
  const supabase = await createSb();

  // self-seed the official 26 Sta. Cruz barangays so every dropdown
  // defaults to the full list — even before the SQL migration is run
  const { ensureOfficialBarangays } = await import("./barangays-official");
  await ensureOfficialBarangays();

  const { data } = await supabase
    .from("barangays")
    .select("*")
    .order("name");
  return (data as unknown as Barangay[]) ?? [];
}

export async function getDepartments(): Promise<Department[]> {
  const supabase = await createSb();
  const { data } = await supabase
    .from("departments")
    .select("*")
    .order("name");
  return (data as unknown as Department[]) ?? [];
}

export type AppMeta = {
  clientName: string;
  cityName: string;
  tagline: string;
};

export async function getAppMeta(): Promise<AppMeta> {
  const supabase = await createSb();
  const { data } = await supabase.from("app_settings").select("*");
  const map = new Map(
    ((data as unknown as { key: string; value: string }[]) ?? []).map(
      (r) => [r.key, r.value]
    )
  );
  return {
    clientName: map.get("client_name") ?? CLIENT_NAME,
    cityName: map.get("city_name") ?? CITY_NAME,
    tagline: map.get("tagline") ?? TAGLINE,
  };
}

/**
 * URL for a report photo, served through the authenticated /api/photo proxy.
 * Works regardless of bucket policies/public flags on the database.
 * (Implementation lives in lib/photo.ts — client-safe.)
 */
export { publicPhotoUrl, idPhotoUrl } from "@/lib/photo";
