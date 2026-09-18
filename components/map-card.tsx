"use client";

import dynamic from "next/dynamic";
import type { MapPoint } from "@/components/report-map";

// Leaflet touches `window`, so the map is loaded client-side only.
// Next 16: `ssr: false` is only allowed inside Client Components —
// hence this wrapper (server pages import <MapCard /> instead).
const ReportMap = dynamic(() => import("@/components/report-map"), {
  ssr: false,
});

export default function MapCard({
  points,
  height = 320,
}: {
  points: MapPoint[];
  height?: number;
}) {
  return <ReportMap points={points} height={height} />;
}
