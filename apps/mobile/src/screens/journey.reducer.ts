import { checkInCall, CODE_LENGTH, type JourneyView } from "@cage/shared";

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

/** Where an SOS stands: not pressed, on its way, or not delivered (the traveller can hold again). */
export type SosState = "idle" | "sending" | "failed";

/**
 * The check-in call on screen (12 ringing, 13 on the call). Answering opens
 * the code entry as well; only the code ends the check-in.
 */
export type CallScreen = { phase: "ringing"; call: 1 | 2 } | { phase: "talking"; call: 1 | 2; startedAt: number };

/** A call the traveller declined or hung up, so it doesn't ring again on screen. */
export interface HungUp {
  askedAt: number;
  call: 1 | 2;
}

export type JourneyFlow =
  | { name: "plan"; busy: boolean; problem: PlanProblem | null }
  | {
      name: "travelling";
      journey: JourneyView;
      token: string;
      code: CodeEntry | null;
      sos: SosState;
      call: CallScreen | null;
      hungUp: HungUp | null;
    }
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
  | { type: "sosSending" }
  | { type: "sosFailed" }
  /** The server answered. The phone may still show a quiet screen (after a duress PIN), so it stops waiting here, not on "alerted". */
  | { type: "sosSent" }
  | { type: "newTrip" }
  /** Every second during a check-in: call 2 rings on screen if the app is open when it comes. */
  | { type: "clock"; now: number }
  /** The traveller opened a check-in call from the lock screen or the notification shade. */
  | { type: "ring"; call: 1 | 2 }
  | { type: "answerCall"; now: number }
  /** Declined, or hung up without the code: the server counts it as no answer. */
  | { type: "hangUp" };

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
      return { name: "travelling", journey: action.journey, token: action.token, code: null, sos: "idle", call: null, hungUp: null };
    case "newTrip":
      return initialJourneyFlow;
    default:
      if (state.name !== "travelling") return state;
  }

  switch (action.type) {
    case "gone":
      return { name: "ended" };
    case "view": {
      if (action.journey.status === "ended") return { name: "ended" };

      // Once the alert shows, the SOS is no longer pending.
      const next = { ...state, journey: action.journey, sos: action.journey.status === "alerted" ? "idle" : state.sos } as const;

      // A call only lasts as long as the check-in, and takes its code entry with it.
      if (action.journey.status !== "check_in" && state.call) return { ...next, call: null, code: null };

      return next;
    }

    case "clock": {
      const checkIn = state.journey.checkIn;

      if (state.journey.status !== "check_in" || !checkIn || state.call || state.code) return state;
      const now = checkInCall(checkIn.askedAt, action.now);
      const hungUp = state.hungUp?.askedAt === checkIn.askedAt && state.hungUp.call === now.call;

      // Call 1 rings with screen 03 already open, so the open app shows 03 instead; call 2 rings here too.
      return now.call === 2 && now.ringing && !hungUp ? { ...state, call: { phase: "ringing", call: 2 } } : state;
    }

    case "ring":
      if (state.journey.status !== "check_in" && state.journey.status !== "active") return state;

      return { ...state, call: { phase: "ringing", call: action.call }, code: null };
    case "answerCall":
      if (state.call?.phase !== "ringing") return state;

      return {
        ...state,
        call: { phase: "talking", call: state.call.call, startedAt: action.now },
        code: { purpose: "answer", entry: "", problem: null, submit: null },
      };
    case "hangUp": {
      const askedAt = state.journey.checkIn?.askedAt;
      const call = state.call?.call;

      return {
        ...state,
        call: null,
        code: null,
        hungUp: askedAt !== undefined && call !== undefined ? { askedAt, call } : state.hungUp,
      };
    }

    case "sosSending":
      return state.sos === "sending" ? state : { ...state, sos: "sending" };
    case "sosSent":
      return { ...state, sos: "idle" };
    case "sosFailed":
      // A poll may have shown the alert already; then there is nothing to retry.
      return { ...state, sos: state.journey.status === "alerted" ? "idle" : "failed" };
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

      // Locked out on a call: the server has counted it as no answer, so the call ends.
      if (action.result === "too_many_tries" && state.call) return { ...state, call: null, code: null };

      if (action.result !== "ok") return { ...state, code: { ...code, entry: "", submit: null, problem: action.result } };

      if (code.purpose === "end") return { name: "ended" };

      return { ...state, code: null, call: null, journey: { ...state.journey, status: "active", checkIn: null } };
    }
  }
}
