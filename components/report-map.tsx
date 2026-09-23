"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
// leaflet.css is loaded via <link> in app/layout.tsx (Turbopack-safe)

export type MapPoint = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  color: string;
};

export default function ReportMap({
  points,
  height = 320,
}: {
  points: MapPoint[];
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (!mapRef.current) {
      const map = L.map(ref.current, { scrollWheelZoom: true }).setView(
        [14.5995, 120.9842], // [CITY/MUNICIPALITY] center — adjust per client
        12
      );
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
    }
    const map = mapRef.current!;
    const layer = layerRef.current!;

    layer.clearLayers();
    const valid = points.filter(
      (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)
    );
    for (const p of valid) {
      const icon = L.divIcon({
        className: "",
        html: `<span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${p.color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></span>`,
        iconSize: [14, 14],
      });
      L.marker([p.lat, p.lng], { icon })
        .bindPopup(
          `<a href="/dashboard/reports/${p.id}" style="font-weight:600">${p.label}</a>`
        )
        .addTo(layer);
    }
    if (valid.length) {
      map.fitBounds(
        valid.map((p) => [p.lat, p.lng] as [number, number]),
        { padding: [30, 30], maxZoom: 15 }
      );
    }
  }, [points]);

  return <div ref={ref} style={{ height, borderRadius: 12 }} />;
}
