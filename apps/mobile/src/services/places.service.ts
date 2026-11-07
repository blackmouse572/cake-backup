import {
  ApiData,
  Place,
  PlaceSuggestions,
  Route,
  type LatLng,
  type PlaceSuggestion,
  type RouteMode,
} from "@cage/shared";
import * as Battery from "expo-battery";
import * as Location from "expo-location";
import { apiFetch } from "./api";

/**
 * Where the traveller is and where they're going. Place search and routes
 * come from our API, which asks the maps provider (ADR 0004); the phone
 * never calls the provider itself.
 */

/** Asks for location while the app is open. Background location comes with #17. */
export async function allowLocation(): Promise<boolean> {
  const { granted } = await Location.requestForegroundPermissionsAsync();

  return granted;
}

/** Where the phone is now, or null without permission or a fix. */
export async function currentPosition(): Promise<LatLng | null> {
  try {
    const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });

    return { lat: coords.latitude, lng: coords.longitude };
  } catch {
    return null;
  }
}

/** Places matching what the traveller typed, near where they are. */
export async function suggestPlaces(query: string, near: LatLng | null): Promise<PlaceSuggestion[] | "error"> {
  const params = new URLSearchParams({ q: query });

  if (near) params.set("near", `${near.lat},${near.lng}`);

  try {
    const res = await apiFetch(`/places/suggest?${params.toString()}`);

    return res.ok ? ApiData(PlaceSuggestions).parse(await res.json()).data : "error";
  } catch {
    return "error";
  }
}

/** The picked suggestion with its position. */
export async function placeDetails(id: string): Promise<Place | "error"> {
  try {
    const res = await apiFetch(`/places/${encodeURIComponent(id)}`);

    return res.ok ? ApiData(Place).parse(await res.json()).data : "error";
  } catch {
    return "error";
  }
}

/** The suggested route and travel time from here to the destination. */
export async function planRoute(from: LatLng, to: LatLng, mode: RouteMode): Promise<Route | "error"> {
  try {
    const res = await apiFetch("/routes", { method: "POST", body: JSON.stringify({ from, to, mode }) });

    return res.ok ? ApiData(Route).parse(await res.json()).data : "error";
  } catch {
    return "error";
  }
}

/** One reading as the API takes it: position plus battery level (0 to 1). */
export interface Reading extends LatLng {
  accuracyM?: number;
  battery: number;
  recordedAt: number;
}

/**
 * Calls back with a reading every `intervalMs` (or after moving
 * `distanceM`). Returns the function that stops it.
 */
export async function watchReadings(
  intervalMs: number,
  distanceM: number,
  onReading: (reading: Reading) => void,
): Promise<() => void> {
  const subscription = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.High, timeInterval: intervalMs, distanceInterval: distanceM },
    (location) => {
      void Battery.getBatteryLevelAsync().then((level) =>
        onReading({
          lat: location.coords.latitude,
          lng: location.coords.longitude,
          accuracyM: location.coords.accuracy ?? undefined,
          // -1 means unknown (simulators); report it as full rather than as a dying phone.
          battery: level < 0 ? 1 : level,
          recordedAt: location.timestamp,
        }),
      );
    },
  );

  return () => subscription.remove();
}
