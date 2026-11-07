import { failure, success } from "@cage/shared";
import { Hono } from "hono";
import { createAuth } from "./auth";
import { SESSION_ENDING_ROUTES } from "./constants";
import { circleController } from "./controllers/circle.controller";
import { demoController } from "./controllers/demo.controller";
import { journeysController } from "./controllers/journeys.controller";
import { linksController } from "./controllers/links.controller";
import { meController } from "./controllers/me.controller";
import { logError, requestLog } from "./middleware/request-log";
import type { AppEnv } from "./types";

export const app = new Hono<AppEnv>()
  .use(requestLog)
  .get("/health", (c) => c.json(success({ ok: true })))
  // Registered before Better Auth's routes so a session alone can't sign out: `POST /me/sign-out` needs the safe code.
  .on("POST", SESSION_ENDING_ROUTES, (c) => c.json(failure("not_found"), 404))
  // Sign-in: Better Auth's phone-number routes (ADR 0002).
  .on(["GET", "POST"], "/auth/*", (c) => createAuth(c.env).handler(c.req.raw))
  .route("/me", meController)
  .route("/circle", circleController)
  .route("/journeys", journeysController)
  // The safety circle's links: no session, the link is the key (#18).
  .route("/links", linksController)
  // The hackathon demo; 404 unless DEMO_MODE is "on".
  .route("/demo", demoController)
  .notFound((c) => c.json(failure("not_found"), 404))
  .onError((err, c) => {
    logError(err, c.req.routePath);

    return c.json(failure("internal"), 500);
  });

export type AppType = typeof app;
