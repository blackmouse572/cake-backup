import { z } from "zod";
import { LatLng } from "./journey";

/**
 * Place search and routes (ADR 0004). The app and the website ask our API,
 * which asks the maps provider (Goong in Vietnam); they never call it
 * directly.
 */

/** How the traveller goes. Motorbike first: most trips in Vietnam are on one. */
export const RouteMode = z.enum(["motorbike", "car"]);

export type RouteMode = z.infer<typeof RouteMode>;

/** Longest search text we pass on. Addresses are short; this only stops abuse. */
export const PLACE_QUERY_MAX = 200;

/** "21.0285,105.7782" from a query string, as a point. */
const LatLngText = z
  .string()
  .regex(/^-?\d{1,2}(\.\d+)?,-?\d{1,3}(\.\d+)?$/)
  .transform((text) => {
    const [lat, lng] = text.split(",").map(Number);

    return { lat, lng };
  })
  .pipe(LatLng);

/** Query of `GET /places/suggest`: what the traveller typed, and roughly where they are. */
export const PlaceSuggestQuery = z.object({
  q: z.string().trim().min(1).max(PLACE_QUERY_MAX),
  near: LatLngText.optional(),
});

export type PlaceSuggestQuery = z.infer<typeof PlaceSuggestQuery>;

/** One suggestion while typing. `id` is the provider's, passed back to `GET /places/:id`. */
export const PlaceSuggestion = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string(),
});

export type PlaceSuggestion = z.infer<typeof PlaceSuggestion>;

export const PlaceSuggestions = z.array(PlaceSuggestion);

/** A place the traveller picked, with its position. */
export const Place = PlaceSuggestion.extend(LatLng.shape);

export type Place = z.infer<typeof Place>;

/** Body of `POST /routes`. */
export const RouteRequest = z.object({
  from: LatLng,
  to: LatLng,
  mode: RouteMode.default("motorbike"),
});

export type RouteRequest = z.infer<typeof RouteRequest>;

/** The route the provider suggests. `polyline` is Google's encoded polyline (precision 5). */
export const Route = z.object({
  distanceM: z.number().nonnegative(),
  durationS: z.number().nonnegative(),
  polyline: z.string(),
});

export type Route = z.infer<typeof Route>;

const PRECISION = 1e5;

/** Decodes an encoded polyline (precision 5) into points. */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  const next = (): number => {
    let result = 0;
    let shift = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);

    return result & 1 ? ~(result >> 1) : result >> 1;
  };

  while (index < encoded.length) {
    lat += next();
    lng += next();
    points.push({ lat: lat / PRECISION, lng: lng / PRECISION });
  }

  return points;
}

/** Encodes points as a polyline (precision 5). */
export function encodePolyline(points: LatLng[]): string {
  let out = "";
  let lastLat = 0;
  let lastLng = 0;

  const put = (delta: number) => {
    let value = delta < 0 ? ~(delta << 1) : delta << 1;

    while (value >= 0x20) {
      out += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
      value >>= 5;
    }

    out += String.fromCharCode(value + 63);
  };

  for (const point of points) {
    const lat = Math.round(point.lat * PRECISION);
    const lng = Math.round(point.lng * PRECISION);
    put(lat - lastLat);
    put(lng - lastLng);
    lastLat = lat;
    lastLng = lng;
  }

  return out;
}
