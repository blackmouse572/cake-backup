import type { LatLng } from "@cage/shared";
import { color } from "@cage/ui-tokens";
import type { GeoJSONSource, LineLayerSpecification, Map as MapLibreMap, Marker } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { useEffect, useRef, useState } from "react";
import { MAP_STYLE_URL } from "./journey-map";

/** Room around the route when the map frames it. */
const FIT_PADDING = 40;

const MAX_FIT_ZOOM = 16;

type LineId = "case" | "done" | "ahead" | "plan" | "off";

/** The line layers, bottom to top: white casing, walked part, part still to go, the step off the route. */
const LINES: { id: LineId; paint: LineLayerSpecification["paint"] }[] = [
  { id: "case", paint: { "line-color": color.surface, "line-width": 11 } },
  { id: "done", paint: { "line-color": color.blueTint, "line-width": 5 } },
  { id: "ahead", paint: { "line-color": color.blue, "line-width": 5 } },
  { id: "plan", paint: { "line-color": color.borderStrong, "line-width": 3, "line-dasharray": [0, 2.5] } },
  { id: "off", paint: { "line-color": color.danger, "line-width": 5 } },
];

export interface DemoRouteMapProps {
  route: LatLng[];
  /** How far along the route the traveller is. */
  step: number;
  /** Where the traveller stands after leaving the route, if they have. */
  off: LatLng | null;
  /** Red dot once the circle has been alerted or contact is lost. */
  danger: boolean;
}

interface Loaded {
  map: MapLibreMap;
  dot: Marker;
}

function line(points: LatLng[]): Parameters<GeoJSONSource["setData"]>[0] {
  return { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: points.map((p) => [p.lng, p.lat]) } };
}

function marker(className: string, html = ""): HTMLDivElement {
  const div = document.createElement("div");
  div.className = className;
  div.innerHTML = html;

  return div;
}

/**
 * The demo dashboard's fake route on a real map: walked part in pale blue,
 * the rest in route blue, and a red step when the traveller leaves it.
 * MapLibre only runs in the browser; the dashboard renders there anyway.
 */
export function DemoRouteMap({ route, step, off, danger }: DemoRouteMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  // Built once per route; the effect below redraws progress on every step.
  useEffect(() => {
    const start = route[0]!;
    const end = route[route.length - 1]!;

    // Set once the map exists, so a cleanup that runs first (StrictMode, a new route) never builds it.
    let map: MapLibreMap | null = null;
    const stop = new AbortController();

    void import("maplibre-gl").then((maplibre) => {
      const node = container.current;

      if (!node || stop.signal.aborted) return;
      // Bundling moves the worker away from where MapLibre looks for it, so point at the copy Vite serves.
      maplibre.setWorkerUrl(workerUrl);

      const lngs = route.map((p) => p.lng);
      const lats = route.map((p) => p.lat);

      const created = new maplibre.Map({
        container: node,
        style: MAP_STYLE_URL,
        bounds: [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        fitBoundsOptions: { padding: FIT_PADDING, maxZoom: MAX_FIT_ZOOM },
        attributionControl: { compact: true },
        // The dashboard scrolls; the wheel should move the page, not zoom the map.
        scrollZoom: false,
      });

      new maplibre.Marker({ element: marker("rm-start"), anchor: "center" }).setLngLat([start.lng, start.lat]).addTo(created);
      new maplibre.Marker({ element: marker("map-flag rm-flag", '<span class="cd-icon">flag</span>') })
        .setLngLat([end.lng, end.lat])
        .addTo(created);
      const dot = new maplibre.Marker({ element: marker("rm-dot"), anchor: "center" }).setLngLat([start.lng, start.lat]).addTo(created);

      created.on("load", () => {
        for (const { id, paint } of LINES) {
          created.addSource(id, { type: "geojson", data: line([]) });
          created.addLayer({ id, type: "line", source: id, layout: { "line-cap": "round", "line-join": "round" }, paint });
        }

        setLoaded({ map: created, dot });
      });
      map = created;
    });

    return () => {
      stop.abort();
      setLoaded(null);
      map?.remove();
    };
  }, [route]);

  useEffect(() => {
    if (!loaded) return;
    const { map, dot } = loaded;
    const here = route[step]!;
    const at = off ?? here;
    const ahead = route.slice(step);

    const data: Record<LineId, LatLng[]> = {
      case: route,
      done: route.slice(0, step + 1),
      ahead: off ? [] : ahead,
      plan: off ? ahead : [],
      off: off ? [here, off] : [],
    };

    for (const { id } of LINES) map.getSource<GeoJSONSource>(id)?.setData(line(data[id]));
    dot.setLngLat([at.lng, at.lat]);
    dot.getElement().classList.toggle("rm-dot--bad", danger || off !== null);

    // Keeps the traveller in view if they step off the edge.
    if (!map.getBounds().contains([at.lng, at.lat])) map.easeTo({ center: [at.lng, at.lat] });
  }, [loaded, route, step, off, danger]);

  return <div ref={container} className="rmap" aria-hidden="true" />;
}
