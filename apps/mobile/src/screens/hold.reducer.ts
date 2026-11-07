import { TIMERS } from "@cage/shared";

/**
 * Holding the SOS button (screen 02). The clock comes in with each action, so
 * the whole hold is tested without React or a timer.
 */
export interface HoldState {
  /** When the hold began, or null while nothing is held. */
  startedAt: number | null;
  /** The time of the last tick, to notice when the phone stopped ticking. */
  lastAt: number | null;
  /** From 0 to 1, for the progress bar. */
  progress: number;
  /** The hold has lasted long enough. Stays true until the finger lifts. */
  fired: boolean;
}

export type HoldAction = { type: "press"; at: number } | { type: "tick"; at: number } | { type: "release" };

export const idleHold: HoldState = { startedAt: null, lastAt: null, progress: 0, fired: false };

/**
 * Ticks come every few dozen milliseconds. A longer gap means the app was in
 * the background or the screen locked, and the finger may be long gone, so
 * the hold starts again rather than counting that time.
 */
const HOLD_GAP_MS = 500;

export function holdReducer(state: HoldState, action: HoldAction): HoldState {
  switch (action.type) {
    case "press":
      return { startedAt: action.at, lastAt: action.at, progress: 0, fired: false };
    case "tick": {
      if (state.startedAt === null || state.lastAt === null) return state;

      if (action.at - state.lastAt > HOLD_GAP_MS) return { startedAt: action.at, lastAt: action.at, progress: 0, fired: false };
      const progress = Math.min(1, (action.at - state.startedAt) / TIMERS.sosHoldMs);

      return { ...state, lastAt: action.at, progress, fired: progress >= 1 };
    }

    case "release":
      return idleHold;
  }
}
