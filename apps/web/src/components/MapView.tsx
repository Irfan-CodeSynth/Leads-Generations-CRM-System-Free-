"use client";

import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { LeadRow } from "@/lib/types";

export default function MapView({ leads, skipped = 0 }: { leads: LeadRow[]; skipped?: number }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    let disposed = false;
    let map: any;

    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;

      const points = leads.filter(
        (l): l is LeadRow & { lat: number; lng: number } =>
          typeof l.lat === "number" && typeof l.lng === "number",
      );

      const center: [number, number] =
        points.length > 0
          ? [
              points.reduce((s, p) => s + p.lng, 0) / points.length,
              points.reduce((s, p) => s + p.lat, 0) / points.length,
            ]
          : [0, 20];

      map = new maplibregl.Map({
        container: containerRef.current as HTMLElement,
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution: "&copy; OpenStreetMap contributors",
            },
          },
          layers: [{ id: "osm", type: "raster", source: "osm" }],
        },
        center,
        zoom: points.length > 0 ? 11 : 1,
      });
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-left");
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

      const popup = new maplibregl.Popup({ closeButton: false, offset: 12, maxWidth: "280px" });
      const markerColor = "#6366f1";

      for (const p of points) {
        const marker = new maplibregl.Marker({ color: markerColor }).setLngLat([p.lng, p.lat]).addTo(map);
        const rating = p.rating == null ? "" : `${p.rating.toFixed(1)} stars`;
        const show = () =>
          popup.setLngLat([p.lng, p.lat]).setHTML(popupHtml(p.name, p.phone, rating, p.mapsUrl)).addTo(map);
        marker.getElement().addEventListener("mouseenter", show);
        marker.getElement().addEventListener("click", show);
        marker.getElement().addEventListener("mouseleave", () => popup.remove());
      }

      if (!disposed) mapRef.current = map;
      else map.remove();
    })();

    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [leads]);

  const hasPoints = leads.some((l) => typeof l.lat === "number" && typeof l.lng === "number");

  return (
    <div className="relative h-[420px] w-full overflow-hidden rounded-2xl border border-line shadow-card">
      <div ref={containerRef} className="h-full w-full" />
      {!hasPoints && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-surface/75 px-6 text-center text-sm text-muted backdrop-blur-sm">
          {skipped > 0 && leads.length === 0
            ? `All ${skipped} places this search found were already captured by an earlier run.`
            : "No coordinates yet — the worker is still running"}
        </div>
      )}
    </div>
  );
}

function popupHtml(name: string, phone: string | null, rating: string, mapsUrl: string | null) {
  const safeName = escapeHtml(name);
  return `
    <div style="font:13px/1.45 system-ui;padding:2px 4px">
      <div style="font-weight:600">${safeName}</div>
      ${phone ? `<div style="opacity:.75">${escapeHtml(phone)}</div>` : ""}
      ${rating ? `<div style="opacity:.75">${escapeHtml(rating)}</div>` : ""}
      ${mapsUrl ? `<a href="${escapeAttr(mapsUrl)}" target="_blank" rel="noopener" class="map-popup-link">Open in Maps</a>` : ""}
    </div>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}
function escapeAttr(s: string) {
  return s.replace(/"/g, "&quot;");
}
