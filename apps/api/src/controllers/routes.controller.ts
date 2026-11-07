import { failure, RouteRequest, success } from "@cage/shared";
import { Hono } from "hono";
import { mapsProviderFor } from "../maps-provider";
import { mapsRateLimit } from "../middleware/maps-rate-limit";
import { requireSession } from "../middleware/require-session";
import { validate } from "../middleware/validate";
import { mapsService } from "../services/maps.service";
import type { AuthedEnv } from "../types";

/** `POST /routes`: the suggested route and travel time for screen 01 (ADR 0004). */
export const routesController = new Hono<AuthedEnv>()
  .use(requireSession, mapsRateLimit)
  .post("/", validate("json", RouteRequest), async (c) => {
    const result = await mapsService(mapsProviderFor(c.env)).route(c.req.valid("json"));

    switch (result) {
      case "unavailable":
        return c.json(failure("maps_unavailable"), 502);
      case "not_found":
        return c.json(failure(result), 404);
      default:
        return c.json(success(result), 200);
    }
  });
