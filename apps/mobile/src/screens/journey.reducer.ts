import { CODE_LENGTH, type JourneyView } from "@cage/shared";

/** Why a code wasn't taken. */
export type CodeProblem = "wrong_code" | "too_many_tries" | "error";

/** Why a journey didn't start. */
export type PlanProblem = "need_location" | "error";

/** The code screen (26 to answer a check-in, 26b to end the trip). */
export interface CodeEntry {
  purpose: "answer" | "end";
  entry: string;
  problem: CodeProblem | null;
  /** Set once four digits are typed: the screen sends it and reports back. */
  submit: string | null;
}

export type JourneyFlow =
  | { name: "plan"; busy: boolean; problem: PlanProblem | null }
  | { name: "travelling"; journey: JourneyView; token: string; code: CodeEntry | null }
  | { name: "ended" };

export type JourneyAction =
  | { type: "start" }
  | { type: "startFailed"; problem: PlanProblem }
  | { type: "started"; journey: JourneyView; token: string }
  | { type: "view"; journey: JourneyView }
  /** The server no longer knows the journey (ended elsewhere, or deleted). */
  | { type: "gone" }
  | { type: "openCode"; purpose: CodeEntry["purpose"] }
  | { type: "closeCode" }
  | { type: "digit"; digit: string }
  | { type: "delete" }
  | { type: "codeResult"; result: "ok" | CodeProblem }
  | { type: "newTrip" };

export const initialJourneyFlow: JourneyFlow = { name: "plan", busy: false, problem: null };

/**
 * The traveller's side of a journey (screens 01, 02, 03, 04, 26, 26b). The
 * phone never learns whether a code was the safe code or the duress PIN:
 * both come back "ok", and the screen shows what the safe code would.
 */
export function journeyReducer(state: JourneyFlow, action: JourneyAction): JourneyFlow {
  switch (action.type) {
    case "start":
      return { name: "plan", busy: true, problem: null };
    case "startFailed":
      return { name: "plan", busy: false, problem: action.problem };
    case "started":
      return { name: "travelling", journey: action.journey, token: action.token, code: null };
    case "newTrip":
      return initialJourneyFlow;
    default:
      if (state.name !== "travelling") return state;
  }

  switch (action.type) {
    case "gone":
      return { name: "ended" };
    case "view":
      return action.journey.status === "ended" ? { name: "ended" } : { ...state, journey: action.journey };
    case "openCode":
      return { ...state, code: { purpose: action.purpose, entry: "", problem: null, submit: null } };
    case "closeCode":
      return { ...state, code: null };
    case "digit": {
      const code = state.code;

      if (!code || code.submit !== null || code.entry.length >= CODE_LENGTH) return state;
      const entry = code.entry + action.digit;

      return { ...state, code: { ...code, entry, problem: null, submit: entry.length === CODE_LENGTH ? entry : null } };
    }

    case "delete":
      return state.code && state.code.submit === null
        ? { ...state, code: { ...state.code, entry: state.code.entry.slice(0, -1) } }
        : state;
    case "codeResult": {
      const code = state.code;

      if (!code) return state;

      if (action.result !== "ok") return { ...state, code: { ...code, entry: "", submit: null, problem: action.result } };

      if (code.purpose === "end") return { name: "ended" };

      return { ...state, code: null, journey: { ...state.journey, status: "active" } };
    }
  }
}
