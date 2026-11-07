import { failure, PlaceSuggestQuery, success } from "@cage/shared";
import { Hono } from "hono";
import { mapsProviderFor } from "../maps-provider";
import { mapsRateLimit } from "../middleware/maps-rate-limit";
import { requireSession } from "../middleware/require-session";
import { validate } from "../middleware/validate";
import { mapsService } from "../services/maps.service";
import type { AuthedEnv } from "../types";

/** Provider place ids are short; this only stops junk reaching the provider. */
const PLACE_ID_MAX = 300;

/**
 * `/places`: destination search for screen 01, through the maps provider
 * (ADR 0004). The app never calls the provider itself.
 */
export const placesController = new Hono<AuthedEnv>()
  .use(requireSession, mapsRateLimit)
  .get("/suggest", validate("query", PlaceSuggestQuery), async (c) => {
    const { q, near } = c.req.valid("query");
    const result = await mapsService(mapsProviderFor(c.env)).suggest(q, near);

    if (result === "unavailable") return c.json(failure("maps_unavailable"), 502);

    return c.json(success(result), 200);
  })
  .get("/:id", async (c) => {
    const id = c.req.param("id");

    if (id.length > PLACE_ID_MAX) return c.json(failure("invalid_request"), 400);
    const result = await mapsService(mapsProviderFor(c.env)).place(id);

    switch (result) {
      case "unavailable":
        return c.json(failure("maps_unavailable"), 502);
      case "not_found":
        return c.json(failure(result), 404);
      default:
        return c.json(success(result), 200);
    }
  });
