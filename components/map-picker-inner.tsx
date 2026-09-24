"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";

/**
 * The Leaflet half of MapPicker. Kept in its own module so the parent can
 * `dynamic(..., { ssr: false })` it — Leaflet requires `window`.
 *
 * Taps and pin-drags dispatch a window CustomEvent("map-pick", {lat, lng}),
 * which the parent wrapper listens for and forwards to `onPick`.
 */
export default function MapPickerMap({
  lat,
  lng,
  height,
}: {
  lat: number | null;
  lng: number | null;
  height: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  function emit(lat: number, lng: number) {
    window.dispatchEvent(new CustomEvent("map-pick", { detail: { lat, lng } }));
  }

  useEffect(() => {
    if (!ref.current) return;
    if (!mapRef.current) {
      const map = L.map(ref.current, { scrollWheelZoom: true }).setView(
        [14.18284, 121.50758], // Santa Cruz, Laguna center
        13
      );
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);
      map.on("click", (e: L.LeafletMouseEvent) => {
        emit(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
      });
      mapRef.current = map;
    }
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (lat == null || lng == null) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    } else {
      const icon = L.divIcon({
        className: "",
        html: `<span style="display:inline-block;width:16px;height:16px;border-radius:50%;background:#DF1B2C;border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.45)"></span>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      markerRef.current = L.marker([lat, lng], { icon, draggable: true }).addTo(map);
      markerRef.current.on("dragend", () => {
        const p = markerRef.current!.getLatLng();
        emit(Number(p.lat.toFixed(6)), Number(p.lng.toFixed(6)));
      });
      map.setView([lat, lng], Math.max(map.getZoom(), 14));
    }
  }, [lat, lng]);

  return (
    <div
      ref={ref}
      style={{ height, borderRadius: 12 }}
      className="border border-slate-200"
    />
  );
}
