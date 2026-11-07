/**
 * The fake call (issue #21): the traveller picks who "calls" and when, and
 * the phone rings a little later so they have a reason to leave. It all
 * happens on the phone. Nothing here, or in fake-call.tsx, talks to the
 * server, and the circle never hears about it. The clock comes in with each
 * action, so the whole flow is tested without React or a timer.
 */

/** Callers offered as one tap; their names come from `fakeCall.callers.*`. */
export const CALLER_PRESETS = ["mom", "dad", "sister", "boss"] as const;

export type CallerPreset = (typeof CALLER_PRESETS)[number];

/** How long until the phone rings. Long enough to put the phone away. */
export const RING_DELAYS_MS = [5_000, 30_000, 60_000] as const;

export type RingDelay = (typeof RING_DELAYS_MS)[number];

/** A typed name stays on one line of the call screen. */
export const CALLER_NAME_MAX = 30;

/** An unanswered fake call stops ringing after this long, like a missed call. */
export const RING_FOR_MS = 45_000;

export type FakeCall =
  | { name: "off" }
  | { name: "picking"; preset: CallerPreset; typed: string; delayMs: RingDelay }
  | { name: "waiting"; callerName: string; ringAt: number }
  | { name: "ringing"; callerName: string; since: number }
  | { name: "inCall"; callerName: string; startedAt: number };

export type FakeCallAction =
  | { type: "open" }
  | { type: "pickPreset"; preset: CallerPreset }
  | { type: "type"; text: string }
  | { type: "pickDelay"; delayMs: RingDelay }
  /** `callerName` is the name on screen: the typed one, or the preset in the traveller's language. */
  | { type: "schedule"; callerName: string; at: number }
  | { type: "tick"; at: number }
  | { type: "answer"; at: number }
  /** Close the picker, cancel the wait, decline the ring or hang up: back to the trip either way. */
  | { type: "stop" };

export const fakeCallOff: FakeCall = { name: "off" };

const DEFAULT_PICK: FakeCall = { name: "picking", preset: "mom", typed: "", delayMs: 30_000 };

/** The name the call shows: the typed one if there is one, else the preset's. */
export function callerName(state: Extract<FakeCall, { name: "picking" }>, presetName: (preset: CallerPreset) => string): string {
  const typed = state.typed.trim();

  return typed === "" ? presetName(state.preset) : typed;
}

export function fakeCallReducer(state: FakeCall, action: FakeCallAction): FakeCall {
  switch (action.type) {
    case "open":
      return state.name === "off" ? DEFAULT_PICK : state;
    case "stop":
      return fakeCallOff;
    case "pickPreset":
      return state.name === "picking" ? { ...state, preset: action.preset, typed: "" } : state;
    case "type":
      return state.name === "picking" ? { ...state, typed: action.text.slice(0, CALLER_NAME_MAX) } : state;
    case "pickDelay":
      return state.name === "picking" ? { ...state, delayMs: action.delayMs } : state;
    case "schedule": {
      const name = action.callerName.trim().slice(0, CALLER_NAME_MAX);

      if (state.name !== "picking" || name === "") return state;

      return { name: "waiting", callerName: name, ringAt: action.at + state.delayMs };
    }

    case "tick":
      if (state.name === "waiting" && action.at >= state.ringAt) return { name: "ringing", callerName: state.callerName, since: action.at };

      if (state.name === "ringing" && action.at - state.since >= RING_FOR_MS) return fakeCallOff;

      return state;
    case "answer":
      return state.name === "ringing" ? { name: "inCall", callerName: state.callerName, startedAt: action.at } : state;
  }
}

/** Whole seconds left before the ring, for the line on screen 02. */
export function secondsUntilRing(state: FakeCall, now: number): number | null {
  if (state.name !== "waiting") return null;

  return Math.max(0, Math.ceil((state.ringAt - now) / 1_000));
}
