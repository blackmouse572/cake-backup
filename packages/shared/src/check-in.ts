import { z } from "zod";
import type { LatLng } from "./journey";
import { TIMERS } from "./timers";

/**
 * Why Cage asks "are you safe?" (screen 03). Only the chip and the caption
 * change with the reason (canvas, "Notes — Check-in triggers and codes").
 */
export const CheckInReason = z.enum([
  /** Further than `ROUTE.offRouteM` from the planned route for `TIMERS.offRouteForMs`. */
  "off_route",
  /** Within `ROUTE.stillRadiusM` of one spot for `TIMERS.stoppedTooLongMs`, away from the destination. */
  "stopped",
  /** Still travelling past the arrival time plus its buffer. */
  "late",
]);

export type CheckInReason = z.infer<typeof CheckInReason>;

/** Distances for the route rules, in metres. */
export const ROUTE = {
  /** Further than this from the route counts as off it: past GPS error and a parallel street. */
  offRouteM: 300,
  /** A reading less accurate than this can't say whether the traveller left the route, so it is skipped. */
  worstAccuracyM: 150,
  /** Moving less than this is standing still. */
  stillRadiusM: 75,
  /** Stopping this close to the destination is arriving, not stopping. */
  arrivedM: 200,
} as const;

/** What the server remembers between updates to run the route rules. */
export interface RouteWatch {
  /** When the traveller was first seen off the route without coming back, or null. */
  offRouteSince: number | null;
  /** Where the traveller has been standing, and since when. */
  still: (LatLng & { since: number }) | null;
}

/** What one reading did: the watch to keep, and why to check in, if anything. */
export interface RouteCheck {
  watch: RouteWatch;
  reason: CheckInReason | null;
}

/** Which check-in call it is, and whether the phone should be ringing now. */
export interface CallState {
  call: 1 | 2;
  ringing: boolean;
}

export const freshWatch: RouteWatch = { offRouteSince: null, still: null };

export interface Reading extends LatLng {
  at: number;
  accuracyM?: number;
}

const EARTH_M = 6_371_000;

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres. */
export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Shortest distance in metres from a point to a route drawn as straight
 * segments. Flat-earth maths around the point, which is exact enough over
 * the few hundred metres that matter here.
 */
export function distanceToRouteM(point: LatLng, route: LatLng[]): number {
  if (route.length === 0) return Number.POSITIVE_INFINITY;

  const metresPerLng = EARTH_M * rad(1) * Math.cos(rad(point.lat));
  const metresPerLat = EARTH_M * rad(1);
  const xy = (p: LatLng) => ({ x: (p.lng - point.lng) * metresPerLng, y: (p.lat - point.lat) * metresPerLat });
  let best = Number.POSITIVE_INFINITY;

  for (let i = 0; i < route.length; i += 1) {
    const a = xy(route[i]!);
    const b = xy(route[Math.min(i + 1, route.length - 1)]!);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length2 = dx * dx + dy * dy;
    // Where along the segment the point falls, clamped to its ends.
    const along = length2 === 0 ? 0 : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / length2));
    best = Math.min(best, Math.hypot(a.x + along * dx, a.y + along * dy));
  }

  return best;
}

/**
 * Runs the route rules on one reading. Returns what to remember for the next
 * reading and, when something looks wrong, why Cage should check in.
 *
 * - Off route: further than `ROUTE.offRouteM` from the route on every reading
 *   for `TIMERS.offRouteForMs`, so one bad GPS fix never asks. Without a
 *   route (none was planned, or the traveller already said they're fine
 *   after leaving it) this rule is off.
 * - Stopped: within `ROUTE.stillRadiusM` of one spot for
 *   `TIMERS.stoppedTooLongMs`, unless that spot is the destination.
 */
export function watchRoute(
  watch: RouteWatch,
  reading: Reading,
  route: LatLng[] | null,
  destination: LatLng,
): RouteCheck {
  const still =
    watch.still && distanceM(watch.still, reading) <= ROUTE.stillRadiusM
      ? watch.still
      : { lat: reading.lat, lng: reading.lng, since: reading.at };

  const blurry = (reading.accuracyM ?? 0) > ROUTE.worstAccuracyM;
  let offRouteSince = watch.offRouteSince;

  if (!route || route.length === 0) offRouteSince = null;
  else if (!blurry) {
    const off = distanceToRouteM(reading, route) > ROUTE.offRouteM;
    offRouteSince = off ? (offRouteSince ?? reading.at) : null;
  }

  const next = { offRouteSince, still };

  // A blurry reading carries the clock on but can't be the evidence that ends it.
  if (!blurry && offRouteSince !== null && reading.at - offRouteSince >= TIMERS.offRouteForMs) return { watch: next, reason: "off_route" };

  const arrived = distanceM(reading, destination) <= ROUTE.arrivedM;

  if (!arrived && reading.at - still.since >= TIMERS.stoppedTooLongMs) return { watch: next, reason: "stopped" };

  return { watch: next, reason: null };
}

/**
 * Where a check-in stands, from when it was asked. The server rings the
 * phone twice (PRD, "Check-in call"): call 1 when it asks, call 2
 * `TIMERS.checkInRetryMs` later. Each rings for `TIMERS.checkInAnswerMs`;
 * after call 2 stops ringing, `checkInDeadline` raises the alert.
 */
export function checkInCall(askedAt: number, now: number): CallState {
  const call = now - askedAt >= TIMERS.checkInRetryMs ? 2 : 1;
  const ringsFrom = call === 1 ? askedAt : askedAt + TIMERS.checkInRetryMs;

  return { call, ringing: now >= ringsFrom && now - ringsFrom < TIMERS.checkInAnswerMs };
}

/** When the server rings the phone for this check-in, call 1 then call 2. */
export function checkInCallTimes(askedAt: number): [number, number] {
  return [askedAt, askedAt + TIMERS.checkInRetryMs];
}
