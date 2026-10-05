import { getBranding } from "@/lib/branding";

/**
 * PWA manifest generated from the admin-configured branding
 * (Admin → Settings → app_settings). Replaces the old static
 * public/manifest.json so an installed app picks up a rebrand
 * without a rebuild — force-dynamic so it is never baked at build time.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const b = await getBranding();
  const manifest = {
    name: `${b.clientName} — ${b.tagline}`,
    short_name: b.clientName,
    description: `Report community issues in ${b.cityName} — snap a photo, AI classifies it and routes it to the right department or barangay automatically. Track it to resolution.`,
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F9F9F9",
    theme_color: "#2333A0",
    icons: [
      {
        src: "/logo.png",
        sizes: "447x447",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/logo.png",
        sizes: "447x447",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
  return Response.json(manifest, {
    headers: { "content-type": "application/manifest+json" },
  });
}
