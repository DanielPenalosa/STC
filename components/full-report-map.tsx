"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet.markercluster";

export type FullMapPoint = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  color: string;
  status: string;
};

export type FullMapHandle = {
  fitAll: () => void;
};

export default function FullReportMap({
  points,
  layer,
  cluster,
  onReady,
}: {
  points: FullMapPoint[];
  layer: "street" | "satellite";
  cluster: boolean;
  onReady?: (handle: FullMapHandle) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const clusterLayerRef = useRef<L.MarkerClusterGroup | null>(null);

  /* init once */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, { zoomControl: false, preferCanvas: true });
    L.control.zoom({ position: "bottomright" }).addTo(map);

    mapRef.current = map;
    clusterLayerRef.current = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 45,
      animateAddingMarkers: true,
    });
    markerLayerRef.current = L.layerGroup();
    map.addLayer(clusterLayerRef.current);

    onReady?.({
      fitAll: () => {
        const pts = currentMarkers();
        if (pts.length) {
          map.fitBounds(pts, { padding: [40, 40], maxZoom: 16 });
        }
      },
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function currentMarkers(): [number, number][] {
    const pts: [number, number][] = [];
    (markerLayerRef.current?.getLayers() ?? []).forEach((m) => {
      const ll = (m as L.Marker).getLatLng();
      pts.push([ll.lat, ll.lng]);
    });
    return pts;
  }

  /* tile layer switching */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tileRef.current) map.removeLayer(tileRef.current);
    tileRef.current =
      layer === "satellite"
        ? L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
            attribution: "Tiles © Esri",
            maxZoom: 19,
          })
        : L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "© OpenStreetMap contributors",
            maxZoom: 19,
          });
    tileRef.current.addTo(map);
    tileRef.current.bringToBack();
  }, [layer]);

  /* markers */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    clusterLayerRef.current?.clearLayers();
    markerLayerRef.current?.clearLayers();

    const markers: L.Marker[] = points.map((p) => {
      const icon = L.divIcon({
        className: "",
        html: `<span style="display:inline-block;width:16px;height:16px;border-radius:50%;background:${p.color};border:2.5px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.45);transition:transform .15s ease" onmouseover="this.style.transform='scale(1.35)'" onmouseout="this.style.transform='scale(1)'"></span>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      return L.marker([p.lat, p.lng], { icon, title: p.label }).bindPopup(
        `<a href="/reports/${p.id}" style="font-weight:600;color:#06ABEA">${p.label}</a><br/><span style="font-size:12px;color:#64748b">${p.status.replace(/_/g, " ")}</span>`
      );
    });

    if (cluster && clusterLayerRef.current) {
      clusterLayerRef.current.addLayers(markers);
    } else {
      const plain = markerLayerRef.current;
      if (plain) {
        markers.forEach((m) => plain.addLayer(m));
        plain.addTo(map);
      }
    }

    if (points.length) {
      map.fitBounds(
        points.map((p) => [p.lat, p.lng] as [number, number]),
        { padding: [40, 40], maxZoom: 16 }
      );
    }
  }, [points, cluster]);

  return <div ref={containerRef} className="map-fade h-full w-full" />;
}
