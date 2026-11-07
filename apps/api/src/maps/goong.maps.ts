import type { LatLng, Place, PlaceSuggestion, Route, RouteRequest } from "@cage/shared";
import { z } from "zod";
import { GOONG, PROVIDER_TIMEOUT_MS } from "../constants";
import type { Fetch, MapsProvider } from "../types";

/** What we read from Goong's answers; everything else is ignored. */
const AutoComplete = z.object({
  predictions: z
    .array(
      z.object({
        place_id: z.string(),
        description: z.string(),
        structured_formatting: z.object({ main_text: z.string(), secondary_text: z.string().optional() }).optional(),
      }),
    )
    .default([]),
});

const Detail = z.object({
  result: z
    .object({
      place_id: z.string(),
      name: z.string().optional(),
      formatted_address: z.string(),
      geometry: z.object({ location: z.object({ lat: z.number(), lng: z.number() }) }),
    })
    .optional(),
});

const Direction = z.object({
  routes: z
    .array(
      z.object({
        legs: z.array(z.object({ distance: z.object({ value: z.number() }), duration: z.object({ value: z.number() }) })),
        overview_polyline: z.object({ points: z.string() }),
      }),
    )
    .default([]),
});

const point = (p: LatLng) => `${p.lat},${p.lng}`;

/**
 * Goong (goong.io): Vietnamese place search and motorbike routes (ADR 0004).
 * Each request carries only the key and the query: no headers from the
 * traveller's request, no user id, no IP.
 */
export function goongMaps(apiKey: string, fetch: Fetch): MapsProvider {
  async function get<T extends z.ZodType>(
    path: string,
    params: Record<string, string | undefined>,
    schema: T,
  ): Promise<z.output<T> | "unavailable"> {
    const url = new URL(path, GOONG.apiBase);

    for (const [name, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(name, value);
    url.searchParams.set("api_key", apiKey);

    try {
      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });

      if (!res.ok) return "unavailable";
      const parsed = schema.safeParse(await res.json());

      return parsed.success ? parsed.data : "unavailable";
    } catch {
      return "unavailable";
    }
  }

  return {
    async suggest(query, near): Promise<PlaceSuggestion[] | "unavailable"> {
      const area = near ? { location: point(near), radius: String(GOONG.nearRadiusKm) } : {};

      const body = await get(
        "/Place/AutoComplete",
        { input: query, limit: String(GOONG.suggestLimit), ...area },
        AutoComplete,
      );

      if (body === "unavailable") return body;

      return body.predictions.map((p) => ({
        id: p.place_id,
        name: p.structured_formatting?.main_text ?? p.description,
        address: p.structured_formatting?.secondary_text ?? p.description,
      }));
    },

    async place(id): Promise<Place | null | "unavailable"> {
      const body = await get("/Place/Detail", { place_id: id }, Detail);

      if (body === "unavailable") return body;

      if (!body.result) return null;
      const { result } = body;

      return {
        id: result.place_id,
        name: result.name ?? result.formatted_address,
        address: result.formatted_address,
        ...result.geometry.location,
      };
    },

    async route(request: RouteRequest): Promise<Route | null | "unavailable"> {
      const body = await get(
        "/Direction",
        { origin: point(request.from), destination: point(request.to), vehicle: GOONG.vehicle[request.mode] },
        Direction,
      );

      if (body === "unavailable") return body;
      const [first] = body.routes;

      if (!first) return null;

      return {
        distanceM: first.legs.reduce((sum, leg) => sum + leg.distance.value, 0),
        durationS: first.legs.reduce((sum, leg) => sum + leg.duration.value, 0),
        polyline: first.overview_polyline.points,
      };
    },
  };
}
