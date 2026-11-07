import { failure } from "@cage/shared";
import { createMiddleware } from "hono/factory";
import type { JourneyTokenEnv } from "../types";

const BEARER = "Bearer ";

/**
 * Reads the journey token from `Authorization: Bearer <token>`. Whether it
 * fits the journey is checked by the journey object; this only refuses
 * requests that carry none.
 */
export const requireJourneyToken = createMiddleware<JourneyTokenEnv>(async (c, next) => {
  const header = c.req.header("authorization") ?? "";
  const token = header.startsWith(BEARER) ? header.slice(BEARER.length).trim() : "";

  if (!token) return c.json(failure("unauthorized"), 401);
  c.set("journeyToken", token);
  await next();
});
