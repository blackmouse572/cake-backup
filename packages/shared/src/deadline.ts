import { LOW_BATTERY, TIMERS } from "./timers";
import type { JourneyStatus, LocationUpdate } from "./journey";

/** When the server checks on a journey if nothing else happens first. */
export function arrivalDeadline(expectedArrivalAt: number): number {
  return expectedArrivalAt + TIMERS.arrivalBufferMs;
}

export interface DeadlineInput {
  now: number;
  status: JourneyStatus;
  lostContactEnabled: boolean;
  /** When the server last heard from the phone. */
  lastHeardAt: number;
}

/**
 * What the journey becomes when its arrival deadline passes and the user has
 * not ended it.
 *
 * - Still sending updates: the user is late, so Cage checks in.
 * - Silent: lost contact, which only ever reaches the circle. If the user
 *   turned lost contact off for this trip, Cage still checks in, because a
 *   check-in can be answered and costs nothing if it is a false alarm.
 */
export function atArrivalDeadline(input: DeadlineInput): JourneyStatus {
  if (input.status !== "active") return input.status;
  const silent = input.now - input.lastHeardAt >= TIMERS.staleUpdateMs;

  if (silent && input.lostContactEnabled) return "lost_contact";

  return "check_in";
}

/** True when the last thing the phone told us was a nearly empty battery. */
export function likelyBatteryDied(last: LocationUpdate | null): boolean {
  return last !== null && last.battery <= LOW_BATTERY;
}

/**
 * When an unanswered check-in becomes an alert: the answer window plus one
 * retry (PRD, "Check-in call").
 */
export function checkInDeadline(askedAt: number): number {
  return askedAt + TIMERS.checkInAnswerMs + TIMERS.checkInRetryMs;
}

/**
 * Where an alert stands on the ladder for the circle's page. It moves to the
 * hotline once nobody in the circle opened their link within
 * `TIMERS.circleOpenTimeoutMs` of the alert.
 */
export function alertStep(alert: { raisedAt: number; openedAt: number | null }, now: number): "circle" | "hotline" {
  if (alert.openedAt !== null) return "circle";

  return now - alert.raisedAt >= TIMERS.circleOpenTimeoutMs ? "hotline" : "circle";
}
