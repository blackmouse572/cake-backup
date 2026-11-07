import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";

/**
 * One structured line per request for Workers Logs. It records the matched
 * route pattern (`/journeys/:id`), never the raw URL, body, headers or IP, so
 * no phone number, location or code reaches the log.
 */
export const requestLog = createMiddleware<AppEnv>(async (c, next) => {
  const started = Date.now();

  await next();

  console.info({
    event: "request",
    method: c.req.method,
    route: c.req.routePath,
    status: c.res.status,
    ms: Date.now() - started,
  });
});

/**
 * Logs an uncaught error for Workers Logs and Issues: its name, message and
 * stack, and the route it came from. Callers keep PII out of error messages.
 */
export function logError(err: Error, route: string) {
  console.error({ event: "error", route, name: err.name, message: err.message, stack: err.stack });
}
