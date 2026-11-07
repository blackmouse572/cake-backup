import type { LatLng } from "@cage/shared";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { useEffect, useRef, useState } from "react";

/**
 * Free OpenStreetMap vector tiles, no key. A stand-in until the map
 * provider is chosen (#15, ADR 0004).
 */
const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

/** Room around the two points; the bottom also clears the sheet that covers the map. */
const FIT_PADDING = { top: 96, side: 56, belowSheet: 48 };

const DEFAULT_ZOOM = 15;

const MAX_FIT_ZOOM = 16;

export interface JourneyMapProps {
  destination: LatLng & { name: string };
  /** The traveller's last reported position, if any. */
  position: LatLng | null;
  /** Red instead of route blue once the circle has been alerted. */
  alerting: boolean;
  /** Label beside the traveller's dot, e.g. "Lan · trực tiếp". */
  positionLabel: string;
}

interface Loaded {
  map: MapLibreMap;
  dot: Marker;
}

function el(className: string, html: string): HTMLDivElement {
  const div = document.createElement("div");
  div.className = className;
  div.innerHTML = html;

  return div;
}

/**
 * The circle's map (screens 22 to 24b): the destination flag and the
 * traveller's dot. MapLibre only runs in the browser, so it loads after the
 * page renders on the server.
 */
export function JourneyMap({ destination, position, alerting, positionLabel }: JourneyMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const framed = useRef(false);
  const { lat: destLat, lng: destLng } = destination;
  const lat = position?.lat ?? null;
  const lng = position?.lng ?? null;

  // Built once per destination; the effect below moves and colours the dot.
  useEffect(() => {
    const ready = import("maplibre-gl").then((maplibre) => {
      const node = container.current;

      if (!node) return null;
      // Bundling moves the worker away from where MapLibre looks for it, so point at the copy Vite serves.
      maplibre.setWorkerUrl(workerUrl);

      const map = new maplibre.Map({
        container: node,
        style: STYLE_URL,
        center: [destLng, destLat],
        zoom: DEFAULT_ZOOM,
        attributionControl: { compact: true },
      });

      new maplibre.Marker({ element: el("map-flag", '<span class="cd-icon">flag</span>') })
        .setLngLat([destLng, destLat])
        .addTo(map);

      const dot = new maplibre.Marker({ element: el("map-dot", ""), anchor: "center" });
      setLoaded({ map, dot });

      return map;
    });

    return () => {
      setLoaded(null);
      void ready.then((map) => map?.remove());
    };
  }, [destLat, destLng]);

  useEffect(() => {
    if (!loaded) return;
    const element = loaded.dot.getElement();
    element.classList.toggle("map-dot--alert", alerting);
    element.dataset.label = positionLabel;

    if (lat === null || lng === null) return;
    loaded.dot.setLngLat([lng, lat]).addTo(loaded.map);

    // Frames both points above the sheet on the first position, and again if the dot leaves the view.
    if (framed.current && loaded.map.getBounds().contains([lng, lat])) return;
    framed.current = true;
    const sheet = document.querySelector<HTMLElement>(".sheet")?.offsetHeight ?? 0;

    loaded.map.fitBounds(
      [
        [Math.min(lng, destLng), Math.min(lat, destLat)],
        [Math.max(lng, destLng), Math.max(lat, destLat)],
      ],
      {
        padding: { top: FIT_PADDING.top, left: FIT_PADDING.side, right: FIT_PADDING.side, bottom: sheet + FIT_PADDING.belowSheet },
        maxZoom: MAX_FIT_ZOOM,
        duration: 0,
      },
    );
  }, [loaded, lat, lng, destLat, destLng, alerting, positionLabel]);

  return <div ref={container} className="map" aria-hidden="true" />;
}
