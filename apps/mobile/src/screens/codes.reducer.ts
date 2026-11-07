import { CODE_LENGTH, differingDigits, isTooSimple } from "@cage/shared";

/**
 * The state of screens 10 and 10b: the safe code, then the duress PIN, each
 * typed twice on the keypad. Changing the codes (20a) first asks for the
 * current safe code, once; the server is the only one that can judge it.
 * Pure, so the whole flow is tested without React.
 */

/**
 * `journey_open` only comes from the forgot-code path, which is refused during a journey.
 * `wrong_code` and `too_many_tries` only come from changing the codes.
 */
export type CodesProblem =
  | "too_simple"
  | "too_close"
  | "mismatch"
  | "journey_open"
  | "wrong_code"
  | "too_many_tries"
  | "error";

export interface CodesState {
  /** "current" is the safe code being replaced, asked for only when changing the codes. */
  step: "current" | "safe" | "duress";
  /** The current safe code, once typed (changing the codes only). */
  current: string | null;
  /** The confirmed safe code, once step is "duress". */
  safe: string;
  /** The first entry, waiting to be typed again. */
  first: string | null;
  /** Digits typed so far. */
  entry: string;
  problem: CodesProblem | null;
  /** Both codes are confirmed and should be saved. `current` is there only when changing the codes. */
  submit: { safe: string; duress: string; current?: string } | null;
}

export type CodesAction =
  | { type: "digit"; digit: string }
  | { type: "delete" }
  | { type: "back" }
  | { type: "saveFailed"; problem: "too_simple" | "too_close" | "journey_open" | "wrong_code" | "too_many_tries" | "error" };

export const initialCodesState: CodesState = {
  step: "safe",
  current: null,
  safe: "",
  first: null,
  entry: "",
  problem: null,
  submit: null,
};

/** Where changing the codes starts: with the safe code they have now. */
export const changeCodesState: CodesState = { ...initialCodesState, step: "current" };

const fail = (s: CodesState, problem: CodesProblem): CodesState => ({ ...s, first: null, entry: "", problem });

/** A complete four-digit entry: the first time it is checked, the second time it must match. */
function complete(s: CodesState, code: string): CodesState {
  if (s.step === "current") return { ...s, step: "safe", current: code, entry: "", problem: null };

  if (s.first === null) {
    if (isTooSimple(code)) return fail(s, "too_simple");

    if (s.step === "duress" && differingDigits(code, s.safe) < 2) return fail(s, "too_close");

    return { ...s, first: code, entry: "", problem: null };
  }

  if (code !== s.first) return fail(s, "mismatch");

  if (s.step === "safe") return { ...initialCodesState, current: s.current, step: "duress", safe: code };

  const codes = { safe: s.safe, duress: code };

  return { ...s, entry: code, problem: null, submit: s.current === null ? codes : { ...codes, current: s.current } };
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
      return s.step === "duress" ? { ...initialCodesState, current: s.current } : s;
    case "saveFailed":
      // The server didn't take the current safe code: ask for it again.
      if (a.problem === "wrong_code" || a.problem === "too_many_tries") return { ...changeCodesState, problem: a.problem };

      // The server disagreed about the safe code: start again from it.
      if (a.problem === "too_simple") return fail({ ...initialCodesState, current: s.current }, a.problem);

      return { ...fail(s, a.problem), submit: null };
  }
}
