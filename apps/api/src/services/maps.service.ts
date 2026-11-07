import type { LatLng, Place, PlaceSuggestion, Route, RouteRequest } from "@cage/shared";
import { NEAR_DECIMALS } from "../constants";
import type { MapsProvider } from "../types";

const rounded = (value: number) => Number(value.toFixed(NEAR_DECIMALS));

/**
 * Place search and routes for the planning screen (ADR 0004). Nothing here
 * is stored: only the destination the traveller starts a journey with is
 * saved, with the journey.
 */
export function mapsService(provider: MapsProvider) {
  return {
    /** Suggestions while typing. `near` goes to the provider only as the rough area. */
    async suggest(query: string, near: LatLng | undefined): Promise<PlaceSuggestion[] | "unavailable"> {
      const area = near ? { lat: rounded(near.lat), lng: rounded(near.lng) } : undefined;

      return provider.suggest(query, area);
    },

    async place(id: string): Promise<Place | "not_found" | "unavailable"> {
      return (await provider.place(id)) ?? "not_found";
    },

    async route(request: RouteRequest): Promise<Route | "not_found" | "unavailable"> {
      return (await provider.route(request)) ?? "not_found";
    },
  };
}
