import { failure } from "@cage/shared";
import { createMiddleware } from "hono/factory";
import type { AuthedEnv } from "../types";

/**
 * Limits each traveller's searches and routes (`MAPS_RATE_LIMIT` in
 * wrangler.jsonc), since every one is a paid call to the maps provider.
 * Runs after `requireSession` and counts by traveller, not by IP.
 */
export const mapsRateLimit = createMiddleware<AuthedEnv>(async (c, next) => {
  const { success } = await c.env.MAPS_RATE_LIMIT.limit({ key: c.var.userId });

  if (!success) return c.json(failure("rate_limited"), 429);
  await next();
});
