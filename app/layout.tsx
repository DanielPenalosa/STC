import type { Metadata, Viewport } from "next";
import "./globals.css";
import { CLIENT_NAME, TAGLINE } from "./brand";

export const metadata: Metadata = {
  title: {
    default: `${TAGLINE} — ${CLIENT_NAME}`,
    template: `%s · ${TAGLINE}`,
  },
  description: `AI-assisted community issue reporting for ${CLIENT_NAME} — ${"[CITY/MUNICIPALITY]"}.`,
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/logo.png", type: "image/png" }],
    apple: [{ url: "/logo.png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: CLIENT_NAME,
  },
};

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
