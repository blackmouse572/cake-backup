import { z } from "zod";
import type { Bindings } from "./bindings";
import { fixedMaps } from "./maps/fixed.maps";
import { goongMaps } from "./maps/goong.maps";
import type { Fetch, MapsProvider } from "./types";

/** `MAPS_PROVIDER`: "goong" on deployed servers, "fixed" for `wrangler dev` and tests. */
export const MapsProviderName = z.enum(["goong", "fixed"]);

/**
 * The provider `MAPS_PROVIDER` names. Throws on a missing key, so a bad
 * deploy fails on the first search instead of finding nothing.
 */
export function mapsProviderFor(env: Bindings, fetch: Fetch = globalThis.fetch): MapsProvider {
  const name = MapsProviderName.safeParse(env.MAPS_PROVIDER);

  if (!name.success) throw new Error(`MAPS_PROVIDER must be one of ${MapsProviderName.options.join(", ")}`);

  switch (name.data) {
    case "fixed":
      return fixedMaps;
    case "goong": {
      const key = z.string().trim().min(1).safeParse(env.GOONG_API_KEY);

      if (!key.success) throw new Error("MAPS_PROVIDER goong needs GOONG_API_KEY");

      return goongMaps(key.data, fetch);
    }
  }
}
