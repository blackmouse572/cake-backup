import { CIRCLE, type Circle } from "@cage/shared";
import type { AddProblem } from "../services/circle.service";

/**
 * Screens 09 and 05: the circle as the server has it, which sheet is open
 * (09a permission, 09b picker, manual entry) and what went wrong. Pure, so
 * the flow is tested without React.
 */

export type Sheet = "none" | "permission" | "picker" | "manual";

export type CircleProblem = AddProblem | "load" | "denied" | "contacts";

export interface CircleState {
  status: "loading" | "ready" | "failed";
  contacts: Circle;
  sheet: Sheet;
  /** A save is in flight; buttons wait for it. */
  busy: boolean;
  problem: CircleProblem | null;
}

export type CircleAction =
  | { type: "loading" }
  | { type: "loaded"; circle: Circle }
  | { type: "loadFailed" }
  | { type: "open"; sheet: Sheet }
  /** Contacts permission refused or the phone book unreadable: fall back to typing a number. */
  | { type: "noContacts"; problem: "denied" | "contacts" }
  | { type: "saving" }
  | { type: "saved"; circle: Circle }
  | { type: "saveFailed"; problem: AddProblem };

export const initialCircleState: CircleState = {
  status: "loading",
  contacts: [],
  sheet: "none",
  busy: false,
  problem: null,
};

export function circleReducer(s: CircleState, a: CircleAction): CircleState {
  switch (a.type) {
    case "loading":
      return { ...s, status: "loading", problem: null };
    case "loaded":
      return { ...s, status: "ready", contacts: a.circle, problem: null };
    case "loadFailed":
      return { ...s, status: "failed", problem: "load" };
    case "open":
      return { ...s, sheet: a.sheet, problem: null };
    case "noContacts":
      return { ...s, sheet: "manual", problem: a.problem };
    case "saving":
      return { ...s, busy: true, problem: null };
    case "saved":
      // A save closes the sheet it came from.
      return { ...s, busy: false, contacts: a.circle, sheet: "none", problem: null };
    case "saveFailed":
      return { ...s, busy: false, problem: a.problem };
  }
}

/** How many more people the circle can take. */
export const roomLeft = (s: CircleState) => Math.max(0, CIRCLE.max - s.contacts.length);

/** One person is allowed, but the screen nudges for a second (PRD, "Escalation ladder"). */
export const needsNudge = (s: CircleState) => s.status === "ready" && s.contacts.length > 0 && s.contacts.length < CIRCLE.recommended;
