import type { LatLng, Place, PlaceSuggestion, Route, RouteMode } from "@cage/shared";

/** Shortest search worth sending: one or two letters match half the country. */
export const MIN_QUERY = 2;

/** Arrival choices when no route could be found, in minutes. */
export const ARRIVAL_CHOICES = [15, 30, 45, 60] as const;

const MINUTE_MS = 60_000;

const SECOND_MS = 1_000;

/**
 * Screen 01 before the trip starts: search, pick a place, see the route.
 *
 * - `search` is about the suggestions for `query`.
 * - `route` is about the route from `here` to `picked` by `mode`. When it
 *   fails the traveller picks a travel time instead (`minutes`), so a trip
 *   can always start.
 */
export interface PlanState {
  here: LatLng | null;
  query: string;
  search: "idle" | "searching" | "done" | "error";
  suggestions: PlaceSuggestion[];
  picked: Place | null;
  mode: RouteMode;
  route: { status: "idle" | "loading" | "error" } | { status: "ready"; route: Route };
  minutes: number;
}

export type PlanAction =
  | { type: "here"; here: LatLng | null }
  | { type: "typed"; query: string }
  /** Suggestions came back for `query`; dropped if the traveller has typed on since. */
  | { type: "suggestions"; query: string; result: PlaceSuggestion[] | "error" }
  /** A suggestion was tapped and its position fetched. */
  | { type: "picked"; result: Place | "error" }
  | { type: "clear" }
  | { type: "mode"; mode: RouteMode }
  /** A route came back for this destination and mode; dropped if either changed since. */
  | { type: "route"; to: string; mode: RouteMode; result: Route | "error" }
  | { type: "minutes"; minutes: number };

export const initialPlan: PlanState = {
  here: null,
  query: "",
  search: "idle",
  suggestions: [],
  picked: null,
  mode: "motorbike",
  route: { status: "idle" },
  minutes: ARRIVAL_CHOICES[1],
};

/** A route is worth asking for once we know both ends. */
const routeFor = (here: LatLng | null, picked: Place | null): PlanState["route"] =>
  here && picked ? { status: "loading" } : { status: "idle" };

export function planReducer(state: PlanState, action: PlanAction): PlanState {
  switch (action.type) {
    case "here":
      return { ...state, here: action.here, route: state.route.status === "ready" ? state.route : routeFor(action.here, state.picked) };
    case "typed": {
      const searching = action.query.trim().length >= MIN_QUERY;

      return {
        ...state,
        query: action.query,
        search: searching ? "searching" : "idle",
        suggestions: searching ? state.suggestions : [],
        picked: null,
        route: { status: "idle" },
      };
    }

    case "suggestions":
      if (action.query !== state.query || state.picked) return state;

      return action.result === "error"
        ? { ...state, search: "error", suggestions: [] }
        : { ...state, search: "done", suggestions: action.result };
    case "picked":
      if (action.result === "error") return { ...state, search: "error" };

      return {
        ...state,
        picked: action.result,
        query: action.result.name,
        search: "idle",
        suggestions: [],
        route: routeFor(state.here, action.result),
      };
    case "clear":
      return { ...initialPlan, here: state.here, mode: state.mode, minutes: state.minutes };
    case "mode":
      return action.mode === state.mode ? state : { ...state, mode: action.mode, route: routeFor(state.here, state.picked) };
    case "route":
      if (action.to !== state.picked?.id || action.mode !== state.mode) return state;

      return { ...state, route: action.result === "error" ? { status: "error" } : { status: "ready", route: action.result } };
    case "minutes":
      return { ...state, minutes: action.minutes };
  }
}

/**
 * How long the trip should take, in milliseconds: the route's time once
 * there is one, the picked travel time when there can't be one, and null
 * while still waiting.
 */
export function travelMs(state: PlanState): number | null {
  if (!state.picked) return null;

  if (state.route.status === "ready") return state.route.route.durationS * SECOND_MS;

  if (state.route.status === "error" || !state.here) return state.minutes * MINUTE_MS;

  return null;
}
