import { CODE_LENGTH } from "@cage/shared";

/**
 * Settings (screen 20) and what hangs off it: the language (20b, 20c), the
 * codes (20a), the police switch and signing out with the safe code. Pure, so
 * the flow is tested without React. The safety circle (05) and changing the
 * codes open their own screens, so `App.tsx` handles those.
 */

export type SettingsView = "list" | "language" | "codes" | "signOut";

/** Why the last thing didn't work. The server never says whether a code was the safe code or the duress PIN. */
export type SettingsProblem = "wrong_code" | "too_many_tries" | "error";

export interface SettingsState {
  view: SettingsView;
  policeEnabled: boolean;
  /** The switch has flipped on screen and the server hasn't answered yet. */
  savingPolice: boolean;
  /** Digits typed so far on the sign-out code screen. */
  entry: string;
  /** Set once four digits are typed: the screen sends it and reports back. */
  submit: string | null;
  signedOut: boolean;
  problem: SettingsProblem | null;
}

export type SettingsAction =
  | { type: "open"; view: Exclude<SettingsView, "list"> }
  | { type: "back" }
  | { type: "togglePolice" }
  | { type: "policeSaved" }
  | { type: "policeFailed" }
  | { type: "digit"; digit: string }
  | { type: "delete" }
  | { type: "signOutResult"; result: "ok" | SettingsProblem };

export function initialSettings({ policeEnabled }: { policeEnabled: boolean }): SettingsState {
  return { view: "list", policeEnabled, savingPolice: false, entry: "", submit: null, signedOut: false, problem: null };
}

export function settingsReducer(state: SettingsState, action: SettingsAction): SettingsState {
  switch (action.type) {
    case "open":
      return { ...state, view: action.view, entry: "", submit: null, problem: null };
    case "back":
      return { ...state, view: "list", entry: "", submit: null, problem: null };
    case "togglePolice":
      if (state.savingPolice) return state;

      return { ...state, policeEnabled: !state.policeEnabled, savingPolice: true, problem: null };
    case "policeSaved":
      return { ...state, savingPolice: false };
    case "policeFailed":
      return { ...state, policeEnabled: !state.policeEnabled, savingPolice: false, problem: "error" };
    case "digit": {
      if (state.view !== "signOut" || state.submit !== null || state.entry.length >= CODE_LENGTH) return state;
      const entry = state.entry + action.digit;

      return { ...state, entry, submit: entry.length === CODE_LENGTH ? entry : null, problem: null };
    }

    case "delete":
      return state.submit === null ? { ...state, entry: state.entry.slice(0, -1) } : state;
    case "signOutResult":
      if (action.result === "ok") return { ...state, signedOut: true, submit: null };

      return { ...state, entry: "", submit: null, problem: action.result };
  }
}
