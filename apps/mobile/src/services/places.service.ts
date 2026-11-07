import type { LatLng } from "@cage/shared";
import * as Battery from "expo-battery";
import * as Location from "expo-location";

/**
 * Where the traveller is and where they're going, from the phone's own
 * location and geocoder (no map provider yet, #15).
 */

/** Asks for location while the app is open. Background location comes with #17. */
export async function allowLocation(): Promise<boolean> {
  const { granted } = await Location.requestForegroundPermissionsAsync();

  return granted;
}

/** The first match for a typed address, or null. */
export async function findPlace(address: string): Promise<LatLng | null> {
  try {
    const [first] = await Location.geocodeAsync(address);

    return first ? { lat: first.latitude, lng: first.longitude } : null;
  } catch {
    return null;
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
