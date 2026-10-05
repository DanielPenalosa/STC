import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CLIENT_NAME,
  CITY_NAME,
  TAGLINE,
  CONTACT_EMAIL,
  CONTACT_PHONE,
} from "@/app/brand";

/**
 * System-wide branding + contact settings, read from `app_settings`.
 *
 * Reads with the service-role client on purpose:
 *  - app_settings is readable by every authenticated user but NOT by
 *    anonymous visitors (RLS `settings_read`), while branding must render on
 *    the public landing page, login, install page and <title> metadata;
 *  - the table holds only non-secret values (client name, city, tagline,
 *    contact info, feature flags) — secrets live in env vars, never here.
 *
 * Every read is wrapped: a missing service-role key or a Supabase outage
 * degrades to the app/brand.tsx defaults instead of breaking the page.
 */

export type Branding = {
  clientName: string;
  cityName: string;
  tagline: string;
  contactEmail: string;
  contactPhone: string;
  /** Facebook auto-post of resolved reports (kill switch in Admin → Settings) */
  autoPost: boolean;
};

export const BRANDING_DEFAULTS: Branding = {
  clientName: CLIENT_NAME,
  cityName: CITY_NAME,
  tagline: TAGLINE,
  contactEmail: CONTACT_EMAIL,
  contactPhone: CONTACT_PHONE,
  autoPost: true,
};

/** Pure merge of app_settings rows over the defaults (empty values ignored). */
export function mergeBranding(
  rows: { key: string; value: string | null }[] | null | undefined
): Branding {
  const map = new Map(
    (rows ?? []).map((r) => [r.key, (r.value ?? "").trim()])
  );
  const get = (key: string, fallback: string) => map.get(key) || fallback;
  return {
    clientName: get("client_name", BRANDING_DEFAULTS.clientName),
    cityName: get("city_name", BRANDING_DEFAULTS.cityName),
    tagline: get("tagline", BRANDING_DEFAULTS.tagline),
    contactEmail: get("contact_email", BRANDING_DEFAULTS.contactEmail),
    contactPhone: get("contact_phone", BRANDING_DEFAULTS.contactPhone),
    autoPost: (map.get("facebook_autopost") || "on") !== "off",
  };
}

/** Memoized per request (React cache) — layout + generateMetadata share one read. */
export const getBranding = cache(async (): Promise<Branding> => {
  try {
    const { data } = await createAdminClient()
      .from("app_settings")
      .select("key, value");
    return mergeBranding(data as { key: string; value: string | null }[] | null);
  } catch {
    return BRANDING_DEFAULTS;
  }
});
