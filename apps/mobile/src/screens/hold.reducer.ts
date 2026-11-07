import { TIMERS } from "@cage/shared";

/**
 * Holding the SOS button (screen 02). The clock comes in with each action, so
 * the whole hold is tested without React or a timer.
 */
export interface HoldState {
  /** When the finger went down, or null while nothing is held. */
  startedAt: number | null;
  /** From 0 to 1, for the progress bar. */
  progress: number;
  /** The hold has lasted long enough. Stays true until the finger lifts. */
  fired: boolean;
}

export type HoldAction = { type: "press"; at: number } | { type: "tick"; at: number } | { type: "release" };

export const idleHold: HoldState = { startedAt: null, progress: 0, fired: false };

export function holdReducer(state: HoldState, action: HoldAction): HoldState {
  switch (action.type) {
    case "press":
      return { startedAt: action.at, progress: 0, fired: false };
    case "tick": {
      if (state.startedAt === null) return state;
      const progress = Math.min(1, (action.at - state.startedAt) / TIMERS.sosHoldMs);

      return { ...state, progress, fired: progress >= 1 };
    }

    case "release":
      return idleHold;
  }
}
