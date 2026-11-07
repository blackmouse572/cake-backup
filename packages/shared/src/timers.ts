/**
 * Timer lengths for a journey. The server runs these (see "The server's job"
 * in docs/PRD.md); the app only shows them.
 */
export const TIMERS = {
  /** Wait this long after the expected arrival time before acting on silence. */
  arrivalBufferMs: 20 * 60_000,
  /** An update older than this means the phone has gone quiet. */
  staleUpdateMs: 5 * 60_000,
  /** Seconds the user has to answer an in-app check-in (screen 03). */
  checkInAnswerMs: 60_000,
  /** One missed check-in call is retried after this long before escalating. */
  checkInRetryMs: 2 * 60_000,
  /** If nobody in the circle opens the alert within this time, move up the ladder. */
  circleOpenTimeoutMs: 10 * 60_000,
} as const;

/** Battery at or below this, followed by silence, reads as "phone probably died". */
export const LOW_BATTERY = 0.1;
