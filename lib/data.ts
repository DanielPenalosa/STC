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

/** Build a signed URL for a photo stored in Supabase Storage. */
export function publicPhotoUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return "";
  return `${base}/storage/v1/object/public/report-photos/${path}`;
}
