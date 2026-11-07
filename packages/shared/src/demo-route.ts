import type { LatLng } from "./journey";

/**
 * The hackathon demo's fake route: the dashboard walks the traveller from
 * where their phone first reported to their destination, so the demo works
 * indoors and on an emulator whose GPS can't move.
 */

const EARTH_RADIUS_M = 6_371_000;

const DEG = Math.PI / 180;

/** How far the traveller strays when the dashboard sends them off route. */
export const OFF_ROUTE_M = 180;

/** Great-circle distance in metres. */
export function metresBetween(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * DEG;
  const dLng = (b.lng - a.lng) * DEG;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * Evenly spaced points from `start` to `end`, turning one corner like a
 * street walk: along the latitude first, then the longitude. The first point
 * is `start` and the last is `end`.
 */
export function walkRoute(start: LatLng, end: LatLng, steps: number): LatLng[] {
  const corner = { lat: end.lat, lng: start.lng };
  const first = metresBetween(start, corner);
  const total = first + metresBetween(corner, end);
  const count = Math.max(1, Math.round(steps));

  return Array.from({ length: count + 1 }, (_, i) => {
    const along = (total * i) / count;

    if (total === 0) return { ...end };

    if (along <= first) return between(start, corner, first === 0 ? 1 : along / first);

    return between(corner, end, (along - first) / (total - first));
  });
}

/** Metres still to walk from point `index` of the route to its end. */
export function metresLeft(route: LatLng[], index: number): number {
  let sum = 0;

  for (let i = Math.max(0, index); i < route.length - 1; i += 1) sum += metresBetween(route[i]!, route[i + 1]!);

  return sum;
}

/** A point `metres` to the side of the route at `index`, for "go off route". */
export function besideRoute(route: LatLng[], index: number, metres = OFF_ROUTE_M): LatLng {
  const here = route[Math.min(Math.max(0, index), route.length - 1)]!;
  const next = route[Math.min(index + 1, route.length - 1)]!;
  const heading = Math.atan2(next.lng - here.lng, next.lat - here.lat);
  const side = heading + Math.PI / 2;
  const dLat = (metres * Math.cos(side)) / (EARTH_RADIUS_M * DEG);
  const dLng = (metres * Math.sin(side)) / (EARTH_RADIUS_M * DEG * Math.cos(here.lat * DEG));

  return { lat: here.lat + dLat, lng: here.lng + dLng };
}

/** Where the walk starts when the phone never reported: this far south-west of the destination. */
export function fallbackStart(end: LatLng, metres = 800): LatLng {
  const d = metres / Math.SQRT2 / (EARTH_RADIUS_M * DEG);

  return { lat: end.lat - d, lng: end.lng - d / Math.cos(end.lat * DEG) };
}

function between(a: LatLng, b: LatLng, f: number): LatLng {
  return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f };
}
