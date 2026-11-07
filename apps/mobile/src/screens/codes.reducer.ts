import { CODE_LENGTH, differingDigits, isTooSimple } from "@cage/shared";

/**
 * The state of screens 10 and 10b: the safe code, then the duress PIN, each
 * typed twice on the keypad. Pure, so the whole flow is tested without React.
 */

/** `journey_open` only comes from the forgot-code path, which is refused during a journey. */
export type CodesProblem = "too_simple" | "too_close" | "mismatch" | "journey_open" | "error";

export interface CodesState {
  step: "safe" | "duress";
  /** The confirmed safe code, once step is "duress". */
  safe: string;
  /** The first entry, waiting to be typed again. */
  first: string | null;
  /** Digits typed so far. */
  entry: string;
  problem: CodesProblem | null;
  /** Both codes are confirmed and should be saved. */
  submit: { safe: string; duress: string } | null;
}

export type CodesAction =
  | { type: "digit"; digit: string }
  | { type: "delete" }
  | { type: "back" }
  | { type: "saveFailed"; problem: "too_simple" | "too_close" | "journey_open" | "error" };

export const initialCodesState: CodesState = {
  step: "safe",
  safe: "",
  first: null,
  entry: "",
  problem: null,
  submit: null,
};

const fail = (s: CodesState, problem: CodesProblem): CodesState => ({ ...s, first: null, entry: "", problem });

/** A complete four-digit entry: the first time it is checked, the second time it must match. */
function complete(s: CodesState, code: string): CodesState {
  if (s.first === null) {
    if (isTooSimple(code)) return fail(s, "too_simple");

    if (s.step === "duress" && differingDigits(code, s.safe) < 2) return fail(s, "too_close");

    return { ...s, first: code, entry: "", problem: null };
  }

  if (code !== s.first) return fail(s, "mismatch");

  if (s.step === "safe") return { ...initialCodesState, step: "duress", safe: code };

  return { ...s, entry: code, problem: null, submit: { safe: s.safe, duress: code } };
}

export function codesReducer(s: CodesState, a: CodesAction): CodesState {
  switch (a.type) {
    case "digit": {
      if (s.submit || s.entry.length >= CODE_LENGTH) return s;
      const entry = s.entry + a.digit;

      return entry.length === CODE_LENGTH ? complete(s, entry) : { ...s, entry, problem: null };
    }

    case "delete":
      return s.submit ? s : { ...s, entry: s.entry.slice(0, -1) };
    case "back":
      return s.step === "duress" ? initialCodesState : s;
    case "saveFailed":
      // The server disagreed about the safe code: start again from it.
      if (a.problem === "too_simple") return fail(initialCodesState, a.problem);

      return { ...fail(s, a.problem), submit: null };
  }
}
