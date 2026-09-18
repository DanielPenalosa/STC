"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

/**
 * Interactive coordinate picker used in Admin → Barangays.
 * - Tap the map (or drag the pin) to move the marker
 * - "Use my current location" jumps the pin to the device's GPS fix
 * - Reports changes up via onPick(lat, lng)
 *
 * The Leaflet map itself is loaded client-side only (`ssr: false` is only
 * allowed inside Client Components — this wrapper is one).
 */
const MapPickerMap = dynamic(() => import("./map-picker-inner"), { ssr: false });

export default function MapPicker({
  lat,
  lng,
  onPick,
  height = 280,
}: {
  lat: number | null;
  lng: number | null;
  onPick: (lat: number, lng: number) => void;
  height?: number;
}) {
  const [gpsBusy, setGpsBusy] = useState(false);

  /** Bridges the inner map's CustomEvent to the onPick callback. */
  const onMapPick = useCallback(
    (e: Event) => {
      const { lat: la, lng: ln } = (e as CustomEvent<{ lat: number; lng: number }>).detail;
      onPick(la, ln);
    },
    [onPick]
  );

  useEffect(() => {
    window.addEventListener("map-pick", onMapPick);
    return () => window.removeEventListener("map-pick", onMapPick);
  }, [onMapPick]);

  function useGps() {
    if (!navigator.geolocation) {
      alert("GPS is not available on this device.");
      return;
    }
    setGpsBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsBusy(false);
        onPick(
          Number(pos.coords.latitude.toFixed(6)),
          Number(pos.coords.longitude.toFixed(6))
        );
      },
      (err) => {
        setGpsBusy(false);
        alert(
          err.code === err.PERMISSION_DENIED
            ? "Location access was denied. Allow it in your browser settings, or tap the map to place the pin manually."
            : "Couldn't get a GPS fix. Move somewhere with a clear view of the sky and try again, or tap the map."
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }

  return (
    <div className="space-y-2">
      <MapPickerMap lat={lat} lng={lng} height={height} />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={useGps}
          disabled={gpsBusy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            <circle cx="12" cy="12" r="8" />
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
            <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
          </svg>
          {gpsBusy ? "Locating…" : "Use my current location"}
        </button>
        <p className="text-[11px] text-slate-400">
          Tap the map to place the pin — the red dot is the barangay center used
          for GPS auto-detection.
        </p>
      </div>
    </div>
  );
}
