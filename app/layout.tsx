import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getBranding } from "@/lib/branding";

/**
 * Titles/description follow the admin-configured branding (Admin → Settings →
 * app_settings), falling back to app/brand.tsx when the DB is unreachable.
 */
export async function generateMetadata(): Promise<Metadata> {
  const b = await getBranding();
  return {
    title: {
      default: `${b.clientName} — ${b.tagline}`,
      template: `%s · ${b.clientName}`,
    },
    description: `${b.clientName} — AI-powered community issue reporting for ${b.cityName}. Snap a photo, AI classifies it and routes it to the right department or barangay automatically.`,
    manifest: "/manifest.json",
    icons: {
      icon: [{ url: "/logo.png", type: "image/png" }],
      apple: [{ url: "/logo.png" }],
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: b.clientName,
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#2333A0", // Santa Cruz royal blue
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // respect iOS notch / home indicator in the installed PWA
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Leaflet styles (Turbopack chokes on importing CSS from node_modules) */}
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
